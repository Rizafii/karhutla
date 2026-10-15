from .db import Session
from .models import Camera, Drone, ResponseUnit, DemoState
from .config import settings


def seed(session):
    for id, name, lat, lon, heading in [
        ("CAM-001", "Forest West", -2.300, 113.889, 90),
        ("CAM-002", "Forest North", -2.289, 113.900, 180),
        ("CAM-003", "Forest East", -2.300, 113.911, 270),
        ("CAM-004", "Forest South", -2.309, 113.900, 0),
    ]:
        legacy = {"normal": "/videos/normal.mp4", "scenario": "/videos/scenario.mp4"}
        defaults = {**legacy, "normal": {"CAM-003": "/videos/normal-east.mp4", "CAM-004": "/videos/normal-south.mp4"}.get(id, legacy["normal"])}
        camera = session.get(Camera, id)
        if not camera:
            session.add(Camera(id=id, name=name, latitude=lat, longitude=lon, heading=heading,
                               source_config=defaults))
        elif camera.source_type == "mp4" and camera.source_config == legacy and defaults != legacy:
            camera.source_config = defaults
    if not session.get(Drone, "DRONE-01"):
        session.add(Drone(id="DRONE-01", name="Wildfire Response UAV", latitude=-2.310, longitude=113.900,
                          home_latitude=-2.310, home_longitude=113.900))
    for id, name, lat, lon in [("TEAM-01", "Regu Manggala A", -2.311, 113.896), ("TEAM-02", "Regu Manggala B", -2.311, 113.904)]:
        if not session.get(ResponseUnit, id):
            session.add(ResponseUnit(id=id, name=name, latitude=lat, longitude=lon, home_latitude=lat, home_longitude=lon))
    if not session.get(DemoState, 1):
        session.add(DemoState(id=1, speed=settings.simulation_speed))


if __name__ == "__main__":
    with Session.begin() as session:
        seed(session)
    print("Seed data ready (idempotent).")
