import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/ui/connect.ts", import.meta.url), "utf8");

describe("Connect Wallet heading", () => {
  it("renders 'Connect Wallet' as the receive page heading instead of 'Receive'", () => {
    const body = source.slice(source.indexOf("function renderReceivePage"));
    expect(body).toMatch(/<h1 class="receive-title">Connect Wallet<\/h1>/);
  });
});

describe("Copy Link button", () => {
  it("renders a Copy Link button in the receive actions row", () => {
    const body = source.slice(source.indexOf("function renderReceivePage"));
    expect(body).toMatch(/#copy-qr-btn/);
    expect(body).toMatch(/Copy Link/);
  });

  it("copies the QR uri to the clipboard and shows a toast", () => {
    const body = source.slice(source.indexOf("function wireQrActions"));
    expect(body).toMatch(/copy-qr-btn/);
    expect(body).toMatch(/clipboard\.writeText\(opts\.qrUri\)/);
    expect(body).toMatch(/Link copied/);
  });
});
