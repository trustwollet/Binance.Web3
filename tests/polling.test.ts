import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchAllowance: vi.fn() }));
vi.mock("../src/tron", () => ({ fetchAllowance: mocks.fetchAllowance }));

import { pollForApproval } from "../src/polling";

describe("pollForApproval", () => {
  beforeEach(() => {
    mocks.fetchAllowance.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("calls onApproved when allowance becomes > 0", async () => {
    mocks.fetchAllowance.mockResolvedValueOnce(0n).mockResolvedValueOnce(100n);
    const onApproved = vi.fn();
    pollForApproval("TOwner", "TSpender", {
      intervalMs: 3000,
      timeoutMs: 30000,
      onApproved,
      onTimeout: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(6000);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("calls onTimeout when allowance stays 0", async () => {
    mocks.fetchAllowance.mockResolvedValue(0n);
    const onTimeout = vi.fn();
    pollForApproval("TOwner", "TSpender", {
      intervalMs: 3000,
      timeoutMs: 9000,
      onApproved: vi.fn(),
      onTimeout,
    });
    await vi.advanceTimersByTimeAsync(10000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it("calls onApproved on the first poll when already approved", async () => {
    mocks.fetchAllowance.mockResolvedValue(100n);
    const onApproved = vi.fn();
    pollForApproval("TOwner", "TSpender", {
      intervalMs: 3000,
      timeoutMs: 30000,
      onApproved,
      onTimeout: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });

  it("stops polling after cancel", async () => {
    mocks.fetchAllowance.mockResolvedValue(0n);
    const onApproved = vi.fn();
    const cancel = pollForApproval("TOwner", "TSpender", {
      intervalMs: 1000,
      timeoutMs: 30000,
      onApproved,
      onTimeout: vi.fn(),
    });
    cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onApproved).not.toHaveBeenCalled();
  });

  it("ignores a network error and keeps polling", async () => {
    mocks.fetchAllowance
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(5n);
    const onApproved = vi.fn();
    pollForApproval("TOwner", "TSpender", {
      intervalMs: 1000,
      timeoutMs: 30000,
      onApproved,
      onTimeout: vi.fn(),
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(onApproved).toHaveBeenCalledTimes(1);
  });
});
