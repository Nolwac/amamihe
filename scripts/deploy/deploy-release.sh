#!/usr/bin/env bash
set -euo pipefail
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }
usage() {
  printf '%s\n' 'Usage: deploy-release.sh --release DIR --shared-config FILE --manifest-sha256 HASH [--rollback]' \
    'Runs only the isolated amamihe project on the local Docker daemon. No public proxy or DNS changes.'
}
release='' shared_config='' manifest_hash='' rollback_only=false
while (($#)); do
  case "$1" in
    --release|--shared-config|--manifest-sha256)
      (($# >= 2)) || fail "Missing argument for $1"
      case "$1" in
        --release) release=$2 ;;
        --shared-config) shared_config=$2 ;;
        --manifest-sha256) manifest_hash=$2 ;;
      esac
      shift 2 ;;
    --rollback) rollback_only=true; shift ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done
[[ -n $release && -n $shared_config && $manifest_hash =~ ^[0-9a-fA-F]{64}$ ]] || { usage; exit 1; }
for command in python3 docker flock curl openssl; do
  command -v "$command" >/dev/null || fail "Required command is unavailable: $command"
done

# No dotenv file is sourced as shell code. Output is non-secret metadata only.
validate_release() {
  python3 - "$1" "$shared_config" "$2" <<'PY'
import hashlib, json, os, pathlib, re, stat, sys, tarfile
def require(condition, message):
    if not condition: raise ValueError(message)
def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()
try:
    release = pathlib.Path(sys.argv[1]).resolve(strict=True)
    config = pathlib.Path(sys.argv[2])
    require(not config.is_symlink(), 'Private configuration cannot be a symlink.')
    config = config.resolve(strict=True)
    expected = sys.argv[3].lower()
    names = {'manifest.json', 'image.tar.gz', 'compose.yaml', 'init-db.sh', 'deploy-release.sh', 'deployment.env.example'}
    require(release.is_dir(), 'Release must be a directory.')
    require(release.stat().st_uid in (0, os.geteuid()) and not release.stat().st_mode & 0o022, 'Release directory must be root/current-user owned and not writable by others.')
    require({p.name for p in release.iterdir()} == names | {'SHA256SUMS'}, 'Release contains unexpected or missing files.')
    for name in names | {'SHA256SUMS'}:
        p = release / name
        require(p.is_file() and not p.is_symlink(), 'Release files must be regular files, not symlinks.')
        require(p.stat().st_uid in (0, os.geteuid()), 'Release files must be root/current-user owned.')
        require(not (p.stat().st_mode & 0o022), 'Release files cannot be writable by another user.')
    require(digest(release / 'manifest.json') == expected, 'Manifest does not match the caller-supplied SHA256.')
    checksums = {}
    for line in (release / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  ([a-zA-Z0-9_.-]+)', line)
        require(match is not None, 'Invalid checksum entry.')
        checksum, name = match.groups()
        require(name in names and name not in checksums, 'Unexpected or duplicate checksum name.')
        checksums[name] = checksum
    require(set(checksums) == names, 'Checksum allowlist is incomplete.')
    for name, checksum in checksums.items(): require(digest(release / name) == checksum, 'Release checksum mismatch.')
    manifest = json.loads((release / 'manifest.json').read_text())
    require(set(manifest) == {'formatVersion','commit','imageId','imageArchiveSha256','architecture','os','schemaVersion','files'}, 'Unexpected manifest fields.')
    require(manifest['formatVersion'] == 2 and manifest['schemaVersion'] == 1, 'Unsupported release or schema version.')
    anchored_names = names - {'manifest.json'}
    require(isinstance(manifest['files'], dict) and set(manifest['files']) == anchored_names, 'Manifest file allowlist is incomplete.')
    for name, checksum in manifest['files'].items():
        require(isinstance(checksum, str) and re.fullmatch(r'[0-9a-f]{64}', checksum) is not None, 'Invalid manifest file digest.')
        require(checksums[name] == checksum, 'Release file differs from its authenticated manifest digest.')
    require(re.fullmatch(r'[0-9a-f]{40}', manifest['commit']) is not None, 'Invalid commit identifier.')
    require(re.fullmatch(r'sha256:[0-9a-f]{64}', manifest['imageId']) is not None, 'Invalid immutable image ID.')
    require(manifest['os'] == 'linux' and manifest['architecture'] in ('amd64','arm64'), 'Unsupported image platform.')
    require(manifest['imageArchiveSha256'] == checksums['image.tar.gz'], 'Image archive digest differs from manifest.')
    with tarfile.open(release / 'image.tar.gz', 'r:gz') as archive:
        member = archive.getmember('manifest.json')
        require(member.isfile() and member.size < 1024 * 1024, 'Invalid Docker archive metadata.')
        images = json.load(archive.extractfile(member))
        require(isinstance(images, list) and len(images) == 1, 'Archive must contain exactly one image.')
        require(not images[0].get('RepoTags'), 'Archive must not replace mutable host image tags.')
        image_config = images[0]['Config']
        config_digest = pathlib.PurePosixPath(image_config).name.removesuffix('.json')
        require(re.fullmatch(r'[0-9a-f]{64}', config_digest) is not None, 'Invalid Docker config digest.')
        # Containerd-backed Docker stores identify an OCI manifest/index, while
        # classic Docker identifies the configuration blob. Anchor either form.
        if config_digest != manifest['imageId'].split(':')[1]:
            index_member = archive.getmember('index.json')
            require(index_member.isfile() and index_member.size < 1024 * 1024, 'Invalid OCI archive index.')
            index = json.load(archive.extractfile(index_member))
            roots = index.get('manifests', [])
            require(len(roots) == 1 and roots[0].get('digest') == manifest['imageId'], 'OCI archive root differs from image ID.')
            configs = []
            def visit(descriptor, depth=0):
                require(depth <= 3, 'OCI descriptor nesting exceeds limit.')
                digest = descriptor.get('digest', '')
                require(re.fullmatch(r'sha256:[0-9a-f]{64}', digest) is not None, 'Invalid OCI descriptor digest.')
                member = archive.getmember('blobs/sha256/' + digest.split(':')[1])
                require(member.isfile() and member.size <= 1024 * 1024 and member.size == descriptor.get('size'), 'Invalid OCI metadata blob.')
                raw = archive.extractfile(member).read()
                require(hashlib.sha256(raw).hexdigest() == digest.split(':')[1], 'OCI metadata digest is invalid.')
                data = json.loads(raw)
                if 'manifests' in data:
                    require(len(data['manifests']) <= 8, 'Too many OCI manifests.')
                    for child in data['manifests']: visit(child, depth + 1)
                else:
                    require(isinstance(data.get('config'), dict), 'OCI image config is missing.')
                    configs.append(data['config']['digest'])
            visit(roots[0])
            require(configs.count('sha256:' + config_digest) == 1, 'Docker config is not uniquely anchored to OCI image ID.')
        config_member = archive.getmember(image_config)
        require(config_member.isfile() and config_member.size <= 1024 * 1024, 'Docker config must be a bounded regular archive member.')
        config_bytes = archive.extractfile(config_member)
        require(config_bytes is not None, 'Docker config is missing.')
        raw_config = config_bytes.read()
        require(hashlib.sha256(raw_config).hexdigest() == config_digest, 'Docker image configuration hash is invalid.')
        parsed_config = json.loads(raw_config)
        require(parsed_config.get('architecture') == manifest['architecture'] and parsed_config.get('os') == manifest['os'], 'Docker config platform differs from manifest.')
    info = config.stat()
    require(info.st_uid in (0, os.geteuid()) and not info.st_mode & 0o077, 'Private configuration must be root/current-user owned with mode 0600 or stricter.')
    settings = {}
    for raw in config.read_text().splitlines():
        raw = raw.strip()
        if not raw or raw.startswith('#'): continue
        require('=' in raw, 'Invalid private configuration line.')
        key, value = raw.split('=', 1)
        require(key not in settings, 'Duplicate configuration key.')
        require(value and not any(c in value for c in '$`\r\n\x00'), 'Configuration must use literal values.')
        settings[key] = value
    required = {'AMAMIHE_SHARED_DIR','APP_LOOPBACK_PORT','POSTGRES_IMAGE','POSTGRES_ADMIN_PASSWORD','POSTGRES_APP_PASSWORD'}
    optional = {'SOCIAL_MODERATOR_IDS','WORLD_IDLE_WARNING_SECONDS','WORLD_IDLE_ARREST_SECONDS','DECISION_PROVIDER','OPENROUTER_API_KEY','OPENROUTER_MAX_REQUEST_COST_USD'}
    require(required <= set(settings) and set(settings) <= required | optional, 'Private configuration has unsupported or missing keys.')
    if 'SOCIAL_MODERATOR_IDS' in settings: require(len(settings['SOCIAL_MODERATOR_IDS']) <= 1200 and re.fullmatch(r'[A-Za-z0-9_-]+(?:,[A-Za-z0-9_-]+)*', settings['SOCIAL_MODERATOR_IDS']) is not None, 'Invalid moderator identifiers.')
    for name in ('WORLD_IDLE_WARNING_SECONDS','WORLD_IDLE_ARREST_SECONDS'):
        if name in settings: require(re.fullmatch(r'[0-9]{2,4}', settings[name]) is not None, 'Invalid world policy threshold.')
    warning, arrest = int(settings.get('WORLD_IDLE_WARNING_SECONDS','600')), int(settings.get('WORLD_IDLE_ARREST_SECONDS','900'))
    require(warning >= 60 and arrest >= warning + 60 and arrest <= 7200, 'Invalid world policy interval.')
    require(settings.get('DECISION_PROVIDER','mock') in ('mock','openrouter'), 'Invalid decision provider.')
    if 'OPENROUTER_API_KEY' in settings: require(re.fullmatch(r'[A-Za-z0-9_-]{16,256}', settings['OPENROUTER_API_KEY']) is not None, 'Invalid private decision key format.')
    budget = settings.get('OPENROUTER_MAX_REQUEST_COST_USD','0')
    require(re.fullmatch(r'0(?:\.[0-9]{1,8})?', budget) is not None and float(budget) <= 0.01, 'Decision request budget exceeds the bounded deployment limit.')
    shared_path = pathlib.Path(settings['AMAMIHE_SHARED_DIR'])
    require(re.fullmatch(r'/[A-Za-z0-9_./-]+', settings['AMAMIHE_SHARED_DIR']) is not None, 'Shared directory must use an absolute path containing only letters, digits, slash, dot, dash, or underscore.')
    require(shared_path.is_absolute(), 'Shared directory must be absolute.')
    shared = shared_path.resolve(strict=True)
    require(shared == shared_path, 'Shared directory must not contain symlink or traversal components.')
    require(shared.is_dir() and shared.stat().st_uid in (0, os.geteuid()) and not shared.stat().st_mode & 0o077, 'Shared directory must be private and root/current-user owned.')
    require(not config.is_relative_to(release) and not shared.is_relative_to(release) and not release.is_relative_to(shared), 'Private shared files and immutable releases must be separate.')
    require(config.is_relative_to(shared), 'Private configuration must reside inside the private shared directory.')
    email_config = shared / 'email.json'
    if email_config.exists():
        require(email_config.is_file() and not email_config.is_symlink(), 'Email configuration must be a regular private file.')
        require(email_config.stat().st_uid in (0, os.geteuid()) and not email_config.stat().st_mode & 0o077, 'Email configuration must be private and owned by the deployment user.')
    require(not any((parent / '.git').exists() for parent in (shared, *shared.parents)), 'Private shared files must reside outside Git checkouts.')
    require(re.fullmatch(r'[0-9]{4,5}', settings['APP_LOOPBACK_PORT']) is not None and 1024 <= int(settings['APP_LOOPBACK_PORT']) <= 65535, 'Select an explicit loopback TCP port between 1024 and 65535.')
    require(re.fullmatch(r'postgres:17-bookworm@sha256:[0-9a-f]{64}', settings['POSTGRES_IMAGE']) is not None, 'Pin an approved official PostgreSQL 17 bookworm digest.')
    for key in ('POSTGRES_ADMIN_PASSWORD','POSTGRES_APP_PASSWORD'): require(re.fullmatch(r'[0-9a-fA-F]{64}', settings[key]) is not None, 'Database passwords must be generated 64-character hexadecimal values.')
    require(settings['POSTGRES_ADMIN_PASSWORD'] != settings['POSTGRES_APP_PASSWORD'], 'Use independent database passwords.')
    for key in ('ca.crt','server.crt','server.key'):
        p = shared / 'tls' / key
        require(p.is_file() and not p.is_symlink(), 'Required database TLS material is missing or a symlink.')
    require(not (shared / 'tls' / 'server.key').stat().st_mode & 0o077, 'Database private key must have mode 0600 or stricter.')
    require((shared / 'tls' / 'server.key').stat().st_uid == 999, 'Database private key must belong to PostgreSQL container UID 999.')
    for value in (str(release), str(config), str(shared)): require('\n' not in value and '\r' not in value, 'Paths cannot contain line breaks.')
    print('\n'.join([str(release),str(config),manifest['imageId'],manifest['architecture'],manifest['commit'],str(shared),settings['APP_LOOPBACK_PORT'],settings['POSTGRES_IMAGE'],digest(config)]))
except Exception as error:
    print('Release validation failed: ' + str(error), file=sys.stderr)
    sys.exit(1)
PY
}
metadata=$(validate_release "$release" "$manifest_hash")
mapfile -t fields <<< "$metadata"
release=${fields[0]} shared_config=${fields[1]} image_id=${fields[2]} image_arch=${fields[3]}
commit=${fields[4]} shared=${fields[5]} port=${fields[6]} postgres_image=${fields[7]} config_hash=${fields[8]}

[[ ! -L $shared/deploy.lock ]] || fail 'Deployment lock cannot be a symlink.'
exec 9>"$shared/deploy.lock"
flock -n 9 || fail 'Another Amamihe deployment is running.'
dk() {
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    docker --host=unix:///var/run/docker.sock "$@"
}
compose() {
  local selected_release=$1 selected_image=$2; shift 2
  env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
    -u APP_LOOPBACK_PORT -u AMAMIHE_SHARED_DIR -u POSTGRES_IMAGE \
    -u POSTGRES_ADMIN_PASSWORD -u POSTGRES_APP_PASSWORD \
    -u SOCIAL_MODERATOR_IDS -u WORLD_IDLE_WARNING_SECONDS -u WORLD_IDLE_ARREST_SECONDS \
    -u DECISION_PROVIDER -u OPENROUTER_API_KEY -u OPENROUTER_MAX_REQUEST_COST_USD \
    -u COMPOSE_REMOVE_ORPHANS -u COMPOSE_IGNORE_ORPHANS -u COMPOSE_PROFILES \
    -u COMPOSE_PROJECT_NAME -u COMPOSE_FILE AMAMIHE_IMAGE="$selected_image" \
    docker --host=unix:///var/run/docker.sock compose --project-name amamihe \
    --project-directory "$selected_release" --env-file "$shared_config" -f "$selected_release/compose.yaml" "$@"
}
daemon_arch=$(dk info --format '{{.Architecture}}')
case "$daemon_arch" in x86_64) daemon_arch=amd64 ;; aarch64) daemon_arch=arm64 ;; esac
[[ $daemon_arch == "$image_arch" ]] || fail 'Image platform does not match the local Docker daemon.'
compose "$release" "$image_id" config --quiet
openssl verify -CAfile "$shared/tls/ca.crt" "$shared/tls/server.crt" >/dev/null
openssl x509 -in "$shared/tls/server.crt" -checkhost postgres -noout >/dev/null
openssl x509 -in "$shared/tls/server.crt" -checkend 86400 -noout >/dev/null

# Refuse a namespace collision instead of adopting/removing pre-existing services.
# Docker name filtering is a regex substring match unless explicitly anchored.
# Build workers and unrelated containers may contain this text in their names.
container_ids=$( { dk ps -aq --filter 'name=^/amamihe-' && dk ps -aq --filter label=com.docker.compose.project=amamihe; } | sort -u)
for container in $container_ids; do
  labels=$(dk inspect "$container" --format '{{index .Config.Labels "io.amamihe.deployment"}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}')
  [[ $labels == 'shared-vps-v1|amamihe|app' || $labels == 'shared-vps-v1|amamihe|postgres' ]] || fail 'An existing container conflicts with the reserved Amamihe project.'
done
for kind in network volume; do
  resource_ids=$( { dk "$kind" ls -q --filter name=amamihe_ && dk "$kind" ls -q --filter label=com.docker.compose.project=amamihe; } | sort -u)
  for resource in $resource_ids; do
    labels=$(dk "$kind" inspect "$resource" --format '{{index .Labels "io.amamihe.deployment"}}|{{index .Labels "com.docker.compose.project"}}')
    [[ $labels == 'shared-vps-v1|amamihe' ]] || fail 'An existing network or volume conflicts with the reserved Amamihe project.'
  done
done

state_file="$shared/releases.json"
previous_release='' previous_image='' previous_manifest=''
if [[ -e $state_file ]]; then
  state_metadata=$(python3 - "$state_file" "$config_hash" "$port" <<'PY'
import json, os, pathlib, sys
try:
    p=pathlib.Path(sys.argv[1]); s=p.stat()
    if p.is_symlink() or s.st_uid not in (0,os.geteuid()) or s.st_mode & 0o077: raise ValueError('State permissions are invalid.')
    current=json.loads(p.read_text())['current']
    if current['configSha256'] != sys.argv[2] or str(current['loopbackPort']) != sys.argv[3]: raise ValueError('Shared configuration changed; handle database/port maintenance separately before deployment.')
    print('\n'.join([current['release'],current['imageId'],current['manifestSha256']]))
except Exception as error:
    print('Deployment state validation failed: '+str(error),file=sys.stderr);sys.exit(1)
PY
  )
  mapfile -t previous_fields <<< "$state_metadata"
  previous_release=${previous_fields[0]} previous_image=${previous_fields[1]} previous_manifest=${previous_fields[2]}
  previous_metadata=$(validate_release "$previous_release" "$previous_manifest")
  mapfile -t previous_validated <<< "$previous_metadata"
  [[ ${previous_validated[2]} == "$previous_image" ]] || fail 'Deployment state image differs from its verified release.'
else
  [[ $rollback_only == false ]] || fail 'Rollback requires an existing deployment state.'
  # Docker DNAT can reserve a host port without a listening userspace socket.
  running_ids=$(dk ps -q)
  for container in $running_ids; do
    bindings=$(dk inspect "$container" --format '{{json .HostConfig.PortBindings}}')
    python3 - "$port" "$bindings" <<'PY'
import json,sys
try:
    bindings=json.loads(sys.argv[2]) or {}
    for published in bindings.values():
        for endpoint in published or []:
            if endpoint.get('HostPort') == sys.argv[1] and endpoint.get('HostIp','') in ('','0.0.0.0','127.0.0.1','::','::0'):
                raise ValueError('Chosen loopback port is already published by an existing container; no services were changed.')
except Exception as error:
    print('Host port validation failed: '+str(error),file=sys.stderr);sys.exit(1)
PY
  done
  python3 - "$port" <<'PY'
import socket,sys
try:
    with socket.socket() as listener: listener.bind(('127.0.0.1',int(sys.argv[1])))
except OSError:
    print('Chosen loopback port is already occupied; no services were changed.',file=sys.stderr);sys.exit(1)
PY
fi

switched=false
on_exit() {
  local status=$?
  if ((status != 0)) && [[ $switched == true ]]; then
    if [[ -n $previous_image ]]; then
      printf 'Deployment failed; restoring only the previous Amamihe application image.\n' >&2
      if compose "$previous_release" "$previous_image" up -d --no-build --no-deps --wait --wait-timeout 120 app; then
        printf 'Previous application restored. Database records were preserved.\n' >&2
      else
        printf 'Application rollback failed; inspect only the Amamihe project. Database was not restored or removed.\n' >&2
      fi
    else
      compose "$release" "$image_id" stop app || true
      printf 'First application deployment failed; its app was stopped and its database preserved.\n' >&2
    fi
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

dk image load --input "$release/image.tar.gz" >/dev/null
loaded=$(dk image inspect "$image_id" --format '{{.Id}}|{{.Architecture}}|{{.Os}}')
[[ $loaded == "$image_id|$image_arch|linux" ]] || fail 'Loaded image does not match the immutable release.'
if [[ -n $previous_image ]]; then
  dk image inspect "$previous_image" >/dev/null 2>&1 || dk image load --input "$previous_release/image.tar.gz" >/dev/null
fi
postgres_container=$(compose "$release" "$image_id" ps -aq postgres)
if [[ -z $postgres_container ]]; then
  [[ -z $previous_image && $rollback_only == false ]] || fail 'Existing application database is missing; refusing to reinitialize it.'
  [[ ! -e $shared/init-db.sh ]] || fail 'Bootstrap initializer already exists without a database; inspect the shared state first.'
  dk image inspect "$postgres_image" >/dev/null 2>&1 || fail 'Approved PostgreSQL image is not loaded; pull its configured digest separately before bootstrap.'
  install -m 0444 "$release/init-db.sh" "$shared/init-db.sh"
  compose "$release" "$image_id" up -d --no-build --wait --wait-timeout 120 postgres
else
  healthy=$(dk inspect "$postgres_container" --format '{{.State.Health.Status}}')
  [[ $healthy == healthy ]] || fail 'Existing Amamihe database is not healthy; no application changes were made.'
fi

switched=true
compose "$release" "$image_id" up -d --no-build --no-deps --wait --wait-timeout 120 app
curl --noproxy 127.0.0.1 --fail --silent --show-error --max-time 10 "http://127.0.0.1:$port/api/health" | \
  python3 -c 'import json,sys; h=json.load(sys.stdin); sys.exit(0 if h.get("ok") and h.get("storage")=="PostgreSQL" else 1)'
python3 - "$state_file" "$release" "$image_id" "$manifest_hash" "$config_hash" "$port" "$commit" <<'PY'
import datetime,json,os,pathlib,sys,tempfile
p=pathlib.Path(sys.argv[1]);previous=json.loads(p.read_text())['current'] if p.exists() else None
current={'release':sys.argv[2],'imageId':sys.argv[3],'manifestSha256':sys.argv[4].lower(),'configSha256':sys.argv[5],'loopbackPort':int(sys.argv[6]),'commit':sys.argv[7],'verified':'loopback-health','publicVerification':'pending','completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
fd,temp=tempfile.mkstemp(prefix='.releases-',dir=p.parent)
try:
    with os.fdopen(fd,'w') as out:json.dump({'current':current,'previous':previous},out,indent=2);out.flush();os.fsync(out.fileno())
    os.replace(temp,p)
finally:
    if os.path.exists(temp):os.unlink(temp)
PY
switched=false
printf 'Amamihe release %s is healthy on loopback port %s. Public HTTPS/browser verification remains required.\n' "$commit" "$port"
