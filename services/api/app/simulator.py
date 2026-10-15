import asyncio
import logging
import time
from sqlalchemy import select
from .db import Session
from .models import DemoState, Mission, Drone, Dispatch, ResponseUnit, Incident, Camera, now
from .domain import FLYING, BATTERY_PER_SECOND, GEOD, distance, move, telemetry
from .service import log, incident_state, mission_action
from .schemas import Payload

logger = logging.getLogger(__name__)


def tick(seconds):
    with Session.begin() as session:
        state = session.scalar(select(DemoState).where(DemoState.id == 1).with_for_update())
        if state and state.worker_at and (now() - state.worker_at).total_seconds() > 15:
            for camera in session.scalars(select(Camera).where(Camera.connection_status.in_(["connected", "paused"]))):
                camera.connection_status = camera.ai_status = "unavailable"
                camera.error = "Vision worker heartbeat terputus"
                log(session, "camera.status_changed", {"camera_id": camera.id, "connection_status": "unavailable", "ai_status": "unavailable"})
        if not state or state.paused:
            return
        dt = min(seconds, 3) * state.speed
        for mission in session.scalars(select(Mission).where(Mission.status.in_(FLYING)).with_for_update()).all():
            drone = session.get(Drone, mission.drone_id)
            mission.simulation_elapsed_s += dt
            drone.battery_pct = max(0, drone.battery_pct - dt * BATTERY_PER_SECOND)
            return_need = distance(drone.latitude, drone.longitude, drone.home_latitude, drone.home_longitude) / drone.speed_mps * BATTERY_PER_SECOND
            if drone.battery_pct <= return_need + 20 and mission.status != "returning":
                mission.status = drone.status = "returning"
                log(session, "mission.battery_return", {"mission_id": mission.id, "battery_pct": drone.battery_pct}, mission.incident_id, mission.id)
            if drone.battery_pct <= 0:
                mission.status, drone.status, mission.completed_at = "failed", "unavailable", now()
                log(session, "mission.failed", {"mission_id": mission.id, "reason": "virtual_battery_empty"}, mission.incident_id, mission.id)
            elif mission.status in ("en_route", "returning"):
                returning = mission.status == "returning"
                target_lat, target_lon = (drone.home_latitude, drone.home_longitude) if returning else (mission.target_latitude, mission.target_longitude)
                drone.latitude, drone.longitude, remaining, arrived = move(drone.latitude, drone.longitude, target_lat, target_lon, drone.speed_mps, dt)
                mission.distance_m, mission.eta_s = remaining, remaining / drone.speed_mps
                mission.route = (mission.route + [[drone.longitude, drone.latitude]])[-2000:]
                if arrived:
                    if returning:
                        mission.status = "aborted" if mission.abort_requested else "completed"
                        mission.completed_at = now()
                        drone.status, drone.mission_id, drone.altitude_m = "available", None, 0
                        log(session, f"mission.{mission.status}", {"mission_id": mission.id, "status": mission.status}, mission.incident_id, mission.id)
                    else:
                        mission.status = drone.status = "on_site"
                        mission.arrived_at = now()
                        log(session, "mission.arrived", {"mission_id": mission.id, "status": "on_site"}, mission.incident_id, mission.id)
            elif mission.automatic and mission.status in ("on_site", "suppression_simulation"):
                mission.scan_elapsed_s += dt
                if mission.location_refined_at is None and mission.scan_elapsed_s >= 24:
                    incident = session.get(Incident, mission.incident_id)
                    camera = session.get(Camera, incident.camera_id)
                    # This is a deterministic virtual survey, not a real drone
                    # image measurement or validated improvement in GPS accuracy.
                    if incident.location_source != "operator_estimate":
                        lon, lat, _ = GEOD.fwd(mission.target_longitude, mission.target_latitude,
                                              camera.heading + 12, min(80, camera.range_m * .04))
                        previous = {"latitude": incident.latitude, "longitude": incident.longitude}
                        incident.latitude, incident.longitude = lat, lon
                        incident.location_source = "drone_simulation"
                        incident.location_uncertainty_m = 80
                        incident.updated_at = now()
                        log(session, "incident.location_refined", {"incident_id": incident.id, "mission_id": mission.id,
                            "previous": previous, "latitude": lat, "longitude": lon,
                            "location_source": "drone_simulation", "location_uncertainty_m": 80,
                            "simulated": True, "message": "Pemindaian virtual; bukan pengukuran GPS nyata"}, incident.id, mission.id)
                    else:
                        log(session, "mission.scan_completed", {"mission_id": mission.id, "simulated": True,
                            "message": "Lokasi pilihan operator dipertahankan"}, incident.id, mission.id)
                    mission.location_refined_at = now()
                    if mission.mission_type == "suppression_simulation" and mission.status == "on_site" and drone.payload_l > 0:
                        mission_action(session, mission.id, "release-payload", Payload(liters=min(5, drone.payload_l),
                            command_id=f"auto-payload-{mission.id}"))
                if mission.scan_elapsed_s >= 40:
                    mission_action(session, mission.id, "return")
            drone.updated_at = mission.updated_at = now()
            log(session, "drone.telemetry", {**telemetry(drone, mission, state.speed), "state_timestamp": drone.updated_at.isoformat()}, mission.incident_id, mission.id)
        for dispatch in session.scalars(select(Dispatch).where(Dispatch.status == "responding").with_for_update()).all():
            incident = session.get(Incident, dispatch.incident_id)
            unit = session.get(ResponseUnit, dispatch.unit_id)
            if incident.latitude is None:
                continue
            unit.latitude, unit.longitude, _, arrived = move(unit.latitude, unit.longitude, incident.latitude, incident.longitude, 8, dt)
            if arrived:
                dispatch.status = unit.response_status = "on_site"
                log(session, "dispatch.updated", {"dispatch_id": dispatch.id, "unit_id": unit.id, "status": "on_site", "simulated": True}, incident.id)
            else:
                unit.updated_at = now()
                log(session, "dispatch.telemetry", {"unit_id": unit.id, "latitude": unit.latitude, "longitude": unit.longitude, "state_timestamp": unit.updated_at.isoformat(), "simulated": True}, incident.id)


async def simulator():
    previous = time.monotonic()
    while True:
        await asyncio.sleep(1)
        current = time.monotonic()
        try:
            await asyncio.to_thread(tick, current - previous)
        except Exception:
            logger.exception("Simulator tick failed")
        previous = current
