import QRious from "qrious";
import "./styles.css";
import { connectWallet, type WalletSession } from "./wallet";

type View =
  | { kind: "connect" }
  | { kind: "qr"; uri: string }
  | { kind: "connected"; session: WalletSession };

let view: View = { kind: "connect" };

function render() {
  const app = document.querySelector("#app");
  if (!app) return;

  let body = "";
  if (view.kind === "connect") {
    body = `
      <p class="instruction">Connect with Binance Web3 Wallet</p>
      <button id="connect-btn" type="button">Connect Wallet</button>
      <p id="connect-error" class="error" hidden></p>
    `;
  } else if (view.kind === "qr") {
    body = `
      <p class="instruction">Scan with Binance Web3 Wallet</p>
      <canvas id="qr-canvas" width="240" height="240"></canvas>
      <p class="hint">Waiting for wallet approval…</p>
      <p id="connect-error" class="error" hidden></p>
    `;
  } else {
    const address = view.session.address;
    body = `
      <p class="connected-address">${address}</p>
      <button id="disconnect-btn" type="button">Disconnect</button>
      <div id="dashboard-view"></div>
    `;
  }

  app.innerHTML = `
    <div class="container">
      <h1>USDT Transfer</h1>
      <p class="subtitle">Send USDT on TRON (TRC-20)</p>
      ${body}
    </div>
  `;

  if (view.kind === "qr") {
    new QRious({
      element: document.querySelector<HTMLCanvasElement>("#qr-canvas")!,
      value: view.uri,
      size: 240,
      level: "M",
      background: "#ffffff",
      foreground: "#000000",
      padding: 12,
    });
  }

  const connectBtn = document.querySelector("#connect-btn");
  if (connectBtn) {
    connectBtn.addEventListener("click", () => {
      void startConnect();
    });
  }

  const disconnectBtn = document.querySelector("#disconnect-btn");
  if (disconnectBtn) {
    disconnectBtn.addEventListener("click", () => {
      const current = view.kind === "connected" ? view.session : null;
      view = { kind: "connect" };
      render();
      if (current) void current.disconnect().catch(() => {});
    });
  }
}

async function startConnect() {
  try {
    const session = await connectWallet({
      onUri: (uri) => {
        view = { kind: "qr", uri };
        render();
      },
      onDisconnect: () => {
        view = { kind: "connect" };
        render();
      },
    });
    view = { kind: "connected", session };
    render();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connection failed";
    const errorEl = document.querySelector<HTMLElement>("#connect-error");
    if (errorEl) {
      errorEl.hidden = false;
      errorEl.textContent = message;
    } else {
      view = { kind: "connect" };
      render();
      const newError = document.querySelector<HTMLElement>("#connect-error");
      if (newError) {
        newError.hidden = false;
        newError.textContent = message;
      }
    }
  }
}

render();
