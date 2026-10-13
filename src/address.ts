import bs58check from "bs58check";

const TRON_VERSION_BYTE = 0x41;
// bs58check decode() verifies the 4-byte checksum and returns the
// version byte + 20-byte payload: 21 bytes total.
const TRON_DECODED_LENGTH = 21;

export function isValidTronAddress(address: string): boolean {
  if (!address) {
    return false;
  }

  let decoded: Uint8Array;
  try {
    decoded = bs58check.decode(address);
  } catch {
    return false;
  }

  return decoded.length === TRON_DECODED_LENGTH && decoded[0] === TRON_VERSION_BYTE;
}

export function toHexAddress(address: string): string {
  const decoded = bs58check.decode(address);
  if (decoded.length !== TRON_DECODED_LENGTH || decoded[0] !== TRON_VERSION_BYTE) {
    throw new Error(`Invalid TRON address: ${address}`);
  }

  let hex = "";
  for (const byte of decoded) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}
