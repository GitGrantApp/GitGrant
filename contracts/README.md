# GitGrant Contracts

Smart contracts for GitGrant — onchain bounty escrow and contributor attestations on Base.

## Contracts

- **BountyEscrow** — Trustless escrow for git-based bounties. Supports ETH and ERC20 tokens.
- **BountyAttestation** — Non-transferable ERC-721 proof of completed bounty work.

## Deployments

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployed contract addresses.

## Development

```bash
forge build
forge test
forge fmt
```

## Deploy

```bash
cp .env.example .env
# fill in PRIVATE_KEY, ARBITER_ADDRESS, OWNER_ADDRESS
forge script script/Deploy.s.sol:DeployGitGrant --rpc-url $RPC_URL --broadcast
```

## License

MIT
