import { describe, expect, it } from "vitest";
import { encodeTransferParams } from "../src/encoding";
import { toHexAddress } from "../src/address";

const DEST = "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

describe("encodeTransferParams", () => {
  it("returns 128 lowercase hex chars for a valid address", () => {
    const out = encodeTransferParams(DEST, 1n);
    expect(out).toMatch(/^[0-9a-f]{128}$/);
  });

  it("encodes the address param as 64-char left-padded hex", () => {
    const out = encodeTransferParams(DEST, 1n);
    const expectedAddressParam = "0".repeat(22) + toHexAddress(DEST);
    expect(out.slice(0, 64)).toBe(expectedAddressParam);
  });

  it("encodes the amount as 64-char big-endian hex", () => {
    const out = encodeTransferParams(DEST, 1n);
    expect(out.slice(64)).toBe("0".repeat(63) + "1");
  });

  it("matches the pinned vector for USDT transfer of 1 USDT", () => {
    const payloadHex = toHexAddress(USDT).slice(2);
    const expected =
      "0".repeat(22) + "41" + payloadHex + "0".repeat(59) + "f4240";
    expect(encodeTransferParams(USDT, 1000000n)).toBe(expected);
  });

  it("throws on invalid destination address", () => {
    expect(() => encodeTransferParams("not-an-address", 1n)).toThrow();
    expect(() => encodeTransferParams("", 1n)).toThrow();
  });
});
