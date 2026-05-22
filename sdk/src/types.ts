// ─── Bounty status ────────────────────────────────────────────────────

export type BountyStatus =
  | "Open"
  | "Claimed"
  | "Submitted"
  | "Completed"
  | "Disputed"
  | "Expired"
  | "Cancelled";

// ─── Onchain bounty struct (mirrors BountyEscrow.sol) ──────────────────

export interface OnchainBounty {
  creator: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  fee: bigint;
  deadline: bigint; // unix timestamp in seconds
  claimant: `0x${string}`;
  status: number; // uint8 enum
  issueUri: string;
}

// ─── DB / API bounty shape ─────────────────────────────────────────────

export interface Bounty {
  bountyId: `0x${string}`;
  issueUri: string;
  repo: string;
  issueNumber: number;
  amountWei: string;
  token: `0x${string}`;
  status: BountyStatus;
  creatorGithub: string | null;
  creatorWallet: `0x${string}`;
  claimantGithub: string | null;
  claimantWallet: `0x${string}` | null;
  deadline: string; // ISO 8601
  createdAt: string;
  updatedAt: string;
  createTx: `0x${string}` | null;
  claimTx: `0x${string}` | null;
  submitTx: `0x${string}` | null;
  releaseTx: `0x${string}` | null;
  cancelTx: `0x${string}` | null;
}

// ─── API response envelopes ────────────────────────────────────────────

export interface ChainInfo {
  escrowAddress: `0x${string}`;
  chainId: number;
}

export interface ListBountiesResponse {
  bounties: Bounty[];
  chain: ChainInfo;
}

export interface GetBountyResponse {
  bounty: Bounty;
  chain: ChainInfo;
}

export interface BountyStats {
  total: number;
  open: number;
  claimed: number;
  submitted: number;
  completed: number;
  totalEscrowedWei: string;
  totalPaidWei: string;
}

export interface StatsResponse {
  stats: BountyStats;
}

// ─── Claim intent ──────────────────────────────────────────────────────

export interface ClaimIntent {
  token: string;
  bountyId: `0x${string}`;
  githubUsername: string;
  createdAt: string;
  expiresAt: string;
  consumedAt: string | null;
  consumedTx: `0x${string}` | null;
  consumedWallet: `0x${string}` | null;
}

export interface ClaimIntentResponse {
  intent: {
    token: string;
    githubUsername: string;
    expiresAt: string;
  };
  bounty: {
    bountyId: `0x${string}`;
    issueUri: string;
    repo: string;
    issueNumber: number;
    amountWei: string;
    token: `0x${string}`;
    status: BountyStatus;
    deadline: string;
  };
  chain: ChainInfo;
}

// ─── Confirm payloads ──────────────────────────────────────────────────

export interface ConfirmClaimBody {
  token: string;
  walletAddress: `0x${string}`;
  txHash: `0x${string}`;
}

export interface ConfirmSubmitBody {
  bountyId: `0x${string}`;
  walletAddress: `0x${string}`;
  txHash: `0x${string}`;
}

export interface ConfirmMaintainerActionBody {
  bountyId: `0x${string}`;
  walletAddress: `0x${string}`;
  txHash: `0x${string}`;
  action: "release" | "cancel" | "dispute" | "expire";
}

export interface ConfirmCreateBody {
  issueUri: string;
  walletAddress: `0x${string}`;
  txHash: `0x${string}`;
  githubUsername?: string;
}

export interface ConfirmResponse {
  ok: boolean;
  bountyId?: string;
  status?: string;
  alreadyCreated?: boolean;
  alreadyResolved?: boolean;
  alreadySubmitted?: boolean;
}

// ─── Client options ────────────────────────────────────────────────────

export interface GitGrantClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

// ─── Query filters ─────────────────────────────────────────────────────

export interface ListBountiesQuery {
  status?: BountyStatus | BountyStatus[];
  repo?: string;
  limit?: number;
  offset?: number;
}
