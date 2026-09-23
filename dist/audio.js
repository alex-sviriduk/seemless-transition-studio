// Pure audio mathematics shared by the browser, analysis worker, and Node tests.
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function validateRange(start, end, duration) {
  if (
    ![start, end, duration].every(Number.isFinite) ||
    duration <= 0 ||
    start < 0 ||
    end > duration ||
    end - start < 0.25
  )
    throw new Error("Choose a valid excerpt of at least 0.25 seconds.");
  return { start, end };
}
export function transitionPlan(a, b, fade) {
  if (![a, b, fade].every(Number.isFinite) || a <= 0 || b <= 0 || fade < 0)
    throw new Error("Invalid transition duration.");
  const overlap = Math.min(fade, a, b);
  return { overlap, incomingAt: a - overlap, duration: a + b - overlap };
}
export function fadeCurves(kind, length = 256) {
  if (
    !["equal", "linear"].includes(kind) ||
    !Number.isInteger(length) ||
    length < 2
  )
    throw new Error("Invalid fade curve.");
  const out = new Float32Array(length),
    incoming = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const t = i / (length - 1);
    out[i] = kind === "equal" ? Math.cos((t * Math.PI) / 2) : 1 - t;
    incoming[i] = kind === "equal" ? Math.sin((t * Math.PI) / 2) : t;
  }
  return { out, incoming };
}
export function fftMagnitude(samples) {
  const n = samples.length;
  if (n < 2 || n & (n - 1)) throw new Error("FFT size must be a power of two.");
  const re = Float64Array.from(samples),
    im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1,
      angle = (-2 * Math.PI) / size;
    for (let off = 0; off < n; off += size) {
      for (let j = 0; j < half; j++) {
        const c = Math.cos(angle * j),
          s = Math.sin(angle * j),
          k = off + j,
          q = k + half,
          tr = re[q] * c - im[q] * s,
          ti = re[q] * s + im[q] * c;
        re[q] = re[k] - tr;
        im[q] = im[k] - ti;
        re[k] += tr;
        im[k] += ti;
      }
    }
  }
  return Float64Array.from({ length: n / 2 }, (_, i) =>
    Math.hypot(re[i], im[i]),
  );
}
export function extractFeatures(samples, sampleRate) {
  if (
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    samples.length < sampleRate * 2
  )
    return {
      valid: false,
      reason: "Select at least 2 seconds per song for analysis.",
    };
  let energy = 0;
  for (const x of samples) energy += x * x;
  const rms = Math.sqrt(energy / samples.length);
  if (rms < 0.0001)
    return {
      valid: false,
      reason: "One excerpt is silent or too quiet to analyze.",
    };
  const n = 4096,
    chroma = new Float64Array(12);
  let weighted = 0,
    total = 0,
    high = 0;
  const frames = Math.min(80, Math.max(1, Math.floor(samples.length / n)));
  for (let frame = 0; frame < frames; frame++) {
    const offset = Math.floor(
      (frame * Math.max(0, samples.length - n)) / Math.max(1, frames - 1),
    );
    const input = Float64Array.from(
      { length: n },
      (_, j) =>
        (samples[offset + j] || 0) *
        (0.5 - 0.5 * Math.cos((2 * Math.PI * j) / (n - 1))),
    );
    const mags = fftMagnitude(input);
    for (let k = 1; k < mags.length; k++) {
      const hz = (k * sampleRate) / n,
        mag = mags[k];
      weighted += hz * mag;
      total += mag;
      if (hz > 3000) high += mag;
      if (hz >= 65 && hz <= 2100) {
        const midi = Math.round(69 + 12 * Math.log2(hz / 440));
        chroma[((midi % 12) + 12) % 12] += mag;
      }
    }
  }
  const hop = Math.max(1, Math.round(sampleRate / 100)),
    envelope = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let e = 0;
    for (let j = 0; j < hop; j++) e += samples[i + j] ** 2;
    envelope.push(Math.sqrt(e / hop));
  }
  const onset = envelope.map((x, i) => Math.max(0, x - (envelope[i - 1] || x)));
  let best = 0,
    bpm = null;
  for (let candidate = 65; candidate <= 180; candidate++) {
    const lag = Math.round((60 * sampleRate) / hop / candidate);
    let dot = 0,
      left = 0,
      right = 0;
    for (let i = lag; i < onset.length; i++) {
      dot += onset[i] * onset[i - lag];
      left += onset[i] ** 2;
      right += onset[i - lag] ** 2;
    }
    const correlation = dot / (Math.sqrt(left * right) + 1e-12);
    if (correlation > best) {
      best = correlation;
      bpm = candidate;
    }
  }
  return {
    valid: true,
    rms,
    db: 20 * Math.log10(rms),
    chroma: Array.from(chroma),
    centroid: weighted / (total || 1),
    highRatio: high / (total || 1),
    bpm: best > 0.12 ? bpm : null,
    pulseConfidence: best,
    seconds: samples.length / sampleRate,
  };
}
export function compareFeatures(a, b) {
  if (!a.valid || !b.valid)
    return { valid: false, reason: !a.valid ? a.reason : b.reason };
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a.chroma[i] * b.chroma[i];
    na += a.chroma[i] ** 2;
    nb += b.chroma[i] ** 2;
  }
  const harmony = clamp((100 * dot) / (Math.sqrt(na * nb) || 1), 0, 100);
  const tempo =
    a.bpm && b.bpm
      ? clamp(
          100 -
            240 *
              Math.min(
                ...[0.5, 1, 2].map((m) =>
                  Math.abs(Math.log2(a.bpm / (b.bpm * m))),
                ),
              ),
          0,
          100,
        )
      : null;
  const energy = clamp(100 - 6 * Math.abs(a.db - b.db), 0, 100);
  const texture = clamp(
    100 -
      42 * Math.abs(Math.log2((a.centroid + 1) / (b.centroid + 1))) -
      50 * Math.abs(a.highRatio - b.highRatio),
    0,
    100,
  );
  const score = Math.round(
    (harmony * 0.35 + (tempo ?? 0) * 0.25 + energy * 0.2 + texture * 0.2) /
      (tempo === null ? 0.75 : 1),
  );
  return {
    valid: true,
    score,
    harmony: Math.round(harmony),
    tempo: tempo === null ? null : Math.round(tempo),
    energy: Math.round(energy),
    texture: Math.round(texture),
    a,
    b,
    uncertain:
      tempo === null ||
      Math.min(a.pulseConfidence, b.pulseConfidence) < 0.25 ||
      Math.min(a.seconds, b.seconds) < 5,
  };
}
export const DEMOS = [
  {
    id: "after-hours",
    title: "After hours",
    artist: "SeemLess originals",
    bpm: 112,
    notes: [57, 60, 64, 67],
    color: "a",
  },
  {
    id: "blue-current",
    title: "Blue current",
    artist: "SeemLess originals",
    bpm: 115,
    notes: [57, 60, 64, 71],
    color: "b",
  },
  {
    id: "glass-steps",
    title: "Glass steps",
    artist: "SeemLess originals",
    bpm: 151,
    notes: [54, 58, 61, 65],
    color: "b",
  },
  {
    id: "soft-landing",
    title: "Soft landing",
    artist: "SeemLess originals",
    bpm: 88,
    notes: [53, 57, 60, 64],
    color: "a",
  },
];
export function synthesizeTrack(demo, sampleRate = 22050, seconds = 48) {
  const samples = new Float32Array(Math.round(sampleRate * seconds));
  const beat = 60 / demo.bpm;
  let seed = 42;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate,
      pulse = t % beat,
      eighth = t % (beat / 2),
      note = demo.notes[Math.floor(t / (beat / 2)) % demo.notes.length];
    const hz = 440 * 2 ** ((note - 69) / 12);
    seed = (1664525 * seed + 1013904223) >>> 0;
    const noise = seed / 2147483648 - 1;
    const kick =
      0.33 *
      Math.sin(2 * Math.PI * (48 * pulse + 3 * (1 - Math.exp(-pulse * 30)))) *
      Math.exp(-pulse * 19);
    const hat = noise * 0.055 * Math.exp(-eighth * 100),
      bass =
        0.13 * Math.sin(((2 * Math.PI * hz) / 2) * t) * Math.exp(-pulse * 4),
      arp =
        0.12 *
        (Math.sin(2 * Math.PI * hz * t) +
          0.25 * Math.sin(4 * Math.PI * hz * t)) *
        Math.exp(-eighth * 7);
    let pad = 0;
    for (const m of demo.notes)
      pad += 0.022 * Math.sin(2 * Math.PI * 440 * 2 ** ((m - 69) / 12) * t);
    samples[i] =
      (kick + hat + bass + arp + pad) *
      Math.min(1, t / 0.04, (seconds - t) / 0.08);
  }
  return samples;
}
