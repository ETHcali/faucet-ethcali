# ZKPassport NFT Faucet System

Privacy-preserving identity verification system with gasless NFT minting and ETH faucet distribution on Base, Unichain, and Ethereum.

**Repository**: [ETHcali/faucet-ethcali](https://github.com/ETHcali/faucet-ethcali)

## Overview

This project implements a complete system for verifying user identity using ZKPassport (face match + personhood) and distributing ETH to verified users:

- **ZKPassportNFT**: Soulbound ERC721 NFT representing verified identity
- **SponsorContract**: Gasless minting sponsor (contract pays gas for mints)
- **FaucetVault**: One-time ETH distribution to NFT holders

## Contracts

### Deployed on Base Mainnet (Chain ID: 8453)

- **ZKPassportNFT**: [`0x18B581aBA74e0068B60b3Af00814B8293B837A60`](https://basescan.org/address/0x18B581aBA74e0068B60b3Af00814B8293B837A60) | [Sourcify](https://sourcify.dev/server/repo-ui/8453/0x18B581aBA74e0068B60b3Af00814B8293B837A60)
- **FaucetVault**: [`0x607003f188C49ed6E0553805734B9990393402dF`](https://basescan.org/address/0x607003f188C49ed6E0553805734B9990393402dF) | [Sourcify](https://sourcify.dev/server/repo-ui/8453/0x607003f188C49ed6E0553805734B9990393402dF)
- **SponsorContract**: [`0x2940e286B41d279b61E484B98a08498E355E4778`](https://basescan.org/address/0x2940e286B41d279b61E484B98a08498E355E4778) | [Sourcify](https://sourcify.dev/server/repo-ui/8453/0x2940e286B41d279b61E484B98a08498E355E4778)

### Deployed on Unichain Mainnet (Chain ID: 130)

- **ZKPassportNFT**: [`0x25B43cE10ffD04Cb90123D7582E6B5100B27f9cB`](https://unichain.blockscout.com/address/0x25B43cE10ffD04Cb90123D7582E6B5100B27f9cB) | [Sourcify](https://sourcify.dev/server/repo-ui/130/0x25B43cE10ffD04Cb90123D7582E6B5100B27f9cB)
- **FaucetVault**: [`0x76235436cbD3F2ff12CC3610f2643654211Efb3d`](https://unichain.blockscout.com/address/0x76235436cbD3F2ff12CC3610f2643654211Efb3d) | [Sourcify](https://sourcify.dev/server/repo-ui/130/0x76235436cbD3F2ff12CC3610f2643654211Efb3d)
- **SponsorContract**: [`0x9Df46E1C221F8b067343f9B760F5Cb2c4757FE2d`](https://unichain.blockscout.com/address/0x9Df46E1C221F8b067343f9B760F5Cb2c4757FE2d) | [Sourcify](https://sourcify.dev/server/repo-ui/130/0x9Df46E1C221F8b067343f9B760F5Cb2c4757FE2d)

## Features

- ✅ **Gasless NFT Minting**: Users pay zero gas - sponsor contract covers costs
- ✅ **Soulbound NFTs**: Non-transferable identity tokens
- ✅ **On-chain Metadata**: Dynamic SVG images with verification traits
- ✅ **One-time Claims**: Each verified user can claim ETH once
- ✅ **Multi-chain Ready**: Deploy to Base, Unichain, or Ethereum

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file:

```bash
PRIVATE_KEY=your_deployer_private_key  # Needs ETH to deploy/manage contracts
BACKEND_SIGNER_PRIVATE_KEY=your_backend_signer_private_key  # Only signs, doesn't need ETH (can be same or different)

# RPC URLs
BASE_RPC_URL=https://base-mainnet.infura.io/v3/your_key
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your_key
UNICHAIN_RPC_URL=https://unichain-mainnet.infura.io/v3/your_key

# Block Explorer API Keys
ETHERSCAN_API_KEY=your_key
BASESCAN_API_KEY=your_key
UNICHAIN_API_KEY=your_key  # Optional, for contract verification
```

### Compile Contracts

```bash
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy

```bash
# Deploy to Base
npx hardhat ignition deploy ignition/modules/ZKPassportSystem.ts \
  --network base \
  --parameters '{"ZKPassportSystem":{"authorizedSigner":"YOUR_BACKEND_SIGNER_ADDRESS"}}'

# Deploy to Unichain
npx hardhat ignition deploy ignition/modules/ZKPassportSystem.ts \
  --network unichain \
  --parameters '{"ZKPassportSystem":{"authorizedSigner":"YOUR_BACKEND_SIGNER_ADDRESS"}}'

# Deploy to Ethereum
npx hardhat ignition deploy ignition/modules/ZKPassportSystem.ts \
  --network ethereum \
  --parameters '{"ZKPassportSystem":{"authorizedSigner":"YOUR_BACKEND_SIGNER_ADDRESS"}}'
```

### Verify Contracts

```bash
# Verify on Base
npx hardhat verify --network base <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>

# Verify on Unichain
npx hardhat verify --network unichain <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>

# Verify on Ethereum
npx hardhat verify --network ethereum <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

### Setup Frontend Files

Generate ABIs and addresses for frontend integration (generates files for all deployed networks):

```bash
npx hardhat run scripts/setup-frontend.ts
```

This creates a `frontend/` directory with:
- `contracts.json` - Multi-network config with all deployed networks
- `addresses.json` - All network addresses in one file
- `contracts.ts` - TypeScript exports with multi-network helpers
- `abis/` - Shared ABIs (same for all networks)
- `base/` - Base Mainnet specific files
- `unichain/` - Unichain Mainnet specific files

See `frontend/README.md` for detailed usage examples.

## Architecture

```
User → ZKPassport Verification → Backend → SponsorContract → NFTContract
                                                              ↓
                                                         User receives NFT
                                                              ↓
                                                         FaucetVault → User claims ETH
```

1. User verifies identity via ZKPassport (face match + personhood)
2. Backend receives verification results and signs mint request
3. SponsorContract validates signature and mints NFT (contract pays gas)
4. User receives soulbound NFT
5. User claims ETH from FaucetVault (one-time)

## Backend Integration

See `scripts/backend-example.ts` for a complete example of:
- ZKPassport SDK integration
- EIP-712 signature generation
- Gasless minting flow
- Express.js API endpoints

## Contract Details

### ZKPassportNFT

- **Standard**: ERC721 with soulbound restrictions
- **Metadata**: On-chain Base64 JSON with dynamic SVG
- **Traits**: Face Match status, Personhood verification
- **Limits**: One NFT per uniqueIdentifier, one per address

### SponsorContract

- **Purpose**: Sponsors gas costs for NFT mints
- **Authorization**: EIP-712 signature-based mint requests
- **Security**: Nonce-based replay protection
- **Funding**: Admin can deposit/withdraw ETH

### FaucetVault

- **Purpose**: Distributes ETH to verified users
- **Claim**: One-time claim per NFT holder
- **Amount**: Configurable by admin (default: 0.0001 ETH)
- **Security**: Pausable, reentrancy-protected

## Network Support

- ✅ Base Mainnet (Chain ID: 8453)
- ✅ Ethereum Mainnet (Chain ID: 1)
- ✅ Unichain Mainnet (Chain ID: 130)

## Security

- Reentrancy guards on all external calls
- Signature replay protection (nonces)
- Access control (Ownable pattern)
- Input validation
- Pausable emergency controls

## Repository

- **GitHub**: [ETHcali/faucet-ethcali](https://github.com/ETHcali/faucet-ethcali)

## License

MIT
