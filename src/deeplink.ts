import type { TronTxJson } from "./wallet";

export function buildTrustWalletDeepLink(tx: TronTxJson, redirectUrl: string): string {
  const data = btoa(JSON.stringify(tx));
  const params = new URLSearchParams({ data, redirect_url: redirectUrl });
  return `https://link.trustwallet.com/sign?${params.toString()}`;
}
