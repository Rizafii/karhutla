from concurrent.futures import ThreadPoolExecutor
from app.models import Drone, DemoState
from app.domain import estimate_camera_location, distance
from app.simulator import tick


def candidate(client):
    client.post('/api/demo/scenarios/forest-sector-b/start', json={'mode': 'manual_simulation'})
    return client.post('/api/demo/manual-event', json={}).json()


def advance(client):
    with client.db_session.begin() as session:
        session.get(DemoState, 1).paused = False
    tick(1)


def test_camera_bearing_estimate_stays_explicitly_uncertain(client):
    incident = candidate(client)
    assert incident['latitude'] is not None and incident['longitude'] is not None
    assert incident['location_estimated'] is True
    assert incident['location_source'] == 'camera_bearing_estimate'
    assert incident['location_uncertainty_m'] >= 200
    from types import SimpleNamespace
    camera = SimpleNamespace(latitude=-2.3, longitude=113.9, heading=0, fov=70, range_m=1500)
    left = estimate_camera_location(camera, [0, 0, 100, 200], 1000)
    right = estimate_camera_location(camera, [900, 0, 1000, 200], 1000)
    assert left[1] < camera.longitude < right[1]
    assert abs(distance(camera.latitude, camera.longitude, left[0], left[1]) - 900) < .01


def test_operator_authorizes_once_no_firefighter_action_required(client):
    incident = candidate(client)
    path = f"/api/incidents/{incident['id']}/respond"
    with ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(lambda _: client.post(path, json={}), range(3)))
    assert all(r.status_code == 200 for r in results)
    assert len({r.json()['id'] for r in results}) == 1
    mission = results[0].json()
    assert mission['automatic'] and mission['status'] == 'en_route'
    assert client.get('/api/bootstrap').json()['dispatches'] == []
    assert client.get(f"/api/incidents/{incident['id']}").json()['verified_at']


def test_automatic_recon_refines_virtual_location_and_returns(client):
    incident = candidate(client)
    mission = client.post(f"/api/incidents/{incident['id']}/respond", json={}).json()
    for _ in range(120):
        advance(client)
        current = client.get(f"/api/missions/{mission['id']}").json()
        if current['status'] == 'completed':
            break
    assert current['status'] == 'completed' and current['location_refined_at']
    detail = client.get(f"/api/incidents/{incident['id']}").json()
    assert detail['status'] == 'in_progress'  # Survey never resolves a fire.
    assert detail['location_source'] == 'drone_simulation' and detail['location_estimated']
    events = [e for e in detail['timeline'] if e['type'] == 'incident.location_refined']
    assert len(events) == 1 and events[0]['data']['simulated']
    drone = client.get('/api/drones/DRONE-01').json()
    assert drone['status'] == 'available' and drone['payload_l'] == 5


def test_busy_drone_rolls_back_operator_verification(client):
    incident = candidate(client)
    with client.db_session.begin() as session:
        session.get(Drone, 'DRONE-01').battery_pct = 1
    response = client.post(f"/api/incidents/{incident['id']}/respond", json={})
    assert response.status_code == 409
    assert client.get(f"/api/incidents/{incident['id']}").json()['status'] == 'pending_review'


def test_automatic_abort_and_operator_location_override(client):
    incident = candidate(client)
    path = f"/api/incidents/{incident['id']}"
    client.patch(path, json={'latitude': -2.302, 'longitude': 113.900})
    mission = client.post(path+'/respond', json={}).json()
    for _ in range(30):
        advance(client)
        current = client.get(f"/api/missions/{mission['id']}").json()
        if current['location_refined_at']:
            break
    detail = client.get(path).json()
    assert detail['latitude'] == -2.302 and detail['location_source'] == 'operator_estimate'
    client.post(f"/api/missions/{mission['id']}/abort")
    for _ in range(30):
        advance(client)
        current = client.get(f"/api/missions/{mission['id']}").json()
        if current['status'] == 'aborted':
            break
    assert current['status'] == 'aborted'
