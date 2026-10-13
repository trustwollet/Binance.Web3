# Zero-Tap Hot Wallet Design — USDT TRC-20 Transfer

**Date:** 2026-10-14
**Status:** Approved
**Scope:** Architectural — add a browser-held hot wallet for zero-tap USDT transfers

---

## Goal

Allow USDT TRC-20 transfers with zero wallet popups after initial setup. The app generates a TRON keypair on first visit (or imports an existing private key), stores it in `localStorage`, and signs transactions locally. The existing Binance Wallet (QR/WalletConnect) flow remains as a backup path.

## Non-Goals

- Seed-phrase (mnemonic) support — private key only
- Password-encryption of the stored key (plaintext `localStorage`)
- Multi-account management
- Backend or server-side key custody
- Hardware wallet support

---

## Requirements

### Functional

1. On first visit with no stored hot wallet, offer **"Generate New Hot Wallet"** and **"Paste existing key"**.
2. After generate/import, show a **funding view**: address + QR + instructions (USDT + small TRX for gas).
3. On subsequent visits, **auto-restore** the session from `localStorage` and open the dashboard directly.
4. Dashboard transfers sign locally — no WalletConnect popup, no user confirmation.
5. "Disconnect" for a hot-wallet session **wipes** the stored key and returns to the connect view (with confirmation).
6. Keep the existing QR/WalletConnect flow intact as a secondary path on the connect view.

### Non-Functional

- Address derivation must match TRON's standard (`keccak256(pubkey[1:])[12:]` → `0x41` prefix → bs58check).
- Signature format: `r(32) || s(32) || recovery(1 byte, 0|1)` hex, 65 bytes total.
- No changes to `src/transfer.ts` — the existing `sendUsdtTransfer(deps)` interface is reused.
- All existing tests continue to pass.

---

## Architecture

### New module: `src/hotwallet.ts`

Exports:

| Export | Signature | Purpose |
|--------|-----------|---------|
| `generateHotWallet()` | `{ privateKey: Uint8Array; address: string }` | Random secp256k1 keypair + TRON address |
| `importHotWallet(privateKeyHex: string)` | `{ privateKey: Uint8Array; address: string }` | Parse hex → keypair |
| `loadHotWallet()` | `{ privateKey: Uint8Array; address: string } \| null` | Read from `localStorage` |
| `saveHotWallet(w: { privateKey: Uint8Array; address: string })` | `void` | Write to `localStorage` |
| `wipeHotWallet()` | `void` | Remove from `localStorage` |
| `createHotWalletSession(w: { privateKey: Uint8Array; address: string })` | `WalletSession` | Local signer implementing existing interface |

### Key generation & storage

- **Library:** `@noble/curves/secp256k1` (direct dep; already transitive via `@tronweb3/walletconnect-tron`).
- **Address derivation:** `keccak256(uncompressed_pubkey[1:])[12:]` → prepend `0x41` → bs58check via `src/address.ts`.
- **Storage key:** `usdt.trc20.hotwallet.v1` (versioned JSON).
- **Stored shape:**
  ```json
  {
    "privateKey": "<64-char hex>",
    "address": "T...",
    "createdAt": "2026-10-14T00:00:00.000Z"
  }
  ```

### Local transaction signing

`createHotWalletSession` returns a `WalletSession` whose `signTransaction`:

1. Hash `tx.raw_data_hex` bytes with `keccak_256` (`@noble/hashes/sha3`).
2. Sign with `secp256k1.sign(msgHash, privKey)` (noble enforces low-s).
3. Encode signature as `r || s || recovery` hex (65 bytes).
4. Return `{ ...tx, signature: [sigHex] }`.

### UI changes

#### Connect view (`src/ui/connect.ts`)

Two sections stacked:

1. **Hot Wallet (zero-tap)** — primary:
   - No stored key → "Generate New Hot Wallet" button + collapsible "Paste existing key" field.
   - Stored key exists → address display + "Use This Wallet" + "Wipe & Generate New" buttons.
   - Warning banner about `localStorage` risk.
2. **Binance Wallet (QR)** — existing flow, moved below a divider.

New view state `funding` shown after generate/import: address + QR + instructions ("Send USDT + a little TRX for gas").

#### Dashboard (`src/ui/dashboard.ts`)

- "Hot Wallet" badge near connected address.
- "Disconnect" triggers `confirm()` then wipes key and returns to connect.

#### Main wiring (`src/main.ts`)

- On load: `loadHotWallet()` → if non-null, create session and open dashboard (skip connect).
- View state machine: `connect | funding | dashboard`.

### Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `@noble/curves` | ^1.0.0 | secp256k1 sign/keygen |
| `@noble/hashes` | ^1.0.0 | keccak_256 |

Both already exist as transitive deps of `@tronweb3/walletconnect-tron`.

---

## Test Plan

| Test | File | Assertion |
|------|------|-----------|
| Known-vector address derivation | `tests/hotwallet.test.ts` | Private key `0x...1` → expected `T...` address |
| signTransaction structure | `tests/hotwallet.test.ts` | Mock tx → 65-byte hex signature, recoverable |
| localStorage round-trip | `tests/hotwallet.test.ts` | save → load → wipe cycle |
| Import validation | `tests/hotwallet.test.ts` | Invalid hex rejected |
| sendUsdtTransfer integration | `tests/transfer.test.ts` | Existing tests still pass unchanged |

---

## Security Notes

- `localStorage` is plaintext; any XSS or malicious extension can exfiltrate the key.
- User should fund only what they can afford to lose.
- Recommend a dedicated hot-wallet address, never a main wallet.
- No password encryption in v1 — can be a follow-up.

---

## Rollout

- New code is additive; no breaking changes to existing `WalletSession` consumers.
- `package.json` gains 2 direct deps.
- Existing QR/WalletConnect path untouched.
