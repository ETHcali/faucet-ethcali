import hre from "hardhat";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ContractAddresses {
  ZKPassportNFT: string;
  FaucetVault: string;
  Swag1155: string;
}

async function main() {
  // Get network from command line arguments
  const networkArg = process.argv.find(arg => arg === '--network');
  const networkIndex = process.argv.indexOf('--network');
  const networkName = networkIndex >= 0 && networkIndex < process.argv.length - 1 
    ? process.argv[networkIndex + 1]
    : "base";
  
  if (!networkName) {
    console.error('❌ Network not specified. Use --network flag');
    process.exit(1);
  }
  
  console.log(`\n🔍 Verifying contracts on ${networkName}...`);

  // Read addresses from frontend directory
  const addressesPath = join(__dirname, "..", "frontend", networkName, "addresses.json");
  
  let addressesData: any;
  try {
    const content = readFileSync(addressesPath, "utf-8");
    addressesData = JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading addresses from ${addressesPath}`);
    console.error(`   Run 'npx hardhat run scripts/setup-frontend.ts' first`);
    process.exit(1);
  }

  const addresses: ContractAddresses = addressesData.addresses;

  // Get constructor arguments from environment
  const baseURI = process.env.SWAG1155_BASE_URI || "";
  const treasuryAddress = process.env.TREASURY_ADDRESS;
  
  // Get network-specific USDC address
  const usdcAddresses: Record<string, string> = {
    base: process.env.USDC_ADDRESS_BASE || "",
    ethereum: process.env.USDC_ADDRESS_ETH || "",
    unichain: process.env.USDC_ADDRESS_UNI || "",
  };
  const usdcAddress = usdcAddresses[networkName];

  if (!treasuryAddress || !usdcAddress) {
    console.error(`❌ Missing environment variables for ${networkName}`);
    process.exit(1);
  }

  // Verify ZKPassportNFT
  console.log(`\n📝 Verifying ZKPassportNFT at ${addresses.ZKPassportNFT}...`);
  try {
    execSync(
      `npx hardhat verify --network ${networkName} ${addresses.ZKPassportNFT} "ZKPassport" "ZKP"`,
      { stdio: "inherit", cwd: join(__dirname, "..") }
    );
    console.log(`✅ ZKPassportNFT verified`);
  } catch (error: any) {
    console.log(`ℹ️  ZKPassportNFT verification attempted`);
  }

  // Verify FaucetVault
  console.log(`\n📝 Verifying FaucetVault at ${addresses.FaucetVault}...`);
  try {
    execSync(
      `npx hardhat verify --network ${networkName} ${addresses.FaucetVault} "${addresses.ZKPassportNFT}" "100000000000000"`,
      { stdio: "inherit", cwd: join(__dirname, "..") }
    );
    console.log(`✅ FaucetVault verified`);
  } catch (error: any) {
    console.log(`ℹ️  FaucetVault verification attempted`);
  }

  // Verify Swag1155
  console.log(`\n📝 Verifying Swag1155 at ${addresses.Swag1155}...`);
  try {
    execSync(
      `npx hardhat verify --network ${networkName} ${addresses.Swag1155} "${baseURI}" "${usdcAddress}" "${treasuryAddress}"`,
      { stdio: "inherit", cwd: join(__dirname, "..") }
    );
    console.log(`✅ Swag1155 verified`);
  } catch (error: any) {
    console.log(`ℹ️  Swag1155 verification attempted`);
  }

  console.log(`\n✅ Verification complete for ${networkName}!`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

