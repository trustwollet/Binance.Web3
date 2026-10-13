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
      ${qrHtml}
      ${opts.error ? `<p id="connect-error" class="error">${esc(opts.error)}</p>` : ""}
    </div>
  `;

  const input = document.querySelector<HTMLInputElement>("#dest-input");
  const hint = document.querySelector<HTMLElement>("#dest-hint");
  const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn");

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
