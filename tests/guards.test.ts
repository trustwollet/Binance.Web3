import { describe, expect, it } from "vitest";
import {
  beginRetryApprove,
  beginRetryTransfer,
  canStartTransfer,
  type RetryState,
} from "../src/guards";

function retryState(): RetryState {
  return {
    transferStatus: "error",
    approveStatus: "error",
    approveError: "approve failed",
    approveTxId: "appr-tx",
    transferError: "boom",
    transferTxId: "send-tx",
  };
}

describe("canStartTransfer", () => {
  it("blocks while a transfer is pending", () => {
    expect(
      canStartTransfer({ transferStatus: "pending", approveStatus: null }),
    ).toBe(false);
  });

  it("blocks while approval is pending", () => {
    expect(
      canStartTransfer({ transferStatus: null, approveStatus: "pending" }),
    ).toBe(false);
  });

  it("allows a fresh start", () => {
    expect(
      canStartTransfer({ transferStatus: null, approveStatus: null }),
    ).toBe(true);
  });

  it("allows retry after an error", () => {
    expect(
      canStartTransfer({ transferStatus: "error", approveStatus: "error" }),
    ).toBe(true);
  });
});

describe("beginRetryTransfer", () => {
  it("marks pending synchronously, clears errors, and blocks a second click", () => {
    const state = retryState();
    expect(beginRetryTransfer(state)).toBe(true);
    expect(state.transferStatus).toBe("pending");
    expect(state.transferError).toBeNull();
    expect(state.transferTxId).toBeNull();
    expect(canStartTransfer(state)).toBe(false);
    expect(beginRetryTransfer(state)).toBe(false);
  });

  it("does not mutate state when blocked", () => {
    const state = retryState();
    state.transferStatus = "pending";
    expect(beginRetryTransfer(state)).toBe(false);
    expect(state.transferError).toBe("boom");
    expect(state.transferTxId).toBe("send-tx");
  });
});

describe("beginRetryApprove", () => {
  it("marks approve pending synchronously, clears errors, and blocks a second click", () => {
    const state = retryState();
    expect(beginRetryApprove(state)).toBe(true);
    expect(state.approveStatus).toBe("pending");
    expect(state.approveError).toBeNull();
    expect(state.approveTxId).toBeNull();
    expect(state.transferStatus).toBeNull();
    expect(state.transferError).toBeNull();
    expect(state.transferTxId).toBeNull();
    expect(canStartTransfer(state)).toBe(false);
    expect(beginRetryApprove(state)).toBe(false);
  });
});
