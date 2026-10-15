import asyncio
import contextlib
import hmac
import logging
from contextlib import asynccontextmanager, contextmanager
from datetime import timezone
from pathlib import Path
from fastapi import FastAPI, HTTPException, Header, Depends, WebSocket, WebSocketDisconnect, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse
from sqlalchemy import select, delete, text, update
from .db import Session, engine
from .config import settings
from .models import Camera, Incident, Detection, ResponseUnit, Dispatch, Drone, Mission, Activity, DemoState, now, identifier
from .schemas import Note, IncidentEdit, Assign, DispatchStatus, MissionCreate, Payload, CameraEdit, DetectionInput, Heartbeat, ScenarioStart, DemoControl, ManualEvent, AutomaticResponse
from .service import require, check, serialize, log, ingest, incident_state, assign, propose, mission_action, respond_automatically
from .domain import ACTIVE_INCIDENTS, FLYING
from .simulator import simulator
from .responses import BootstrapResponse, CameraResponse, IncidentResponse, IncidentDetailsResponse, DetectionResponse, DroneResponse, MissionResponse, UnitResponse, DispatchResponse, ReportResponse, EventResponse, DemoResponse

FOOTAGE_DIR = Path("/videos")
clients: set[WebSocket] = set()
logger = logging.getLogger(__name__)


@contextmanager
def writing_session():
    """Serialize short state mutations through the singleton runtime row; reads remain concurrent."""
    with Session.begin() as session:
        session.scalar(select(DemoState).where(DemoState.id == 1).with_for_update())
        yield session


def envelope(row):
    return {"event_id": row.id, "type": row.type, "timestamp": row.timestamp, "sequence": row.sequence, "data": row.data}


def pull_events():
    with Session.begin() as session:
        rows = session.scalars(select(Activity).where(Activity.published == False).order_by(Activity.sequence).limit(200).with_for_update(skip_locked=True)).all()
        events = [jsonable_encoder(envelope(row)) for row in rows]
        for row in rows:
            row.published = True
        return events


async def publish():
    while True:
        await asyncio.sleep(.25)
        try:
            pending = await asyncio.to_thread(pull_events)
        except Exception:
            logger.exception("Event publication failed; retrying")
            continue
        for event in pending:
            for socket in tuple(clients):
                try:
                    await asyncio.wait_for(socket.send_json(event), timeout=2)
                except Exception:
                    clients.discard(socket)


@asynccontextmanager
async def lifespan(app):
    leadership = engine.connect()
    if not leadership.scalar(text("select pg_try_advisory_lock(7412026)")):
        leadership.close()
        raise RuntimeError("Another backend owns the simulator. Run exactly one backend process.")
    with Session.begin() as session:
        if session.scalar(select(Mission).where(Mission.status.in_(FLYING))):
            session.get(DemoState, 1).paused = True
        session.execute(update(Activity).values(published=True))
    tasks = [asyncio.create_task(simulator()), asyncio.create_task(publish())]
    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        try:
            leadership.execute(text("select pg_advisory_unlock(7412026)"))
            leadership.commit()
        finally:
            leadership.close()


app = FastAPI(title="KARHUTLA.AI", version="1.0.0", lifespan=lifespan,
              description="Local operator command center. Drone and team movement are virtual. AI and manual simulation provenance are explicit.")
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "backend", "testserver"])
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"], allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type"])


@app.middleware("http")
async def local_origin(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("origin") not in (None, "http://localhost:3000", "http://127.0.0.1:3000"):
        return JSONResponse({"detail": "Origin tidak diizinkan untuk tindakan operasional"}, status_code=403)
    return await call_next(request)


def internal(x_service_token: str = Header(default="")):
    if not hmac.compare_digest(x_service_token, settings.service_token):
        raise HTTPException(401, "Service token tidak valid")


def demo_only():
    if not settings.demo_mode:
        raise HTTPException(404, "Demo mode nonaktif")


def rows(session, cls):
    return [serialize(item) for item in session.scalars(select(cls).order_by(cls.id)).all()]


@app.get("/health")
def health():
    with Session() as session:
        session.execute(text("select 1"))
    return {"status": "ok", "access": "localhost_only", "demo_mode": settings.demo_mode}


@app.get("/api/bootstrap", response_model=BootstrapResponse)
def bootstrap():
    with Session.begin() as session:
        session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
        state = session.get(DemoState, 1)
        activities = session.scalars(select(Activity).where(Activity.type.notin_(["drone.telemetry", "dispatch.telemetry"])).order_by(Activity.sequence.desc()).limit(60)).all()
        return {"cameras": rows(session, Camera), "incidents": rows(session, Incident), "response_units": rows(session, ResponseUnit),
                "dispatches": rows(session, Dispatch), "drones": rows(session, Drone), "missions": rows(session, Mission),
                "activities": [envelope(row) for row in activities], "demo": serialize(state), "demo_enabled": settings.demo_mode,
                "worker_fresh": state.worker_at is not None and (now() - state.worker_at).total_seconds() < 15}


@app.get("/api/cameras", response_model=list[CameraResponse])
def cameras():
    with Session() as session:
        return rows(session, Camera)


@app.get("/api/cameras/{id}", response_model=CameraResponse)
def camera(id: str):
    with Session() as session:
        return serialize(require(session, Camera, id, False))


@app.patch("/api/cameras/{id}", response_model=CameraResponse)
def edit_camera(id: str, request: CameraEdit):
    config = request.source_config
    if request.source_type == "mp4":
        for value in config.values():
            if not str(value).startswith("/videos/") or ".." in Path(str(value)).parts:
                raise HTTPException(422, "MP4 harus berada di direktori /videos")
    elif request.source_type == "rtsp" and not str(config.get("url", "")).startswith("rtsp://"):
        raise HTTPException(422, "RTSP URL wajib dimulai rtsp://")
    elif request.source_type == "webcam" and not isinstance(config.get("index"), int):
        raise HTTPException(422, "Webcam memerlukan index integer")
    with writing_session() as session:
        item = require(session, Camera, id)
        for key, value in request.model_dump().items():
            setattr(item, key, value)
        session.get(DemoState, 1).epoch += 1
        log(session, "camera.updated", {"camera_id": id})
        return serialize(item)


@app.get("/api/cameras/{id}/detections", response_model=list[DetectionResponse])
def detections(id: str):
    with Session() as session:
        require(session, Camera, id, False)
        return [serialize(d) for d in session.scalars(select(Detection).where(Detection.camera_id == id).order_by(Detection.captured_at.desc()).limit(100))]


@app.get("/api/cameras/{id}/stream.mjpg")
async def stream(id: str, annotated: bool = False):
    metadata = await asyncio.to_thread(camera, id)
    root = (settings.data_dir / "frames").resolve()
    path = (root / f"{id}{'-ai' if annotated else ''}.jpg").resolve()
    if not path.is_relative_to(root):
        raise HTTPException(404, "Kamera tidak ditemukan")
    if metadata["connection_status"] not in ("connected", "paused"):
        raise HTTPException(503, "Capture belum terhubung; frame lama tidak disajikan")
    if not path.exists():
        raise HTTPException(503, "Frame belum tersedia; periksa sumber kamera")
    async def frames():
        while True:
            try:
                data = await asyncio.to_thread(path.read_bytes)
                yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(data)).encode() + b"\r\n\r\n" + data + b"\r\n"
            except FileNotFoundError:
                pass
            await asyncio.sleep(.2 if not annotated else 1)
    return StreamingResponse(frames(), media_type="multipart/x-mixed-replace; boundary=frame", headers={"Cache-Control": "no-store"})


@app.get("/api/evidence/{path:path}")
def evidence(path: str):
    root = (settings.data_dir / "evidence").resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(404, "Evidence tidak ditemukan")
    return FileResponse(target)


@app.get("/api/incidents", response_model=list[IncidentResponse])
def incidents():
    with Session() as session:
        return [serialize(i) for i in session.scalars(select(Incident).order_by(Incident.created_at.desc()))]


def details(session, id):
    item = require(session, Incident, id, False)
    return {**serialize(item), "detections": [serialize(d) for d in session.scalars(select(Detection).where(Detection.incident_id == id))],
        "dispatches": [serialize(d) for d in session.scalars(select(Dispatch).where(Dispatch.incident_id == id))],
        "missions": [serialize(m) for m in session.scalars(select(Mission).where(Mission.incident_id == id))],
        "timeline": [envelope(a) for a in session.scalars(select(Activity).where(Activity.incident_id == id, Activity.type.notin_(["drone.telemetry", "dispatch.telemetry"])).order_by(Activity.sequence))]}


@app.get("/api/incidents/{id}", response_model=IncidentDetailsResponse)
def incident(id: str):
    with Session() as session:
        return details(session, id)


@app.patch("/api/incidents/{id}", response_model=IncidentResponse)
def edit_incident(id: str, request: IncidentEdit):
    with writing_session() as session:
        item = require(session, Incident, id)
        check(item.status in ACTIVE_INCIDENTS, "Insiden sudah tidak aktif")
        if "notes" in request.model_fields_set:
            item.notes = request.notes
        if request.latitude is not None:
            item.latitude, item.longitude = request.latitude, request.longitude
            item.location_source, item.location_uncertainty_m = "operator_estimate", None
        log(session, "incident.updated", {"incident_id": id, "latitude": item.latitude, "longitude": item.longitude, "location_estimated": True}, id)
        return serialize(item)


@app.post("/api/incidents/{id}/confirm", response_model=IncidentResponse)
def confirm(id: str, request: Note):
    with writing_session() as session:
        item = require(session, Incident, id)
        check(item.status == "pending_review", "Hanya kandidat pending review yang dapat dikonfirmasi")
        item.verified_at = now()
        incident_state(session, item, "confirmed", request.notes)
        return serialize(item)


@app.post("/api/incidents/{id}/reject", response_model=IncidentResponse)
def reject(id: str, request: Note):
    with writing_session() as session:
        item = require(session, Incident, id)
        check(item.status == "pending_review", "Hanya kandidat pending review yang dapat ditolak")
        item.verified_at = now()
        incident_state(session, item, "false_alarm", request.notes)
        return serialize(item)


@app.post("/api/incidents/{id}/respond", response_model=MissionResponse)
def automatic_response(id: str, request: AutomaticResponse):
    with writing_session() as session:
        return serialize(respond_automatically(session, id, request))


@app.post("/api/incidents/{id}/dispatch", response_model=DispatchResponse)
def dispatch(id: str, request: Assign):
    with writing_session() as session:
        return serialize(assign(session, id, request.unit_id))


@app.post("/api/incidents/{id}/resolve", response_model=IncidentResponse)
def resolve(id: str, request: Note):
    with writing_session() as session:
        item = require(session, Incident, id)
        check(item.status == "in_progress", "Resolusi hanya berlaku untuk insiden in progress")
        item.resolved_at = now()
        incident_state(session, item, "resolved", request.notes)
        if item.demo_epoch is not None:
            state = session.get(DemoState, 1)
            state.status = "completed"
            state.epoch += 1
        return serialize(item)


@app.post("/api/incidents/{id}/close", response_model=IncidentResponse)
def close(id: str, request: Note):
    with writing_session() as session:
        item = require(session, Incident, id)
        check(item.status in ("resolved", "false_alarm"), "Selesaikan atau tolak insiden sebelum penutupan")
        incident_state(session, item, "closed", request.notes)
        return serialize(item)


@app.get("/api/incidents/{id}/report", response_model=ReportResponse)
def report(id: str):
    with Session() as session:
        result = details(session, id)
        verified = result["verified_at"]
        result["intervals"] = {"detection_to_verification_s": (verified - result["created_at"]).total_seconds() if verified else None}
        for mission in result["missions"]:
            mission["travel_wall_seconds"] = (mission["arrived_at"] - mission["launched_at"]).total_seconds() if mission["arrived_at"] and mission["launched_at"] else None
            mission["mission_wall_seconds"] = (mission["completed_at"] - mission["launched_at"]).total_seconds() if mission["completed_at"] and mission["launched_at"] else None
        result["disclaimer"] = "Lokasi perkiraan. Drone, payload, dan gerakan regu adalah simulasi. Interval aktual dihitung dari timestamp tersimpan."
        return result


@app.get("/api/response-units", response_model=list[UnitResponse])
def units():
    with Session() as session:
        return rows(session, ResponseUnit)


@app.post("/api/dispatches/{id}/update-status", response_model=DispatchResponse)
def update_dispatch(id: str, request: DispatchStatus):
    with writing_session() as session:
        item = require(session, Dispatch, id)
        expected = {"assigned": "accepted", "accepted": "responding", "responding": "on_site", "on_site": "completed"}
        check(expected.get(item.status) == request.status, "Urutan dispatch: assigned → accepted → responding → on_site → completed")
        unit = require(session, ResponseUnit, item.unit_id)
        item.status = unit.response_status = request.status
        if request.status == "responding":
            incident = require(session, Incident, item.incident_id)
            check(incident.latitude is not None, "Tentukan lokasi perkiraan untuk simulasi pergerakan")
            if incident.status == "dispatched":
                incident_state(session, incident, "in_progress")
        if request.status == "completed":
            unit.availability, unit.assigned_incident, unit.response_status = "available", None, "standby"
            unit.latitude, unit.longitude = unit.home_latitude, unit.home_longitude
        log(session, "dispatch.updated", {"dispatch_id": id, "unit_id": unit.id, "status": request.status, "simulated": True}, item.incident_id)
        return serialize(item)


@app.get("/api/drones", response_model=list[DroneResponse])
def drones():
    with Session() as session:
        return rows(session, Drone)


@app.get("/api/drones/{id}", response_model=DroneResponse)
def drone(id: str):
    with Session() as session:
        return serialize(require(session, Drone, id, False))


@app.get("/api/missions", response_model=list[MissionResponse])
def missions():
    with Session() as session:
        return rows(session, Mission)


@app.get("/api/missions/{id}", response_model=MissionResponse)
def mission(id: str):
    with Session() as session:
        return serialize(require(session, Mission, id, False))


@app.post("/api/missions", response_model=MissionResponse)
def create_mission(request: MissionCreate):
    with writing_session() as session:
        return serialize(propose(session, request))


def command(id, action, payload=None):
    with writing_session() as session:
        return serialize(mission_action(session, id, action, payload))


@app.post("/api/missions/{id}/approve", response_model=MissionResponse)
def approve(id: str):
    return command(id, "approve")


@app.post("/api/missions/{id}/launch", response_model=MissionResponse)
def launch(id: str):
    return command(id, "launch")


@app.post("/api/missions/{id}/abort", response_model=MissionResponse)
def abort(id: str):
    return command(id, "abort")


@app.post("/api/missions/{id}/return", response_model=MissionResponse)
def return_home(id: str):
    return command(id, "return")


@app.post("/api/missions/{id}/release-payload", response_model=MissionResponse)
def release(id: str, payload: Payload):
    return command(id, "release-payload", payload)


@app.get("/api/activities", response_model=list[EventResponse])
def activities():
    with Session() as session:
        return [envelope(a) for a in session.scalars(select(Activity).where(Activity.type.notin_(["drone.telemetry", "dispatch.telemetry"])).order_by(Activity.sequence.desc()).limit(300))]


@app.get("/api/footage/{clip}")
def drone_footage(clip: str):
    if clip not in {"drone-approach", "drone-fire", "payload-drop", "forest"}:
        raise HTTPException(404, "Footage tidak ditemukan")
    path = FOOTAGE_DIR / f"{clip}.mp4"
    if not path.is_file():
        raise HTTPException(404, "Footage belum disiapkan. Jalankan persiapan aset.")
    return FileResponse(path, media_type="video/mp4", headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/demo/scenarios", dependencies=[Depends(demo_only)])
def scenarios():
    return [{"id": "forest-sector-b", "name": "Forest Sector B — Early Smoke Detection", "camera_id": "CAM-002"}]


@app.post("/api/demo/scenarios/{id}/start", dependencies=[Depends(demo_only)])
def start(id: str, request: ScenarioStart):
    if id != "forest-sector-b":
        raise HTTPException(404, "Skenario tidak ditemukan")
    with writing_session() as session:
        state = require(session, DemoState, 1)
        check(state.status == "idle", "Reset skenario sebelum memulai ulang")
        if request.mode == "ai":
            check(state.worker_at is not None and (now()-state.worker_at).total_seconds() < 15 and state.worker.get("model_ready") and state.worker.get("footage_ready"), "AI atau footage belum siap. Periksa status worker atau gunakan mode manual berlabel simulasi.")
        state.epoch += 1
        state.status, state.mode, state.paused = "running", request.mode, False
        log(session, "demo.started", {"epoch": state.epoch, "mode": request.mode})
        return serialize(state)


@app.post("/api/demo/control", dependencies=[Depends(demo_only)])
def control(request: DemoControl):
    with writing_session() as session:
        state = require(session, DemoState, 1)
        if request.paused is not None:
            state.paused = request.paused
        if request.speed is not None:
            state.speed = request.speed
        log(session, "demo.updated", {"paused": state.paused, "speed": state.speed})
        return serialize(state)


@app.post("/api/demo/replay", dependencies=[Depends(demo_only)])
def replay(request: ScenarioStart):
    if request.mode == "ai":
        with Session() as session:
            state = session.get(DemoState, 1)
            check(state.worker_at is not None and (now()-state.worker_at).total_seconds() < 15 and state.worker.get("model_ready") and state.worker.get("footage_ready"), "AI atau footage belum siap")
    reset()
    return start("forest-sector-b", request)


@app.post("/api/demo/manual-event", dependencies=[Depends(demo_only)])
def manual_event(request: ManualEvent):
    with writing_session() as session:
        state = require(session, DemoState, 1)
        check(state.status == "running" and state.mode == "manual_simulation" and not state.paused, "Mulai skenario mode simulasi manual terlebih dahulu")
        return serialize(ingest(session, {"id": identifier("DET"), "camera_id": request.camera_id,
            "category": request.category, "confidence": 0, "bbox": [], "captured_at": now(),
            "demo_epoch": state.epoch, "model_version": None}, "manual_simulation"))


@app.post("/api/demo/reset", dependencies=[Depends(demo_only)])
def reset():
    with writing_session() as session:
        state = require(session, DemoState, 1)
        ids = list(session.scalars(select(Incident.id).where(Incident.demo_epoch.is_not(None))))
        for camera in session.scalars(select(Camera)):
            camera.last_detection_at = camera.last_inference_at = None
            camera.connection_status, camera.ai_status = "reconnecting", "unavailable"
        for unit in session.scalars(select(ResponseUnit)):
            if unit.assigned_incident in ids or unit.assigned_incident is None:
                unit.latitude, unit.longitude = unit.home_latitude, unit.home_longitude
                unit.availability, unit.assigned_incident, unit.response_status = "available", None, "standby"
        for drone in session.scalars(select(Drone)):
            active = session.get(Mission, drone.mission_id) if drone.mission_id else None
            if active and active.incident_id not in ids:
                continue
            drone.latitude, drone.longitude = drone.home_latitude, drone.home_longitude
            drone.battery_pct, drone.payload_l, drone.altitude_m = 100, 5, 0
            drone.status, drone.mission_id = "available", None
        session.flush()
        paths = list(session.scalars(select(Detection.evidence_path).where(Detection.incident_id.in_(ids))))
        for cls in (Activity, Detection, Dispatch, Mission, Incident):
            column = cls.id if cls is Incident else cls.incident_id
            session.execute(delete(cls).where(column.in_(ids)))
        state.epoch += 1
        state.status, state.paused = "idle", False
        log(session, "demo.reset", {"epoch": state.epoch})
        result = serialize(state)
    root = (settings.data_dir / "evidence").resolve()
    for path in paths:
        if path:
            target = (settings.data_dir / path).resolve()
            if target.is_relative_to(root):
                target.unlink(missing_ok=True)
    return result


@app.get("/internal/vision/config", dependencies=[Depends(internal)])
def vision_config():
    with Session() as session:
        return {"cameras": rows(session, Camera), "demo": serialize(session.get(DemoState, 1)), "demo_enabled": settings.demo_mode}


@app.post("/internal/vision/heartbeat", dependencies=[Depends(internal)])
def heartbeat(request: Heartbeat):
    with writing_session() as session:
        state = require(session, DemoState, 1)
        check(state.epoch == request.epoch, "Heartbeat run lama ditolak")
        state.worker, state.worker_at = request.model_dump(mode="json", exclude={"cameras"}), now()
        for status in request.cameras:
            camera = require(session, Camera, status.camera_id)
            changed = camera.connection_status != status.connection_status or camera.ai_status != status.ai_status
            for key, value in status.model_dump(exclude={"camera_id"}).items():
                setattr(camera, key, value)
            if changed:
                log(session, "camera.status_changed", {"camera_id": camera.id, "connection_status": camera.connection_status, "ai_status": camera.ai_status})
        return {"ok": True}


@app.post("/internal/detections", dependencies=[Depends(internal)])
def validated(request: DetectionInput):
    if request.captured_at.tzinfo is None:
        raise HTTPException(422, "Timestamp harus timezone-aware UTC")
    target = (settings.data_dir / request.evidence_path).resolve()
    root = (settings.data_dir / "evidence").resolve()
    if not target.is_relative_to(root) or not target.is_file():
        raise HTTPException(422, "Evidence harus merupakan snapshot tersimpan di direktori evidence")
    with writing_session() as session:
        state = require(session, DemoState, 1)
        check(state.epoch == request.demo_epoch and not state.paused, "Deteksi run lama/paused ditolak")
        check(not (state.status == "running" and state.mode == "manual_simulation"), "Inference dinonaktifkan selama skenario manual")
        payload = request.model_dump()
        if not settings.demo_mode:
            payload["demo_epoch"] = None
        return serialize(ingest(session, payload))


@app.websocket("/ws/events")
async def events(socket: WebSocket):
    if socket.headers.get("origin") not in (None, "http://localhost:3000", "http://127.0.0.1:3000"):
        await socket.close(code=1008)
        return
    await socket.accept()
    clients.add(socket)
    try:
        await socket.send_json({"type": "system.connected", "data": {"resync": True}})
        while True:
            message = await socket.receive_text()
            if message == "ping":
                await socket.send_json({"type": "system.pong", "data": {}})
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(socket)
