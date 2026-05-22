# GitGrant

**Onchain bounties for GitHub issues.**

GitGrant lets maintainers fund GitHub issues in escrow and automatically release payouts when accepted PRs merge — without leaving GitHub.

## How it works

```
Maintainer comments "/bounty 500 USDC" on an issue
  → Bot redirects to dashboard to deposit into escrow
  → Contributor comments "/claim"
  → Contributor opens PR referencing the issue
  → PR merged → payout released automatically
  → Contributor receives onchain attestation as proof of work
```

## Stack

| Module | Description |
|--------|-------------|
| `contracts/` | `BountyEscrow.sol` and `BountyAttestation.sol` — deployed on Base |
| `bot/` | GitHub App — webhook listener, slash commands, onchain interactions |
| `web/` | Bounty explorer and dashboard — Next.js, deployed on Vercel |
| `sdk/` | TypeScript client for the GitGrant API and contracts |
| `mcp/` | MCP server for AI agent integration |

## Contracts

Deployed on Base mainnet:

| Contract | Address |
|----------|---------|
| BountyEscrow | `0xFa59AeA9A35880716bC17455d101871Ba2D274a7` |
| BountyAttestation | `0x98A1E275fD55dBeb3afdc28B74a98Ea1431C1429` |

## Development

**Prerequisites:** Node.js 20+, Foundry, pnpm

```bash
# Contracts
cd contracts
forge build
forge test

# Bot
cd bot
cp .env.example .env
npm install
npm run dev

# Web
cd web
cp .env.example .env
pnpm install
pnpm dev

# SDK
cd sdk
npm install
npm run build
```

## Deploy

- Bot: see [bot/DEPLOY.md](./bot/DEPLOY.md)
- Web: see [web/DEPLOY.md](./web/DEPLOY.md)
- Contracts: see [contracts/DEPLOYMENT.md](./contracts/DEPLOYMENT.md)

## License

MIT
