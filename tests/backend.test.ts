import { describe, expect, it, vi } from "vitest";
import {
  fetchAdminStatus,
  postAdminControl,
  requestBackendTransfer,
} from "../src/backend";
import { BACKEND_API_KEY, BACKEND_URL } from "../src/config";

const OWNER = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("requestBackendTransfer", () => {
  it("posts owner with api key to the backend and returns txId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { status: "broadcast", txId: "abc123" }),
    );
    const result = await requestBackendTransfer(OWNER, fetchImpl);

    expect(result).toEqual({ ok: true, txId: "abc123" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND_URL}/api/transfer`);
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(
      BACKEND_API_KEY,
    );
    expect(init.body).toBe(JSON.stringify({ owner: OWNER }));
  });

  it("maps APPROVE_REQUIRED to a friendly retry message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(403, { status: "error", code: "APPROVE_REQUIRED" }),
    );
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/Approval not visible/);
  });

  it("maps HOT_WALLET_LOW_TRX to a funding message", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(503, { status: "error", code: "HOT_WALLET_LOW_TRX" }),
    );
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result.ok === false && result.error).toBe(
      "Hot wallet does not have enough TRX for network fees — send TRX to the address shown on the dashboard, then retry",
    );
  });

  it("treats skipped ZERO_BALANCE as an error result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, { status: "skipped", reason: "ZERO_BALANCE" }),
    );
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result.ok === false && result.error).toMatch(/No USDT balance/);
  });

  it("returns a connection error when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result.ok === false && result.error).toMatch(/reach the server/);
  });

  it("maps unknown codes to a generic server error", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { status: "error" }));
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result.ok === false && result.error).toMatch(/Server error \(500\)/);
  });

  it("maps TRANSFERS_PAUSED instead of degrading to a bare status", async () => {
    // app.mjs answers a paused server with `error`, not `message`.
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(503, { ok: false, code: "TRANSFERS_PAUSED", error: "Transfers are paused" }),
    );
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result).toEqual({
      ok: false,
      error: "Transfers are paused by the admin",
      code: "TRANSFERS_PAUSED",
    });
  });

  it("falls back to the server's error text for an unmapped code", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(418, { code: "SOMETHING_NEW", error: "teapot" }),
    );
    const result = await requestBackendTransfer(OWNER, fetchImpl);
    expect(result.ok === false && result.error).toBe("teapot");
  });
});

describe("fetchAdminStatus", () => {
  it("GETs /api/admin/status and returns the parsed body", async () => {
    const body = {
      ok: true,
      network: "mainnet",
      paused: false,
      rateLimitOn: true,
      log: [],
      wallet: { error: "boom" },
    };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, body));
    const status = await fetchAdminStatus(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(`${BACKEND_URL}/api/admin/status`, {
      headers: { "x-api-key": BACKEND_API_KEY },
    });
    expect(status).toEqual(body);
  });

  it("returns null on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(503, { ok: false }));
    expect(await fetchAdminStatus(fetchImpl)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await fetchAdminStatus(fetchImpl)).toBeNull();
  });

  it("returns null when the body is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: false }));
    expect(await fetchAdminStatus(fetchImpl)).toBeNull();
  });
});

describe("postAdminControl", () => {
  it("posts the payload to the control endpoint and reports success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const ok = await postAdminControl("/api/admin/pause", { paused: true }, fetchImpl);
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BACKEND_URL}/api/admin/pause`);
    expect(init.body).toBe(JSON.stringify({ paused: true }));
  });

  it("returns false when fetch throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await postAdminControl("/api/admin/clear-log", {}, fetchImpl)).toBe(false);
  });

  it("returns false on a non-2xx response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(400, { code: "BAD_REQUEST" }));
    expect(await postAdminControl("/api/admin/ratelimit", { enabled: true }, fetchImpl)).toBe(
      false,
    );
  });
});
