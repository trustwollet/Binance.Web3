import { describe, expect, it } from "vitest";
import { isValidTronAddress, toHexAddress } from "../src/address";

describe("isValidTronAddress", () => {
  it("accepts the USDT contract address", () => {
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t")).toBe(true);
  });

  it("accepts a plain wallet address", () => {
    expect(isValidTronAddress("TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidTronAddress("")).toBe(false);
  });

  it("rejects an EVM address", () => {
    expect(isValidTronAddress("0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38")).toBe(false);
  });

  it("rejects a truncated address", () => {
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj")).toBe(false);
  });

  it("rejects a last-char checksum variant", () => {
    expect(isValidTronAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u")).toBe(false);
  });

  it("rejects a second last-char checksum variant", () => {
    expect(isValidTronAddress("TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHq")).toBe(false);
  });
});

describe("toHexAddress", () => {
  it("converts a valid address to 41-prefixed 42-char hex", () => {
    const hex = toHexAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(hex).toMatch(/^41[0-9a-fA-F]{40}$/);
    expect(hex).toHaveLength(42);
    expect(hex.startsWith("41")).toBe(true);
  });

  it("round-trips both valid sample addresses deterministically", () => {
    const a = toHexAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    const b = toHexAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t");
    expect(a).toBe(b);
    expect(toHexAddress("TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo")).toHaveLength(42);
  });

  it("throws on invalid input", () => {
    expect(() => toHexAddress("not-an-address")).toThrow();
    expect(() => toHexAddress("")).toThrow();
  });
});
