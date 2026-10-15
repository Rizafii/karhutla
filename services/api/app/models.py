from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import String, Float, DateTime, ForeignKey, JSON, Boolean, Integer, Index, CheckConstraint, text
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base


def now():
    return datetime.now(timezone.utc)


def identifier(prefix):
    return f"{prefix}-{uuid4().hex[:12]}"


class Record:
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class Camera(Record, Base):
    __tablename__ = "cameras"
    name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    heading: Mapped[float] = mapped_column(Float, default=0)
    fov: Mapped[float] = mapped_column(Float, default=70)
    range_m: Mapped[float] = mapped_column(Float, default=1500)
    source_type: Mapped[str] = mapped_column(String(20), default="mp4")
    source_config: Mapped[dict] = mapped_column(JSON, default=dict)
    connection_status: Mapped[str] = mapped_column(String(30), default="unavailable")
    ai_status: Mapped[str] = mapped_column(String(30), default="unavailable")
    last_frame_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_inference_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_detection_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(String(500))
    __table_args__ = (CheckConstraint("source_type in ('mp4','rtsp','webcam')"),)


class Incident(Record, Base):
    __tablename__ = "incidents"
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float)
    evidence_path: Mapped[str | None] = mapped_column(String(300))
    provenance: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(30), default="pending_review", index=True)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    location_estimated: Mapped[bool] = mapped_column(Boolean, default=True)
    location_source: Mapped[str] = mapped_column(String(40), default="operator_estimate")
    location_uncertainty_m: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str] = mapped_column(String(4000), default="")
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    demo_epoch: Mapped[int | None] = mapped_column(Integer, index=True)
    __table_args__ = (
        CheckConstraint("status in ('pending_review','confirmed','dispatched','in_progress','resolved','false_alarm','closed')"),
        CheckConstraint("provenance in ('ai','manual_simulation')"),
        Index("uq_active_incident_camera", "camera_id", unique=True, postgresql_where=text("status in ('pending_review','confirmed','dispatched','in_progress')")),
    )


class Detection(Record, Base):
    __tablename__ = "detections"
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"), index=True)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), index=True)
    category: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float)
    bbox: Mapped[list] = mapped_column(JSON)
    frame_width: Mapped[int | None] = mapped_column(Integer)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    evidence_path: Mapped[str | None] = mapped_column(String(300))
    model_version: Mapped[str | None] = mapped_column(String(200))
    provenance: Mapped[str] = mapped_column(String(30))
    demo_epoch: Mapped[int | None] = mapped_column(Integer)


class ResponseUnit(Record, Base):
    __tablename__ = "response_units"
    name: Mapped[str] = mapped_column(String(120))
    type: Mapped[str] = mapped_column(String(30), default="firefighter")
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    home_latitude: Mapped[float] = mapped_column(Float)
    home_longitude: Mapped[float] = mapped_column(Float)
    availability: Mapped[str] = mapped_column(String(30), default="available")
    assigned_incident: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"))
    response_status: Mapped[str] = mapped_column(String(30), default="standby")
    __table_args__ = (
        CheckConstraint("availability in ('available','assigned')", name="ck_unit_availability"),
        CheckConstraint("response_status in ('standby','assigned','accepted','responding','on_site')", name="ck_unit_response_status"),
    )


class Dispatch(Record, Base):
    __tablename__ = "dispatches"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    unit_id: Mapped[str] = mapped_column(ForeignKey("response_units.id"))
    status: Mapped[str] = mapped_column(String(30), default="assigned")
    __table_args__ = (
        CheckConstraint("status in ('assigned','accepted','responding','on_site','completed')"),
        Index("uq_active_unit", "unit_id", unique=True, postgresql_where=text("status != 'completed'")),
    )


class Drone(Record, Base):
    __tablename__ = "drones"
    name: Mapped[str] = mapped_column(String(120))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    home_latitude: Mapped[float] = mapped_column(Float)
    home_longitude: Mapped[float] = mapped_column(Float)
    speed_mps: Mapped[float] = mapped_column(Float, default=12)
    altitude_m: Mapped[float] = mapped_column(Float, default=0)
    battery_pct: Mapped[float] = mapped_column(Float, default=100)
    payload_l: Mapped[float] = mapped_column(Float, default=5)
    status: Mapped[str] = mapped_column(String(30), default="available")
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id", name="fk_drone_current_mission", use_alter=True, ondelete="SET NULL", deferrable=True, initially="DEFERRED"))
    __table_args__ = (CheckConstraint("battery_pct >= 0 and battery_pct <= 100"), CheckConstraint("payload_l >= 0 and payload_l <= 5"),
        CheckConstraint("status in ('available','reserved','en_route','on_site','suppression_simulation','returning','unavailable')", name="ck_drone_status"))


class Mission(Record, Base):
    __tablename__ = "drone_missions"
    incident_id: Mapped[str] = mapped_column(ForeignKey("incidents.id"), index=True)
    drone_id: Mapped[str] = mapped_column(ForeignKey("drones.id"))
    mission_type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(40), default="proposed", index=True)
    target_latitude: Mapped[float] = mapped_column(Float)
    target_longitude: Mapped[float] = mapped_column(Float)
    abort_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    automatic: Mapped[bool] = mapped_column(Boolean, default=False)
    scan_elapsed_s: Mapped[float] = mapped_column(Float, default=0)
    location_refined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    launched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    simulation_elapsed_s: Mapped[float] = mapped_column(Float, default=0)
    distance_m: Mapped[float] = mapped_column(Float, default=0)
    eta_s: Mapped[float] = mapped_column(Float, default=0)
    route: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (
        CheckConstraint("mission_type in ('reconnaissance','suppression_simulation')"),
        CheckConstraint("status in ('proposed','approved','en_route','on_site','suppression_simulation','returning','completed','cancelled','aborted','failed')"),
        Index("uq_active_drone", "drone_id", unique=True, postgresql_where=text("status not in ('completed','cancelled','aborted','failed')")),
    )


class Activity(Base):
    __tablename__ = "activity_logs"
    sequence: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(40), unique=True, default=lambda: identifier("evt"))
    type: Mapped[str] = mapped_column(String(80), index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    data: Mapped[dict] = mapped_column(JSON)
    incident_id: Mapped[str | None] = mapped_column(ForeignKey("incidents.id"), index=True)
    mission_id: Mapped[str | None] = mapped_column(ForeignKey("drone_missions.id"), index=True)
    command_id: Mapped[str | None] = mapped_column(String(80), unique=True)
    published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class DemoState(Base):
    __tablename__ = "demo_state"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    epoch: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(30), default="idle")
    mode: Mapped[str] = mapped_column(String(30), default="ai")
    speed: Mapped[int] = mapped_column(Integer, default=8)
    paused: Mapped[bool] = mapped_column(Boolean, default=False)
    worker: Mapped[dict] = mapped_column(JSON, default=dict)
    worker_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
