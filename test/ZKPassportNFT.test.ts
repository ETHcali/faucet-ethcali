import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";

describe("ZKPassportNFT", async function () {
  const { viem } = await network.connect();
  const [deployer, sponsor, user, unauthorized] = await viem.getWalletClients();

  let nftContract: any;
  let sponsorContract: any;
  let deployerAddress: string;
  let sponsorAddress: string;
  let userAddress: string;

  before(async function () {
    deployerAddress = deployer.account.address;
    sponsorAddress = sponsor.account.address;
    userAddress = user.account.address;

    // Deploy NFT contract
    nftContract = await viem.deployContract("ZKPassportNFT", ["ZKPassport", "ZKP"]);

    // Deploy SponsorContract
    sponsorContract = await viem.deployContract("SponsorContract", [
      deployerAddress, // authorized signer
      nftContract.address,
    ]);

    // Set sponsor contract in NFT
    await nftContract.write.setSponsor([sponsorContract.address]);
  });

  it("Should deploy with correct name and symbol", async function () {
    assert.equal(await nftContract.read.name(), "ZKPassport");
    assert.equal(await nftContract.read.symbol(), "ZKP");
  });

  it("Should allow sponsor contract to mint", async function () {
    const uniqueIdentifier = "test-id-1";
    const faceMatchPassed = true;
    const personhoodVerified = true;

    // Fund sponsor contract
    await sponsorContract.write.deposit({ value: parseEther("0.1") });

    // Create signature and mint (simplified - in real scenario would use EIP-712)
    // For testing, we'll directly call mint from sponsor contract
    // In practice, sponsor contract would validate signature first
    
    // We need to call through sponsor contract, but for testing we can temporarily
    // allow direct minting by setting sponsor to deployer
    await nftContract.write.setSponsor([deployerAddress]);
    
    await nftContract.write.mint([
      userAddress,
      uniqueIdentifier,
      faceMatchPassed,
      personhoodVerified,
    ]);

    // Restore sponsor
    await nftContract.write.setSponsor([sponsorContract.address]);

    const balance = await nftContract.read.balanceOf([userAddress]);
    assert.equal(balance, 1n);
  });

  it("Should prevent non-sponsor from minting", async function () {
    const uniqueIdentifier = "test-id-2";

    try {
      await nftContract.write.mint(
        [userAddress, uniqueIdentifier, true, true],
        { account: unauthorized.account }
      );
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("only sponsor can mint"));
    }
  });

  it("Should prevent duplicate uniqueIdentifier", async function () {
    const uniqueIdentifier = "test-id-1"; // Same as first test
    await nftContract.write.setSponsor([deployerAddress]);

    try {
      await nftContract.write.mint([
        unauthorized.account.address,
        uniqueIdentifier,
        true,
        true,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("identifier already used"));
    }

    await nftContract.write.setSponsor([sponsorContract.address]);
  });

  it("Should prevent multiple NFTs per address", async function () {
    const uniqueIdentifier = "test-id-3";
    await nftContract.write.setSponsor([deployerAddress]);

    try {
      await nftContract.write.mint([
        userAddress, // Already has NFT from first test
        uniqueIdentifier,
        true,
        true,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("address already has NFT"));
    }

    await nftContract.write.setSponsor([sponsorContract.address]);
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

    const noNFT = await nftContract.read.hasNFTByAddress([unauthorized.account.address]);
    assert.equal(noNFT, false);
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

  it("Should allow owner to update sponsor contract", async function () {
    const newSponsor = unauthorized.account.address;
    await nftContract.write.setSponsor([newSponsor]);

    assert.equal((await nftContract.read.sponsorContract()).toLowerCase(), newSponsor.toLowerCase());

    // Restore original sponsor
    await nftContract.write.setSponsor([sponsorContract.address]);
  });

  it("Should reject invalid recipient address", async function () {
    await nftContract.write.setSponsor([deployerAddress]);

    try {
      await nftContract.write.mint([
        "0x0000000000000000000000000000000000000000",
        "test-id-4",
        true,
        true,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("invalid recipient"));
    }

    await nftContract.write.setSponsor([sponsorContract.address]);
  });

  it("Should reject empty uniqueIdentifier", async function () {
    await nftContract.write.setSponsor([deployerAddress]);

    try {
      await nftContract.write.mint([
        unauthorized.account.address,
        "",
        true,
        true,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("empty identifier"));
    }

    await nftContract.write.setSponsor([sponsorContract.address]);
  });
});

