import { createRhythmState, stepRhythm, applyLaneInputs } from "./src/rhythmEngine.js";

const elements = {
  canvas: document.getElementById("gameCanvas"),
  previewVideo: document.getElementById("previewVideo"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  poseBtn: document.getElementById("poseBtn"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  hits: document.getElementById("hits"),
  misses: document.getElementById("misses"),
  laneMode: document.getElementById("laneMode"),
  status: document.getElementById("status"),
};

const context = elements.canvas.getContext("2d");

const appState = {
  engine: createRhythmState({ width: elements.canvas.width, height: elements.canvas.height }),
  running: false,
  lastFrameAt: 0,
  controlMode: "keyboard",
  poseModel: null,
  poseModelLoading: false,
  stream: null,
  keyboardLanes: new Set(),
};

function setStatus(text) {
  elements.status.textContent = text;
}

function setControlMode(mode) {
  appState.controlMode = mode;
  elements.laneMode.textContent = mode;
}

function laneX(lane, width) {
  const laneWidth = width / 3;
  return laneWidth * lane + laneWidth / 2;
}

function drawScene() {
  const { engine } = appState;
  context.fillStyle = "#10182c";
  context.fillRect(0, 0, engine.width, engine.height);

  const laneWidth = engine.width / 3;
  for (let lane = 0; lane < 3; lane += 1) {
    context.fillStyle = lane % 2 === 0 ? "rgba(93,95,239,0.16)" : "rgba(255,107,138,0.16)";
    context.fillRect(lane * laneWidth, 0, laneWidth, engine.height);

    context.strokeStyle = "rgba(255,255,255,0.16)";
    context.strokeRect(lane * laneWidth, 0, laneWidth, engine.height);
  }

  context.strokeStyle = "rgba(255, 255, 255, 0.9)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, engine.hitLineY);
  context.lineTo(engine.width, engine.hitLineY);
  context.stroke();

  for (const beat of engine.beats) {
    context.fillStyle = beat.lane === 1 ? "#ff6b8a" : "#5d5fef";
    context.beginPath();
    context.arc(laneX(beat.lane, engine.width), beat.y, 18, 0, Math.PI * 2);
    context.fill();
  }
}

function syncStats() {
  elements.score.textContent = String(appState.engine.score);
  elements.combo.textContent = String(appState.engine.combo);
  elements.hits.textContent = String(appState.engine.hits);
  elements.misses.textContent = String(appState.engine.misses);
}

function derivePoseLanes(result) {
  if (!result?.landmarks?.length) {
    return [];
  }

  const points = result.landmarks[0];
  const leftShoulder = points[11];
  const rightShoulder = points[12];
  const leftWrist = points[15];
  const rightWrist = points[16];

  if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist) {
    return [];
  }

  const active = [];
  const leftUp = leftWrist.y < leftShoulder.y - 0.03;
  const rightUp = rightWrist.y < rightShoulder.y - 0.03;

  if (leftUp) active.push(0);
  if (rightUp) active.push(2);
  if (leftUp && rightUp) active.push(1);

  return active;
}

function currentActiveLanes() {
  if (appState.controlMode === "keyboard") {
    return [...appState.keyboardLanes];
  }

  if (!appState.poseModel || !appState.stream || elements.previewVideo.readyState < 2) {
    return [];
  }

  try {
    const result = appState.poseModel.detectForVideo(elements.previewVideo, performance.now());
    return derivePoseLanes(result);
  } catch (error) {
    console.error(error);
    setControlMode("keyboard");
    setStatus("Pose tracking error. Switched to keyboard mode.");
    return [...appState.keyboardLanes];
  }
}

function animate(timestamp) {
  if (!appState.lastFrameAt) {
    appState.lastFrameAt = timestamp;
  }

  const dt = Math.min(timestamp - appState.lastFrameAt, 100);
  appState.lastFrameAt = timestamp;

  if (appState.running) {
    appState.engine = stepRhythm(appState.engine, dt);
    appState.engine = applyLaneInputs(appState.engine, currentActiveLanes());
  }

  drawScene();
  syncStats();
  requestAnimationFrame(animate);
}

async function loadPoseModel() {
  if (appState.poseModel || appState.poseModelLoading) {
    return appState.poseModel;
  }

  appState.poseModelLoading = true;
  setStatus("Loading pose model...");

  try {
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
    const fileset = await vision.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
    );

    appState.poseModel = await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
      },
      runningMode: "VIDEO",
      numPoses: 1,
    });

    setStatus("Pose model ready");
    return appState.poseModel;
  } catch (error) {
    console.error(error);
    setStatus("Pose model unavailable. Keyboard mode only.");
    return null;
  } finally {
    appState.poseModelLoading = false;
  }
}

async function enablePoseControl() {
  const model = await loadPoseModel();
  if (!model) {
    setControlMode("keyboard");
    return;
  }

  try {
    if (!appState.stream) {
      appState.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          facingMode: "user",
        },
        audio: false,
      });

      elements.previewVideo.srcObject = appState.stream;
      await elements.previewVideo.play();
    }

    setControlMode("pose");
    setStatus("Pose control enabled");
  } catch (error) {
    console.error(error);
    setControlMode("keyboard");
    setStatus("Camera denied. Keyboard mode active.");
  }
}

function startSession() {
  appState.engine = createRhythmState({ width: elements.canvas.width, height: elements.canvas.height });
  appState.running = true;
  appState.lastFrameAt = 0;
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  setStatus("Session running");
}

function stopSession() {
  appState.running = false;
  appState.lastFrameAt = 0;
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  setStatus("Session stopped");
}

function stopCamera() {
  if (!appState.stream) {
    return;
  }

  appState.stream.getTracks().forEach((track) => track.stop());
  appState.stream = null;
  elements.previewVideo.srcObject = null;
}

elements.startBtn.addEventListener("click", startSession);
elements.stopBtn.addEventListener("click", stopSession);
elements.poseBtn.addEventListener("click", enablePoseControl);

document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "a") appState.keyboardLanes.add(0);
  if (event.key.toLowerCase() === "s") appState.keyboardLanes.add(1);
  if (event.key.toLowerCase() === "d") appState.keyboardLanes.add(2);
});

document.addEventListener("keyup", (event) => {
  if (event.key.toLowerCase() === "a") appState.keyboardLanes.delete(0);
  if (event.key.toLowerCase() === "s") appState.keyboardLanes.delete(1);
  if (event.key.toLowerCase() === "d") appState.keyboardLanes.delete(2);
});

window.addEventListener("beforeunload", () => {
  stopCamera();
});

drawScene();
syncStats();
requestAnimationFrame(animate);
