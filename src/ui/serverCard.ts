import { fetchAdminStatus, postAdminControl, type AdminStatus } from "../backend";

export const POLL_MS = 12000;

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSun(sun: number): string {
  return `${(sun / 1e6).toFixed(2)} TRX`;
}

function formatRaw6(raw: string): string {
  const padded = raw.padStart(7, "0");
  const whole = padded.slice(0, -6);
  const frac = padded.slice(-6).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
}

let timer: ReturnType<typeof setInterval> | null = null;
let unlocked = false;
let collapsed = false;
let lastStatus: AdminStatus | null = null;
let inFlight = false;
let currentFetch: typeof fetch = fetch;

function controlsHtml(): string {
  if (!unlocked) {
    return `
      <button id="unlock-controls-btn" type="button" class="server-btn">Unlock controls</button>`;
  }
  const paused = lastStatus?.paused ?? false;
  const rateLimitOn = lastStatus?.rateLimitOn ?? false;
  return `
    <div class="admin-controls">
      <button id="admin-pause-btn" type="button" class="server-btn">${paused ? "Resume transfers" : "Pause transfers"}</button>
      <button id="admin-ratelimit-btn" type="button" class="server-btn">${rateLimitOn ? "Disable rate limit" : "Enable rate limit"}</button>
      <button id="admin-clearlog-btn" type="button" class="server-btn">Clear log</button>
    </div>`;
}

function walletHtml(): string {
  if (!lastStatus) return `<p class="server-row hint">Checking backend…</p>`;
  const w = lastStatus.wallet;
  if (!w) return "";
  if ("error" in w) {
    return `<p class="server-row server-error">Wallet: ${esc(w.error)}</p>`;
  }
  const trxWarn = w.lowTrx ? " warn" : "";
  const feeKnown = w.feeEstimateSun !== null;
  const feeText = w.feeEstimateSun !== null ? formatSun(w.feeEstimateSun) : "unavailable";
  const requiredSun = Math.max(w.minSun, w.feeEstimateSun ?? 0);
  const shortfall = w.belowEstimate || w.lowTrx;

  let banner: string;
  if (shortfall) {
    banner = `<div class="server-banner warn">
        <p>Send at least ${esc(formatSun(requiredSun))} TRX to ${esc(w.address)} to cover network fees, then retry.</p>
      </div>`;
  } else if (!feeKnown) {
    banner = `<div class="server-banner neutral">
        <p>Fee estimate unavailable — backend will re-check before transfer.</p>
      </div>`;
  } else {
    banner = `<div class="server-banner ok">
        <p>Meets minimum requirement — estimated fee is an approximation, not a guarantee.</p>
      </div>`;
  }

  return `
    <div class="server-row"><span>Hot wallet</span><span class="server-wallet-addr">${esc(w.address)}<button id="copy-hot-wallet-btn" type="button" class="server-copy-btn" title="Copy hot wallet address">Copy</button></span></div>
    <div class="server-row"><span>TRX</span><span class="server-trx${trxWarn}">${esc(formatSun(w.trxSun))}${w.lowTrx ? " (low)" : ""}</span></div>
    <div class="server-row"><span>Minimum required</span><span>${esc(formatSun(w.minSun))}</span></div>
    <div class="server-row"><span>Est. fee</span><span>${esc(feeText)}</span></div>
    <div class="server-row"><span>USDT</span><span>${esc(formatRaw6(w.usdtRaw))}</span></div>
    ${banner}`;
}

function logHtml(): string {
  const log = lastStatus?.log ?? [];
  const entries = log.slice(-5).reverse();
  if (entries.length === 0) {
    return `<p class="server-row hint">No server log entries</p>`;
  }
  return `
    <div class="server-log">
      ${entries
        .map(
          (e) => `
        <div class="server-log-entry">
          <span class="server-log-result">${esc(e.result)}</span>
          <span class="server-log-detail">${esc(e.owner || "-")} ${esc(e.detail)}</span>
        </div>`,
        )
        .join("")}
    </div>
    <p class="server-row hint">Showing ${entries.length} of ${log.length} entries</p>`;
}

function paint(): void {
  const body = document.querySelector<HTMLElement>("#server-card-body");
  if (!body) return;

  const toggle = document.querySelector<HTMLButtonElement>("#server-card-toggle");
  if (toggle) {
    toggle.textContent = collapsed ? "Show" : "Hide";
    toggle.setAttribute("aria-expanded", String(!collapsed));
  }
  body.hidden = collapsed;
  if (collapsed) return;

  if (!lastStatus) {
    body.innerHTML = `<p class="server-row hint">Checking backend…</p>`;
    return;
  }

  body.innerHTML = `
    <div class="server-row"><span>Backend</span><span class="server-ok">Reachable</span></div>
    <div class="server-row"><span>Network</span><span>${esc(lastStatus.network)}</span></div>
    <div class="server-row"><span>Transfers</span><span>${lastStatus.paused ? "Paused" : "Running"}</span></div>
    <div class="server-row"><span>Rate limit</span><span>${lastStatus.rateLimitOn ? "On" : "Off"}</span></div>
    ${walletHtml()}
    <div class="server-section-title">Recent activity</div>
    ${logHtml()}
    <div class="server-section-title">Admin</div>
    ${controlsHtml()}`;
}

async function tick(): Promise<void> {
  if (inFlight) return;
  inFlight = true;
  try {
    lastStatus = await fetchAdminStatus(currentFetch);
  } finally {
    inFlight = false;
    paint();
  }
}

export function renderServerCard(container: HTMLElement): void {
  container.innerHTML = `
    <div class="server-card-header">
      <h2 class="section-title">Server</h2>
      <button id="server-card-toggle" type="button" class="server-toggle" aria-expanded="${!collapsed}">${collapsed ? "Show" : "Hide"}</button>
    </div>
    <div id="server-card-body" class="server-card-body" ${collapsed ? "hidden" : ""}>
      <p class="server-row hint">Checking backend…</p>
    </div>`;

  container.querySelector("#server-card-toggle")?.addEventListener("click", () => {
    collapsed = !collapsed;
    paint();
  });

  container.addEventListener("click", (ev) => {
    const target = ev.target as HTMLElement;
    const id = target.id;
    if (id === "copy-hot-wallet-btn") {
      const w = lastStatus?.wallet;
      if (w && !("error" in w)) {
        void navigator.clipboard?.writeText(w.address);
      }
      return;
    }
    if (id === "unlock-controls-btn") {
      if (window.confirm("Unlock admin controls for this session?")) {
        unlocked = true;
        paint();
      }
      return;
    }
    if (id === "admin-pause-btn") {
      const next = !(lastStatus?.paused ?? false);
      void postAdminControl("/api/admin/pause", { paused: next }, currentFetch).then((ok) => {
        if (!ok) alert("Failed to update pause state");
        void tick();
      });
      return;
    }
    if (id === "admin-ratelimit-btn") {
      const next = !(lastStatus?.rateLimitOn ?? true);
      void postAdminControl("/api/admin/ratelimit", { enabled: next }, currentFetch).then((ok) => {
        if (!ok) alert("Failed to update rate limit state");
        void tick();
      });
      return;
    }
    if (id === "admin-clearlog-btn") {
      if (!window.confirm("Clear all log entries?")) return;
      void postAdminControl("/api/admin/clear-log", {}, currentFetch).then((ok) => {
        if (!ok) alert("Failed to clear log");
        void tick();
      });
    }
  });

  paint();
}

export function startServerCard(fetchImpl: typeof fetch = fetch): void {
  currentFetch = fetchImpl;
  if (timer !== null) return;
  void tick();
  timer = setInterval(() => void tick(), POLL_MS);
}

export function stopServerCard(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}
