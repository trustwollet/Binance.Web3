import { CONFIG } from "./config";
import { encodeTransferParams } from "./encoding";
import type { TronTxJson } from "./wallet";

export type ActivityItem = {
  txId: string;
  from: string;
  to: string;
  amountBase: bigint;
  timestampMs: number;
};

export class TronGridError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TronGridError";
  }
}

async function getJson(path: string): Promise<unknown> {
  const res = await fetch(`${CONFIG.TRONGRID_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new TronGridError(`TronGrid GET ${path} failed: ${res.status}`, res.status);
  }
  return res.json();
}

async function postJson(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${CONFIG.TRONGRID_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new TronGridError(`TronGrid POST ${path} failed: ${res.status}`, res.status);
  }
  return res.json();
}

/** Pure: pick the balance of `contract` from a TronGrid trc20/balance response. */
export function mapTrc20Balance(json: unknown, contract: string): bigint {
  if (!isRecord(json) || !Array.isArray(json.data)) return 0n;
  for (const row of json.data) {
    if (!row || typeof row !== "object") continue;
    const raw = (row as Record<string, unknown>)[contract];
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** Pure: map a TronGrid transfers response to ActivityItem[], skipping malformed rows. */
export function mapTransfers(json: unknown): ActivityItem[] {
  if (!isRecord(json) || !Array.isArray(json.data)) return [];
  const items: ActivityItem[] = [];
  for (const row of json.data) {
    if (!isRecord(row)) continue;
    const { from, to, value, transaction_id, block_timestamp } = row;
    if (typeof from !== "string" || typeof to !== "string") continue;
    if (typeof transaction_id !== "string" || transaction_id.length === 0) continue;
    if (typeof block_timestamp !== "number") continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    let amountBase: bigint;
    try {
      amountBase = BigInt(value);
    } catch {
      continue;
    }
    items.push({ txId: transaction_id, from, to, amountBase, timestampMs: block_timestamp });
  }
  return items;
}

export async function fetchUsdtBalance(addrBase58: string): Promise<bigint> {
  const json = await getJson(
    `/v1/accounts/${addrBase58}/trc20/balance?contract_address=${CONFIG.USDT_CONTRACT}`,
  );
  return mapTrc20Balance(json, CONFIG.USDT_CONTRACT);
}

/** Pure: pick the TRX balance (SUN) from a TronGrid accounts response. */
export function mapAccountBalance(json: unknown): bigint {
  if (!isRecord(json) || !Array.isArray(json.data) || json.data.length === 0) return 0n;
  const first = json.data[0];
  if (!isRecord(first) || typeof first.balance !== "number") return 0n;
  return BigInt(first.balance);
}

export async function fetchTrxBalance(addrBase58: string): Promise<bigint> {
  const json = await getJson(`/v1/accounts/${addrBase58}`);
  return mapAccountBalance(json);
}

export async function fetchUsdtActivity(
  addrBase58: string,
  limit = 20,
): Promise<ActivityItem[]> {
  const json = await getJson(
    `/v1/accounts/${addrBase58}/transactions/trc20?limit=${limit}&contract_address=${CONFIG.USDT_CONTRACT}`,
  );
  return mapTransfers(json);
}

export async function buildTransferTx(
  ownerBase58: string,
  destBase58: string,
  amountBase: bigint,
): Promise<TronTxJson> {
  const json = await postJson("/wallet/triggersmartcontract", {
    owner_address: ownerBase58,
    contract_address: CONFIG.USDT_CONTRACT,
    function_selector: "transfer(address,uint256)",
    parameter: encodeTransferParams(destBase58, amountBase),
    fee_limit: CONFIG.FEE_LIMIT_SUN,
    call_value: 0,
  });
  if (!isRecord(json) || !isRecord(json.transaction)) {
    throw new TronGridError("TronGrid returned no transaction");
  }
  return json.transaction as TronTxJson;
}

function decodeHexMessage(message: string): string | undefined {
  if (!/^[0-9a-fA-F]+$/.test(message) || message.length % 2 !== 0) return undefined;
  try {
    const bytes = new Uint8Array(
      message.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    const text = new TextDecoder().decode(bytes).replace(/\0+$/, "");
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

export async function broadcastTx(
  signed: TronTxJson,
): Promise<{ ok: true; txId: string } | { ok: false; reason: string }> {
  const json = await postJson("/wallet/broadcasttransaction", signed);
  if (isRecord(json) && json.result === true && typeof signed.txID === "string") {
    return { ok: true, txId: signed.txID };
  }
  let reason = "Broadcast failed";
  if (isRecord(json)) {
    if (typeof json.message === "string") {
      reason = decodeHexMessage(json.message) ?? json.message;
    } else if (typeof json.code === "string") {
      reason = json.code;
    }
  }
  return { ok: false, reason };
}
