# ETHcali Smart Contracts

Complete smart contract suite for ETHcali: identity verification, faucet distribution, and merchandise marketplace on Base, Ethereum, and Unichain.

**Repository**: [ETHcali/faucet-ethcali](https://github.com/ETHcali/faucet-ethcali)

## Overview

This repository contains three interconnected smart contract systems designed for the ETHcali ecosystem:

### 1. ZKPassportNFT - Identity Verification
Soulbound ERC721 NFT representing verified identity using ZKPassport technology (face match + personhood verification). Each user can self-verify and mint their non-transferable identity token.

### 2. FaucetManager - Multi-Vault ETH Distribution
Multi-vault faucet system that allows admins to create different faucets for various purposes (hackathons, community grants, etc.). Features:
- Returnable and non-returnable vault types
- Optional whitelist per vault for controlled access
- "Good actor" tracking for users who return funds
- Public name and description for each vault

### 3. Swag1155 - Merchandise Marketplace
ERC-1155 marketplace for ETHcali merchandise with USDC payments. Admins create products with multiple variants (sizes/colors), users purchase with USDC, and NFTs are minted with IPFS metadata representing physical merchandise claims.

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file:

```bash
# Deployer private key (needs ETH for gas)
PRIVATE_KEY=0x...

# ============================================================
# ADMIN & TREASURY CONFIGURATION
# All three contracts use the same admin address
# ============================================================

SUPER_ADMIN_ADDRESS=0x3C9204B25966591749450FB233D58E850e7C1f9F
ZKPASSPORT_OWNER_ADDRESS=0x3C9204B25966591749450FB233D58E850e7C1f9F
FAUCET_ADMIN_ADDRESS=0x3C9204B25966591749450FB233D58E850e7C1f9F
SWAG_TREASURY_ADDRESS=0x3C9204B25966591749450FB233D58E850e7C1f9F

# ============================================================
# USDC Addresses (network-specific for Swag1155)
# ============================================================

USDC_ADDRESS_BASE=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
USDC_ADDRESS_ETH=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
USDC_ADDRESS_UNI=0x078D782b760474a361dDA0AF3839290b0EF57AD6

# ============================================================
# RPC URLs
# ============================================================

BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
UNICHAIN_RPC_URL=https://unichain-mainnet.infura.io/v3/YOUR_KEY

# ============================================================
# Block Explorer API Keys (for verification)
# ============================================================

ETHERSCAN_API_KEY=your_key
BASESCAN_API=your_key
UNICHAIN_API_KEY=your_key
```

### Compile

```bash
npm run compile
```

### Run Tests

```bash
npm test
```

All 77 tests should pass covering:
- ZKPassportNFT: Minting, duplicate prevention, soulbound transfers
- FaucetManager: Vault creation, claims, returns, whitelist management
- Swag1155: Product variants, purchases, supply management, redemption flow

## Deployment

### Deploy to Network

```bash
# Deploy to Base Mainnet
npm run deploy:base

# Deploy to Ethereum Mainnet
npm run deploy:ethereum

# Deploy to Unichain Mainnet
npm run deploy:unichain
```

The deploy script will:
1. Deploy all 3 contracts (ZKPassportNFT, FaucetManager, Swag1155)
2. Set the admin/owner from `.env` directly at deployment
3. Save deployment info to `deployments/{network}-latest.json`

### Verify Contracts

After deployment, verify on block explorers:

```bash
# Verify on Base
npm run verify:base

# Verify on Ethereum
npm run verify:ethereum

# Verify on Unichain
npm run verify:unichain
```

**Requirements:**
- Deployment must be completed first (addresses read from `deployments/`)
- API keys must be set in `.env`

## Contract Features

### ZKPassportNFT

| Feature | Description |
|---------|-------------|
| Self-service minting | Users verify via ZKPassport and mint directly |
| Soulbound | Non-transferable NFTs |
| One per address | Each address can only hold one NFT |
| On-chain metadata | Dynamic SVG with verification traits |

**Admin Functions:**
- `setMetadata(imageURI, description, externalURL, useIPFS)` - Set NFT metadata
- `transferOwnership(newOwner)` - Transfer contract ownership

### FaucetManager

| Feature | Description |
|---------|-------------|
| Multiple vaults | Create separate vaults for different purposes |
| Whitelist support | Optional whitelist per vault |
| Returnable vaults | Track users who return funds (good actors) |
| ZKPassport gated | Requires ZKPassport NFT to claim |

**Vault Structure:**
```solidity
struct Vault {
    string name;            // Public name (e.g., "ETHGlobal 2026")
    string description;     // Public description
    uint256 claimAmount;    // ETH per claim
    bool active;            // Whether claims are enabled
    bool whitelistEnabled;  // Whether whitelist is required
    VaultType vaultType;    // Returnable or NonReturnable
}
```

**Admin Functions:**
```solidity
// Create vault with optional whitelist
createVault(name, description, claimAmount, vaultType, whitelistEnabled)

// Whitelist management
setWhitelistEnabled(vaultId, enabled)
addToWhitelist(vaultId, user)
addBatchToWhitelist(vaultId, users[])
removeFromWhitelist(vaultId, user)
removeBatchFromWhitelist(vaultId, users[])

// Vault management
updateVault(vaultId, name, description, claimAmount, active)
deposit(vaultId) // Send ETH
withdraw(vaultId, amount)

// Admin management
addAdmin(address)
removeAdmin(address)
```

**User Functions:**
```solidity
claim(vaultId)           // Claim ETH (requires ZKPassport + whitelist if enabled)
returnFunds(vaultId)     // Return ETH to returnable vault
```

**View Functions:**
```solidity
getVault(vaultId)                    // Get vault details
getAllVaults()                       // Get all vaults
getActiveVaults()                    // Get active vaults only
canUserClaim(vaultId, user)          // Check if user can claim (with reason)
isWhitelisted(vaultId, user)         // Check whitelist status
getClaimInfo(vaultId, user)          // Get user's claim info
getReturnCount(user)                 // Get user's return count (good actor score)
```

### Swag1155

| Feature | Description |
|---------|-------------|
| USDC payments | Pay with USDC, not ETH |
| Per-variant pricing | Different prices per size/color |
| Supply management | Track minted vs max supply |
| Redemption flow | Users redeem NFTs for physical items |

**Admin Functions:**
- `setVariant(tokenId, price, maxSupply, active)` - Create/update variant
- `setVariantWithURI(tokenId, price, maxSupply, active, uri)` - With custom URI
- `markFulfilled(tokenId, user)` - Mark physical item as shipped
- `setTreasury(address)` - Change treasury wallet
- `setUSDC(address)` - Change USDC contract

**User Functions:**
- `buy(tokenId, quantity)` - Purchase NFTs
- `buyBatch(tokenIds[], quantities[])` - Batch purchase
- `redeem(tokenId)` - Request physical item redemption

## NPM Scripts

```bash
npm run compile           # Compile contracts
npm test                  # Run all tests (77 tests)
npm run deploy:base       # Deploy to Base
npx hardhat ignition deploy ignition/modules/DeployAll.ts --network base

npm run deploy:ethereum   # Deploy to Ethereum
npx hardhat ignition deploy ignition/modules/DeployAll.ts --network ethereum

npm run deploy:unichain   # Deploy to Unichain
npx hardhat ignition deploy ignition/modules/DeployAll.ts --network unichain

npm run verify:base       # Verify on Basescan
npm run verify:ethereum   # Verify on Etherscan
npm run verify:unichain   # Verify on Uniscan
npm run setup:frontend    # Generate frontend files
```

## Security

- Owner/Admin set directly at deployment (no post-deployment role transfers)
- Reentrancy guards on all external calls
- AccessControl roles (Super Admin + Admin)
- Input validation on all user inputs
- Pausable emergency controls
- Supply enforcement and bounds checking
- Comprehensive test coverage (77 tests)

## Network Support

| Network | Chain ID | Status |
|---------|----------|--------|
| Base Mainnet | 8453 | Supported |
| Ethereum Mainnet | 1 | Supported |
| Unichain Mainnet | 130 | Supported |

## Documentation

- **[docs/README.md](docs/README.md)** - Documentation hub
- **[docs/ZKPASSPORT_CONTRACT_REFERENCE.md](docs/ZKPASSPORT_CONTRACT_REFERENCE.md)** - ZKPassportNFT API
- **[docs/FAUCET_CONTRACT_REFERENCE.md](docs/FAUCET_CONTRACT_REFERENCE.md)** - FaucetManager API
- **[docs/SWAG1155_CONTRACT_REFERENCE.md](docs/SWAG1155_CONTRACT_REFERENCE.md)** - Swag1155 API
- **[docs/SECURITY_ADMIN_GUIDE.md](docs/SECURITY_ADMIN_GUIDE.md)** - Admin roles & security

## License

MIT
