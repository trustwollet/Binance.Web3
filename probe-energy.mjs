// TEMP: why does estimateTransferFeeSun return null?
// The hot wallet has 0 USDT + 0 self-allowance, so amount "1" REVERTS.
// Does the raw TronGrid response still carry energy_used on revert?
import bs58check from "bs58check";
const URL = "https://api.trongrid.io";
const KEY = "d80a70bf-bee5-4278-8542-df6620df0b4f";
const USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const HOT = "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX";
const DEST = "TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo";
const hex = (a) => bs58check.decode(a).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "");

// ABI-encode transferFrom(address,address,uint256) manually — three 32-byte words.
function encodeTransferFrom(from, to, amount) {
  const p = (s) => s.padStart(64, "0");
  return p(hex(from)) + p(hex(to)) + p(BigInt(amount).toString(16));
}

async function raw(label, amount) {
  const res = await fetch(`${URL}/wallet/triggerconstantcontract`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "TRON-PRO-API-KEY": KEY },
    body: JSON.stringify({
      owner_address: "0x" + hex(HOT),
      contract_address: "0x" + hex(USDT),
      function_selector: "transferFrom(address,address,uint256)",
      parameter: encodeTransferFrom(HOT, DEST, amount),
      call_value: 0,
    }),
  });
  const j = await res.json();
  console.log(`--- ${label} (amount=${amount}) ---`);
  console.log("  HTTP:", res.status);
  console.log("  energy_used:", j.energy_used);
  console.log("  result:", JSON.stringify(j.result));
  console.log("  constant_result:", JSON.stringify(j.constant_result));
}

await raw("REVERTING (this is what the server calls today)", 1);
await new Promise(r => setTimeout(r, 800));
await raw("amount 0 (allowance check passes)", 0);
