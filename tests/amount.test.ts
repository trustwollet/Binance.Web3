import { describe, expect, it } from "vitest";
import {
  formatUsdtAmount,
  parseUsdtAmount,
  validateTransfer,
} from "../src/amount";

describe("parseUsdtAmount", () => {
  it('parses "5" to 5000000n', () => {
    expect(parseUsdtAmount("5")).toBe(5000000n);
  });

  it('parses "0.5" to 500000n', () => {
    expect(parseUsdtAmount("0.5")).toBe(500000n);
  });

  it('parses "0.000001" to 1n', () => {
    expect(parseUsdtAmount("0.000001")).toBe(1n);
  });

  it('rejects "0.0000001" (7 decimal places)', () => {
    expect(parseUsdtAmount("0.0000001")).toBeNull();
  });

  it('rejects non-numeric "abc"', () => {
    expect(parseUsdtAmount("abc")).toBeNull();
  });

  it('rejects empty string', () => {
    expect(parseUsdtAmount("")).toBeNull();
  });

  it('rejects negative "-1"', () => {
    expect(parseUsdtAmount("-1")).toBeNull();
  });

  it('rejects exponent form "1e3"', () => {
    expect(parseUsdtAmount("1e3")).toBeNull();
  });

  it('parses "0" to 0n', () => {
    expect(parseUsdtAmount("0")).toBe(0n);
  });
});

describe("formatUsdtAmount", () => {
  it('formats 5000000n as "5"', () => {
    expect(formatUsdtAmount(5000000n)).toBe("5");
  });

  it('formats 1n as "0.000001"', () => {
    expect(formatUsdtAmount(1n)).toBe("0.000001");
  });

  it('formats 1500000n as "1.5"', () => {
    expect(formatUsdtAmount(1500000n)).toBe("1.5");
  });

  it('formats 0n as "0"', () => {
    expect(formatUsdtAmount(0n)).toBe("0");
  });
});

describe("validateTransfer", () => {
  it('errors "Amount exceeds balance" when amount > balance', () => {
    expect(
      validateTransfer({ amountInput: "5", balanceBase: 4000000n }),
    ).toEqual({ ok: false, error: "Amount exceeds balance" });
  });

  it('errors "Amount exceeds balance" when amount is zero', () => {
    expect(
      validateTransfer({ amountInput: "0", balanceBase: 1n }),
    ).toEqual({ ok: false, error: "Amount exceeds balance" });
  });

  it('errors "Invalid amount" for non-numeric input', () => {
    expect(
      validateTransfer({ amountInput: "abc", balanceBase: 1n }),
    ).toEqual({ ok: false, error: "Invalid amount" });
  });

  it('errors "Enter a USDT amount" for empty input', () => {
    expect(
      validateTransfer({ amountInput: "", balanceBase: 1n }),
    ).toEqual({ ok: false, error: "Enter a USDT amount" });
  });

  it("accepts a valid amount within balance", () => {
    expect(
      validateTransfer({ amountInput: "0.000001", balanceBase: 1n }),
    ).toEqual({ ok: true, base: 1n });
  });
});
