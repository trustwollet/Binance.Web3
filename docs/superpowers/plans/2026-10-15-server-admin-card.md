# Server/Admin Card on Dashboard

Date: 2026-10-15. Status: approved.

## Goal
From the main dashboard (`http://localhost:5173`), show a collapsible server/admin card: backend reachability, hot-wallet TRX + USDT (orange warning when `lowTrx`), paused/rate-limit state, last 5 log entries, and a confirm-guarded "Unlock controls" section (Pause / Rate-limit / Clear log).

## Decisions
- 1 hot wallet (TRX + USDT) only.
- UI-confirm-only guard (`window.confirm`); no server auth change.
- Card sits at bottom of dashboard, below Activity, before `#disconnect-btn`.
- Auto-poll every `POLL_MS = 12000`.
- Extend `GET /api/admin/status` (no new endpoint), stays unauthenticated; never display `apiKey`.
- Module-level singleton interval + module-level `unlocked`/`collapsed` state (because `render()` replaces `app.innerHTML`).
- Out of scope: multi-wallet registry, server auth, admin page changes.

## API
Status response gains:
```json
"wallet": { "address": "...", "trxSun": 123, "usdtRaw": "100000000", "lowTrx": false, "checkedAt": 1690000000000 }
```
or `"wallet": { "error": "..." }` on failure. `lowTrx = trxSun < CONFIG.MIN_HOT_TRX_SUN`.

Controls (existing): `POST /api/admin/pause {paused}`, `POST /api/admin/ratelimit {enabled}`, `POST /api/admin/clear-log` (empty).

## Tasks
- **T1** `server/app.mjs`: add `describeWallet(tronWeb)` (getBalance + `constantUint` USDT balanceOf), wire into status handler at :367-376. Tests in `tests/server.test.mjs` with mocked tronWeb (`{ trx: { getBalance }, transactionBuilder: { triggerConstantContract } }`), error path (`tronWeb: null`) keeps 200 + `wallet.error`, lowTrx case.
- **T2** `src/backend.ts`: `fetchAdminStatus(fetchImpl = fetch): Promise<AdminStatus | null>` + `AdminStatus`/`AdminWallet` types. Tests with `fetchImpl` mock (ok / !ok / throw).
- **T3** new `src/ui/serverCard.ts`: `renderServerCard(container)`, `startServerCard()`, `stopServerCard()`, `POLL_MS = 12000`; null-guarded repaint, unlock via `window.confirm`, control buttons POST then repaint, collapse toggles `#server-card-body`.
- **T4** `src/ui/dashboard.ts`: insert `<section id="server-card" class="server-card"></section>` after activity `</ul>`, call `renderServerCard` + `startServerCard` at end; `src/main.ts` `goConnect()` :37 calls `stopServerCard()`; `src/styles.css` card styles.
- **T5** `tests/serverCard.test.ts` (jsdom): render values, lowTrx warn, unlock true/false, 12s poll fires once, stop halts, double-start idempotent, wallet error path.
- **T6** Verify: `npm run typecheck && npx vitest run` (baseline 116 green).

## Execution order
T1 → T2 → T3 → T4 → T5 → T6.
