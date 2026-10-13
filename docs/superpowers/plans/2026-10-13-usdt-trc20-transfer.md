# USDT TRC-20 Transfer Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static SPA where the user types a destination TRC-20 address, scans a WalletConnect QR with Binance Web3 Wallet, sees USDT/TRX balances and recent activity, then signs a USDT `transfer()` to the typed address.

**Architecture:** Client-only static site (Vite + vanilla TS). Wallet connection via `@tronweb3/walletconnect-tron` rendering its URI through QRious; all chain reads/writes via TronGrid REST (`fetch`) — no `tronweb` in app code; Base58Check handling via `bs58check`. Pure logic (address validation, amount math, param encoding, response mapping) is unit-tested with vitest.

**Tech Stack:** Vite 6, TypeScript 5, vitest, `@tronweb3/walletconnect-tron`, `qrious`, `bs58check`.

**Spec:** `docs/superpowers/specs/2026-10-13-usdt-trc20-transfer.md`

## Global Constraints

- USDT (TRC-20) only; single contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (6 decimals) on mainnet.
- TRON mainnet; TronGrid `https://api.trongrid.io`; WalletConnect projectId `4689db3295784d6a806b30b4975c8faa`; fee limit `100000000` sun.
- No floating-point amount math anywhere — integer base units (`bigint`) only; no token approvals — only direct `transfer()`.
- No backend, no storage of keys/secrets, no runtime CDN imports; all deps pinned in `package.json`.
- UI copy: neutral product title "USDT Transfer"; the phrase "Connect with Binance Web3 Wallet" appears only as a connect instruction.
- Every task commits with a conventional message before the next task starts.

## Review Focus

1. **Foreign/wrong-chain address typed by user** (EVM `0x…`, truncated, bad checksum) must be rejected, never sent — owned by Task 2 tests: invalid vectors for each class.
2. **Decimal amount handling** ("0.1", 7 decimals, balance overflow) must never round or exceed balance — owned by Task 3 tests: parse/format/validate vectors incl. `bigint` balance bounds.
3. **TRC-20 parameter encoding corruption** would move funds wrongly — owned by Task 5 tests: encode/decode roundtrip plus a hardcoded known vector.
4. **User rejects in wallet / broadcast fails** (FR5) must show a reason and keep the form intact — owned by Task 6: `mapBroadcastResult` unit tests + manual verification step in Task 7.
5. **Disconnect/QR expiry mid-session** (FR4) must return to connect view — owned by Task 4: session `onDisconnect` wiring + manual verification step in Task 7.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/styles.css`
- Modify: replace existing `index.html` content (reuse its existing `<style>` block as `src/styles.css` base)

**Interfaces:**
- Produces: Vite dev (`npm run dev`), build (`npm run build` → `dist/`), test (`npx vitest run`) commands all green.

- [ ] **Step 1:** Init `npm init -y`; install pinned deps: `@tronweb3/walletconnect-tron`, `qrious`, `bs58check`; dev: `vite`, `typescript`, `vitest`, `@types/qrious`, `@types/bs58check`. If `@tronweb3/walletconnect-tron` declares `tronweb` as a peer dependency, add `tronweb` too (it stays unused by app code).
- [ ] **Step 2:** Create `tsconfig.json` (strict, `moduleResolution: "bundler"`, DOM lib), `vite.config.ts` (default), `index.html` with `<div id="app">` + `<script type="module" src="/src/main.ts">`, `src/main.ts` rendering a `#connect-view` container, `src/styles.css` carrying over the existing page's style rules.
- [ ] **Step 3:** Add a trivial passing test `tests/scaffold.test.ts` (`expect(1).toBe(1)`) so the vitest pipeline is proven.
- [ ] **Step 4:** Run `npm run build` and `npx vitest run` — both succeed.
- [ ] **Step 5:** Commit: `chore: scaffold vite + ts + vitest project`.

### Task 2: TRON address validation

**Files:**
- Create: `src/address.ts`
- Test: `tests/address.test.ts`

**Interfaces:**
- Produces: `isValidTronAddress(address: string): boolean` — true only for mainnet Base58Check T-addresses (25 bytes: version `0x41` + 20-byte payload + 4-byte checksum), false otherwise.
- Produces: `toHexAddress(address: string): string` — the `0x41`-prefixed 42-char hex form (throws on invalid input).

- [ ] **Step 1: Write failing tests.** Valid: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (USDT contract), `TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHo`. Invalid: `""`, `0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38` (EVM), truncated `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj`, last-char variant `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6u` (if this vector unexpectedly passes, swap the final char and re-pin), `TLFD53gg5uraFeKMsLs8m9ZT1cpX6JFDHq` variant. `toHexAddress(valid)` returns `41` + 40 hex chars; `toHexAddress(invalid)` throws.
- [ ] **Step 2:** Run `npx vitest run tests/address.test.ts` — expect FAIL (not implemented).
- [ ] **Step 3:** Implement in `src/address.ts` using `bs58check.decode`: length === 25, byte[0] === 0x41, checksum verified by decode (throws on bad checksum — catch and return false).
- [ ] **Step 4:** Run test — PASS.
- [ ] **Step 5:** Commit: `feat: tron address validation and hex conversion`.

### Task 3: USDT amount math

**Files:**
- Create: `src/amount.ts`
- Test: `tests/amount.test.ts`

**Interfaces:**
- Produces: `parseUsdtAmount(input: string): bigint | null` — base units, null on non-numeric, negative, or >6 decimal places.
- Produces: `formatUsdtAmount(base: bigint): string` — minimal decimal form (`5000000n → "5"`, `1n → "0.000001"`, `0n → "0"`).
- Produces: `validateTransfer(input: { amountInput: string; balanceBase: bigint }): { ok: true; base: bigint } | { ok: false; error: string }` — error strings: `"Enter a USDT amount"`, `"Invalid amount"`, `"Amount exceeds balance"` (covers `base <= 0n` and `base > balanceBase`).

- [ ] **Step 1: Write failing tests.** Parse: `"5"→5000000n`, `"0.5"→500000n`, `"0.000001"→1n`, `"0.0000001"→null`, `"abc"→null`, `""→null`, `"-1"→null`, `"1e3"→null`, `"0"→0n`. Format: `5000000n→"5"`, `1n→"0.000001"`, `1500000n→"1.5"`, `0n→"0"`. Validate: `{amountInput:"5", balanceBase:4000000n}` → error `"Amount exceeds balance"`; `{amountInput:"0", balanceBase:1n}` → error `"Amount exceeds balance"`; `{amountInput:"abc", balanceBase:1n}` → `"Invalid amount"`; `{amountInput:"", balanceBase:1n}` → `"Enter a USDT amount"`; `{amountInput:"0.000001", balanceBase:1n}` → `{ok:true, base:1n}`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement in `src/amount.ts`. Parse via regex `^\d+(\.\d{0,6})?$` (rejects `.`-only and exponent forms), split integer/fraction, pad fraction to 6, build with `BigInt`. Format by integer division/modulo on base units — no `Number` conversion anywhere.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5:** Commit: `feat: usdt amount parse, format, and transfer validation`.

### Task 4: WalletConnect-TRON connection

**Files:**
- Create: `src/config.ts`, `src/wallet.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `toHexAddress` (Task 2) to normalize the session account.
- Produces: `type WalletSession = { address: string; signTransaction(tx: TronTxJson): Promise<TronTxJson>; disconnect(): Promise<void> }` (`TronTxJson` is the raw TronGrid transaction object; declare as `Record<string, unknown> & { txID?: string; raw_data?: unknown }`).
- Produces: `connectWallet(opts: { onUri: (uri: string) => void }): Promise<WalletSession>` — calls `WalletConnectWallet` with `WalletConnectChainID.Mainnet`, `projectId`, metadata `{ name: "USDT Transfer", url: location.origin, description: "USDT TRC-20 transfers", icons: [] }`, forwards the `onUri` callback to render the QR **without** AppKit modal, resolves with the connected `tron` namespace account address (`0x41…` → `toHexAddress` inverse: normalize hex to Base58 — implement `fromHexAddress(hex: string): string` in `address.ts` and test it in Task 2's suite: `fromHexAddress(toHexAddress(v)) === v` roundtrip).
- Produces: session-loss callback: `connectWallet` also accepts `onDisconnect: () => void`, invoked on WC `session_delete` / expiry.
- Produces: `src/config.ts` exporting `CONFIG = { NETWORK: "mainnet" as "mainnet" | "nile", TRONGRID_URL, USDT_CONTRACT, NILE_USDT_CONTRACT: null as string | null, PROJECT_ID, FEE_LIMIT_SUN: 100000000 }` where `TRONGRID_URL` and `USDT_CONTRACT` derive from `NETWORK` (mainnet: `https://api.trongrid.io` / `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`; nile: `https://nile.trongrid.io` / `NILE_USDT_CONTRACT`).

- [ ] **Step 1: Roundtrip test.** Add `fromHexAddress` roundtrip tests to `tests/address.test.ts`; run — FAIL.
- [ ] **Step 2:** Implement `fromHexAddress` (bs58check.encode of `0x41` + payload) in `src/address.ts`; run — PASS.
- [ ] **Step 3:** Implement `src/config.ts` and `src/wallet.ts` per Interfaces; wire `main.ts` connect button → `connectWallet({ onUri })` with QRious rendering into `#qr-canvas`, and `onDisconnect` → tear down session view.
- [ ] **Step 4:** `npm run build` succeeds; `npx vitest run` green.
- [ ] **Step 5:** Commit: `feat: walletconnect-tron session with custom qr`.
- [ ] **Step 6:** Manual smoke (dev server): open page, click Connect, QR renders with a `wc:` URI (scan not required yet).

### Task 5: TronGrid data layer + transfer encoding

**Files:**
- Create: `src/tron.ts`, `src/encoding.ts`
- Test: `tests/encoding.test.ts`, `tests/tron.test.ts`

**Interfaces:**
- Consumes: `CONFIG` (Task 4), `toHexAddress`/`isValidTronAddress` (Task 2).
- Produces (`encoding.ts`): `encodeTransferParams(destBase58: string, amountBase: bigint): string` — 128 hex chars: 64 for the address param (11 zero bytes + `0x41`+20-byte payload), 64 for uint256 amount (big-endian, left-padded); throws on invalid dest.
- Produces (`tron.ts`): `fetchUsdtBalance(addrBase58: string): Promise<bigint>` via `GET {TRONGRID_URL}/v1/accounts/{addr}/trc20?limit=200&only_to=false` selecting the row with `token_info.address === USDT_CONTRACT`, `BigInt(row.balance)`, else `0n`. `fetchTrxBalance(addr): Promise<bigint>` via `GET /v1/accounts/{addr}` → `data[0].balance` sun. `fetchUsdtActivity(addr, limit=20): Promise<ActivityItem[]>` via `GET /v1/accounts/{addr}/trc20/transfers?limit=20&contract_addresses={USDT_CONTRACT}` mapped to `type ActivityItem = { txId: string; from: string; to: string; amountBase: bigint; timestampMs: number }`.
- Produces (`tron.ts`): `buildTransferTx(ownerBase58: string, destBase58: string, amountBase: bigint): Promise<TronTxJson>` via `POST /wallet/triggersmartcontract` body `{ owner_address: ownerBase58, contract_address: USDT_CONTRACT, function_selector: "transfer(address,uint256)", parameter: encodeTransferParams(dest, amount), fee_limit: CONFIG.FEE_LIMIT_SUN, call_value: 0 }` → returns `.transaction`.
- Produces (`tron.ts`): `broadcastTx(signed: TronTxJson): Promise<{ ok: true; txId: string } | { ok: false; reason: string }>` via `POST /wallet/broadcasttransaction`; ok when `result === true` (txId = `txID`), else reason from `result.message`/`code` (hex-decode message bytes if present).
- Pure mapping helper exported for tests: `mapTrc20Rows(rows: unknown[], contract: string): bigint` (used by balance) and `mapTransfers(json: unknown): ActivityItem[]`.

- [ ] **Step 1: Write failing encoding tests.** Roundtrip: for valid `TLFD…`, `encodeTransferParams` output is 128 lowercase hex chars; first 64 chars decode (test-side: bs58check decode of input + manual pad) back to the same payload — i.e. `encodeTransferParams` first half === independent test computation `"0".repeat(22) + toHexAddress(dest).slice(2)`; second half === amount as 64-char big-endian hex (`1n → "0…01"`). Hardcoded vector: `encodeTransferParams("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", 1000000n)` equals the pin computed as `"0".repeat(22) + "41" + <payload hex> + "0".repeat(58) + "989680"` (derive payload hex in the test from `toHexAddress`). Invalid dest throws.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `src/encoding.ts`; run — PASS.
- [ ] **Step 4: Write failing mapping tests.** `mapTrc20Rows` with a fixture array (`[{token_info:{address:USDT}, balance:"1000000"},{token_info:{address:"OTHER"},balance:"9"}]` → `1000000n`; missing contract → `0n`; `mapTransfers` fixture with `from`, `to`, `value`, `transaction_id`, `block_timestamp` → mapped `ActivityItem`, `value` as bigint; malformed rows skipped.
- [ ] **Step 5:** Run — FAIL.
- [ ] **Step 6:** Implement `fetchUsdtBalance`, `fetchTrxBalance`, `fetchUsdtActivity`, `buildTransferTx`, `broadcastTx`, mapping helpers in `src/tron.ts` (thin `fetch` wrappers around the pure helpers; shared `getJson`/`postJson` that throw a typed `TronGridError` on HTTP failure); run — PASS.
- [ ] **Step 7:** `npm run build` green; commit: `feat: trongrid reads and transfer tx build/broadcast`.

### Task 6: Transfer orchestration

**Files:**
- Create: `src/transfer.ts`
- Test: `tests/transfer.test.ts`

**Interfaces:**
- Consumes: `validateTransfer` (Task 3), `isValidTronAddress` (Task 2), `buildTransferTx`/`broadcastTx` (Task 5), `WalletSession.signTransaction` (Task 4).
- Produces: `sendUsdtTransfer(deps: TransferDeps, input: { dest: string; amountInput: string; owner: string; balanceBase: bigint }): Promise<{ ok: true; txId: string } | { ok: false; error: string }>` where `TransferDeps = { buildTransferTx, signTransaction, broadcastTx }` (injectable for tests). Error strings: `"Enter a valid TRON address (T...)"`, then the `validateTransfer` errors, then `"You rejected the transaction in your wallet"` (sign throws), then `broadcastTx` failure reason.
- Produces: errors distinguish validation vs signing vs broadcast by string match — UI shows `error` verbatim.

- [ ] **Step 1: Write failing tests** with stub deps: invalid dest → validation error and **build not called**; valid input → build called with `(owner, dest, 1n)`; stub `signTransaction` that rejects → `"You rejected the transaction in your wallet"` and **broadcast not called**; stub `broadcastTx` → `{ok:false, reason:"OUT_OF_ENERGY"}` surfaces that reason; happy path → `{ok:true, txId:"abc"}`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `src/transfer.ts` as a straight-line pipeline (validate dest → validate amount → build → sign → broadcast).
- [ ] **Step 4:** Run — PASS; commit: `feat: send usdt transfer orchestration with injected deps`.

### Task 7: Dashboard UI + view wiring

**Files:**
- Create: `src/ui/connect.ts`, `src/ui/dashboard.ts`
- Modify: `src/main.ts`, `index.html`, `src/styles.css`

**Interfaces:**
- Consumes: `isValidTronAddress` (2), `parseUsdtAmount`/`validateTransfer`/`formatUsdtAmount` (3), `connectWallet` (4), `fetchUsdtBalance`/`fetchTrxBalance`/`fetchUsdtActivity` (5), `sendUsdtTransfer` (6).
- Produces: two views in `#app` — `renderConnectView({ onConnect })` (destination input + live validation hint + Connect button + QR container + "Connect with Binance Web3 Wallet" instruction line) and `renderDashboardView({ session, dest, onDisconnect })` (balance cards USDT/TRX, activity list linking `txId` to `https://tronscan.org/#/transaction/{txId}`, transfer form with dest (editable, re-validated), amount + Max, Send button, status/success/error region, Disconnect button).

- [ ] **Step 1:** Implement `src/ui/connect.ts`: validate on input (disable Connect until `isValidTronAddress`), on Connect call `connectWallet` with QRious QR into canvas; show "Waiting for wallet scan…" state.
- [ ] **Step 2:** Implement `src/ui/dashboard.ts`: on mount fetch balances + activity (show loading and per-section error states; FR3 refresh via re-fetch after success); transfer form Send → `sendUsdtTransfer`; success → show txId link + refresh balances/activity (FR3); error → show verbatim message, form values preserved (FR5); Disconnect → `session.disconnect()` → back to connect view (FR4 covers WC `onDisconnect` too).
- [ ] **Step 3:** Wire `main.ts` view switching: destination stored in module state across views; session loss mid-dashboard → connect view + "Wallet disconnected" notice (FR4).
- [ ] **Step 4:** `npm run build` + `npx vitest run` green; manual smoke on dev server: full connect flow to dashboard, balances render (real TronGrid), disconnect works. Requires your phone scanning the QR — I'll guide it.
- [ ] **Step 5:** Commit: `feat: connect and dashboard views with transfer form`.

### Task 8: Testnet switch, E2E, final verification

**Files:**
- Modify: `src/config.ts` (set `NETWORK: "nile"`, fill `NILE_USDT_CONTRACT`)
- Create: `docs/superpowers/specs/2026-10-13-usdt-trc20-e2e-checklist.md`

**Interfaces:**
- Consumes: everything; flips a single config value for the E2E run, then flips back to `"mainnet"` for delivery.

- [ ] **Step 1:** Confirm the Nile USDT contract address (TronGrid token search for "Tether USD" on nile, or Nile USDT docs); pin it in `NILE_USDT_CONTRACT`.
- [ ] **Step 2:** Write the E2E checklist doc: connect via Binance Web3 Wallet QR → balances match app → send 0.000001 USDT to a self-owned second address on Nile → popup shows decoded recipient+amount → lands on TronScan → error paths (reject in wallet, amount over balance, pasted `0x` address).
- [ ] **Step 3:** Run checklist with you (mainnet step: one 1 USDT self-send after Nile passes); fix anything it catches as a follow-up commit.
- [ ] **Step 4:** Set `NETWORK` back to `"mainnet"`; run `npx vitest run` + `npm run build`; commit: `chore: nile testnet config and e2e checklist`.

## Self-review notes (resolved during writing)

- Spec FR1–FR6 map to Tasks 2/3, 3, 7, 7, 6+7, 8 respectively.
- `tronweb` dependency is install-gated only (Task 1 peer-dep check) — app code is REST + `bs58check` per Architecture, avoiding tronweb API drift.
- Review Focus item 4's mapping logic gets unit coverage via `broadcastTx` result handling tested through `sendUsdtTransfer` stubs (Task 6) plus the manual path in Task 7.
