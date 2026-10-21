// GenevaCam app.js
// Updated:
// - forecast wording fixed to "Prévisions pour Genève :"
// - TPG/CFF strings updated
// - tram ticker speed: desktop kept faster, mobile reduced by 50%
// - portrait mobile width rules corrected for clock + radio to match songs width
// - smoother 30-minute tram logic retained

console.log("GenevaCam loaded");

const PROXY_BASE = "https://genevacam-rss.christian-cobley.workers.dev/";
const proxied = (url) => `${PROXY_BASE}?url=${encodeURIComponent(url)}`;

//
// Fullscreen helper
//
function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

(function setupFullscreen() {
  const btn = document.getElementById("fullscreen-btn");
  if (!btn) return;

  const root = document.documentElement;
  const canFullscreen = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!canFullscreen) { btn.hidden = true; return; }

  function updateButton() {
    const on = isFullscreen();
    btn.classList.toggle("is-fullscreen", on);
    const label = on ? "Quitter le plein écran" : "Plein écran";
    btn.setAttribute("aria-label", label);
    btn.title = label;
  }

  btn.addEventListener("click", () => {
    try {
      if (isFullscreen()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        Promise.resolve(exit.call(document)).catch(err => console.warn("Exit fullscreen:", err));
      } else {
        const enter = root.requestFullscreen || root.webkitRequestFullscreen;
        Promise.resolve(enter.call(root)).catch(err => console.warn("Fullscreen:", err));
      }
    } catch (err) {
      console.warn("Fullscreen error:", err);
    }
  });

  document.addEventListener("fullscreenchange", updateButton);
  document.addEventListener("webkitfullscreenchange", updateButton);
  updateButton();
})();

//
// Webcam stream (HLS)
//
const video = document.getElementById("video");
const STREAM_URL = "https://edge16.vedge.infomaniak.com/livecast/ik:sig2/chunklist_w1380254353.m3u8";
let hls = null;

function startStream() {
  if (hls) {
    try { hls.destroy(); } catch (e) {}
    hls = null;
  }

  if (video && video.canPlayType && video.canPlayType("application/vnd.apple.mpegurl")) {
    video.src = STREAM_URL;
    video.load();
  } else if (window.Hls && Hls.isSupported()) {
    hls = new Hls();
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (!data.fatal) return;
      console.warn("Stream error:", data.type, data.details);
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
      else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      else setTimeout(startStream, 5000);
    });
    hls.loadSource(STREAM_URL);
    hls.attachMedia(video);
  } else if (video) {
    video.src = STREAM_URL;
  }

  if (video) video.play().catch(()=>{});
}

if (video) {
  video.addEventListener("error", () => {
    console.warn("Video error, retrying in 5s");
    setTimeout(startStream, 5000);
  });
}
startStream();

let lastVideoTime = -1;
setInterval(() => {
  if (!video) return;
  if (video.paused) { video.play().catch(()=>{}); return; }
  if (video.currentTime === lastVideoTime) {
    console.warn("Video stalled, restarting stream");
    startStream();
  }
  lastVideoTime = video.currentTime;
}, 30000);

//
// Clock + Weather
//
function describeWeatherFr(code) {
  if (code === 0) return "Ciel dégagé";
  if (code === 1) return "Plutôt dégagé";
  if (code === 2) return "Partiellement nuageux";
  if (code === 3) return "Couvert";
  if (code === 45 || code === 48) return "Brouillard";
  if (code >= 51 && code <= 55) return "Bruine";
  if (code === 56 || code === 57) return "Bruine verglaçante";
  if (code >= 61 && code <= 65) return "Pluie";
  if (code === 66 || code === 67) return "Pluie verglaçante";
  if (code >= 71 && code <= 75) return "Neige";
  if (code === 77) return "Grains de neige";
  if (code >= 80 && code <= 82) return "Averses";
  if (code === 85 || code === 86) return "Averses de neige";
  if (code === 95) return "Orage";
  if (code === 96 || code === 99) return "Orage avec grêle";
  return "";
}

function updateClock() {
  const now = new Date();
  const t = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Zurich" });
  const clockEl = document.getElementById("clock");
  if (clockEl) clockEl.textContent = t + " • Genève";

  const parts = new Intl.DateTimeFormat("fr-FR", { weekday:"long", day:"numeric", month:"long", timeZone:"Europe/Zurich" })
    .formatToParts(now)
    .map(part => (part.type === "weekday" || part.type === "month") ? part.value.charAt(0).toUpperCase() + part.value.slice(1) : part.value)
    .join("");

  const dateEl = document.getElementById("date");
  if (dateEl) dateEl.textContent = parts;
}

async function updateWeather() {
  try {
    const response = await fetch("https://api.open-meteo.com/v1/forecast?latitude=46.2044&longitude=6.1432&current=temperature_2m,weather_code,wind_speed_10m&timezone=Europe/Zurich");
    const data = await response.json();
    const condition = describeWeatherFr(data.current.weather_code);
    const temp = Math.round(data.current.temperature_2m) + "°C";
    const wind = Math.round(data.current.wind_speed_10m) + " km/h";
    const tempEl = document.getElementById("temperature");
    const weatherEl = document.getElementById("weather");
    if (tempEl) tempEl.textContent = temp;
    if (weatherEl) weatherEl.textContent = condition ? `${condition} • ${wind}` : wind;
  } catch (e) {
    console.warn("Weather error:", e);
  }
}

updateClock();
setInterval(updateClock, 1000);

updateWeather();
setInterval(updateWeather, 600000);

//
// Radio toggle
//
const radio = document.getElementById("radio");
const radioToggle = document.getElementById("radio-toggle");
if (radioToggle) {
  radioToggle.addEventListener("click", () => {
    if (!radio) return;
    if (radio.paused) {
      radio.play()
        .then(() => radioToggle.classList.add("active"))
        .catch(err => console.warn("Radio playback error:", err));
    } else {
      radio.pause();
      radioToggle.classList.remove("active");
    }
  });
}

//
// Bottom news ticker
//
const ticker = document.getElementById("ticker");
let feedBatches = [];
let rotationOffset = 0;
let cachedForecastText = "";
let currentAnimation = null;
const NEWS_TICKER_DURATION_MULTIPLIER = 0.85;

const leTempsFeeds = [
  { name: 'Le Temps Suisse', url: 'https://www.letemps.ch/suisse.rss' },
  { name: 'Le Temps Articles', url: 'https://www.letemps.ch/articles.rss' },
  { name: 'Le Temps Monde', url: 'https://www.letemps.ch/monde.rss' },
  { name: 'Le Temps Économie', url: 'https://www.letemps.ch/economie.rss' },
  { name: 'Le Temps Sport', url: 'https://www.letemps.ch/sport.rss' }
];

const twentyMinFeeds = [
  { name: '20 Minutes Genève', url: 'https://partner-feeds.20min.ch/rss/20minutes/suisse-romande/geneve' },
  { name: '20 Minutes Suisse Romande', url: 'https://partner-feeds.20min.ch/rss/20minutes/suisse-romande' },
  { name: '20 Minutes Suisse', url: 'https://partner-feeds.20min.ch/rss/20minutes/suisse' },
  { name: '20 Minutes Principal', url: 'https://partner-feeds.20min.ch/rss/20minutes' },
  { name: '20 Minutes Monde', url: 'https://partner-feeds.20min.ch/rss/20minutes/monde' },
  { name: '20 Minutes Économie', url: 'https://partner-feeds.20min.ch/rss/20minutes/economie' },
  { name: '20 Minutes Sports', url: 'https://partner-feeds.20min.ch/rss/20minutes/sports' }
];

async function fetchFeedXml(url) {
  try {
    const response = await fetch(proxied(url));
    if (!response.ok) return [];
    const xmlText = await response.text();
    const xmlDoc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (xmlDoc.querySelector("parsererror")) return [];
    return [...xmlDoc.querySelectorAll("item > title, entry > title")].map(t => t.textContent.trim()).filter(Boolean);
  } catch (e) {
    console.warn("Feed error:", url, e);
    return [];
  }
}

async function fetchTpgAlerts() {
  try {
    const res = await fetch('https://transport.opendata.ch/v1/stationboard?station=Geneve,Gare%20Cornavin&limit=5');
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.stationboard)) {
        const delayed = data.stationboard.filter(item => item.stop && item.stop.delay > 0);
        if (delayed.length > 0) {
          return delayed.slice(0, 2).map(item => `TPG / CFF : Genève-Cornavin - Ligne ${item.category}${item.number} vers ${item.to} — Retard de ${item.stop.delay} min`);
        }
      }
    }
  } catch (e) {}
  return ["TPG / CFF : Genève-Cornavin - Service régulier et fluide sur le réseau"];
}

async function getForecast() {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=46.2044&longitude=6.1432&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=Europe%2FZurich');
    const data = await response.json();
    const d = data.daily;
    const parts = d.time.map((day, i) => {
      let label = "Aujourd'hui";
      if (i === 1) label = 'Demain';
      else if (i > 1) {
        const name = new Date(day + 'T12:00:00Z').toLocaleDateString('fr-CH', { weekday:'long', timeZone:'UTC' });
        label = name.charAt(0).toUpperCase() + name.slice(1);
      }
      const desc = describeWeatherFr(d.weather_code[i]);
      return label + ' : ' + (desc ? desc + ', ' : '') + Math.round(d.temperature_2m_min[i]) + ' à ' + Math.round(d.temperature_2m_max[i]) + ' °C';
    });
    return 'Prévisions pour Genève : ' + parts.join('   |   ');
  } catch (e) {
    console.warn('Forecast fetch error:', e);
    return null;
  }
}

async function updateTicker() {
  const forecastPromise = getForecast();
  const tpgPromise = fetchTpgAlerts();

  const leTempsPromises = leTempsFeeds.map(feed => fetchFeedXml(feed.url));
  const twentyMinPromises = twentyMinFeeds.map(feed => fetchFeedXml(feed.url));

  cachedForecastText = await forecastPromise;
  const tpgResults = await tpgPromise;
  const leTempsResults = await Promise.all(leTempsPromises);
  const twentyMinResults = await Promise.all(twentyMinPromises);

  feedBatches = [];

  feedBatches.push({
    name: "Geneva Cam",
    titles: [
      "Bienvenue sur Geneva Cam 😃 Bonne écoute de Radio Lac, le meilleur de la musique 🎵"
    ]
  });

  if (tpgResults && tpgResults.length > 0) {
    feedBatches.push({ name: "Transports publics à Genève", titles: tpgResults });
  }

  leTempsResults.forEach((titles, idx) => {
    const feed = leTempsFeeds[idx];
    if (titles && titles.length > 0) {
      feedBatches.push({
        name: feed.name,
        titles: titles
      });
    }
  });

  twentyMinResults.forEach((titles, idx) => {
    const feed = twentyMinFeeds[idx];
    if (titles && titles.length > 0) {
      feedBatches.push({
        name: feed.name,
        titles: titles
      });
    }
  });

  renderNextRotationBatch();
}

function renderNextRotationBatch() {
  const headlines = [];

  if (feedBatches.length > 0) {
    const welcomeBatch = feedBatches[0];
    const total = welcomeBatch.titles.length;
    for (let i = 0; i < Math.min(2, total); i++) {
      const storyIndex = (rotationOffset + i) % total;
      headlines.push(`${welcomeBatch.name}: ${welcomeBatch.titles[storyIndex]}`);
    }
  }

  if (cachedForecastText) {
    headlines.push(cachedForecastText);
  }

  for (let b = 1; b < feedBatches.length; b++) {
    const batch = feedBatches[b];
    const total = batch.titles.length;
    if (total > 0) {
      for (let i = 0; i < Math.min(3, total); i++) {
        const storyIndex = (rotationOffset + i) % total;
        headlines.push(`${batch.name}: ${batch.titles[storyIndex]}`);
      }
    }
  }

  rotationOffset = (rotationOffset + 3) % 10;

  if (headlines.length > 0) {
    const joined = headlines.join("   •   ");
    if (ticker) ticker.textContent = joined;
    startTickerSeamless();
  } else if (ticker) {
    ticker.textContent = "Impossible de charger le flux d'actualités";
  }
}

function startTickerSeamless() {
  if (!ticker) return;

  if (currentAnimation) {
    try { currentAnimation.cancel(); } catch (e) {}
    currentAnimation = null;
  }

  const startPos = window.innerWidth;
  ticker.style.transform = `translateX(${startPos}px)`;

  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    setTimeout(renderNextRotationBatch, 10000);
    return;
  }

  requestAnimationFrame(() => {
    const width = ticker.offsetWidth;
    const distance = width + window.innerWidth;
    const isMobilePortrait = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
    const isMobileLandscape = window.matchMedia("(max-height: 500px) and (orientation: landscape)").matches;
    const base = isMobilePortrait ? distance * 14.25 : isMobileLandscape ? distance * 10.6666667 : distance * 8.0;
    const duration = Math.max(4000, Math.round(base * NEWS_TICKER_DURATION_MULTIPLIER));

    currentAnimation = ticker.animate(
      [
        { transform: `translateX(${startPos}px)` },
        { transform: `translateX(-${width}px)` }
      ],
      {
        duration,
        iterations: 1,
        easing: "linear"
      }
    );

    currentAnimation.onfinish = () => renderNextRotationBatch();
  });
}

updateTicker();
setInterval(updateTicker, 600000);

//
// Songs widget + tram ticker
//
const SONGS_URL = "https://www.radiolac.ch/cache/lac.json";
const SONGS_REFRESH_MS = 30000;
const GRANGE_CANAL_STOP_ID = "8592833";

// Desktop speed = increased by 50%
const DESKTOP_DEPARTURES_TICKER_SPEED = 92.0 * 1.15 * 1.5;

// Mobile speed = desktop speed * 50% reduction
const MOBILE_DEPARTURES_TICKER_SPEED = DESKTOP_DEPARTURES_TICKER_SPEED * 0.5;

(function createSongsWidget() {
  const logoBox = document.getElementById("logoBox");
  const clockBox = document.getElementById("clockBox");
  const box = document.createElement("div");
  box.id = "songs-widget";
  box.hidden = true;

  const tramTicker = document.createElement("div");
  tramTicker.id = "tram-ticker";
  tramTicker.setAttribute("aria-label", "Départs des trams à Grange-Canal dans les 30 prochaines minutes");
  const tramTrack = document.createElement("span");
  tramTrack.id = "tram-ticker-track";
  tramTicker.appendChild(tramTrack);

  let tramAnimation = null;
  let lastDepartureText = "";

  const placeTramTicker = () => {
    if (!clockBox) return;
    if (tramTicker.parentElement !== clockBox) clockBox.appendChild(tramTicker);
  };

  const renderTramTicker = (text) => {
    if (text === lastDepartureText) return;
    lastDepartureText = text;
    const loopText = text + "   •   ";
    tramTrack.textContent = loopText + loopText;
    placeTramTicker();

    if (tramAnimation) {
      try { tramAnimation.cancel(); } catch (e) {}
      tramAnimation = null;
    }

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      tramTrack.style.transform = "translateX(0)";
      return;
    }

    requestAnimationFrame(() => {
      const copyWidth = tramTrack.getBoundingClientRect().width / 2;
      if (!copyWidth) return;

      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const currentSpeed = isMobile ? MOBILE_DEPARTURES_TICKER_SPEED : DESKTOP_DEPARTURES_TICKER_SPEED;

      const duration = Math.max(4000, Math.round((copyWidth / currentSpeed) * 1000));
      tramAnimation = tramTrack.animate(
        [
          { transform: "translateX(0px)" },
          { transform: `translateX(-${copyWidth}px)` }
        ],
        {
          duration,
          iterations: Infinity,
          easing: "linear"
        }
      );
    });
  };

  async function refreshTramDepartures() {
    try {
      const url = `https://transport.opendata.ch/v1/stationboard?id=${GRANGE_CANAL_STOP_ID}&limit=120`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("HTTP " + response.status);

      const data = await response.json();
      const now = Date.now();

      const tramEntries = (data.stationboard || [])
        .map(item => {
          const stop = item.stop || {};
          const departure = (stop.prognosis && stop.prognosis.departure) || stop.departure;
          return {
            item,
            stop,
            departure,
            timestamp: departure ? Date.parse(departure) : NaN
          };
        })
        .filter(row => {
          const isTram = String(row.item && row.item.category || "").toUpperCase() === "T";
          return isTram && Number.isFinite(row.timestamp) && row.timestamp >= now;
        })
        .sort((a, b) => a.timestamp - b.timestamp);

      let startWindow = now;
      let endWindow = now + 30 * 60 * 1000;

      const inNext30Minutes = tramEntries.filter(row => row.timestamp <= endWindow);

      if (inNext30Minutes.length === 0 && tramEntries.length > 0) {
        startWindow = tramEntries[0].timestamp;
        endWindow = startWindow + 30 * 60 * 1000;
      } else {
        startWindow = now;
        endWindow = now + 30 * 60 * 1000;
      }

      const matches = tramEntries.filter(row => row.timestamp >= startWindow && row.timestamp <= endWindow);

      if (!matches.length) {
        renderTramTicker("Grange-Canal, prochains départs : aucun tram prévu");
        return;
      }

      const formatter = new Intl.DateTimeFormat("fr-CH", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Zurich"
      });

      const departures = matches.map(row => {
        const line = "T" + (row.item.number || "");
        const delay = Number(row.stop.delay) > 0 ? " +" + row.stop.delay + " min" : "";
        return `${line} → ${row.item.to || "destination inconnue"} ${formatter.format(new Date(row.timestamp))}${delay}`;
      });

      renderTramTicker("Grange-Canal, prochains départs : " + departures.join("   •   "));
    } catch (error) {
      console.warn("Tram departures error:", error);
      renderTramTicker("Grange-Canal, prochains départs : indisponible");
    }
  }

  window.addEventListener("resize", () => {
    placeTramTicker();
    if (lastDepartureText) renderTramTicker(lastDepartureText);
  }, { passive: true });

  if (logoBox) {
    const main = document.createElement("div");
    main.id = "logoMain";
    while (logoBox.firstChild) main.appendChild(logoBox.firstChild);
    logoBox.append(main, box);
  } else {
    document.body.appendChild(box);
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const makeRow = (label, song, isNow) => {
    const row = el("div", "sw-row" + (isNow ? " now" : ""));
    const img = el("img");
    img.alt = "";
    img.src = song.imagexs || "";
    img.onerror = () => { img.style.visibility = "hidden"; };

    const text = el("div", "sw-text");
    const time = song.simpletime ? " • " + song.simpletime : "";
    text.append(
      el("div", "sw-label", label + time),
      el("div", "sw-title", song.title || ""),
      el("div", "sw-artist", song.interpret || "")
    );

    row.append(img, text);
    return row;
  };

  let lastKey = "";

  async function refreshSongs() {
    try {
      const res = await fetch(proxied(SONGS_URL));
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();

      const now = json.live && json.live[0];
      const isPortrait = window.matchMedia("(max-width: 768px) and (orientation: portrait)").matches;
      const prevCount = isPortrait ? 2 : 2;
      const prev = (json.played || []).slice(0, prevCount);

      if (!now) throw new Error("No live entry");

      box.classList.remove("stale");

      const key = [now, ...prev].map(s => s.playtime || s.title).join("|");
      if (key === lastKey) return;
      lastKey = key;

      const children = [
        el("div", "sw-header", "DERNIERS TITRES"),
        makeRow("En ce moment", now, true)
      ];

      if (prev && prev.length) {
        for (let i = 0; i < prev.length; i++) {
          const label = i === 0 ? "Juste avant" : "Avant cela";
          children.push(makeRow(label, prev[i], false));
        }
      }

      const list = document.createElement('div');
      list.className = 'sw-list';
      children.forEach(c => list.appendChild(c));
      box.replaceChildren(list);
      box.hidden = false;
      if (logoBox) logoBox.classList.add("has-songs");
      placeTramTicker();
    } catch (e) {
      console.warn("Songs error:", e);
      if (!box.hidden) box.classList.add("stale");
    }
  }

  refreshSongs();
  setInterval(refreshSongs, SONGS_REFRESH_MS);

  refreshTramDepartures();
  setInterval(refreshTramDepartures, SONGS_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      refreshSongs();
      refreshTramDepartures();
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    placeTramTicker();
    if (lastDepartureText) renderTramTicker(lastDepartureText);
  });
})();

//
// Toggle for hiding top boxes
//
(function setupOverlayToggle() {
  const button = document.getElementById("overlay-toggle");
  if (!button) return;

  button.addEventListener("click", () => {
    const hidden = document.body.classList.toggle("boxes-hidden");
    button.textContent = hidden ? "Afficher" : "Masquer";
    button.setAttribute("aria-expanded", String(!hidden));
    button.setAttribute(
      "aria-label",
      hidden ? "Afficher les panneaux d'information" : "Masquer les panneaux d'information"
    );
  });
})();