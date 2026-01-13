import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Combined deployment module - deploys ALL contracts at once:
 * - ZKPassportNFT
 * - FaucetVault
 * - Swag1155
 * 
 * Usage:
 *   npx hardhat ignition deploy ignition/modules/DeployAll.ts --network base
 */
export default buildModule("CompleteSystem", (m) => {
  // Get network to determine which USDC address to use
  const network = process.env.HARDHAT_NETWORK || "base";
  
  // Map network names to USDC env vars
  const usdcEnvMap: Record<string, string> = {
    base: "USDC_ADDRESS_BASE",
    ethereum: "USDC_ADDRESS_ETH",
    unichain: "USDC_ADDRESS_UNI",
    optimism: "USDC_ADDRESS_OP",
  };

  const usdcEnvKey = usdcEnvMap[network] || "USDC_ADDRESS_BASE";
  const usdcEnv = process.env[usdcEnvKey];
  const treasuryEnv = process.env.TREASURY_ADDRESS;

  console.log("\n🚀 Deploying Complete ETH Cali System to", network);
  console.log("=" .repeat(60));

  // ===== 1. Deploy ZKPassportNFT =====
  console.log("\n📋 Step 1: Deploying ZKPassportNFT...");
  const zkPassportNFT = m.contract("ZKPassportNFT", ["ZKPassport", "ZKP"]);

  // ===== 2. Deploy FaucetVault =====
  console.log("📋 Step 2: Deploying FaucetVault...");
  const claimAmount = m.getParameter("claimAmount", 100000000000000n); // 0.0001 ETH
  const faucetVault = m.contract("FaucetVault", [zkPassportNFT, claimAmount]);

  // ===== 3. Deploy Swag1155 =====
  console.log("📋 Step 3: Deploying Swag1155...");
  
  const baseURI = m.getParameter(
    "baseURI",
    process.env.SWAG1155_BASE_URI || "https://wallet.ethcali.org/metadata/{id}.json"
  );
  const usdc = m.getParameter("usdc", usdcEnv);
  const treasury = m.getParameter("treasury", treasuryEnv);

  if (!usdc) {
    throw new Error(
      `❌ USDC address not set. Set ${usdcEnvKey} in .env or use --parameters flag`
    );
  }
  if (!treasury) {
    throw new Error(
      "❌ Treasury address not set. Set TREASURY_ADDRESS in .env or use --parameters flag"
    );
  }

  console.log("\n   Swag1155 Configuration:");
  console.log(`   • baseURI: ${baseURI}`);
  console.log(`   • usdc: ${usdc}`);
  console.log(`   • treasury: ${treasury}`);

  const swag1155 = m.contract("Swag1155", [baseURI, usdc, treasury]);

  console.log("\n" + "=".repeat(60));
  console.log("✅ All contracts configured for deployment!\n");

  return { zkPassportNFT, faucetVault, swag1155 };
});
