from pyproj import Geod

GEOD = Geod(ellps="WGS84")
ACTIVE_INCIDENTS = ("pending_review", "confirmed", "dispatched", "in_progress")
VERIFIED_INCIDENTS = ("confirmed", "dispatched", "in_progress")
TERMINAL_MISSIONS = ("completed", "cancelled", "aborted", "failed")
FLYING = ("en_route", "on_site", "suppression_simulation", "returning")
BATTERY_PER_SECOND = 100 / 1200
RESERVE = 20


def estimate_camera_location(camera, bbox=None, frame_width=None):
    """Bearing + assumed range, never monocular GPS localization.

    The radius is a demonstration assumption, not a measured confidence bound.
    Bounding-box X can adjust bearing only when the source frame width is known.
    """
    heading = camera.heading
    if bbox and len(bbox) == 4 and frame_width:
        center = max(0, min(1, (bbox[0] + bbox[2]) / (2 * frame_width)))
        heading += (center - .5) * camera.fov
    lon, lat, _ = GEOD.fwd(camera.longitude, camera.latitude, heading, camera.range_m * .6)
    return lat, lon, max(200, camera.range_m * .5)


def move(lat, lon, target_lat, target_lon, speed, seconds):
    azimuth, _, distance = GEOD.inv(lon, lat, target_lon, target_lat)
    step = min(distance, max(0, speed * seconds))
    if distance <= step + 2:
        return target_lat, target_lon, 0.0, True
    next_lon, next_lat, _ = GEOD.fwd(lon, lat, azimuth, step)
    return next_lat, next_lon, max(0, distance - step), False


def distance(lat, lon, target_lat, target_lon):
    return GEOD.inv(lon, lat, target_lon, target_lat)[2]


def required_battery(drone, target_lat, target_lon):
    trip = distance(drone.latitude, drone.longitude, target_lat, target_lon)
    back = distance(target_lat, target_lon, drone.home_latitude, drone.home_longitude)
    return (trip / drone.speed_mps + back / drone.speed_mps + 60) * BATTERY_PER_SECOND + RESERVE


def telemetry(drone, mission, speed):
    return {"drone_id": drone.id, "mission_id": mission.id, "latitude": drone.latitude,
            "longitude": drone.longitude, "altitude_m": drone.altitude_m,
            "speed_mps": drone.speed_mps if mission.status in ("en_route", "returning") else 0,
            "battery_pct": drone.battery_pct, "payload_l": drone.payload_l,
            "status": mission.status, "distance_m": mission.distance_m, "eta_s": mission.eta_s,
            "scan_elapsed_s": mission.scan_elapsed_s,
            "simulation_speed": speed, "simulation_elapsed_s": mission.simulation_elapsed_s}
