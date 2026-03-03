const analyzeForm = document.getElementById("analyze-form");
const urlInput = document.getElementById("url-input");
const statusEl = document.getElementById("status");
const mediaCard = document.getElementById("media-card");
const mediaTitle = document.getElementById("media-title");
const mediaMeta = document.getElementById("media-meta");
const mediaThumb = document.getElementById("media-thumb");
const optionsSection = document.getElementById("options");
const videoOptions = document.getElementById("video-options");
const audioOptions = document.getElementById("audio-options");
const audioChipRow = document.getElementById("audio-chip-row");
const downloadBtn = document.getElementById("download-btn");
const modeButtons = [...document.querySelectorAll(".mode-btn")];
const videoModeButton = document.querySelector('[data-mode="video"]');
const audioModeButton = document.querySelector('[data-mode="audio"]');

const AUDIO_OUTPUTS = ["mp3", "m4a", "opus", "wav", "flac"];

let currentUrl = "";
let selectedMode = "video";
let selectedVideoFormat = "";
let selectedAudioExt = "mp3";

analyzeForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const url = urlInput.value.trim();
  if (!url) {
    setStatus("Inserisci un URL.", true);
    return;
  }

  currentUrl = url;
  optionsSection.classList.add("hidden");
  mediaCard.classList.add("hidden");
  setStatus("Analisi in corso...");

  try {
    const response = await fetch("/api/formats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Analisi fallita");
    }

    renderMediaCard(data);
    renderVideoFormats(data.video_formats || []);
    renderAudioOptions();

    const hasVideo = (data.video_formats || []).length > 0;
    const hasAudio = (data.audio_formats || []).length > 0;

    if (!hasVideo && !hasAudio) {
      setStatus("Nessun formato scaricabile trovato per questo link.", true);
      return;
    }

    videoModeButton.disabled = !hasVideo;
    videoModeButton.classList.toggle("hidden", !hasVideo);
    audioModeButton.disabled = !hasAudio;
    audioModeButton.classList.toggle("hidden", !hasAudio);

    if (hasVideo) {
      setMode("video");
    } else {
      setMode("audio");
    }

    optionsSection.classList.remove("hidden");
    setStatus("Formato pronto: scegli l'output e scarica.");
  } catch (error) {
    setStatus(error.message || "Errore durante l'analisi.", true);
  }
});

downloadBtn.addEventListener("click", async () => {
  if (!currentUrl) {
    setStatus("Analizza prima un URL.", true);
    return;
  }

  if (selectedMode === "video" && !selectedVideoFormat) {
    setStatus("Seleziona un formato video.", true);
    return;
  }

  const payload = {
    url: currentUrl,
    mode: selectedMode,
    format_id: selectedMode === "video" ? selectedVideoFormat : "",
    audio_ext: selectedAudioExt,
  };

  setStatus("Download in corso, attendi...");
  downloadBtn.disabled = true;

  try {
    const response = await fetch("/api/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Download fallito");
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("Content-Disposition") || "";
    const filenameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
    const filename = filenameMatch ? filenameMatch[1] : `download.${selectedMode === "audio" ? selectedAudioExt : "mp4"}`;

    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    URL.revokeObjectURL(link.href);
    link.remove();

    setStatus("Download completato.");
  } catch (error) {
    setStatus(error.message || "Errore durante il download.", true);
  } finally {
    downloadBtn.disabled = false;
  }
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

function renderMediaCard(data) {
  mediaTitle.textContent = data.title || "Titolo sconosciuto";

  const parts = [];
  if (data.uploader) parts.push(data.uploader);
  if (data.platform) parts.push(data.platform);
  if (Number.isFinite(data.duration)) parts.push(formatDuration(data.duration));
  mediaMeta.textContent = parts.join(" | ");

  if (data.thumbnail) {
    mediaThumb.src = data.thumbnail;
    mediaThumb.classList.remove("hidden");
  } else {
    mediaThumb.classList.add("hidden");
  }

  mediaCard.classList.remove("hidden");
}

function renderVideoFormats(formats) {
  videoOptions.innerHTML = "";
  selectedVideoFormat = "";

  const compactedFormats = compactVideoFormats(formats).slice(0, 24);
  const integratedAudio = compactedFormats.filter((item) => hasIntegratedAudio(item));
  const videoOnly = compactedFormats.filter((item) => !hasIntegratedAudio(item));
  const defaultSelectedId = pickDefaultVideoFormatId(compactedFormats);

  if (!compactedFormats.length) {
    const empty = document.createElement("p");
    empty.className = "format-empty";
    empty.textContent = "Nessun formato video disponibile per questo contenuto.";
    videoOptions.appendChild(empty);
    return;
  }

  if (integratedAudio.length) {
    videoOptions.appendChild(
      buildFormatGroup({
        title: "Consigliati (audio integrato)",
        note: "Scaricano un file pronto, senza passaggi extra.",
        formats: integratedAudio,
        defaultSelectedId,
      }),
    );
  }

  if (videoOnly.length) {
    videoOptions.appendChild(
      buildFormatGroup({
        title: "Avanzati (solo video)",
        note: "Richiedono merge audio automatico con FFmpeg.",
        formats: videoOnly,
        defaultSelectedId,
      }),
    );
  }
}

function renderAudioOptions() {
  audioChipRow.innerHTML = "";
  selectedAudioExt = "mp3";

  AUDIO_OUTPUTS.forEach((ext, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = ext;

    chip.addEventListener("click", () => {
      selectedAudioExt = ext;
      [...audioChipRow.children].forEach((item) => item.classList.remove("active"));
      chip.classList.add("active");

      if (selectedMode === "audio") {
        downloadBtn.textContent = `Scarica audio ${selectedAudioExt.toUpperCase()}`;
      }
    });

    if (index === 0) {
      chip.classList.add("active");
    }

    audioChipRow.appendChild(chip);
  });
}

function selectVideoFormat(selectedCard, formatId) {
  selectedVideoFormat = formatId;
  [...videoOptions.querySelectorAll(".format-card")].forEach((card) => card.classList.remove("active"));
  selectedCard.classList.add("active");
}

function setMode(mode) {
  selectedMode = mode;

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  if (mode === "video") {
    videoOptions.classList.remove("hidden");
    audioOptions.classList.add("hidden");
    downloadBtn.textContent = "Scarica video";
  } else {
    videoOptions.classList.add("hidden");
    audioOptions.classList.remove("hidden");
    downloadBtn.textContent = `Scarica audio ${selectedAudioExt.toUpperCase()}`;
  }
}

function formatDuration(seconds) {
  const sec = Number(seconds);
  if (!Number.isFinite(sec)) return "";

  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const rem = sec % 60;

  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }

  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function hasIntegratedAudio(format) {
  return Boolean(format.has_audio) || String(format.acodec || "none").toLowerCase() !== "none";
}

function compactVideoFormats(formats) {
  const seen = new Set();
  const result = [];

  const sorted = [...formats].sort((a, b) => {
    const audioWeight = Number(hasIntegratedAudio(b)) - Number(hasIntegratedAudio(a));
    if (audioWeight !== 0) return audioWeight;
    const heightDiff = Number(b.height || 0) - Number(a.height || 0);
    if (heightDiff !== 0) return heightDiff;
    return Number(b.tbr || 0) - Number(a.tbr || 0);
  });

  sorted.forEach((format) => {
    const key = [
      String(format.resolution || "n/d").toLowerCase(),
      String(format.ext || "n/a").toLowerCase(),
      Number(format.fps || 0),
      hasIntegratedAudio(format) ? 1 : 0,
    ].join("|");

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    result.push(format);
  });

  return result;
}

function pickDefaultVideoFormatId(formats) {
  if (!formats.length) return "";

  const best =
    formats.find((item) => String(item.ext).toLowerCase() === "mp4" && hasIntegratedAudio(item)) ||
    formats.find((item) => hasIntegratedAudio(item)) ||
    formats[0];

  return best ? String(best.format_id) : "";
}

function buildFormatGroup({ title, note, formats, defaultSelectedId }) {
  const group = document.createElement("section");
  group.className = "format-group";

  const header = document.createElement("div");
  header.className = "format-group-header";

  const heading = document.createElement("h3");
  heading.className = "format-group-title";
  heading.textContent = title;

  const helper = document.createElement("p");
  helper.className = "format-group-note";
  helper.textContent = note;

  header.append(heading, helper);

  const grid = document.createElement("div");
  grid.className = "format-group-grid";

  formats.forEach((format, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "format-card";
    card.dataset.id = String(format.format_id);

    const main = document.createElement("div");
    main.className = "format-main";
    main.textContent = `${format.resolution} • ${String(format.ext).toUpperCase()}`;

    const meta = document.createElement("div");
    meta.className = "format-meta";
    meta.textContent = [
      format.filesize_mb ? `${format.filesize_mb} MB` : "size N/D",
      format.fps ? `${format.fps} fps` : null,
      `ID ${format.format_id}`,
    ]
      .filter(Boolean)
      .join(" • ");

    const badges = document.createElement("div");
    badges.className = "format-badges";

    const audioBadge = document.createElement("span");
    audioBadge.className = `format-badge ${hasIntegratedAudio(format) ? "is-safe" : "is-warning"}`;
    audioBadge.textContent = hasIntegratedAudio(format) ? "Audio integrato" : "Solo video";
    badges.appendChild(audioBadge);

    if (format.note) {
      const noteBadge = document.createElement("span");
      noteBadge.className = "format-badge";
      noteBadge.textContent = format.note;
      badges.appendChild(noteBadge);
    }

    card.append(main, badges, meta);
    card.addEventListener("click", () => selectVideoFormat(card, String(format.format_id)));

    if (String(format.format_id) === defaultSelectedId || (!defaultSelectedId && index === 0)) {
      selectVideoFormat(card, String(format.format_id));
    }

    grid.appendChild(card);
  });

  group.append(header, grid);
  return group;
}
