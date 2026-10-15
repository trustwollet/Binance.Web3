# TRX Fee Requirements & Pre-Transfer Fee Check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the hot-wallet address and true TRX fee requirements on the dashboard server card, and hard-block USDT transfers whenever the hot wallet cannot cover real network fees — never treating balance ≥ 1.00 TRX as sufficient by itself.

**Architecture:** The backend gains a best-effort `estimateTransferFeeSun()` helper (energy used × energy price + 0.1 TRX bandwidth headroom) used both by `/admin/status` (display) and the `hotwallet-transfer` guard (enforcement, `requiredSun = max(MIN_HOT_TRX_SUN, fee)`). The card renders address/copy, minimum, and fee rows with three banner states; `autoSendAll` does a status pre-check so users get an explanation before any backend call, with the backend gate remaining authoritative.

**Tech Stack:** Node ESM backend (`server/app.mjs`), vanilla-TS frontend (`src/`), vitest (jsdom for UI, node for server), TypeScript.

**Spec:** Approved design captured in session summary (user spec: address + balance + requirements display; fee estimation not just the 1.00 TRX floor; replenish = address + copy + manual prompt only; pre-transfer check blocks with explanation).

## Global Constraints

- Never treat balance ≥ `MIN_HOT_TRX_SUN` (1_000_000 sun) alone as sufficient when a fee estimate is available; `requiredSun = max(CONFIG.MIN_HOT_TRX_SUN, feeEstimateSun)`.
- Fee estimate failure must never break the API: `/admin/status` stays 200 with `feeEstimateSun: null`; the transfer guard falls back to the 1_000_000-sun floor.
- Replenish UX = display address + copy button + manual prompt ONLY — no in-dashboard send-TRX button, no new send/top-up endpoint.
- Never display `API_KEY`/`TRONGRID_API_KEY`.
- Preserve `src/guards.ts`, `ZERO_BALANCE` / `"No USDT balance to send"`, `Hot Wallet Admin` copy, `Send all USDT` button.
- **Do not commit** — user commits only on explicit request; no commit steps.
- Baseline must stay green: `& "C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/Harshit/Desktop/Binance.Web3 && npm run typecheck && npx vitest run"` (13 files / 143 tests before this feature).
- Harness: Windows/PowerShell 5.1, node v24.16.0, vitest 5.0.4; no `rg` — use `grep`/`glob` tools, `edit` for UTF-8 files.

## Review Focus

1. **Estimate RPC failure during status** → 200, `feeEstimateSun: null`, card shows "Fee estimate unavailable" with no green claim. Pinned in Task 1 (`admin status stays 200 with feeEstimateSun null when estimate throws`) and Task 4 (`card shows unavailable fee and makes no sufficiency claim when feeEstimateSun is null`).
2. **Estimate below the 1.00 TRX floor** → `requiredSun` stays 1_000_000; no false block. Pinned in Task 1 (default mock 520_000 → `belowEstimate: false`) and Task 2 (`requires floor not fee when fee estimate is below floor`).
3. **Estimate above floor, balance ≥ 1 TRX but < fee** → 503 `HOT_WALLET_LOW_TRX` with `requiredSun` = fee; no broadcast. Pinned in Task 2 (`blocks transfer with fee-based requiredSun when balance covers floor but not fee`).
4. **Client status unreachable before send** → `requestBackendTransfer` still called (backend gate protects). Pinned in Task 5 (`proceeds to backend transfer when admin status fetch fails`).
5. **Status returns `wallet: {error}`** → proceed to backend transfer, no client-side block. Pinned in Task 5 (`proceeds to backend transfer when wallet field is an error object`).

---

### Task 1: Backend fee estimator + status fields

**Files:**
- Modify: `server/app.mjs` (new helper near `constantUint` ~line 203; `describeWallet` ~line 216; admin-status wallet assembly)
- Test: `tests/server.test.mjs` (`mockTronWeb` ~line 268, wallet `toEqual` test ~line 287)

**Interfaces:**
- Consumes: `CONFIG.MIN_HOT_TRX_SUN`, `CONFIG.HOT_WALLET_ADDRESS`, `CONFIG.USDT_CONTRACT`, `CONFIG.DEFAULT_DEST`, the existing `tronWeb` instance.
- Produces (relied on by Tasks 2, 4):
  - `async function estimateTransferFeeSun(tronWeb, owner: string, dest: string, amountBaseUnits: string): Promise<number | null>`
  - `describeWallet` result gains: `minSun: number`, `feeEstimateSun: number | null`, `feeEstimateAt: number | null`, `belowEstimate: boolean` (existing `address, trxSun, usdtRaw, lowTrx, checkedAt` unchanged).

- [ ] **Step 1: Write the failing tests** in `tests/server.test.mjs`, `describe("admin status wallet")`:

```js
it("includes fee estimate fields", async () => {
  const body = await status();
  expect(body.wallet).toMatchObject({
    minSun: 1_000_000, feeEstimateSun: 520_000, belowEstimate: false,
  });
  expect(typeof body.wallet.feeEstimateAt).toBe("number");
});
it("flags belowEstimate when balance is under the estimated fee", async () => {
  // mock energy_used = 12_000 → 12_000 × 420 + 100_000 = 5_140_000 > balance 5_000_000
  const body = await status({ energyUsed: 12_000 });
  expect(body.wallet).toMatchObject({ feeEstimateSun: 5_140_000, belowEstimate: true });
});
it("stays 200 with feeEstimateSun null when estimate throws", async () => {
  const body = await status({ estimateFails: true });
  expect(body.ok).toBe(true);
  expect(body.wallet).toMatchObject({ feeEstimateSun: null, feeEstimateAt: null, belowEstimate: false });
});
```

Also update the existing `toEqual` wallet assertion to include the four new fields.

- [ ] **Step 2: Run tests to verify they fail**

Run: `& "C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/Harshit/Desktop/Binance.Web3 && npx vitest run tests/server.test.mjs"`
Expected: FAIL (new fields missing; existing wallet `toEqual` also FAIL).

- [ ] **Step 3: Extend `mockTronWeb`** (`tests/server.test.mjs:268`) with options `{ energyUsed = 1_000, estimateFails = false }`:
  - `trx.getChainParameters: async () => ({ chainParameter: [{ key: "EnergyPrice", value: 420 }] })`
  - `transactionBuilder.triggerConstantContract(contract, selector, {}, params, issuer)` branching on selector: `balanceOf` → `{ constant_result: [usdtHex] }` (existing behavior); `transferFrom(address,address,uint256)` → throws when `estimateFails`, else `{ energy_used: energyUsed, constant_result: ["01"] }`.

- [ ] **Step 4: Implement `estimateTransferFeeSun(tronWeb, owner, dest, amountBaseUnits)`** in `server/app.mjs`:

```js
async function estimateTransferFeeSun(tronWeb, owner, dest, amountBaseUnits) {
  try {
    const r = await tronWeb.transactionBuilder.triggerConstantContract(
      CONFIG.USDT_CONTRACT, "transferFrom(address,address,uint256)",
      {}, [owner, dest, amountBaseUnits], owner);
    const energy = Number(r?.energy_used ?? 0);
    if (!Number.isFinite(energy) || energy <= 0) return null;
    let price = 420;
    const chain = await tronWeb.trx.getChainParameters();
    const hit = (chain?.chainParameter ?? []).find(p => String(p.key).toLowerCase() === "energyprice");
    if (hit && Number.isFinite(Number(hit.value)) && Number(hit.value) > 0) price = Number(hit.value);
    return Math.round(energy * price) + 100_000; // 0.1 TRX bandwidth headroom
  } catch { return null; }
}
```

- [ ] **Step 5: Wire status**: in the admin-status wallet path call `const feeSun = await estimateTransferFeeSun(tronWeb, CONFIG.HOT_WALLET_ADDRESS, CONFIG.DEFAULT_DEST, "1")`, then add to the wallet payload:
  - `minSun: CONFIG.MIN_HOT_TRX_SUN`
  - `feeEstimateSun: feeSun`, `feeEstimateAt: feeSun === null ? null : Date.now()`
  - `belowEstimate: feeSun !== null && trxSun < Math.max(CONFIG.MIN_HOT_TRX_SUN, feeSun)`
  - keep `lowTrx` unchanged; status stays 200 regardless.

- [ ] **Step 6: Run tests to verify they pass** — same vitest command. Expected: PASS (all `admin status wallet` tests, baseline green).

---

### Task 2: Transfer gate uses the estimate

**Files:**
- Modify: `server/app.mjs:308-314` (replace existing low-TRX guard) inside `handleTransfer` (line 237)
- Test: `tests/server.test.mjs` (`transfer()` helper at line 112)

**Interfaces:**
- Consumes: `estimateTransferFeeSun(tronWeb, owner, dest, amountSun)` from Task 1; existing error helper used by the current guard.
- Produces error payload shape (Task 3 types it): HTTP 503, `{ code: "HOT_WALLET_LOW_TRX", hotTrxSun: string, requiredSun: string, feeEstimateSun: string | null, replenish: string }` — sun values stringified except null.

- [ ] **Step 1: Write failing tests** in `tests/server.test.mjs`:

```js
it("blocks transfer with fee-based requiredSun when balance covers floor but not fee", async () => {
  // energy_used 12_000 → fee 5_140_000 > balance 5_000_000
  const res = await transfer({ energyUsed: 12_000 });
  expect(res.status).toBe(503);
  expect(res.body).toMatchObject({
    code: "HOT_WALLET_LOW_TRX", requiredSun: "5140000", feeEstimateSun: "5140000",
    replenish: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
  });
  expect(mockTronWeb.sendRawTransaction).not.toHaveBeenCalled();
});
it("requires floor not fee when fee estimate is below floor", async () => {
  // balance 400_000, default fee 520_000 → requiredSun = 1_000_000
  const res = await transfer({ balanceSun: 400_000 });
  expect(res.status).toBe(503);
  expect(res.body).toMatchObject({ requiredSun: "1000000", feeEstimateSun: "520000" });
});
it("falls back to floor when estimate fails", async () => {
  const res = await transfer({ balanceSun: 500_000, estimateFails: true });
  expect(res.status).toBe(503);
  expect(res.body).toMatchObject({ requiredSun: "1000000", feeEstimateSun: null });
});
```

(Adjust `transfer()` helper to accept the mock option bag and return `{ status, body }`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `... npx vitest run tests/server.test.mjs` → expected FAIL (`requiredSun` still `"1000000"` in test 1).

- [ ] **Step 3: Replace guard at `server/app.mjs:308-314`** with:

```js
const feeSun = await estimateTransferFeeSun(tronWeb, owner, dest, amountSun);
const requiredSun = feeSun === null ? CONFIG.MIN_HOT_TRX_SUN
  : Math.max(CONFIG.MIN_HOT_TRX_SUN, feeSun);
if (trxSun < requiredSun) {
  return fail(503, "HOT_WALLET_LOW_TRX", {
    hotTrxSun: String(trxSun), requiredSun: String(requiredSun),
    feeEstimateSun: feeSun === null ? null : String(feeSun),
    replenish: CONFIG.HOT_WALLET_ADDRESS,
  });
}
```

(Use the file's existing error helper; keep paused/rate-limit guards above it; never broadcast on this path.)

- [ ] **Step 4: Run tests to verify they pass** — same command, PASS.

---

### Task 3: Frontend backend contract types + messages

**Files:**
- Modify: `src/backend.ts:9` (`CODE_MESSAGES.HOT_WALLET_LOW_TRX`), `AdminWalletOk` type
- Test: `tests/backend.test.ts:45` (existing message test)

**Interfaces:**
- Consumes: Task 2 payload shape.
- Produces: `AdminWalletOk` gains `minSun: number; feeEstimateSun: number | null; feeEstimateAt: number | null; belowEstimate: boolean` (Tasks 4, 5 rely on this).

- [ ] **Step 1: Failing test** in `tests/backend.test.ts` — update existing `HOT_WALLET_LOW_TRX` assertion to the new exact message:

```ts
expect(CODE_MESSAGES.HOT_WALLET_LOW_TRX).toBe(
  "Hot wallet does not have enough TRX for network fees — send TRX to the address shown on the dashboard, then retry");
```

- [ ] **Step 2: Run to verify FAIL**: `... npx vitest run tests/backend.test.ts`

- [ ] **Step 3: Implement** — update `CODE_MESSAGES.HOT_WALLET_LOW_TRX` (line 9) to that exact string; extend `AdminWalletOk` with the four fields.

- [ ] **Step 4: Run to verify PASS** — same command; then `npm run typecheck`.

---

### Task 4: Server card — address, requirements, banners

**Files:**
- Modify: `src/ui/serverCard.ts` (`walletHtml` line 52, click handler registration), `src/styles.css`
- Test: `tests/serverCard.test.ts` (conventions: `// @vitest-environment jsdom`, `okStatus()`, `bodyText()`, `flush()`)

**Interfaces:**
- Consumes: `AdminWalletOk` from Task 3; `CONFIG.HOT_WALLET_ADDRESS` (`src/config.ts:24`), `formatSun`, `esc`, existing banner CSS patterns.
- Produces: DOM id `#copy-hot-wallet-btn`, new rows/banners consumed by `flush()`-based assertions.

- [ ] **Step 1: Failing tests** in `tests/serverCard.test.ts` (extend `okStatus` with `minSun: 1_000_000, feeEstimateSun: 520_000, feeEstimateAt: 1, belowEstimate: false` defaults):

```ts
it("renders full hot wallet address with copy button that writes the address", async () => {
  // click #copy-hot-wallet-btn → expect(navigator.clipboard.writeText).toHaveBeenCalledWith("TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX")
});
it("shows minimum required and estimated fee rows", async () => {
  expect(bodyText()).toContain("Minimum");
  expect(bodyText()).toContain("Est");
});
it("shows green sufficiency banner when fee known and wallet sufficient", async () => {
  expect(bodyText()).toContain("Meets minimum requirement");
  expect(bodyText()).toContain("not a guarantee");
});
it("shows replenish banner with address when belowEstimate", async () => {
  // okStatus({ belowEstimate: true }) → contains "Send at least" + TRX amount + full address
});
it("shows unavailable fee and makes no sufficiency claim when feeEstimateSun is null", async () => {
  // okStatus({ feeEstimateSun: null, feeEstimateAt: null, belowEstimate: false })
  // → contains "Fee estimate unavailable", NOT "Meets minimum requirement"
});
```

Mock `navigator.clipboard.writeText` with `Object.defineProperty` in beforeEach.

- [ ] **Step 2: Run to verify FAIL**: `... npx vitest run tests/serverCard.test.ts`

- [ ] **Step 3: Implement `walletHtml` changes** in `src/ui/serverCard.ts:52`:
  - Row order: **Address** (full `esc(wallet.address)` + `<button id="copy-hot-wallet-btn">Copy</button>`), **TRX**, **Minimum required** (`formatSun(wallet.minSun)`), **Est. fee** (`formatSun(wallet.feeEstimateSun)` or `unavailable`), **USDT**.
  - Banner logic:
    - `wallet.belowEstimate || wallet.lowTrx` → red/amber: `Send at least ${formatSun(required)} TRX to ${wallet.address} before sending USDT` (required = `max(minSun, feeEstimateSun ?? 0)`).
    - else `feeEstimateSun === null` → neutral: `Fee estimate unavailable — backend will re-check before transfer`.
    - else → green: `Meets minimum requirement — estimated fee is an approximation, not a guarantee`.
  - Register click handler in `startServerCard` (direct listener after render): `navigator.clipboard.writeText(CONFIG.HOT_WALLET_ADDRESS)` guarded by `navigator.clipboard?.writeText`.
  - Add banner row/label CSS classes in `src/styles.css` matching existing card styles.

- [ ] **Step 4: Run to verify PASS**: `... npx vitest run tests/serverCard.test.ts`

---

### Task 5: `autoSendAll` pre-transfer check

**Files:**
- Modify: `src/main.ts` (`autoSendAll` line 153, insert before `requestBackendTransfer` ~line 162)
- Test: `tests/main.integration.test.ts`

**Interfaces:**
- Consumes: `fetchAdminStatus(fetchImpl)` from `src/backend.ts`; `AdminWalletOk.belowEstimate/lowTrx/minSun/feeEstimateSun`; `state.transferStatus`.
- Produces: no new exports.

- [ ] **Step 1: Failing tests** in `tests/main.integration.test.ts`:

```ts
it("blocks autoSendAll with explanation when status shows wallet belowEstimate", async () => {
  // fetchAdminStatus → ok, wallet belowEstimate: true
  // expect requestBackendTransfer NOT called; state.transferStatus === "error";
  // message contains required TRX amount and full hot wallet address
});
it("proceeds to backend transfer when admin status fetch fails", async () => { /* status fetch rejects → requestBackendTransfer called */ });
it("proceeds to backend transfer when wallet field is an error object", async () => { /* wallet: { error } → called */ });
```

- [ ] **Step 2: Run to verify FAIL**: `... npx vitest run tests/main.integration.test.ts`

- [ ] **Step 3: Implement** in `autoSendAll` before the backend call, after capturing/re-checking `transferGeneration`:

```ts
const st = await fetchAdminStatus().catch(() => null);
if (st?.ok && st.wallet && "belowEstimate" in st.wallet
    && (st.wallet.belowEstimate || st.wallet.lowTrx)) {
  const needed = Math.max(st.wallet.minSun, st.wallet.feeEstimateSun ?? 0);
  state.transferStatus = "error";
  state.lastError = `Hot wallet needs ${formatSun(needed)} TRX — send TRX to ${st.wallet.address}, then retry`;
  return;
}
```

Re-check `transferGeneration` after the await; `null`/error status or `{error}` wallet falls through to `requestBackendTransfer` (backend gate in Task 2 protects).

- [ ] **Step 4: Run to verify PASS**: `... npx vitest run tests/main.integration.test.ts`

---

### Task 6: Full verification

- [ ] **Step 1: Run** `& "C:\Program Files\Git\bin\bash.exe" -c "cd /c/Users/Harshit/Desktop/Binance.Web3 && npm run typecheck && npx vitest run"`
Expected: typecheck clean; all 13 test files pass (143 baseline + new tests, zero failures).
- [ ] **Step 2: Confirm no regressions in protected copy**: grep tests/source for `ZERO_BALANCE`, `No USDT balance to send`, `Hot Wallet Admin`, `Send all USDT` — all present.
