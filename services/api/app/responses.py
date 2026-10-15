"""Public response schemas derived from the persisted fields, with JSON fields typed explicitly."""
from typing import Any
from datetime import datetime
from pydantic import BaseModel, create_model
from .models import Camera, Incident, Detection, ResponseUnit, Dispatch, Drone, Mission, DemoState


def output(cls):
    fields = {}
    for column in cls.__table__.columns:
        if column.name == "bbox":
            annotation = list[float]
        elif column.name == "route":
            annotation = list[list[float]]
        else:
            annotation = column.type.python_type
        if column.nullable:
            annotation = annotation | None
        fields[column.name] = (annotation, ...)
    return create_model(f"{cls.__name__}Response", **fields)


CameraResponse = output(Camera)
IncidentResponse = output(Incident)
DetectionResponse = output(Detection)
UnitResponse = output(ResponseUnit)
DispatchResponse = output(Dispatch)
DroneResponse = output(Drone)
MissionResponse = output(Mission)
DemoResponse = output(DemoState)


class EventResponse(BaseModel):
    event_id: str
    type: str
    timestamp: datetime
    sequence: int
    data: dict[str, Any]


class BootstrapResponse(BaseModel):
    cameras: list[CameraResponse]
    incidents: list[IncidentResponse]
    response_units: list[UnitResponse]
    dispatches: list[DispatchResponse]
    drones: list[DroneResponse]
    missions: list[MissionResponse]
    activities: list[EventResponse]
    demo: DemoResponse
    demo_enabled: bool
    worker_fresh: bool


class IncidentDetailsResponse(IncidentResponse):
    detections: list[DetectionResponse]
    dispatches: list[DispatchResponse]
    missions: list[MissionResponse]
    timeline: list[EventResponse]


class MissionReportResponse(MissionResponse):
    travel_wall_seconds: float | None
    mission_wall_seconds: float | None


class ReportResponse(IncidentResponse):
    detections: list[DetectionResponse]
    dispatches: list[DispatchResponse]
    missions: list[MissionReportResponse]
    timeline: list[EventResponse]
    intervals: dict[str, float | None]
    disclaimer: str
