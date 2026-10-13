import { describe, expect, it, vi } from "vitest";
import { sendUsdtTransfer, type TransferDeps } from "../src/transfer";

const VALID_DEST = "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo";
const OWNER = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function makeDeps(overrides: Partial<TransferDeps> = {}): TransferDeps {
  return {
    buildTransferTx: vi.fn().mockResolvedValue({ raw_data: {} }),
    signTransaction: vi.fn().mockImplementation(async (tx) => tx),
    broadcastTx: vi.fn().mockResolvedValue({ ok: true, txId: "abc" }),
    ...overrides,
  };
}

const baseInput = {
  dest: VALID_DEST,
  amountInput: "1.5",
  owner: OWNER,
  balanceBase: 10_000_000n,
};

describe("sendUsdtTransfer", () => {
  it("returns validation error for invalid dest and never builds", async () => {
    const deps = makeDeps();
    const result = await sendUsdtTransfer(deps, {
      ...baseInput,
      dest: "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHq",
    });
    expect(result).toEqual({
      ok: false,
      error: "Enter a valid TRON address (T...)",
    });
    expect(deps.buildTransferTx).not.toHaveBeenCalled();
  });

  it("validates amount before building", async () => {
    const deps = makeDeps();
    const result = await sendUsdtTransfer(deps, { ...baseInput, amountInput: "0" });
    expect(result.ok).toBe(false);
    expect(deps.buildTransferTx).not.toHaveBeenCalled();
  });

  it("builds with owner, dest, and base-unit amount", async () => {
    const deps = makeDeps();
    await sendUsdtTransfer(deps, baseInput);
    expect(deps.buildTransferTx).toHaveBeenCalledTimes(1);
    expect(deps.buildTransferTx).toHaveBeenCalledWith(OWNER, VALID_DEST, 1_500_000n);
  });

  it("maps wallet rejection to the rejection message and skips broadcast", async () => {
    const deps = makeDeps({
      signTransaction: vi.fn().mockRejectedValue(new Error("User rejected")),
    });
    const result = await sendUsdtTransfer(deps, baseInput);
    expect(result).toEqual({
      ok: false,
      error: "You rejected the transaction in your wallet",
    });
    expect(deps.broadcastTx).not.toHaveBeenCalled();
  });

  it("surfaces broadcast failure reason verbatim", async () => {
    const deps = makeDeps({
      broadcastTx: vi.fn().mockResolvedValue({ ok: false, reason: "OUT_OF_ENERGY" }),
    });
    const result = await sendUsdtTransfer(deps, baseInput);
    expect(result).toEqual({ ok: false, error: "OUT_OF_ENERGY" });
  });

  it("returns txId on the happy path", async () => {
    const deps = makeDeps({
      broadcastTx: vi.fn().mockResolvedValue({ ok: true, txId: "abc" }),
    });
    const result = await sendUsdtTransfer(deps, baseInput);
    expect(result).toEqual({ ok: true, txId: "abc" });
  });
});
