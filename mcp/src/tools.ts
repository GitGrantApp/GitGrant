import { z } from "zod";
import { GitGrantClient, computeBountyId, parseIssueUri, type Bounty } from "@gitgrant/sdk";

export interface ToolContext {
  apiUrl: string;
  rpcUrl: string;
  escrowAddress: `0x${string}`;
  chainId: number;
}

type Handler = (args: Record<string, unknown>) => Promise<{ content: Array<{ type: "text"; text: string }> }>;

export interface ToolDef {
  name: string;
  config: {
    description: string;
    inputSchema: Record<string, z.ZodTypeAny>;
  };
  handler: Handler;
}

let _client: GitGrantClient | null = null;
function getClient(ctx: ToolContext): GitGrantClient {
  if (!_client) _client = new GitGrantClient({ baseUrl: ctx.apiUrl });
  return _client;
}

export function createToolDefinitions(ctx: ToolContext): ToolDef[] {
  const client = () => getClient(ctx);

  return [
    // ── list_bounties ───────────────────────────────────────────────
    {
      name: "list_bounties",
      config: {
        description:
          "List all bounties on GitGrant. Supports filtering by status (Open, Claimed, Submitted, Completed, Disputed, Expired, Cancelled), repo (e.g. 'owner/repo'), and pagination with limit/offset.",
        inputSchema: {
          status: z.string().optional().describe("Filter by status. Use comma for multiple, e.g. 'Open,Claimed'."),
          repo: z.string().optional().describe("Filter by GitHub repo, e.g. 'owner/repo'."),
          limit: z.number().optional().describe("Max results (1-200, default 50)."),
          offset: z.number().optional().describe("Pagination offset (default 0)."),
        },
      },
      handler: async (args) => {
        const result = await client().listBounties({
          status: args.status ? (args.status as string).split(",").map((s: string) => s.trim()) as any : undefined,
          repo: args.repo as string | undefined,
          limit: args.limit as number | undefined,
          offset: args.offset as number | undefined,
        });

        const lines = result.bounties.map((b: Bounty) => {
          const age = daysAgo(b.createdAt);
          return `- [${b.status}] \`${b.bountyId.slice(0, 10)}...\` | ${b.repo}#${b.issueNumber} | ${b.creatorGithub ?? shortAddr(b.creatorWallet)} | ${age}d ago`;
        });

        return {
          content: [{ type: "text" as const, text: `Found ${result.bounties.length} bounties (chain=${result.chain.chainId}, escrow=${result.chain.escrowAddress}):\n\n${lines.join("\n") || "(none)"}` }],
        };
      },
    },

    // ── get_bounty ──────────────────────────────────────────────────
    {
      name: "get_bounty",
      config: {
        description:
          "Get full details for a single bounty by its ID (bytes32 hex) or by its issue URI (e.g. 'github:owner/repo#123').",
        inputSchema: {
          idOrUri: z.string().describe("Bounty ID (0x... bytes32) or issue URI (github:owner/repo#123)."),
        },
      },
      handler: async (args) => {
        let bountyId = args.idOrUri as string;
        if (bountyId.startsWith("github:") || bountyId.startsWith("gitlab:")) {
          bountyId = computeBountyId(bountyId);
        }

        const result = await client().getBounty(bountyId);
        const b = result.bounty;

        return {
          content: [{
            type: "text" as const,
            text: [
              `**Bounty ${b.bountyId}**`,
              `- Issue: ${b.issueUri} (${b.repo}#${b.issueNumber})`,
              `- Status: ${b.status}`,
              `- Amount: ${b.amountWei} wei`,
              `- Creator: ${b.creatorGithub ?? b.creatorWallet}`,
              `- Claimant: ${b.claimantGithub ?? b.claimantWallet ?? "(none)"}`,
              `- Created: ${b.createdAt}`,
              `- Deadline: ${b.deadline}`,
              `- Tx: create=${b.createTx ?? "—"}, claim=${b.claimTx ?? "—"}, submit=${b.submitTx ?? "—"}, release=${b.releaseTx ?? "—"}`,
            ].join("\n"),
          }],
        };
      },
    },

    // ── get_stats ───────────────────────────────────────────────────
    {
      name: "get_stats",
      config: {
        description: "Get aggregate GitGrant platform statistics (total, per-status counts, total value escrowed and paid).",
        inputSchema: {},
      },
      handler: async () => {
        const result = await client().getStats();
        const s = result.stats;

        return {
          content: [{
            type: "text" as const,
            text: [
              `**GitGrant Platform Stats**`,
              `- Total bounties: ${s.total}`,
              `- Open: ${s.open}`,
              `- Claimed: ${s.claimed}`,
              `- Submitted: ${s.submitted}`,
              `- Completed: ${s.completed}`,
              `- Total escrowed: ${s.totalEscrowedWei} wei`,
              `- Total paid: ${s.totalPaidWei} wei`,
            ].join("\n"),
          }],
        };
      },
    },

    // ── compute_bounty_id ───────────────────────────────────────────
    {
      name: "compute_bounty_id",
      config: {
        description:
          "Compute the deterministic bytes32 bounty ID from an issue URI. Format: 'github:owner/repo#issueNumber'.",
        inputSchema: {
          issueUri: z.string().describe("Issue URI, e.g. 'github:owner/repo#123'."),
        },
      },
      handler: async (args) => {
        const uri = args.issueUri as string;
        const id = computeBountyId(uri);
        const parsed = parseIssueUri(uri);

        return {
          content: [{
            type: "text" as const,
            text: parsed
              ? `**Bounty ID:** \`${id}\`\n- Repo: ${parsed.repo}\n- Issue: #${parsed.issueNumber}\n- URL: https://github.com/${parsed.repo}/issues/${parsed.issueNumber}`
              : `**Bounty ID:** \`${id}\`\n- URI: ${uri}`,
          }],
        };
      },
    },

    // ── parse_issue_uri ─────────────────────────────────────────────
    {
      name: "parse_issue_uri",
      config: {
        description:
          "Parse a GitGrant issue URI into components (platform, repo, issue number). Supports github: and gitlab: prefixes.",
        inputSchema: {
          issueUri: z.string().describe("Issue URI, e.g. 'github:owner/repo#123'."),
        },
      },
      handler: async (args) => {
        const uri = args.issueUri as string;
        const parsed = parseIssueUri(uri);
        if (!parsed) {
          return {
            content: [{ type: "text" as const, text: `Invalid issue URI: "${uri}". Expected format: github:owner/repo#123` }],
          };
        }
        return {
          content: [{
            type: "text" as const,
            text: `- Platform: github\n- Repo: ${parsed.repo}\n- Issue: #${parsed.issueNumber}\n- URL: https://github.com/${parsed.repo}/issues/${parsed.issueNumber}`,
          }],
        };
      },
    },

    // ── get_chain_info ──────────────────────────────────────────────
    {
      name: "get_chain_info",
      config: {
        description:
          "Get the current chain configuration (chain ID, RPC URL, escrow contract address).",
        inputSchema: {},
      },
      handler: async () => {
        const chainNames: Record<number, string> = {
          8453: "Base Mainnet",
          84532: "Base Sepolia (testnet)",
          31337: "Local / Foundry",
        };
        const name = chainNames[ctx.chainId] ?? `Chain ${ctx.chainId}`;

        return {
          content: [{
            type: "text" as const,
            text: [
              `**Chain:** ${name} (${ctx.chainId})`,
              `- RPC: ${ctx.rpcUrl}`,
              `- Escrow contract: ${ctx.escrowAddress}`,
            ].join("\n"),
          }],
        };
      },
    },

    // ── list_active_bounties ────────────────────────────────────────
    {
      name: "list_active_bounties",
      config: {
        description:
          "List only active (workable) bounties — those with status Open or Claimed. These are bounties contributors can still engage with.",
        inputSchema: {
          repo: z.string().optional().describe("Filter by GitHub repo, e.g. 'owner/repo'."),
          limit: z.number().optional().describe("Max results (default 50)."),
        },
      },
      handler: async (args) => {
        const result = await client().listBounties({
          status: ["Open", "Claimed"],
          repo: args.repo as string | undefined,
          limit: args.limit as number | undefined,
        });

        const lines = result.bounties.map((b: Bounty) => {
          const age = daysAgo(b.createdAt);
          return `- [${b.status}] ${b.repo}#${b.issueNumber} | ${b.creatorGithub ?? shortAddr(b.creatorWallet)} | ${age}d ago | \`${b.bountyId.slice(0, 10)}...\``;
        });

        return {
          content: [{
            type: "text" as const,
            text: `${result.bounties.length} active bounties:\n\n${lines.join("\n") || "(none)"}`,
          }],
        };
      },
    },
  ];
}

// ─── Helpers ───────────────────────────────────────────────────────────

function daysAgo(iso: string): number {
  const diff = Date.now() - new Date(iso).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function shortAddr(addr: string): string {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
