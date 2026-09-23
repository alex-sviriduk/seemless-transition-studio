# Compatibility baseline v1

## Purpose

Provide an interpretable signal comparison for two selected excerpts. This is a **DSP heuristic**, not deep learning, a classifier probability, or a validated rating of musical quality. The number is not an accuracy percentage. Component values are similarities scaled to 0–100.

## Feature extraction

- Reject excerpts shorter than two seconds or below RMS 0.0001 (approximately −80 dBFS).
- Compute RMS over the full excerpt and convert to dBFS.
- Sample up to 80 evenly spaced 4,096-sample Hann-windowed FFT frames.
- Sum magnitudes between 65 and 2,100 Hz into twelve nearest-semitone pitch classes.
- Compute spectral centroid and the fraction of magnitude above 3 kHz.
- Compute a roughly 100 Hz RMS envelope and positive envelope differences.
- Search 65–180 BPM with normalized onset autocorrelation. Omit pulse estimates below 0.12 correlation; flag confidence below 0.25 or excerpts under five seconds.

## Similarities and weights

| Component | Computation | Weight |
| --- | --- | --- |
| Harmony | Chroma cosine similarity × 100 | 35% |
| Tempo | 100 − 240 × minimum absolute log2 BPM ratio, including half/double time | 25% |
| Energy | 100 − 6 × absolute dBFS difference | 20% |
| Texture | 100 − 42 × absolute log2 centroid ratio − 50 × high-frequency fraction difference | 20% |

Each value is clamped to 0–100; the weighted total is rounded. If either pulse estimate is unavailable, tempo is omitted and remaining weights are divided by 0.75. The UI says N/A and calls the result uncertain. Weights and penalties are manually chosen; they are not learned or scientifically validated.

The score describes source excerpt compatibility and does not incorporate fade duration, fade shape, overlap-specific timing, beat phase, gain automation, vocal collisions, lyrics, phrasing, or listener taste. Equal average features can mask a poor boundary. A matching score of 100 for identical input verifies mathematics, not an ideal transition.

## Future learned score: evaluation before claims

1. Obtain licensed audio and explicit rights for model processing. Do not ingest Spotify content into a model.
2. Gather human ratings of actual rendered transitions across genres, lengths, and fade settings; include multiple raters per pair and agreement estimates.
3. Split by artist and source track to prevent near-duplicate leakage across train/test sets.
4. Compare this baseline with a learned model using audio embeddings, boundary features, and fade parameters. Select a model only after checking its license and deployment requirements.
5. Report held-out rank correlation, mean absolute error, pairwise preference accuracy, confidence intervals, and genre/tempo slices. Do not advertise evaluation numbers until measured.
6. Calibrate the 0–100 display to the observed rating scale and expose uncertainty and out-of-distribution behavior.

The current synthetic fixtures only validate engineering behavior. They cannot establish quality on commercial music, rhythmically complex tracks, beatless audio, or human taste.
