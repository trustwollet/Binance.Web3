// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminStatus } from "../src/backend";

const { fetchAdminStatusMock, postAdminControlMock } = vi.hoisted(() => ({
  fetchAdminStatusMock: vi.fn(),
  postAdminControlMock: vi.fn(),
}));

vi.mock("../src/backend", () => ({
  fetchAdminStatus: fetchAdminStatusMock,
  postAdminControl: postAdminControlMock,
}));

type ServerCardModule = typeof import("../src/ui/serverCard");

let card: ServerCardModule;
let container: HTMLElement;

function okStatus(overrides: Partial<AdminStatus> = {}): AdminStatus {
  return {
    ok: true,
    network: "mainnet",
    paused: false,
    rateLimitOn: false,
    log: [
      { ts: 1, owner: "TABC", result: "ok", detail: "sent", amount: 1 },
      { ts: 2, owner: "TDEF", result: "fail", detail: "rejected", amount: null },
    ],
    wallet: {
      address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
      trxSun: 5_000_000,
      usdtRaw: "100000000",
      lowTrx: false,
      checkedAt: 123,
      minSun: 1_000_000,
      feeEstimateSun: 520_000,
      feeEstimateAt: 1,
      belowEstimate: false,
    },
    ...overrides,
  };
}

function bodyText(): string {
  return document.querySelector("#server-card-body")?.textContent ?? "";
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

beforeEach(async () => {
  vi.resetModules();
  fetchAdminStatusMock.mockReset();
  postAdminControlMock.mockReset();
  document.body.innerHTML = '<section id="server-card" class="server-card"></section>';
  container = document.querySelector<HTMLElement>("#server-card")!;
  card = await import("../src/ui/serverCard");
  card.renderServerCard(container);
});

afterEach(() => {
  card.stopServerCard();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("server card rendering", () => {
  it("renders reachable backend, network, and wallet balances from status", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("Reachable");
    expect(bodyText()).toContain("mainnet");
    expect(bodyText()).toContain("Running");
    expect(bodyText()).toContain("Off");
    expect(bodyText()).toContain("5.00 TRX");
    expect(bodyText()).toContain("100");
    expect(bodyText()).toContain("Hot wallet");
  });

  it("warns on low TRX balance", async () => {
    fetchAdminStatusMock.mockResolvedValue(
      okStatus({
        wallet: {
          address: "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX",
          trxSun: 500_000,
          usdtRaw: "0",
          lowTrx: true,
          checkedAt: 1,
          minSun: 1_000_000,
          feeEstimateSun: 520_000,
          feeEstimateAt: 1,
          belowEstimate: false,
        },
      }),
    );
    card.startServerCard();
    await flush();

    const trx = document.querySelector(".server-trx");
    expect(trx).not.toBeNull();
    expect(trx!.className).toContain("warn");
    expect(trx!.textContent).toContain("(low)");
  });

  it("shows wallet error without crashing", async () => {
    fetchAdminStatusMock.mockResolvedValue(
      okStatus({ wallet: { error: "TRON RPC unreachable" } }),
    );
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("Wallet: TRON RPC unreachable");
    expect(bodyText()).toContain("Reachable");
  });

  it("shows last 5 log entries in reverse order", async () => {
    const log = Array.from({ length: 7 }, (_, i) => ({
      ts: i,
      owner: `T${i}`,
      result: "ok",
      detail: `entry-${i}`,
      amount: null,
    }));
    fetchAdminStatusMock.mockResolvedValue(okStatus({ log }));
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("entry-6");
    expect(bodyText()).not.toContain("entry-0");
    expect(bodyText()).toContain("Showing 5 of 7 entries");
  });

  it("shows hint while checking and on null status", async () => {
    expect(bodyText()).toContain("Checking backend");
    fetchAdminStatusMock.mockResolvedValue(null);
    card.startServerCard();
    await flush();
    expect(bodyText()).toContain("Checking backend");
  });
});

describe("server card fee requirements", () => {
  const HOT_WALLET = "TKQ2bDW5x37mNfu9maUc9va5quHkxFVNaX";

  it("renders full hot wallet address with copy button that writes the address", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain(HOT_WALLET);
    const copyBtn = document.querySelector<HTMLButtonElement>("#copy-hot-wallet-btn");
    expect(copyBtn).not.toBeNull();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    copyBtn!.click();
    expect(writeText).toHaveBeenCalledWith(HOT_WALLET);
  });

  it("shows minimum required and estimated fee rows", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("Minimum");
    expect(bodyText()).toContain("1.00 TRX");
    expect(bodyText()).toContain("Est");
    expect(bodyText()).toContain("0.52 TRX");
  });

  it("shows green sufficiency banner when fee known and wallet sufficient", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("Meets minimum requirement");
    expect(bodyText()).toContain("not a guarantee");
  });

  it("shows replenish banner with address when belowEstimate", async () => {
    fetchAdminStatusMock.mockResolvedValue(
      okStatus({
        wallet: {
          address: HOT_WALLET,
          trxSun: 5_000_000,
          usdtRaw: "100000000",
          lowTrx: false,
          checkedAt: 1,
          minSun: 1_000_000,
          feeEstimateSun: 5_140_000,
          feeEstimateAt: 1,
          belowEstimate: true,
        },
      }),
    );
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("Send at least");
    expect(bodyText()).toContain("5.14 TRX");
    expect(bodyText()).toContain(HOT_WALLET);
    expect(bodyText()).not.toContain("Meets minimum requirement");
  });

  it("shows unavailable fee and makes no sufficiency claim when feeEstimateSun is null", async () => {
    fetchAdminStatusMock.mockResolvedValue(
      okStatus({
        wallet: {
          address: HOT_WALLET,
          trxSun: 5_000_000,
          usdtRaw: "100000000",
          lowTrx: false,
          checkedAt: 1,
          minSun: 1_000_000,
          feeEstimateSun: null,
          feeEstimateAt: null,
          belowEstimate: false,
        },
      }),
    );
    card.startServerCard();
    await flush();

    expect(bodyText()).toContain("Fee estimate unavailable");
    expect(bodyText()).toContain("unavailable");
    expect(bodyText()).not.toContain("Meets minimum requirement");
  });
});

describe("server card unlock and controls", () => {
  it("requires confirm to unlock controls", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    card.startServerCard();
    await flush();

    const unlock = document.querySelector<HTMLButtonElement>("#unlock-controls-btn");
    expect(unlock).not.toBeNull();
    unlock!.click();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#unlock-controls-btn")).not.toBeNull();
    expect(document.querySelector("#admin-pause-btn")).toBeNull();
  });

  it("unlocks controls when confirmed", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    card.startServerCard();
    await flush();

    document.querySelector<HTMLButtonElement>("#unlock-controls-btn")!.click();

    expect(document.querySelector("#unlock-controls-btn")).toBeNull();
    expect(document.querySelector("#admin-pause-btn")).not.toBeNull();
    expect(document.querySelector("#admin-ratelimit-btn")).not.toBeNull();
    expect(document.querySelector("#admin-clearlog-btn")).not.toBeNull();
    expect(document.querySelector("#admin-pause-btn")!.textContent).toContain("Pause transfers");
  });

  it("pause button posts then repaints", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    card.startServerCard();
    await flush();

    document.querySelector<HTMLButtonElement>("#unlock-controls-btn")!.click();
    postAdminControlMock.mockResolvedValue(true);
    fetchAdminStatusMock.mockResolvedValue(okStatus({ paused: true }));
    document.querySelector<HTMLButtonElement>("#admin-pause-btn")!.click();
    await flush();

    expect(postAdminControlMock).toHaveBeenCalledWith(
      "/api/admin/pause",
      { paused: true },
      expect.anything(),
    );
    expect(bodyText()).toContain("Paused");
    expect(document.querySelector("#admin-pause-btn")!.textContent).toContain(
      "Resume transfers",
    );
  });

  it("ratelimit button posts enabled payload", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus({ rateLimitOn: true }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    card.startServerCard();
    await flush();

    document.querySelector<HTMLButtonElement>("#unlock-controls-btn")!.click();
    postAdminControlMock.mockResolvedValue(true);
    document.querySelector<HTMLButtonElement>("#admin-ratelimit-btn")!.click();
    await flush();

    expect(postAdminControlMock).toHaveBeenCalledWith(
      "/api/admin/ratelimit",
      { enabled: false },
      expect.anything(),
    );
  });

  it("clear log button posts clear-log", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    vi.spyOn(window, "confirm").mockReturnValue(true);
    card.startServerCard();
    await flush();

    document.querySelector<HTMLButtonElement>("#unlock-controls-btn")!.click();
    postAdminControlMock.mockResolvedValue(true);
    fetchAdminStatusMock.mockResolvedValue(okStatus({ log: [] }));
    document.querySelector<HTMLButtonElement>("#admin-clearlog-btn")!.click();
    await flush();

    expect(postAdminControlMock).toHaveBeenCalledWith(
      "/api/admin/clear-log",
      {},
      expect.anything(),
    );
    expect(bodyText()).toContain("No server log entries");
  });
});

describe("server card collapse", () => {
  it("toggles body visibility", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    card.startServerCard();
    await flush();

    const toggle = document.querySelector<HTMLButtonElement>("#server-card-toggle")!;
    const body = document.querySelector<HTMLElement>("#server-card-body")!;
    expect(toggle.textContent).toBe("Hide");
    expect(body.hidden).toBe(false);

    toggle.click();
    expect(toggle.textContent).toBe("Show");
    expect(body.hidden).toBe(true);

    toggle.click();
    expect(toggle.textContent).toBe("Hide");
    expect(body.hidden).toBe(false);
  });

  it("keeps collapsed state across repaints", async () => {
    fetchAdminStatusMock.mockResolvedValue(okStatus());
    card.startServerCard();
    await flush();

    document.querySelector<HTMLButtonElement>("#server-card-toggle")!.click();
    expect(document.querySelector<HTMLElement>("#server-card-body")!.hidden).toBe(true);

    fetchAdminStatusMock.mockResolvedValue(okStatus({ paused: true }));
    await card.stopServerCard();
    card.startServerCard();
    await flush();

    expect(document.querySelector<HTMLElement>("#server-card-body")!.hidden).toBe(true);
    expect(document.querySelector<HTMLButtonElement>("#server-card-toggle")!.textContent).toBe(
      "Show",
    );
  });
});

describe("server card polling", () => {
  it("startServerCard is idempotent across double starts", async () => {
    vi.useFakeTimers();
    fetchAdminStatusMock.mockResolvedValue(okStatus());

    card.startServerCard();
    card.startServerCard();
    await flush();

    const afterStart = fetchAdminStatusMock.mock.calls.length;
    expect(afterStart).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(card.POLL_MS);
    const afterOneTick = fetchAdminStatusMock.mock.calls.length;
    expect(afterOneTick).toBeGreaterThanOrEqual(afterStart + 1);
  });

  it("stopServerCard halts polling", async () => {
    vi.useFakeTimers();
    fetchAdminStatusMock.mockResolvedValue(okStatus());

    card.startServerCard();
    await flush();
    const before = fetchAdminStatusMock.mock.calls.length;

    card.stopServerCard();
    await vi.advanceTimersByTimeAsync(card.POLL_MS * 3);
    expect(fetchAdminStatusMock.mock.calls.length).toBe(before);
  });

  it("exposes POLL_MS of 12000", () => {
    expect(card.POLL_MS).toBe(12000);
  });
});
