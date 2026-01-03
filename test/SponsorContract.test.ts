import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";

describe("SponsorContract", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, authorizedSigner, user, unauthorizedSigner] = await viem.getWalletClients();

  let sponsorContract: any;
  let nftContract: any;
  let deployerAddress: string;
  let authorizedSignerAddress: string;
  let userAddress: string;

  before(async function () {
    deployerAddress = deployer.account.address;
    authorizedSignerAddress = authorizedSigner.account.address;
    userAddress = user.account.address;

    // Deploy ZKPassportNFT first
    nftContract = await viem.deployContract("ZKPassportNFT", ["ZKPassport", "ZKP"]);

    // Deploy SponsorContract
    sponsorContract = await viem.deployContract("SponsorContract", [
      authorizedSignerAddress,
      nftContract.address,
    ]);

    // Set sponsor contract in NFT
    await nftContract.write.setSponsor([sponsorContract.address]);
  });

  it("Should deploy with correct initial values", async function () {
    assert.equal(
      (await sponsorContract.read.authorizedSigner()).toLowerCase(),
      authorizedSignerAddress.toLowerCase()
    );
    assert.equal((await sponsorContract.read.nftContract()).toLowerCase(), nftContract.address.toLowerCase());
    assert.equal(await sponsorContract.read.getBalance(), 0n);
  });

  it("Should accept ETH deposits", async function () {
    const depositAmount = parseEther("1");
    await sponsorContract.write.deposit({ value: depositAmount });

    const balance = await sponsorContract.read.getBalance();
    assert.equal(balance, depositAmount);
  });

  it("Should allow owner to withdraw ETH", async function () {
    const initialBalance = await sponsorContract.read.getBalance();
    const withdrawAmount = parseEther("0.5");

    await sponsorContract.write.withdraw([withdrawAmount]);

    const newBalance = await sponsorContract.read.getBalance();
    assert.equal(newBalance, initialBalance - withdrawAmount);
  });

  it("Should prevent non-owner from withdrawing", async function () {
    const withdrawAmount = parseEther("0.1");
    
    try {
      await sponsorContract.write.withdraw([withdrawAmount], {
        account: user.account,
      });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("Ownable"));
    }
  });

  it("Should sponsor mint with valid signature", async function () {
    // Deposit ETH for gas
    await sponsorContract.write.deposit({ value: parseEther("0.1") });

    const uniqueIdentifier = "test-identifier-1";
    const faceMatchPassed = true;
    const personhoodVerified = true;
    const nonce = 1n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now

    // Create EIP-712 signature
    const domain = {
      name: "ZKPassportSponsor",
      version: "1",
      chainId: await publicClient.getChainId(),
      verifyingContract: sponsorContract.address as `0x${string}`,
    };

    const types = {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "uniqueIdentifier", type: "string" },
        { name: "faceMatchPassed", type: "bool" },
        { name: "personhoodVerified", type: "bool" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      to: userAddress,
      uniqueIdentifier,
      faceMatchPassed,
      personhoodVerified,
      nonce,
      deadline,
    };

    // Get the signer's private key (in real scenario, this would be the backend's key)
    // For testing, we'll use the authorizedSigner account
    const walletClient = await viem.getWalletClient(authorizedSigner.account.address);
    const signature = await walletClient.signTypedData({
      account: authorizedSigner.account,
      domain,
      types,
      primaryType: "MintRequest",
      message,
    });

    // Call sponsorMint
    await sponsorContract.write.sponsorMint([
      {
        to: userAddress,
        uniqueIdentifier,
        faceMatchPassed,
        personhoodVerified,
        nonce,
        deadline,
      },
      signature,
    ]);

    // Verify NFT was minted
    const balance = await nftContract.read.balanceOf([userAddress]);
    assert.equal(balance, 1n);

    // Verify nonce was marked as used
    const isUsed = await sponsorContract.read.isNonceUsed([nonce]);
    assert.equal(isUsed, true);
  });

  it("Should reject mint with invalid signature", async function () {
    const uniqueIdentifier = "test-identifier-2";
    const nonce = 2n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Create signature with unauthorized signer
    const domain = {
      name: "ZKPassportSponsor",
      version: "1",
      chainId: await publicClient.getChainId(),
      verifyingContract: sponsorContract.address as `0x${string}`,
    };

    const types = {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "uniqueIdentifier", type: "string" },
        { name: "faceMatchPassed", type: "bool" },
        { name: "personhoodVerified", type: "bool" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      to: userAddress,
      uniqueIdentifier,
      faceMatchPassed: true,
      personhoodVerified: true,
      nonce,
      deadline,
    };

    const walletClient = await viem.getWalletClient(unauthorizedSigner.account.address);
    const signature = await walletClient.signTypedData({
      account: unauthorizedSigner.account,
      domain,
      types,
      primaryType: "MintRequest",
      message,
    });

    try {
      await sponsorContract.write.sponsorMint([
        {
          to: userAddress,
          uniqueIdentifier,
          faceMatchPassed: true,
          personhoodVerified: true,
          nonce,
          deadline,
        },
        signature,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("invalid signature"));
    }
  });

  it("Should reject mint with expired deadline", async function () {
    const uniqueIdentifier = "test-identifier-3";
    const nonce = 3n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) - 3600); // 1 hour ago

    const domain = {
      name: "ZKPassportSponsor",
      version: "1",
      chainId: await publicClient.getChainId(),
      verifyingContract: sponsorContract.address as `0x${string}`,
    };

    const types = {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "uniqueIdentifier", type: "string" },
        { name: "faceMatchPassed", type: "bool" },
        { name: "personhoodVerified", type: "bool" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      to: userAddress,
      uniqueIdentifier,
      faceMatchPassed: true,
      personhoodVerified: true,
      nonce,
      deadline,
    };

    const walletClient = await viem.getWalletClient(authorizedSigner.account.address);
    const signature = await walletClient.signTypedData({
      account: authorizedSigner.account,
      domain,
      types,
      primaryType: "MintRequest",
      message,
    });

    try {
      await sponsorContract.write.sponsorMint([
        {
          to: userAddress,
          uniqueIdentifier,
          faceMatchPassed: true,
          personhoodVerified: true,
          nonce,
          deadline,
        },
        signature,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("signature expired"));
    }
  });

  it("Should reject mint with reused nonce", async function () {
    const uniqueIdentifier = "test-identifier-4";
    const nonce = 1n; // Reuse nonce from first test
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "ZKPassportSponsor",
      version: "1",
      chainId: await publicClient.getChainId(),
      verifyingContract: sponsorContract.address as `0x${string}`,
    };

    const types = {
      MintRequest: [
        { name: "to", type: "address" },
        { name: "uniqueIdentifier", type: "string" },
        { name: "faceMatchPassed", type: "bool" },
        { name: "personhoodVerified", type: "bool" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const message = {
      to: userAddress,
      uniqueIdentifier,
      faceMatchPassed: true,
      personhoodVerified: true,
      nonce,
      deadline,
    };

    const walletClient = await viem.getWalletClient(authorizedSigner.account.address);
    const signature = await walletClient.signTypedData({
      account: authorizedSigner.account,
      domain,
      types,
      primaryType: "MintRequest",
      message,
    });

    try {
      await sponsorContract.write.sponsorMint([
        {
          to: userAddress,
          uniqueIdentifier,
          faceMatchPassed: true,
          personhoodVerified: true,
          nonce,
          deadline,
        },
        signature,
      ]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("nonce already used"));
    }
  });

  it("Should allow owner to update authorized signer", async function () {
    const newSigner = unauthorizedSigner.account.address;
    await sponsorContract.write.setAuthorizedSigner([newSigner]);

    assert.equal((await sponsorContract.read.authorizedSigner()).toLowerCase(), newSigner.toLowerCase());

    // Restore original signer
    await sponsorContract.write.setAuthorizedSigner([authorizedSignerAddress]);
  });

  it("Should allow owner to update NFT contract", async function () {
    // Deploy new NFT contract
    const newNFT = await viem.deployContract("ZKPassportNFT", ["ZKPassport", "ZKP"]);
    
    await sponsorContract.write.setNFTContract([newNFT.address]);
    assert.equal((await sponsorContract.read.nftContract()).toLowerCase(), newNFT.address.toLowerCase());

    // Restore original NFT contract
    await sponsorContract.write.setNFTContract([nftContract.address]);
  });
});

