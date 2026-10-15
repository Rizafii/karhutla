import { create } from "zustand";
type State = {
  view: string;
  cameraId: string | null;
  incidentId: string | null;
  placing: boolean;
  reportId: string | null;
  setView: (view: string) => void;
  selectCamera: (id: string) => void;
  selectIncident: (id: string) => void;
  setPlacing: (placing: boolean) => void;
  setReport: (id: string | null) => void;
};
export const useWorkspace = create<State>((set) => ({
  view: "cameras",
  cameraId: null,
  incidentId: null,
  placing: false,
  reportId: null,
  setView: (view) => set({ view, placing: false }),
  selectCamera: (cameraId) =>
    set({ cameraId, incidentId: null, placing: false }),
  selectIncident: (incidentId) =>
    set({ incidentId, cameraId: null, placing: false }),
  setPlacing: (placing) => set({ placing }),
  setReport: (reportId) => set({ reportId }),
}));
