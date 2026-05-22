import {
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Hash,
  parseEther,
  getAddress,
} from "viem";
import { escrowAbi, attestationAbi } from "./abi.js";

// ─── Options ───────────────────────────────────────────────────────────

export interface GitGrantContractOptions {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  escrowAddress: `0x${string}`;
  attestationAddress?: `0x${string}`;
  chain?: Chain;
}

// ─── Onchain bounty type ───────────────────────────────────────────────

export interface OnchainBounty {
  creator: `0x${string}`;
  token: `0x${string}`;
  amount: bigint;
  fee: bigint;
  deadline: bigint;
  claimant: `0x${string}`;
  status: number;
  issueUri: string;
}

const STATUS_LABELS = ["None", "Open", "Claimed", "Submitted", "Completed", "Disputed", "Expired", "Cancelled"] as const;

// ─── Contract wrapper ──────────────────────────────────────────────────

export class GitGrantContract {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Account;
  escrowAddress: `0x${string}`;
  attestationAddress: `0x${string}`;
  #chain: Chain | undefined;

  constructor(opts: GitGrantContractOptions) {
    this.publicClient = opts.publicClient;
    this.walletClient = opts.walletClient;
    this.account = opts.account;
    this.escrowAddress = getAddress(opts.escrowAddress);
    this.attestationAddress = opts.attestationAddress
      ? getAddress(opts.attestationAddress)
      : "0x0000000000000000000000000000000000000000";
    this.#chain = opts.chain;
  }

  // ─── Write: Bounty lifecycle ─────────────────────────────────────────

  #writeOpts(extra: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      address: this.escrowAddress,
      abi: escrowAbi,
      account: this.account,
      ...extra,
    };
    // WalletClient.writeContract requires chain — prefer the one supplied
    // at construction, then fall back to whatever the client already has.
    if (this.#chain) base.chain = this.#chain;
    return base as Parameters<typeof this.walletClient.writeContract>[0];
  }

  #readOpts(extra: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      address: this.escrowAddress,
      abi: escrowAbi,
      ...extra,
    };
    if (this.#chain) base.chain = this.#chain;
    return base as Parameters<typeof this.publicClient.readContract>[0];
  }

  #attestationReadOpts(extra: Record<string, unknown> = {}) {
    const base: Record<string, unknown> = {
      address: this.attestationAddress,
      abi: attestationAbi,
      ...extra,
    };
    if (this.#chain) base.chain = this.#chain;
    return base as Parameters<typeof this.publicClient.readContract>[0];
  }

  /** Create a bounty funded with ETH. Returns the tx hash. */
  async createBountyETH(
    issueUri: string,
    amountEth: string,
    deadlineSeconds: number,
  ): Promise<Hash> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({
        functionName: "createBountyETH",
        args: [issueUri, deadline],
        value: parseEther(amountEth),
        nonce,
      }),
    );
  }

  /** Create a bounty funded with ERC20 tokens. The caller must approve the escrow first. */
  async createBountyToken(
    issueUri: string,
    token: `0x${string}`,
    totalAmount: bigint,
    deadlineSeconds: number,
  ): Promise<Hash> {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({
        functionName: "createBountyToken",
        args: [issueUri, token, totalAmount, deadline],
        nonce,
      }),
    );
  }

  /** Claim a bounty as a contributor. */
  async claim(bountyId: `0x${string}`): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "claim", args: [bountyId], nonce }),
    );
  }

  /** Submit work for a claimed bounty. */
  async submit(bountyId: `0x${string}`): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "submit", args: [bountyId], nonce }),
    );
  }

  /** Release payment to the claimant (creator only). */
  async release(bountyId: `0x${string}`): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "release", args: [bountyId], nonce }),
    );
  }

  /** Cancel an open bounty and refund the creator. */
  async cancel(bountyId: `0x${string}`): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "cancel", args: [bountyId], nonce }),
    );
  }

  /** Expire a bounty past its deadline. */
  async expire(bountyId: `0x${string}`): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "expire", args: [bountyId], nonce }),
    );
  }

  /** Dispute a claimed or submitted bounty. */
  async dispute(bountyId: `0x${string}`): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "dispute", args: [bountyId], nonce }),
    );
  }

  /** Resolve a dispute as the arbiter. */
  async resolve(bountyId: `0x${string}`, payClaimant: boolean): Promise<Hash> {
    const nonce = await this.#getNonce();
    return this.walletClient.writeContract(
      this.#writeOpts({ functionName: "resolve", args: [bountyId, payClaimant], nonce }),
    );
  }

  // ─── Read: View functions ────────────────────────────────────────────

  /** Read a bounty's full onchain state. */
  async getBounty(bountyId: `0x${string}`): Promise<OnchainBounty> {
    return this.publicClient.readContract(
      this.#readOpts({ functionName: "getBounty", args: [bountyId] }),
    ) as Promise<OnchainBounty>;
  }

  /** Get the total number of bounties. */
  async getBountyCount(): Promise<bigint> {
    return this.publicClient.readContract(
      this.#readOpts({ functionName: "getBountyCount" }),
    ) as Promise<bigint>;
  }

  /** Compute the deterministic bounty ID for an issue URI. */
  async computeId(issueUri: string): Promise<`0x${string}`> {
    return this.publicClient.readContract(
      this.#readOpts({ functionName: "computeId", args: [issueUri] }),
    ) as Promise<`0x${string}`>;
  }

  /** Get attestations for a contributor address. */
  async getContributorAttestations(contributor: `0x${string}`): Promise<readonly bigint[]> {
    return this.publicClient.readContract(
      this.#attestationReadOpts({ functionName: "getContributorAttestations", args: [contributor] }),
    ) as Promise<readonly bigint[]>;
  }

  /** Get a single attestation by ID. */
  async getAttestation(id: bigint): Promise<{
    contributor: `0x${string}`;
    bountyId: `0x${string}`;
    issueUri: string;
    token: `0x${string}`;
    amount: bigint;
    completedAt: bigint;
  }> {
    return this.publicClient.readContract(
      this.#attestationReadOpts({ functionName: "getAttestation", args: [id] }),
    ) as Promise<{
      contributor: `0x${string}`;
      bountyId: `0x${string}`;
      issueUri: string;
      token: `0x${string}`;
      amount: bigint;
      completedAt: bigint;
    }>;
  }

  /** Human-readable status label for a numeric onchain status. */
  statusLabel(statusCode: number): string {
    return STATUS_LABELS[statusCode] ?? `Unknown(${statusCode})`;
  }

  // ─── Internal ────────────────────────────────────────────────────────

  async #getNonce(): Promise<number> {
    return this.publicClient.getTransactionCount({
      address: this.account.address,
      blockTag: "pending",
    });
  }
}
