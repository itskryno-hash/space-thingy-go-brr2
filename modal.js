/**
 * modal.js — Launch detail modal rendering & countdown timer
 */
import { getLaunchStatus, buildMilestones, formatCountdown, formatDate, getPrimaryAgency, agencyClass, hasConfirmedDate } from './api.js';

let countdownInterval = null;

export function openModal(launch) {
  const overlay = document.getElementById("modalOverlay");
  const content = document.getElementById("modalContent");
  content.innerHTML = renderModal(launch);
  overlay.classList.add("open");
  document.body.style.overflow = "hidden";

  // Start countdown if upcoming
  const status = getLaunchStatus(launch);
  if (!["success","failure","partial"].includes(status.type) && launch.net) {
    startCountdown(launch.net, status.type === "live");
  }

  // Close handlers
  document.getElementById("modalCloseBtn").onclick = closeModal;
  overlay.onclick = e => { if (e.target === overlay) closeModal(); };
  document.onkeydown = e => { if (e.key === "Escape") closeModal(); };
}

export function closeModal() {
  const overlay = document.getElementById("modalOverlay");
  overlay.classList.remove("open");
  document.body.style.overflow = "";
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  document.onkeydown = null;
}

function startCountdown(netStr, isLive) {
  if (isLive) return; // show live badge instead
  const el = document.getElementById("countdownDigits");
  const labels = document.getElementById("countdownSubs");
  if (!el) return;
  const update = () => {
    const { str, past, d, h, m, s } = formatCountdown(netStr);
    el.textContent = str;
    if (labels && !past) {
      labels.innerHTML = `
        <span class="countdown-sub">DAYS</span>
        <span class="countdown-sub">HRS</span>
        <span class="countdown-sub">MIN</span>
        <span class="countdown-sub">SEC</span>
      `;
    }
  };
  update();
  countdownInterval = setInterval(update, 1000);
}

function renderModal(launch) {
  const status = getLaunchStatus(launch);
  const isPast = ["success","failure","partial"].includes(status.type);
  const isLive = status.type === "live";
  const agency = getPrimaryAgency(launch);
  const vehicle = launch.rocket?.configuration?.name || "Unknown Vehicle";
  const milestones = buildMilestones(launch);
  const hasMissionDesc = !!launch.mission?.description;
  const vidURL = launch.vidURL || (launch.vidURLs && launch.vidURLs.length ? launch.vidURLs[0].url : null);
  const hasStream = !!vidURL;
  const orbit = launch.mission?.orbit?.name || null;
  const pad = launch.pad?.name || null;
  const location = launch.pad?.location?.name || null;
  const missionType = launch.mission?.type || null;

  return `
    <div class="modal-header">
      <div class="modal-header-left">
        <div class="modal-agency ${agencyClass(agency)}">${agency}</div>
        <div class="modal-name">${launch.name || "Unknown Mission"}</div>
        <div class="modal-vehicle">${vehicle}</div>
      </div>
      <button class="modal-close" id="modalCloseBtn">✕</button>
    </div>
    <div class="modal-body">

      ${renderInfoGrid(launch, status, orbit, pad, location, missionType)}

      ${isLive ? renderLiveBlock(vidURL) : ""}
      ${isPast ? renderPastStatusBlock(launch, status) : ""}
      ${!isPast && !isLive ? renderCountdown(launch.net, launch.net_precision) : ""}

      ${!isLive && hasStream && !isPast ? renderStreamBlock(vidURL) : ""}
      ${!isLive && hasStream && isPast ? renderReplayBlock(vidURL) : ""}
      ${!hasStream ? `<div class="no-data-notice">⎊ No official live stream link available</div>` : ""}

      ${renderMilestones(milestones, isPast, isLive, hasMissionDesc)}
    </div>
  `;
}

function renderInfoGrid(launch, status, orbit, pad, location, missionType) {
  const date = formatDate(launch.net, launch.net_precision);
  const badgeClass = {
    live: "badge-live", success: "badge-success", failure: "badge-failure",
    partial: "badge-partial", go: "badge-success", tbd: "badge-tbd"
  }[status.type] || "badge-tbd";

  return `
    <div class="info-grid">
      <div class="info-cell">
        <div class="ic-label">Status</div>
        <div class="ic-value"><span class="status-badge ${badgeClass}"><span class="badge-dot"></span>${status.label}</span></div>
      </div>
      <div class="info-cell">
        <div class="ic-label">Launch Date</div>
        <div class="ic-value small">${date}</div>
      </div>
      ${orbit ? `<div class="info-cell"><div class="ic-label">Target Orbit</div><div class="ic-value small">${orbit}</div></div>` : ""}
      ${missionType ? `<div class="info-cell"><div class="ic-label">Mission Type</div><div class="ic-value small">${missionType}</div></div>` : ""}
      ${pad ? `<div class="info-cell"><div class="ic-label">Launch Pad</div><div class="ic-value small">${pad}</div></div>` : ""}
      ${location ? `<div class="info-cell"><div class="ic-label">Location</div><div class="ic-value small">${location}</div></div>` : ""}
    </div>
  `;
}

function renderCountdown(netStr, precision) {
  if (!netStr) return `<div class="countdown-block"><div class="countdown-label">LAUNCH WINDOW</div><div class="countdown-digits">TBD</div></div>`;
  const prec = precision?.name || "Second";
  const isApprox = ["Year","Month","Quarter","Day"].includes(prec);
  return `
    <div class="countdown-block">
      <div class="countdown-label">${isApprox ? "ESTIMATED LAUNCH" : "COUNTDOWN TO LAUNCH"}</div>
      <div class="countdown-digits" id="countdownDigits">${isApprox ? formatDate(netStr, precision) : "T−00:00:00:00"}</div>
      ${!isApprox ? `<div class="countdown-subs" id="countdownSubs">
        <span class="countdown-sub">DAYS</span>
        <span class="countdown-sub">HRS</span>
        <span class="countdown-sub">MIN</span>
        <span class="countdown-sub">SEC</span>
      </div>` : ""}
    </div>
  `;
}

function renderLiveBlock(vidURL) {
  const ytId = extractYouTubeId(vidURL);
  return `
    <div class="stream-block">
      <div class="stream-label"><span class="live-dot"></span>LIVE BROADCAST</div>
      ${ytId ? `<iframe src="https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1" allowfullscreen allow="autoplay"></iframe>` : 
        vidURL ? `<a class="stream-link" href="${vidURL}" target="_blank">▶ Watch Live Stream →</a>` :
        `<div class="no-data-notice" style="margin:0;border:none">No official live stream link available</div>`}
    </div>
  `;
}

function renderStreamBlock(vidURL) {
  if (!vidURL) return "";
  return `
    <div class="stream-block">
      <div class="stream-label" style="color:var(--accent2)">▶ OFFICIAL STREAM (Pre-Launch)</div>
      <a class="stream-link" href="${vidURL}" target="_blank">Watch on YouTube / Official Channel →</a>
    </div>
  `;
}

function renderReplayBlock(vidURL) {
  if (!vidURL) return "";
  return `
    <div class="stream-block">
      <div class="stream-label" style="color:var(--muted2)">▶ MISSION REPLAY</div>
      <a class="stream-link" href="${vidURL}" target="_blank">Watch Full Mission Recording →</a>
    </div>
  `;
}

function renderPastStatusBlock(launch, status) {
  const badgeClass = { success: "badge-success", failure: "badge-failure", partial: "badge-partial" }[status.type] || "badge-tbd";
  const emoji = { success: "✓", failure: "✕", partial: "△" }[status.type] || "?";
  return `
    <div class="countdown-block">
      <div class="countdown-label">MISSION OUTCOME</div>
      <div class="countdown-digits" style="font-size:2rem">${emoji} ${status.label}</div>
    </div>
  `;
}

function renderMilestones(milestones, isPast, isLive, hasMissionDesc) {
  if (!milestones.length) return `<div class="no-data-notice">Unknown mission goals</div>`;

  const liveNote = isLive ? `<div class="no-data-notice" style="margin-bottom:1rem">⚡ Live milestone data not available — status shown is estimated</div>` : "";
  const noLiveNote = (!isLive && !isPast) ? `<div class="no-data-notice" style="margin-bottom:1rem">ℹ No real-time milestone tracking — goals shown are planned objectives</div>` : "";

  const icons = { done: "✓", failed: "✕", partial: "△", pending: "○" };

  const items = milestones.map(m => `
    <div class="milestone-item">
      <div class="milestone-icon ${m.state}">${icons[m.state] || "○"}</div>
      <div class="milestone-text">
        <div class="m-name">${m.name}</div>
        ${m.sub ? `<div class="m-sub">${m.sub}</div>` : ""}
      </div>
      <div class="milestone-status ${m.state}">${m.state.toUpperCase()}</div>
    </div>
  `).join("");

  return `
    <div class="milestones">
      <div class="milestones-title">Mission Milestones & Goals</div>
      ${liveNote}${noLiveNote}
      ${items}
    </div>
  `;
}

function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
    }
