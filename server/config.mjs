// Keep in sync with src/config.ts
export const NETWORK = "mainnet";

export const CONFIG = {
  NETWORK,
  TRONGRID_URL: "https://api.trongrid.io",
  USDT_CONTRACT: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  TRONGRID_API_KEY: "d80a70bf-bee5-4278-8542-df6620df0b4f",
  FEE_LIMIT_SUN: 100_000_000,
  DEFAULT_DEST: "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo",
  HOT_WALLET_ADDRESS: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
  BACKEND_PORT: 8787,
  API_KEY: "hotwallet-dev-key", // keep in sync with src/config.ts BACKEND_API_KEY
  MIN_HOT_TRX_SUN: 1_000_000, // 1 TRX required to pay fees
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 10,
};
