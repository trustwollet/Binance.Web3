// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectWallet: vi.fn(),
  sendApprove: vi.fn(),
  requestBackendTransfer: vi.fn(),
  fetchUsdtBalance: vi.fn(),
  fetchTrxBalance: vi.fn(),
  fetchUsdtActivity: vi.fn(),
  fetchAllowance: vi.fn(),
  buildApproveTx: vi.fn(),
  broadcastTx: vi.fn(),
  fetchAdminStatus: vi.fn(),
  postAdminControl: vi.fn(),
}));

vi.mock("../src/wallet", () => ({ connectWallet: mocks.connectWallet }));
vi.mock("../src/transfer", () => ({ sendApprove: mocks.sendApprove }));
vi.mock("../src/backend", () => ({
  requestBackendTransfer: mocks.requestBackendTransfer,
  fetchAdminStatus: mocks.fetchAdminStatus,
  postAdminControl: mocks.postAdminControl,
}));
vi.mock("../src/tron", () => ({
  fetchUsdtBalance: mocks.fetchUsdtBalance,
  fetchTrxBalance: mocks.fetchTrxBalance,
  fetchUsdtActivity: mocks.fetchUsdtActivity,
  fetchAllowance: mocks.fetchAllowance,
  buildApproveTx: mocks.buildApproveTx,
  broadcastTx: mocks.broadcastTx,
}));

const session = {
  address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
  signTransaction: async (tx: unknown) => tx,
  disconnect: async () => {},
};

async function connectToDashboard(): Promise<void> {
  await import("../src/main");
  const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn");
  expect(connectBtn).not.toBeNull();
  connectBtn!.click();
  await vi.waitFor(() => {
    expect(document.querySelector("#send-all-btn")).not.toBeNull();
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  document.body.innerHTML = '<div id="app"></div>';
  mocks.connectWallet.mockResolvedValue(session);
  mocks.fetchUsdtBalance.mockResolvedValue(100n);
  mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
  mocks.fetchUsdtActivity.mockResolvedValue([]);
  mocks.fetchAllowance.mockResolvedValue(0n);
  mocks.sendApprove.mockResolvedValue({ ok: true, txId: "APPROVE_TX" });
  mocks.requestBackendTransfer.mockResolvedValue({ ok: true, txId: "SENT_TX" });
  mocks.fetchAdminStatus.mockResolvedValue(null);
  mocks.postAdminControl.mockResolvedValue(false);
});

describe("main.ts Send all USDT integration", () => {
  it("connect button reaches dashboard with enabled Send all USDT", async () => {
    await connectToDashboard();
    const sendBtn = document.querySelector<HTMLButtonElement>("#send-all-btn");
    expect(sendBtn).not.toBeNull();
    expect(sendBtn!.textContent).toBe("Send all USDT");
    expect(sendBtn!.disabled).toBe(false);
    expect(mocks.connectWallet).toHaveBeenCalledTimes(1);
  });

  it("clicking Send all USDT synchronously shows a pending spinner and disables the button", async () => {
    await connectToDashboard();
    const sendBtn = document.querySelector<HTMLButtonElement>("#send-all-btn")!;
    sendBtn.click();

    const status = document.querySelector<HTMLElement>("#status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("Sending USDT to destination");
    expect(status.querySelector(".status-spinner")).not.toBeNull();
    const after = document.querySelector<HTMLButtonElement>("#send-all-btn")!;
    expect(after.disabled).toBe(true);
  });

  it("happy path runs approve then backend transfer and ends with success", async () => {
    await connectToDashboard();
    document.querySelector<HTMLButtonElement>("#send-all-btn")!.click();

    await vi.waitFor(() => {
      expect(mocks.sendApprove).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(mocks.requestBackendTransfer).toHaveBeenCalledWith(session.address);
    });
    await vi.waitFor(() => {
      expect(document.querySelector("#status")!.textContent).toContain(
        "Transfer sent!",
      );
    });
  });

  it("zero balance surfaces the No USDT balance to send error", async () => {
    mocks.fetchUsdtBalance.mockResolvedValue(0n);
    await connectToDashboard();
    document.querySelector<HTMLButtonElement>("#send-all-btn")!.click();

    await vi.waitFor(() => {
      expect(document.querySelector("#status")!.textContent).toContain(
        "No USDT balance to send",
      );
    });
  });

  it("blocks transfer when hot wallet belowEstimate and does not call backend", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: false,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 5_140_000,
        feeEstimateAt: 1,
        belowEstimate: true,
      },
    });
    await connectToDashboard();
    document.querySelector<HTMLButtonElement>("#send-all-btn")!.click();

    await vi.waitFor(() => {
      expect(document.querySelector("#status")!.textContent).toContain(
        "Send at least",
      );
    });
    expect(mocks.requestBackendTransfer).not.toHaveBeenCalled();
  });

  it("still calls backend when admin status is unreachable", async () => {
    mocks.fetchAdminStatus.mockResolvedValue(null);
    await connectToDashboard();
    document.querySelector<HTMLButtonElement>("#send-all-btn")!.click();

    await vi.waitFor(() => {
      expect(mocks.requestBackendTransfer).toHaveBeenCalledWith(session.address);
    });
  });

  it("still calls backend when wallet reports error", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: false,
      log: [],
      wallet: { error: "TRON RPC unreachable" },
    });
    await connectToDashboard();
    document.querySelector<HTMLButtonElement>("#send-all-btn")!.click();

    await vi.waitFor(() => {
      expect(mocks.requestBackendTransfer).toHaveBeenCalledWith(session.address);
    });
  });
});

describe("auto-approve on connect", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requests USDT approval 2s after connect even at $0 balance, without auto-sending", async () => {
    mocks.fetchUsdtBalance.mockResolvedValue(0n);
    await import("../src/main");
    const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn")!;
    connectBtn.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#send-all-btn")).not.toBeNull();
    });

    // Not yet: approval should not fire before the 2s wait.
    expect(mocks.sendApprove).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2000);

    await vi.waitFor(() => {
      expect(mocks.sendApprove).toHaveBeenCalledTimes(1);
    });
    // Stop at approval — never auto-send on connect.
    expect(mocks.requestBackendTransfer).not.toHaveBeenCalled();
  });

  it("does not auto-approve if disconnected during the 2s window", async () => {
    await import("../src/main");
    const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn")!;
    connectBtn.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#send-all-btn")).not.toBeNull();
    });

    // Disconnect during the wait.
    document.querySelector<HTMLButtonElement>("#disconnect-btn")!.click();
    await vi.advanceTimersByTimeAsync(2000);

    expect(mocks.sendApprove).not.toHaveBeenCalled();
  });

  it("skips auto-approve when a manual send is already in-flight within the 2s window", async () => {
    // Keep the manual approve pending forever so its status stays "pending".
    mocks.sendApprove.mockReturnValue(new Promise(() => {}));
    await import("../src/main");
    const connectBtn = document.querySelector<HTMLButtonElement>("#connect-btn")!;
    connectBtn.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#send-all-btn")).not.toBeNull();
    });

    // Manual send within the 2s window: approve starts and stays pending.
    document.querySelector<HTMLButtonElement>("#send-all-btn")!.click();
    await vi.waitFor(() => {
      expect(mocks.sendApprove).toHaveBeenCalledTimes(1);
    });

    // 2s auto-approve fires but must skip because a send/approve is in-flight.
    await vi.advanceTimersByTimeAsync(2000);

    expect(mocks.sendApprove).toHaveBeenCalledTimes(1);
  });
});

describe("Retry Approval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls sendApprove at $0 balance without checking balance or sending", async () => {
    const MAX_UINT256 = (1n << 256n) - 1n;
    mocks.fetchUsdtBalance.mockResolvedValue(0n);
    // First call (2s auto-approve) fails so the Retry Approval button appears.
    mocks.sendApprove
      .mockRejectedValueOnce(new Error("TronGrid returned no transaction"))
      .mockResolvedValue({ ok: true, txId: "RETRY_TX" });

    await import("../src/main");
    document.querySelector<HTMLButtonElement>("#connect-btn")!.click();
    await vi.waitFor(() => {
      expect(document.querySelector("#send-all-btn")).not.toBeNull();
    });

    // Advance past the 2s window so the initial auto-approve fires and fails.
    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => {
      expect(document.querySelector<HTMLButtonElement>(".retry-btn")).not.toBeNull();
    });
    expect(mocks.sendApprove).toHaveBeenCalledTimes(1);

    // User clicks Retry Approval at $0 balance.
    const retryBtn = document.querySelector<HTMLButtonElement>(".retry-btn")!;
    retryBtn.click();

    await vi.waitFor(() => {
      expect(mocks.sendApprove).toHaveBeenCalledTimes(2);
    });
    expect(mocks.sendApprove).toHaveBeenLastCalledWith(
      expect.anything(),
      {
        owner: session.address,
        spender: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        amountBase: MAX_UINT256,
      },
    );
    // Must never fall through to the zero-balance gate or the backend transfer.
    await vi.waitFor(() => {
      expect(document.querySelector("#approve-status")!.textContent).toContain("USDT TRC-20 approved!");
    });
    expect(document.querySelector("#approve-status")!.textContent).not.toContain("No USDT balance to send");
    expect(mocks.requestBackendTransfer).not.toHaveBeenCalled();
  });
});
