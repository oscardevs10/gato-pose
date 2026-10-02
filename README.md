# 🐱 Gato Pose Detector — Meme Interaction App

Aplicación web interactiva desarrollada con **React**, **TypeScript**, **Vite** y **MediaPipe Tasks Vision**. La app analiza la cámara del usuario en tiempo real y 100% de forma local en el navegador para detectar cuando la persona realiza la pose del meme del gato con puño cerrado en la mejilla (👊). Al detectarla, despliega una reacción visual animada del meme con puntuación de coincidencia y feedback en vivo.

---

## 🚀 Características

- **Procesamiento 100% Local**: Sin enviar fotogramas a servidores externos ni APIs de terceros. Ejecución por WebAssembly y aceleración GPU local con `@mediapipe/tasks-vision`.
- **Detección Geométrica Multi-Criterio**:
  - Detección de puño cerrado vía `HandLandmarker` (21 landmarks por mano).
  - Medición del ángulo del codo (~60° a 120°) vía `PoseLandmarker` (33 landmarks corporales).
  - Proximidad relativa de la mano a la zona de la mejilla/nariz.
  - Alineación vertical y lateral respecto al rostro.
- **Hysteresis y Debounce Antiflicker**:
  - Exige mantener la pose durante un tiempo continuo antes de activar la imagen.
  - Mantiene la imagen visible con gracia de tiempo tras perder la pose, evitando parpadeos bruscos.
- **Soporte Modo Espejo (Selfie)**: Coordenadas normalizadas `[0.0, 1.0]` independientes de resolución y orientación de cámara.
- **UI Moderna en Tema Oscuro**:
  - Viewport redondeado con visualización del stream de video y canvas overlay con landmarks.
  - Barra de estado en vivo con barra de progreso y porcentaje de match (`0% – 100%`).
  - Panel de depuración desplegable con métricas detalladas en tiempo real.
  - Conmutador para cámaras traseras/frontales en dispositivos móviles.

---

## 📦 Instalación

1. Asegúrate de tener instalado [Node.js](https://nodejs.org/) (versión 18 o superior recomendada).
2. Abre una terminal en el directorio del proyecto:
   ```bash
   cd C:\Users\siste\Documents\Gato\gato-pose
   ```
3. Instala las dependencias:
   ```bash
   npm install
   ```

---

## ⚡ Cómo Ejecutar

Para iniciar el servidor de desarrollo local con Vite:

```bash
npm run dev
```

Una vez ejecutado, abre en tu navegador la URL que aparece en la terminal (usualmente `http://localhost:5173`).

Para compilar para producción:
```bash
npm run build
npm run preview
```

---

## 📷 Cómo Dar Permisos de Cámara

La aplicación requiere acceso al hardware de la cámara mediante la API estándar `getUserMedia()`.

### En PC / Escritorio (Google Chrome, Microsoft Edge, Brave):
1. Al abrir la app, el navegador mostrará una ventana emergente preguntando: *"localhost:5173 quiere usar tu cámara"*.
2. Haz clic en **"Permitir"** (**Allow**).
3. Si lo bloqueaste por error o cerraste el diálogo:
   - Haz clic en el ícono de **candado** o **ajustes del sitio** a la izquierda de la barra de direcciones (`URL`).
   - Busca la opción **Cámara** y cámbiala a **Permitir**.
   - Haz clic en el botón **"ACTIVAR CÁMARA"** en la pantalla o recarga la página (`F5`).

### En Safari (macOS / iOS):
1. Toca o haz clic en **Permitir** cuando el navegador lo solicite.
2. Si fue denegado, ve a *Preferencias/Ajustes > Sitios web > Cámara* y asegúrate de permitir el acceso para la página.

### En Dispositivos Móviles (Android / iOS):
1. Concede el permiso del navegador cuando el diálogo del sistema lo solicite.
2. Puedes usar el botón **🔄** situado en la esquina inferior derecha del video para alternar entre la cámara frontal (selfie) y la trasera.

---

## 🖼️ Cómo Cambiar la Imagen de Reacción

La imagen mostrada al detectar la pose está ubicada en la carpeta pública:

```
public/assets/gato-pose.png
```

Para reemplazarla por otra imagen:
1. Prepara tu nueva imagen (en formato PNG, JPG o WebP).
2. Nómbrala `gato-pose.png` y sobrescribe el archivo en:
   ```
   gato-pose/public/assets/gato-pose.png
   ```
3. Alternativamente, puedes colocar una imagen con otro nombre y cambiar la ruta en `src/components/ReactionImage.tsx`:
   ```tsx
   <img
     src="/assets/tu-nueva-imagen.png"
     alt="Reacción Meme"
     className="reaction-img"
   />
   ```

---

## 🎚️ Cómo Modificar la Sensibilidad de Detección

La sensibilidad de detección se controla mediante el umbral `POSE_DETECTION_THRESHOLD` en `src/utils/poseDetection.ts`:

```typescript
// src/utils/poseDetection.ts (Línea 16)
export const POSE_DETECTION_THRESHOLD = 0.55; 
```

- **Para hacer la detección MÁS TOLERANTE (detecta más fácil):**
  Baja el valor, por ejemplo a `0.45` o `0.50`:
  ```typescript
  export const POSE_DETECTION_THRESHOLD = 0.45;
  ```
- **Para hacer la detección MÁS ESTRICTA (evita falsos positivos):**
  Sube el valor, por ejemplo a `0.65` o `0.70`:
  ```typescript
  export const POSE_DETECTION_THRESHOLD = 0.65;
  ```

### Ajuste de ponderaciones de los criterios
Si deseas dar más peso al puño o a la cercanía con la cara, puedes modificar los factores de ponderación en `src/utils/poseDetection.ts` (alrededor de la línea 296):

```typescript
const weights = {
  fist: 0.25,       // Importancia del puño cerrado
  proximity: 0.30,  // Importancia de la cercanía a la nariz/mejilla
  height: 0.20,     // Importancia de la altura respecto a la mejilla
  lateral: 0.10,    // Importancia de la posición lateral
  elbow: 0.15,      // Importancia del ángulo del codo doblado
};
```

---

## ⏱️ Cómo Modificar los Tiempos de Activación y Desactivación

Para evitar que la reacción parpadee o aparezca ante movimientos fugaces, se utiliza una máquina de estados con **histeresis**. Los tiempos se configuran en `src/hooks/usePoseDetection.ts`:

```typescript
// src/hooks/usePoseDetection.ts (Líneas 23-25)

/** Milisegundos que la pose debe mantenerse detectada de forma continua antes de activar la imagen */
const ACTIVATION_DELAY_MS = 300;

/** Milisegundos que deben transcurrir sin detectar la pose antes de ocultar la imagen */
const DEACTIVATION_DELAY_MS = 700;
```

- **ACTIVATION_DELAY_MS**:
  - `300` ms (por defecto): respuesta rápida pero firme.
  - `150` ms: activación casi instantánea al colocar la pose.
  - `500` ms: requiere sostener la pose más tiempo conscientemente.
- **DEACTIVATION_DELAY_MS**:
  - `700` ms (por defecto): tiempo suficiente para cambiar de expresión o parpadear sin que la imagen se cierre bruscamente.
  - `400` ms: la imagen desaparece más rápido al quitar el puño.
  - `1000` ms: la imagen permanece más tiempo en pantalla tras desarmar la pose.

---

## 📁 Estructura del Código

```
gato-pose/
├── public/
│   └── assets/
│       └── gato-pose.png       <-- Imagen de reacción del meme
├── src/
│   ├── components/
│   │   ├── Camera.tsx          <-- Manejo de getUserMedia, video y canvas
│   │   ├── PoseDetector.tsx    <-- Vista principal, status bar, debug panel
│   │   └── ReactionImage.tsx   <-- Componente y animaciones de la imagen meme
│   ├── hooks/
│   │   └── usePoseDetection.ts <-- Carga de MediaPipe y loop con hysteresis
│   ├── utils/
│   │   └── poseDetection.ts    <-- Lógica geométrica pura detectTargetPose()
│   ├── App.tsx                 <-- Layout raíz
│   ├── App.css                 <-- Estilos, diseño responsive y tema oscuro
│   └── main.tsx                <-- Entrypoint React
└── README.md
```

---

## 🛠️ Tecnologías Empleadas

- **React 19** + **TypeScript**
- **Vite 6**
- **@mediapipe/tasks-vision** (`PoseLandmarker` y `HandLandmarker`)
- **HTML5 Canvas & WebRTC API**
