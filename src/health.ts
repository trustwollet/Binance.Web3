import { fetchAdminStatus } from "./backend";
import { fetchUsdtBalance, fetchTrxBalance } from "./tron";
import { HOT_WALLET_ADDRESS } from "./config";

export type HealthStatus = "passed" | "failed" | "warning" | "running" | "pending";

export interface HealthCheckResult {
  id: string;
  name: string;
  status: HealthStatus;
  durationMs: number;
  timestamp: number;
  error?: string;
  details?: string;
}

export interface HealthSummary {
  total: number;
  passed: number;
  failed: number;
  warning: number;
  running: number;
  pending: number;
  allPassed: boolean;
  completedAt: number;
}

async function timedCheck(
  id: string,
  name: string,
  fn: () => Promise<{ status: HealthStatus; error?: string; details?: string }>,
): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const result = await fn();
    return {
      id,
      name,
      status: result.status,
      durationMs: Math.round(performance.now() - start),
      timestamp: Date.now(),
      error: result.error,
      details: result.details,
    };
  } catch (e) {
    return {
      id,
      name,
      status: "failed",
      durationMs: Math.round(performance.now() - start),
      timestamp: Date.now(),
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export async function runHealthChecks(
  fetchImpl: typeof fetch = fetch,
): Promise<HealthCheckResult[]> {
  const checks: Promise<HealthCheckResult>[] = [];

  checks.push(
    timedCheck("backend-connectivity", "Backend Connectivity", async () => {
      const status = await fetchAdminStatus(fetchImpl);
      if (!status) {
        return { status: "failed", error: "Backend server unreachable" };
      }
      return { status: "passed", details: `Network: ${status.network}` };
    }),
  );

  checks.push(
    timedCheck("trongrid-api", "TronGrid API", async () => {
      try {
        await fetchUsdtBalance(HOT_WALLET_ADDRESS);
        return { status: "passed" };
      } catch (e) {
        return {
          status: "failed",
          error: e instanceof Error ? e.message : "TronGrid API error",
        };
      }
    }),
  );

  checks.push(
    timedCheck("hot-wallet-trx", "Hot Wallet TRX", async () => {
      const status = await fetchAdminStatus(fetchImpl);
      if (!status) {
        return { status: "failed", error: "Cannot reach backend" };
      }
      const w = status.wallet;
      if (!w) return { status: "failed", error: "No wallet info" };
      if ("error" in w) {
        return { status: "failed", error: w.error };
      }
      if (w.lowTrx || w.belowEstimate) {
        return {
          status: "warning",
          details: `TRX: ${(w.trxSun / 1e6).toFixed(2)} (min: ${(w.minSun / 1e6).toFixed(2)})`,
        };
      }
      return {
        status: "passed",
        details: `TRX: ${(w.trxSun / 1e6).toFixed(2)}`,
      };
    }),
  );

  checks.push(
    timedCheck("rate-limiting", "Rate Limiting", async () => {
      const status = await fetchAdminStatus(fetchImpl);
      if (!status) {
        return { status: "failed", error: "Cannot reach backend" };
      }
      if (!status.rateLimitOn) {
        return { status: "warning", details: "Rate limiting is disabled" };
      }
      return { status: "passed" };
    }),
  );

  checks.push(
    timedCheck("transfer-flow", "Transfer Flow", async () => {
      const status = await fetchAdminStatus(fetchImpl);
      if (!status) {
        return { status: "failed", error: "Cannot reach backend" };
      }
      if (status.paused) {
        return { status: "warning", details: "Transfers are paused by admin" };
      }
      return { status: "passed" };
    }),
  );

  checks.push(
    timedCheck("usdt-contract", "USDT Contract", async () => {
      try {
        await fetchTrxBalance(HOT_WALLET_ADDRESS);
        return { status: "passed" };
      } catch (e) {
        return {
          status: "failed",
          error: e instanceof Error ? e.message : "Contract check failed",
        };
      }
    }),
  );

  return Promise.all(checks);
}

export function summarizeHealth(results: HealthCheckResult[]): HealthSummary {
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const warning = results.filter((r) => r.status === "warning").length;
  const running = results.filter((r) => r.status === "running").length;
  const pending = results.filter((r) => r.status === "pending").length;

  return {
    total: results.length,
    passed,
    failed,
    warning,
    running,
    pending,
    allPassed: failed === 0 && warning === 0 && running === 0 && pending === 0,
    completedAt: Date.now(),
  };
}
