from sqlalchemy import select
from app.models import Camera
from app.seed import seed


def test_four_camera_seed_updates_defaults_and_preserves_custom_sources(client):
    with client.db_session.begin() as session:
        east = session.get(Camera, 'CAM-003')
        east.source_type = 'rtsp'
        east.source_config = {'url': 'rtsp://camera.local/live'}
        south = session.get(Camera, 'CAM-004')
        south.source_config = {'normal': '/videos/normal.mp4', 'scenario': '/videos/scenario.mp4'}
        session.flush()
        seed(session)
        session.flush()
        seed(session)
        session.flush()
        assert len(session.scalars(select(Camera)).all()) == 4
        assert east.source_config == {'url': 'rtsp://camera.local/live'}
        assert south.source_config['normal'] == '/videos/normal-south.mp4'
