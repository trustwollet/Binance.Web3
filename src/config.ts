export const NETWORK = "mainnet" as "mainnet" | "nile";

const NILE_USDT_CONTRACT: string | null = null;

function resolveUsdtContract(): string {
  if (NETWORK === "nile") {
    if (!NILE_USDT_CONTRACT) {
      throw new Error("NILE_USDT_CONTRACT is not configured");
    }
    return NILE_USDT_CONTRACT;
  }
  return "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
}

export const CONFIG = {
  NETWORK,
  TRONGRID_URL:
    NETWORK === "nile" ? "https://nile.trongrid.io" : "https://api.trongrid.io",
  USDT_CONTRACT: resolveUsdtContract(),
  NILE_USDT_CONTRACT,
  PROJECT_ID: "4689db3295784d6a806b30b4975c8faa",
  FEE_LIMIT_SUN: 100_000_000,
} as const;
