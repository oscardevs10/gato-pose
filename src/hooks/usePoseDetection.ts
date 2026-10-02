/**
 * usePoseDetection.ts
 * Hook que inicializa PoseLandmarker + HandLandmarker de MediaPipe
 * y ejecuta la detección frame a frame sobre un elemento <video>.
 */

import { useRef, useCallback, useEffect, useState } from "react";
import {
  PoseLandmarker,
  HandLandmarker,
  FilesetResolver,
  DrawingUtils,
  type PoseLandmarkerResult,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  detectTargetPose,
  type PoseResult,
} from "../utils/poseDetection";

// ─── Configuración de hysteresis ──────────────────────────────────
/** Milisegundos que la pose debe mantenerse detectada antes de activar */
const ACTIVATION_DELAY_MS = 300;
/** Milisegundos que la pose debe desaparecer antes de desactivar */
const DEACTIVATION_DELAY_MS = 700;

export interface UsePoseDetectionReturn {
  /** true cuando la pose está confirmada (con hysteresis) */
  isPoseActive: boolean;
  /** Score crudo de la última evaluación */
  currentScore: number;
  /** Info de depuración */
  debugInfo: Record<string, number>;
  /** Inicia la detección contra un <video> + canvas overlay opcionales */
  startDetection: (
    video: HTMLVideoElement,
    overlayCanvas?: HTMLCanvasElement
  ) => void;
  /** Detiene la detección */
  stopDetection: () => void;
  /** true mientras se cargan los modelos */
  loading: boolean;
  /** Error si falla la carga del modelo */
  error: string | null;
}

export function usePoseDetection(): UsePoseDetectionReturn {
  const [isPoseActive, setIsPoseActive] = useState(false);
  const [currentScore, setCurrentScore] = useState(0);
  const [debugInfo, setDebugInfo] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(-1);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Hysteresis state
  const rawDetectedRef = useRef(false);
  const activeRef = useRef(false);
  const activationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deactivationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cargar modelos ─────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadModels() {
      try {
        setLoading(true);
        setError(null);

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        if (cancelled) return;

        const [pose, hand] = await Promise.all([
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numPoses: 1,
          }),
          HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
          }),
        ]);

        if (cancelled) {
          pose.close();
          hand.close();
          return;
        }

        poseLandmarkerRef.current = pose;
        handLandmarkerRef.current = hand;
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          console.error("Error cargando modelos MediaPipe:", err);
          setError(
            err.message ?? "Error desconocido al cargar los modelos de detección"
          );
          setLoading(false);
        }
      }
    }

    loadModels();

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Hysteresis ─────────────────────────────────────────────────
  const updateHysteresis = useCallback((rawDetected: boolean) => {
    rawDetectedRef.current = rawDetected;

    if (rawDetected && !activeRef.current) {
      // Quiere activarse: si ya hay timer de activación, esperar
      if (deactivationTimerRef.current) {
        clearTimeout(deactivationTimerRef.current);
        deactivationTimerRef.current = null;
      }
      if (!activationTimerRef.current) {
        activationTimerRef.current = setTimeout(() => {
          activationTimerRef.current = null;
          if (rawDetectedRef.current) {
            activeRef.current = true;
            setIsPoseActive(true);
          }
        }, ACTIVATION_DELAY_MS);
      }
    } else if (!rawDetected && activeRef.current) {
      // Quiere desactivarse
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
      if (!deactivationTimerRef.current) {
        deactivationTimerRef.current = setTimeout(() => {
          deactivationTimerRef.current = null;
          if (!rawDetectedRef.current) {
            activeRef.current = false;
            setIsPoseActive(false);
          }
        }, DEACTIVATION_DELAY_MS);
      }
    } else if (rawDetected && activeRef.current) {
      // Se mantiene activa: cancela cualquier timer de desactivación
      if (deactivationTimerRef.current) {
        clearTimeout(deactivationTimerRef.current);
        deactivationTimerRef.current = null;
      }
    } else if (!rawDetected && !activeRef.current) {
      // Se mantiene inactiva: cancela timer de activación
      if (activationTimerRef.current) {
        clearTimeout(activationTimerRef.current);
        activationTimerRef.current = null;
      }
    }
  }, []);

  // ── Loop de detección ──────────────────────────────────────────
  const detectFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused || video.ended || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    const now = performance.now();
    if (now === lastTimeRef.current) {
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }
    lastTimeRef.current = now;

    let poseResult: PoseLandmarkerResult | null = null;
    let handResult: HandLandmarkerResult | null = null;

    try {
      if (poseLandmarkerRef.current) {
        poseResult = poseLandmarkerRef.current.detectForVideo(video, now);
      }
      if (handLandmarkerRef.current) {
        handResult = handLandmarkerRef.current.detectForVideo(video, now);
      }
    } catch {
      // MediaPipe puede fallar con timestamps duplicados; ignorar
      rafRef.current = requestAnimationFrame(detectFrame);
      return;
    }

    // Extraer landmarks
    const poseLandmarks =
      poseResult && poseResult.landmarks.length > 0
        ? poseResult.landmarks[0]
        : null;

    const handLandmarksArray =
      handResult && handResult.landmarks.length > 0
        ? handResult.landmarks
        : null;

    const handednesses =
      handResult && handResult.handednesses.length > 0
        ? handResult.handednesses.map((h) => h[0]?.categoryName ?? "Unknown")
        : [];

    // Detectar pose
    const result: PoseResult = detectTargetPose(
      poseLandmarks,
      handLandmarksArray,
      handednesses
    );

    setCurrentScore(result.score);
    setDebugInfo(result.debugInfo);
    updateHysteresis(result.detected);

    // Dibujar overlay opcional (para depuración)
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const drawingUtils = new DrawingUtils(ctx);

        // Dibujar landmarks de pose (ligero)
        if (poseLandmarks) {
          drawingUtils.drawLandmarks(poseLandmarks, {
            radius: 2,
            color: "rgba(255,255,255,0.3)",
          });
          drawingUtils.drawConnectors(
            poseLandmarks,
            PoseLandmarker.POSE_CONNECTIONS,
            { color: "rgba(255,255,255,0.15)", lineWidth: 1 }
          );
        }

        // Dibujar landmarks de manos
        if (handLandmarksArray) {
          for (const handLm of handLandmarksArray) {
            drawingUtils.drawLandmarks(handLm, {
              radius: 3,
              color: result.detected
                ? "rgba(0,255,130,0.8)"
                : "rgba(255,200,0,0.6)",
            });
            drawingUtils.drawConnectors(
              handLm,
              HandLandmarker.HAND_CONNECTIONS,
              {
                color: result.detected
                  ? "rgba(0,255,130,0.4)"
                  : "rgba(255,200,0,0.3)",
                lineWidth: 2,
              }
            );
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(detectFrame);
  }, [updateHysteresis]);

  // ── API pública ────────────────────────────────────────────────
  const startDetection = useCallback(
    (video: HTMLVideoElement, overlayCanvas?: HTMLCanvasElement) => {
      videoRef.current = video;
      canvasRef.current = overlayCanvas ?? null;
      lastTimeRef.current = -1;
      rafRef.current = requestAnimationFrame(detectFrame);
    },
    [detectFrame]
  );

  const stopDetection = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (activationTimerRef.current) clearTimeout(activationTimerRef.current);
    if (deactivationTimerRef.current) clearTimeout(deactivationTimerRef.current);
    activationTimerRef.current = null;
    deactivationTimerRef.current = null;
    activeRef.current = false;
    setIsPoseActive(false);
  }, []);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      stopDetection();
      poseLandmarkerRef.current?.close();
      handLandmarkerRef.current?.close();
    };
  }, [stopDetection]);

  return {
    isPoseActive,
    currentScore,
    debugInfo,
    startDetection,
    stopDetection,
    loading,
    error,
  };
}
