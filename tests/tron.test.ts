import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TronGridError,
  buildApproveTx,
  buildTransferTx,
  buildTronGridHeaders,
  fetchAllowance,
  fetchUsdtBalance,
  mapAccountBalance,
  mapTrc20Balance,
  mapTransfers,
} from "../src/tron";
import { CONFIG } from "../src/config";
import { toHexAddress } from "../src/address";

// Force an empty TronGrid API key for this suite so the "omits header when no
// key is configured" tests stay deterministic even though the real
// src/config.ts now ships a production key.
vi.mock("../src/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config")>();
  return {
    ...actual,
    CONFIG: { ...actual.CONFIG, TRONGRID_API_KEY: "" },
  };
});

describe("mapAccountBalance", () => {
  it("reads balance from data[0] of the accounts response", () => {
    expect(mapAccountBalance({ data: [{ balance: 2200225100 }], success: true })).toBe(2200225100n);
  });

  it("returns 0n when data is empty", () => {
    expect(mapAccountBalance({ data: [], success: true })).toBe(0n);
  });

  it("returns 0n when balance is missing or not a number", () => {
    expect(mapAccountBalance({ data: [{}] })).toBe(0n);
    expect(mapAccountBalance({ data: [{ balance: "not-a-number" }] })).toBe(0n);
  });

  it("returns 0n for null / garbage / non-object input", () => {
    expect(mapAccountBalance(null)).toBe(0n);
    expect(mapAccountBalance(undefined)).toBe(0n);
    expect(mapAccountBalance("garbage")).toBe(0n);
    expect(mapAccountBalance({})).toBe(0n);
    expect(mapAccountBalance({ data: "not-an-array" })).toBe(0n);
  });
});

describe("mapTrc20Balance", () => {
  it("reads the contract balance from the balance response", () => {
    const json = {
      data: [{ [CONFIG.USDT_CONTRACT]: "1000000" }, { OTHER: "9" }],
      success: true,
    };
    expect(mapTrc20Balance(json, CONFIG.USDT_CONTRACT)).toBe(1000000n);
  });

  it("returns 0n when contract missing", () => {
    expect(mapTrc20Balance({ data: [{ OTHER: "9" }] }, CONFIG.USDT_CONTRACT)).toBe(0n);
    expect(mapTrc20Balance({ data: [] }, CONFIG.USDT_CONTRACT)).toBe(0n);
    expect(mapTrc20Balance("garbage", CONFIG.USDT_CONTRACT)).toBe(0n);
  });
});

describe("mapTransfers", () => {
  it("maps a valid transfer row", () => {
    const json = {
      data: [
        {
          from: "TFrom",
          to: "TTo",
          value: "5000000",
          transaction_id: "abc123",
          block_timestamp: 1700000000000,
        },
      ],
    };
    expect(mapTransfers(json)).toEqual([
      {
        txId: "abc123",
        from: "TFrom",
        to: "TTo",
        amountBase: 5000000n,
        timestampMs: 1700000000000,
      },
    ]);
  });

  it("skips malformed rows", () => {
    const json = {
      data: [
        { from: "TFrom", to: "TTo", value: "not-a-number", transaction_id: "x", block_timestamp: 1 },
        { from: "TFrom" },
        "garbage",
        null,
      ],
    };
    expect(mapTransfers(json)).toEqual([]);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const SAMPLE_OWNER = "TL1417xeaNrvU6La3N5Vgpye1e47i4zHUv";

describe("TronGrid client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("omits the TronGrid API key header on GET when no key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ [CONFIG.USDT_CONTRACT]: "1000000" }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchUsdtBalance(SAMPLE_OWNER);
    await vi.runAllTimersAsync();
    expect(await resultPromise).toBe(1000000n);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("TRON-PRO-API-KEY");
    expect(headers).toMatchObject({ Accept: "application/json" });
  });

  it("omits the TronGrid API key header on POST when no key is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ transaction: { txID: "abc" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = buildTransferTx(SAMPLE_OWNER, CONFIG.DEFAULT_DEST, 1_000_000n);
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("TRON-PRO-API-KEY");
    expect(headers).toMatchObject({ "Content-Type": "application/json" });
  });

  it("sends the TronGrid API key header when a key is configured", () => {
    expect(buildTronGridHeaders("test-key-123")).toMatchObject({
      Accept: "application/json",
      "TRON-PRO-API-KEY": "test-key-123",
    });
  });

  it("omits the TronGrid API key header when the configured key is empty", () => {
    const headers = buildTronGridHeaders("");
    expect(headers).not.toHaveProperty("TRON-PRO-API-KEY");
    expect(headers).toMatchObject({ Accept: "application/json" });
  });

  it("retries once on 429 then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ [CONFIG.USDT_CONTRACT]: "5" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchUsdtBalance(SAMPLE_OWNER);
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();
    expect(await resultPromise).toBe(5n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries twice on consecutive 429s then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(jsonResponse({}, 429))
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ [CONFIG.USDT_CONTRACT]: "7" }] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchUsdtBalance(SAMPLE_OWNER);
    resultPromise.catch(() => {});
    await vi.runAllTimersAsync();
    expect(await resultPromise).toBe(7n);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws a friendly TronGridError after exhausting retries on 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchUsdtBalance(SAMPLE_OWNER);
    const assertion = expect(resultPromise).rejects.toThrowError(TronGridError);
    await vi.runAllTimersAsync();
    await assertion;
    await expect(resultPromise).rejects.toThrow(/rate limit/i);
    await expect(resultPromise).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-429 errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 404));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchUsdtBalance(SAMPLE_OWNER);
    const assertion = expect(resultPromise).rejects.toThrowError(TronGridError);
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws a friendly TronGridError on 401 instead of a raw status string", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 401));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchUsdtBalance(SAMPLE_OWNER);
    const assertion = expect(resultPromise).rejects.toThrowError(TronGridError);
    await vi.runAllTimersAsync();
    await assertion;
    await expect(resultPromise).rejects.toThrow(/live data unavailable/i);
    await expect(resultPromise).rejects.toThrow(/unauthorized/i);
    await expect(resultPromise).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("builds approve transaction with correct params", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ transaction: { txID: "approve-tx" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = buildApproveTx(SAMPLE_OWNER, CONFIG.DEFAULT_DEST, 1000000n);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ txID: "approve-tx" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.function_selector).toBe("approve(address,uint256)");
    // TronGrid's /wallet/* JSON API requires 0x-prefixed hex addresses —
    // Base58 is rejected with "INVALID hex String".
    expect(parsed.owner_address).toBe("0x" + toHexAddress(SAMPLE_OWNER));
    expect(parsed.contract_address).toBe("0x" + toHexAddress(CONFIG.USDT_CONTRACT));
  });

  it("never sends a Base58 address to triggerconstantcontract", async () => {
    // Regression: Base58 addresses make TronGrid answer
    // OTHER_ERROR / JsonFormat$ParseException: INVALID hex String and omit
    // `transaction`, which surfaced as "TronGrid returned no transaction".
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ constant_result: ["00".repeat(32)] }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchAllowance(SAMPLE_OWNER, CONFIG.DEFAULT_DEST);
    await vi.runAllTimersAsync();
    await resultPromise;

    const body = fetchMock.mock.calls[0][1]?.body as string;
    const parsed = JSON.parse(body);
    const base58 = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;
    expect(parsed.owner_address).not.toMatch(base58);
    expect(parsed.contract_address).not.toMatch(base58);
    expect(parsed.owner_address).toBe("0x" + toHexAddress(SAMPLE_OWNER));
    expect(parsed.contract_address).toBe("0x" + toHexAddress(CONFIG.USDT_CONTRACT));
  });

  it("retries approve when TronGrid returns 200 without a transaction", async () => {
    // Simulates the transient node failure that produced the bare
    // "TronGrid returned no transaction" error: HTTP 200, no `transaction`.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: { result: true } }))
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({ transaction: { txID: "approve-tx" } }));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = buildApproveTx(SAMPLE_OWNER, CONFIG.DEFAULT_DEST, 1000000n);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toEqual({ txID: "approve-tx" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("surfaces the TronGrid result reason instead of a bare no-transaction error", async () => {
    // TronGrid reports refusal via `result.code`/`result.message` (hex) and
    // omits `transaction` — the reason must survive into the thrown error.
    const hexReason = "6163636f756e74206e6f7420616374697661746564"; // "account not activated"
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ result: { code: "CONTRACT_VALIDATE_ERROR", message: hexReason } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = buildApproveTx(SAMPLE_OWNER, CONFIG.DEFAULT_DEST, 1000000n);
    const assertion = expect(resultPromise).rejects.toThrow(
      "CONTRACT_VALIDATE_ERROR: account not activated",
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps the bare message when TronGrid gives no reason at all", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = buildApproveTx(SAMPLE_OWNER, CONFIG.DEFAULT_DEST, 1000000n);
    const assertion = expect(resultPromise).rejects.toThrow(
      "TronGrid returned no transaction",
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fetches allowance and parses hex result", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ constant_result: ["00000000000000000000000000000000000000000000000000000000000f4240"] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchAllowance(SAMPLE_OWNER, CONFIG.DEFAULT_DEST);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe(1000000n);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = fetchMock.mock.calls[0][1]?.body as string;
    const parsed = JSON.parse(body);
    expect(parsed.function_selector).toBe("allowance(address,address)");
    expect(parsed.owner_address).toBe("0x" + toHexAddress(SAMPLE_OWNER));
    expect(parsed.contract_address).toBe("0x" + toHexAddress(CONFIG.USDT_CONTRACT));
  });

  it("retries allowance when constant_result is missing on the first attempts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ result: { result: true } }))
      .mockResolvedValueOnce(
        jsonResponse({
          constant_result: [
            "00000000000000000000000000000000000000000000000000000000000f4240",
          ],
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchAllowance(SAMPLE_OWNER, CONFIG.DEFAULT_DEST);
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toBe(1000000n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
