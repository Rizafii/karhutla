import pytest
from app import main


@pytest.mark.parametrize('clip', ['drone-approach', 'payload-drop'])
def test_drone_replay_supports_seeking(client, monkeypatch, tmp_path, clip):
    monkeypatch.setattr(main, 'FOOTAGE_DIR', tmp_path)
    content = b'ftyp' + bytes(range(128))
    (tmp_path / f'{clip}.mp4').write_bytes(content)
    response = client.get(f'/api/footage/{clip}', headers={'Range': 'bytes=10-19'})
    assert response.status_code == 206
    assert response.content == content[10:20]
    assert response.headers['content-type'] == 'video/mp4'
    assert response.headers['content-range'] == f'bytes 10-19/{len(content)}'


def test_replay_only_exposes_named_prepared_clips(client, monkeypatch, tmp_path):
    monkeypatch.setattr(main, 'FOOTAGE_DIR', tmp_path)
    (tmp_path / 'private.mp4').write_bytes(b'private')
    assert client.get('/api/footage/private').status_code == 404
    assert client.get('/api/footage/drone-fire').status_code == 404
