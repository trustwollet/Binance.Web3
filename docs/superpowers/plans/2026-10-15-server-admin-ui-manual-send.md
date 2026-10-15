# Server Admin UI + Manual-Only USDT Send Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve an admin/control page from the Node backend (health, rate-limit config, API key copy, transfer log with clear, pause-transfers and rate-limit toggles), let $0-balance wallets connect without error, and add a red "Send all USDT" dashboard button so USDT transfers only ever start on explicit user click.

**Architecture:** The existing dependency-free Node HTTP server (`server/app.mjs`, bound to `127.0.0.1` only) gains in-memory closure state (`transferLog`, `paused`, `rateLimitOn`), four admin endpoints plus a self-contained `GET /` HTML page (inline CSS/JS, no build step). On the frontend, the auto-send call inside `startConnect` (`src/main.ts:268`) is deleted and replaced by a red Send button on the dashboard that runs the existing approve-then-send chain behind the `src/guards.ts` double-click guard.

**Tech Stack:** Node 24 `node:http` (no frameworks), vanilla TS + Vite, vitest (jsdom for dashboard tests), existing `tronweb` for tests only.

**Spec:** This plan (design approved interactively; supersedes nothing).

## Global Constraints

- **No git commits** — repo ruling: BASE stays `100f1f6981828a91be0a174f048be0ec7c18ef63`; verification is the test suite, not commits. All "Commit" steps from the standard skill template are replaced by a "Run full suite" step.
- TDD strictly: write failing test, watch it FAIL, implement, watch it PASS. Never batch RED and GREEN.
- Every task verifies with `bash -c "npm run typecheck && npx vitest run"` (use `& "C:\Program Files\Git\bin\bash.exe" "<cmd>"` from PowerShell); final task also runs `npm run build` and the boot smoke.
- Server binds `127.0.0.1` only (`server/index.mjs:20`); admin endpoints are unauthenticated by design (ledger-ruled) and must never expose `TRONGRID_API_KEY`.
- API key string `"hotwallet-dev-key"` is shared between `src/config.ts` and `server/config.mjs` — never hardcode it in tests, always read `CONFIG.API_KEY`.
- Do not touch `patches/` or the WalletConnect `overrides` in `package.json`.
- Ignore the pre-existing `npm run build` chunk-size warning (>500 kB).
- Preserve: `src/guards.ts` semantics, zero-balance error strings (`"No USDT balance to send"` client, `ZERO_BALANCE` server), rate limit `10 req/60s/IP` on POST /api/transfer.
- UI copy: neutral product title "Binance Web3"; button label exactly `Send all USDT`; page title `Hot Wallet Admin`.

## Review Focus

1. **Pause toggle must reject transfers, not just hide them** — while `paused`, `POST /api/transfer` returns `503 TRANSFERS_PAUSED` before any processing, and the admin page shows the paused state after reload. Owned by Task 1 tests.
2. **Transfer log must capture every authenticated outcome and never grow unbounded** — entries appended for terminal results (broadcast success/failure and error codes), cap exactly 100 (oldest dropped), 401/429 not logged, `GET /api/admin/status` log readable by the page. Owned by Task 1 tests.
3. **Zero-balance connect must produce no error and no transfer attempt** — after removing the auto-send, connecting (simulated by source inspection) must not call `runApproveThenSend` from `startConnect`, and clicking Send with 0 balance still surfaces `"No USDT balance to send"` at click time. Owned by Task 3 (source-scoped test) and existing `runApproveThenSend` zero-balance branch.
4. **Double-click / re-entry while pending** — the Send button is disabled while `approveStatus === "pending"` or `transferStatus === "pending"`, and the click handler starts with `beginRetryTransfer(state)` (sync pending set). A second click before the first completes must not start a second transfer. Owned by Task 4 tests.
5. **Admin page leaks** — `GET /` HTML and `GET /api/admin/status` must include the public API key but must not contain `TRONGRID_API_KEY`'s value or the hot-wallet private key. Owned by Task 2 tests.

---

### Task 1: Server transfer log + admin status/clear/pause/rate-limit endpoints

**Files:**
- Modify: `server/app.mjs` (closure state, logging inside the POST /api/transfer outcome paths, four new routes)
- Test: `tests/server.test.mjs` (new `describe` block with its own server instance)

**Interfaces:**
- Consumes: existing `send(res, status, body)` helper, `verifyWallet`, `CONFIG`, `rateLimited()` in `server/app.mjs`.
- Produces (for Task 2's HTML page and tests):
  - `GET /api/admin/status` → `200` JSON `{ ok: true, network, paused: boolean, rateLimitOn: boolean, apiKey: string, log: Array<{ ts: number, owner: string, result: string, detail: string, amount: number|null }> }`
  - `POST /api/admin/clear-log` → `200 { ok: true }` (empties log)
  - `POST /api/admin/pause` body `{ paused: boolean }` → `200 { ok: true, paused }`
  - `POST /api/admin/ratelimit` body `{ enabled: boolean }` → `200 { ok: true, rateLimitOn }`
  - While paused: `POST /api/transfer` (after API-key auth) → `503 { ok:false, code:"TRANSFERS_PAUSED", error:"Transfers are paused" }`, logged with result `"TRANSFERS_PAUSED"`.
  - `rateLimitOn === false` skips the rate-limit check for `POST /api/transfer` only.
  - Log entries appended for every authenticated terminal transfer outcome (`BAD_REQUEST`, `INVALID_OWNER`, `ZERO_BALANCE`, `APPROVE_REQUIRED`, `HOT_WALLET_LOW_TRX`, `BROADCAST_FAILED`, `UPSTREAM_ERROR`, broadcast success) — NOT for `401 UNAUTHORIZED` or `429`; `shift()` when length would exceed 100.

- [x] **Step 1: Write failing tests** — in `tests/server.test.mjs`, add `describe("admin endpoints", ...)` that creates its **own** server: `const adminServer = createServer(createHandler({ tronWeb: null }))`, `beforeAll` listen on port 0 / `127.0.0.1`, `afterAll` close. Tests:
  - `GET /api/admin/status` → 200, `body.ok === true`, `body.paused === false`, `body.rateLimitOn === true`, `body.apiKey === CONFIG.API_KEY`, `Array.isArray(body.log) && body.log.length === 0`, and `JSON.stringify(body)` does **not** contain `CONFIG.TRONGRID_API_KEY`.
  - `POST /api/admin/pause` `{paused:true}` → `{ok:true,paused:true}`; then `POST /api/transfer` with valid `x-api-key` and a valid owner body → `503` `code === "TRANSFERS_PAUSED"`; then `POST /api/admin/pause` `{paused:false}` → subsequent status shows `paused:false`.
  - `POST /api/admin/clear-log` → `{ok:true}`; status log empty.
  - `POST /api/admin/ratelimit` `{enabled:false}` → `{ok:true,rateLimitOn:false}`; status reflects it; `{enabled:true}` restores.
  - `GET /api/health` (no auth) still 200 (admin routes don't shadow it).
- [x] **Step 2: Run** `bash -c "npx vitest run tests/server.test.mjs"` — expect FAIL (404 on admin routes).
- [x] **Step 3: Implement in `server/app.mjs`**: add closure state `const transferLog = []; let paused = false; let rateLimitOn = true;` inside `createHandler`. Add `recordLog(owner, result, detail, amount)` helper (push `{ts: Date.now(), owner, result, detail, amount}`, `if (transferLog.length > 100) transferLog.shift()`). In the `POST /api/transfer` branch: after auth, `if (paused) { recordLog(...); return send(res, 503, {ok:false, code:"TRANSFERS_PAUSED", error:"Transfers are paused"}); }`; gate `rateLimited()` on `rateLimitOn`; call `recordLog` at each terminal outcome with the result code/`"BROADCAST_OK"` and detail message and amount (or null). Add the four admin routes before the 404 fallback, each answering via `send()`; admin routes bypass `rateLimited()` and auth.
- [x] **Step 4: Run** `bash -c "npm run typecheck && npx vitest run"` — expect all PASS (baseline 101 + new admin tests).
- [x] **Step 5: Run full suite gate:** `& "C:\Program Files\Git\bin\bash.exe" -c "npm run typecheck && npx vitest run"` — all green.

### Task 2: `GET /` admin HTML page

**Files:**
- Modify: `server/app.mjs` (new `GET /` route returning HTML)
- Test: `tests/server.test.mjs` (extend the Task 1 admin describe)

**Interfaces:**
- Consumes: `GET /api/admin/status` JSON shape from Task 1; `CONFIG.API_KEY`.
- Produces: `GET /` → `200 text/html` page titled `Hot Wallet Admin` containing markers: `Hot Wallet Admin`, `Copy API key`, `Clear log`, `Pause transfers`, `Rate limit`, `api/admin/status`, `api/admin/clear-log`, `api/admin/pause`, `api/admin/ratelimit`, and the value of `CONFIG.API_KEY` (rendered so the Copy button can copy it).

- [x] **Step 1: Write failing tests** (same admin describe): `GET /` → status 200, `content-type` includes `text/html`, body contains every marker above and `CONFIG.API_KEY`; body does **not** contain `CONFIG.TRONGRID_API_KEY` (read its value in the test from `server/config.mjs`).
- [x] **Step 2: Run** `bash -c "npx vitest run tests/server.test.mjs"` — expect FAIL (404).
- [x] **Step 3: Implement in `server/app.mjs`**: route `GET /` before 404; `send(res, 200, html)` with `send` setting JSON content-type — check `send`'s implementation and, if it hardcodes JSON content-type, send the HTML via `res.writeHead(200, {"content-type": "text/html; charset=utf-8", ...CORS_HEADERS}); res.end(html)` instead. Page is one inline `<style>` + `<script>`: on load `fetch("/api/admin/status")`, render paused/rate-limit state as two toggle buttons, API key row with `navigator.clipboard.writeText` Copy button, log table (ts/result/owner/detail/amount, newest first, cap display at 20), and Clear log / Pause / Rate-limit buttons POSTing the admin endpoints then re-fetching status. No external resources.
- [x] **Step 4: Run** `bash -c "npm run typecheck && npx vitest run"` — all PASS.

### Task 3: Remove auto-send on connect

**Files:**
- Modify: `src/main.ts:268` (delete the `runApproveThenSend` call)
- Test: `tests/main.source.test.ts` (new file — source-scoped test; `src/main.ts` has module side effects and cannot be imported)

**Interfaces:**
- Consumes: none.
- Produces: `startConnect` no longer starts a transfer; the dashboard renders idle after connect. `runApproveThenSend`, retry handlers, and zero-balance logic untouched.

- [x] **Step 1: Write failing test** in `tests/main.source.test.ts`:
  ```ts
  import { readFileSync } from "node:fs";
  import { describe, expect, it } from "vitest";
  const src = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  describe("startConnect never auto-sends", () => {
    it("startConnect body contains no runApproveThenSend invocation", () => {
      const start = src.indexOf("async function startConnect");
      const body = src.slice(start, src.indexOf("\nrender();", start));
      expect(start).toBeGreaterThan(-1);
      expect(body).not.toMatch(/runApproveThenSend\s*\(/);
    });
  });
  ```
- [x] **Step 2: Run** `bash -c "npx vitest run tests/main.source.test.ts"` — expect FAIL (line 268 still calls it).
- [x] **Step 3: Delete line 268** (`void runApproveThenSend(session, transferGeneration);`) in `src/main.ts`. Leave the surrounding state-reset block (259–267) and `render()` intact.
- [x] **Step 4: Run** `bash -c "npm run typecheck && npx vitest run"` — all PASS.

### Task 4: Red "Send all USDT" button

**Files:**
- Modify: `src/ui/dashboard.ts` (`DashboardViewOpts` + render + click wiring), `src/main.ts` (pass `onSend`), `src/styles.css` (`.send-all-btn`)
- Test: `tests/dashboard.test.ts`

**Interfaces:**
- Consumes: `beginRetryTransfer(state)` from `src/guards.ts` (returns false when a transfer/approve is pending; otherwise sync-sets `transferStatus="pending"`, clears `transferError`/`transferTxId`), `runApproveThenSend(session, transferGeneration)` in `src/main.ts`.
- Produces: `DashboardViewOpts` gains **required** `onSend: () => void` (breaking change — update `baseOpts` in `tests/dashboard.test.ts:18`). Button markup: `<button id="send-all-btn" type="button" class="send-all-btn" [disabled]>Send all USDT</button>` placed between `#status` div and `.section-header` in the dashboard template.

- [x] **Step 1: Write failing tests** in `tests/dashboard.test.ts`:
  - Update `baseOpts` to include `onSend: () => {}`.
  - New `describe("send all USDT button")`:
    1. renders `#send-all-btn` with text `Send all USDT`; clicking fires `onSend` once.
    2. with `transferStatus: "pending"` the button has `disabled === true`; with `approveStatus: "pending"` also disabled; with both null, enabled.
  - Run `bash -c "npx vitest run tests/dashboard.test.ts"` — expect FAIL (button missing / type error on baseOpts).
- [x] **Step 2: Implement in `src/ui/dashboard.ts`**: add `onSend: () => void` to `DashboardViewOpts`; insert the button into the template (disabled when `opts.transferStatus === "pending" || opts.approveStatus === "pending"`); after `#disconnect-btn` wiring, `document.querySelector<HTMLButtonElement>("#send-all-btn")?.addEventListener("click", () => opts.onSend())`.
- [x] **Step 3: Implement in `src/main.ts`** — add to the `renderDashboardView({...})` call:
  ```ts
  onSend: () => {
    if (state.view !== "dashboard" || !state.session) return;
    if (!beginRetryTransfer(state)) return;
    render();
    void runApproveThenSend(state.session, transferGeneration);
  },
  ```
- [x] **Step 4: Implement CSS in `src/styles.css`** (near `.retry-btn` at line 423): `.send-all-btn { background: #dc2626; color: #fff; ... }` `.send-all-btn:hover { background: #b91c1c; }` `.send-all-btn:disabled { opacity: 0.6; cursor: not-allowed; }` — mirror `.retry-btn`'s sizing/padding.
- [x] **Step 5: Run** `bash -c "npm run typecheck && npx vitest run"` — all PASS.

### Task 5: Final verification

**Files:** none (verification only)

- [x] **Step 1:** `& "C:\Program Files\Git\bin\bash.exe" -c "npm run typecheck && npx vitest run"` — expect all PASS (101 baseline + new admin/source/dashboard tests), zero failures.
- [x] **Step 2:** `npm run build` — succeeds (chunk-size warning pre-existing, ignore).
- [x] **Step 3: Boot smoke:** `Start-Process node server/index.mjs -PassThru -WindowStyle Hidden; Start-Sleep 2; (Invoke-WebRequest http://127.0.0.1:8787/api/health).StatusCode; (Invoke-WebRequest http://127.0.0.1:8787/).StatusCode; Stop-Process -Id <pid>` — expect `200` and `200`.
- [x] **Step 4:** Stop and report: task list, test counts before/after, no commits made.
