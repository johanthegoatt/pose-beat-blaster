import test from "node:test";
import assert from "node:assert/strict";
import {
  createRhythmState,
  spawnBeat,
  stepRhythm,
  applyLaneInputs,
  newlyPressed,
  spawnIntervalFor,
  poseArms,
  armsToLanes,
  judge,
} from "../src/rhythmEngine.js";

test("spawnBeat assigns lane from random source", () => {
  const state = createRhythmState();
  const next = spawnBeat(state, () => 0.9);

  assert.equal(next.beats.length, 1);
  assert.equal(next.beats[0].lane, 2);
});

test("stepRhythm moves beats downward", () => {
  const state = createRhythmState();
  state.beats = [{ id: "a", lane: 1, y: 10 }];

  const next = stepRhythm(state, 100);
  assert.ok(next.beats[0].y > 10);
});

test("stepRhythm records misses when beats leave screen", () => {
  const state = createRhythmState({ width: 500, height: 300 });
  state.beats = [{ id: "old", lane: 0, y: 340 }];

  const next = stepRhythm(state, 16);
  assert.equal(next.misses, 1);
  assert.equal(next.combo, 0);
});

test("applyLaneInputs hits matching beat near line", () => {
  const state = createRhythmState();
  state.beats = [{ id: "beat", lane: 1, y: state.hitLineY - 10 }];

  const next = applyLaneInputs(state, [1]);
  assert.equal(next.beats.length, 0);
  assert.equal(next.hits, 1);
  assert.ok(next.score > 0);
});

test("applyLaneInputs keeps beat when wrong lane is pressed", () => {
  const state = createRhythmState();
  state.beats = [{ id: "beat", lane: 0, y: state.hitLineY }];

  const next = applyLaneInputs(state, [2]);
  assert.equal(next.beats.length, 1);
  assert.equal(next.hits, 0);
});

test("holding a lane only counts on the press", () => {
  assert.deepEqual(newlyPressed([], [0]), [0]);
  assert.deepEqual(newlyPressed([0], [0]), []);
  assert.deepEqual(newlyPressed([0], [0, 2]), [2]);
  assert.deepEqual(newlyPressed([0, 2], []), []);
});

test("the speed-up depends on hits, not on frames", () => {
  let state = createRhythmState();
  state.hits = 10;
  for (let i = 0; i < 60; i += 1) {
    state = stepRhythm(state, 16, () => 0.5);
  }
  assert.equal(state.spawnEveryMs, 680);
  assert.equal(spawnIntervalFor(0), 700);
  assert.equal(spawnIntervalFor(39), 640);
  assert.equal(spawnIntervalFor(500), 380);
});

function pose(leftWristY, rightWristY) {
  const points = [];
  points[11] = { y: 0.4 };
  points[12] = { y: 0.4 };
  points[15] = { y: leftWristY };
  points[16] = { y: rightWristY };
  return points;
}

test("an arm near shoulder height does not flicker between up and down", () => {
  let arms = { left: false, right: false };
  // Wrist wobbling just above the shoulder: never clearly raised.
  for (const y of [0.37, 0.36, 0.38, 0.37]) {
    arms = poseArms(pose(y, 0.6), arms);
    assert.equal(arms.left, false);
  }
  arms = poseArms(pose(0.3, 0.6), arms);
  assert.equal(arms.left, true);
  // Once up, the same wobble keeps it up.
  for (const y of [0.37, 0.36, 0.38]) {
    arms = poseArms(pose(y, 0.6), arms);
    assert.equal(arms.left, true);
  }
  arms = poseArms(pose(0.45, 0.6), arms);
  assert.equal(arms.left, false);
});

test("both arms press the middle lane only", () => {
  assert.deepEqual(armsToLanes({ left: true, right: true }), [1]);
  assert.deepEqual(armsToLanes({ left: true, right: false }), [0]);
  assert.deepEqual(armsToLanes({ left: false, right: true }), [2]);
  assert.deepEqual(armsToLanes({ left: false, right: false }), []);
  assert.deepEqual(armsToLanes(poseArms(undefined)), []);
});

test("closer to the line grades and scores higher", () => {
  assert.equal(judge(0).name, "perfect");
  assert.equal(judge(15).name, "great");
  assert.equal(judge(30).name, "good");
  assert.equal(judge(40), null);

  const at = (offset) => {
    const state = createRhythmState();
    state.beats = [{ id: "b", lane: 0, y: state.hitLineY + offset }];
    return applyLaneInputs(state, [0]);
  };
  assert.ok(at(2).score > at(15).score);
  assert.ok(at(15).score > at(30).score);
  assert.equal(at(2).judgements.at(-1).grade, "perfect");
});

test("a press with nothing in reach is a whiff and breaks the combo", () => {
  const state = createRhythmState();
  state.combo = 7;
  state.beats = [{ id: "far", lane: 0, y: 40 }];
  const next = applyLaneInputs(state, [0, 2]);
  assert.equal(next.combo, 0);
  assert.equal(next.whiffs, 2);
  assert.equal(next.hits, 0);
  assert.equal(next.beats.length, 1);
});

test("a press takes the beat nearest the line, not the first one spawned", () => {
  const state = createRhythmState();
  state.beats = [
    { id: "early", lane: 1, y: state.hitLineY + 30 },
    { id: "centred", lane: 1, y: state.hitLineY + 1 },
  ];
  const next = applyLaneInputs(state, [1]);
  assert.deepEqual(next.beats.map((b) => b.id), ["early"]);
  assert.equal(next.judgements.at(-1).grade, "perfect");
});
