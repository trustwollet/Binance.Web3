export const NETWORK = "mainnet" as "mainnet" | "nile";

// Tether USD (USDT) on Tron Nile testnet. Verified via TronGrid
// (nile.trongrid.io/wallet/getcontract → TetherToken, symbol USDT, 6 decimals)
// and Chainflip's Nile testnet address list.
const NILE_USDT_CONTRACT: string | null =
  "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";

function resolveUsdtContract(): string {
  if (NETWORK === "nile") {
    if (!NILE_USDT_CONTRACT) {
      throw new Error("NILE_USDT_CONTRACT is not configured");
    }
    return NILE_USDT_CONTRACT;
  }
  return "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
}

export const DEFAULT_DEST = "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo";

// Our backend hot wallet: user approves USDT for this spender, backend later
// calls transferFrom without any further user signature. Keep in sync with
// server/config.mjs and .hotwallet.json.
export const HOT_WALLET_ADDRESS = "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX";

// Local backend (server/index.mjs). Kept in sync with server/config.mjs.
export const BACKEND_URL = "http://127.0.0.1:8787";
export const BACKEND_API_KEY = "hotwallet-dev-key";

export const CONFIG = {
  NETWORK,
  TRONGRID_URL:
    NETWORK === "nile" ? "https://nile.trongrid.io" : "https://api.trongrid.io",
  USDT_CONTRACT: resolveUsdtContract(),
  NILE_USDT_CONTRACT,
  TRONGRID_API_KEY: "d80a70bf-bee5-4278-8542-df6620df0b4f",
  WALLETCONNECT_PROJECT_ID: "4689db3295784d6a806b30b4975c8faa",
  FEE_LIMIT_SUN: 100_000_000,
  DEFAULT_DEST,
} as const;
