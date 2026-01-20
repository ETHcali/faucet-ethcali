import { network } from "hardhat";
import { formatEther, parseEther } from "viem";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ETHCALI Contracts Deployment Script
 *
 * Deploys all contracts with proper admin/treasury configuration from .env
 *
 * Security Model:
 * - ZKPassportNFT: Uses Ownable (single owner, can transfer)
 * - FaucetManager: Uses AccessControl (DEFAULT_ADMIN_ROLE + ADMIN_ROLE)
 * - Swag1155: Uses AccessControl (DEFAULT_ADMIN_ROLE + ADMIN_ROLE)
 *
 * Post-Deployment Admin Functions:
 * - ZKPassportNFT: transferOwnership(newOwner)
 * - FaucetManager: addAdmin(), removeAdmin(), setNFTContract()
 * - Swag1155: addAdmin(), removeAdmin(), setTreasury(), setUSDC()
 */

interface DeploymentConfig {
  network: string;
  superAdmin: string;
  zkpassportOwner: string;
  faucetAdmin: string;
  swagTreasury: string;
  usdcAddress: string;
}

interface DeploymentResult {
  zkPassportNFT: string;
  faucetManager: string;
  swag1155: string;
  network: string;
  timestamp: string;
  config: DeploymentConfig;
}

function getConfig(networkName: string): DeploymentConfig {
  // Get USDC address based on network
  let usdcAddress: string;
  switch (networkName) {
    case "ethereum":
      usdcAddress = process.env.USDC_ADDRESS_ETH!;
      break;
    case "base":
      usdcAddress = process.env.USDC_ADDRESS_BASE!;
      break;
    case "unichain":
      usdcAddress = process.env.USDC_ADDRESS_UNI!;
      break;
    default:
      // For local/test networks, we'll deploy a mock
      usdcAddress = "";
  }

  return {
    network: networkName,
    superAdmin: process.env.SUPER_ADMIN_ADDRESS!,
    zkpassportOwner: process.env.ZKPASSPORT_OWNER_ADDRESS!,
    faucetAdmin: process.env.FAUCET_ADMIN_ADDRESS!,
    swagTreasury: process.env.SWAG_TREASURY_ADDRESS!,
    usdcAddress,
  };
}

async function saveDeployment(result: DeploymentResult) {
  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }

  const filename = `${result.network}-${Date.now()}.json`;
  const filepath = path.join(deploymentsDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(result, null, 2));
  console.log(`\n📄 Deployment saved to: ${filepath}`);

  // Also save as latest
  const latestPath = path.join(deploymentsDir, `${result.network}-latest.json`);
  fs.writeFileSync(latestPath, JSON.stringify(result, null, 2));
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("              ETHCALI CONTRACTS DEPLOYMENT");
  console.log("═══════════════════════════════════════════════════════════");

  // Connect to network and get viem client
  const connection = await network.connect();
  const viem = connection.viem;

  // Get chainId and map to network name
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const chainIdToNetwork: Record<number, string> = {
    1: "ethereum",
    8453: "base",
    130: "unichain",
    31337: "hardhat",
  };
  const networkName = chainIdToNetwork[chainId] || `chain-${chainId}`;

  // Get configuration
  const config = getConfig(networkName);
  console.log(`\n🌐 Network: ${config.network}`);
  console.log(`👤 Super Admin: ${config.superAdmin}`);
  console.log(`👤 ZKPassport Owner: ${config.zkpassportOwner}`);
  console.log(`👤 Faucet Admin: ${config.faucetAdmin}`);
  console.log(`💰 Swag Treasury: ${config.swagTreasury}`);

  // Validate addresses
  if (!config.superAdmin || !config.swagTreasury) {
    throw new Error("Missing required addresses in .env");
  }

  // Get USDC address or deploy mock for testnets
  let usdcAddress = config.usdcAddress;
  if (!usdcAddress) {
    console.log("\n📦 Deploying Mock USDC (testnet only)...");
    const mockUSDC = await viem.deployContract("MockUSDC", []);
    usdcAddress = mockUSDC.address;
    config.usdcAddress = usdcAddress;
    console.log(`   Mock USDC deployed: ${usdcAddress}`);
  }
  console.log(`💵 USDC Address: ${usdcAddress}`);

  // Deploy ZKPassportNFT
  console.log("\n📦 Deploying ZKPassportNFT...");
  console.log(`   Owner will be: ${config.zkpassportOwner}`);
  const zkPassportNFT = await viem.deployContract("ZKPassportNFT", [
    "ZKPassport Verification",
    "ZKPASS",
    config.zkpassportOwner as `0x${string}`,
  ]);
  const zkPassportAddress = zkPassportNFT.address;
  console.log(`   ZKPassportNFT deployed: ${zkPassportAddress}`);
  console.log(`   ✅ Owner set to: ${config.zkpassportOwner}`);

  // Set metadata if configured
  const [deployer] = await viem.getWalletClients();
  if (
    deployer.account.address.toLowerCase() === config.zkpassportOwner.toLowerCase() &&
    process.env.NFT_IMAGE_URI &&
    process.env.NFT_DESCRIPTION
  ) {
    console.log(`   Setting NFT metadata...`);
    await zkPassportNFT.write.setMetadata([
      process.env.NFT_IMAGE_URI,
      process.env.NFT_DESCRIPTION,
      process.env.NFT_EXTERNAL_URL || "",
      true,
    ]);
    console.log(`   ✅ Metadata configured`);
  }

  // Deploy FaucetManager
  console.log("\n📦 Deploying FaucetManager...");
  console.log(`   Admin will be: ${config.faucetAdmin}`);
  const faucetManager = await viem.deployContract("FaucetManager", [
    zkPassportAddress as `0x${string}`,
    config.faucetAdmin as `0x${string}`,
  ]);
  const faucetManagerAddress = faucetManager.address;
  console.log(`   FaucetManager deployed: ${faucetManagerAddress}`);
  console.log(`   ✅ Admin set to: ${config.faucetAdmin}`);

  // Deploy Swag1155
  console.log("\n📦 Deploying Swag1155...");
  console.log(`   Admin will be: ${config.superAdmin}`);
  const swag1155 = await viem.deployContract("Swag1155", [
    "ipfs://",
    usdcAddress as `0x${string}`,
    config.swagTreasury as `0x${string}`,
    config.superAdmin as `0x${string}`,
  ]);
  const swag1155Address = swag1155.address;
  console.log(`   Swag1155 deployed: ${swag1155Address}`);
  console.log(`   Treasury: ${config.swagTreasury}`);
  console.log(`   USDC: ${usdcAddress}`);
  console.log(`   ✅ Admin set to: ${config.superAdmin}`);

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                    DEPLOYMENT COMPLETE");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`\n📋 Contract Addresses:`);
  console.log(`   ZKPassportNFT:  ${zkPassportAddress}`);
  console.log(`   FaucetManager:  ${faucetManagerAddress}`);
  console.log(`   Swag1155:       ${swag1155Address}`);

  console.log(`\n🔐 Security Configuration:`);
  console.log(`   ZKPassportNFT Owner: ${config.zkpassportOwner}`);
  console.log(`   FaucetManager Admin: ${config.faucetAdmin}`);
  console.log(`   Swag1155 Admin:      ${config.superAdmin}`);
  console.log(`   Swag1155 Treasury:   ${config.swagTreasury}`);

  // Save deployment
  const result: DeploymentResult = {
    zkPassportNFT: zkPassportAddress,
    faucetManager: faucetManagerAddress,
    swag1155: swag1155Address,
    network: config.network,
    timestamp: new Date().toISOString(),
    config,
  };

  await saveDeployment(result);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("                 POST-DEPLOYMENT ACTIONS");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`
📝 After deployment, admins can:

ZKPassportNFT (Owner: ${config.zkpassportOwner}):
  - setMetadata(imageURI, description, externalURL, useIPFS)
  - transferOwnership(newOwner)

FaucetManager (Admin: ${config.faucetAdmin}):
  - addAdmin(address)      - Add new admin
  - removeAdmin(address)   - Remove admin
  - createVault(...)       - Create new faucet
  - setNFTContract(addr)   - Change ZKPassport contract

Swag1155 (Admin: ${config.superAdmin}):
  - addAdmin(address)      - Add new admin
  - removeAdmin(address)   - Remove admin
  - setTreasury(address)   - Change treasury wallet
  - setUSDC(address)       - Change USDC contract
  - setVariantWithURI(...) - Create products
`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
