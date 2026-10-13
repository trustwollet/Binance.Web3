import { formatUsdtAmount } from "../amount";
import { fetchTrxBalance, fetchUsdtActivity, fetchUsdtBalance } from "../tron";
import type { WalletSession } from "../wallet";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateAddress(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-6)}`;
}

export type DashboardViewOpts = {
  session: WalletSession;
  dest: string;
  transferStatus: "pending" | "success" | "error" | null;
  transferError: string | null;
  transferTxId: string | null;
  onDisconnect: () => void;
};

export function renderDashboardView(opts: DashboardViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="container">
      <div class="brand">
        <div class="brand-icon">₮</div>
        <h1>USDT Transfer</h1>
        <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      </div>

      <div class="connected-chip">
        <span class="chip-dot"></span>
        <span class="chip-label">Connected</span>
        <span class="chip-address">${esc(truncateAddress(opts.session.address))}</span>
      </div>

      <div class="balance-cards">
        <div class="balance-card primary">
          <span class="balance-label">USDT Balance</span>
          <strong id="usdt-balance" class="balance-value">Loading…</strong>
        </div>
        <div class="balance-card">
          <span class="balance-label">TRX Balance</span>
          <strong id="trx-balance" class="balance-value">Loading…</strong>
        </div>
      </div>
      <p id="balance-error" class="error" hidden></p>

      <div class="dest-card">
        <div class="dest-card-header">
          <span class="dest-card-label">Destination</span>
          <span class="dest-card-badge">Fixed</span>
        </div>
        <div class="dest-card-address">${esc(opts.dest)}</div>
        <p class="dest-card-hint">All USDT will be sent to this address</p>
      </div>

      <div id="status" class="status-area" hidden></div>

      <div class="section-header">
        <h2 class="section-title">Activity</h2>
      </div>
      <ul id="activity-list" class="activity-list">
        <li class="activity-loading hint">Loading…</li>
      </ul>

      <button id="disconnect-btn" type="button">Disconnect</button>
    </div>
  `;

  const statusEl = document.querySelector<HTMLElement>("#status");
  if (statusEl) {
    statusEl.hidden = false;
    if (opts.transferStatus === "pending") {
      statusEl.className = "status-area status-pending";
      statusEl.innerHTML = `
        <div class="status-pill pending">
          <span class="status-spinner"></span>
          <span>Waiting for wallet approval…</span>
        </div>`;
    } else if (opts.transferStatus === "success" && opts.transferTxId) {
      statusEl.className = "status-area status-success";
      statusEl.innerHTML = `
        <div class="status-pill success">
          <span class="status-icon">✓</span>
          <span>Transfer sent!</span>
        </div>
        <a class="tx-link" href="https://tronscan.org/#/transaction/${encodeURIComponent(opts.transferTxId)}" target="_blank" rel="noopener noreferrer">View on Tronscan ↗</a>`;
    } else if (opts.transferStatus === "error" && opts.transferError) {
      statusEl.className = "status-area status-error";
      statusEl.innerHTML = `
        <div class="status-pill error">
          <span class="status-icon">✕</span>
          <span>${esc(opts.transferError)}</span>
        </div>`;
    } else {
      statusEl.hidden = true;
    }
  }

  document.querySelector<HTMLButtonElement>("#disconnect-btn")
    ?.addEventListener("click", () => opts.onDisconnect());

  void refreshBalancesAndActivity(opts.session.address);
}

async function refreshBalancesAndActivity(address: string): Promise<void> {
  const usdtEl = document.querySelector<HTMLElement>("#usdt-balance");
  const trxEl = document.querySelector<HTMLElement>("#trx-balance");
  const balanceErr = document.querySelector<HTMLElement>("#balance-error");
  const activityList = document.querySelector<HTMLElement>("#activity-list");

  if (usdtEl) usdtEl.textContent = "Loading…";
  if (trxEl) trxEl.textContent = "Loading…";
  if (balanceErr) balanceErr.hidden = true;
  if (activityList) activityList.innerHTML = `<li class="activity-loading hint">Loading…</li>`;

  const [usdtResult, trxResult, activityResult] = await Promise.allSettled([
    fetchUsdtBalance(address),
    fetchTrxBalance(address),
    fetchUsdtActivity(address),
  ]);

  const failDetail = (label: string, r: PromiseRejectedResult): string => {
    const why = r.reason instanceof Error ? r.reason.message : String(r.reason);
    return `${label}: ${why}`;
  };

  const balanceFails: string[] = [];
  if (usdtResult.status === "fulfilled") {
    if (usdtEl) usdtEl.textContent = formatUsdtAmount(usdtResult.value);
  } else {
    balanceFails.push(failDetail("USDT", usdtResult));
    if (usdtEl) usdtEl.textContent = "—";
  }
  if (trxResult.status === "fulfilled") {
    if (trxEl) trxEl.textContent = formatUsdtAmount(trxResult.value);
  } else {
    balanceFails.push(failDetail("TRX", trxResult));
    if (trxEl) trxEl.textContent = "—";
  }
  if (balanceErr) {
    balanceErr.hidden = balanceFails.length === 0;
    balanceErr.textContent = balanceFails.length
      ? `Failed to load balances — ${balanceFails.join("; ")}`
      : "";
  }

  if (activityList) {
    if (activityResult.status === "fulfilled" && activityResult.value.length > 0) {
      activityList.innerHTML = activityResult.value
        .map(
          (item) => `
            <li class="activity-item">
              <div class="activity-row">
                <span class="activity-amount">${formatUsdtAmount(item.amountBase)} USDT</span>
                <span class="activity-time">Recent</span>
              </div>
              <a class="tx-link" href="https://tronscan.org/#/transaction/${encodeURIComponent(item.txId)}" target="_blank" rel="noopener noreferrer">${esc(item.txId.slice(0, 20))}…</a>
            </li>`,
        )
        .join("");
    } else if (activityResult.status === "fulfilled") {
      activityList.innerHTML = `<li class="activity-empty hint">No recent transfers</li>`;
    } else {
      const why =
        activityResult.reason instanceof Error
          ? activityResult.reason.message
          : String(activityResult.reason);
      activityList.innerHTML = `<li class="activity-error error">Failed to load activity: ${esc(why)}</li>`;
    }
  }
}
