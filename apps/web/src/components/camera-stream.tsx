"use client";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { API } from "@/lib/api";
import type { Camera } from "@/lib/types";

export function CameraStream({
  camera,
  annotated = false,
}: {
  camera: Camera;
  annotated?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setFailed(false);
    setRetry((n) => n + 1);
  }, [camera.connection_status, camera.ai_status, annotated]);
  useEffect(() => {
    if (
      !failed ||
      camera.connection_status !== "connected" ||
      (annotated && camera.ai_status !== "ready")
    )
      return;
    const timer = setTimeout(() => {
      setFailed(false);
      setRetry((n) => n + 1);
    }, 2500);
    return () => clearTimeout(timer);
  }, [failed, camera.connection_status, camera.ai_status, annotated]);
  if (
    camera.connection_status === "unavailable" ||
    camera.connection_status === "reconnecting" ||
    failed
  )
    return (
      <div className="video-empty">
        <WifiOff size={24} />
        <span>Video belum tersedia</span>
        <small>{camera.error || "Periksa sumber kamera"}</small>
        {failed && (
          <button
            onClick={() => {
              setFailed(false);
              setRetry((n) => n + 1);
            }}
          >
            Coba kembali
          </button>
        )}
      </div>
    );
  return (
    <img
      className="camera-stream"
      src={`${API}/api/cameras/${camera.id}/stream.mjpg?annotated=${annotated}&v=${retry}`}
      alt={`Preview ${camera.id}${annotated ? " dengan hasil inference" : ""}`}
      onError={() => setFailed(true)}
    />
  );
}
