# Spec: USDT TRC-20 Transfer Platform

## Goal

A static single-page dApp for the SaaS platform: the user types a destination
TRC-20 address, connects their wallet (Binance Web3 Wallet) by scanning a QR
code, sees balances and recent activity, types a USDT amount, and signs the
transfer in the Binance app so USDT moves to the address they entered.

## Scope

- **In scope:** USDT (TRC-20 / TRON mainnet) only. Self-directed transfers of
  the connected wallet's own funds. Client-side only — no backend, no
  accounts, no server storage. Balances and activity come from the public
  TronGrid API.
- **Out of scope (later phases):** other TRC-20 tokens, TRX sends, backend
  accounts/history, fiat pricing (USDT ≈ $1 so amount = USD), fees-in-USDT
  logic.

## User flow

1. **Connect view**
   - User pastes destination TRC-20 address → validated as Base58Check
     `T...` address (25 bytes, version 0x41, correct checksum).
   - User clicks Connect → WalletConnect-TRON session URI is rendered as a
     QR code (current page's visual style, QRious) → user scans with
     Binance Web3 Wallet.
2. **Dashboard view** (after session established)
   - Balances: USDT (6 decimals) and TRX (fee awareness).
   - Activity: recent USDT TRC-20 transfers involving the connected address.
   - Transfer form: destination pre-filled from step 1 (editable,
     re-validated), amount in USDT with Max button.
   - Send → builds `USDT.transfer(dest, amount)` → wallet popup in Binance
     app → user signs → broadcast via TronGrid → success state with
     TronScan link; failure state with reason.

## Technical decisions

| Decision | Value |
|---|---|
| Architecture | Approach A: Vite + vanilla TypeScript, static build, deployable to Vercel |
| Wallet connection | `@tronweb3/walletconnect-tron` (`WalletConnectWallet`, `WalletConnectChainID.Mainnet`), custom QR via `onUri` |
| Chain | TRON mainnet `tron:0x2b6653dc`; RPC/REST `https://api.trongrid.io` |
| WalletConnect projectId | Reuse existing `4689db3295784d6a806b30b4975c8faa` |
| USDT contract | `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`, 6 decimals |
| Transaction build | `tronweb` constant-contract `transfer(to, amount)` → unsigned tx → `wallet.signTransaction(tx)` → broadcast via TronGrid |
| Amount math | String/integer base units only, no floating point: `"5"` → `5000000` |
| Testnet | Config switch to Nile testnet for E2E verification before mainnet send |
| Branding | Neutral product name; "Connect with Binance Web3 Wallet" appears only as a compatibility instruction line |
| UI safety | Destination + amount shown plainly before signing; no blind signing; explicit error states |

## Functional requirements

- **FR1:** Invalid destination addresses are rejected before connect and
  before send (wrong prefix, wrong length, bad checksum, empty).
- **FR2:** Amount must be > 0, ≤ wallet USDT balance, at most 6 decimal
  places; Max fills full balance.
- **FR3:** Balances and activity refresh after a successful transfer.
- **FR4:** Session loss (wallet disconnect / QR expiry) returns the user to
  the connect view with a message, never a stuck dashboard.
- **FR5:** Broadcast failure (insufficient energy, user rejects in wallet)
  shows the reason and leaves the form intact for retry.
- **FR6:** The app works as a static site: `npm run build` output has no
  server-side dependency.

## Testing & verification

- Unit tests (vitest): address validation (valid/invalid vectors), amount
  parsing/formatting (6 decimals, trailing zeros, >6 decimals rejected,
  non-numeric rejected, max).
- `npm run build` clean.
- Manual E2E on Nile testnet with Binance Web3 Wallet: connect, balances
  match, popup appears, transfer lands; then one mainnet 1 USDT send.

## Non-functional

- No private keys, mnemonics, or session secrets stored or logged.
- No token approvals — only direct `transfer()` of the typed amount.
- Dependencies pinned in `package.json`; no CDN runtime imports.
