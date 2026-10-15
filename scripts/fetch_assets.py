"""One-time, explicit asset download. Never imported during application startup."""
import hashlib
import json
import urllib.request
import zipfile
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = "9c81734ac75d14ba57c7834904891874074e451f"


def fetch(url, path, md5=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists() or (md5 and hashlib.md5(path.read_bytes()).hexdigest() != md5):
        print(f"Downloading {path.name}", flush=True)
        try:
            subprocess.run(['curl','--fail','--location','--retry','5','--retry-all-errors','--connect-timeout','20','--continue-at','-', '--output',str(path),url],check=True)
        except FileNotFoundError:
            urllib.request.urlretrieve(url, path)
    if md5 and hashlib.md5(path.read_bytes()).hexdigest() != md5:
        raise ValueError(f"Checksum mismatch: {path}")
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    manifest = []
    model_url = f"https://huggingface.co/odiug77/wildfire-smoke-fire/resolve/{REVISION}/wildfire-smoke-fire.pt"
    model = ROOT / "assets/models/wildfire-smoke-fire.pt"
    digest = fetch(model_url, model)
    if digest != '6b7089f0abb37821cc17bd72d9c595591f03d9f230fe49acec0166049c9f213e':
        raise ValueError('Pinned model SHA256 mismatch; do not load unexpected weights')
    manifest.append({"path": str(model.relative_to(ROOT)), "source": "https://huggingface.co/odiug77/wildfire-smoke-fire", "url": model_url, "revision": REVISION, "license": "Apache-2.0 (publisher model card)", "sha256": digest})
    archive = ROOT / "assets/source/smoke_videos.1407.zip"
    digest = fetch("https://zenodo.org/api/records/836749/files/smoke_videos.1407.zip/content", archive, "5ee6bc867c4a9332b4e75f308c26fc23")
    with zipfile.ZipFile(archive) as zip:
        destination = (ROOT / "assets/source/firesense").resolve()
        for item in zip.infolist():
            target = (destination / item.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError("Unsafe archive path")
        zip.extractall(destination)
        print("Videos:", *[name for name in zip.namelist() if name.lower().endswith((".avi", ".mp4", ".mov"))], sep="\n")
    manifest.append({"source": "https://zenodo.org/records/836749", "authors": "Nikos Grammalidis, Kosmas Dimitropoulos, Enis Cetin", "license": "CC-BY-4.0", "sha256": digest, "notes": "FIRESENSE research footage, not recorded in Kalimantan. Selected clips must be documented after preparation."})
    (ROOT / "assets/manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf8")
    print("Downloaded and checksum-verified. Prepare MP4 clips separately with FFmpeg.")
