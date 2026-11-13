(() => {
  "use strict";
  const panel = document.getElementById("lr-chapter-audio");
  const play = panel.querySelector("button");
  const audio = panel.querySelector("audio");
  const note = panel.querySelector("[role=status]");
  const source = panel.querySelector("a");
  const synthButton = document.getElementById("speak");
  const reader = document.getElementById("read");
  const storageKey = "langrad-chapter-audio-v1";
  let positions = {};
  try { positions = JSON.parse(localStorage.getItem(storageKey) || "{}") || {}; } catch {}
  let tracks = {};
  let active = null;
  let lastSecond = -1;
  let pending = false;
  let loadError = false;

  function save() {
    if (!active || !audio.getAttribute("src") || audio.readyState < 1) return;
    const seconds = audio.ended ? 0 : Math.floor(audio.currentTime);
    if (!Number.isFinite(seconds) || seconds === lastSecond) return;
    lastSecond = seconds;
    positions[active.url] = seconds;
    try { localStorage.setItem(storageKey, JSON.stringify(positions)); } catch {}
  }

  function reset() {
    save();
    if (!audio.paused) audio.pause();
    if (audio.hasAttribute("src")) {
      audio.removeAttribute("src");
      audio.load();
    }
    audio.hidden = true;
    play.hidden = false;
    lastSecond = -1;
  }

  function showTrack() {
    const next = Object.hasOwn(tracks, state.activeTextId) ? tracks[state.activeTextId] : null;
    if (next === active) return;
    reset();
    active = next;
    panel.hidden = !next;
    if (next) {
      source.href = next.source;
      source.textContent = "LibriVox · " + next.reader;
      note.textContent = "";
    }
  }

  async function loadTracks() {
    if (pending || (!loadError && Object.keys(tracks).length)) return;
    pending = true;
    try {
      const response = await fetch("/books/chapter-audio.json",{credentials:"omit",signal:AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error("Unavailable audio catalog");
      const data = await response.json();
      tracks = Object.fromEntries(Object.entries(data).filter(([id, track]) =>
        /^(?:public-chapter-|kafka-verwandlung-)/.test(id) &&
        /^https:\/\/(?:www\.)?archive\.org\/download\/[\w.-]+\/[\w.-]+\.mp3$/.test(track?.url) &&
        /^https:\/\/librivox\.org\/[a-z0-9-]+\/$/.test(track.source) &&
        typeof track.reader === "string" && Number.isInteger(track.author_death_year) &&
        track.author_death_year + 70 < new Date().getUTCFullYear()));
      loadError = false;
      showTrack();
    } catch { loadError = true; }
    finally { pending = false; }
  }

  play.onclick = () => {
    if (!active) return;
    const track = active;
    if (audio.getAttribute("src") !== track.url) audio.src = track.url;
    note.textContent = "";
    audio.hidden = false;
    play.hidden = true;
    audio.play().catch(() => {
      if (active !== track || audio.getAttribute("src") !== track.url || reader.classList.contains("hidden")) return;
      note.textContent = "Запись не запустилась. Повтори попытку или открой LibriVox.";
      play.hidden = false;
    });
  };
  audio.addEventListener("loadedmetadata", () => {
    const saved = positions[active?.url];
    if (Number.isFinite(saved) && saved > 0 && saved < audio.duration - 2) audio.currentTime = saved;
  });
  audio.addEventListener("play", () => document.getElementById("lr-stop")?.click());
  audio.addEventListener("timeupdate", () => {
    if (Math.floor(audio.currentTime) - lastSecond >= 5) save();
  });
  for (const event of ["pause","seeked","ended"]) audio.addEventListener(event,save);
  audio.addEventListener("error", () => {
    if (!audio.hasAttribute("src")) return;
    note.textContent = "Не удалось загрузить запись. Проверь интернет или открой LibriVox.";
    audio.removeAttribute("src");
    audio.hidden = true;
    play.hidden = false;
  });
  synthButton.addEventListener("click", () => { if (!audio.paused) audio.pause(); }, {capture:true});
  window.addEventListener("pagehide", save);
  new MutationObserver(() => {
    if (reader.classList.contains("hidden") && !audio.paused) audio.pause();
  }).observe(reader,{attributes:true,attributeFilter:["class"]});

  const previousRender = renderReader;
  renderReader = function () {
    const result = previousRender.apply(this,arguments);
    showTrack();
    if (loadError) loadTracks();
    return result;
  };
  loadTracks();
})();
