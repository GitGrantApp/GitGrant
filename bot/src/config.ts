import "dotenv/config";

export const config = {
  // GitHub App
  githubAppId: process.env.GITHUB_APP_ID || "",
  githubPrivateKeyPath: process.env.GITHUB_PRIVATE_KEY_PATH || "./github-app.pem",
  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",

  // Chain
  privateKey: process.env.PRIVATE_KEY as `0x${string}`,
  escrowAddress: process.env.ESCROW_ADDRESS as `0x${string}`,
  attestationAddress: process.env.ATTESTATION_ADDRESS as `0x${string}`,
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  chainId: Number(process.env.CHAIN_ID || 8453),

  // Server
  port: Number(process.env.PORT || 3100),

  // Bounty settings
  minBountyUsd: 50,

  // Database
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",

  // Web app (used to compose claim URLs in bot replies)
  webAppUrl: process.env.WEB_APP_URL || "http://localhost:3000",

  // Hardening
  requireWebhookSignature: process.env.REQUIRE_WEBHOOK_SIGNATURE === "1" || process.env.NODE_ENV === "production",
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 60),

  // Agentic NL parsing — when set, @bountykitbot mentions are parsed via
  // an OpenAI-compatible LLM endpoint (e.g. Hermes Agent local proxy).
  // Falls back to slash-only mode when unset.
  llmEndpoint: process.env.LLM_ENDPOINT || "",
  llmApiKey: process.env.LLM_API_KEY || "",
  llmModel: process.env.LLM_MODEL || "kr/claude-opus-4.6",
  llmConfidenceFloor: Number(process.env.LLM_CONFIDENCE_FLOOR || 0.7),
  botMention: process.env.BOT_MENTION || "@bountykitbot",
} as const;
