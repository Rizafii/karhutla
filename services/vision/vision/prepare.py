"""Prepare attributed real-footage replay clips; no synthetic smoke or inference labels."""
import hashlib
import json
import subprocess
from pathlib import Path


def prepare(root='/assets'):
    root=Path(root)
    source=root/'source/firesense'
    normal=source/'neg/testneg04.810.avi'
    smoke=source/'pos/testpos04.820.avi'
    if not normal.is_file() or not smoke.is_file():
        raise RuntimeError('Run scripts/fetch_assets.py before preparing footage.')
    output=root/'videos';output.mkdir(parents=True,exist_ok=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(normal),'-t','16','-vf','scale=960:540,fps=25','-an','-c:v','libx264','-preset','fast','-crf','23',str(output/'normal.mp4')],check=True)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(normal),'-i',str(smoke),'-filter_complex',
        '[0:v]trim=duration=8,setpts=PTS-STARTPTS,scale=960:540,fps=25,setsar=1[n];[1:v]trim=duration=30,setpts=PTS-STARTPTS,scale=960:540,fps=25,setsar=1[s];[n][s]concat=n=2:v=1:a=0[v]',
        '-map','[v]','-an','-c:v','libx264','-preset','fast','-crf','23',str(output/'scenario.mp4')],check=True)
    manifest_path=root/'manifest.json'
    manifest=json.loads(manifest_path.read_text()) if manifest_path.exists() else []
    manifest=[entry for entry in manifest if entry.get('kind')!='prepared_clip']
    for name,notes in [('normal.mp4','First 16 seconds of FIRESENSE neg/testneg04.810.avi.'),('scenario.mp4','Edited replay: first 8 seconds of neg/testneg04.810.avi, then first 30 seconds of pos/testpos04.820.avi. Source change is intentional; smoke/fire are real footage, not generated.')]:
        manifest.append({'kind':'prepared_clip','path':f'assets/videos/{name}','sha256':hashlib.sha256((output/name).read_bytes()).hexdigest(),
            'source':'https://zenodo.org/records/836749','license':'CC-BY-4.0','authors':'Nikos Grammalidis, Kosmas Dimitropoulos, Enis Cetin','changes':notes,
            'coordinate_note':'Reference footage is not from Kalimantan. Camera coordinates and monitoring geometry are demonstrations.'})
    manifest_path.write_text(json.dumps(manifest,indent=2))
    print('Prepared normal.mp4 and scenario.mp4. AI output is computed only by the live worker.')


if __name__=='__main__':
    prepare()
