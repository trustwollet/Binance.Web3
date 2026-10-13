import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import bs58check from "bs58check";
import type { TronTxJson, WalletSession } from "./wallet";

const STORAGE_KEY = "usdt.trc20.hotwallet.v1";

export type HotWallet = {
  privateKey: Uint8Array;
  address: string;
};

function privKeyToAddress(privKey: Uint8Array): string {
  const pub = secp256k1.getPublicKey(privKey, false);
  const hash = keccak_256(pub.slice(1));
  const addr = new Uint8Array(21);
  addr[0] = 0x41;
  addr.set(hash.slice(12), 1);
  return bs58check.encode(addr);
}

export function generateHotWallet(): HotWallet {
  const privateKey = secp256k1.utils.randomSecretKey();
  return { privateKey, address: privKeyToAddress(privateKey) };
}

export function importHotWallet(privateKeyHex: string): HotWallet {
  const hex = privateKeyHex.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error("Private key must be 64 hex characters");
  }
  const privateKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    privateKey[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  try {
    secp256k1.getPublicKey(privateKey, false);
  } catch {
    throw new Error("Invalid private key");
  }
  return { privateKey, address: privKeyToAddress(privateKey) };
}

export function loadHotWallet(): HotWallet | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as { privateKey: string };
    return importHotWallet(obj.privateKey);
  } catch {
    return null;
  }
}

export function saveHotWallet(w: HotWallet): void {
  let hex = "";
  for (const b of w.privateKey) hex += b.toString(16).padStart(2, "0");
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ privateKey: hex, address: w.address, createdAt: new Date().toISOString() }),
  );
}

export function wipeHotWallet(): void {
  localStorage.removeItem(STORAGE_KEY);
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function signTronTransaction(tx: TronTxJson, privKey: Uint8Array): TronTxJson {
  const rawHex = tx.raw_data_hex;
  if (typeof rawHex !== "string" || rawHex.length === 0) {
    throw new Error("Transaction missing raw_data_hex");
  }
  const msgHash = keccak_256(hexToBytes(rawHex));
  const sigBytes = secp256k1.sign(msgHash, privKey, { prehash: false });
  const sig = secp256k1.Signature.fromBytes(sigBytes);
  const expectedPub = secp256k1.getPublicKey(privKey, false);
  const expectedPoint = secp256k1.Point.fromBytes(expectedPub);
  let recovery = -1;
  for (const bit of [0, 1]) {
    const recovered = sig.addRecoveryBit(bit).recoverPublicKey(msgHash);
    if (recovered.x === expectedPoint.x && recovered.y === expectedPoint.y) {
      recovery = bit;
      break;
    }
  }
  if (recovery === -1) throw new Error("Failed to determine recovery bit");
  const r = bytesToHex(sigBytes.slice(0, 32));
  const s = bytesToHex(sigBytes.slice(32, 64));
  return { ...tx, signature: [r + s + recovery.toString(16).padStart(2, "0")] };
}

export function createHotWalletSession(w: HotWallet): WalletSession {
  return {
    address: w.address,
    signTransaction: (tx) => Promise.resolve(signTronTransaction(tx, w.privateKey)),
    disconnect: () => {
      wipeHotWallet();
      return Promise.resolve();
    },
  };
}
