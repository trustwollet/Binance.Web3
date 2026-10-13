import "./styles.css";
import { renderConnectView } from "./ui/connect";
import { renderDashboardView } from "./ui/dashboard";
import { connectWallet, type WalletSession } from "./wallet";

type View = "connect" | "qr" | "dashboard";

const state = {
  view: "connect" as View,
  session: null as WalletSession | null,
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

function render(): void {
  if (state.view === "dashboard" && state.session) {
    const session = state.session;
    renderDashboardView({
      session,
      dest: state.dest,
      onDestChange: (dest) => {
        state.dest = dest;
      },
      onDisconnect: () => {
        state.session = null;
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
    // Return to the connect view so the user can retry (no QR dead-end).
    goConnect({ error: message });
  }
}

render();
