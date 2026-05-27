/**
 * main.js — App bootstrap, rendering, state management
 */
import { fetchUpcoming, fetchRecent, getLaunchStatus, formatDate, getPrimaryAgency, agencyClass, isMajor, hasConfirmedDate } from './api.js';
import { openModal } from './modal.js';

let mode = "all"; // "all" | "major"
let upcomingData = [];
let recentData = [];

// ===== BOOT SEQUENCE =====
async function boot() {
  const fill = document.getElementById("bootFill");
  const bootText = document.getElementById("bootText");
  const steps = [
    [15, "CONNECTING TO LAUNCH LIBRARY..."],
    [40, "FETCHING MISSION DATA..."],
    [70, "PARSING TELEMETRY..."],
    [90, "RENDERING INTERFACE..."],
    [100, "READY"],
  ];
  for (const [pct, msg] of steps) {
    fill.style.width = pct + "%";
    bootText.textContent = msg;
    await sleep(300 + Math.random() * 200);
  }
  await sleep(400);
  document.getElementById("boot").classList.add("hidden");
  document.getElementById("main").classList.add("visible");
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ===== RENDER =====
function renderApp() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="stars-bg"></div>
    <div class="boot-screen" id="boot">
      <div class="boot-inner">
        <div class="boot-logo">LIFTOFF</div>
        <div class="boot-text" id="bootText">INITIALIZING TELEMETRY...</div>
        <div class="boot-bar"><div class="boot-fill" id="bootFill"></div></div>
      </div>
    </div>

    <div id="main">
      <header class="header">
        <div class="header-logo">LIFTOFF</div>
        <div class="header-tagline">GLOBAL ROCKET LAUNCH TRACKER</div>
        <div class="mode-toggle">
          <button class="mode-btn ${mode === 'all' ? 'active' : ''}" id="btnAll">ALL</button>
          <button class="mode-btn ${mode === 'major' ? 'active' : ''}" id="btnMajor">MAJOR</button>
        </div>
      </header>

      <div id="tickerBar" class="ticker-bar"><div class="ticker-inner" id="tickerInner">Loading ticker…</div></div>

      <main class="page" id="pageContent">
        <div class="loading-state"><span class="spin">◌</span> FETCHING REAL LAUNCH DATA...</div>
      </main>
    </div>

    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modalContent" role="dialog" aria-modal="true"></div>
    </div>
  `;

  document.getElementById("btnAll").onclick = () => setMode("all");
  document.getElementById("btnMajor").onclick = () => setMode("major");
}

function setMode(m) {
  mode = m;
  document.getElementById("btnAll").classList.toggle("active", m === "all");
  document.getElementById("btnMajor").classList.toggle("active", m === "major");
  renderPage();
}

function filterByMode(launches) {
  if (mode === "major") return launches.filter(isMajor);
  return launches;
}

// ===== PAGE CONTENT =====
function renderPage() {
  const upcoming = filterByMode(upcomingData);
  const recent = filterByMode(recentData);
  const page = document.getElementById("pageContent");

  if (!upcoming.length && !recent.length) {
    page.innerHTML = `<div class="error-state">No launches found for selected mode.</div>`;
    return;
  }

  page.innerHTML = `
    ${renderRecentSection(recent)}
    ${renderUpcomingSection(upcoming)}
  `;

  // Bind click events
  document.querySelectorAll("[data-launch-id]").forEach(el => {
    const id = el.dataset.launchId;
    const clickable = el.dataset.clickable === "true";
    if (clickable) {
      el.style.cursor = "pointer";
      el.onclick = () => {
        const launch = [...upcomingData, ...recentData].find(l => l.id === id);
        if (launch) openModal(launch);
      };
    }
  });
}

// ===== RECENT 3 LAUNCHES =====
function renderRecentSection(recent) {
  if (!recent.length) return "";
  return `
    <div class="section-label"><span class="dot"></span>LAST ${recent.length} LAUNCH${recent.length !== 1 ? "ES" : ""}</div>
    <div class="past-grid">
      ${recent.map((l, i) => renderPastCard(l, i)).join("")}
    </div>
  `;
}

function renderPastCard(launch, idx) {
  const status = getLaunchStatus(launch);
  const agency = getPrimaryAgency(launch);
  const badgeClass = {
    success: "badge-success", failure: "badge-failure",
    partial: "badge-partial", live: "badge-live", tbd: "badge-tbd", go: "badge-success"
  }[status.type] || "badge-tbd";
  const date = formatDate(launch.net, launch.net_precision);
  const vehicle = launch.rocket?.configuration?.name || "";

  return `
    <div class="past-card" data-launch-id="${launch.id}" data-clickable="true">
      <div class="mission-num">MISSION ${String(idx + 1).padStart(2, "0")}</div>
      <div class="mission-name">${launch.name?.replace(/\|.*/, "").trim() || "Unknown"}</div>
      <div class="mission-vehicle ${agencyClass(agency)}">${agency}${vehicle ? ` · ${vehicle}` : ""}</div>
      <div class="mission-date">${date}</div>
      <div><span class="status-badge ${badgeClass}"><span class="badge-dot"></span>${status.label}</span></div>
    </div>
  `;
}

// ===== UPCOMING LIST =====
function renderUpcomingSection(upcoming) {
  if (!upcoming.length) return `<div class="error-state">No upcoming launches found.</div>`;

  const rows = upcoming.map((l, i) => renderLaunchRow(l, i + 1)).join("");
  return `
    <div class="section-label"><span class="dot"></span>UPCOMING LAUNCHES (${upcoming.length})</div>
    <div class="upcoming-list">
      <div class="launch-row header-row">
        <div class="col-header col-idx">#</div>
        <div class="col-header">MISSION</div>
        <div class="col-header col-vehicle">VEHICLE</div>
        <div class="col-header col-date">NET DATE</div>
        <div class="col-header col-status" style="text-align:right">STATUS</div>
      </div>
      ${rows}
    </div>
  `;
}

function renderLaunchRow(launch, idx) {
  const status = getLaunchStatus(launch);
  const confirmed = hasConfirmedDate(launch);
  const agency = getPrimaryAgency(launch);
  const vehicle = launch.rocket?.configuration?.name || "—";
  const date = formatDate(launch.net, launch.net_precision);
  const badgeClass = {
    live: "badge-live", success: "badge-success", failure: "badge-failure",
    partial: "badge-partial", go: "badge-success", tbd: "badge-tbd"
  }[status.type] || "badge-tbd";

  const noDate = !confirmed;

  return `
    <div class="launch-row ${noDate ? "no-date" : ""}" 
         data-launch-id="${launch.id}" 
         data-clickable="${noDate ? "false" : "true"}">
      <div class="col-idx">${String(idx).padStart(2, "0")}</div>
      <div class="col-name">
        <div class="name">${launch.name?.replace(/\|.*/, "").trim() || "Unknown"}</div>
        <div class="agency ${agencyClass(agency)}">${agency}${noDate ? `<span class="noconfirm-tag">NO DATE</span>` : ""}</div>
      </div>
      <div class="col-vehicle">${vehicle}</div>
      <div class="col-date ${noDate ? "tbd" : ""}">${date}</div>
      <div class="col-status">
        <span class="status-badge ${badgeClass}"><span class="badge-dot"></span>${status.label}</span>
      </div>
    </div>
  `;
}

// ===== TICKER =====
function renderTicker(upcoming) {
  const inner = document.getElementById("tickerInner");
  if (!inner || !upcoming.length) return;
  const items = upcoming.slice(0, 10).map(l => {
    const agency = getPrimaryAgency(l);
    const date = formatDate(l.net, l.net_precision);
    return `<span class="${agencyClass(agency)}">${agency}</span> · ${l.name?.replace(/\|.*/, "").trim()} <span style="color:var(--muted)">→ ${date}</span>`;
  });
  inner.innerHTML = items.map(i => `${i} <span class="ticker-sep">◆</span> `).join("");
}

// ===== INIT =====
async function init() {
  renderApp();
  boot(); // start boot animation in parallel

  try {
    const [upcoming, recent] = await Promise.all([fetchUpcoming(), fetchRecent()]);
    upcomingData = upcoming;
    recentData = recent;

    // Wait for boot to finish
    await sleep(1800);

    renderPage();
    renderTicker(filterByMode(upcoming));
  } catch (err) {
    console.error("Failed to load launch data:", err);
    await sleep(1800);
    document.getElementById("pageContent").innerHTML = `
      <div class="error-state">
        <div style="margin-bottom:0.5rem;font-size:1.5rem">⚠</div>
        <div>Could not load launch data.</div>
        <div style="margin-top:0.5rem;font-size:0.7rem">The Space Devs API may be rate-limited or unavailable. <a href="https://ll.thespacedevs.com" target="_blank">Check status</a></div>
        <div style="margin-top:0.5rem;font-size:0.65rem;color:var(--muted)">${err.message}</div>
      </div>
    `;
  }
}

init();
