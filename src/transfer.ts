import { isValidTronAddress } from "./address";
import { validateTransfer } from "./amount";
import type { TronTxJson } from "./wallet";

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
