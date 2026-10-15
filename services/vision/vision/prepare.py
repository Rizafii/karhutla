"""Prepare attributed forest/wildfire replay footage; no synthetic smoke."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


def prepare(root='/assets', scenario_only=False, extras_only=False):
    root = Path(root)
    sources = json.loads((root / 'footage-sources.json').read_text())
    by_name = {item['name']: item for item in sources}
    source = root / 'source/pexels'
    for item in sources:
        path = source / f"{item['name']}.mp4"
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
            raise RuntimeError(f'Run scripts/fetch_assets.py: missing or invalid {path.name}')
    output = root / 'videos'
    output.mkdir(parents=True, exist_ok=True)

    def encode(name, inputs, filters):
        temporary = output / f'{name}.partial.mp4'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2', '-filter_threads', '2', '-filter_complex_threads', '2', *inputs, *filters,
                        '-an', '-c:v', 'libx264', '-preset', 'fast', '-threads', '2', '-crf', '23',
                        '-movflags', '+faststart', str(temporary)], check=True)
        temporary.replace(output / f'{name}.mp4')

    if not scenario_only:
        if not extras_only:
            for name in ['forest', 'wildfire', 'drone-fire']:
                encode(name, ['-i', str(source / f'{name}.mp4')], ['-vf', 'scale=960:540,fps=25,setsar=1'])
            encode('camera-smoke', ['-i', str(source / 'drone-approach.mp4')], ['-vf', 'crop=iw*0.75:ih*0.75:(iw-ow)/2:0,scale=960:540,fps=25,setsar=1'])
            shutil.copyfile(output / 'wildfire.mp4', output / 'drone-approach.mp4')
            shutil.copyfile(output / 'forest.mp4', output / 'normal.mp4')
        for name, origin in [('normal-east', 'forest-east'), ('normal-south', 'forest-south'), ('payload-drop', 'payload-drop')]:
            encode(name, ['-i', str(source / f'{origin}.mp4')],
                   ['-t', '12', '-vf', 'scale=960:540,fps=25,setsar=1'] if name == 'payload-drop'
                   else ['-vf', 'scale=960:540,fps=25,setsar=1'])
    if not extras_only:
        # Keep the positive part long enough for six samples on a shared CPU.
        # Repetition is an explicit replay edit, never a generated detection.
        intro = output / 'forest-intro.mp4'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(output / 'forest.mp4'),
                        '-t', '8', '-an', '-c:v', 'copy', str(intro)], check=True)
        playlist = output / 'scenario.ffconcat'
        clips = [intro] + [output / 'camera-smoke.mp4'] * 7 + [output / 'drone-fire.mp4'] * 2
        playlist.write_text('ffconcat version 1.0\n' + ''.join(f"file '{clip.resolve().as_posix()}'\n" for clip in clips))
        temporary = output / 'scenario.partial.mp4'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0',
                        '-i', str(playlist), '-an', '-c:v', 'copy', '-movflags', '+faststart', str(temporary)], check=True)
        temporary.replace(output / 'scenario.mp4')
    manifest_path = root / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    names = ['normal', 'scenario', 'forest', 'wildfire', 'camera-smoke', 'drone-approach', 'drone-fire', 'normal-east', 'normal-south', 'payload-drop']
    replaced = {f'assets/videos/{name}.mp4' for name in names}
    manifest = [entry for entry in manifest if entry.get('path') not in replaced]
    for name in names:
        origin = {'normal': 'forest', 'drone-approach': 'wildfire', 'camera-smoke': 'drone-approach', 'normal-east': 'forest-east', 'normal-south': 'forest-south'}.get(name, name)
        selected = [by_name['forest'], by_name['drone-approach'], by_name['drone-fire']] if name == 'scenario' else [by_name[origin]]
        manifest.append({'kind': 'prepared_clip', 'path': f'assets/videos/{name}.mp4',
                         'sha256': hashlib.sha256((output / f'{name}.mp4').read_bytes()).hexdigest(),
                         'source': selected[0]['source'], 'sources': [item['source'] for item in selected],
                         'license': 'Pexels License', 'license_url': 'https://www.pexels.com/license/', 'authors': selected[0]['authors'],
                         'changes': 'Edited replay: approximately 8 seconds of forest, then seven replays of smoke footage (top 75% crop, centered horizontally), then two replays of visible forest fire. Clips depict different locations; concatenated without another lossy encode.' if name == 'scenario' else ('Top 75% crop, centered horizontally; ' if name == 'camera-smoke' else 'First 12 seconds; ' if name == 'payload-drop' else '') + 'Resized to 960x540, 25 fps, audio removed, H.264 MP4.',
                         'coordinate_note': 'Reference footage is not recorded at the demo coordinates. Drone telemetry and scanning remain virtual.'})
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print('Prepared real forest, wildfire scenario, drone approach and target footage.')


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--scenario-only', action='store_true')
    parser.add_argument('--extras-only', action='store_true')
    args = parser.parse_args()
    prepare(scenario_only=args.scenario_only, extras_only=args.extras_only)
