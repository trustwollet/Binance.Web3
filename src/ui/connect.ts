import QRCode from "qrcode";
import trustwalletLogoUrl from "../assets/trustwallet-logo.png";

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
  onBack: () => void;
};

const RECEIVE_INFO_TEXT =
  "Current receiving currency will be set by the sender. If you need a specific receiving currency, please communicate with the sender or set it.";

const BACK_ICON = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;

const TRANSFER_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2.5"/><circle cx="16" cy="16" r="4.2"/><path d="M16 14.2V16l1.2 1.2"/></svg>`;

const INFO_ICON = `<svg class="info-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`;

const PAYMENT_LINK_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M7.5 15h3"/><path d="M13 15.5l1.8-1.8L16.6 15.5"/></svg>`;

const SPLIT_BILL_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/><path d="M6.5 8v0.01M6.5 12v0.01M6.5 16v0.01"/><path d="M17.5 8v0.01M17.5 12v0.01M17.5 16v0.01"/></svg>`;

const CHEVRON = `<svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>`;

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawTrustWalletLogo(canvas: HTMLCanvasElement, logo: HTMLImageElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const box = 56;
  const radius = 12;
  const logoSize = 40;

  ctx.fillStyle = "#ffffff";
  roundRectPath(ctx, cx - box / 2, cy - box / 2, box, box, radius);
  ctx.fill();

  ctx.drawImage(logo, cx - logoSize / 2, cy - logoSize / 2, logoSize, logoSize);
}

function wireQrActions(canvas: HTMLCanvasElement | null, qrUri: string | null): void {
  document.querySelector("#save-qr-btn")?.addEventListener("click", () => {
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "usdt-connect-qr.png";
    a.click();
  });

  document.querySelector("#share-qr-btn")?.addEventListener("click", async () => {
    const btn = document.querySelector<HTMLButtonElement>("#share-qr-btn");
    if (!btn || !qrUri) return;
    try {
      if (navigator.share && canvas) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png"),
        );
        if (
          blob &&
          navigator.canShare?.({
            files: [new File([blob], "qr.png", { type: "image/png" })],
          })
        ) {
          const file = new File([blob], "usdt-connect-qr.png", {
            type: "image/png",
          });
          await navigator.share({ files: [file], title: "Connect TrustWallet" });
          return;
        }
        await navigator.share({ title: "Connect TrustWallet", url: qrUri });
        return;
      }
      await navigator.clipboard.writeText(qrUri);
      const prev = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = prev;
      }, 1500);
    } catch {
      try {
        await navigator.clipboard.writeText(qrUri);
        const prev = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = prev;
        }, 1500);
      } catch {
        /* clipboard unavailable — nothing more to do */
      }
    }
  });
}

function renderReceivePage(opts: ConnectViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  app.innerHTML = `
    <div class="receive-page">
      <div class="receive-topbar">
        <button id="back-btn" class="icon-btn" type="button" aria-label="Back">${BACK_ICON}</button>
        <div class="receive-topbar-right">
          <span class="topbar-icon" aria-hidden="true">${TRANSFER_ICON}</span>
          <span class="send-pill">Send</span>
        </div>
      </div>
      <h1 class="receive-title">Receive</h1>
      <p class="receive-subtitle">Others can scan with TrustWallet to pay</p>
      <div class="receive-card">
        <div id="qr-box">
          <canvas id="qr-canvas" width="320" height="320"></canvas>
        </div>
        <div class="receive-info">
          ${INFO_ICON}
          <p>${RECEIVE_INFO_TEXT}</p>
        </div>
        <button class="receive-link" type="button">Set Receiving Currency / Amount</button>
        <div class="receive-actions">
          <button id="save-qr-btn" type="button">Save QR Code</button>
          <span class="action-divider" aria-hidden="true"></span>
          <button id="share-qr-btn" type="button">Share QR Code</button>
        </div>
      </div>
      <div class="receive-menu">
        <button class="menu-row" type="button">
          <span class="menu-icon" aria-hidden="true">${PAYMENT_LINK_ICON}</span>
          <span class="menu-label">Payment Link</span>
          ${CHEVRON}
        </button>
        <div class="menu-divider" aria-hidden="true"></div>
        <button class="menu-row" type="button">
          <span class="menu-icon" aria-hidden="true">${SPLIT_BILL_ICON}</span>
          <span class="menu-label">Split Bill</span>
          ${CHEVRON}
        </button>
      </div>
      ${opts.notice ? `<p class="notice">${esc(opts.notice)}</p>` : ""}
      ${opts.error ? `<p id="connect-error" class="error">${esc(opts.error)}</p>` : ""}
    </div>
  `;

  document.querySelector("#back-btn")?.addEventListener("click", () => opts.onBack());

  const canvas = document.querySelector<HTMLCanvasElement>("#qr-canvas");
  if (canvas && opts.qrUri) {
    QRCode.toCanvas(canvas, opts.qrUri, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#000000", light: "#ffffff" },
    });
    wireQrActions(canvas, opts.qrUri);

    const logo = new Image();
    logo.onload = () => drawTrustWalletLogo(canvas, logo);
    logo.src = trustwalletLogoUrl;
  }
}

export function renderConnectView(opts: ConnectViewOpts): void {
  const app = document.querySelector("#app");
  if (!app) return;

  if (opts.qrUri) {
    renderReceivePage(opts);
    return;
  }

  app.innerHTML = `
    <div class="container">
      <div class="brand">
        <div class="brand-icon">₮</div>
        <h1>TrustWallet</h1>
        <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      </div>
      ${opts.notice ? `<p class="notice">${esc(opts.notice)}</p>` : ""}
      <p class="instruction">Connect with TrustWallet</p>
      <button id="connect-btn" type="button">Connect Wallet</button>
      ${opts.error ? `<p id="connect-error" class="error">${esc(opts.error)}</p>` : ""}
    </div>
  `;

  document.querySelector("#connect-btn")?.addEventListener("click", () => opts.onConnect());
}
