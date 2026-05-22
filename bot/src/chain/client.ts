import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { config } from "../config.js";

const account = privateKeyToAccount(config.privateKey);
const chain = config.chainId === 8453 ? base : baseSepolia;

export const publicClient = createPublicClient({
  chain,
  transport: http(config.rpcUrl),
});

export const walletClient = createWalletClient({
  account,
  chain,
  transport: http(config.rpcUrl),
});

export { account };
