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

  if (next.hits > 0 && next.hits % 10 === 0) {
    next.spawnEveryMs = Math.max(380, next.spawnEveryMs - 1);
  }

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
