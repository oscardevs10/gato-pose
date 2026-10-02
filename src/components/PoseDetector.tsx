/**
 * PoseDetector.tsx
 * Componente principal que orquesta la cámara, el hook de MediaPipe y la reacción.
 */

import React, { useRef, useState } from "react";
import { Camera, type CameraHandle } from "./Camera";
import { ReactionImage } from "./ReactionImage";
import { usePoseDetection } from "../hooks/usePoseDetection";
import { POSE_DETECTION_THRESHOLD } from "../utils/poseDetection";

export const PoseDetector: React.FC = () => {
  const cameraRef = useRef<CameraHandle>(null);
  const [showDebug, setShowDebug] = useState(false);

  const {
    isPoseActive,
    currentScore,
    debugInfo,
    startDetection,
    loading: modelLoading,
    error: modelError,
  } = usePoseDetection();

  // Se llama cuando la cámara está lista y reproduciendo
  const handleCameraReady = (
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement
  ) => {
    startDetection(video, canvas);
  };

  return (
    <div className="pose-detector-wrapper">
      {/* Indicador de estado superior */}
      <div className="status-bar">
        {modelLoading ? (
          <span className="status-badge loading">
            <span className="dot pulse" /> Cargando modelos de IA...
          </span>
        ) : modelError ? (
          <span className="status-badge error">
            ⚠️ Error: {modelError}
          </span>
        ) : isPoseActive ? (
          <span className="status-badge detected">
            🟢 POSE DETECTADA
          </span>
        ) : (
          <span className="status-badge waiting">
            ⏳ HAZ LA POSE
          </span>
        )}

        {/* Score meter en tiempo real */}
        {!modelLoading && (
          <div className="score-meter-container">
            <div className="score-meter-bar-bg">
              <div
                className="score-meter-bar-fill"
                style={{
                  width: `${Math.min(100, Math.round(currentScore * 100))}%`,
                  backgroundColor:
                    currentScore >= POSE_DETECTION_THRESHOLD
                      ? "var(--color-success)"
                      : "var(--color-accent)",
                }}
              />
            </div>
            <span className="score-text">
              {Math.round(currentScore * 100)}%
            </span>
          </div>
        )}

        {/* Toggle para ver debug / landmarks */}
        <button
          className={`btn-debug-toggle ${showDebug ? "active" : ""}`}
          onClick={() => setShowDebug(!showDebug)}
          title="Mostrar/Ocultar detalles de depuración"
        >
          {showDebug ? "Ocultar Debug" : "Ver Debug"}
        </button>
      </div>

      {/* Instrucción visual */}
      <div className="instruction-banner">
        <p className="instruction-text">
          Coloca un <span className="highlight">puño cerrado</span> cerca de tu{" "}
          <span className="highlight">mejilla o boca</span> con el brazo doblado 👊
        </p>
      </div>

      {/* Viewport interactivo: Video + Canvas + Reacción */}
      <div className="viewport-stage">
        <Camera
          ref={cameraRef}
          onReady={handleCameraReady}
          showOverlay={showDebug}
        />

        {/* Imagen de reacción del gato (animada cuando se detecta) */}
        <ReactionImage visible={isPoseActive} score={currentScore} />
      </div>

      {/* Panel de depuración opcional */}
      {showDebug && (
        <div className="debug-panel">
          <h4>Métricas de Detección en Tiempo Real</h4>
          <div className="debug-grid">
            <div className="debug-item">
              <span>Mano detectada:</span>
              <strong>{debugInfo.handDetected ? "SÍ" : "NO"}</strong>
            </div>
            <div className="debug-item">
              <span>Puño cerrado:</span>
              <strong>{Math.round((debugInfo.fistScore ?? 0) * 100)}%</strong>
            </div>
            <div className="debug-item">
              <span>Proximidad a cara:</span>
              <strong>
                {Math.round((debugInfo.proximityScore ?? 0) * 100)}%
              </strong>
            </div>
            <div className="debug-item">
              <span>Ángulo de codo:</span>
              <strong>
                {Math.round((debugInfo.elbowAngleScore ?? 0) * 100)}%
              </strong>
            </div>
            <div className="debug-item">
              <span>Altura (mejilla):</span>
              <strong>
                {Math.round((debugInfo.heightScore ?? 0) * 100)}%
              </strong>
            </div>
            <div className="debug-item">
              <span>Lateralidad:</span>
              <strong>
                {Math.round((debugInfo.lateralScore ?? 0) * 100)}%
              </strong>
            </div>
            <div className="debug-item total">
              <span>Score Total:</span>
              <strong>
                {Math.round((debugInfo.totalScore ?? 0) * 100)}% /{" "}
                {Math.round(POSE_DETECTION_THRESHOLD * 100)}%
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
