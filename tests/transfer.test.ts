import { describe, expect, it, vi } from "vitest";
import {
  sendApprove,
  sendUsdtTransfer,
  toInvisibleTransaction,
  toVisibleTransaction,
  type ApproveDeps,
  type TransferDeps,
} from "../src/transfer";
import { toHexAddress } from "../src/address";

const VALID_DEST = "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo";
const OWNER = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

const RAW_DATA_HEX = "0a0296992208f826d933472823ed408885d88294345aae01081f12a9010a31";
const BUILT_TX = {
  raw_data: {
    contract: [
      {
        parameter: {
          value: {
            owner_address: toHexAddress(OWNER),
            contract_address: toHexAddress(OWNER),
            data: "095ea7b3",
          },
        },
      },
    ],
    fee_limit: 100000000,
  },
  raw_data_hex: RAW_DATA_HEX,
  txID: "74b19c093bce65765055893e355a961570cd34c48fcd9c237a52a030a6fc86d1",
  visible: false,
};

function makeDeps(overrides: Partial<TransferDeps> = {}): TransferDeps {
  return {
    buildTransferTx: vi.fn().mockResolvedValue({ raw_data: {} }),
    signTransaction: vi.fn().mockImplementation(async (tx) => tx),
    broadcastTx: vi.fn().mockResolvedValue({ ok: true, txId: "abc" }),
    ...overrides,
  };
}

function makeApproveDeps(overrides: Partial<ApproveDeps> = {}): ApproveDeps {
  return {
    buildApproveTx: vi.fn().mockResolvedValue({ raw_data: {} }),
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

describe("sendApprove", () => {
  const MAX_UINT256 = (1n << 256n) - 1n;

  it("returns validation error for invalid spender and never builds", async () => {
    const deps = makeApproveDeps();
    const result = await sendApprove(deps, {
      owner: OWNER,
      spender: "bad-address",
      amountBase: MAX_UINT256,
    });
    expect(result).toEqual({
      ok: false,
      error: "Invalid spender address",
    });
    expect(deps.buildApproveTx).not.toHaveBeenCalled();
  });

  it("builds with owner, spender, and amount", async () => {
    const deps = makeApproveDeps();
    await sendApprove(deps, {
      owner: OWNER,
      spender: VALID_DEST,
      amountBase: MAX_UINT256,
    });
    expect(deps.buildApproveTx).toHaveBeenCalledTimes(1);
    expect(deps.buildApproveTx).toHaveBeenCalledWith(OWNER, VALID_DEST, MAX_UINT256);
  });

  it("maps wallet rejection to approval rejection message", async () => {
    const deps = makeApproveDeps({
      signTransaction: vi.fn().mockRejectedValue(new Error("User rejected")),
    });
    const result = await sendApprove(deps, {
      owner: OWNER,
      spender: VALID_DEST,
      amountBase: MAX_UINT256,
    });
    expect(result).toEqual({
      ok: false,
      error: "You rejected the approval in your wallet",
    });
    expect(deps.broadcastTx).not.toHaveBeenCalled();
  });

  it("surfaces a wallet non-response verbatim instead of calling it a rejection", async () => {
    const noResponse = new Error("Wallet did not respond");
    noResponse.name = "WalletNoResponseError";
    const deps = makeApproveDeps({
      signTransaction: vi.fn().mockRejectedValue(noResponse),
    });
    const result = await sendApprove(deps, {
      owner: OWNER,
      spender: VALID_DEST,
      amountBase: MAX_UINT256,
    });
    expect(result).toEqual({
      ok: false,
      error: "Wallet did not respond",
    });
    expect(deps.broadcastTx).not.toHaveBeenCalled();
  });

  it("surfaces broadcast failure reason verbatim", async () => {
    const deps = makeApproveDeps({
      broadcastTx: vi.fn().mockResolvedValue({ ok: false, reason: "OUT_OF_ENERGY" }),
    });
    const result = await sendApprove(deps, {
      owner: OWNER,
      spender: VALID_DEST,
      amountBase: MAX_UINT256,
    });
    expect(result).toEqual({ ok: false, error: "OUT_OF_ENERGY" });
  });

  it("returns txId on the happy path", async () => {
    const deps = makeApproveDeps({
      broadcastTx: vi.fn().mockResolvedValue({ ok: true, txId: "approve-tx" }),
    });
    const result = await sendApprove(deps, {
      owner: OWNER,
      spender: VALID_DEST,
      amountBase: MAX_UINT256,
    });
    expect(result).toEqual({ ok: true, txId: "approve-tx" });
  });

  it("hands the wallet a visible (Base58) transaction and broadcasts hex", async () => {
    const signTransaction = vi.fn().mockImplementation(async (tx) => tx);
    const broadcastTx = vi.fn().mockResolvedValue({ ok: true, txId: "approve-tx" });
    const deps = makeApproveDeps({
      buildApproveTx: vi.fn().mockResolvedValue(BUILT_TX),
      signTransaction,
      broadcastTx,
    });
    await sendApprove(deps, {
      owner: OWNER,
      spender: VALID_DEST,
      amountBase: MAX_UINT256,
    });

    const signedArg = signTransaction.mock.calls[0][0];
    expect(signedArg.visible).toBe(true);
    expect(signedArg.raw_data.contract[0].parameter.value.owner_address).toBe(OWNER);
    expect(signedArg.raw_data.contract[0].parameter.value.contract_address).toBe(OWNER);

    const broadcastArg = broadcastTx.mock.calls[0][0];
    expect(broadcastArg.visible).toBe(false);
    expect(broadcastArg.raw_data.contract[0].parameter.value.owner_address).toBe(
      toHexAddress(OWNER),
    );
    // txID and raw_data_hex must survive the round trip unsigned.
    expect(broadcastArg.raw_data_hex).toBe(RAW_DATA_HEX);
    expect(broadcastArg.txID).toBe(BUILT_TX.txID);
  });
});

describe("visible transaction conversion", () => {
  const ownerOf = (tx: unknown): string => {
    const value = (tx as { raw_data: { contract: Array<{ parameter: { value: Record<string, string> } }> } })
      .raw_data.contract[0].parameter.value;
    expect(Object.keys(value)).toContain("owner_address");
    return value.owner_address;
  };

  it("swaps hex addresses to Base58 and sets visible", () => {
    const visible = toVisibleTransaction(BUILT_TX);
    expect(visible.visible).toBe(true);
    expect(ownerOf(visible)).toBe(OWNER);
    expect(ownerOf(visible)).not.toMatch(/^[0-9a-fA-F]+$/);
  });

  it("does not mutate the source transaction", () => {
    const before = structuredClone(BUILT_TX);
    toVisibleTransaction(BUILT_TX);
    expect(BUILT_TX).toEqual(before);
  });

  it("preserves raw_data_hex and txID so the signature stays valid", () => {
    const visible = toVisibleTransaction(BUILT_TX);
    expect(visible.raw_data_hex).toBe(RAW_DATA_HEX);
    expect(visible.txID).toBe(BUILT_TX.txID);
  });

  it("round-trips back to hex for broadcast", () => {
    const back = toInvisibleTransaction(toVisibleTransaction(BUILT_TX));
    expect(back.visible).toBe(false);
    expect(back).toEqual(BUILT_TX);
  });

  it("is idempotent when addresses are already in the target format", () => {
    expect(toInvisibleTransaction(BUILT_TX)).toEqual(BUILT_TX);
  });

  it("passes through transactions with no address fields", () => {
    const bare = { raw_data: {}, txID: "abc" };
    expect(toVisibleTransaction(bare)).toEqual({ ...bare, visible: true });
    expect(toInvisibleTransaction(bare)).toEqual({ ...bare, visible: false });
  });
});
