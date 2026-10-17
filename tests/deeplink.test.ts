import { describe, expect, it } from "vitest";
import { buildTrustWalletDeepLink } from "../src/deeplink";

describe("buildTrustWalletDeepLink", () => {
  it("builds a TrustWallet sign URL with encoded tx and redirect", () => {
    const tx = { raw_data: { contract: [] } } as any;
    const url = buildTrustWalletDeepLink(tx, "https://example.com/cb");
    expect(url).toContain("https://link.trustwallet.com/sign?");
    expect(url).toContain("data=");
    expect(url).toContain("redirect_url=");
  });

  it("round-trips the transaction through base64", () => {
    const tx = {
      raw_data: { contract: [{ parameter: { value: { owner_address: "0x123" } } }] },
    } as any;
    const url = buildTrustWalletDeepLink(tx, "https://example.com/cb");
    const data = new URL(url).searchParams.get("data");
    expect(data).toBeTruthy();
    expect(JSON.parse(atob(data!))).toHaveProperty("raw_data");
  });

  it("preserves a redirect URL containing query parameters", () => {
    const url = buildTrustWalletDeepLink({} as any, "https://example.com/cb?a=1&b=2");
    expect(new URL(url).searchParams.get("redirect_url")).toBe(
      "https://example.com/cb?a=1&b=2",
    );
  });
});
