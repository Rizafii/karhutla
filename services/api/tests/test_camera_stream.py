import asyncio
import pytest
from app import main
from app.models import Camera


@pytest.mark.parametrize('annotated', [False, True])
def test_fourth_registered_camera_streams_raw_and_ai_frames(client, tmp_path, annotated):
    with client.db_session.begin() as session:
        session.get(Camera, 'CAM-004').connection_status = 'connected'
    frames = tmp_path / 'frames'
    frames.mkdir()
    frame = b'fourth-camera-jpeg'
    (frames / f"CAM-004{'-ai' if annotated else ''}.jpg").write_bytes(frame)

    async def first_frame():
        response = await main.stream('CAM-004', annotated)
        chunk = await anext(response.body_iterator)
        await response.body_iterator.aclose()
        return response.media_type, chunk

    media_type, chunk = asyncio.run(first_frame())
    assert media_type == 'multipart/x-mixed-replace; boundary=frame'
    assert chunk.endswith(frame + b'\r\n')
    assert b'Content-Type: image/jpeg' in chunk


def test_stream_requires_a_registered_camera(client):
    assert client.get('/api/cameras/CAM-999/stream.mjpg').status_code == 404


def test_disconnected_camera_does_not_serve_a_stale_frame(client, tmp_path):
    frames = tmp_path / 'frames'
    frames.mkdir()
    (frames / 'CAM-004.jpg').write_bytes(b'stale')
    assert client.get('/api/cameras/CAM-004/stream.mjpg').status_code == 503
