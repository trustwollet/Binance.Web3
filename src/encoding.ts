import { isValidTronAddress, toHexAddress } from "./address";

/**
 * ABI-encode `transfer(address,uint256)` parameters for a TRC-20 contract.
 * Returns 128 lowercase hex chars: 64 for the address (left-padded
 * `0x41`+20-byte payload), 64 for the big-endian uint256 amount.
 */
export function encodeTransferParams(
  destBase58: string,
  amountBase: bigint,
): string {
  if (!isValidTronAddress(destBase58)) {
    throw new Error(`Invalid TRON address: ${destBase58}`);
  }
  if (amountBase < 0n) {
    throw new Error("Amount must be non-negative");
  }
  if (amountBase >= 1n << 256n) {
    throw new Error("Amount exceeds uint256");
  }

  const addressParam = "0".repeat(22) + toHexAddress(destBase58);
  const amountParam = amountBase.toString(16).padStart(64, "0");
  return addressParam + amountParam;
}
