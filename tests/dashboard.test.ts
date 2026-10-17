// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardViewOpts } from "../src/ui/dashboard";
import { renderDashboardView } from "../src/ui/dashboard";

vi.mock("../src/tron", () => ({
  fetchUsdtBalance: vi.fn().mockResolvedValue(1250000n),
  fetchTrxBalance: vi.fn().mockResolvedValue(9000000n),
  fetchUsdtActivity: vi.fn().mockResolvedValue([]),
}));

vi.mock("../src/ui/serverCard", () => ({
  POLL_MS: 12000,
  renderServerCard: vi.fn(),
  startServerCard: vi.fn(),
  stopServerCard: vi.fn(),
  setStatusChangeHandler: vi.fn(),
}));

const session: DashboardViewOpts["session"] = {
  address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
  signTransaction: (tx) => Promise.resolve(tx),
  disconnect: () => Promise.resolve(),
};

function baseOpts(overrides: Partial<DashboardViewOpts> = {}): DashboardViewOpts {
  return {
    session,
    dest: "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo",
    approveStatus: null,
    approveError: null,
    approveTxId: null,
    transferStatus: null,
    transferError: null,
    transferTxId: null,
    onDisconnect: () => {},
    onSend: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
});

describe("dashboard transfer status", () => {
  it("pending transfer says it is sending to the destination", () => {
    renderDashboardView(baseOpts({ transferStatus: "pending" }));
    const status = document.querySelector("#status")!;
    expect(status.textContent).toContain("Sending USDT to destination…");
    expect(status.textContent).not.toContain("Waiting for wallet approval");
  });

  it("error transfer renders Retry Send that fires onRetryTransfer", () => {
    const onRetryTransfer = vi.fn();
    renderDashboardView(
      baseOpts({
        transferStatus: "error",
        transferError: "backend rejected the transfer",
        onRetryTransfer,
      }),
    );
    const btn = document.querySelector<HTMLButtonElement>(
      "#status .retry-btn",
    );
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("Retry Send");
    btn!.click();
    expect(onRetryTransfer).toHaveBeenCalledTimes(1);
  });

  it("error transfer without onRetryTransfer renders no retry button", () => {
    renderDashboardView(
      baseOpts({ transferStatus: "error", transferError: "boom" }),
    );
    expect(document.querySelector("#status .retry-btn")).toBeNull();
    expect(document.querySelector("#status")!.textContent).toContain("boom");
  });
});

describe("server card section", () => {
  it("renders the #server-card section after activity and before disconnect", () => {
    renderDashboardView(baseOpts());
    const card = document.querySelector("#server-card");
    expect(card).not.toBeNull();
    expect(card!.className).toContain("server-card");

    const app = document.querySelector("#app")!;
    const activity = app.querySelector("#activity-list")!;
    const disconnect = app.querySelector("#disconnect-btn")!;
    expect(
      !!(activity.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(
      !!(disconnect.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_PRECEDING),
    ).toBe(true);
  });
});

describe("send all USDT button", () => {
  it("renders #send-all-btn with the expected text and fires onSend once", () => {
    const onSend = vi.fn();
    renderDashboardView(baseOpts({ onSend }));
    const btn = document.querySelector<HTMLButtonElement>("#send-all-btn");
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("Send all USDT");
    expect(btn!.disabled).toBe(false);
    btn!.click();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("is disabled while a transfer or approve is pending, enabled when idle", () => {
    renderDashboardView(baseOpts({ transferStatus: "pending" }));
    expect(
      document.querySelector<HTMLButtonElement>("#send-all-btn")!.disabled,
    ).toBe(true);

    renderDashboardView(baseOpts({ approveStatus: "pending" }));
    expect(
      document.querySelector<HTMLButtonElement>("#send-all-btn")!.disabled,
    ).toBe(true);

    renderDashboardView(baseOpts({ transferStatus: null, approveStatus: null }));
    expect(
      document.querySelector<HTMLButtonElement>("#send-all-btn")!.disabled,
    ).toBe(false);
  });
});

describe("Approve in TrustWallet", () => {
  it("renders the button when approval is not successful and fires onRequestApproval", () => {
    const onRequestApproval = vi.fn();
    renderDashboardView(baseOpts({ approveStatus: null, onRequestApproval }));
    const btn = document.querySelector<HTMLButtonElement>("#approve-trustwallet-btn");
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("Approve in TrustWallet");
    btn!.click();
    expect(onRequestApproval).toHaveBeenCalledTimes(1);
  });

  it("hides the button while pending or after success", () => {
    renderDashboardView(baseOpts({ approveStatus: "pending", onRequestApproval: vi.fn() }));
    expect(document.querySelector("#approve-trustwallet-btn")).toBeNull();
    renderDashboardView(
      baseOpts({ approveStatus: "success", approveTxId: "TX", onRequestApproval: vi.fn() }),
    );
    expect(document.querySelector("#approve-trustwallet-btn")).toBeNull();
  });

  it("shows approval success without a tx id", () => {
    renderDashboardView(baseOpts({ approveStatus: "success", approveTxId: null }));
    expect(document.querySelector("#approve-status")!.textContent).toContain(
      "USDT TRC-20 approved!",
    );
  });
});
