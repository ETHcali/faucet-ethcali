import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";

describe("ZKPassportNFT", async function () {
  const { viem } = await network.connect();
  const [deployer, user, unauthorized, extraUser1, extraUser2] = await viem.getWalletClients();

  let nftContract: any;
  let deployerAddress: string;
  let userAddress: string;

  before(async function () {
    deployerAddress = deployer.account.address;
    userAddress = user.account.address;

    // Deploy NFT contract with deployer as initial owner
    nftContract = await viem.deployContract("ZKPassportNFT", [
      "ZKPassport",
      "ZKP",
      deployerAddress, // initialOwner
    ]);
  });

  it("Should deploy with correct name and symbol", async function () {
    assert.equal(await nftContract.read.name(), "ZKPassport");
    assert.equal(await nftContract.read.symbol(), "ZKP");
  });

  it("Should allow user to mint with approved verification", async function () {
    const uniqueIdentifier = "test-id-1";
    const faceMatchPassed = true;
    const personhoodVerified = true;

    // Step 1: Owner approves verification
    await nftContract.write.approveVerification([
      uniqueIdentifier,
      userAddress,
      faceMatchPassed,
      personhoodVerified,
    ]);

    // Step 2: User mints with approved verification
    await nftContract.write.mint([uniqueIdentifier], { account: user.account });

    const balance = await nftContract.read.balanceOf([userAddress]);
    assert.equal(balance, 1n);
  });

  it("Should prevent user from minting without approval", async function () {
    const uniqueIdentifier = "test-id-no-approval";

    try {
      await nftContract.write.mint([uniqueIdentifier], { account: user.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("verification not approved"));
    }
  });

  it("Should allow user to self-verify and mint directly", async function () {
    const uniqueIdentifier = "test-self-verify-1";

    // User directly mints with their verification data
    await nftContract.write.mintWithVerification([
      uniqueIdentifier,
      true,  // faceMatchPassed
      true,  // personhoodVerified
    ], { account: unauthorized.account }); // Using unauthorized account to avoid NFT conflict

    const balance = await nftContract.read.balanceOf([unauthorized.account.address]);
    assert.equal(balance, 1n);

    // Check token data
    const tokenId = 1n; // Second NFT minted
    const data = await nftContract.read.getTokenData([tokenId]);
    assert.equal(data.uniqueIdentifier, uniqueIdentifier);
    assert.equal(data.faceMatchPassed, true);
    assert.equal(data.personhoodVerified, true);
  });

  it("Should prevent unauthorized user from minting approved verification", async function () {
    const uniqueIdentifier = "test-id-unauthorized";

    // Approve for extraUser1 (who doesn't have an NFT yet)
    await nftContract.write.approveVerification([
      uniqueIdentifier,
      extraUser1.account.address,
      true,
      true,
    ]);

    try {
      await nftContract.write.mint([uniqueIdentifier], { account: user.account }); // User tries to mint extraUser1's verification
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("not authorized for this verification"));
    }
  });

  it("Should prevent duplicate self-verification with same identifier", async function () {
    const uniqueIdentifier = "test-duplicate-self";

    // First mint succeeds with deployer account
    await nftContract.write.mintWithVerification([
      uniqueIdentifier,
      true,
      true,
    ], { account: deployer.account });

    // Second mint with same identifier should fail
    try {
      await nftContract.write.mintWithVerification([
        uniqueIdentifier,
        true,
        true,
      ], { account: unauthorized.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("identifier already used"));
    }
  });

  it("Should prevent self-verification if address already has NFT", async function () {
    const uniqueIdentifier = "test-multiple-nft";

    try {
      await nftContract.write.mintWithVerification([
        uniqueIdentifier,
        true,
        true,
      ], { account: user.account }); // User already has NFT from previous test
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("address already has NFT"));
    }
  });

  it("Should reject self-verification with empty identifier", async function () {
    try {
      await nftContract.write.mintWithVerification([
        "",
        true,
        true,
      ], { account: unauthorized.account }); // Using unauthorized account
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("empty identifier"));
    }
  });

  it("Should prevent duplicate uniqueIdentifier", async function () {
    const uniqueIdentifier = "test-id-1"; // Same as first test

    try {
      // Try to approve the same identifier again
      await nftContract.write.approveVerification([
        uniqueIdentifier,
        unauthorized.account.address,
        true,
        true,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("identifier already used"));
    }
  });

  it("Should prevent multiple NFTs per address", async function () {
    const uniqueIdentifier = "test-id-3";

    try {
      // Try to approve for user who already has NFT
      await nftContract.write.approveVerification([
        uniqueIdentifier,
        userAddress, // Already has NFT from first test
        true,
        true,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("address already has NFT"));
    }
  });

  it("Should return correct token data", async function () {
    const tokenId = 0n;
    const data = await nftContract.read.getTokenData([tokenId]);

    assert.equal(data.uniqueIdentifier, "test-id-1");
    assert.equal(data.faceMatchPassed, true);
    assert.equal(data.personhoodVerified, true);
  });

  it("Should check if identifier has been used", async function () {
    const used = await nftContract.read.hasNFT(["test-id-1"]);
    assert.equal(used, true);

    const notUsed = await nftContract.read.hasNFT(["new-id"]);
    assert.equal(notUsed, false);
  });

  it("Should check if address has NFT", async function () {
    const hasNFT = await nftContract.read.hasNFTByAddress([userAddress]);
    assert.equal(hasNFT, true);

    // Check deployer who has NFT from duplicate test
    const deployerHasNFT = await nftContract.read.hasNFTByAddress([deployerAddress]);
    assert.equal(deployerHasNFT, true);
  });

  it("Should generate token URI", async function () {
    const tokenId = 0n;
    const uri = await nftContract.read.tokenURI([tokenId]);

    assert(uri.startsWith("data:application/json;base64,"), "URI should start with data:application/json;base64,");
    // Decode and check content
    const base64Data = uri.replace("data:application/json;base64,", "");
    const jsonString = Buffer.from(base64Data, "base64").toString("utf-8");
    const metadata = JSON.parse(jsonString);
    assert(metadata.name.includes("ZKPassport"), "Metadata should include ZKPassport");
    assert(metadata.attributes.length > 0, "Metadata should have attributes");
  });

  it("Should prevent transfers (soulbound)", async function () {
    const tokenId = 0n;

    try {
      await nftContract.write.transferFrom([
        userAddress,
        unauthorized.account.address,
        tokenId,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("soulbound") || error.message.includes("transfers not allowed"));
    }
  });

  it("Should reject invalid recipient address", async function () {
    const uniqueIdentifier = "test-invalid-recipient";
    
    // Approve for extraUser2 (who doesn't have an NFT yet)
    await nftContract.write.approveVerification([
      uniqueIdentifier,
      extraUser2.account.address,
      true,
      true,
    ]);

    // Try to mint from user account (different from approved account)
    try {
      await nftContract.write.mint([uniqueIdentifier], { account: user.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("not authorized for this verification"));
    }
  });

  it("Should reject empty uniqueIdentifier", async function () {
    // Try to mint with empty identifier (should fail at empty check)
    try {
      await nftContract.write.mint([""], { account: user.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("empty identifier"));
    }
  });
});

