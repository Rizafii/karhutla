"""Repeatable real-service smoke test. Clears DEMO data explicitly; never fakes AI mode."""
import argparse
import asyncio
import json
import time
import urllib.request
from pathlib import Path
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed


async def run(api, ai, output, automatic=False):
    started = time.monotonic()
    events = []
    def request(path, payload=None, method=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(api+path, data=body, method=method, headers={'Content-Type':'application/json'})
        with urllib.request.urlopen(req, timeout=15) as response:
            return json.load(response)
    request('/health')
    request('/api/demo/reset', {})
    await asyncio.sleep(1)
    if ai:
        # Reset invalidates the previous worker heartbeat/epoch. Wait for the
        # new capture/model readiness instead of racing the worker restart.
        deadline=time.monotonic()+45
        while time.monotonic()<deadline:
            state=request('/api/bootstrap')
            if state['worker_fresh'] and state['demo']['worker'].get('model_ready') and state['demo']['worker'].get('footage_ready'):
                break
            await asyncio.sleep(1)
        else:
            raise AssertionError('Vision worker did not become ready after reset')
    ws_url = api.replace('http://','ws://').replace('https://','wss://')+'/ws/events'
    async with connect(ws_url) as socket:
        await socket.recv()
        async def collect():
            try:
                async for message in socket:
                    events.append(json.loads(message))
            except ConnectionClosed:
                return
        receiver=asyncio.create_task(collect())
        request('/api/demo/scenarios/forest-sector-b/start', {'mode':'ai' if ai else 'manual_simulation'})
        if not ai:
            request('/api/demo/manual-event', {})
        deadline=time.monotonic()+100
        incident=None
        while time.monotonic()<deadline:
            candidates=request('/api/incidents')
            if candidates:
                incident=candidates[0];break
            await asyncio.sleep(.5)
        assert incident, 'No validated AI candidate within 100 seconds; do not substitute manual events.'
        assert incident['provenance']==('ai' if ai else 'manual_simulation')
        if ai:
            assert incident['evidence_path']
            with urllib.request.urlopen(api+'/api/evidence/'+incident['evidence_path'].removeprefix('evidence/')) as image:
                jpeg=image.read()
                assert jpeg[:2]==b'\xff\xd8', 'Evidence must be an actual JPEG snapshot'
                archive=Path(output).with_suffix('.jpg')
                archive.parent.mkdir(parents=True,exist_ok=True)
                archive.write_bytes(jpeg)
        incident_path=f"/api/incidents/{incident['id']}"
        if automatic:
            assert incident['location_source']=='camera_bearing_estimate' and incident['latitude'] is not None
            mission=request(incident_path+'/respond',{'notes':'QA operator explicitly authorizes automatic virtual reconnaissance','mission_type':'reconnaissance'})
            assert mission['automatic'] and mission['status']=='en_route'
        else:
            request(incident_path+'/confirm',{'notes':'Automated smoke-test operator verification'})
            request(incident_path,{'latitude':-2.299,'longitude':113.9},'PATCH')
        dispatch=request(incident_path+'/dispatch',{'unit_id':'TEAM-01'})
        dispatch_path=f"/api/dispatches/{dispatch['id']}/update-status"
        if not automatic:
            request(dispatch_path,{'status':'accepted'});request(dispatch_path,{'status':'responding'})
            mission=request('/api/missions',{'incident_id':incident['id'],'mission_type':'suppression_simulation'})
        path=f"/api/missions/{mission['id']}"
        if not automatic:
            request(path+'/approve',{});request(path+'/launch',{})
        initial=request('/api/drones/DRONE-01')
        async def wait_for(target):
            deadline=time.monotonic()+60
            while time.monotonic()<deadline:
                item=request(path)
                if item['status']==target:return item
                assert item['status'] not in ('failed','aborted'),item
                await asyncio.sleep(.5)
            raise AssertionError(f'Mission did not reach {target}')
        await wait_for('on_site')
        current=request('/api/drones/DRONE-01')
        assert current['latitude']!=initial['latitude'] and current['battery_pct']<initial['battery_pct']
        if not automatic:
            request(path+'/release-payload',{'liters':5,'command_id':'smoke-'+mission['id']})
        assert request(incident_path)['status']=='in_progress', 'Payload must not resolve incident'
        if not automatic:
            request(path+'/return',{})
        await wait_for('completed')
        if automatic:
            assert request(incident_path)['location_source']=='drone_simulation'
            assert request('/api/bootstrap')['dispatches'][0]['status']=='assigned', 'Drone must not wait for firefighter acknowledgement'
            request(dispatch_path,{'status':'accepted'});request(dispatch_path,{'status':'responding'})
        if request('/api/bootstrap')['dispatches'][0]['status']=='responding':request(dispatch_path,{'status':'on_site'})
        request(dispatch_path,{'status':'completed'})
        request(incident_path+'/resolve',{'notes':'Explicit simulated operator resolution'})
        request(incident_path+'/close',{})
        await asyncio.sleep(1)
        report=request(incident_path+'/report')
        assert report['status']=='closed' and report['missions'][0]['completed_at']
        assert any(e['type']=='incident.created' for e in events)
        telemetry=[e for e in events if e['type']=='drone.telemetry']
        assert len(telemetry)>=3 and len({e['data']['latitude'] for e in telemetry})>1
        if automatic:
            assert any(e['type']=='incident.location_refined' and e['data']['simulated'] for e in events)
        report['smoke_test']={'mode':'real_ai' if ai else 'manual_simulation','automatic_recon':automatic,'elapsed_wall_s':time.monotonic()-started,'websocket_telemetry_received':len(telemetry),'assertions':'passed'}
        Path(output).parent.mkdir(parents=True,exist_ok=True)
        Path(output).write_text(json.dumps(report,indent=2),encoding='utf8')
        print(json.dumps(report['smoke_test'],indent=2))
        receiver.cancel()
        await asyncio.gather(receiver,return_exceptions=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--api',default='http://backend:8000');parser.add_argument('--ai',action='store_true');parser.add_argument('--automatic',action='store_true');parser.add_argument('--output',default='/data/smoke-test-report.json');args=parser.parse_args()
    asyncio.run(run(args.api,args.ai,args.output,args.automatic))
