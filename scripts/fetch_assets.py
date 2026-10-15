"""One-time, explicit verified asset download. Never runs at application startup."""
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = '9c81734ac75d14ba57c7834904891874074e451f'


def fetch(url, path, expected):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
        return expected
    temporary = path.with_suffix(path.suffix + '.part')
    print(f'Downloading {path.name}', flush=True)
    try:
        subprocess.run(['curl', '--fail', '--location', '--retry', '5', '--retry-all-errors',
                        '--connect-timeout', '20', '--continue-at', '-', '--output', str(temporary), url], check=True)
    except FileNotFoundError:
        urllib.request.urlretrieve(url, temporary)
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    if digest != expected:
        raise ValueError(f'Pinned SHA256 mismatch: {path}. Remove its .part file before retrying.')
    temporary.replace(path)
    return digest


if __name__ == '__main__':
    manifest_path = ROOT / 'assets/manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    model_url = f'https://huggingface.co/odiug77/wildfire-smoke-fire/resolve/{REVISION}/wildfire-smoke-fire.pt'
    model_path = 'assets/models/wildfire-smoke-fire.pt'
    digest = fetch(model_url, ROOT / model_path, '6b7089f0abb37821cc17bd72d9c595591f03d9f230fe49acec0166049c9f213e')
    entries = [{'path': model_path, 'source': 'https://huggingface.co/odiug77/wildfire-smoke-fire', 'url': model_url,
                'revision': REVISION, 'license': 'Apache-2.0 (publisher model card)', 'sha256': digest}]
    for item in json.loads((ROOT / 'assets/footage-sources.json').read_text()):
        fetch(item['url'], ROOT / item['path'], item['sha256'])
        entries.append({'kind': 'source_clip', **item})
    replaced = {entry['path'] for entry in entries}
    manifest = [entry for entry in manifest if entry.get('path') not in replaced]
    manifest_path.write_text(json.dumps(manifest + entries, indent=2) + '\n')
    print('Assets checksum-verified. Run python -m vision.prepare in the vision container.')
