#!/usr/bin/env bash
# Installed and reviewed separately on the VPS. No production credentials in CI.
set -Eeuo pipefail
umask 077
base=/home/agents/amamihe-deploy
export GIT_SSH_COMMAND="ssh -i $base/shared/github-deploy-key -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$base/shared/github-known-hosts"
exec 8>"$base/shared/poll.lock"
flock -n 8 || exit 0
cd "$base/source"
git fetch --no-tags origin refs/heads/deploy/verified-main
commit=$(git rev-parse FETCH_HEAD)
[[ $commit =~ ^[0-9a-f]{40}$ ]]
current=$(python3 - "$base/shared/releases.json" <<'PY'
import json, sys
print(json.load(open(sys.argv[1]))['current']['commit'])
PY
)
[[ $current != "$commit" ]] || exit 0
# Prevent deploying a stale approved ref after main has moved.
main=$(git ls-remote origin refs/heads/main | cut -f1)
[[ $commit == "$main" ]] || { echo 'Awaiting checks for the current main commit'; exit 0; }
git checkout --detach "$commit"
release=$base/releases/$commit
if [[ ! -d $release ]]; then
  # Bound both build concurrency and each build process on this shared machine.
  docker buildx build --builder amamihe-builder --load --provenance=false --tag "amamihe-release:$commit" .
  bash scripts/deploy/build-release.sh --image "amamihe-release:$commit" --commit "$commit" --output "$release"
fi
hash=$(sha256sum "$release/manifest.json")
bash "$base/bin/deploy-release.sh" --release "$release" --shared-config "$base/shared/deployment.env" --manifest-sha256 "${hash%% *}"
curl --fail --silent --show-error --max-time 30 https://amamihe.online/api/health >/dev/null
