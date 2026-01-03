import { run } from "hardhat";
import { network } from "hardhat";

/**
 * Script to verify contracts on Etherscan/Basescan
 * Usage: npx hardhat run scripts/verify-contracts.ts --network <network>
 */
async function main() {
  const networkName = network.name;
  console.log(`Verifying contracts on ${networkName}...`);

  // Get deployment addresses from ignition deployments
  // In a real scenario, you'd read from ignition/deployments/<network>/ZKPassportSystem.json
  const nftAddress = process.env.NFT_CONTRACT_ADDRESS;
  const sponsorAddress = process.env.SPONSOR_CONTRACT_ADDRESS;
  const faucetAddress = process.env.FAUCET_VAULT_ADDRESS;

  if (!nftAddress || !sponsorAddress || !faucetAddress) {
    console.error("Error: Contract addresses not found in environment variables");
    console.error("Please set NFT_CONTRACT_ADDRESS, SPONSOR_CONTRACT_ADDRESS, and FAUCET_VAULT_ADDRESS");
    process.exit(1);
  }

  try {
    // Verify ZKPassportNFT
    console.log(`Verifying ZKPassportNFT at ${nftAddress}...`);
    await run("verify:verify", {
      address: nftAddress,
      constructorArguments: ["ZKPassport", "ZKP"],
    });
    console.log("✓ ZKPassportNFT verified");

    // Verify SponsorContract
    // Note: You'll need to get the constructor arguments from your deployment
    console.log(`Verifying SponsorContract at ${sponsorAddress}...`);
    console.log("⚠️  Please verify SponsorContract manually with constructor arguments:");
    console.log("   - authorizedSigner address");
    console.log("   - nftContract address");
    // Uncomment and fill in the actual constructor arguments:
    // await run("verify:verify", {
    //   address: sponsorAddress,
    //   constructorArguments: [authorizedSignerAddress, nftAddress],
    // });

    // Verify FaucetVault
    console.log(`Verifying FaucetVault at ${faucetAddress}...`);
    console.log("⚠️  Please verify FaucetVault manually with constructor arguments:");
    console.log("   - nftContract address");
    console.log("   - claimAmount (in wei)");
    // Uncomment and fill in the actual constructor arguments:
    // await run("verify:verify", {
    //   address: faucetAddress,
    //   constructorArguments: [nftAddress, claimAmount],
    // });

    console.log("\n✅ Verification process completed!");
    console.log(`View contracts on ${getExplorerUrl(networkName)}:`);
    console.log(`  NFT: ${getExplorerUrl(networkName)}/address/${nftAddress}`);
    console.log(`  Sponsor: ${getExplorerUrl(networkName)}/address/${sponsorAddress}`);
    console.log(`  Faucet: ${getExplorerUrl(networkName)}/address/${faucetAddress}`);
  } catch (error: any) {
    if (error.message.includes("Already Verified")) {
      console.log("✓ Contract already verified");
    } else {
      console.error("Verification error:", error.message);
      throw error;
    }
  }
}

function getExplorerUrl(networkName: string): string {
  const explorers: Record<string, string> = {
    ethereum: "https://etherscan.io",
    base: "https://basescan.org",
    unichain: "https://unichain.blockscout.com", // Update with actual explorer URL
    sepolia: "https://sepolia.etherscan.io",
  };

  return explorers[networkName] || "https://etherscan.io";
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

