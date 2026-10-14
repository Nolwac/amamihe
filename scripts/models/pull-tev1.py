#!/usr/bin/env python3
"""Fetch official tev1 blobs from the preserved, SHA256-pinned manifest.

Uses the configured HTTP proxy, including in managed build environments where
the native transfer client cannot follow its blob download route.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import urllib.request

REGISTRY = "https://registry.ollama.ai/v2/library/tev1"


def pull(destination: Path):
    # Registry tags can move, and historical manifests may stop being served.
    # Preserve the exact public manifest bytes reviewed for this application;
    # every referenced official blob still requires its recorded size and hash.
    raw = Path(__file__).with_name("tev1-0.8b.manifest").read_bytes()
    if len(raw) > 65536:
        raise ValueError("Model manifest exceeds its budget.")
    if hashlib.sha256(raw).hexdigest() != "8d11b3146b7f3f4f4d5e9a64665ab2bdaf8b46e4ec42a5880b60a716ae50e3fb":
        raise ValueError("The preserved tev1 manifest differs from the verified release.")
    manifest = json.loads(raw)
    items = [manifest["config"], *manifest["layers"]]
    if not 2 <= len(items) <= 16:
        raise ValueError("Unexpected model layer count.")
    blobs = destination / "blobs"
    blobs.mkdir(parents=True, exist_ok=True)
    for item in items:
        digest, size = item["digest"], item["size"]
        if not re.fullmatch(r"sha256:[a-f0-9]{64}", digest) or not 0 < size <= 1200000000:
            raise ValueError("Unexpected model layer.")
        target = blobs / digest.replace(":", "-")
        if target.exists() and target.stat().st_size == size:
            with target.open("rb") as source:
                if hashlib.file_digest(source, "sha256").hexdigest() == digest[7:]:
                    continue
        temporary = target.with_suffix(".download")
        checksum = hashlib.sha256()
        received = 0
        print("Downloading", digest, size, "bytes", flush=True)
        try:
            with urllib.request.urlopen(REGISTRY + "/blobs/" + digest, timeout=120) as response:
                with temporary.open("wb") as out:
                    while chunk := response.read(1024 * 1024):
                        received += len(chunk)
                        if received > size:
                            raise ValueError("Model layer exceeds declared size.")
                        checksum.update(chunk)
                        out.write(chunk)
            if received != size or checksum.hexdigest() != digest[7:]:
                raise ValueError("Model layer SHA256 or size mismatch.")
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    config = json.loads((blobs / manifest["config"]["digest"].replace(":", "-")).read_text())
    if "decision" not in config.get("capabilities", []) or config.get("model_type") != "752.39M":
        raise ValueError("Unexpected tev1 model capabilities or size.")
    path = destination / "manifests/registry.ollama.ai/library/tev1/0.8b"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    print("Verified tev1:0.8b manifest sha256:" + hashlib.sha256(raw).hexdigest(), flush=True)


if __name__ == "__main__":
    pull(Path(sys.argv[1] if len(sys.argv) > 1 else os.environ["OLLAMA_MODELS"]))
