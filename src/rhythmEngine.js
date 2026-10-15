function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function createRhythmState({ width = 960, height = 540 } = {}) {
  return {
    width,
    height,
    beats: [],
    elapsedMs: 0,
    sinceSpawnMs: 0,
    spawnEveryMs: 700,
    speedPxPerMs: 0.26,
    hitLineY: height - 110,
    hitWindowPx: 34,
    score: 0,
    combo: 0,
    hits: 0,
    misses: 0,
    whiffs: 0,
    judgements: [],
  };
}

// Distance from the hit line, in pixels, for each grade and its base score.
export const GRADES = [
  { name: "perfect", within: 10, points: 50 },
  { name: "great", within: 22, points: 35 },
  { name: "good", within: 34, points: 22 },
];

export function judge(distancePx) {
  return GRADES.find((grade) => distancePx <= grade.within) ?? null;
}

// Beats come 20 ms closer together for every 10 hits, down to 380 ms. This
// used to subtract 1 ms on every frame while the hit count sat on a
// multiple of 10, so the speed-up depended on frame rate and how long you
// waited, and one quiet second at 10 hits took 60 ms off.
export function spawnIntervalFor(hits) {
  return Math.max(380, 700 - Math.floor(hits / 10) * 20);
}

// Lanes that went from not pressed to pressed this frame. A rhythm game
// scores the moment you hit, so holding a key (or an arm up) must not
// collect every beat that slides past.
export function newlyPressed(previous, current) {
  const before = new Set(previous);
  return [...new Set(current)].filter((lane) => !before.has(lane));
}

export function spawnBeat(state, randomFn = Math.random) {
  const lane = Math.floor(randomFn() * 3);
  const beat = {
    id: `${state.elapsedMs}-${state.beats.length}-${lane}`,
    lane,
    y: -20,
  };

  return {
    ...state,
    beats: [...state.beats, beat],
    sinceSpawnMs: 0,
  };
}

export function stepRhythm(state, dtMs, randomFn = Math.random) {
  let next = {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    sinceSpawnMs: state.sinceSpawnMs + dtMs,
    beats: state.beats.map((beat) => ({
      ...beat,
      y: beat.y + state.speedPxPerMs * dtMs,
    })),
  };

  if (next.sinceSpawnMs >= next.spawnEveryMs) {
    next = spawnBeat(next, randomFn);
  }

  const active = [];
  for (const beat of next.beats) {
    if (beat.y > next.height + 26) {
      next.misses += 1;
      next.combo = 0;
      continue;
    }
    active.push(beat);
  }

  next.beats = active;

  next.spawnEveryMs = spawnIntervalFor(next.hits);

  return next;
}

// Each pressed lane takes the beat nearest the line in that lane. A press
// with nothing in reach is a whiff and breaks the combo; without that,
// mashing every lane scored as well as playing.
export function applyLaneInputs(state, activeLanes) {
  if (!activeLanes || activeLanes.length === 0) {
    return state;
  }

  let { score, combo, hits, whiffs } = state;
  const judgements = [];
  const taken = new Set();

  for (const lane of new Set(activeLanes)) {
    let best = null;
    for (const beat of state.beats) {
      if (beat.lane !== lane) continue;
      const distance = Math.abs(beat.y - state.hitLineY);
      if (distance <= state.hitWindowPx && (!best || distance < best.distance)) {
        best = { beat, distance };
      }
    }
    if (!best) {
      whiffs += 1;
      combo = 0;
      judgements.push({ lane, grade: "whiff", at: state.elapsedMs });
      continue;
    }
    const grade = judge(best.distance);
    taken.add(best.beat);
    hits += 1;
    combo += 1;
    score += grade.points + clamp(combo, 0, 24);
    judgements.push({ lane, grade: grade.name, at: state.elapsedMs });
  }

  return {
    ...state,
    beats: state.beats.filter((beat) => !taken.has(beat)),
    score,
    combo,
    hits,
    whiffs,
    judgements: [...state.judgements, ...judgements].slice(-12),
  };
}

// Which lanes a pose is pressing. MediaPipe Pose landmarks 11/12 are the
// shoulders and 15/16 the wrists, named from the player's side. An arm
// counts as up once the wrist is clearly above the shoulder (RAISE) and as
// down only once it drops back to shoulder height (LOWER). With a single
// threshold, a wrist resting near it flickered up and down from landmark
// noise, and every flicker was a new press.
const RAISE = 0.06;
const LOWER = 0.0;

export function poseArms(points, previous = { left: false, right: false }) {
  const ls = points?.[11];
  const rs = points?.[12];
  const lw = points?.[15];
  const rw = points?.[16];
  if (!ls || !rs || !lw || !rw) {
    return { left: false, right: false };
  }
  const isUp = (wrist, shoulder, wasUp) =>
    wasUp ? wrist.y < shoulder.y - LOWER : wrist.y < shoulder.y - RAISE;
  return {
    left: isUp(lw, ls, previous.left),
    right: isUp(rw, rs, previous.right),
  };
}

// Left arm is the left lane, right arm the right lane, both arms the
// middle. Both arms used to press all three lanes at once.
export function armsToLanes({ left, right }) {
  if (left && right) return [1];
  if (left) return [0];
  if (right) return [2];
  return [];
}
