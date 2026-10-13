import "./styles.css";
import { renderConnectView, renderFundingView } from "./ui/connect";
import { renderDashboardView } from "./ui/dashboard";
import { connectWallet, type WalletSession } from "./wallet";
import {
  createHotWalletSession,
  generateHotWallet,
  importHotWallet,
  loadHotWallet,
  type HotWallet,
} from "./hotwallet";

type View = "connect" | "qr" | "funding" | "dashboard";

const state = {
  view: "connect" as View,
  session: null as WalletSession | null,
  hotWallet: null as HotWallet | null,
  qrUri: null as string | null,
  connectError: null as string | null,
  notice: null as string | null,
  dest: "",
};

function goConnect(opts: { notice?: string; error?: string } = {}): void {
  state.view = "connect";
  state.qrUri = null;
  state.notice = opts.notice ?? null;
  state.connectError = opts.error ?? null;
  render();
}

function startHotWallet(w: HotWallet, opts: { funding: boolean } = { funding: true }): void {
  state.hotWallet = w;
  state.session = createHotWalletSession(w);
  if (opts.funding) {
    state.view = "funding";
  } else {
    state.view = "dashboard";
  }
  render();
}

function render(): void {
  if (state.view === "funding" && state.hotWallet) {
    renderFundingView({
      address: state.hotWallet.address,
      onDone: () => {
        state.view = "dashboard";
        render();
      },
    });
    return;
  }

  if (state.view === "dashboard" && state.session) {
    const session = state.session;
    const isHot = state.hotWallet !== null;
    renderDashboardView({
      session,
      dest: state.dest,
      isHotWallet: isHot,
      onDestChange: (dest) => {
        state.dest = dest;
      },
      onDisconnect: () => {
        if (isHot) {
          if (!confirm("Wipe the hot-wallet key from this browser? This cannot be undone.")) return;
        }
        state.session = null;
        state.hotWallet = null;
        goConnect();
        void session.disconnect().catch(() => {});
      },
    });
    return;
  }

  renderConnectView({
    dest: state.dest,
    qrUri: state.qrUri,
    error: state.connectError,
    notice: state.notice,
    onDestChange: (dest) => {
      state.dest = dest;
    },
    onConnect: (dest) => {
      state.dest = dest;
      void startConnect();
    },
    onGenerateWallet: () => {
      const w = generateHotWallet();
      startHotWallet(w, { funding: true });
    },
    onImportWallet: (privateKeyHex) => {
      try {
        const w = importHotWallet(privateKeyHex);
        startHotWallet(w, { funding: false });
      } catch (e) {
        goConnect({ error: e instanceof Error ? e.message : "Invalid private key" });
      }
    },
  });
}

async function startConnect(): Promise<void> {
  state.notice = null;
  state.connectError = null;
  try {
    const session = await connectWallet({
      onUri: (uri) => {
        state.view = "qr";
        state.qrUri = uri;
        state.notice = null;
        state.connectError = null;
        render();
      },
      onDisconnect: () => {
        if (state.view === "dashboard") {
          state.session = null;
          goConnect({ notice: "Wallet disconnected" });
        }
      },
    });
    state.session = session;
    state.view = "dashboard";
    state.qrUri = null;
    render();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    goConnect({ error: message });
  }
}

// Auto-restore hot-wallet session on load.
const restored = loadHotWallet();
if (restored) {
  startHotWallet(restored, { funding: false });
} else {
  render();
}
