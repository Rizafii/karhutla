from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, model_validator


class Note(BaseModel):
    notes: str = Field(default="", max_length=4000)


class IncidentEdit(Note):
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinates(self):
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("Latitude dan longitude wajib diisi berpasangan")
        return self


class Assign(BaseModel):
    unit_id: str


class AutomaticResponse(Note):
    mission_type: Literal["reconnaissance", "suppression_simulation"] = "reconnaissance"


class DispatchStatus(BaseModel):
    status: Literal["accepted", "responding", "on_site", "completed"]


class MissionCreate(BaseModel):
    incident_id: str
    drone_id: str = "DRONE-01"
    mission_type: Literal["reconnaissance", "suppression_simulation"] = "suppression_simulation"


class Payload(BaseModel):
    liters: float = Field(default=5, gt=0, le=5)
    command_id: str = Field(min_length=8, max_length=80)


class CameraEdit(BaseModel):
    source_type: Literal["mp4", "rtsp", "webcam"] = "mp4"
    source_config: dict[str, str | int]
    heading: float = Field(default=0, ge=0, lt=360)
    fov: float = Field(default=70, gt=0, le=180)
    range_m: float = Field(default=1500, gt=0, le=20000)


class DetectionInput(BaseModel):
    id: str = Field(min_length=8, max_length=40)
    camera_id: str
    category: Literal["smoke", "fire"]
    confidence: float = Field(ge=0, le=1)
    bbox: list[float] = Field(min_length=4, max_length=4)
    frame_width: int | None = Field(default=None, gt=0, le=32768)
    captured_at: datetime
    evidence_path: str
    model_version: str = Field(min_length=1, max_length=200)
    demo_epoch: int


class CameraHeartbeat(BaseModel):
    camera_id: str
    connection_status: Literal["connected", "reconnecting", "unavailable", "paused"]
    ai_status: Literal["ready", "unavailable", "processing", "error", "paused"]
    last_frame_at: datetime | None = None
    last_inference_at: datetime | None = None
    error: str | None = None


class Heartbeat(BaseModel):
    epoch: int
    model_ready: bool
    model_error: str | None = None
    model_version: str | None = None
    footage_ready: bool = False
    inference_fps: float = 0
    cameras: list[CameraHeartbeat]


class ScenarioStart(BaseModel):
    mode: Literal["ai", "manual_simulation"] = "ai"


class DemoControl(BaseModel):
    paused: bool | None = None
    speed: Literal[1, 5, 8, 10] | None = None


class ManualEvent(BaseModel):
    camera_id: str = "CAM-002"
    category: Literal["smoke", "fire"] = "smoke"
