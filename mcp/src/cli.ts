#!/usr/bin/env node
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { GitGrantClient, computeBountyId, parseIssueUri, statusEmoji, formatWeiToEth } from "@gitgrant/sdk";

const API_URL = process.env.GITGRANT_API_URL || "https://api.gitgrant.app";
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS || "0x0000000000000000000000000000000000000000";
const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);
const CHAIN_NAMES: Record<number, string> = { 8453: "Base Mainnet", 84532: "Base Sepolia", 31337: "Local" };

const client = new GitGrantClient({ baseUrl: API_URL });

// Resolve ASCII art from src/ (dev via tsx) or from a sibling file (compiled dist/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const asciiPath = existsSync(join(__dirname, "ascii-text-art.txt"))
  ? join(__dirname, "ascii-text-art.txt")
  : join(__dirname, "..", "src", "ascii-text-art.txt");
const ASCII = readFileSync(asciiPath, "utf-8");

const G = "\x1b[38;2;43;202;101m";
const R = "\x1b[0m";
const B = "\x1b[1m";
const D = "\x1b[2m";

const WELCOME = `
${G}${ASCII}${R}

${B}GitGrant CLI${R} — onchain bounties for open source
${D}API: ${API_URL}  •  Chain: ${CHAIN_NAMES[CHAIN_ID]} (${CHAIN_ID})${R}

${B}Commands:${R}
  list       List all bounties
  active     List active bounties (Open + Claimed)
  get        Get bounty detail by ID or issue URI
  stats      Show platform statistics
  id         Compute bounty ID from an issue URI
  parse      Parse an issue URI into components
  chain      Show chain info

${B}Options${R} (list/active):
  --status   Filter by status (comma-separated)
  --repo     Filter by repo (owner/repo)
  --limit    Max results (default 20)
  --offset   Pagination offset

${B}Examples:${R}
  gitgrant list
  gitgrant list --status Open --repo owner/repo
  gitgrant active
  gitgrant get github:owner/repo#123
  gitgrant stats
  gitgrant id github:owner/repo#123
  gitgrant chain
`;

function parseArgs(argv: string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      opts[key] = val;
    }
  }
  return opts;
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function shortAddr(addr: string): string {
  return addr.length < 10 ? addr : `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function cmdList(args: string[]) {
  const opts = parseArgs(args);
  const status = opts.status?.split(",").map((s) => s.trim()) as any;
  const result = await client.listBounties({
    status,
    repo: opts.repo,
    limit: Number(opts.limit) || 20,
    offset: Number(opts.offset) || 0,
  });
  if (result.bounties.length === 0) return console.log("No bounties found.");
  for (const b of result.bounties) {
    const age = daysAgo(b.createdAt);
    console.log(`${statusEmoji(b.status)} [${b.status}] ${b.repo}#${b.issueNumber}`);
    console.log(`   ID: ${b.bountyId}`);
    console.log(`   Creator: ${b.creatorGithub ?? shortAddr(b.creatorWallet)} | ${age}d ago`);
    console.log(`   Amount: ${formatWeiToEth(b.amountWei)} ETH`);
    console.log();
  }
  console.log(`${result.bounties.length} bounties | chain=${result.chain.chainId}`);
}

async function cmdActive(args: string[]) {
  const opts = parseArgs(args);
  const result = await client.listBounties({
    status: ["Open", "Claimed"],
    repo: opts.repo,
    limit: Number(opts.limit) || 20,
  });
  if (result.bounties.length === 0) return console.log("No active bounties.");
  for (const b of result.bounties) {
    const age = daysAgo(b.createdAt);
    console.log(`${statusEmoji(b.status)} [${b.status}] ${b.repo}#${b.issueNumber}`);
    console.log(`   ID: ${b.bountyId}`);
    console.log(`   Creator: ${b.creatorGithub ?? shortAddr(b.creatorWallet)} | ${age}d ago`);
    console.log(`   Amount: ${formatWeiToEth(b.amountWei)} ETH`);
    console.log();
  }
  console.log(`${result.bounties.length} active bounties`);
}

async function cmdGet(identifier: string) {
  let bountyId = identifier;
  if (identifier.startsWith("github:") || identifier.startsWith("gitlab:")) {
    bountyId = computeBountyId(identifier);
  }
  const result = await client.getBounty(bountyId);
  const b = result.bounty;
  console.log(`${statusEmoji(b.status)} ${b.status} — ${b.repo}#${b.issueNumber}`);
  console.log(`ID:      ${b.bountyId}`);
  console.log(`Issue:   ${b.issueUri}`);
  console.log(`Amount:  ${formatWeiToEth(b.amountWei)} ETH (${b.amountWei} wei)`);
  console.log(`Creator: ${b.creatorGithub ?? b.creatorWallet}`);
  console.log(`Claimant: ${b.claimantGithub ?? b.claimantWallet ?? "(none)"}`);
  console.log(`Created: ${b.createdAt}`);
  console.log(`Deadline: ${b.deadline}`);
  console.log(`Create tx: ${b.createTx ?? "—"}`);
  console.log(`Claim tx:  ${b.claimTx ?? "—"}`);
  console.log(`Submit tx: ${b.submitTx ?? "—"}`);
  console.log(`Release tx: ${b.releaseTx ?? "—"}`);
}

async function cmdStats() {
  const result = await client.getStats();
  const s = result.stats;
  console.log(`Total:      ${s.total}`);
  console.log(`Open:       ${s.open}`);
  console.log(`Claimed:    ${s.claimed}`);
  console.log(`Submitted:  ${s.submitted}`);
  console.log(`Completed:  ${s.completed}`);
  console.log(`Escrowed:   ${formatWeiToEth(s.totalEscrowedWei)} ETH`);
  console.log(`Paid:       ${formatWeiToEth(s.totalPaidWei)} ETH`);
}

async function cmdId(uri: string) {
  const id = computeBountyId(uri);
  const parsed = parseIssueUri(uri);
  console.log(`URI:  ${uri}`);
  console.log(`ID:   ${id}`);
  if (parsed) {
    console.log(`Repo: ${parsed.repo}`);
    console.log(`Issue: #${parsed.issueNumber}`);
    console.log(`URL:  https://github.com/${parsed.repo}/issues/${parsed.issueNumber}`);
  }
}

async function cmdParse(uri: string) {
  const parsed = parseIssueUri(uri);
  if (!parsed) {
    console.log(`Invalid URI: ${uri}`);
    console.log("Expected format: github:owner/repo#123");
    process.exit(1);
  }
  console.log(`Platform: github`);
  console.log(`Repo:     ${parsed.repo}`);
  console.log(`Issue:    #${parsed.issueNumber}`);
  console.log(`URL:      https://github.com/${parsed.repo}/issues/${parsed.issueNumber}`);
}

function cmdChain() {
  const name = CHAIN_NAMES[CHAIN_ID] ?? `Chain ${CHAIN_ID}`;
  console.log(`Chain:    ${name} (${CHAIN_ID})`);
  console.log(`RPC:      ${RPC_URL}`);
  console.log(`Escrow:   ${ESCROW_ADDRESS}`);
}

// ─── Main ──────────────────────────────────────────────────────────────

const [, , cmd, ...args] = process.argv;

async function main() {
  switch (cmd) {
    case "list":   return cmdList(args);
    case "active": return cmdActive(args);
    case "get":    return cmdGet(args[0] || "");
    case "stats":  return cmdStats();
    case "id":     return cmdId(args[0] || "");
    case "parse":  return cmdParse(args[0] || "");
    case "chain":  return cmdChain();
    default:
      console.log(WELCOME);
      if (cmd) console.log(`Unknown command: ${cmd}`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
