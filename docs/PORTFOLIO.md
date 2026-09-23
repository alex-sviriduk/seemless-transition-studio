# Portfolio and interview guide

## Suggested résumé wording

Use only statements you can explain and demonstrate. This project was developed with AI assistance; do not imply unsupported independent authorship, production usage, or model-training results.

> **SeemLess — Audio Transition Studio** | JavaScript, Web Audio API, Web Workers, DSP
>
> - Developed a browser-based two-deck editor for selecting song excerpts and previewing shared-clock linear and equal-power crossfades.
> - Implemented an explainable compatibility baseline using FFT chroma, pulse autocorrelation, RMS loudness, and spectral texture, with background analysis and stale-result protection.
> - Added device-local playlists, reproducible JSON/CSV exports, responsive controls, and deterministic tests for timing and signal-processing invariants.

Do not say “trained a deep-learning model,” “integrated Spotify/Apple playlist synchronization,” or give accuracy/user-growth figures for this version.

## Five-minute demonstration

1. **Problem:** preview and compare the specific connection between two songs, rather than judging entire tracks.
2. **Interaction:** load the default demo, change the outgoing range, and preview the fade.
3. **Algorithm:** explain the four feature groups and the difference between a heuristic and a calibrated model.
4. **Engineering:** explain audio-clock scheduling, worker transfer, request IDs, and why ordinary timers cannot reliably schedule audio.
5. **Persistence:** save a pair and show the export containing enough settings to reproduce it.
6. **Tradeoff:** discuss mono preview and why direct service sync is a separate capability with provider permissions.

## Questions to prepare for

- Why do equal-power fades help with uncorrelated signals but potentially boost correlated audio?
- Why does the analysis estimate pulse rather than guarantee beat alignment?
- Why is chroma insensitive to octave but insufficient for melody or phrasing?
- How do you prevent race conditions when a user edits ranges quickly?
- How would you prevent train/test leakage when multiple excerpts come from one track?
- How would you evaluate whether human listeners agree with the score?
- How would you preserve stereo while keeping feature extraction efficient?
- How would you handle partial playlist writes without duplicating tracks on retry?

## Honest next milestone

Build and evaluate the licensed-data model or complete a real provider-authenticated playlist flow. Either is a stronger résumé improvement than relabeling the heuristic as AI.
