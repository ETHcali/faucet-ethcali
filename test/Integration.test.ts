import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";

describe("Integration Tests", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, user1, user2] = await viem.getWalletClients();

  let nftContract: any;
  let faucetVault: any;
  let deployerAddress: string;
  let user1Address: string;
  let user2Address: string;
  let claimAmount: bigint;

  before(async function () {
    deployerAddress = deployer.account.address;
    user1Address = user1.account.address;
    user2Address = user2.account.address;
    claimAmount = parseEther("0.01");

    // Deploy NFT contract with deployer as initial owner
    nftContract = await viem.deployContract("ZKPassportNFT", [
      "ZKPassport",
      "ZKP",
      deployerAddress, // initialOwner
    ]);

    // Deploy FaucetVault
    faucetVault = await viem.deployContract("FaucetVault", [
      nftContract.address,
      claimAmount,
    ]);

    // Fund faucet vault
    await faucetVault.write.deposit({ value: parseEther("10") });
  });

  it("Should complete full flow: verify -> mint -> claim", async function () {
    const uniqueIdentifier1 = "integration-test-1";
    const faceMatchPassed1 = true;
    const personhoodVerified1 = true;

    // Step 1: User self-verifies and mints NFT directly (new flow)
    await nftContract.write.mintWithVerification([
      uniqueIdentifier1,
      faceMatchPassed1,
      personhoodVerified1,
    ], { account: user1.account });

    // Step 2: Verify NFT was minted
    const nftBalance = await nftContract.read.balanceOf([user1Address]);
    assert.equal(nftBalance, 1n);

    const tokenId = 0n;
    const tokenData = await nftContract.read.getTokenData([tokenId]);
    assert.equal(tokenData.uniqueIdentifier, uniqueIdentifier1);
    assert.equal(tokenData.faceMatchPassed, faceMatchPassed1);
    assert.equal(tokenData.personhoodVerified, personhoodVerified1);

    // Step 3: User claims from faucet
    const initialVaultBalance = await faucetVault.read.getBalance();
    await faucetVault.write.claim({ account: user1.account });
    const newVaultBalance = await faucetVault.read.getBalance();
    
    // Verify vault balance decreased by claim amount
    assert.equal(newVaultBalance, initialVaultBalance - claimAmount);

    // Verify claim was recorded
    const hasClaimed = await faucetVault.read.hasClaimed([user1Address]);
    assert.equal(hasClaimed, true);
  });

  it("Should handle multiple users with different verification results", async function () {
    // User 2: Self-verification with both verifications passed
    const uniqueIdentifier2 = "integration-test-2";

    // User 2 self-verifies and mints directly (new flow)
    await nftContract.write.mintWithVerification([
      uniqueIdentifier2,
      true,  // faceMatchPassed
      true,  // personhoodVerified
    ], { account: user2.account });

    // Verify NFT was minted with correct data
    const tokenId2 = 1n;
    const tokenData2 = await nftContract.read.getTokenData([tokenId2]);
    assert.equal(tokenData2.faceMatchPassed, true);
    assert.equal(tokenData2.personhoodVerified, true);

    // User 2 claims from faucet
    const initialVaultBalance2 = await faucetVault.read.getBalance();
    await faucetVault.write.claim({ account: user2.account });
    const newVaultBalance2 = await faucetVault.read.getBalance();
    
    // Verify vault balance decreased by claim amount
    assert.equal(newVaultBalance2, initialVaultBalance2 - claimAmount);
  });

  it("Should prevent duplicate mints and claims", async function () {
    // Try to mint with same identifier using self-verification
    const uniqueIdentifier = "integration-test-1"; // Already used

    try {
      // Try self-verification with already used identifier
      await nftContract.write.mintWithVerification([
        uniqueIdentifier,
        true,
        true,
      ], { account: user2.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("identifier already used"));
    }

    // Try to claim again from user1
    try {
      await faucetVault.write.claim({ account: user1.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("already claimed"));
    }
  });

  it("Should verify simplified two-contract system", async function () {
    // Mint another NFT (simplified process)
    const uniqueIdentifier = "integration-test-3";
    const [newUser] = await viem.getWalletClients();
    const newUserAddress = newUser.account.address;

    // Backend approves and user mints
    await nftContract.write.approveVerification([
      uniqueIdentifier,
      newUserAddress,
      true,
      true,
    ]);

    await nftContract.write.mint([uniqueIdentifier], { account: newUser.account });

    // Verify NFT was minted
    const nftBalance = await nftContract.read.balanceOf([newUserAddress]);
    assert.equal(nftBalance, 1n);

    // Verify user can claim from faucet
    const initialVaultBalance3 = await faucetVault.read.getBalance();
    await faucetVault.write.claim({ account: newUser.account });
    const newVaultBalance3 = await faucetVault.read.getBalance();
    
    // Verify vault balance decreased by claim amount
    assert.equal(newVaultBalance3, initialVaultBalance3 - claimAmount);
  });
});

