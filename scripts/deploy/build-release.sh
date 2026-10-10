#!/usr/bin/env bash
# Package an existing local image. Builds and remote deployments are separate steps.
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
Usage: bash scripts/deploy/build-release.sh --image IMAGE --output DIRECTORY [--commit SHA]

Package an already-built local Docker image and the public shared-VPS templates.
IMAGE must exist locally; this script never builds, pulls, loads, or runs images.
DIRECTORY must not exist and must be outside the repository. Its parent must exist.
SHA must contain exactly 40 hexadecimal characters; the default is Git HEAD.

Prerequisites: Bash, Git, Docker, Python 3, gzip, and GNU coreutils.
Docker access is restricted to the local Unix daemon at /var/run/docker.sock.
Only allowlisted public templates are copied; supply an image built without secrets.
Commit metadata is a caller assertion, not proof that the image came from that SHA.
Verify the image's build provenance and reviewed source before packaging it.
HELP
}

die() {
  printf 'Release packaging failed: %s\n' "$*" >&2
  exit 1
}

image_ref=''
output_arg=''
commit=''
commit_supplied=false
while (($#)); do
  case "$1" in
    --image | --output | --commit)
      (($# >= 2)) || die "Missing value for $1."
      [[ -n "$2" && "$2" != --* ]] || die "Missing value for $1."
      case "$1" in
        --image)
          [[ -z "$image_ref" ]] || die 'Specify --image only once.'
          image_ref="$2"
          ;;
        --output)
          [[ -z "$output_arg" ]] || die 'Specify --output only once.'
          output_arg="$2"
          ;;
        --commit)
          [[ "$commit_supplied" == false ]] || die 'Specify --commit only once.'
          commit="$2"
          commit_supplied=true
          ;;
      esac
      shift 2
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "Unknown argument: $1." ;;
  esac
done
[[ -n "$image_ref" && -n "$output_arg" ]] || { usage >&2; exit 1; }
[[ "$image_ref" != -* && "$image_ref" != *$'\n'* && "$image_ref" != *$'\r'* ]] || die 'Invalid image reference.'

for required_command in git docker python3 gzip sha256sum mktemp cp chmod mv rm; do
  command -v "$required_command" >/dev/null 2>&1 || die "Required command unavailable: $required_command."
done

script_dir=$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(CDPATH='' cd -- "$script_dir/../.." && pwd -P)
git_root=$(git -C "$repo_root" rev-parse --show-toplevel 2>/dev/null) || die 'The script must reside in the repository scripts/deploy directory.'
[[ "$git_root" == "$repo_root" ]] || die 'The script must reside in the repository scripts/deploy directory.'

if [[ "$commit_supplied" == false ]]; then
  commit=$(git -C "$repo_root" rev-parse --verify HEAD 2>/dev/null) || die 'Git HEAD has no commit. Supply an explicit --commit SHA after creating a release commit.'
fi
[[ "$commit" =~ ^[0-9a-fA-F]{40}$ ]] || die 'The commit must contain exactly 40 hexadecimal characters.'
commit=${commit,,}

# Resolve paths before writing anything; reject symlinks in the public inputs.
output_dir=$(python3 - "$repo_root" "$output_arg" <<'PY'
import os
import sys
from pathlib import Path

repo = Path(sys.argv[1]).resolve(strict=True)
raw = sys.argv[2]
try:
    if "\n" in raw or "\r" in raw:
        raise ValueError("Output paths cannot contain line breaks.")
    if os.path.lexists(raw):
        raise ValueError("The output path already exists.")
    supplied = Path(raw).absolute()
    parent = supplied.parent.resolve(strict=True)
    if not parent.is_dir():
        raise ValueError("The output parent must be an existing directory.")
    output = parent / supplied.name
    if output == repo or repo in output.parents:
        raise ValueError("The output must be outside the repository.")
    if os.path.lexists(output):
        raise ValueError("The resolved output path already exists.")
    for relative in (
        "deploy/shared/compose.yaml",
        "deploy/shared/init-db.sh",
        "scripts/deploy/deploy-release.sh",
        "deploy/shared/.env.example",
    ):
        source = repo / relative
        if source.is_symlink() or not source.is_file():
            raise ValueError(f"Required public input is missing or is a symlink: {relative}")
        if source.resolve(strict=True) != source:
            raise ValueError(f"Public input path contains a symlink: {relative}")
    print(output)
except (OSError, ValueError) as error:
    print(f"Release packaging failed: {error}", file=sys.stderr)
    sys.exit(1)
PY
) || exit 1

local_docker() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}

image_metadata=$(local_docker image inspect --format '{{.Id}} {{.Architecture}} {{.Os}}' "$image_ref") || die 'Cannot inspect the local image. Build it before packaging.'
IFS=' ' read -r image_id architecture image_os extra <<< "$image_metadata"
[[ "$image_id" =~ ^sha256:[0-9a-f]{64}$ && -z "$extra" && "$image_metadata" != *$'\n'* ]] || die 'Docker returned invalid image metadata.'
[[ "$image_os" == linux && ( "$architecture" == amd64 || "$architecture" == arm64 ) ]] || die 'Only Linux amd64 and Linux arm64 images are supported.'

staging_dir=''
cleanup() {
  if [[ -n "$staging_dir" && -d "$staging_dir" ]]; then
    chmod u+rwx -- "$staging_dir" || true
    rm -rf -- "$staging_dir"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP
staging_dir=$(mktemp -d -- "$(dirname -- "$output_dir")/.amamihe-release.XXXXXXXX") || die 'Cannot create the staging directory.'

# The fixed allowlist excludes private env files, workspace data, and TLS material.
cp -- "$repo_root/deploy/shared/compose.yaml" "$staging_dir/compose.yaml"
cp -- "$repo_root/deploy/shared/init-db.sh" "$staging_dir/init-db.sh"
cp -- "$repo_root/scripts/deploy/deploy-release.sh" "$staging_dir/deploy-release.sh"
cp -- "$repo_root/deploy/shared/.env.example" "$staging_dir/deployment.env.example"

# Save the immutable ID, not a tag that could change between inspect and save.
if ! local_docker image save "$image_id" | gzip -n > "$staging_dir/image.tar.gz"; then
  die 'Cannot archive the local image.'
fi
archive_checksum=$(cd -- "$staging_dir" && sha256sum -- image.tar.gz)
archive_checksum=${archive_checksum%% *}
[[ "$archive_checksum" =~ ^[0-9a-f]{64}$ ]] || die 'Cannot determine the image archive checksum.'

python3 - "$staging_dir/manifest.json" "$commit" "$image_id" "$archive_checksum" "$architecture" "$image_os" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

release = Path(sys.argv[1]).parent
files = {}
for name in ("compose.yaml", "init-db.sh", "deploy-release.sh", "deployment.env.example", "image.tar.gz"):
    digest = hashlib.sha256()
    with (release / name).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    files[name] = digest.hexdigest()
if files["image.tar.gz"] != sys.argv[4]:
    raise SystemExit("Release packaging failed: The image archive changed while packaging.")

manifest = {
    "formatVersion": 2,
    "commit": sys.argv[2],
    "imageId": sys.argv[3],
    "imageArchiveSha256": sys.argv[4],
    "architecture": sys.argv[5],
    "os": sys.argv[6],
    "schemaVersion": 1,
    "files": files,
}
with open(sys.argv[1], "x", encoding="utf-8") as output:
    json.dump(manifest, output, indent=2, sort_keys=True)
    output.write("\n")
PY

(
  cd -- "$staging_dir"
  sha256sum -- manifest.json image.tar.gz compose.yaml init-db.sh deploy-release.sh deployment.env.example > SHA256SUMS
)
manifest_checksum=$(cd -- "$staging_dir" && sha256sum -- manifest.json)
manifest_checksum=${manifest_checksum%% *}

chmod 0400 -- "$staging_dir/manifest.json" "$staging_dir/image.tar.gz" "$staging_dir/compose.yaml" "$staging_dir/deployment.env.example" "$staging_dir/SHA256SUMS"
chmod 0444 -- "$staging_dir/init-db.sh"
chmod 0500 -- "$staging_dir/deploy-release.sh"
chmod 0700 -- "$staging_dir"

# GNU mv refuses replacement and publishes the completed directory in one rename.
mv --no-clobber --no-target-directory -- "$staging_dir" "$output_dir" || die 'Cannot publish the completed release.'
[[ ! -d "$staging_dir" ]] || die 'The output path was created concurrently; it was not replaced.'
staging_dir=''

printf 'Release directory: %s\nCommit: %s\nImage ID: %s\nManifest SHA256: %s\n' "$output_dir" "$commit" "$image_id" "$manifest_checksum"
