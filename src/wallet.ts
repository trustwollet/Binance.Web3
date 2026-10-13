import {
  WalletConnectChainID,
  WalletConnectWallet,
} from "@tronweb3/walletconnect-tron";
import { fromHexAddress, isValidTronAddress } from "./address";
import { CONFIG } from "./config";

export type TronTxJson = Record<string, unknown> & {
  txID?: string;
  raw_data?: unknown;
};

export type WalletSession = {
  address: string;
  signTransaction(tx: TronTxJson): Promise<TronTxJson>;
  disconnect(): Promise<void>;
};

function normalizeAddress(raw: string): string {
  const hex = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (/^41[0-9a-fA-F]{40}$/.test(hex)) {
    return fromHexAddress(hex);
  }
  if (isValidTronAddress(raw)) {
    return raw;
  }
  throw new Error(`Unexpected session address: ${raw}`);
}

export async function connectWallet(opts: {
  onUri: (uri: string) => void;
  onDisconnect: () => void;
}): Promise<WalletSession> {
  const wallet = new WalletConnectWallet({
    network:
      CONFIG.NETWORK === "nile"
        ? WalletConnectChainID.Nile
        : WalletConnectChainID.Mainnet,
    options: {
      projectId: CONFIG.WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: "USDT Transfer",
        url: location.origin,
        description: "USDT TRC-20 transfers",
        icons: [],
      },
    },
  });

  wallet.on("disconnect", opts.onDisconnect);

  const { address } = await wallet.connect({ onUri: opts.onUri });

  return {
    address: normalizeAddress(address),
    signTransaction: (tx) => wallet.signTransaction(tx),
    disconnect: () => wallet.disconnect(),
  };
}
