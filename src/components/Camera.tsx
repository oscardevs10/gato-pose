/**
 * Camera.tsx
 * Componente que maneja el acceso a la webcam via getUserMedia().
 * Soporta modo espejo, reintentos de permisos y compatibilidad móvil.
 */

import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from "react";

export interface CameraHandle {
  getVideo: () => HTMLVideoElement | null;
  getCanvas: () => HTMLCanvasElement | null;
}

interface CameraProps {
  onReady?: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => void;
  showOverlay?: boolean;
}

export const Camera = forwardRef<CameraHandle, CameraProps>(
  ({ onReady, showOverlay = true }, ref) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [facingMode, setFacingMode] = useState<"user" | "environment">("user");

    // Exponer refs al padre
    useImperativeHandle(ref, () => ({
      getVideo: () => videoRef.current,
      getCanvas: () => canvasRef.current,
    }));

    const startCamera = async (mode: "user" | "environment" = facingMode) => {
      setErrorMsg(null);
      setHasPermission(null);

      // Detener tracks anteriores si los hay
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }

      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "Tu navegador no soporta acceso a la cámara. Prueba con Chrome, Edge o Safari."
          );
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setHasPermission(true);

          if (canvasRef.current && onReady) {
            onReady(videoRef.current, canvasRef.current);
          }
        }
      } catch (err: any) {
        console.error("Error al acceder a la cámara:", err);
        setHasPermission(false);

        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setErrorMsg(
            "Permiso de cámara denegado. Por favor, habilita la cámara en la barra de direcciones de tu navegador y recarga la página."
          );
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setErrorMsg(
            "No se encontró ninguna cámara conectada en tu dispositivo."
          );
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          setErrorMsg(
            "La cámara ya está siendo utilizada por otra aplicación."
          );
        } else {
          setErrorMsg(err.message ?? "Error inesperado al acceder a la cámara.");
        }
      }
    };

    // Intentar iniciar automáticamente
    useEffect(() => {
      startCamera("user");

      return () => {
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject as MediaStream;
          stream.getTracks().forEach((track) => track.stop());
        }
      };
    }, []);

    const toggleFacingMode = () => {
      const nextMode = facingMode === "user" ? "environment" : "user";
      setFacingMode(nextMode);
      startCamera(nextMode);
    };

    return (
      <div className="camera-container">
        {/* Estado: pidiendo permiso o error */}
        {hasPermission === false && (
          <div className="camera-error-overlay">
            <div className="camera-error-card">
              <span className="error-icon">📷⚠️</span>
              <h3>Acceso a la Cámara Requerido</h3>
              <p>{errorMsg}</p>
              <button
                className="btn-retry"
                onClick={() => startCamera(facingMode)}
              >
                ACTIVAR CÁMARA
              </button>
            </div>
          </div>
        )}

        {hasPermission === null && (
          <div className="camera-loading-overlay">
            <div className="spinner" />
            <p>Conectando con la cámara...</p>
          </div>
        )}

        {/* Video feed con modo espejo (selfie) */}
        <video
          ref={videoRef}
          className={`camera-video ${facingMode === "user" ? "mirror" : ""}`}
          playsInline
          muted
          autoPlay
        />

        {/* Canvas de depuración/landmarks sobre el video */}
        {showOverlay && (
          <canvas
            ref={canvasRef}
            className={`camera-canvas ${facingMode === "user" ? "mirror" : ""}`}
          />
        )}

        {/* Botón switch de cámara en móvil */}
        {hasPermission && (
          <button
            className="btn-switch-camera"
            onClick={toggleFacingMode}
            title="Cambiar cámara (frontal/trasera)"
            aria-label="Cambiar cámara"
          >
            🔄
          </button>
        )}
      </div>
    );
  }
);
