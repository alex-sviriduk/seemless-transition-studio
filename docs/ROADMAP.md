# Roadmap

## 1. Audio quality and robustness

- Retain original stereo buffers for playback; keep reduced-rate mono buffers only for analysis.
- Add short endpoint ramps or zero-crossing snapping for hard cuts.
- Analyze the actual overlap and boundary separately from the full selected excerpts.
- Add cancellable worker jobs, bounded analysis windows, and decode-memory guards.
- Match restored files by content hash; provide removal and reordering controls for tracks and playlists.
- Test across desktop/mobile Safari, Chrome, Firefox, and real audio codecs.

Acceptance: the same selected ranges work with stereo playback; invalid files fail without breaking the session; rapid edits cannot surface stale scores.

## 2. Connected playlists

- Register a Spotify app and implement authorization code with PKCE. Register exact redirect URIs and request only needed playlist scopes.
- Configure Apple MusicKit with a server-issued developer token and user authorization.
- Search metadata, present matches for confirmation, choose an existing playlist, and append verified catalog IDs.
- Handle cancellation, expired consent, denied permissions, unavailable tracks, duplicates, rate limits, and partial failures.
- Keep streaming audio outside the mixing and analysis pipeline.

Acceptance: live test accounts can select a real playlist and receive verified track additions, with no false success on API failure. Requires provider credentials and integration testing.

## 3. Learned transition quality

- Build a licensed, human-rated dataset of rendered transitions.
- Train or evaluate an appropriate audio embedding/ranking model against the existing DSP baseline.
- Use artist-disjoint evaluation, report uncertainty, and document model/data licensing.
- Connect inference only after latency, memory, and quality requirements are met.

Acceptance: publish reproducible held-out metrics and an explicit model card. Until then the UI must retain its signal-based label.
