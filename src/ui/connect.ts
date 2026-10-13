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
    ? `<p class="qr-title">Connect Wallet</p>
       <p class="qr-subtitle">Scan with Binance Web3 Wallet</p>
       <div id="qr-box"><canvas id="qr-canvas" width="260" height="260"></canvas></div>
       <div class="qr-info">Open the Binance app, go to <strong>Web3</strong>, then scan this code to connect.</div>
       <div class="qr-actions">
         <button id="save-qr-btn" class="btn-gold" type="button">Save QR</button>
         <button id="share-qr-btn" class="btn-gold" type="button">Share QR</button>
       </div>
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
        size: 260,
        level: "M",
        background: "#ffffff",
        foreground: "#000000",
        padding: 14,
      });
    }

    document.querySelector("#save-qr-btn")?.addEventListener("click", () => {
      if (!canvas) return;
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "usdt-connect-qr.png";
      a.click();
    });

    document.querySelector("#share-qr-btn")?.addEventListener("click", async () => {
      const btn = document.querySelector<HTMLButtonElement>("#share-qr-btn");
      const uri = opts.qrUri;
      if (!btn || !uri) return;
      try {
        if (navigator.share && canvas) {
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, "image/png"),
          );
          if (blob && navigator.canShare?.({ files: [new File([blob], "qr.png", { type: "image/png" })] })) {
            const file = new File([blob], "usdt-connect-qr.png", { type: "image/png" });
            await navigator.share({ files: [file], title: "Connect USDT Transfer" });
            return;
          }
          await navigator.share({ title: "Connect USDT Transfer", url: uri });
          return;
        }
        await navigator.clipboard.writeText(uri);
        const prev = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = prev; }, 1500);
      } catch {
        try {
          await navigator.clipboard.writeText(uri);
          const prev = btn.textContent;
          btn.textContent = "Copied!";
          setTimeout(() => { btn.textContent = prev; }, 1500);
        } catch {
          /* clipboard unavailable — nothing more to do */
        }
      }
    });
  }
}
