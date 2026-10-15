import type {
  CameraResponse,
  IncidentResponse,
  ResponseUnitResponse,
  DispatchResponse,
  DroneResponse,
  MissionResponse,
  EventResponse,
  DemoStateResponse,
  BootstrapResponse,
  ReportResponse,
} from "./generated-api";
export type Camera = CameraResponse;
export type Incident = IncidentResponse & {
  provenance: "ai" | "manual_simulation";
};
export type Unit = ResponseUnitResponse;
export type Dispatch = DispatchResponse;
export type Drone = DroneResponse;
export type Mission = MissionResponse;
export type Event = EventResponse;
export type Demo = Omit<DemoStateResponse, "worker"> & {
  worker: {
    model_ready?: boolean;
    footage_ready?: boolean;
    model_error?: string;
    model_version?: string;
    inference_fps?: number;
  };
};
export type Bootstrap = Omit<BootstrapResponse, "incidents" | "demo"> & {
  incidents: Incident[];
  demo: Demo;
};
export type Report = ReportResponse & {
  provenance: "ai" | "manual_simulation";
};
