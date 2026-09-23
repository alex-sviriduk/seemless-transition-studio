# Architecture and tradeoffs

## Local-first processing

The browser decodes an explicitly selected file with `decodeAudioData`. An `OfflineAudioContext` converts it to one 22,050 Hz channel. Four built-in demo loops use the same sample rate. Every track therefore has a consistent PCM representation. PCM is held in memory and is never sent to a server or included in saved playlists.

This simplifies processing and avoids a server bill, but trades away stereo imaging and high-frequency fidelity. Production playback should retain the original buffer and create a separate reduced-rate mono analysis buffer. Full-file decoding can allocate memory before the duration check; a production importer should inspect container metadata and use streaming decode for long media.

## Excerpts and playback

Each deck stores a track reference and start/end times. Numeric fields and sliders update the same state. Excerpts must have at least 0.25 seconds, and the crossfade is clamped to the shorter excerpt and a 12-second maximum. Scoring requires at least two seconds.

For lengths A and B and overlap F:

```
incoming start = A - F
total duration = A + B - F
```

Both `AudioBufferSourceNode` instances are scheduled against the same audio clock. Playback does not use JavaScript timers to start the incoming song. `requestAnimationFrame` updates only the visual progress indicator. Changing a track, range, or fade stops scheduled playback before updating the controls.

Equal-power fades use cos/sin gain curves. These preserve the sum of squared gains for uncorrelated signals; they do not guarantee constant perceived loudness or prevent correlated peaks. Headroom and a dynamics compressor reduce overload. Hard cuts may click at non-zero sample boundaries; future work should add zero-crossing-aware boundaries or a brief edge ramp.

## Worker concurrency

The main thread copies the selected PCM ranges and transfers their buffers to a module worker. The worker extracts features and compares them. A monotonically increasing request ID prevents an older result from replacing the current score. Inputs are debounced for 180 ms. Original track buffers are never detached. There is no cancellation inside a running analysis, so queued large analyses are a future performance improvement.

## Storage and exports

`seemless-playlists-v1` stores metadata in browser storage: title, artist, track identifier, excerpt times, fade, score, and score method. No audio or credentials are persisted. Updates are staged and assigned only after storage succeeds, so a quota error does not falsely claim success. Saved local tracks can be re-associated by filename when the original file is selected again; this is convenience matching, not content verification. A future version should store an audio hash.

HTML escaping is applied to displayed filenames and playlist names. Exports quote CSV cells and neutralize formula-prefixed text. Service links URL-encode song searches and open with `noopener noreferrer`.

## External services

This version has no access tokens. Direct playlist writes need provider developer registration, an account consent flow, verified catalog matching, and idempotent writes. Spotify/Apple audio must not be treated as arbitrary downloadable PCM. Service search links are labeled as manual handoffs and never show a false synced state.

## Optional agent interface

On supporting browsers, `configure_transition_ranges` exposes the same validated range state. It stages a transition only: it does not start playback or write playlists. Unsupported browsers keep the ordinary UI. Schema and runtime validation both reject invalid times before mutating state.
