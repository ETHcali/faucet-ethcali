import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Script to extract ABIs and addresses for frontend integration
 * Generates files for all deployed networks (Base, Unichain, etc.)
 * Usage: npx hardhat run scripts/setup-frontend.ts
 */

interface ContractInfo {
  address: string;
  abi: any[];
}

interface NetworkConfig {
  network: string;
  chainId: number;
  contracts: {
    ZKPassportNFT: ContractInfo;
    SponsorContract: ContractInfo;
    FaucetVault: ContractInfo;
  };
}

interface MultiNetworkConfig {
  networks: Record<string, NetworkConfig>;
  defaultNetwork?: string;
}

const CHAIN_IDS_TO_NETWORK: Record<number, string> = {
  8453: "base",
  1: "ethereum",
  130: "unichain",
  31337: "hardhatMainnet",
};

const NETWORK_NAMES: Record<string, string> = {
  base: "Base Mainnet",
  ethereum: "Ethereum Mainnet",
  unichain: "Unichain Mainnet",
  hardhatMainnet: "Hardhat Local",
};

async function main() {
  console.log("🚀 Setting up frontend files for all deployed networks...\n");

  // Read ABIs from artifacts (same for all networks)
  const artifactsDir = join(__dirname, "../artifacts/contracts");

  const readABI = (contractName: string): any[] => {
    const artifactPath = join(artifactsDir, `${contractName}.sol`, `${contractName}.json`);
    try {
      const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
      return artifact.abi;
    } catch (error) {
      console.error(`Error reading ABI for ${contractName}:`, error);
      return [];
    }
  };

  const nftABI = readABI("ZKPassportNFT");
  const sponsorABI = readABI("SponsorContract");
  const faucetABI = readABI("FaucetVault");

  // Find all deployment directories
  const deploymentsDir = join(__dirname, "../ignition/deployments");
  const chainDirs = readdirSync(deploymentsDir)
    .filter((d) => d.startsWith("chain-"))
    .map((d) => {
      const chainId = parseInt(d.replace("chain-", ""));
      return { chainId, dir: d };
    })
    .filter(({ chainId }) => !isNaN(chainId));

  if (chainDirs.length === 0) {
    console.error("No deployment directories found. Deploy contracts first.");
    process.exit(1);
  }

  console.log(`Found ${chainDirs.length} deployed network(s):\n`);

  const multiNetworkConfig: MultiNetworkConfig = {
    networks: {},
  };

  const outputDir = join(__dirname, "../frontend");
  mkdirSync(outputDir, { recursive: true });

  // Process each network
  for (const { chainId, dir } of chainDirs) {
    const networkName = CHAIN_IDS_TO_NETWORK[chainId] || `chain-${chainId}`;
    const networkDisplayName = NETWORK_NAMES[networkName] || networkName;

    console.log(`📦 Processing ${networkDisplayName} (Chain ID: ${chainId})...`);

    const addressesPath = join(deploymentsDir, dir, "deployed_addresses.json");

    if (!existsSync(addressesPath)) {
      console.log(`   ⚠️  Skipping - no deployed_addresses.json found\n`);
      continue;
    }

    let deployedAddresses: Record<string, string>;
    try {
      const addressesContent = readFileSync(addressesPath, "utf-8");
      deployedAddresses = JSON.parse(addressesContent);
    } catch (error) {
      console.log(`   ⚠️  Skipping - error reading addresses\n`);
      continue;
    }

    const nftAddress = deployedAddresses["ZKPassportSystem#ZKPassportNFT"];
    const sponsorAddress = deployedAddresses["ZKPassportSystem#SponsorContract"];
    const faucetAddress = deployedAddresses["ZKPassportSystem#FaucetVault"];

    if (!nftAddress || !sponsorAddress || !faucetAddress) {
      console.log(`   ⚠️  Skipping - missing contract addresses\n`);
      continue;
    }

    // Create network config
    const networkConfig: NetworkConfig = {
      network: networkName,
      chainId,
      contracts: {
        ZKPassportNFT: {
          address: nftAddress,
          abi: nftABI,
        },
        SponsorContract: {
          address: sponsorAddress,
          abi: sponsorABI,
        },
        FaucetVault: {
          address: faucetAddress,
          abi: faucetABI,
        },
      },
    };

    multiNetworkConfig.networks[networkName] = networkConfig;

    // Set first network as default
    if (!multiNetworkConfig.defaultNetwork) {
      multiNetworkConfig.defaultNetwork = networkName;
    }

    // Create network-specific directory
    const networkDir = join(outputDir, networkName);
    mkdirSync(networkDir, { recursive: true });

    // Write network-specific files
    writeFileSync(
      join(networkDir, "contracts.json"),
      JSON.stringify(networkConfig, null, 2)
    );

    const addressesFile = {
      network: networkName,
      chainId,
      addresses: {
        ZKPassportNFT: nftAddress,
        SponsorContract: sponsorAddress,
        FaucetVault: faucetAddress,
      },
    };

    writeFileSync(
      join(networkDir, "addresses.json"),
      JSON.stringify(addressesFile, null, 2)
    );

    // Create TypeScript types for this network
    const typesContent = `// Auto-generated contract addresses and types for ${networkDisplayName}
export const CONTRACTS = ${JSON.stringify(networkConfig, null, 2)} as const;

export const ADDRESSES = {
  ZKPassportNFT: "${nftAddress}",
  SponsorContract: "${sponsorAddress}",
  FaucetVault: "${faucetAddress}",
} as const;

export const CHAIN_ID = ${chainId} as const;
export const NETWORK = "${networkName}" as const;
`;
    writeFileSync(join(networkDir, "contracts.ts"), typesContent);

    console.log(`   ✅ Created files in frontend/${networkName}/`);
    console.log(`      - ZKPassportNFT: ${nftAddress}`);
    console.log(`      - SponsorContract: ${sponsorAddress}`);
    console.log(`      - FaucetVault: ${faucetAddress}\n`);
  }

  // Write multi-network config
  writeFileSync(
    join(outputDir, "contracts.json"),
    JSON.stringify(multiNetworkConfig, null, 2)
  );
  console.log(`✅ Created frontend/contracts.json (multi-network config)`);

  // Write all addresses in one file
  const allAddresses: Record<string, any> = {};
  for (const [networkName, config] of Object.entries(multiNetworkConfig.networks)) {
    allAddresses[networkName] = {
      chainId: config.chainId,
      addresses: {
        ZKPassportNFT: config.contracts.ZKPassportNFT.address,
        SponsorContract: config.contracts.SponsorContract.address,
        FaucetVault: config.contracts.FaucetVault.address,
      },
    };
  }
  writeFileSync(
    join(outputDir, "addresses.json"),
    JSON.stringify(allAddresses, null, 2)
  );
  console.log(`✅ Created frontend/addresses.json (all networks)`);

  // Write shared ABIs
  const abisDir = join(outputDir, "abis");
  mkdirSync(abisDir, { recursive: true });

  writeFileSync(
    join(abisDir, "ZKPassportNFT.json"),
    JSON.stringify(nftABI, null, 2)
  );
  writeFileSync(
    join(abisDir, "SponsorContract.json"),
    JSON.stringify(sponsorABI, null, 2)
  );
  writeFileSync(
    join(abisDir, "FaucetVault.json"),
    JSON.stringify(faucetABI, null, 2)
  );
  console.log(`✅ Created frontend/abis/ (shared ABIs)`);

  // Create TypeScript types for multi-network
  const multiTypesContent = `// Auto-generated multi-network contract addresses and types
export const CONTRACTS = ${JSON.stringify(multiNetworkConfig, null, 2)} as const;

export const ADDRESSES = ${JSON.stringify(allAddresses, null, 2)} as const;

// Helper to get addresses for a specific network
export function getAddresses(network: keyof typeof ADDRESSES) {
  return ADDRESSES[network];
}

// Helper to get contract config for a specific network
export function getContracts(network: keyof typeof CONTRACTS.networks) {
  return CONTRACTS.networks[network];
}

// Default network
export const DEFAULT_NETWORK = "${multiNetworkConfig.defaultNetwork}" as const;
`;
  writeFileSync(join(outputDir, "contracts.ts"), multiTypesContent);
  console.log(`✅ Created frontend/contracts.ts (multi-network types)`);

  // Create README
  const frontendReadme = `# Frontend Contract Integration

This directory contains contract ABIs and addresses for frontend integration across multiple networks.

## Structure

\`\`\`
frontend/
├── contracts.json          # Multi-network config (all networks)
├── addresses.json          # All network addresses
├── contracts.ts           # TypeScript exports (multi-network)
├── abis/                  # Shared ABIs (same for all networks)
│   ├── ZKPassportNFT.json
│   ├── SponsorContract.json
│   └── FaucetVault.json
├── base/                  # Base Mainnet specific files
│   ├── contracts.json
│   ├── addresses.json
│   └── contracts.ts
└── unichain/              # Unichain Mainnet specific files
    ├── contracts.json
    ├── addresses.json
    └── contracts.ts
\`\`\`

## Usage Examples

### Multi-Network (Recommended)

\`\`\`typescript
import { getAddresses, getContracts, DEFAULT_NETWORK } from './contracts';
import ZKPassportNFT_ABI from './abis/ZKPassportNFT.json';

// Get addresses for a specific network
const baseAddresses = getAddresses('base');
const unichainAddresses = getAddresses('unichain');

// Use with ethers.js
const contract = new ethers.Contract(
  baseAddresses.addresses.ZKPassportNFT,
  ZKPassportNFT_ABI,
  signer
);
\`\`\`

### Single Network

\`\`\`typescript
// Import from network-specific directory
import { ADDRESSES } from './base/contracts';
import ZKPassportNFT_ABI from './abis/ZKPassportNFT.json';

const contract = new ethers.Contract(ADDRESSES.ZKPassportNFT, ZKPassportNFT_ABI, signer);
\`\`\`

### React with Wagmi (Multi-Chain)

\`\`\`typescript
import { useContractRead } from 'wagmi';
import { getAddresses } from './contracts';
import ZKPassportNFT_ABI from './abis/ZKPassportNFT.json';

function MyComponent({ chainId }: { chainId: number }) {
  const network = chainId === 8453 ? 'base' : chainId === 130 ? 'unichain' : 'base';
  const addresses = getAddresses(network);
  
  const { data } = useContractRead({
    address: addresses.addresses.ZKPassportNFT,
    abi: ZKPassportNFT_ABI,
    functionName: 'totalSupply',
  });
  
  return <div>Total Supply: {data?.toString()}</div>;
}
\`\`\`

## Deployed Networks

${Object.entries(multiNetworkConfig.networks)
  .map(
    ([name, config]) =>
      `- **${NETWORK_NAMES[name] || name}** (Chain ID: ${config.chainId})`
  )
  .join("\n")}

## Default Network

Default network: **${NETWORK_NAMES[multiNetworkConfig.defaultNetwork || "base"]}**
`;
  writeFileSync(join(outputDir, "README.md"), frontendReadme);
  console.log(`✅ Created frontend/README.md`);

  console.log("\n✨ Frontend setup complete for all networks!");
  console.log(`\n📁 Output directory: ${outputDir}`);
  console.log(`\n📊 Summary:`);
  console.log(`   - Networks processed: ${Object.keys(multiNetworkConfig.networks).length}`);
  console.log(`   - Networks: ${Object.keys(multiNetworkConfig.networks).join(", ")}`);
  console.log(`   - Default network: ${multiNetworkConfig.defaultNetwork}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
