import { keccak256, encodePacked, formatEther } from "viem";
import type { BountyStatus } from "./types.js";

/** Compute deterministic bounty ID from an issue URI. */
export function computeBountyId(issueUri: string): `0x${string}` {
  return keccak256(encodePacked(["string"], [issueUri]));
}

/** Parse a bounty issue URI into repo + issue number. */
export function parseIssueUri(uri: string): { repo: string; issueNumber: number } | null {
  const match = uri.match(/^github:([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)#(\d+)$/);
  if (!match) return null;
  return { repo: match[1], issueNumber: parseInt(match[2], 10) };
}

/** Format wei amount to ETH string with up to 6 decimal places. */
export function formatWeiToEth(wei: string | bigint): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  return formatEther(value);
}

/** Human-readable status label. */
export function statusLabel(status: BountyStatus): string {
  return status;
}

/** Status badge emoji for display. */
export function statusEmoji(status: BountyStatus): string {
  const map: Record<BountyStatus, string> = {
    Open: "🟢",
    Claimed: "🟡",
    Submitted: "🔵",
    Completed: "✅",
    Disputed: "🔴",
    Expired: "⏰",
    Cancelled: "❌",
  };
  return map[status] ?? "⚪";
}

/** Check if a status is terminal (no further transitions possible). */
export function isTerminalStatus(status: BountyStatus): boolean {
  return status === "Completed" || status === "Cancelled" || status === "Expired";
}

/** Check if a status is active (still in play). */
export function isActiveStatus(status: BountyStatus): boolean {
  return !isTerminalStatus(status) && status !== "Disputed";
}

/** Format a wallet address to a shortened display form. */
export function shortAddress(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/** Build a GitHub issue URL from an issue URI. */
export function issueUrl(issueUri: string): string {
  const parsed = parseIssueUri(issueUri);
  if (!parsed) return "";
  return `https://github.com/${parsed.repo}/issues/${parsed.issueNumber}`;
}
