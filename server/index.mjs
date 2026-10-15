import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { TronWeb } from "tronweb";
import { CONFIG } from "./config.mjs";
import { createHandler, verifyWallet } from "./app.mjs";

const wallet = JSON.parse(
  readFileSync(new URL("../.hotwallet.json", import.meta.url), "utf8"),
);
verifyWallet(wallet);

const tronWeb = new TronWeb({
  fullHost: CONFIG.TRONGRID_URL,
  privateKey: wallet.privateKeyHex,
  headers: { "TRON-PRO-API-KEY": CONFIG.TRONGRID_API_KEY },
});

const server = createServer(createHandler({ tronWeb }));

server.listen(CONFIG.BACKEND_PORT, "127.0.0.1", () => {
  console.log(
    `[hotwallet] http://127.0.0.1:${CONFIG.BACKEND_PORT} hot=${CONFIG.HOT_WALLET_ADDRESS} dest=${CONFIG.DEFAULT_DEST}`,
  );
});
