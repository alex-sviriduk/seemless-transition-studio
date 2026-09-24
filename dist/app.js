import {
  DEMOS,
  synthesizeTrack,
  clamp,
  transitionPlan,
  fadeCurves,
  validateRange,
} from "./audio.js";
const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const time = (s) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const tracks = DEMOS.map((d) => ({
  ...d,
  samples: synthesizeTrack(d),
  sampleRate: 22050,
  duration: 48,
  demo: true,
}));
const state = {
  decks: [
    { track: tracks[0], start: 32, end: 48 },
    { track: tracks[1], start: 0, end: 16 },
  ],
  fade: 4,
  curve: "equal",
  result: null,
  playing: false,
};
let context,
  master,
  nodes = [],
  playingStart = 0,
  playingDuration = 0,
  frameId,
  analyzeTimer,
  requestId = 0,
  playRequest = 0,
  libraryTarget = 0,
  libraryFilter = "all",
  toastTimer;
let playlists = [];
try {
  const saved = JSON.parse(
    localStorage.getItem("seemless-playlists-v1") || "[]",
  );
  if (Array.isArray(saved))
    playlists = saved
      .filter((p) => p && typeof p.name === "string" && Array.isArray(p.pairs))
      .map((p) => ({
        ...p,
        pairs: p.pairs.filter(
          (x) =>
            x &&
            Number.isFinite(x.fade) &&
            x.fade >= 0 &&
            (x.curve === "equal" || x.curve === "linear") &&
            (x.score === null ||
              (Number.isFinite(x.score) && x.score >= 0 && x.score <= 100)) &&
            Array.isArray(x.decks) &&
            x.decks.length === 2 &&
            x.decks.every(
              (d) =>
                d &&
                typeof d.title === "string" &&
                typeof d.artist === "string" &&
                d.start >= 0 &&
                d.end - d.start >= 0.25 &&
                Number.isFinite(d.start) &&
                Number.isFinite(d.end),
            ),
        ),
      }));
} catch {
  /* Corrupt or blocked storage should not prevent the studio from opening. */
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 5000);
}
function getContext() {
  if (!context) {
    context = new AudioContext();
    master = context.createGain();
    master.gain.value = +$("volume").value * 0.65;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    master.connect(limiter).connect(context.destination);
  }
  return context;
}
function deckMarkup(d, i) {
  return `<article class="deck ${i ? "b" : "a"}"><div class="deck-head"><span class="deck-tag"><span class="deck-letter">${i ? "B" : "A"}</span>${i ? "INCOMING" : "OUTGOING"}</span><button class="text-button" data-change="${i}">Change track ↗</button></div><div class="song"><div class="cover" aria-hidden="true">${i ? "B" : "A"}</div><div class="song-info"><h3 title="${esc(d.track.title)}">${esc(d.track.title)}</h3><p>${esc(d.track.artist)} · ${d.track.demo ? "Demo" : "Local file"}</p></div></div><div class="wave-area"><canvas id="wave${i}" aria-label="Waveform of ${esc(d.track.title)}"></canvas><div class="wave-selection" id="selection${i}"></div></div><div class="wave-scale"><span>0:00</span><span>${time(d.track.duration / 2)}</span><span>${time(d.track.duration)}</span></div><div class="range-fields">${["start", "end"].map((k) => `<label>${k === "start" ? "From" : "To"} <span class="small">(seconds)</span><input aria-label="${i ? "B" : "A"} ${k} seconds" type="number" id="${k}${i}" value="${d[k]}" min="0" max="${d.track.duration}" step="0.1"><input aria-label="${i ? "B" : "A"} ${k} range" type="range" id="${k}Slider${i}" value="${d[k]}" min="0" max="${d.track.duration}" step="0.1"></label>`).join("")}</div><div class="deck-bottom"><span>SELECTED EXCERPT</span><strong id="duration${i}">${(d.end - d.start).toFixed(1)} seconds</strong></div></article>`;
}
function renderDecks() {
  $("decks").innerHTML = state.decks.map(deckMarkup).join("");
  document
    .querySelectorAll("[data-change]")
    .forEach((b) => (b.onclick = () => openLibrary(+b.dataset.change)));
  for (let i = 0; i < 2; i++) {
    for (const k of ["start", "end"]) {
      $(`${k}${i}`).onchange = (e) => setRange(i, k, e.target.valueAsNumber);
      $(`${k}Slider${i}`).oninput = (e) =>
        setRange(i, k, e.target.valueAsNumber);
    }
    drawWave(i);
    updateDeck(i);
  }
  updateTimeline();
}
function drawWave(i) {
  const canvas = $(`wave${i}`),
    w = canvas.clientWidth,
    h = canvas.clientHeight,
    dpr = window.devicePixelRatio || 1;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const samples = state.decks[i].track.samples;
  const bars = Math.floor(w / 4);
  ctx.fillStyle = i ? "#bda3ef" : "#b7edc6";
  for (let b = 0; b < bars; b++) {
    const lo = Math.floor((b * samples.length) / bars),
      hi = Math.floor(((b + 1) * samples.length) / bars);
    let peak = 0;
    for (let j = lo; j < hi; j += Math.max(1, Math.floor((hi - lo) / 150)))
      peak = Math.max(peak, Math.abs(samples[j]));
    const height = Math.max(2, Math.min(h - 12, peak * h * 1.8));
    ctx.globalAlpha = 0.75;
    ctx.fillRect(b * 4, (h - height) / 2, 2, height);
  }
}
function updateDeck(i) {
  const d = state.decks[i];
  for (const k of ["start", "end"]) {
    $(`${k}${i}`).value = d[k].toFixed(1);
    $(`${k}Slider${i}`).value = d[k];
  }
  const selection = $(`selection${i}`);
  selection.style.left = `${(100 * d.start) / d.track.duration}%`;
  selection.style.width = `${(100 * (d.end - d.start)) / d.track.duration}%`;
  $(`duration${i}`).textContent = `${(d.end - d.start).toFixed(1)} seconds`;
}
function setRange(i, k, value) {
  const d = state.decks[i];
  if (!Number.isFinite(value)) {
    updateDeck(i);
    return;
  }
  stop();
  d[k] =
    k === "start"
      ? clamp(value, 0, d.end - 0.25)
      : clamp(value, d.start + 0.25, d.track.duration);
  updateDeck(i);
  updateTimeline();
  scheduleAnalysis();
}
function plan() {
  return transitionPlan(
    state.decks[0].end - state.decks[0].start,
    state.decks[1].end - state.decks[1].start,
    state.fade,
  );
}
function updateTimeline() {
  const max = Math.min(12, ...state.decks.map((d) => d.end - d.start));
  state.fade = Math.min(state.fade, max);
  $("fade").max = max;
  $("fade").value = state.fade;
  $("fadeValue").textContent = `${state.fade.toFixed(1)} s`;
  $("fadeMax").textContent = `${max.toFixed(1)} s`;
  const p = plan();
  $("timelineA").style.width =
    `${(100 * (state.decks[0].end - state.decks[0].start)) / p.duration}%`;
  $("timelineB").style.width =
    `${(100 * (state.decks[1].end - state.decks[1].start)) / p.duration}%`;
  $("playTime").textContent = `0:00 / ${time(p.duration)}`;
}
function stop() {
  playRequest++;
  for (const n of nodes) {
    try {
      n.stop();
    } catch {
      /* Already ended. */
    }
    n.disconnect();
  }
  nodes = [];
  cancelAnimationFrame(frameId);
  state.playing = false;
  $("playText").textContent = "Preview transition";
  $("playIcon").textContent = "▶";
  $("playhead").style.display = "none";
  if (state.decks.length)
    $("playTime").textContent = `0:00 / ${time(plan().duration)}`;
}
async function play() {
  if (state.playing) {
    stop();
    return;
  }
  try {
    const attempt = ++playRequest;
    const ctx = getContext();
    await ctx.resume();
    if (attempt !== playRequest) return;
    const p = plan(),
      start = ctx.currentTime + 0.05,
      curves = fadeCurves(state.curve);
    state.decks.forEach((d, i) => {
      validateRange(d.start, d.end, d.track.duration);
      const source = ctx.createBufferSource(),
        gain = ctx.createGain();
      const buffer = ctx.createBuffer(
        1,
        d.track.samples.length,
        d.track.sampleRate,
      );
      buffer.copyToChannel(d.track.samples, 0);
      source.buffer = buffer;
      source.connect(gain).connect(master);
      const when = start + (i ? p.incomingAt : 0),
        duration = d.end - d.start;
      gain.gain.setValueAtTime(i && p.overlap > 0 ? 0 : 1, when);
      if (p.overlap > 0)
        gain.gain.setValueCurveAtTime(
          i ? curves.incoming : curves.out,
          start + p.incomingAt,
          p.overlap,
        );
      source.start(when, d.start, duration);
      source.onended = () => {
        source.disconnect();
        gain.disconnect();
      };
      nodes.push(source);
    });
    playingStart = start;
    playingDuration = p.duration;
    state.playing = true;
    $("playText").textContent = "Stop preview";
    $("playIcon").textContent = "■";
    $("playhead").style.display = "block";
    tick();
  } catch (e) {
    stop();
    toast(`Could not play audio: ${e.message}`);
  }
}
function tick() {
  if (!state.playing) return;
  const elapsed = Math.max(0, context.currentTime - playingStart);
  if (elapsed >= playingDuration) {
    stop();
    return;
  }
  $("playhead").style.left = `${(100 * elapsed) / playingDuration}%`;
  $("playTime").textContent = `${time(elapsed)} / ${time(playingDuration)}`;
  frameId = requestAnimationFrame(tick);
}
let worker;
try {
  worker = new Worker(new URL("./analysis-worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (data.id !== requestId) return;
    state.result = data.result;
    renderScore();
  };
  worker.onerror = () => {
    state.result = {
      valid: false,
      reason:
        "Analysis is unavailable in this browser. Audio preview still works.",
    };
    renderScore();
  };
} catch {
  /* The UI displays an explicit analysis-unavailable state below. */
}
function scheduleAnalysis() {
  state.result = null;
  requestId++;
  renderScore();
  clearTimeout(analyzeTimer);
  analyzeTimer = setTimeout(() => {
    if (!worker) {
      state.result = {
        valid: false,
        reason: "Audio analysis requires a browser with module worker support.",
      };
      renderScore();
      return;
    }
    const segments = state.decks.map((d) =>
      d.track.samples.slice(
        Math.floor(d.start * d.track.sampleRate),
        Math.floor(d.end * d.track.sampleRate),
      ),
    );
    worker.postMessage(
      { id: requestId, a: segments[0], b: segments[1], sampleRate: 22050 },
      segments.map((s) => s.buffer),
    );
  }, 180);
}
function renderScore() {
  const r = state.result;
  $("score").textContent = r?.valid ? r.score : "—";
  $("scoreDial").style.setProperty("--score", r?.valid ? r.score : 0);
  if (!r?.valid) {
    $("verdict").textContent = r ? "More audio needed" : "Analyzing excerpts";
    $("summary").textContent =
      r?.reason || "Comparing the selected audio features…";
    $("metrics").innerHTML = "";
    $("insight").textContent =
      r?.reason || "Your score updates when you change a song or excerpt.";
    return;
  }
  $("verdict").textContent =
    r.score >= 85
      ? "A natural connection"
      : r.score >= 65
        ? "Promising pairing"
        : r.score >= 45
          ? "A little contrast"
          : "A bold change of pace";
  $("summary").textContent = r.uncertain
    ? "A rough estimate. The pulse is uncertain or the excerpts are short."
    : "Based on the audio in your selected ranges. Let your ears make the final call.";
  const metrics = [
    ["Harmony", r.harmony, "Shared pitch-class content"],
    [
      "Tempo",
      r.tempo,
      r.a.bpm && r.b.bpm
        ? `≈ ${r.a.bpm} → ${r.b.bpm} BPM · estimated`
        : "No reliable pulse · omitted from score",
    ],
    [
      "Energy",
      r.energy,
      `${Math.abs(r.a.db - r.b.db).toFixed(1)} dB loudness difference`,
    ],
    ["Texture", r.texture, "Spectral brightness & high frequencies"],
  ];
  $("metrics").innerHTML = metrics
    .map(
      ([label, value, detail]) =>
        `<div class="metric"><div class="metric-row"><span>${label}</span><strong>${value === null ? "N/A" : `${value}%`}</strong></div><div class="metric-track"><i style="width:${value ?? 0}%"></i></div><small>${detail}</small></div>`,
    )
    .join("");
  const weakest = metrics
    .filter((m) => m[1] !== null)
    .sort((a, b) => a[1] - b[1])[0][0];
  $("insight").textContent = {
    Harmony:
      "Try moving the excerpts to an outro and an intro with fewer overlapping notes.",
    Tempo:
      "The pulses differ. Try a short fade or a quieter section between beats.",
    Energy:
      "Listen for a volume jump. Choose excerpts with a similar intensity.",
    Texture: "The textures change here. A longer fade may soften the contrast.",
  }[weakest];
}
function openLibrary(target) {
  libraryTarget = target;
  $("libraryEyebrow").textContent =
    `CHOOSE ${target ? "B · INCOMING" : "A · OUTGOING"}`;
  renderLibrary();
  $("libraryDialog").showModal();
  $("librarySearch").focus();
}
function renderLibrary() {
  const query = $("librarySearch").value.trim();
  const normalize = (value) =>
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
  const words = normalize(query).split(/\s+/).filter(Boolean);
  const results = tracks
    .map((t, i) => ({ t, i }))
    .filter(
      ({ t }) =>
        (libraryFilter === "all" ||
          (libraryFilter === "uploads" ? !t.demo : t.demo)) &&
        words.every((word) =>
          normalize(`${t.title} ${t.artist} ${t.fileName || ""}`).includes(
            word,
          ),
        ),
    );
  $("libraryCount").textContent =
    `${results.length} matching track${results.length === 1 ? "" : "s"} · ${tracks.filter((t) => !t.demo).length} uploaded`;
  $("libraryList").innerHTML = results.length
    ? results
        .map(
          ({ t, i }) =>
            `<div class="library-item"><div class="cover">${String(i + 1).padStart(2, "0")}</div><div class="track-copy"><strong>${esc(t.title)}</strong><small>${esc(t.artist)} · ${time(t.duration)}${t.demo ? " · Original demo" : ""}</small></div><button data-track="${i}">Use ${libraryTarget ? "B" : "A"}</button></div>`,
        )
        .join("")
    : `<div class="library-empty"><strong>${query ? "No matching audio" : "No uploaded tracks yet"}</strong><p>${query ? "Try a different title, artist, or filename, or search a music service below." : "Choose audio files below to build your library."}</p></div>`;
  $("serviceSearchLinks").hidden = !query;
  $("serviceSearchHint").textContent = query
    ? `Search for “${query}” on your music service.`
    : "Enter a song or artist above to search Spotify or Apple Music.";
  for (const [id, url] of [
    [
      "searchSpotify",
      `https://open.spotify.com/search/${encodeURIComponent(query)}`,
    ],
    [
      "searchApple",
      `https://music.apple.com/us/search?term=${encodeURIComponent(query)}`,
    ],
  ]) {
    if (query) $(id).href = url;
    else $(id).removeAttribute("href");
  }
  document
    .querySelectorAll("[data-track]")
    .forEach(
      (b) => (b.onclick = () => selectTrack(libraryTarget, +b.dataset.track)),
    );
}
$("librarySearch").oninput = renderLibrary;
document.querySelectorAll("[data-library-filter]").forEach((button) => {
  button.onclick = () => {
    libraryFilter = button.dataset.libraryFilter;
    document
      .querySelectorAll("[data-library-filter]")
      .forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    renderLibrary();
  };
});
function selectTrack(target, index) {
  stop();
  const t = tracks[index];
  state.decks[target] = {
    track: t,
    start: target ? 0 : Math.max(0, t.duration - 16),
    end: target ? Math.min(16, t.duration) : t.duration,
  };
  $("libraryDialog").close();
  renderDecks();
  scheduleAnalysis();
}
$("upload").onchange = async (e) => {
  const files = Array.from(e.target.files);
  $("upload").disabled = true;
  for (const file of files) {
    if (file.size > 60 * 1024 * 1024) {
      toast(`${file.name}: choose a file under 60 MB.`);
      continue;
    }
    if (tracks.length >= 12) {
      toast("Library limit reached. Reload to start a new audio session.");
      break;
    }
    try {
      toast(`Loading ${file.name}…`);
      const decoded = await getContext().decodeAudioData(
        await file.arrayBuffer(),
      );
      if (decoded.duration < 0.25 || decoded.duration > 900)
        throw new Error("Choose audio between 0.25 seconds and 15 minutes.");
      const offline = new OfflineAudioContext(
          1,
          Math.ceil(decoded.duration * 22050),
          22050,
        ),
        source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start();
      const rendered = await offline.startRendering();
      const samples = rendered.getChannelData(0);
      const fileTitle = file.name.replace(/\.[^.]+$/, "");
      const parts = fileTitle.split(" - ");
      tracks.push({
        id: crypto.randomUUID(),
        title:
          parts.length > 1
            ? parts.slice(1).join(" - ").trim() || fileTitle
            : fileTitle,
        artist:
          parts.length > 1 ? parts[0].trim() || "Your audio" : "Your audio",
        fileName: file.name,
        samples,
        sampleRate: 22050,
        duration: samples.length / 22050,
        demo: false,
      });
      libraryFilter = "uploads";
      $("librarySearch").value = "";
      document
        .querySelectorAll("[data-library-filter]")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(b.dataset.libraryFilter === "uploads"),
          ),
        );
      renderLibrary();
      toast(`${file.name} is ready. Choose Use A or Use B.`);
    } catch (err) {
      toast(`Could not load ${file.name}. ${err.message || "Try WAV or MP3."}`);
    }
  }
  $("upload").disabled = false;
  $("upload").value = "";
};
function openSave() {
  $("saveDescription").textContent =
    `${state.decks[0].track.title} → ${state.decks[1].track.title}`;
  $("playlistSelect").innerHTML =
    playlists
      .map((p, i) => `<option value="${i}">${esc(p.name)}</option>`)
      .join("") + '<option value="new">Create a new playlist</option>';
  $("nameField").hidden = $("playlistSelect").value !== "new";
  $("saveDialog").showModal();
}
function savePair() {
  const choice = $("playlistSelect").value,
    name = $("playlistName").value.trim();
  if (choice === "new" && !name) {
    $("playlistName").focus();
    toast("Give your playlist a name.");
    return;
  }
  const next = structuredClone(playlists);
  let target;
  if (choice === "new") {
    target = { id: crypto.randomUUID(), name, pairs: [] };
    next.push(target);
  } else target = next[Number(choice)];
  if (!target) return;
  target.pairs.push({
    id: crypto.randomUUID(),
    savedAt: new Date().toISOString(),
    decks: state.decks.map((d) => ({
      title: d.track.title,
      artist: d.track.artist,
      trackId: d.track.id,
      demo: d.track.demo,
      start: d.start,
      end: d.end,
    })),
    fade: state.fade,
    curve: state.curve,
    score: state.result?.valid ? state.result.score : null,
    scoreMethod: "audio-features-v1",
  });
  try {
    localStorage.setItem("seemless-playlists-v1", JSON.stringify(next));
    playlists = next;
    $("saveDialog").close();
    $("playlistName").value = "";
    renderPlaylists();
    toast(`Saved to ${target.name}.`);
  } catch {
    toast("Browser storage is full or blocked. This transition was not saved.");
  }
}
function serviceLinks(d) {
  if (d.demo)
    return '<span class="small">Original demo · not in streaming catalogs</span>';
  return `<a href="https://open.spotify.com/search/${encodeURIComponent(d.title)}" target="_blank" rel="noopener noreferrer">Find on Spotify ↗</a><a href="https://music.apple.com/us/search?term=${encodeURIComponent(d.title)}" target="_blank" rel="noopener noreferrer">Find on Apple Music ↗</a>`;
}
function renderPlaylists() {
  $("playlistCount").textContent = playlists.length;
  $("playlistList").innerHTML = playlists.length
    ? playlists
        .map(
          (p, i) =>
            `<article class="playlist-card"><div class="playlist-header"><h2>${esc(p.name)}</h2><span class="small">${p.pairs.length} transition${p.pairs.length === 1 ? "" : "s"}</span><button class="secondary" data-json="${i}">Export JSON</button><button class="secondary" data-csv="${i}">Export CSV</button></div>${p.pairs.map((pair, j) => `<div class="saved-pair"><div class="pair-info"><h3>${esc(pair.decks[0].title)} → ${esc(pair.decks[1].title)}</h3><p>${time(pair.decks[0].start)}–${time(pair.decks[0].end)} → ${time(pair.decks[1].start)}–${time(pair.decks[1].end)} · ${pair.fade.toFixed(1)}s fade · ${pair.score === null ? "Unscored" : `${pair.score}/100 estimate`}</p><div class="pair-actions">${pair.decks.map((d) => `<span>${esc(d.title)}:</span>${serviceLinks(d)}`).join("")}</div></div><button class="secondary" data-load="${i},${j}">Load in studio</button></div>`).join("")}</article>`,
        )
        .join("")
    : '<div class="empty"><h2>Your next great sequence starts here.</h2><p>Save a transition from the studio to create your first playlist.</p></div>';
  document
    .querySelectorAll("[data-json]")
    .forEach(
      (b) => (b.onclick = () => downloadPlaylist(+b.dataset.json, "json")),
    );
  document
    .querySelectorAll("[data-csv]")
    .forEach(
      (b) => (b.onclick = () => downloadPlaylist(+b.dataset.csv, "csv")),
    );
  document
    .querySelectorAll("[data-load]")
    .forEach(
      (b) =>
        (b.onclick = () => loadPair(...b.dataset.load.split(",").map(Number))),
    );
}
function loadPair(pi, pj) {
  const pair = playlists[pi].pairs[pj],
    found = pair.decks.map(
      (d) =>
        tracks.find((t) => t.id === d.trackId) ||
        tracks.find(
          (t) => !t.demo && t.title === d.title && t.duration >= d.end,
        ),
    );
  if (found.some((t) => !t)) {
    toast(
      "Choose the original audio files in the library first, then load this transition again.",
    );
    return;
  }
  stop();
  state.decks = pair.decks.map((d, i) => ({
    track: found[i],
    start: d.start,
    end: d.end,
  }));
  state.fade = pair.fade;
  setCurve(pair.curve);
  showPage("studio");
  renderDecks();
  scheduleAnalysis();
}
function downloadPlaylist(index, format) {
  const p = playlists[index];
  const safeCell = (v) => {
    const text = String(v ?? "");
    return (
      '"' +
      (/^[=+@\-\t\r]/.test(text) ? "'" : "") +
      text.replace(/"/g, '""') +
      '"'
    );
  };
  const content =
    format === "json"
      ? JSON.stringify({ format: "seemless-playlist-v1", ...p }, null, 2)
      : [
          [
            "Transition",
            "Deck",
            "Title",
            "Artist",
            "Start seconds",
            "End seconds",
            "Crossfade seconds",
            "Curve",
            "Estimated score",
          ],
          ...p.pairs.flatMap((pair, j) =>
            pair.decks.map((d, k) => [
              j + 1,
              k ? "B" : "A",
              d.title,
              d.artist,
              d.start,
              d.end,
              pair.fade,
              pair.curve,
              pair.score,
            ]),
          ),
        ]
          .map((row) => row.map(safeCell).join(","))
          .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([content], {
      type: format === "json" ? "application/json" : "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "playlist"}.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Export downloaded. Music-service search links do not sync playlists.");
}
function showPage(page) {
  $("studio").hidden = page !== "studio";
  $("playlists").hidden = page !== "playlists";
  $("studioTab").classList.toggle("active", page === "studio");
  $("playlistsTab").classList.toggle("active", page === "playlists");
  if (page === "playlists") renderPlaylists();
  else
    requestAnimationFrame(() => {
      drawWave(0);
      drawWave(1);
    });
}
function setCurve(curve) {
  state.curve = curve === "linear" ? "linear" : "equal";
  for (const [id, value] of [
    ["equalPower", "equal"],
    ["linear", "linear"],
  ]) {
    $(id).classList.toggle("selected", state.curve === value);
    $(id).setAttribute("aria-pressed", String(state.curve === value));
  }
}
$("studioTab").onclick = $("backStudio").onclick = () => showPage("studio");
$("playlistsTab").onclick = () => showPage("playlists");
$("libraryOpen").onclick = () => openLibrary(0);
$("savePair").onclick = openSave;
$("confirmSave").onclick = savePair;
$("playlistSelect").onchange = () => {
  $("nameField").hidden = $("playlistSelect").value !== "new";
};
$("play").onclick = play;
$("fade").oninput = (e) => {
  stop();
  state.fade = +e.target.value;
  updateTimeline();
};
$("equalPower").onclick = () => {
  stop();
  setCurve("equal");
};
$("linear").onclick = () => {
  stop();
  setCurve("linear");
};
$("volume").oninput = () => {
  if (master)
    master.gain.setTargetAtTime(
      +$("volume").value * 0.65,
      context.currentTime,
      0.02,
    );
};
$("contrast").onclick = () => {
  selectTrack(1, state.decks[1].track.id === "glass-steps" ? 1 : 2);
};
for (const id of ["help", "scoreInfo", "method"])
  $(id).onclick = () => $("aboutDialog").showModal();
document
  .querySelectorAll("dialog .close")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
window.addEventListener("resize", () => {
  if (!$("studio").hidden) {
    drawWave(0);
    drawWave(1);
  }
});
if (document.modelContext?.registerTool) {
  try {
    Promise.resolve(
      document.modelContext.registerTool({
        name: "configure_transition_ranges",
        title: "Configure transition excerpts",
        description:
          "Set the two selected track excerpts and crossfade duration. Does not play audio or save a playlist.",
        inputSchema: {
          type: "object",
          properties: {
            aStart: { type: "number" },
            aEnd: { type: "number" },
            bStart: { type: "number" },
            bEnd: { type: "number" },
            crossfade: { type: "number", minimum: 0, maximum: 12 },
          },
          required: ["aStart", "aEnd", "bStart", "bEnd", "crossfade"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false },
        execute(input) {
          if (
            !input ||
            ![
              input.aStart,
              input.aEnd,
              input.bStart,
              input.bEnd,
              input.crossfade,
            ].every(Number.isFinite)
          )
            throw new Error("All values must be finite numbers.");
          validateRange(
            input.aStart,
            input.aEnd,
            state.decks[0].track.duration,
          );
          validateRange(
            input.bStart,
            input.bEnd,
            state.decks[1].track.duration,
          );
          if (
            input.crossfade < 0 ||
            input.crossfade >
              Math.min(12, input.aEnd - input.aStart, input.bEnd - input.bStart)
          )
            throw new Error("Crossfade exceeds the selected ranges.");
          stop();
          Object.assign(state.decks[0], {
            start: input.aStart,
            end: input.aEnd,
          });
          Object.assign(state.decks[1], {
            start: input.bStart,
            end: input.bEnd,
          });
          state.fade = input.crossfade;
          showPage("studio");
          renderDecks();
          scheduleAnalysis();
          return { configured: true, ...input };
        },
      }),
    ).catch(() => {});
  } catch {
    /* Optional browser capability. */
  }
}
renderDecks();
renderPlaylists();
scheduleAnalysis();
