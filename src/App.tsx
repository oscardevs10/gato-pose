import React from "react";
import { PoseDetector } from "./components/PoseDetector";
import "./App.css";

export const App: React.FC = () => {
  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-badge">Detector de Poses AI</div>
        <h1 className="app-title">Meme del Gato 👊</h1>
        <p className="app-subtitle">
          Imita la pose del gato con el puño en la mejilla y desbloquea su reacción
        </p>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <PoseDetector />
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          Procesamiento 100% local en tu navegador con{" "}
          <span className="tech-badge">MediaPipe Tasks Vision</span> +{" "}
          <span className="tech-badge">React</span>
        </p>
      </footer>
    </div>
  );
};

export default App;
