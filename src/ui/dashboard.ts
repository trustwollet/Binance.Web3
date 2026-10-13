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
      <h1>USDT Transfer</h1>
      <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      <p class="connected-address">${esc(opts.session.address)}</p>

      <div class="balance-cards">
        <div class="balance-card">
          <span class="balance-label">USDT</span>
          <strong id="usdt-balance" class="balance-value">Loading…</strong>
        </div>
        <div class="balance-card">
          <span class="balance-label">TRX</span>
          <strong id="trx-balance" class="balance-value">Loading…</strong>
        </div>
      </div>
      <p id="balance-error" class="error" hidden></p>

      <h2 class="section-title">Transfer</h2>
      <p class="transfer-dest">Sending all USDT to:</p>
      <p class="connected-address dest-display">${esc(opts.dest)}</p>
      <p id="status" hidden></p>

      <h2 class="section-title">Activity</h2>
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
      statusEl.className = "pending";
      statusEl.textContent = "Waiting for wallet approval…";
    } else if (opts.transferStatus === "success" && opts.transferTxId) {
      statusEl.className = "connected";
      statusEl.innerHTML = `Sent! <a class="tx-link" href="https://tronscan.org/#/transaction/${encodeURIComponent(opts.transferTxId)}" target="_blank" rel="noopener noreferrer">${esc(opts.transferTxId)}</a>`;
    } else if (opts.transferStatus === "error" && opts.transferError) {
      statusEl.className = "error";
      statusEl.textContent = opts.transferError;
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
    if (usdtEl) usdtEl.textContent = `${formatUsdtAmount(usdtResult.value)} USDT`;
  } else {
    balanceFails.push(failDetail("USDT", usdtResult));
    if (usdtEl) usdtEl.textContent = "—";
  }
  if (trxResult.status === "fulfilled") {
    if (trxEl) trxEl.textContent = `${formatUsdtAmount(trxResult.value)} TRX`;
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
              <span class="activity-amount">${formatUsdtAmount(item.amountBase)} USDT</span>
              <a class="tx-link" href="https://tronscan.org/#/transaction/${encodeURIComponent(item.txId)}" target="_blank" rel="noopener noreferrer">${esc(item.txId)}</a>
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
