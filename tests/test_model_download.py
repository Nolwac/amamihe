import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/models/pull-tev1.py"
spec = importlib.util.spec_from_file_location("model_download", SCRIPT)
download = importlib.util.module_from_spec(spec)
spec.loader.exec_module(download)


class ModelManifestIntegrity(unittest.TestCase):
    def test_preserved_public_manifest_matches_verified_runtime(self):
        raw = SCRIPT.with_name("tev1-0.8b.manifest").read_bytes()
        self.assertEqual(hashlib.sha256(raw).hexdigest(),
                         "8d11b3146b7f3f4f4d5e9a64665ab2bdaf8b46e4ec42a5880b60a716ae50e3fb")

    def test_modified_manifest_is_rejected_before_network_or_destination_writes(self):
        raw = SCRIPT.with_name("tev1-0.8b.manifest").read_bytes()
        for tampered in (raw + b"\n", raw.replace(b"811843424", b"811843425")):
            with self.subTest(), tempfile.TemporaryDirectory() as temporary:
                destination = Path(temporary) / "models"
                with patch.object(Path, "read_bytes", return_value=tampered), \
                        patch.object(download.urllib.request, "urlopen") as network:
                    with self.assertRaisesRegex(ValueError, "verified release"):
                        download.pull(destination)
                    network.assert_not_called()
                    self.assertFalse(destination.exists())


if __name__ == "__main__":
    unittest.main()
