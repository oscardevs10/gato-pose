/**
 * poseDetection.ts
 * Lógica de detección de la pose del puño cerca de la mejilla.
 * Inspirada en el meme del gato con el emoji 👊.
 *
 * Ajusta POSE_DETECTION_THRESHOLD para cambiar la sensibilidad.
 * 0.0 = detecta siempre | 1.0 = casi nunca detecta
 */

import type {
  NormalizedLandmark,
  Landmark,
} from "@mediapipe/tasks-vision";

// ─── Configuración ────────────────────────────────────────────────
export const POSE_DETECTION_THRESHOLD = 0.55; // baja para más tolerancia

/** Umbral de confianza mínimo para que un landmark sea válido */
const VISIBILITY_THRESHOLD = 0.4;

// Índices de landmarks de MediaPipe Pose
const POSE_LANDMARKS = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const;

// Índices de landmarks de MediaPipe Hands (21 puntos por mano)
const HAND_LANDMARKS = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_FINGER_MCP: 5,
  INDEX_FINGER_PIP: 6,
  INDEX_FINGER_DIP: 7,
  INDEX_FINGER_TIP: 8,
  MIDDLE_FINGER_MCP: 9,
  MIDDLE_FINGER_PIP: 10,
  MIDDLE_FINGER_DIP: 11,
  MIDDLE_FINGER_TIP: 12,
  RING_FINGER_MCP: 13,
  RING_FINGER_PIP: 14,
  RING_FINGER_DIP: 15,
  RING_FINGER_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

// ─── Tipos ────────────────────────────────────────────────────────
export interface PoseResult {
  detected: boolean;
  score: number;
  debugInfo: Record<string, number>;
}

// ─── Utilidades de geometría ──────────────────────────────────────

/** Distancia euclidiana 2D entre dos landmarks normalizados */
function dist2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Ángulo en el vértice B formado por los segmentos BA y BC (en grados) */
function angleDeg(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark
): number {
  const ax = a.x - b.x;
  const ay = a.y - b.y;
  const cx = c.x - b.x;
  const cy = c.y - b.y;
  const dot = ax * cx + ay * cy;
  const magA = Math.sqrt(ax * ax + ay * ay);
  const magC = Math.sqrt(cx * cx + cy * cy);
  if (magA === 0 || magC === 0) return 180;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magA * magC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

/** Comprueba si un landmark tiene visibilidad suficiente */
function isVisible(lm: Landmark | NormalizedLandmark): boolean {
  return (lm.visibility ?? 1) >= VISIBILITY_THRESHOLD;
}

// ─── Detección de puño cerrado ────────────────────────────────────

/**
 * Detecta si una mano está cerrada en forma de puño.
 * Se evalúa si las puntas de los dedos están por debajo de sus MCPs (en Y normalizada).
 * En el sistema de coordenadas de MediaPipe, Y aumenta hacia abajo.
 */
function isFistClosed(handLandmarks: NormalizedLandmark[]): number {
  if (handLandmarks.length < 21) return 0;

  const fingers = [
    // [TIP, MCP]
    [HAND_LANDMARKS.INDEX_FINGER_TIP, HAND_LANDMARKS.INDEX_FINGER_MCP],
    [HAND_LANDMARKS.MIDDLE_FINGER_TIP, HAND_LANDMARKS.MIDDLE_FINGER_MCP],
    [HAND_LANDMARKS.RING_FINGER_TIP, HAND_LANDMARKS.RING_FINGER_MCP],
    [HAND_LANDMARKS.PINKY_TIP, HAND_LANDMARKS.PINKY_MCP],
  ];

  let closedCount = 0;
  for (const [tipIdx, mcpIdx] of fingers) {
    const tip = handLandmarks[tipIdx];
    const mcp = handLandmarks[mcpIdx];
    // Un dedo está "cerrado" cuando su punta está por debajo de su nudillo (tip.y > mcp.y en coords normalizadas)
    if (tip.y > mcp.y) closedCount++;
  }

  return closedCount / fingers.length; // 0.0–1.0
}

// ─── Función principal de detección ──────────────────────────────

/**
 * detectTargetPose()
 *
 * Detecta la pose del puño cerca de la mejilla (equivalente humano del gato 👊).
 *
 * Criterios evaluados:
 * 1. Al menos una mano detectada
 * 2. El puño está cerca de la zona nariz/mejilla
 * 3. El brazo está doblado (ángulo de codo < 130°)
 * 4. La mano está a la altura de la cara (±20% de la nariz en Y)
 * 5. La mano está al lado de la cara (no demasiado lejos horizontalmente)
 * 6. La mano parece cerrada (puño)
 *
 * @param poseLandmarks - Array de 33 landmarks de PoseLandmarker (puede ser null)
 * @param handLandmarksArray - Array de arrays de 21 landmarks de HandLandmarker
 * @param handednesses - Array de "Left"/"Right" para cada mano detectada
 */
export function detectTargetPose(
  poseLandmarks: NormalizedLandmark[] | null,
  handLandmarksArray: NormalizedLandmark[][] | null,
  handednesses: string[]
): PoseResult {
  const debugInfo: Record<string, number> = {
    handDetected: 0,
    fistScore: 0,
    proximityScore: 0,
    elbowAngleScore: 0,
    heightScore: 0,
    lateralScore: 0,
    totalScore: 0,
  };

  // Sin manos detectadas → no hay pose
  if (!handLandmarksArray || handLandmarksArray.length === 0) {
    return { detected: false, score: 0, debugInfo };
  }

  debugInfo.handDetected = 1;

  // Referencia facial desde pose landmarks (si disponibles)
  let nosePos: NormalizedLandmark | null = null;
  let leftWristPose: NormalizedLandmark | null = null;
  let rightWristPose: NormalizedLandmark | null = null;
  let leftElbow: NormalizedLandmark | null = null;
  let rightElbow: NormalizedLandmark | null = null;
  let leftShoulder: NormalizedLandmark | null = null;
  let rightShoulder: NormalizedLandmark | null = null;

  if (poseLandmarks && poseLandmarks.length >= 17) {
    nosePos = poseLandmarks[POSE_LANDMARKS.NOSE];
    leftWristPose = poseLandmarks[POSE_LANDMARKS.LEFT_WRIST];
    rightWristPose = poseLandmarks[POSE_LANDMARKS.RIGHT_WRIST];
    leftElbow = poseLandmarks[POSE_LANDMARKS.LEFT_ELBOW];
    rightElbow = poseLandmarks[POSE_LANDMARKS.RIGHT_ELBOW];
    leftShoulder = poseLandmarks[POSE_LANDMARKS.LEFT_SHOULDER];
    rightShoulder = poseLandmarks[POSE_LANDMARKS.RIGHT_SHOULDER];
  }

  // Para la detección de cara, estimamos la posición facial desde hand landmarks si no hay pose
  // La nariz suele estar en ~(0.5, 0.35) en encuadre típico de selfie
  const faceRef: NormalizedLandmark = nosePos ?? { x: 0.5, y: 0.35, z: 0, visibility: 1 };

  // Evalúa cada mano detectada: guardamos la mejor puntuación
  let bestScore = 0;
  let bestFistScore = 0;
  let bestProximityScore = 0;
  let bestElbowScore = 0;
  let bestHeightScore = 0;
  let bestLateralScore = 0;

  for (let i = 0; i < handLandmarksArray.length; i++) {
    const hand = handLandmarksArray[i];
    if (hand.length < 21) continue;

    const handedness = handednesses[i] ?? "Unknown";

    // Punto de referencia de la mano: muñeca o palma
    const wrist = hand[HAND_LANDMARKS.WRIST];
    // Punto central de la palma (promedio de MCPs)
    const palmCenter: NormalizedLandmark = {
      x:
        (hand[HAND_LANDMARKS.INDEX_FINGER_MCP].x +
          hand[HAND_LANDMARKS.MIDDLE_FINGER_MCP].x +
          hand[HAND_LANDMARKS.RING_FINGER_MCP].x) /
        3,
      y:
        (hand[HAND_LANDMARKS.INDEX_FINGER_MCP].y +
          hand[HAND_LANDMARKS.MIDDLE_FINGER_MCP].y +
          hand[HAND_LANDMARKS.RING_FINGER_MCP].y) /
        3,
      z: wrist.z,
      visibility: 1,
    };

    // ── 1. Puño cerrado ─────────────────────────────────────────
    const fistRatio = isFistClosed(hand);

    // ── 2. Proximidad a la cara ─────────────────────────────────
    // Distancia normalizada de la palma a la nariz
    const distToNose = dist2d(palmCenter, faceRef);

    // La cabeza ocupa ~0.15–0.25 de la imagen en ancho normal
    // "Cerca de la cara" significa distancia < ~0.25 de la imagen
    // Proximity score: 1.0 si distancia = 0, 0.0 si distancia > 0.4
    const proximityScore = Math.max(0, 1 - distToNose / 0.35);

    // ── 3. Altura de la mano respecto a la cara ─────────────────
    // La mano debe estar aproximadamente a la altura de nariz ± margen
    const deltaY = Math.abs(palmCenter.y - faceRef.y);
    // Toleramos ±0.20 de imagen en altura
    const heightScore = Math.max(0, 1 - deltaY / 0.22);

    // ── 4. La mano está al lado (no encima/debajo muy lejos) ────
    const deltaX = Math.abs(palmCenter.x - faceRef.x);
    // Debe estar al lado: esperamos 0.05–0.30 de distancia horizontal
    // (si está exactamente sobre la nariz es raro; si está muy lejos, tampoco)
    const lateralScore =
      deltaX < 0.04
        ? 0.5 // justo encima → menos probable pero tolerable
        : Math.max(0, 1 - Math.max(0, deltaX - 0.08) / 0.30);

    // ── 5. Ángulo del codo doblado ──────────────────────────────
    let elbowAngleScore = 0.5; // valor neutro si no hay pose

    if (poseLandmarks) {
      // Determina qué brazo usar según la mano detectada
      // Nota: MediaPipe devuelve "Left"/"Right" en espejo
      let shoulder: NormalizedLandmark | null = null;
      let elbow: NormalizedLandmark | null = null;
      let wristPose: NormalizedLandmark | null = null;

      if (handedness === "Left") {
        // En espejo, "Left" de la cámara es el brazo derecho del usuario
        shoulder = rightShoulder;
        elbow = rightElbow;
        wristPose = rightWristPose;
      } else {
        shoulder = leftShoulder;
        elbow = leftElbow;
        wristPose = leftWristPose;
      }

      if (
        shoulder && elbow && wristPose &&
        isVisible(shoulder) && isVisible(elbow) && isVisible(wristPose)
      ) {
        const angle = angleDeg(shoulder, elbow, wristPose);
        // El codo debe estar doblado: ideal ~60–110°
        // Penalizamos codo extendido (>140°) y hyper-doblado (<30°)
        if (angle < 30) {
          elbowAngleScore = 0.4;
        } else if (angle < 60) {
          elbowAngleScore = 0.7 + ((60 - angle) / 30) * 0.1;
        } else if (angle <= 120) {
          elbowAngleScore = 1.0;
        } else if (angle <= 150) {
          elbowAngleScore = 1.0 - ((angle - 120) / 30) * 0.7;
        } else {
          elbowAngleScore = 0.1; // brazo extendido
        }
      }
    }

    // ── Score total para esta mano ──────────────────────────────
    // Pesos: puño y proximidad son los más importantes
    const weights = {
      fist: 0.25,
      proximity: 0.30,
      height: 0.20,
      lateral: 0.10,
      elbow: 0.15,
    };

    const score =
      fistRatio * weights.fist +
      proximityScore * weights.proximity +
      heightScore * weights.height +
      lateralScore * weights.lateral +
      elbowAngleScore * weights.elbow;

    if (score > bestScore) {
      bestScore = score;
      bestFistScore = fistRatio;
      bestProximityScore = proximityScore;
      bestElbowScore = elbowAngleScore;
      bestHeightScore = heightScore;
      bestLateralScore = lateralScore;
    }
  }

  debugInfo.fistScore = bestFistScore;
  debugInfo.proximityScore = bestProximityScore;
  debugInfo.elbowAngleScore = bestElbowScore;
  debugInfo.heightScore = bestHeightScore;
  debugInfo.lateralScore = bestLateralScore;
  debugInfo.totalScore = bestScore;

  return {
    detected: bestScore >= POSE_DETECTION_THRESHOLD,
    score: bestScore,
    debugInfo,
  };
}
