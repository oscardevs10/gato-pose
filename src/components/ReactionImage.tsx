/**
 * ReactionImage.tsx
 * Muestra la imagen de reacción del gato (/gato-pose.jpg) cuando la pose es detectada.
 * Incluye animación suave de aparición y el badge flotante.
 */

import React from "react";

interface ReactionImageProps {
  visible: boolean;
  score?: number;
}

export const ReactionImage: React.FC<ReactionImageProps> = ({ visible, score }) => {
  return (
    <div
      className={`reaction-container ${visible ? "active" : ""}`}
      aria-hidden={!visible}
    >
      <div className="reaction-card">
        {/* Imagen del gato con puño */}
        <div className="reaction-img-wrapper">
          <img
            src="/assets/gato-pose.png"
            onError={(e) => {
              // Fallback si por alguna razón busca en la raíz
              (e.target as HTMLImageElement).src = "/gato-pose.jpg";
            }}
            alt="Gato meme puño"
            className="reaction-img"
          />
          {/* Overlay de resplandor */}
          <div className="reaction-glow" />
        </div>

        {/* Badge y mensaje */}
        <div className="reaction-badge-row">
          <span className="badge-detected">🟢 ¡POSE DETECTADA!</span>
          {score !== undefined && (
            <span className="badge-score">
              Match: {Math.round(score * 100)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
