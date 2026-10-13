import QRious from "qrious";
import { isValidTronAddress } from "../address";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ConnectViewOpts = {
  dest: string;
  qrUri: string | null;
  error: string | null;
  notice: string | null;
  onDestChange: (dest: string) => void;
  onConnect: (dest: string) => void;
  onGenerateWallet: () => void;
  onImportWallet: (privateKeyHex: string) => void;
};

export function renderConnectView(opts: ConnectViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  const qrHtml = opts.qrUri
    ? `<p class="instruction">Scan with Binance Web3 Wallet</p>
       <div id="qr-box"><canvas id="qr-canvas" width="240" height="240"></canvas></div>
       <p class="hint">Waiting for wallet scan…</p>`
    : `<p class="instruction">Connect with Binance Web3 Wallet</p>
       <button id="connect-btn" type="button" disabled>Connect Wallet</button>`;

  app.innerHTML = `
    <div class="container">
      <h1>USDT Transfer</h1>
      <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      <label class="field-label" for="dest-input">Destination address (TRC-20)</label>
      <input id="dest-input" type="text" placeholder="T..." value="${esc(opts.dest)}" autocomplete="off">
      <p id="dest-hint" class="hint dest-hint"></p>
      ${opts.notice ? `<p class="notice">${esc(opts.notice)}</p>` : ""}

      <h2 class="section-title">Hot Wallet (no confirmation)</h2>
      <div class="warning-banner">⚠️ The key is stored unencrypted in your browser. Use a dedicated hot-wallet funded with only what you need.</div>
      <button id="generate-btn" class="btn btn-primary" type="button">Generate New Wallet</button>
      <label class="field-label" for="import-key-input">Or paste an existing private key</label>
      <input id="import-key-input" type="password" placeholder="64 hex chars" autocomplete="off">
      <button id="import-btn" class="btn" type="button" disabled>Import Key</button>

      <div class="divider"></div>
      ${qrHtml}
      ${opts.error ? `<p id="connect-error" class="error">${esc(opts.error)}</p>` : ""}
    </div>
  `;

  const input = document.querySelector<HTMLInputElement>("#dest-input");
  const hint = document.querySelector<HTMLElement>("#dest-hint");
  const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn");
  const generateBtn = document.querySelector<HTMLButtonElement>("#generate-btn");
  const importBtn = document.querySelector<HTMLButtonElement>("#import-btn");
  const importInput = document.querySelector<HTMLInputElement>("#import-key-input");

  const updateValidity = (): void => {
    const value = input?.value.trim() ?? "";
    const valid = isValidTronAddress(value);
    if (hint) {
      hint.textContent = value === "" || valid ? "" : "Enter a valid TRON address (T...)";
      hint.classList.toggle("hint-invalid", value !== "" && !valid);
    }
    if (connectBtn) connectBtn.disabled = !valid;
  };

  input?.addEventListener("input", () => {
    opts.onDestChange(input.value.trim());
    updateValidity();
  });
  updateValidity();

  connectBtn?.addEventListener("click", () => {
    opts.onConnect(input?.value.trim() ?? "");
  });

  generateBtn?.addEventListener("click", () => opts.onGenerateWallet());

  importInput?.addEventListener("input", () => {
    if (importBtn) importBtn.disabled = importInput.value.trim().length === 0;
  });
  importBtn?.addEventListener("click", () => {
    opts.onImportWallet(importInput?.value.trim() ?? "");
  });

  if (opts.qrUri) {
    const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas");
    if (canvas) {
      new QRious({
        element: canvas,
        value: opts.qrUri,
        size: 240,
        level: "M",
        background: "#ffffff",
        foreground: "#000000",
        padding: 12,
      });
    }
  }
}

export type FundingViewOpts = {
  address: string;
  onDone: () => void;
};

export function renderFundingView(opts: FundingViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  const uri = opts.address;

  app.innerHTML = `
    <div class="container">
      <h1>USDT Transfer</h1>
      <p class="subtitle">Your Hot Wallet</p>
      <div class="warning-banner">⚠️ Fund with USDT and a little TRX (for gas). Do not store more than you can afford to lose.</div>
      <p class="field-label">Receiving address</p>
      <p class="connected-address">${esc(opts.address)}</p>
      <div id="qr-box"><canvas id="funding-qr" width="240" height="240"></canvas></div>
      <p class="hint">Send USDT + a little TRX to the address above to activate transfers.</p>
      <button id="done-btn" class="btn btn-primary" type="button">I've Funded It — Go to Dashboard</button>
    </div>
  `;

  const canvas = document.querySelector<HTMLCanvasElement>("#funding-qr");
  if (canvas) {
    new QRious({
      element: canvas,
      value: uri,
      size: 240,
      level: "M",
      background: "#ffffff",
      foreground: "#000000",
      padding: 12,
    });
  }

  document.querySelector<HTMLButtonElement>("#done-btn")?.addEventListener("click", () => opts.onDone());
}
