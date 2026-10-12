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
  };
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

export function applyLaneInputs(state, activeLanes) {
  if (!activeLanes || activeLanes.length === 0) {
    return state;
  }

  const laneSet = new Set(activeLanes);
  const remaining = [];
  const matchedByLane = new Map();

  for (const beat of state.beats) {
    const distance = Math.abs(beat.y - state.hitLineY);
    const isMatchWindow = distance <= state.hitWindowPx;

    if (laneSet.has(beat.lane) && isMatchWindow && !matchedByLane.has(beat.lane)) {
      matchedByLane.set(beat.lane, beat);
      continue;
    }

    remaining.push(beat);
  }

  if (matchedByLane.size === 0) {
    return {
      ...state,
      beats: remaining,
    };
  }

  const hitCount = matchedByLane.size;
  const nextCombo = state.combo + hitCount;

  return {
    ...state,
    beats: remaining,
    hits: state.hits + hitCount,
    combo: nextCombo,
    score: state.score + hitCount * (22 + clamp(nextCombo, 0, 24)),
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
