import test from "node:test";
import assert from "node:assert/strict";
import {
  transitionPlan,
  fadeCurves,
  validateRange,
  fftMagnitude,
  extractFeatures,
  compareFeatures,
  synthesizeTrack,
  DEMOS,
} from "../dist/audio.js";

test("overlapping excerpts produce the correct incoming start and total duration", () => {
  assert.deepEqual(transitionPlan(16, 12, 4), {
    overlap: 4,
    incomingAt: 12,
    duration: 24,
  });
  assert.deepEqual(transitionPlan(3, 12, 9), {
    overlap: 3,
    incomingAt: 0,
    duration: 12,
  });
  assert.deepEqual(transitionPlan(16, 12, 0), {
    overlap: 0,
    incomingAt: 16,
    duration: 28,
  });
});
test("invalid timing inputs fail explicitly", () => {
  for (const input of [
    [NaN, 2, 1],
    [2, -1, 1],
    [2, 2, -1],
    [0, 1, 0],
  ])
    assert.throws(() => transitionPlan(...input));
  for (const input of [
    [3, 2, 4],
    [-1, 2, 4],
    [0, 5, 4],
    [0, 0.1, 4],
    [0, Infinity, 4],
  ])
    assert.throws(() => validateRange(...input));
  assert.deepEqual(validateRange(2, 4, 4), { start: 2, end: 4 });
});
test("equal-power fades preserve summed squared gain at every point", () => {
  const { out, incoming } = fadeCurves("equal");
  assert.equal(out[0], 1);
  assert.equal(incoming[0], 0);
  assert.ok(out.at(-1) < 1e-6);
  assert.equal(incoming.at(-1), 1);
  for (let i = 0; i < out.length; i++)
    assert.ok(Math.abs(out[i] ** 2 + incoming[i] ** 2 - 1) < 1e-6);
});
test("linear fades preserve summed amplitude", () => {
  const { out, incoming } = fadeCurves("linear");
  for (let i = 0; i < out.length; i++)
    assert.ok(Math.abs(out[i] + incoming[i] - 1) < 1e-6);
  assert.throws(() => fadeCurves("invalid"));
  assert.throws(() => fadeCurves("equal", 1));
});
test("FFT recovers a known spectral peak", () => {
  const n = 4096,
    bin = 82,
    x = Float32Array.from({ length: n }, (_, i) =>
      Math.sin((2 * Math.PI * bin * i) / n),
    );
  const magnitudes = fftMagnitude(x);
  assert.equal(magnitudes.indexOf(Math.max(...magnitudes)), bin);
  assert.throws(() => fftMagnitude(new Float32Array(100)));
});
test("silence and short excerpts do not receive a misleading compatibility score", () => {
  assert.equal(
    extractFeatures(new Float32Array(22050 * 3), 22050).valid,
    false,
  );
  assert.equal(extractFeatures(new Float32Array(22050), 22050).valid, false);
});
const features = DEMOS.map((d) =>
  extractFeatures(synthesizeTrack(d, 22050, 12), 22050),
);
test("demo pulse estimate recovers generated tempo within half/double-time ambiguity", () => {
  for (let i = 0; i < DEMOS.length; i++)
    assert.ok(
      Math.min(
        ...[0.5, 1, 2].map((m) => Math.abs(features[i].bpm * m - DEMOS[i].bpm)),
      ) <= 3,
      `${DEMOS[i].title}: ${features[i].bpm} vs ${DEMOS[i].bpm}`,
    );
});
test("identical audio scores 100, within floating-point rounding", () => {
  const result = compareFeatures(features[0], features[0]);
  assert.equal(result.score, 100);
  assert.equal(result.harmony, 100);
  assert.equal(result.energy, 100);
});
test("related demo pair scores above contrasting demo pair", () => {
  const related = compareFeatures(features[0], features[1]),
    contrast = compareFeatures(features[0], features[2]);
  assert.ok(
    related.score > contrast.score + 10,
    `related ${related.score}; contrast ${contrast.score}`,
  );
  for (const f of features) {
    const score = compareFeatures(features[0], f).score;
    assert.ok(Number.isFinite(score) && score >= 0 && score <= 100);
  }
});
test("loudness change decreases energy compatibility without altering chroma", () => {
  const quiet = extractFeatures(
    synthesizeTrack(DEMOS[0], 22050, 12).map((x) => x * 0.25),
    22050,
  );
  const result = compareFeatures(features[0], quiet);
  assert.equal(result.harmony, 100);
  assert.ok(result.energy < 35);
});
test("missing pulse reweights remaining metrics rather than inventing tempo", () => {
  const result = compareFeatures({ ...features[0], bpm: null }, features[0]);
  assert.equal(result.tempo, null);
  assert.equal(result.score, 100);
  assert.equal(result.uncertain, true);
});
