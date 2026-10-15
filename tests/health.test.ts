import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  runHealthChecks,
  type HealthCheckResult,
  type HealthStatus,
} from "../src/health";

const mocks = vi.hoisted(() => ({
  fetchAdminStatus: vi.fn(),
  fetchUsdtBalance: vi.fn(),
  fetchTrxBalance: vi.fn(),
  fetchAllowance: vi.fn(),
}));

vi.mock("../src/backend", () => ({
  fetchAdminStatus: mocks.fetchAdminStatus,
}));

vi.mock("../src/tron", () => ({
  fetchUsdtBalance: mocks.fetchUsdtBalance,
  fetchTrxBalance: mocks.fetchTrxBalance,
  fetchAllowance: mocks.fetchAllowance,
}));

describe("runHealthChecks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns all checks with correct structure", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);

    for (const r of results) {
      expect(r).toHaveProperty("id");
      expect(r).toHaveProperty("name");
      expect(r).toHaveProperty("status");
      expect(r).toHaveProperty("durationMs");
      expect(r).toHaveProperty("timestamp");
      expect(["passed", "failed", "warning", "running", "pending"]).toContain(
        r.status,
      );
    }
  });

  it("marks backend connectivity as passed when admin status is reachable", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const backendCheck = results.find((r) => r.id === "backend-connectivity");

    expect(backendCheck).toBeDefined();
    expect(backendCheck!.status).toBe("passed");
  });

  it("marks backend connectivity as failed when admin status is unreachable", async () => {
    mocks.fetchAdminStatus.mockResolvedValue(null);
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const backendCheck = results.find((r) => r.id === "backend-connectivity");

    expect(backendCheck).toBeDefined();
    expect(backendCheck!.status).toBe("failed");
    expect(backendCheck!.error).toContain("unreachable");
  });

  it("marks hot wallet TRX as warning when below minimum", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 500_000,
        usdtRaw: "100000000",
        lowTrx: true,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: true,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const trxCheck = results.find((r) => r.id === "hot-wallet-trx");

    expect(trxCheck).toBeDefined();
    expect(trxCheck!.status).toBe("warning");
  });

  it("marks hot wallet TRX as passed when above minimum", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const trxCheck = results.find((r) => r.id === "hot-wallet-trx");

    expect(trxCheck).toBeDefined();
    expect(trxCheck!.status).toBe("passed");
  });

  it("marks TronGrid API as passed when balance fetch succeeds", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const trongridCheck = results.find((r) => r.id === "trongrid-api");

    expect(trongridCheck).toBeDefined();
    expect(trongridCheck!.status).toBe("passed");
  });

  it("marks TronGrid API as failed when balance fetch throws", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockRejectedValue(new Error("network error"));
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const trongridCheck = results.find((r) => r.id === "trongrid-api");

    expect(trongridCheck).toBeDefined();
    expect(trongridCheck!.status).toBe("failed");
  });

  it("marks rate limiting as passed when enabled", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const rateLimitCheck = results.find((r) => r.id === "rate-limiting");

    expect(rateLimitCheck).toBeDefined();
    expect(rateLimitCheck!.status).toBe("passed");
  });

  it("marks rate limiting as warning when disabled", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: false,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const rateLimitCheck = results.find((r) => r.id === "rate-limiting");

    expect(rateLimitCheck).toBeDefined();
    expect(rateLimitCheck!.status).toBe("warning");
  });

  it("marks transfers as warning when paused", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: true,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const transferCheck = results.find((r) => r.id === "transfer-flow");

    expect(transferCheck).toBeDefined();
    expect(transferCheck!.status).toBe("warning");
  });

  it("includes duration for each check", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();

    for (const r of results) {
      expect(r.durationMs).toBeTypeOf("number");
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("includes timestamp for each check", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const now = Date.now();

    for (const r of results) {
      expect(r.timestamp).toBeTypeOf("number");
      expect(r.timestamp).toBeLessThanOrEqual(now);
      expect(r.timestamp).toBeGreaterThan(now - 60_000);
    }
  });
});

describe("health check IDs are unique", () => {
  it("returns unique check IDs", async () => {
    mocks.fetchAdminStatus.mockResolvedValue({
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: {
        address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
        trxSun: 5_000_000,
        usdtRaw: "100000000",
        lowTrx: false,
        checkedAt: 1,
        minSun: 1_000_000,
        feeEstimateSun: 200_000,
        feeEstimateAt: 1,
        belowEstimate: false,
      },
    });
    mocks.fetchUsdtBalance.mockResolvedValue(1000000n);
    mocks.fetchTrxBalance.mockResolvedValue(5_000_000n);
    mocks.fetchAllowance.mockResolvedValue(0n);

    const results = await runHealthChecks();
    const ids = results.map((r) => r.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });
});
