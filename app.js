import {
  createRhythmState,
  stepRhythm,
  applyLaneInputs,
  newlyPressed,
  poseArms,
  armsToLanes,
} from "./src/rhythmEngine.js";
import { createSfx } from "./src/sfx.js";

const sfx = createSfx();

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
  muteBtn: document.getElementById("muteBtn"),
  best: document.getElementById("best"),
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
  pointerLanes: new Map(),
  best: loadBest(),
  heldLanes: [],
  arms: { left: false, right: false },
  lastPose: null,
};

function loadBest() {
  try {
    return Number(localStorage.getItem("pbb:best")) || 0;
  } catch {
    return 0;
  }
}

function manualLanes() {
  return [...new Set([...appState.keyboardLanes, ...appState.pointerLanes.values()])];
}

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

  const colours = { perfect: "#ffe066", great: "#7cf0c5", good: "#b9c3ff", whiff: "#ff6b8a" };
  context.textAlign = "center";
  context.font = "800 26px Manrope, sans-serif";
  const shown = new Set();
  for (const mark of [...engine.judgements].reverse()) {
    const age = engine.elapsedMs - mark.at;
    if (age > 500 || shown.has(mark.lane)) continue;
    shown.add(mark.lane);
    const fade = 1 - age / 500;
    const x = laneX(mark.lane, engine.width);
    context.globalAlpha = fade * 0.35;
    context.fillStyle = colours[mark.grade];
    context.fillRect(mark.lane * laneWidth, engine.hitLineY - 40, laneWidth, 80);
    context.globalAlpha = fade;
    context.fillText(mark.grade.toUpperCase(), x, engine.hitLineY - 52 - age * 0.06);
  }
  context.globalAlpha = 1;

  for (const beat of engine.beats) {
    context.fillStyle = beat.lane === 1 ? "#ff6b8a" : "#5d5fef";
    context.beginPath();
    context.arc(laneX(beat.lane, engine.width), beat.y, 18, 0, Math.PI * 2);
    context.fill();
  }

  drawPoseInset(engine);
}

// A mirrored camera inset with the tracked shoulders and wrists, so players
// can see whether an arm counts as up before the beat arrives.
function drawPoseInset(engine) {
  const video = elements.previewVideo;
  if (appState.controlMode !== "pose" || !appState.stream || video.readyState < 2) return;
  const w = 224;
  const h = Math.round((w * (video.videoHeight || 9)) / (video.videoWidth || 16));
  const x0 = engine.width - w - 14;
  const y0 = 14;
  context.save();
  context.translate(x0 + w, y0);
  context.scale(-1, 1);
  context.globalAlpha = 0.85;
  context.drawImage(video, 0, 0, w, h);
  context.globalAlpha = 1;
  const pose = appState.lastPose;
  if (pose?.[11] && pose?.[12]) {
    context.strokeStyle = "rgba(255,255,255,0.8)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(pose[11].x * w, pose[11].y * h);
    context.lineTo(pose[12].x * w, pose[12].y * h);
    context.stroke();
    for (const [index, up] of [[15, appState.arms.left], [16, appState.arms.right]]) {
      if (!pose[index]) continue;
      context.fillStyle = up ? "#7cf0c5" : "#ff6b8a";
      context.beginPath();
      context.arc(pose[index].x * w, pose[index].y * h, 7, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
  context.strokeStyle = "rgba(255,255,255,0.5)";
  context.strokeRect(x0, y0, w, h);
}

function syncStats() {
  elements.score.textContent = String(appState.engine.score);
  elements.combo.textContent = String(appState.engine.combo);
  elements.hits.textContent = String(appState.engine.hits);
  elements.misses.textContent = String(appState.engine.misses + appState.engine.whiffs);
  elements.best.textContent = String(Math.max(appState.best, appState.engine.score));
}

function derivePoseLanes(result) {
  appState.lastPose = result?.landmarks?.[0] ?? null;
  appState.arms = poseArms(result?.landmarks?.[0], appState.arms);
  return armsToLanes(appState.arms);
}

function currentActiveLanes() {
  if (appState.controlMode === "keyboard") {
    return manualLanes();
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
    return manualLanes();
  }
}

function animate(timestamp) {
  if (!appState.lastFrameAt) {
    appState.lastFrameAt = timestamp;
  }

  const dt = Math.min(timestamp - appState.lastFrameAt, 100);
  appState.lastFrameAt = timestamp;

  if (appState.running) {
    const before = appState.engine;
    appState.engine = stepRhythm(before, dt);
    if (appState.engine.misses > before.misses) sfx.miss();
    if (appState.engine.beats.length > before.beats.length) sfx.tick();
    const held = currentActiveLanes();
    const judged = appState.engine.judgements;
    appState.engine = applyLaneInputs(appState.engine, newlyPressed(appState.heldLanes, held));
    appState.engine.judgements.filter((mark) => !judged.includes(mark)).forEach((mark) => sfx.judgement(mark));
    appState.heldLanes = held;
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
  sfx.unlock();
  appState.engine = createRhythmState({ width: elements.canvas.width, height: elements.canvas.height });
  appState.running = true;
  appState.lastFrameAt = 0;
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  setStatus("Session running");
}

function stopSession() {
  appState.running = false;
  const { score } = appState.engine;
  if (score > appState.best) {
    appState.best = score;
    try {
      localStorage.setItem("pbb:best", String(score));
    } catch {}
    setStatus(`New best: ${score}`);
  } else {
    setStatus(`Session stopped. Best ${appState.best}`);
  }
  syncStats();
  appState.lastFrameAt = 0;
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
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

function syncMute() {
  elements.muteBtn.textContent = sfx.muted ? "Sound off" : "Sound on";
  elements.muteBtn.setAttribute("aria-pressed", String(sfx.muted));
}
elements.muteBtn.addEventListener("click", () => {
  sfx.toggle();
  syncMute();
});
syncMute();

// Tapping a lane on the canvas presses it, for phones and tablets without a
// keyboard. Each finger is tracked so two-lane chords work.
function laneAt(event) {
  const rect = elements.canvas.getBoundingClientRect();
  return Math.min(2, Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * 3)));
}
elements.canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  sfx.unlock();
  elements.canvas.setPointerCapture?.(event.pointerId);
  appState.pointerLanes.set(event.pointerId, laneAt(event));
});
for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  elements.canvas.addEventListener(type, (event) => appState.pointerLanes.delete(event.pointerId));
}

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
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
