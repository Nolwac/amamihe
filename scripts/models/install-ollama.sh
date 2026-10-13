#!/usr/bin/env bash
set -euo pipefail
destination=${1:?Supply an installation directory}
architecture=${2:-$(uname -m)}
case "$architecture" in
  amd64|x86_64) architecture=amd64; checksum=ce6f8b671a699bf1ebafb28d60dbbabf4f37b30b499145fa308a8ba72de021d6 ;;
  arm64|aarch64) architecture=arm64; checksum=5754700747a93ea14db88888f08072386d2da6fbf7dd75be19a684348b9f28b8 ;;
  *) echo 'Unsupported Ollama CPU architecture.' >&2; exit 1 ;;
esac
archive=${OLLAMA_ARCHIVE_PATH:-}
temporary=''
if [[ -z $archive ]]; then
  temporary=$(mktemp --suffix=.tar.zst)
  archive=$temporary
  trap 'rm -f -- "$temporary"' EXIT
  curl --fail --location --silent --show-error --retry 2 \
    "https://github.com/ollama/ollama/releases/download/v0.40.3/ollama-linux-$architecture.tar.zst" --output "$archive"
fi
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check
mkdir -p "$destination"
# Keep CPU kernels and licence files; this deployment does not load GPU runtimes.
tar --zstd -xf "$archive" -C "$destination" \
  --exclude='lib/ollama/cuda*' --exclude='lib/ollama/rocm*' \
  --exclude='lib/ollama/vulkan*' --exclude='lib/ollama/hip*' \
  --exclude='lib/ollama/mlx*'
"$destination/bin/ollama" --version
