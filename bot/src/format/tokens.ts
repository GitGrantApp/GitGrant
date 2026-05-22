// Server-side equivalent of the frontend token registry. The bot needs
// to render token labels in receipts (e.g. "0.97 USDC") without pulling
// in the entire web/lib/tokens.ts file. Keep these in sync; expand as
// new tokens land. Address comparison is lowercase to avoid checksum
// mismatch surprises.

const ETH_SENTINEL = "0x0000000000000000000000000000000000000000";

interface TokenEntry {
  symbol: string;
  decimals: number;
}

// chainId -> address (lowercase) -> TokenEntry
const REGISTRY: Record<number, Record<string, TokenEntry>> = {
  84532: {
    [ETH_SENTINEL]: { symbol: "ETH", decimals: 18 },
    "0x036cbd53842c5426634e7929541ec2318f3dcf7e": { symbol: "USDC", decimals: 6 },
  },
  8453: {
    [ETH_SENTINEL]: { symbol: "ETH", decimals: 18 },
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { symbol: "USDC", decimals: 6 },
  },
};

export function tokenLabelForAddress(addr: string | null | undefined, chainId = 8453): string {
  if (!addr) return "ETH";
  const entry = REGISTRY[chainId]?.[addr.toLowerCase()];
  if (!entry) return `Token ${addr.slice(0, 6)}…${addr.slice(-4)}`;
  return entry.symbol;
}

export function tokenDecimalsForAddress(addr: string | null | undefined, chainId = 8453): number {
  if (!addr) return 18;
  return REGISTRY[chainId]?.[addr.toLowerCase()]?.decimals ?? 18;
}
