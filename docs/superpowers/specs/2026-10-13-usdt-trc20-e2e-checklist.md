# E2E Checklist: USDT TRC-20 Transfer

Manual end-to-end verification of the transfer dApp against the live wallet
and network. Run **Nile steps first** (config is `NETWORK: "nile"`, contract
`TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf`), then the mainnet step only after the
Nile pass.

**Prereqs:** `npm run dev`; Binance Web3 Wallet installed; test wallet funded
with a small USDT balance (Nile USDT from a faucet for steps 1–4; real USDT
for step 5).

---

## Nile (testnet)

### 1. Connect

- [ ] Enter destination address `T...` (connect view placeholder is `T...`,
      label `Destination address (TRC-20)`).
- [ ] Button reads `Connect with Binance Web3 Wallet`; clicking renders the
      QR and the text `Scan with Binance Web3 Wallet` +
      `Waiting for wallet scan…`.
- [ ] Scan the QR in Binance Web3 Wallet and approve the session.
- [ ] Dashboard appears showing the connected address.

### 2. Balances match wallet

- [ ] USDT and TRX balances on the dashboard match the values shown in the
      Binance Web3 Wallet for the same account (6-decimal USDT).
- [ ] Activity section lists recent transfers for the address (or
      `Failed to load activity` only if TronGrid is actually down — note it).

### 3. Transfer: send 0.000001 USDT to self

- [ ] Destination field is pre-filled with the connected address; keep it
      (self-send) and leave/enter amount `0.000001`.
- [ ] Send → wallet popup in Binance app shows the transfer; sign it.
- [ ] Success state shows `Sent!` with a link to the transaction on
      TronScan; balances/activity refresh after success.
- [ ] Verify in the wallet that the USDT balance decreased by exactly
      `0.000001` (+ any network fee paid in TRX).

### 4. Error paths (Nile)

- [ ] **Rejected:** Send, then reject in the wallet → status shows
      `You rejected the transaction in your wallet`.
- [ ] **Over balance:** Amount greater than the USDT balance → `Amount
      exceeds balance` before any wallet popup.
- [ ] **Invalid address:** Paste an `0x…` EVM address into the destination
      field → `Enter a valid TRON address (T...)` (inline hint on the field
      and/or blocked before send).
- [ ] **Empty amount:** Send with amount empty → `Enter a USDT amount`.
- [ ] **Network failure:** With TronGrid unreachable (e.g. devtools offline
      mode), refresh or send → error state via `#status.error` with a
      TronGrid/`Transaction failed` message; the app must not hang or show a
      false success.

---

## Mainnet

### 5. Send 1 USDT to self

- [ ] Switch `src/config.ts` `NETWORK` to `"mainnet"` and rebuild.
- [ ] Connect the wallet that holds ≥ 1 USDT + TRX for the fee.
- [ ] Balances match the wallet.
- [ ] Send `1` USDT to the connected address; sign in the wallet.
- [ ] `Sent!` status with a TronScan mainnet link; wallet balance decreases
      by exactly `1` USDT; transaction confirmed on
      `https://tronscan.org/#/transaction/<txId>`.
- [ ] Restore `NETWORK` to `"nile"` when done (repo default for this
      branch).

### 6. Disconnect / reload

- [ ] Disconnect the wallet (or kill the session in the wallet app) →
      connect view returns with the notice `Wallet disconnected`; never a
      stuck dashboard.
- [ ] Reload the page after disconnect → lands on the connect view; QR can
      be regenerated and a new session established.

---

## Pass criteria

All boxes checked, or failures recorded with the exact status text observed
and the network condition that produced them. Config must be committed back
with `NETWORK: "nile"` on this branch.
