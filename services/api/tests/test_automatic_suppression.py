from app.models import DemoState
from app.simulator import tick


def test_operator_authorized_automatic_payload_never_resolves_incident(client):
    client.post('/api/demo/scenarios/forest-sector-b/start', json={'mode': 'manual_simulation'})
    incident = client.post('/api/demo/manual-event', json={}).json()
    mission = client.post(f"/api/incidents/{incident['id']}/respond", json={'mission_type': 'suppression_simulation'}).json()
    with client.db_session.begin() as session:
        session.get(DemoState, 1).paused = False
    for _ in range(120):
        tick(1)
        current = client.get(f"/api/missions/{mission['id']}").json()
        if current['status'] == 'completed':
            break
    assert current['status'] == 'completed'
    assert client.get('/api/drones/DRONE-01').json()['payload_l'] == 0
    detail = client.get(f"/api/incidents/{incident['id']}").json()
    assert detail['status'] == 'in_progress'
    assert len([event for event in detail['timeline'] if event['type'] == 'mission.payload_released']) == 1
