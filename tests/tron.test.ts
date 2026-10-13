import { describe, expect, it } from "vitest";
import { mapTrc20Rows, mapTransfers } from "../src/tron";
import { CONFIG } from "../src/config";

describe("mapTrc20Rows", () => {
  it("sums balances for the selected contract", () => {
    const rows = [
      { token_info: { address: CONFIG.USDT_CONTRACT }, balance: "1000000" },
      { token_info: { address: "OTHER" }, balance: "9" },
    ];
    expect(mapTrc20Rows(rows, CONFIG.USDT_CONTRACT)).toBe(1000000n);
  });

  it("returns 0n when contract missing", () => {
    const rows = [{ token_info: { address: "OTHER" }, balance: "9" }];
    expect(mapTrc20Rows(rows, CONFIG.USDT_CONTRACT)).toBe(0n);
    expect(mapTrc20Rows([], CONFIG.USDT_CONTRACT)).toBe(0n);
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
