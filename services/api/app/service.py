from fastapi import HTTPException
from sqlalchemy import select
from .models import Activity, Camera, Incident, Detection, Drone, Mission, ResponseUnit, Dispatch, now, identifier
from .domain import ACTIVE_INCIDENTS, VERIFIED_INCIDENTS, required_battery, distance, estimate_camera_location
from .schemas import MissionCreate


def require(session, cls, id, lock=True):
    query = select(cls).where(cls.id == id)
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    item = session.scalar(query)
    if item is None:
        raise HTTPException(404, "Objek tidak ditemukan")
    return item


def check(condition, message):
    if not condition:
        raise HTTPException(409, message)


def serialize(item):
    return {column.name: getattr(item, column.name) for column in item.__table__.columns}


def log(session, type, data, incident_id=None, mission_id=None, command_id=None):
    session.add(Activity(type=type, data=data, incident_id=incident_id, mission_id=mission_id, command_id=command_id))


def incident_state(session, item, state, note=""):
    previous = item.status
    item.status = state
    item.updated_at = now()
    if note:
        item.notes = note
    log(session, f"incident.{ {'false_alarm':'rejected','confirmed':'confirmed'}.get(state,'updated')}",
        {"incident_id": item.id, "camera_id": item.camera_id, "status": state, "previous_status": previous, "notes": note}, item.id)


def ingest(session, payload, provenance="ai"):
    previous = session.get(Detection, payload["id"])
    if previous:
        return require(session, Incident, previous.incident_id, False)
    camera = require(session, Camera, payload["camera_id"])
    incident = session.scalar(select(Incident).where(Incident.camera_id == camera.id, Incident.status.in_(ACTIVE_INCIDENTS)))
    if not incident:
        lat, lon, uncertainty = estimate_camera_location(camera, payload.get("bbox"), payload.get("frame_width"))
        incident = Incident(id=identifier("INC"), camera_id=camera.id, category=payload["category"],
                            confidence=payload["confidence"], evidence_path=payload.get("evidence_path"),
                            provenance=provenance, demo_epoch=payload.get("demo_epoch"), created_at=payload["captured_at"],
                            latitude=lat, longitude=lon, location_source="camera_bearing_estimate", location_uncertainty_m=uncertainty)
        session.add(incident)
        session.flush()
        log(session, "incident.created", {"incident_id": incident.id, "camera_id": camera.id,
            "status": "pending_review", "provenance": provenance, "latitude": lat, "longitude": lon,
            "location_source": "camera_bearing_estimate", "location_uncertainty_m": uncertainty}, incident.id)
    detection = Detection(**{key: value for key, value in payload.items() if key in Detection.__table__.columns.keys()},
                          incident_id=incident.id, provenance=provenance)
    session.add(detection)
    camera.last_detection_at = payload["captured_at"]
    log(session, "detection.validated", {"detection_id": detection.id, "incident_id": incident.id,
        "camera_id": camera.id, "category": payload["category"], "confidence": payload["confidence"], "provenance": provenance}, incident.id)
    return incident


def assign(session, incident_id, unit_id):
    incident = require(session, Incident, incident_id)
    check(incident.status in VERIFIED_INCIDENTS, "Verifikasi insiden sebelum dispatch")
    unit = require(session, ResponseUnit, unit_id)
    check(unit.availability == "available", "Regu sudah ditugaskan")
    unit.availability, unit.assigned_incident, unit.response_status = "assigned", incident.id, "assigned"
    dispatch = Dispatch(id=identifier("DSP"), incident_id=incident.id, unit_id=unit.id)
    session.add(dispatch)
    if incident.status == "confirmed":
        incident_state(session, incident, "dispatched")
    log(session, "dispatch.created", {"dispatch_id": dispatch.id, "unit_id": unit.id, "status": "assigned"}, incident.id)
    session.flush()
    return dispatch


def propose(session, request):
    incident = require(session, Incident, request.incident_id)
    check(incident.status in VERIFIED_INCIDENTS, "Misi membutuhkan insiden terverifikasi yang masih aktif")
    check(incident.latitude is not None and incident.longitude is not None, "Tentukan koordinat target perkiraan pada peta")
    drone = require(session, Drone, request.drone_id)
    check(drone.status == "available", "Drone sudah memiliki misi atau tidak tersedia")
    needed = required_battery(drone, incident.latitude, incident.longitude)
    check(drone.battery_pct >= needed, f"Baterai tidak cukup: perlu {needed:.1f}% termasuk cadangan 20%")
    check(request.mission_type != "suppression_simulation" or drone.payload_l > 0, "Payload habis; reset demo untuk mengisi kembali")
    mission = Mission(id=identifier("MSN"), incident_id=incident.id, drone_id=drone.id,
        mission_type=request.mission_type, target_latitude=incident.latitude, target_longitude=incident.longitude,
        distance_m=distance(drone.latitude, drone.longitude, incident.latitude, incident.longitude),
        eta_s=distance(drone.latitude, drone.longitude, incident.latitude, incident.longitude) / drone.speed_mps,
        route=[[drone.longitude, drone.latitude]])
    session.add(mission)
    drone.mission_id, drone.status = mission.id, "reserved"
    session.flush()
    log(session, "mission.created", {"mission_id": mission.id, "incident_id": incident.id, "status": "proposed"}, incident.id, mission.id)
    return mission


def respond_automatically(session, incident_id, request):
    """A single explicit operator command verifies, approves and launches.

    No team acknowledgment is needed. All changes share one transaction, so a
    failed reservation cannot leave a partly approved automatic mission.
    """
    incident = require(session, Incident, incident_id)
    check(incident.status in ("pending_review", *VERIFIED_INCIDENTS), "Insiden sudah tidak aktif")
    existing = session.scalar(select(Mission).where(Mission.incident_id == incident.id,
        Mission.status.notin_(("completed", "cancelled", "aborted", "failed"))))
    if existing:
        check(existing.automatic, "Insiden sudah memiliki misi manual aktif")
        return existing
    if incident.latitude is None:
        camera = require(session, Camera, incident.camera_id)
        incident.latitude, incident.longitude, incident.location_uncertainty_m = estimate_camera_location(camera)
        incident.location_source = "camera_bearing_estimate"
    if incident.status == "pending_review":
        incident.verified_at = now()
        incident_state(session, incident, "confirmed", request.notes)
    mission = propose(session, MissionCreate(incident_id=incident.id, mission_type=request.mission_type))
    mission.automatic = True
    log(session, "mission.automation_authorized", {"mission_id": mission.id, "operator_approved": True,
        "simulated": True, "mission_type": mission.mission_type}, incident.id, mission.id)
    mission_action(session, mission.id, "approve")
    mission_action(session, mission.id, "launch")
    return mission


def mission_action(session, id, action, payload=None):
    reference = require(session, Mission, id, False)
    incident = require(session, Incident, reference.incident_id)
    drone = require(session, Drone, reference.drone_id)
    mission = require(session, Mission, id)
    previous = mission.status
    if action == "approve":
        check(previous == "proposed", "Hanya proposal yang bisa disetujui")
        check(incident.status in VERIFIED_INCIDENTS, "Insiden sudah tidak aktif")
        mission.status = "approved"
        if incident.status == "confirmed":
            incident_state(session, incident, "dispatched")
    elif action == "launch":
        check(previous == "approved", "Setujui misi sebelum peluncuran")
        check(incident.status in VERIFIED_INCIDENTS, "Insiden sudah tidak aktif")
        check(drone.battery_pct >= required_battery(drone, mission.target_latitude, mission.target_longitude), "Baterai tidak cukup")
        mission.status, mission.launched_at = "en_route", now()
        drone.status, drone.altitude_m = "en_route", 80
        if incident.status == "dispatched":
            incident_state(session, incident, "in_progress")
    elif action == "abort":
        check(previous not in ("completed", "cancelled", "aborted", "failed", "returning"), "Misi sudah berakhir atau sedang kembali")
        if previous in ("proposed", "approved"):
            mission.status, mission.completed_at = "cancelled", now()
            drone.status, drone.mission_id = "available", None
        else:
            mission.status, mission.abort_requested, drone.status = "returning", True, "returning"
    elif action == "release-payload":
        existing = session.scalar(select(Activity).where(Activity.command_id == payload.command_id))
        if existing:
            check(existing.mission_id == mission.id, "Command ID sudah dipakai misi lain")
            return mission
        check(mission.mission_type == "suppression_simulation", "Misi reconnaissance tidak mendukung payload")
        check(previous == "on_site", "Payload hanya boleh dilepas saat drone berada di lokasi")
        check(drone.payload_l >= payload.liters, "Payload tidak cukup")
        drone.payload_l = max(0, drone.payload_l - payload.liters)
        mission.status, drone.status = "suppression_simulation", "suppression_simulation"
        log(session, "mission.payload_released", {"mission_id": mission.id, "liters": payload.liters,
            "simulated": True, "message": "Pelepasan virtual; status kebakaran memerlukan verifikasi operator"}, incident.id, mission.id, payload.command_id)
    elif action == "return":
        check(previous in ("on_site", "suppression_simulation", "en_route"), "Drone belum terbang atau sudah kembali")
        mission.status, drone.status = "returning", "returning"
    mission.updated_at = now()
    log(session, {"launch": "mission.started", "approve": "mission.approved", "abort": "mission.abort_requested"}.get(action, "mission.updated"),
        {"mission_id": mission.id, "status": mission.status, "previous_status": previous}, incident.id, mission.id)
    return mission
