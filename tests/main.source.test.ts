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

describe("F1: cancelConnect bumps transferGeneration", () => {
  it("cancelConnect body increments transferGeneration so a stale in-flight transfer is invalidated", () => {
    const start = src.indexOf("function cancelConnect");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nfunction ", start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/transferGeneration\s*(\+\+|\+=\s*1|=\s*transferGeneration\s*\+\s*1)/);
  });
});

describe("F3: autoSendAll surfaces retry error", () => {
  it("retry loop assigns result.error to state.transferError before the final render", () => {
    const start = src.indexOf("async function autoSendAll");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nasync function ", start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/state\.transferError\s*=\s*result\.error/);
  });

  it("catch path surfaces a non-empty message instead of only a literal fallback", () => {
    const start = src.indexOf("async function autoSendAll");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nasync function ", start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    const catchIdx = body.indexOf("} catch");
    expect(catchIdx).toBeGreaterThan(-1);
    const catchBody = body.slice(catchIdx);
    expect(catchBody).toMatch(/state\.transferError\s*=\s*(err|error|e)[\s\S]*message|\(\s*err\s*as\s*\{?\s*message/);
  });
});

describe("TrustWallet deep-link approval", () => {
  it("requestApprovalViaDeepLink builds the approve tx and opens the deep link", () => {
    const start = src.indexOf("async function requestApprovalViaDeepLink");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nasync function ", start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/buildApproveTx\s*\(/);
    expect(body).toMatch(/buildTrustWalletDeepLink\s*\(/);
    expect(body).toMatch(/location\.href\s*=/);
  });

  it("resumes from the redirect by polling then auto-sending", () => {
    const start = src.indexOf("function resumePendingApproval");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\nfunction ", start + 1);
    const body = src.slice(start, end === -1 ? undefined : end);
    expect(body).toMatch(/pollForApproval\s*\(/);
    expect(body).toMatch(/autoSendAll\s*\(/);
  });

  it("resume is invoked from render", () => {
    const start = src.indexOf("function render()");
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, start + 200);
    expect(body).toMatch(/resumePendingApproval\(\)/);
  });
});
