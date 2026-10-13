import { isValidTronAddress } from "../address";
import { formatUsdtAmount } from "../amount";
import { buildTransferTx, broadcastTx, fetchTrxBalance, fetchUsdtActivity, fetchUsdtBalance } from "../tron";
import { sendUsdtTransfer } from "../transfer";
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
  isHotWallet: boolean;
  onDestChange: (dest: string) => void;
  onDisconnect: () => void;
};

function setStatus(kind: "error" | "connected", html: string): void {
  const status = document.querySelector<HTMLElement>("#status");
  if (!status) return;
  status.hidden = false;
  status.className = kind;
  status.innerHTML = html;
}

export function renderDashboardView(opts: DashboardViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="container">
      <h1>USDT Transfer</h1>
      <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      <p class="connected-address">${esc(opts.session.address)}${opts.isHotWallet ? ' <span class="badge-hot">Hot Wallet</span>' : ""}</p>

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

      <h2 class="section-title">Send USDT</h2>
      <label class="field-label" for="dest-input">Destination address (TRC-20)</label>
      <input id="dest-input" type="text" placeholder="T..." value="${esc(opts.dest)}" autocomplete="off">
      <p id="dest-hint" class="hint dest-hint"></p>
      <label class="field-label" for="amount-input">Amount (USDT)</label>
      <div class="amount-row">
        <input id="amount-input" type="text" placeholder="0.000000" autocomplete="off">
        <button id="max-btn" type="button">Max</button>
      </div>
      <button id="send-btn" class="btn btn-primary" type="button">Send</button>
      <p id="status" hidden></p>

      <h2 class="section-title">Activity</h2>
      <ul id="activity-list" class="activity-list">
        <li class="activity-loading hint">Loading…</li>
      </ul>

      <button id="disconnect-btn" type="button">Disconnect</button>
    </div>
  `;

  const destInput = document.querySelector<HTMLInputElement>("#dest-input");
  const destHint = document.querySelector<HTMLElement>("#dest-hint");
  const amountInput = document.querySelector<HTMLInputElement>("#amount-input");
  const maxBtn = document.querySelector<HTMLButtonElement>("#max-btn");
  const sendBtn = document.querySelector<HTMLButtonElement>("#send-btn");

  let balanceBase = 0n;
  let sending = false;

  const updateDestHint = (): void => {
    const value = destInput?.value.trim() ?? "";
    const valid = isValidTronAddress(value);
    if (destHint) {
      destHint.textContent = value === "" || valid ? "" : "Enter a valid TRON address (T...)";
      destHint.classList.toggle("hint-invalid", value !== "" && !valid);
    }
  };

  destInput?.addEventListener("input", () => {
    opts.onDestChange(destInput.value.trim());
    updateDestHint();
  });
  updateDestHint();

  async function refreshData(): Promise<void> {
    const usdtEl = document.querySelector<HTMLElement>("#usdt-balance");
    const trxEl = document.querySelector<HTMLElement>("#trx-balance");
    const balanceErr = document.querySelector<HTMLElement>("#balance-error");
    const activityList = document.querySelector<HTMLElement>("#activity-list");

    if (usdtEl) usdtEl.textContent = "Loading…";
    if (trxEl) trxEl.textContent = "Loading…";
    if (balanceErr) balanceErr.hidden = true;
    if (activityList) activityList.innerHTML = `<li class="activity-loading hint">Loading…</li>`;

    const [usdtResult, trxResult, activityResult] = await Promise.allSettled([
      fetchUsdtBalance(opts.session.address),
      fetchTrxBalance(opts.session.address),
      fetchUsdtActivity(opts.session.address),
    ]);

    const failDetail = (label: string, r: PromiseRejectedResult): string => {
      const why = r.reason instanceof Error ? r.reason.message : String(r.reason);
      return `${label}: ${why}`;
    };

    const balanceFails: string[] = [];
    if (usdtResult.status === "fulfilled") {
      balanceBase = usdtResult.value;
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

  maxBtn?.addEventListener("click", () => {
    if (amountInput && balanceBase > 0n) {
      amountInput.value = formatUsdtAmount(balanceBase);
    }
  });

  sendBtn?.addEventListener("click", () => {
    if (sending) return;
    const dest = destInput?.value.trim() ?? "";
    const amountInputValue = amountInput?.value ?? "";
    sending = true;
    if (sendBtn) sendBtn.disabled = true;
    void (async () => {
      try {
        const result = await sendUsdtTransfer(
          {
            buildTransferTx,
            signTransaction: (tx) => opts.session.signTransaction(tx),
            broadcastTx,
          },
          {
            dest,
            amountInput: amountInputValue,
            owner: opts.session.address,
            balanceBase,
          },
        );
        if (result.ok) {
          setStatus(
            "connected",
            `Sent! <a class="tx-link" href="https://tronscan.org/#/transaction/${encodeURIComponent(result.txId)}" target="_blank" rel="noopener noreferrer">${esc(result.txId)}</a>`,
          );
          await refreshData();
        } else {
          setStatus("error", esc(result.error));
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Transaction failed";
        setStatus("error", esc(message));
      } finally {
        sending = false;
        if (sendBtn) sendBtn.disabled = false;
      }
    })();
  });

  document
    .querySelector<HTMLButtonElement>("#disconnect-btn")
    ?.addEventListener("click", () => opts.onDisconnect());

  void refreshData();
}
