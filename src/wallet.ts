import {
  WalletConnectChainID,
  WalletConnectWallet,
} from "@tronweb3/walletconnect-tron";
import { fromHexAddress, isValidTronAddress } from "./address";
import { CONFIG } from "./config";

export type TronTxJson = Record<string, unknown> & {
  txID?: string;
  raw_data?: unknown;
};

export type WalletSession = {
  address: string;
  signTransaction(tx: TronTxJson): Promise<TronTxJson>;
  disconnect(): Promise<void>;
};

function normalizeAddress(raw: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new Error(
      "EVM wallet detected. This app only supports TRC20 (TRON) wallets. " +
      "Please connect with a TRON-compatible wallet like TrustWallet.",
    );
  }
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (/^41[0-9a-fA-F]{40}$/.test(hex)) {
    return fromHexAddress(hex);
  }
  if (isValidTronAddress(raw)) {
    return raw;
  }
  throw new Error(
    `Invalid TRON address received from wallet: ${raw}. ` +
    "Only TRC20 (TRON) wallets are supported.",
  );
}

/**
 * Keep only the tron namespace on a stored WalletConnect session.
 * Wallets that approve with extra namespaces (e.g. eip155) store them
 * verbatim; isSessionCompatible then crashes on find(). Returns true
 * when the session was modified.
 */
function sanitizeSessionNamespaces(session: unknown): boolean {
  if (!session || typeof session !== "object") return false;
  const s = session as { namespaces?: Record<string, unknown> };
  const ns = s.namespaces;
  if (!ns || typeof ns !== "object" || Array.isArray(ns)) return false;
  const keys = Object.keys(ns);
  if (keys.length === 0 || (keys.length === 1 && keys[0] === "tron")) {
    return false;
  }
  const tron = ns["tron"];
  s.namespaces = tron && typeof tron === "object" ? { tron } : {};
  return true;
}

/**
 * Strip non-tron namespaces from every WalletConnect session persisted
 * in localStorage. Key format: wc@2:*session*.
 */
export function sanitizeStoredSessions(storage: Storage = localStorage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.includes("wc@2") && k.toLowerCase().includes("session")) {
        keys.push(k);
      }
    }
    for (const key of keys) {
      const raw = storage.getItem(key);
      if (!raw) continue;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      let changed = false;
      if (Array.isArray(data)) {
        for (const item of data) {
          if (sanitizeSessionNamespaces(item)) changed = true;
        }
      } else if (data && typeof data === "object") {
        // Either a single session or a topic → session map
        if (sanitizeSessionNamespaces(data)) {
          changed = true;
        } else {
          for (const value of Object.values(
            data as Record<string, unknown>,
          )) {
            if (sanitizeSessionNamespaces(value)) changed = true;
          }
        }
      }
      if (changed) {
        storage.setItem(key, JSON.stringify(data));
      }
    }
  } catch {
    // Storage unavailable — Layer 2 patches still protect isSessionCompatible.
  }
}

/** Remove every stored WalletConnect session (used for error recovery). */
export function purgeStoredSessions(storage: Storage = localStorage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.includes("wc@2") && k.toLowerCase().includes("session")) {
        keys.push(k);
      }
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * A wallet that never answers (closed app, dropped relay session, unsupported
 * method) would otherwise leave the dashboard spinning forever with no way for
 * the user to tell "waiting" from "broken". Fail loudly instead.
 */
const SIGN_TIMEOUT_MS = 60_000;

function withSigningDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(
        "Wallet did not respond — open your wallet app, then retry the approval",
      );
      err.name = "WalletNoResponseError";
      reject(err);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isSessionCompatibilityError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("reading 'chains'") ||
    msg.includes("reading \"chains\"") ||
    msg.includes("reading 'methods'") ||
    msg.includes("reading \"methods\"")
  );
}

export async function connectWallet(opts: {
  onUri: (uri: string) => void;
  onDisconnect: () => void;
}): Promise<WalletSession> {
  const wallet = new WalletConnectWallet({
    network:
      CONFIG.NETWORK === "nile"
        ? WalletConnectChainID.Nile
        : WalletConnectChainID.Mainnet,
    options: {
      projectId: CONFIG.WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "TrustWallet",
        url: location.origin,
        description: "USDT TRC-20 transfers",
        icons: [],
      },
    },
  });

  wallet.on("disconnect", opts.onDisconnect);

  // Layer 3: strip non-tron namespaces from any previously stored
  // WalletConnect sessions before the adapter runs isSessionCompatible.
  sanitizeStoredSessions();

  let address: string;
  try {
    ({ address } = await wallet.connect({ onUri: opts.onUri }));
  } catch (err) {
    // Recovery: if a stored session still crashes compatibility checks,
    // purge all stored sessions and retry once with a clean slate.
    if (isSessionCompatibilityError(err)) {
      purgeStoredSessions();
      ({ address } = await wallet.connect({ onUri: opts.onUri }));
    } else {
      throw err;
    }
  }

  return {
    address: normalizeAddress(address),
    signTransaction: (tx) =>
      withSigningDeadline(wallet.signTransaction(tx), SIGN_TIMEOUT_MS),
    disconnect: () => wallet.disconnect(),
  };
}
