import type {
  GitGrantClientOptions,
  ListBountiesQuery,
  ListBountiesResponse,
  GetBountyResponse,
  StatsResponse,
  ClaimIntentResponse,
  ConfirmClaimBody,
  ConfirmSubmitBody,
  ConfirmMaintainerActionBody,
  ConfirmCreateBody,
  ConfirmResponse,
} from "./types.js";

export class GitGrantClient {
  #baseUrl: string;
  #fetch: typeof fetch;

  constructor(opts: GitGrantClientOptions) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // ─── Read endpoints ──────────────────────────────────────────────────

  async listBounties(query: ListBountiesQuery = {}): Promise<ListBountiesResponse> {
    const params = new URLSearchParams();
    if (query.status) {
      params.set("status", Array.isArray(query.status) ? query.status.join(",") : query.status);
    }
    if (query.repo) params.set("repo", query.repo);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    if (query.offset !== undefined) params.set("offset", String(query.offset));

    const qs = params.toString();
    return this.#get(`/api/bounties${qs ? `?${qs}` : ""}`);
  }

  async getBounty(bountyId: string): Promise<GetBountyResponse> {
    return this.#get(`/api/bounties/${encodeURIComponent(bountyId)}`);
  }

  async getStats(): Promise<StatsResponse> {
    return this.#get("/api/stats");
  }

  async getClaimIntent(token: string): Promise<ClaimIntentResponse> {
    return this.#get(`/api/claim-intents/${encodeURIComponent(token)}`);
  }

  // ─── Write endpoints ─────────────────────────────────────────────────

  async confirmClaim(body: ConfirmClaimBody): Promise<ConfirmResponse> {
    return this.#post("/api/claim/confirm", body as unknown as Record<string, unknown>);
  }

  async confirmSubmit(body: ConfirmSubmitBody): Promise<ConfirmResponse> {
    return this.#post("/api/submit/confirm", body as unknown as Record<string, unknown>);
  }

  async confirmMaintainerAction(body: ConfirmMaintainerActionBody): Promise<ConfirmResponse> {
    return this.#post("/api/maintainer/confirm", body as unknown as Record<string, unknown>);
  }

  async confirmCreate(body: ConfirmCreateBody): Promise<ConfirmResponse> {
    return this.#post("/api/bounties/confirm-create", body as unknown as Record<string, unknown>);
  }

  // ─── Health ──────────────────────────────────────────────────────────

  async health(): Promise<{ status: string; service: string }> {
    return this.#get("/");
  }

  // ─── Internal ────────────────────────────────────────────────────────

  async #get<T>(path: string): Promise<T> {
    const res = await this.#fetch(`${this.#baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.text();
      throw new GitGrantApiError(res.status, body, path);
    }
    return res.json() as Promise<T>;
  }

  async #post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const res = await this.#fetch(`${this.#baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new GitGrantApiError(res.status, text, path);
    }
    return res.json() as Promise<T>;
  }
}

export class GitGrantApiError extends Error {
  status: number;
  body: string;
  path: string;

  constructor(status: number, body: string, path: string) {
    super(`GitGrant API error ${status} on ${path}: ${body}`);
    this.name = "GitGrantApiError";
    this.status = status;
    this.body = body;
    this.path = path;
  }
}
