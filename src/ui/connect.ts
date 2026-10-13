import QRious from "qrious";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type ConnectViewOpts = {
  qrUri: string | null;
  error: string | null;
  notice: string | null;
  onConnect: () => void;
};

export function renderConnectView(opts: ConnectViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  const qrHtml = opts.qrUri
    ? `<p class="instruction">Scan with Binance Web3 Wallet</p>
       <div id="qr-box"><canvas id="qr-canvas" width="240" height="240"></canvas></div>
       <p class="hint">Waiting for wallet scan…</p>`
    : `<p class="instruction">Connect with Binance Web3 Wallet</p>
       <button id="connect-btn" type="button">Connect Wallet</button>`;

  app.innerHTML = `
    <div class="container">
      <div class="brand">
        <div class="brand-icon">₮</div>
        <h1>USDT Transfer</h1>
        <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      </div>
      ${opts.notice ? `<p class="notice">${esc(opts.notice)}</p>` : ""}
      ${qrHtml}
      ${opts.error ? `<p id="connect-error" class="error">${esc(opts.error)}</p>` : ""}
    </div>
  `;

  const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn");
  connectBtn?.addEventListener("click", () => opts.onConnect());

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
