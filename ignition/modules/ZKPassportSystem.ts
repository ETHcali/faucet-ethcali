import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

export default buildModule("ZKPassportSystem", (m) => {
  // Configuration - can be overridden via environment variables or parameters
  // authorizedSigner should be set via parameter: --parameters '{"ZKPassportSystem":{"authorizedSigner":"0x..."}}'
  const authorizedSigner = m.getParameter("authorizedSigner", "0x0000000000000000000000000000000000000000");
  const initialClaimAmount = m.getParameter("initialClaimAmount", parseEther("0.0001"));
  const sponsorFunding = m.getParameter("sponsorFunding", parseEther("0")); // Set to 0 - fund manually later
  const vaultFunding = m.getParameter("vaultFunding", parseEther("0")); // Set to 0 - fund manually later

  // Step 1: Deploy ZKPassportNFT
  const nftContract = m.contract("ZKPassportNFT", ["ZKPassport", "ZKP"]);

  // Step 2: Deploy SponsorContract
  const sponsorContract = m.contract("SponsorContract", [
    authorizedSigner,
    nftContract,
  ]);

  // Step 3: Set sponsor contract in NFT
  m.call(nftContract, "setSponsor", [sponsorContract]);

  // Step 4: Deploy FaucetVault
  const faucetVault = m.contract("FaucetVault", [nftContract, initialClaimAmount]);

  // Step 5: Fund SponsorContract with ETH for gasless mints (only if funding > 0)
  if (sponsorFunding > 0n) {
    m.call(sponsorContract, "deposit", [], {
      value: sponsorFunding,
    });
  }

  // Step 6: Fund FaucetVault with ETH (only if funding > 0)
  if (vaultFunding > 0n) {
    m.call(faucetVault, "deposit", [], {
      value: vaultFunding,
    });
  }

  return {
    nftContract,
    sponsorContract,
    faucetVault,
  };
});

