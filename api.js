/**
 * api.js — Data layer using The Space Devs Launch Library 2 API
 * https://ll.thespacedevs.com/2.2.0/
 * Free tier: 15 req/hour unauthenticated — sufficient for this app.
 */

const BASE = "https://ll.thespacedevs.com/2.2.0";

// Agencies we EXCLUDE (China & Russia + their main orgs)
const EXCLUDED_AGENCY_IDS = new Set([63, 66, 25, 44, 16]); 
// 63=CNSA, 66=Roscosmos, 25=CASC, 44=KB Makeyev, 16=ISRO (not excluded—India is fine)
// Actually just exclude by country code
const EXCLUDED_COUNTRIES = new Set(["CHN", "RUS"]);

// Agency display helpers
const AGENCY_CLASSES = {
  "SpaceX":         "tag-spacex",
  "NASA":           "tag-nasa",
  "ESA":            "tag-esa",
  "ULA":            "tag-ula",
  "Rocket Lab":     "tag-rocketlab",
};

export function agencyClass(name = "") {
  for (const [k, v] of Object.entries(AGENCY_CLASSES)) {
    if (name.includes(k)) return v;
  }
  return "tag-other";
}

export const MAJOR_AGENCIES = ["SpaceX", "NASA", "ESA"];
export function isMajor(launch) {
  const agencies = getLaunchAgencies(launch);
  return MAJOR_AGENCIES.some(m => agencies.some(a => a.includes(m)));
}

export function getLaunchAgencies(launch) {
  const results = [];
  if (launch.launch_service_provider?.name) results.push(launch.launch_service_provider.name);
  if (launch.rocket?.configuration?.manufacturer?.name) results.push(launch.rocket.configuration.manufacturer.name);
  return results.length ? results : ["Unknown"];
}

function shouldExclude(launch) {
  const country = launch.launch_service_provider?.country_code;
  if (country && EXCLUDED_COUNTRIES.has(country)) return true;
  const name = launch.launch_service_provider?.name?.toLowerCase() || "";
  if (name.includes("roscosmos") || name.includes("cnsa") || name.includes("casc")) return true;
  return false;
}

/**
 * Fetch upcoming launches (next 6 months, paginated)
 */
export async function fetchUpcoming() {
  const url = `${BASE}/launch/upcoming/?format=json&limit=50&ordering=net&mode=detailed`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  return (data.results || []).filter(l => !shouldExclude(l));
}

/**
 * Fetch recent launches (last 3 from everyone we care about)
 */
export async function fetchRecent() {
  const url = `${BASE}/launch/previous/?format=json&limit=20&ordering=-net&mode=detailed`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const filtered = (data.results || []).filter(l => !shouldExclude(l));
  return filtered.slice(0, 3);
}

/**
 * Fetch a single launch detail by ID
 */
export async function fetchLaunch(id) {
  const url = `${BASE}/launch/${id}/?format=json&mode=detailed`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return await res.json();
}

/**
 * Parse launch status from API data
 */
export function getLaunchStatus(launch) {
  const abbrev = launch.status?.abbrev || "";
  const name = launch.status?.name || "";
  if (abbrev === "In Flight") return { type: "live", label: "IN FLIGHT" };
  if (abbrev === "Success") return { type: "success", label: "SUCCESS" };
  if (abbrev === "Failure") return { type: "failure", label: "FAILURE" };
  if (abbrev === "Partial Failure") return { type: "partial", label: "PARTIAL" };
  if (abbrev === "Go") return { type: "go", label: "GO" };
  if (abbrev === "TBD" || abbrev === "TBC") return { type: "tbd", label: "TBD" };
  if (abbrev === "Hold") return { type: "tbd", label: "HOLD" };
  return { type: "tbd", label: name || "UNKNOWN" };
}

export function hasConfirmedDate(launch) {
  const abbrev = launch.status?.abbrev || "";
  // TBD and TBC mean no confirmed window
  if (abbrev === "TBD" || abbrev === "TBC") return false;
  // Check if net_precision is at least "Day"
  const prec = launch.net_precision?.name || "";
  if (prec === "Year" || prec === "Month" || prec === "Quarter") return false;
  return true;
}

/**
 * Build mission milestones from available mission data + rocket events
 */
export function buildMilestones(launch) {
  const milestones = [];
  const status = getLaunchStatus(launch);
  const isPast = ["success","failure","partial"].includes(status.type);
  const isLive = status.type === "live";

  // Always: liftoff
  milestones.push({
    key: "liftoff",
    name: "Liftoff",
    sub: "T+0:00",
    state: isPast || isLive ? "done" : "pending"
  });

  // Max-Q for orbital / suborbital
  const orbit = launch.mission?.orbit?.abbrev || "";
  const isOrbital = !["Sub", "Sub-orbital"].includes(orbit) && orbit !== "";
  if (isOrbital || orbit === "") {
    milestones.push({ key: "maxq", name: "Max-Q", sub: "Maximum dynamic pressure", state: isPast || isLive ? "done" : "pending" });
  }

  // Stage separation if rocket has it
  const vehicle = launch.rocket?.configuration?.name?.toLowerCase() || "";
  const hasStaging = !vehicle.includes("electron") && !vehicle.includes("new shepard");
  if (hasStaging) {
    milestones.push({ key: "meco", name: "MECO / Stage Sep", sub: "Main engine cutoff & stage separation", state: isPast || isLive ? "done" : "pending" });
  }

  // LEO insertion
  if (isOrbital || orbit === "LEO" || orbit === "SSO" || orbit === "ISS") {
    milestones.push({ key: "leo", name: "Low Earth Orbit Insertion", sub: orbit || "Orbit", state: isPast ? "done" : (isLive ? "partial" : "pending") });
  }

  // Landing attempt (SpaceX boosters etc)
  const hasLanding = vehicle.includes("falcon") || vehicle.includes("starship") || vehicle.includes("new shepard") || vehicle.includes("electron");
  if (hasLanding) {
    const landingState = (() => {
      if (!isPast && !isLive) return "pending";
      // Check landing outcomes if available
      const cores = launch.rocket?.launcher_stage || [];
      if (cores.length) {
        const attempted = cores.some(c => c.landing?.attempt);
        const success = cores.every(c => !c.landing?.attempt || c.landing?.success);
        const anyFail = cores.some(c => c.landing?.attempt && c.landing?.success === false);
        if (!attempted) return "pending";
        if (anyFail) return "failed";
        if (success) return "done";
        return "partial";
      }
      return isPast ? "done" : "pending";
    })();
    milestones.push({ key: "landing", name: "Booster / Vehicle Landing", sub: "Recovery attempt", state: landingState });
  }

  // Payload deploy
  const missionType = launch.mission?.type?.toLowerCase() || "";
  const hasDeploy = !missionType.includes("crewed") && !missionType.includes("human");
  if (hasDeploy) {
    milestones.push({ key: "deploy", name: "Payload Deployment", sub: launch.mission?.name || "Mission payload", state: isPast ? "done" : (isLive ? "pending" : "pending") });
  }

  // Custom mission goals from mission description
  const goals = [];
  if (launch.mission?.description) {
    // Extract sentences that sound like objectives
    const desc = launch.mission.description;
    goals.push({ key: "goal_mission", name: "Mission Objective", sub: desc.length > 120 ? desc.slice(0, 120) + "…" : desc, state: isPast ? "done" : "pending" });
  }

  return [...milestones, ...goals];
}

/**
 * Format countdown from now to date string
 */
export function formatCountdown(netStr) {
  const net = new Date(netStr);
  const now = new Date();
  const diff = net - now;
  if (diff < 0) return { str: "T+00:00:00:00", past: true };
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, "0");
  return { str: `T−${pad(d)}:${pad(h)}:${pad(m)}:${pad(s)}`, past: false, d, h, m, s };
}

export function formatDate(netStr, precision) {
  if (!netStr) return "TBD";
  const d = new Date(netStr);
  const prec = precision?.name || "Second";
  if (prec === "Year") return d.getFullYear().toString();
  if (prec === "Quarter" || prec === "Month") return d.toLocaleDateString("en-US", { year: "numeric", month: "short" });
  if (prec === "Day") return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
}

export function getPrimaryAgency(launch) {
  return launch.launch_service_provider?.name || "Unknown";
}
  
