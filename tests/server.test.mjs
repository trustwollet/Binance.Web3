import { createServer } from "node:http";
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TronWeb } from "tronweb";
import { CONFIG } from "../server/config.mjs";
import { createHandler, verifyWallet } from "../server/app.mjs";

let server;
let base;

beforeAll(async () => {
  server = createServer(createHandler({ tronWeb: null }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("createHandler (characterization)", () => {
  it("GET /api/health returns 200 with ok and network", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.network).toBe("string");
  });

  it("POST /api/transfer without x-api-key returns 401 UNAUTHORIZED", async () => {
    const res = await fetch(`${base}/api/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for an oversized body and keeps the server alive", async () => {
    const res = await fetch(`${base}/api/transfer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONFIG.API_KEY,
      },
      body: JSON.stringify({ owner: "T".repeat(5000) }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("BAD_REQUEST");

    const health = await fetch(`${base}/api/health`);
    expect(health.status).toBe(200);
  });

  it("answers OPTIONS preflight with 204 and an empty body", async () => {
    const raw = await new Promise((resolve, reject) => {
      const sock = connect(server.address().port, "127.0.0.1", () => {
        sock.write(
          "OPTIONS /api/transfer HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
        );
      });
      const chunks = [];
      sock.on("data", (c) => chunks.push(c));
      sock.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      sock.on("error", reject);
      const t = setTimeout(() => {
        sock.destroy();
        reject(new Error("raw socket timeout"));
      }, 3000);
      sock.on("end", () => clearTimeout(t));
    });
    expect(raw.startsWith("HTTP/1.1 204")).toBe(true);
    const sep = raw.indexOf("\r\n\r\n");
    expect(sep).toBeGreaterThan(-1);
    const headers = raw.slice(0, sep).toLowerCase();
    expect(headers).toContain("access-control-allow-methods: get,post,options");
    expect(headers).not.toContain("content-type:");
    expect(raw.slice(sep + 4)).toBe("");
  });
});

describe("admin endpoints", () => {
  let adminServer;
  let adminBase;

  const VALID_OWNER = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

  async function request(path, opts) {
    const res = await fetch(`${adminBase}${path}`, opts);
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { res, body };
  }

  const post = (path, payload) =>
    request(path, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": CONFIG.API_KEY },
      body: JSON.stringify(payload ?? {}),
    });

  const status = async () =>
    (await request("/api/admin/status", { headers: { "x-api-key": CONFIG.API_KEY } })).body;

  const transfer = (owner = VALID_OWNER) =>
    request("/api/transfer", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONFIG.API_KEY,
      },
      body: JSON.stringify({ owner }),
    });

  beforeAll(async () => {
    adminServer = createServer(createHandler({ tronWeb: null }));
    await new Promise((resolve) => adminServer.listen(0, "127.0.0.1", resolve));
    adminBase = `http://127.0.0.1:${adminServer.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => adminServer.close(resolve));
  });

  it("GET /api/admin/status exposes state without leaking the API key", async () => {
    const { res, body } = await request("/api/admin/status", {
      headers: { "x-api-key": CONFIG.API_KEY },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(body.ok).toBe(true);
    expect(body.network).toBe(CONFIG.NETWORK);
    expect(body.paused).toBe(false);
    expect(body.rateLimitOn).toBe(true);
    expect(body).not.toHaveProperty("apiKey");
    expect(JSON.stringify(body)).not.toContain(CONFIG.API_KEY);
    expect(Array.isArray(body.log)).toBe(true);
    expect(body.log).toHaveLength(0);
    expect(JSON.stringify(body)).not.toContain(CONFIG.TRONGRID_API_KEY);
  });

  it("admin routes without x-api-key return 401 UNAUTHORIZED", async () => {
    for (const path of ["/api/admin/status", "/api/admin/clear-log", "/api/admin/pause", "/api/admin/ratelimit"]) {
      const res = await fetch(`${adminBase}${path}`, {
        method: path === "/api/admin/status" ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        body: path === "/api/admin/status" ? undefined : "{}",
      });
      expect(res.status).toBe(401);
      expect((await res.json()).code).toBe("UNAUTHORIZED");
    }
  });

  it("pause toggle rejects transfers with 503 TRANSFERS_PAUSED and survives reload", async () => {
    const on = await post("/api/admin/pause", { paused: true });
    expect(on.res.status).toBe(200);
    expect(on.body).toEqual({ ok: true, paused: true });

    const blocked = await transfer();
    expect(blocked.res.status).toBe(503);
    expect(blocked.body).toEqual({
      ok: false,
      code: "TRANSFERS_PAUSED",
      error: "Transfers are paused",
    });

    const reloaded = await status();
    expect(reloaded.paused).toBe(true);
    expect(reloaded.log[0]?.result).toBe("TRANSFERS_PAUSED");

    const off = await post("/api/admin/pause", { paused: false });
    expect(off.body).toEqual({ ok: true, paused: false });
    expect((await status()).paused).toBe(false);
  });

  it("POST /api/admin/clear-log empties the log", async () => {
    const { res, body } = await post("/api/admin/clear-log");
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect((await status()).log).toHaveLength(0);
  });

  it("POST /api/admin/ratelimit toggles the flag and status reflects it", async () => {
    const off = await post("/api/admin/ratelimit", { enabled: false });
    expect(off.res.status).toBe(200);
    expect(off.body).toEqual({ ok: true, rateLimitOn: false });
    expect((await status()).rateLimitOn).toBe(false);

    const on = await post("/api/admin/ratelimit", { enabled: true });
    expect(on.body).toEqual({ ok: true, rateLimitOn: true });
    expect((await status()).rateLimitOn).toBe(true);
  });

  it("GET /api/health is still unauthenticated 200 (not shadowed by admin routes)", async () => {
    const { res, body } = await request("/api/health");
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("logs authenticated outcomes but never 401 or 429 responses", async () => {
    await post("/api/admin/clear-log", {});
    await post("/api/admin/ratelimit", { enabled: true });

    let unauthorized = 0;
    const noKey = await request("/api/transfer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ owner: VALID_OWNER }),
    });
    if (noKey.res.status === 401) unauthorized += 1;

    let rejected = 0;
    let limited = 0;
    for (let i = 0; i < 14; i += 1) {
      const { res } = await transfer("not-a-tron-address");
      if (res.status === 400) rejected += 1;
      if (res.status === 429) limited += 1;
    }

    expect(unauthorized).toBe(1);
    expect(rejected).toBeGreaterThan(0);
    expect(limited).toBeGreaterThan(0);

    const { log } = await status();
    expect(log).toHaveLength(rejected);
    expect(log.every((entry) => entry.result === "INVALID_OWNER")).toBe(true);
  });

  it("caps the log at 100 entries, dropping the oldest", async () => {
    await post("/api/admin/clear-log", {});
    await post("/api/admin/ratelimit", { enabled: false });

    for (let i = 0; i < 105; i += 1) {
      const { res } = await transfer(i % 2 === 0 ? "not-a-tron-address" : "another-bad-owner");
      expect(res.status).toBe(400);
    }

    const { log } = await status();
    expect(log).toHaveLength(100);
    expect(log[0].owner).toBe("another-bad-owner");
    expect(log[0].ts).toBeTypeOf("number");
    expect(log[0].result).toBe("INVALID_OWNER");
    expect(log[0].detail).toBeTypeOf("string");
    expect(log[0].amount).toBeNull();

    await post("/api/admin/ratelimit", { enabled: true });
  });

  it("GET / serves the admin page with all control markers and no TronGrid key", async () => {
    const res = await fetch(`${adminBase}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    for (const marker of [
      "Hot Wallet Admin",
      "Copy API key",
      "Clear log",
      "Pause transfers",
      "Rate limit",
      "api/admin/status",
      "api/admin/clear-log",
      "api/admin/pause",
      "api/admin/ratelimit",
    ]) {
      expect(html).toContain(marker);
    }
    expect(html).toContain(CONFIG.API_KEY);
    expect(html).not.toContain(CONFIG.TRONGRID_API_KEY);
  });
});

describe("admin status wallet", () => {
  let walletServer;
  let walletBase;

  function mockTronWeb({
    trxSun = 5_000_000,
    usdtHex = "05f5e100",
    energyUsed = 1_000,
    estimateFails = false,
  } = {}) {
    return {
      trx: {
        getBalance: async () => trxSun,
        // TronWeb v6 resolves the raw array; the key is `getEnergyFee`.
        getChainParameters: async () => [{ key: "getEnergyFee", value: 100 }],
      },
      transactionBuilder: {
        triggerConstantContract: async (_contract, selector) => {
          if (selector.startsWith("transferFrom")) {
            if (estimateFails) throw new Error("estimate failed");
            return { energy_used: energyUsed, constant_result: ["01"] };
          }
          return { constant_result: [usdtHex] };
        },
      },
    };
  }

  beforeAll(async () => {
    walletServer = createServer(createHandler({ tronWeb: mockTronWeb() }));
    await new Promise((resolve) => walletServer.listen(0, "127.0.0.1", resolve));
    walletBase = `http://127.0.0.1:${walletServer.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => walletServer.close(resolve));
  });

  const adminHeaders = { "x-api-key": CONFIG.API_KEY };

  it("returns wallet address, TRX sun, USDT raw and lowTrx=false", async () => {
    const res = await fetch(`${walletBase}/api/admin/status`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet).toEqual({
      address: CONFIG.HOT_WALLET_ADDRESS,
      trxSun: 5_000_000,
      usdtRaw: "100000000",
      lowTrx: false,
      minSun: CONFIG.MIN_HOT_TRX_SUN,
      feeEstimateSun: 200_000,
      feeEstimateAt: expect.any(Number),
      belowEstimate: false,
      checkedAt: expect.any(Number),
    });
  });

  it("includes fee estimate fields", async () => {
    const res = await fetch(`${walletBase}/api/admin/status`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet.minSun).toBe(CONFIG.MIN_HOT_TRX_SUN);
    expect(body.wallet.feeEstimateSun).toBe(200_000);
    expect(body.wallet.feeEstimateAt).toBeTypeOf("number");
    expect(body.wallet.belowEstimate).toBe(false);
  });

  it("flags belowEstimate when balance is under the estimated fee", async () => {
    const feeServer = createServer(
      // 1.2 TRX of balance against a 1.3 TRX fee estimate.
      createHandler({ tronWeb: mockTronWeb({ trxSun: 1_200_000, energyUsed: 12_000 }) }),
    );
    await new Promise((resolve) => feeServer.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${feeServer.address().port}/api/admin/status`, { headers: adminHeaders });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wallet.feeEstimateSun).toBe(1_300_000);
      expect(body.wallet.belowEstimate).toBe(true);
      expect(body.wallet.lowTrx).toBe(false);
    } finally {
      await new Promise((resolve) => feeServer.close(resolve));
    }
  });

  it("stays 200 with feeEstimateSun null when estimate throws", async () => {
    const failServer = createServer(
      createHandler({ tronWeb: mockTronWeb({ estimateFails: true }) }),
    );
    await new Promise((resolve) => failServer.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${failServer.address().port}/api/admin/status`, { headers: adminHeaders });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wallet.feeEstimateSun).toBeNull();
      expect(body.wallet.feeEstimateAt).toBeNull();
      expect(body.wallet.belowEstimate).toBe(false);
      expect(body.wallet.trxSun).toBe(5_000_000);
    } finally {
      await new Promise((resolve) => failServer.close(resolve));
    }
  });

  it("re-probes at amount 0 when the real amount reverts, so a fee is still produced", async () => {
    // The hot wallet holds no USDT and has no allowance, so a constant call
    // carrying the real amount reverts and TronWeb throws. The estimate must
    // retry with a zero amount (the allowance gate passes), otherwise
    // feeEstimateSun stays null forever and belowEstimate can never go true.
    const amounts = [];
    const revertingTronWeb = {
      trx: {
        getBalance: async () => 5_000_000,
        getChainParameters: async () => [{ key: "getEnergyFee", value: 100 }],
      },
      transactionBuilder: {
        triggerConstantContract: async (_contract, selector, _options, params) => {
          if (!selector.startsWith("transferFrom")) {
            return { constant_result: ["05f5e100"] };
          }
          const amount = Number(params[2].value);
          amounts.push(amount);
          if (amount > 0) throw new Error("REVERT opcode executed");
          return { energy_used: 1_000, constant_result: ["01"] };
        },
      },
    };
    const feeServer = createServer(createHandler({ tronWeb: revertingTronWeb }));
    await new Promise((resolve) => feeServer.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${feeServer.address().port}/api/admin/status`, { headers: adminHeaders });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wallet.feeEstimateSun).toBe(200_000);
      expect(amounts).toContain(0);
    } finally {
      await new Promise((resolve) => feeServer.close(resolve));
    }
  });

  it("marks lowTrx when TRX is below MIN_HOT_TRX_SUN", async () => {
    const lowServer = createServer(
      createHandler({ tronWeb: mockTronWeb({ trxSun: CONFIG.MIN_HOT_TRX_SUN - 1 }) }),
    );
    await new Promise((resolve) => lowServer.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${lowServer.address().port}/api/admin/status`, { headers: adminHeaders });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.wallet.lowTrx).toBe(true);
      expect(body.wallet.trxSun).toBe(CONFIG.MIN_HOT_TRX_SUN - 1);
    } finally {
      await new Promise((resolve) => lowServer.close(resolve));
    }
  });

  it("still returns 200 with wallet.error when tronWeb is unavailable", async () => {
    const res = await fetch(`${base}/api/admin/status`, { headers: adminHeaders });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.wallet).toHaveProperty("error");
    expect(typeof body.wallet.error).toBe("string");
    expect(body.wallet).not.toHaveProperty("address");
  });

  it("never exposes apiKey or TRONGRID key inside wallet", async () => {
    const res = await fetch(`${walletBase}/api/admin/status`, { headers: adminHeaders });
    const raw = await res.text();
    expect(raw).not.toContain(CONFIG.TRONGRID_API_KEY);
  });
});

describe("transfer fee gate", () => {
  const VALID_OWNER = "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

  function mockTransferTronWeb({
    hotTrx = 5_000_000,
    ownerUsdtRaw = "05f5e100",
    allowanceRaw = "05f5e100",
    energyUsed = 1_000,
    estimateFails = false,
  } = {}) {
    const sendRawTransaction = vi.fn(async () => ({
      result: true,
      txID: "abc123",
    }));
    return {
      sendRawTransaction,
      get sendCalls() {
        return sendRawTransaction.mock.calls;
      },
      trx: {
        getBalance: async () => hotTrx,
        // TronWeb v6 resolves the raw array; the key is `getEnergyFee`.
        getChainParameters: async () => [{ key: "getEnergyFee", value: 100 }],
        sign: async (tx) => ({ ...tx, signed: true }),
        sendRawTransaction,
      },
      transactionBuilder: {
        triggerConstantContract: async (_contract, selector) => {
          if (selector.startsWith("transferFrom")) {
            if (estimateFails) throw new Error("estimate failed");
            return { energy_used: energyUsed, constant_result: ["01"] };
          }
          if (selector.startsWith("balanceOf")) {
            return { constant_result: [ownerUsdtRaw] };
          }
          if (selector.startsWith("allowance")) {
            return { constant_result: [allowanceRaw] };
          }
          throw new Error(`unexpected selector ${selector}`);
        },
        triggerSmartContract: async () => ({
          transaction: { txID: "abc123", raw_data: {} },
        }),
      },
    };
  }

  async function withTransferServer(mock, fn) {
    const s = createServer(createHandler({ tronWeb: mock }));
    await new Promise((resolve) => s.listen(0, "127.0.0.1", resolve));
    try {
      return await fn(`http://127.0.0.1:${s.address().port}`);
    } finally {
      await new Promise((resolve) => s.close(resolve));
    }
  }

  const postTransfer = (base, owner = VALID_OWNER) =>
    fetch(`${base}/api/transfer`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": CONFIG.API_KEY,
      },
      body: JSON.stringify({ owner }),
    });

  it("blocks transfer with fee-based requiredSun when balance covers floor but not fee", async () => {
    // 1 TRX of balance against a 1.3 TRX fee estimate (12k energy @ 100 sun).
    const mock = mockTransferTronWeb({ hotTrx: 1_000_000, energyUsed: 12_000 });
    await withTransferServer(mock, async (base) => {
      const res = await postTransfer(base);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("HOT_WALLET_LOW_TRX");
      expect(body.hotTrxSun).toBe("1000000");
      expect(body.requiredSun).toBe("1300000");
      expect(body.feeEstimateSun).toBe("1300000");
      expect(body.replenish).toBe(CONFIG.HOT_WALLET_ADDRESS);
      expect(mock.sendRawTransaction).not.toHaveBeenCalled();
    });
  });

  it("keeps requiredSun at floor when fee estimate is below floor", async () => {
    const mock = mockTransferTronWeb({ hotTrx: 400_000, energyUsed: 1_000 });
    await withTransferServer(mock, async (base) => {
      const res = await postTransfer(base);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("HOT_WALLET_LOW_TRX");
      expect(body.requiredSun).toBe(String(CONFIG.MIN_HOT_TRX_SUN));
      expect(body.feeEstimateSun).toBe("200000");
      expect(mock.sendRawTransaction).not.toHaveBeenCalled();
    });
  });

  it("falls back to floor when estimate fails and still blocks below floor", async () => {
    const mock = mockTransferTronWeb({ hotTrx: 500_000, estimateFails: true });
    await withTransferServer(mock, async (base) => {
      const res = await postTransfer(base);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe("HOT_WALLET_LOW_TRX");
      expect(body.requiredSun).toBe(String(CONFIG.MIN_HOT_TRX_SUN));
      expect(body.feeEstimateSun).toBeNull();
      expect(mock.sendRawTransaction).not.toHaveBeenCalled();
    });
  });

  it("passes the gate when balance covers max(floor, fee) and broadcasts", async () => {
    const mock = mockTransferTronWeb({ hotTrx: 6_000_000, energyUsed: 12_000 });
    await withTransferServer(mock, async (base) => {
      const res = await postTransfer(base);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("broadcast");
      expect(body.txId).toBe("abc123");
      expect(mock.sendRawTransaction).toHaveBeenCalledTimes(1);
    });
  });
});

describe("verifyWallet", () => {
  let realWallet = null;
  try {
    realWallet = JSON.parse(
      readFileSync(new URL("../.hotwallet.json", import.meta.url), "utf8"),
    );
  } catch {
    realWallet = null; // clean clone — real key file not committed
  }

  it.skipIf(!realWallet)("accepts the real wallet (key derives address)", () => {
    expect(() => verifyWallet(realWallet)).not.toThrow();
  });

  it("rejects when privateKeyHex does not derive wallet.address", () => {
    expect(() =>
      verifyWallet({
        address: CONFIG.HOT_WALLET_ADDRESS,
        privateKeyHex: "11".repeat(32),
      }),
    ).toThrow(/derived address/i);
  });

  it("rejects an address mismatch before key derivation", () => {
    const other = TronWeb.address.fromPrivateKey("22".repeat(32));
    expect(() =>
      verifyWallet({ address: other, privateKeyHex: "33".repeat(32) }),
    ).toThrow(/!= config/i);
  });
});
