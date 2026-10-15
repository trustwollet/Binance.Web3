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
