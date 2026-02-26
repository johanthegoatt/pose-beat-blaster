import test from "node:test";
import assert from "node:assert/strict";
import {
  createRhythmState,
  spawnBeat,
  stepRhythm,
  applyLaneInputs,
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
