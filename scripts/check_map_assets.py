"""Smoke-check the deployed frontend's map CSS and local worker assets."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import urlopen

parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://localhost:3000")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
version = json.loads((root / "apps/web/package.json").read_text())["dependencies"]["maplibre-gl"]


def get(path):
    with urlopen(urljoin(args.url, path), timeout=20) as response:
        return response.read(), response.headers.get_content_type()


html, _ = get("/")
styles = re.findall(r'href="([^"]+\.css[^"]*)"', html.decode())
css = "\n".join(get(path)[0].decode() for path in styles)
assert re.search(r"\.map-area\s*>\s*\.monitoring-map\s*\{[^}]*position:\s*absolute", css), "Missing map sizing rule that overrides MapLibre CSS"
for name in ("maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"):
    content, mime = get(f"/maplibre/{version}/{name}")
    assert mime in ("application/javascript", "text/javascript"), f"Wrong module MIME: {mime}"
    if name == "maplibre-gl-worker.mjs":
        assert len(content) > 1000 and b"MapLibre" in content, "Missing worker JavaScript"
    print(f"PASS {name}: HTTP 200, {mime}, {len(content)} bytes")
print("PASS map container sizing: explicit selector overrides library CSS")
