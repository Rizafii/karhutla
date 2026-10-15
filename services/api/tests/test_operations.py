from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import time
import pytest
from app.models import Drone, DemoState, Incident
from app.simulator import tick
from app.domain import distance, move, required_battery
from app.config import settings


def candidate(client):
    assert client.post('/api/demo/scenarios/forest-sector-b/start', json={'mode':'manual_simulation'}).status_code == 200
    return client.post('/api/demo/manual-event', json={}).json()


def confirmed(client):
    incident = candidate(client)
    assert client.post(f"/api/incidents/{incident['id']}/confirm", json={'notes':'Evidence reviewed by test operator'}).status_code == 200
    assert client.patch(f"/api/incidents/{incident['id']}", json={'latitude':-2.302,'longitude':113.900}).status_code == 200
    return incident


def create_mission(client):
    incident = confirmed(client)
    response = client.post('/api/missions',json={'incident_id':incident['id'],'mission_type':'suppression_simulation'})
    assert response.status_code == 200, response.text
    return incident, response.json()


def mission_tick(client, seconds=1):
    with client.db_session.begin() as db:
        db.get(DemoState,1).paused=False
    tick(seconds)


def test_seed_and_bootstrap(client):
    data=client.get('/api/bootstrap').json()
    assert len(data['cameras'])==3 and len(data['response_units'])==2 and len(data['drones'])==1
    assert data['incidents']==[]


def test_manual_provenance_and_duplicate_suppression(client):
    first=candidate(client)
    second=client.post('/api/demo/manual-event',json={}).json()
    assert first['id']==second['id']
    assert first['provenance']=='manual_simulation' and first['evidence_path'] is None
    assert len(client.get('/api/incidents').json())==1


def test_ai_start_never_fakes_detection(client):
    response=client.post('/api/demo/scenarios/forest-sector-b/start',json={'mode':'ai'})
    assert response.status_code==409
    assert client.get('/api/incidents').json()==[]


def test_confirm_reject_and_close(client):
    incident=candidate(client)
    path=f"/api/incidents/{incident['id']}"
    rejected=client.post(path+'/reject',json={'notes':'Cloud'}).json()
    assert rejected['status']=='false_alarm' and rejected['verified_at']
    assert client.post(path+'/confirm',json={}).status_code==409
    assert client.post(path+'/close',json={}).json()['status']=='closed'


@pytest.mark.parametrize('action',['resolve','close'])
def test_invalid_incident_transition(client,action):
    incident=candidate(client)
    assert client.post(f"/api/incidents/{incident['id']}/{action}",json={}).status_code==409


def test_unconfirmed_cannot_dispatch_or_propose(client):
    incident=candidate(client)
    assert client.post(f"/api/incidents/{incident['id']}/dispatch",json={'unit_id':'TEAM-01'}).status_code==409
    assert client.post('/api/missions',json={'incident_id':incident['id']}).status_code==409


def test_coordinates_required_and_pair_validation(client):
    incident=candidate(client)
    path=f"/api/incidents/{incident['id']}"
    client.post(path+'/confirm',json={})
    assert incident['latitude'] is not None and incident['location_source']=='camera_bearing_estimate'
    with client.db_session.begin() as db:
        item=db.get(Incident,incident['id'])
        item.latitude=item.longitude=None
    assert client.post('/api/missions',json={'incident_id':incident['id']}).status_code==409
    assert client.patch(path,json={'latitude':-2.3}).status_code==422
    assert client.patch(path,json={'latitude':91,'longitude':113}).status_code==422


def test_launch_requires_approval(client):
    _,mission=create_mission(client)
    path=f"/api/missions/{mission['id']}"
    assert client.post(path+'/launch').status_code==409
    assert client.post(path+'/approve').json()['status']=='approved'
    assert client.post(path+'/launch').json()['status']=='en_route'


def test_concurrent_drone_reservation(client):
    incident=confirmed(client)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results=list(pool.map(lambda _:client.post('/api/missions',json={'incident_id':incident['id']}),range(4)))
    assert sorted(r.status_code for r in results)==[200,409,409,409]


def test_battery_reserve_rejection(client):
    incident=confirmed(client)
    with client.db_session.begin() as db:
        db.get(Drone,'DRONE-01').battery_pct=10
    response=client.post('/api/missions',json={'incident_id':incident['id']})
    assert response.status_code==409 and 'Baterai' in response.json()['detail']


def test_geographic_movement_and_arrival():
    before=distance(-2.31,113.9,-2.302,113.9)
    lat,lon,remaining,arrived=move(-2.31,113.9,-2.302,113.9,12,8)
    assert 0<remaining<before and lat>-2.31 and not arrived
    assert abs((before-remaining)-96)<.01
    assert move(lat,lon,-2.302,113.9,12,1000)[3] is True


def test_full_mission_payload_return_report(client):
    incident,mission=create_mission(client)
    path=f"/api/missions/{mission['id']}"
    client.post(path+'/approve'); client.post(path+'/launch')
    initial=client.get('/api/drones/DRONE-01').json()['battery_pct']
    for _ in range(11): mission_tick(client)
    assert client.get(path).json()['status']=='on_site'
    assert client.get('/api/drones/DRONE-01').json()['battery_pct']<initial
    payload={'liters':5,'command_id':'test-release-command'}
    assert client.post(path+'/release-payload',json=payload).status_code==200
    assert client.post(path+'/release-payload',json=payload).status_code==200
    assert client.get('/api/drones/DRONE-01').json()['payload_l']==0
    assert client.get(f"/api/incidents/{incident['id']}").json()['status']=='in_progress'
    client.post(path+'/return')
    for _ in range(11): mission_tick(client)
    assert client.get(path).json()['status']=='completed'
    drone=client.get('/api/drones/DRONE-01').json()
    assert drone['status']=='available' and drone['mission_id'] is None
    assert drone['latitude']==drone['home_latitude']
    assert client.post(f"/api/incidents/{incident['id']}/resolve",json={'notes':'Operator resolution'}).status_code==200
    report=client.get(f"/api/incidents/{incident['id']}/report").json()
    assert report['intervals']['detection_to_verification_s']>=0
    assert report['missions'][0]['travel_wall_seconds']>=0
    assert any(e['type']=='mission.payload_released' for e in report['timeline'])


@pytest.mark.parametrize('airborne',[False,True])
def test_abort_releases_only_at_base(client,airborne):
    _,mission=create_mission(client)
    path=f"/api/missions/{mission['id']}"
    if airborne:
        client.post(path+'/approve');client.post(path+'/launch');mission_tick(client)
    response=client.post(path+'/abort').json()
    assert response['status']==('returning' if airborne else 'cancelled')
    if airborne:
        assert client.get('/api/drones/DRONE-01').json()['mission_id']==mission['id']
        for _ in range(3):mission_tick(client)
        assert client.get(path).json()['status']=='aborted'
    assert client.get('/api/drones/DRONE-01').json()['status']=='available'


def test_dispatch_lifecycle_and_reset_foreign_keys(client):
    incident=confirmed(client)
    dispatch=client.post(f"/api/incidents/{incident['id']}/dispatch",json={'unit_id':'TEAM-01'}).json()
    path=f"/api/dispatches/{dispatch['id']}/update-status"
    assert client.post(path,json={'status':'on_site'}).status_code==409
    assert client.post(path,json={'status':'accepted'}).status_code==200
    assert client.post(path,json={'status':'responding'}).status_code==200
    assert client.post('/api/demo/reset').status_code==200
    assert client.get('/api/incidents').json()==[]
    assert all(u['availability']=='available' for u in client.get('/api/response-units').json())


def test_pause_and_speed_consistency(client):
    _,mission=create_mission(client)
    path=f"/api/missions/{mission['id']}"
    client.post(path+'/approve');client.post(path+'/launch')
    client.post('/api/demo/control',json={'paused':True})
    before=client.get('/api/drones/DRONE-01').json()
    tick(1)
    assert client.get('/api/drones/DRONE-01').json()==before
    client.post('/api/demo/control',json={'paused':False,'speed':1})
    tick(1)
    battery1=client.get('/api/drones/DRONE-01').json()['battery_pct']
    client.post('/api/demo/control',json={'speed':8})
    tick(1)
    battery8=client.get('/api/drones/DRONE-01').json()['battery_pct']
    assert abs((battery1-battery8)/(before['battery_pct']-battery1)-8)<.001


def test_service_token_evidence_validation_and_stale_epoch(client):
    assert client.get('/internal/vision/config').status_code==401
    headers={'X-Service-Token':settings.service_token}
    epoch=client.get('/internal/vision/config',headers=headers).json()['demo']['epoch']
    (settings.data_dir/'evidence/test.jpg').write_bytes(b'test-image')
    payload={'id':'DET-test-ai-0001','camera_id':'CAM-002','category':'smoke','confidence':.85,'bbox':[0,0,20,20],
        'captured_at':datetime.now(timezone.utc).isoformat(),'evidence_path':'evidence/test.jpg','model_version':'test-adapter','demo_epoch':epoch}
    response=client.post('/internal/detections',json=payload,headers=headers)
    assert response.status_code==200 and response.json()['provenance']=='ai'
    assert client.post('/internal/detections',json=payload,headers=headers).json()['id']==response.json()['id']
    client.post('/api/demo/reset')
    (settings.data_dir/'evidence/test.jpg').write_bytes(b'test-image')
    payload['id']='DET-test-ai-0002'
    assert client.post('/internal/detections',json=payload,headers=headers).status_code==409


def test_websocket_incident_and_telemetry(client):
    with client.websocket_connect('/ws/events') as socket:
        assert socket.receive_json()['type']=='system.connected'
        incident=candidate(client)
        found=False
        for _ in range(5):
            event=socket.receive_json()
            if event['type']=='incident.created':
                assert event['data']['incident_id']==incident['id'] and event['event_id'];found=True;break
        assert found
        client.post(f"/api/incidents/{incident['id']}/confirm",json={})
        client.patch(f"/api/incidents/{incident['id']}",json={'latitude':-2.302,'longitude':113.9})
        mission=client.post('/api/missions',json={'incident_id':incident['id']}).json()
        client.post(f"/api/missions/{mission['id']}/approve");client.post(f"/api/missions/{mission['id']}/launch")
        mission_tick(client)
        for _ in range(20):
            event=socket.receive_json()
            if event['type']=='drone.telemetry':
                assert event['data']['mission_id']==mission['id'];return
        pytest.fail('Telemetry event missing')


def test_external_origin_rejected(client):
    assert client.post('/api/demo/reset',headers={'Origin':'https://external.example'}).status_code==403


def test_demo_endpoints_disabled(client,monkeypatch):
    monkeypatch.setattr(settings,'demo_mode',False)
    assert client.post('/api/demo/manual-event',json={}).status_code==404
    assert client.post('/api/demo/reset').status_code==404
