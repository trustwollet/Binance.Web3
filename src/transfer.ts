import { fromHexAddress, isValidTronAddress, toHexAddress } from "./address";
import { validateTransfer } from "./amount";
import type { TronTxJson } from "./wallet";

const ADDRESS_FIELDS = ["owner_address", "contract_address"] as const;

function isHexTronAddress(addr: string): boolean {
  return /^41[0-9a-fA-F]{40}$/.test(addr);
}

/**
 * Wallets render a transaction only when addresses are Base58 (`visible: true`),
 * while TronGrid's JSON API requires hex (`visible: false`). Only the address
 * fields and the flag change — `raw_data_hex` is left untouched, so `txID`
 * (sha256 of raw_data_hex) and therefore the signature stay valid either way.
 * Addresses already in the target format are passed through unchanged.
 */
function withVisible(tx: TronTxJson, visible: boolean): TronTxJson {
  const next: TronTxJson = structuredClone(tx);
  next.visible = visible;
  const contracts = (next.raw_data as { contract?: unknown } | undefined)?.contract;
  if (!Array.isArray(contracts)) return next;

  for (const contract of contracts) {
    const value = (contract as { parameter?: { value?: unknown } })?.parameter?.value;
    if (!value || typeof value !== "object") continue;
    const fields = value as Record<string, unknown>;
    for (const field of ADDRESS_FIELDS) {
      const addr = fields[field];
      if (typeof addr !== "string") continue;
      if (visible) {
        fields[field] = isHexTronAddress(addr) ? fromHexAddress(addr) : addr;
      } else {
        fields[field] = isHexTronAddress(addr) ? addr : toHexAddress(addr);
      }
    }
  }
  return next;
}

/** Convert a built transaction to the Base58 form wallets can display. */
export function toVisibleTransaction(tx: TronTxJson): TronTxJson {
  return withVisible(tx, true);
}

/** Convert a signed transaction back to the hex form TronGrid broadcasts. */
export function toInvisibleTransaction(tx: TronTxJson): TronTxJson {
  return withVisible(tx, false);
}

export type TransferDeps = {
  buildTransferTx: (
    ownerBase58: string,
    destBase58: string,
    amountBase: bigint,
  ) => Promise<TronTxJson>;
  signTransaction: (tx: TronTxJson) => Promise<TronTxJson>;
  broadcastTx: (
    signed: TronTxJson,
  ) => Promise<{ ok: true; txId: string } | { ok: false; reason: string }>;
};

export type ApproveDeps = {
  buildApproveTx: (
    ownerBase58: string,
    spenderBase58: string,
    amountBase: bigint,
  ) => Promise<TronTxJson>;
  signTransaction: (tx: TronTxJson) => Promise<TronTxJson>;
  broadcastTx: (
    signed: TronTxJson,
  ) => Promise<{ ok: true; txId: string } | { ok: false; reason: string }>;
};

export type TransferResult =
  | { ok: true; txId: string }
  | { ok: false; error: string };

export async function sendUsdtTransfer(
  deps: TransferDeps,
  input: {
    dest: string;
    amountInput: string;
    owner: string;
    balanceBase: bigint;
  },
): Promise<TransferResult> {
  const dest = input.dest.trim();
  if (!isValidTronAddress(dest)) {
    return { ok: false, error: "Enter a valid TRON address (T...)" };
  }
  const validated = validateTransfer({
    amountInput: input.amountInput,
    balanceBase: input.balanceBase,
  });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }
  const tx = await deps.buildTransferTx(input.owner, dest, validated.base);
  let signed: TronTxJson;
  try {
    signed = await deps.signTransaction(tx);
  } catch {
    return { ok: false, error: "You rejected the transaction in your wallet" };
  }
  const broadcast = await deps.broadcastTx(signed);
  if (!broadcast.ok) {
    return { ok: false, error: broadcast.reason };
  }
  return { ok: true, txId: broadcast.txId };
}

export async function sendApprove(
  deps: ApproveDeps,
  input: {
    owner: string;
    spender: string;
    amountBase: bigint;
  },
): Promise<TransferResult> {
  const spender = input.spender.trim();
  if (!isValidTronAddress(spender)) {
    return { ok: false, error: "Invalid spender address" };
  }
  const built = await deps.buildApproveTx(input.owner, spender, input.amountBase);
  // Wallet renders Base58; TronGrid broadcasts hex. raw_data_hex is unchanged
  // by the swap, so txID and the signature survive both directions.
  const tx = toVisibleTransaction(built);
  let signed: TronTxJson;
  try {
    signed = await deps.signTransaction(tx);
  } catch (e) {
    if (e instanceof Error && e.name === "WalletNoResponseError") {
      return { ok: false, error: e.message };
    }
    return { ok: false, error: "You rejected the approval in your wallet" };
  }
  const broadcast = await deps.broadcastTx(toInvisibleTransaction(signed));
  if (!broadcast.ok) {
    return { ok: false, error: broadcast.reason };
  }
  return { ok: true, txId: broadcast.txId };
}
