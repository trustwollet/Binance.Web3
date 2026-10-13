export const NETWORK = "mainnet" as "mainnet" | "nile";

const NILE_USDT_CONTRACT: string | null = null;

export const CONFIG = {
  NETWORK,
  TRONGRID_URL:
    NETWORK === "nile" ? "https://nile.trongrid.io" : "https://api.trongrid.io",
  USDT_CONTRACT:
    NETWORK === "nile"
      ? NILE_USDT_CONTRACT
      : "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  NILE_USDT_CONTRACT,
  PROJECT_ID: "4689db3295784d6a806b30b4975c8faa",
  FEE_LIMIT_SUN: 100_000_000,
} as const;
