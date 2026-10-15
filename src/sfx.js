// Synthesised sounds, so the game needs no audio files. The context starts
// on the first press because browsers block audio until a user gesture.
const LANE_NOTES = [261.63, 329.63, 392.0];
const GRADE_LIFT = { perfect: 2, great: 1.5, good: 1 };

export function createSfx(storage = globalThis.localStorage) {
  let ctx = null;
  let muted = false;
  try {
    muted = storage?.getItem("pbb:muted") === "1";
  } catch {}

  function audio() {
    if (muted) return null;
    if (!ctx) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, { type = "triangle", gain = 0.15, length = 0.18, slide = 1 } = {}) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * slide, t + length);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(amp).connect(ac.destination);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  return {
    unlock() {
      audio();
    },
    judgement({ lane, grade }) {
      if (grade === "whiff") {
        tone(110, { type: "sawtooth", gain: 0.06, length: 0.12, slide: 0.6 });
        return;
      }
      tone(LANE_NOTES[lane] * GRADE_LIFT[grade], { gain: grade === "perfect" ? 0.18 : 0.13 });
      if (grade === "perfect") tone(LANE_NOTES[lane] * 3, { type: "sine", gain: 0.05, length: 0.25 });
    },
    miss() {
      tone(90, { type: "square", gain: 0.04, length: 0.2, slide: 0.7 });
    },
    tick() {
      tone(880, { type: "sine", gain: 0.025, length: 0.05 });
    },
    get muted() {
      return muted;
    },
    toggle() {
      muted = !muted;
      try {
        storage?.setItem("pbb:muted", muted ? "1" : "0");
      } catch {}
      return muted;
    },
  };
}
