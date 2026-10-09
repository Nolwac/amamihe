#!/usr/bin/env bash
# Run on the VPS, using a read-only GitHub credential held only on that host.
set -Eeuo pipefail
umask 077
export GH_PROMPT_DISABLED=1
unset GH_DEBUG

fail() { printf 'Amamihe polling failed: %s\n' "$*" >&2; exit 1; }
[[ $# == 1 ]] || fail 'Usage: pull-deploy.sh /absolute/installation-directory'
base=$1
[[ $base =~ ^/[a-zA-Z0-9/._-]+$ && $base != / ]] || fail 'Invalid installation directory.'
for dependency in gh python3 flock sha256sum mktemp; do
  command -v "$dependency" >/dev/null || fail "Required command unavailable: $dependency"
done
[[ -d $base/shared && -d $base/releases && -f $base/bin/deploy-release.sh ]] || fail 'Bootstrap the installation first.'
[[ -f $base/shared/deployment.env ]] || fail 'Private deployment configuration missing.'
exec 9>"$base/shared/poll.lock"
flock -n 9 || exit 0

# The fixed workflow, repository, branch and event exclude PR/untrusted artifacts.
repo=Nolwac/amamihe
run=$(gh api "repos/$repo/actions/workflows/checks.yml/runs?branch=main&event=push&status=success&per_page=1" \
  --jq '.workflow_runs[0] | [.id, .head_sha, .head_repository.full_name] | @tsv')
IFS=$'\t' read -r run_id commit source_repo <<< "$run"
[[ $run_id =~ ^[0-9]+$ && $commit =~ ^[0-9a-f]{40}$ && $source_repo == "$repo" ]] || fail 'No trusted successful main release is available.'
if [[ -f $base/shared/releases.json ]]; then
  current=$(python3 - "$base/shared/releases.json" <<'PY'
import json, sys
state = json.load(open(sys.argv[1]))
print(state.get('current', {}).get('commit', ''))
PY
  )
  [[ $current != "$commit" ]] || exit 0
fi

staging=$(mktemp -d "$base/releases/.download.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
# Authenticated GitHub artifact transport is the trust anchor. Never obtain
# manifest hashes from a public URL or execute the downloaded deployment script.
gh run download "$run_id" --repo "$repo" --name "amamihe-release-$commit" --dir "$staging"
[[ -f $staging/manifest.json && ! -L $staging/manifest.json ]] || fail 'Missing release manifest.'
python3 - "$staging/manifest.json" "$commit" <<'PY'
import json, sys
manifest = json.load(open(sys.argv[1]))
if manifest.get('commit') != sys.argv[2]:
    raise SystemExit('Artifact commit differs from the successful workflow commit.')
PY
manifest_hash=$(sha256sum "$staging/manifest.json")
manifest_hash=${manifest_hash%% *}
target=$base/releases/$commit
if [[ -e $target ]]; then
  [[ -f $target/manifest.json && ! -L $target ]] || fail 'Existing release path is invalid.'
  existing_hash=$(sha256sum "$target/manifest.json")
  [[ ${existing_hash%% *} == "$manifest_hash" ]] || fail 'Existing release differs from the trusted artifact.'
else
  chmod 0700 "$staging"
  mv -T --no-clobber "$staging" "$target"
  [[ ! -d $staging ]] || fail 'Release path changed concurrently.'
fi
# Only the separately reviewed host installation can promote images. The helper
# validates every release file and isolates mutations to the Amamihe project.
bash "$base/bin/deploy-release.sh" \
  --release "$target" \
  --shared-config "$base/shared/deployment.env" \
  --manifest-sha256 "$manifest_hash"
