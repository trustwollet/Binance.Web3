import { describe, it, expect, beforeEach } from "vitest";
import { isValidTronAddress } from "../src/address";
import {
  generateHotWallet,
  importHotWallet,
  loadHotWallet,
  saveHotWallet,
  wipeHotWallet,
  signTronTransaction,
  createHotWalletSession,
} from "../src/hotwallet";

const FIXED_KEY = "0000000000000000000000000000000000000000000000000000000000000001";

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => {
    store.clear();
  },
};

beforeEach(() => {
  localStorage.clear();
});

describe("generateHotWallet", () => {
  it("returns 32-byte private key and valid TRON address", () => {
    const w = generateHotWallet();
    expect(w.privateKey.length).toBe(32);
    expect(isValidTronAddress(w.address)).toBe(true);
  });
});

describe("importHotWallet", () => {
  it("derives a valid TRON address from a known key", () => {
    const w = importHotWallet(FIXED_KEY);
    expect(isValidTronAddress(w.address)).toBe(true);
  });

  it("rejects short keys", () => {
    expect(() => importHotWallet("abc")).toThrow(/64 hex/);
  });

  it("rejects non-hex keys", () => {
    expect(() => importHotWallet("z".repeat(64))).toThrow(/64 hex/);
  });

  it("accepts 0x-prefixed keys", () => {
    const w = importHotWallet("0x" + FIXED_KEY);
    expect(isValidTronAddress(w.address)).toBe(true);
  });
});

describe("localStorage round-trip", () => {
  it("save → load → wipe cycle preserves address", () => {
    const original = importHotWallet(FIXED_KEY);
    saveHotWallet(original);
    const loaded = loadHotWallet();
    expect(loaded).not.toBeNull();
    expect(loaded!.address).toBe(original.address);
    wipeHotWallet();
    expect(loadHotWallet()).toBeNull();
  });

  it("loadHotWallet returns null when nothing stored", () => {
    expect(loadHotWallet()).toBeNull();
  });
});

describe("signTronTransaction", () => {
  it("returns tx with 65-byte hex signature in signature array", () => {
    const w = importHotWallet(FIXED_KEY);
    const mockTx = { raw_data_hex: "0a020cb02208c1b0c0a8f8dbd1e840c0a1d5c08a2" } as any;
    const signed = signTronTransaction(mockTx, w.privateKey);
    const sigArr = signed.signature as string[];
    expect(sigArr).toBeDefined();
    const sig = sigArr[0];
    expect(sig).toMatch(/^[0-9a-f]{130}$/); // 65 bytes hex
  });

  it("throws on missing raw_data_hex", () => {
    const w = importHotWallet(FIXED_KEY);
    expect(() => signTronTransaction({} as any, w.privateKey)).toThrow(/raw_data_hex/);
  });
});

describe("createHotWalletSession", () => {
  it("returns WalletSession with matching address", () => {
    const w = importHotWallet(FIXED_KEY);
    const session = createHotWalletSession(w);
    expect(session.address).toBe(w.address);
  });

  it("signTransaction returns signed tx", async () => {
    const w = importHotWallet(FIXED_KEY);
    const session = createHotWalletSession(w);
    const mockTx = { raw_data_hex: "0a020cb02208c1b0c0a8f8dbd1e840c0a1d5c08a2" } as any;
    const signed = await session.signTransaction(mockTx);
    expect(signed.signature).toBeDefined();
  });

  it("disconnect wipes storage", async () => {
    const w = importHotWallet(FIXED_KEY);
    saveHotWallet(w);
    const session = createHotWalletSession(w);
    await session.disconnect();
    expect(loadHotWallet()).toBeNull();
  });
});
