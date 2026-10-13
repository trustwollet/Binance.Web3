const USDT_DECIMALS = 6;
const AMOUNT_PATTERN = /^\d+(\.\d{0,6})?$/;

export function parseUsdtAmount(input: string): bigint | null {
  if (!AMOUNT_PATTERN.test(input)) return null;
  const [integer, fraction = ""] = input.split(".");
  const paddedFraction = fraction.padEnd(USDT_DECIMALS, "0");
  return BigInt(integer) * 10n ** BigInt(USDT_DECIMALS) + BigInt(paddedFraction);
}

export function formatUsdtAmount(base: bigint): string {
  const divisor = 10n ** BigInt(USDT_DECIMALS);
  const integerPart = base / divisor;
  const fractionPart = base % divisor;
  if (fractionPart === 0n) return integerPart.toString();
  const fraction = fractionPart
    .toString()
    .padStart(USDT_DECIMALS, "0")
    .replace(/0+$/, "");
  return `${integerPart}.${fraction}`;
}

export function validateTransfer(input: {
  amountInput: string;
  balanceBase: bigint;
}):
  | { ok: true; base: bigint }
  | { ok: false; error: string } {
  if (input.amountInput.trim() === "") {
    return { ok: false, error: "Enter a USDT amount" };
  }
  const base = parseUsdtAmount(input.amountInput);
  if (base === null) return { ok: false, error: "Invalid amount" };
  if (base <= 0n) {
    return { ok: false, error: "Amount must be greater than zero" };
  }
  if (base > input.balanceBase) {
    return { ok: false, error: "Amount exceeds balance" };
  }
  return { ok: true, base };
}
