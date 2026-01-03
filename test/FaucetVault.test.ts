import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";
import { parseEther } from "viem";

describe("FaucetVault", async function () {
  const { viem } = await network.connect();
  const [deployer, user, nonHolder, anotherUser] = await viem.getWalletClients();

  let faucetVault: any;
  let nftContract: any;
  let sponsorContract: any;
  let deployerAddress: string;
  let userAddress: string;
  let claimAmount: bigint;

  before(async function () {
    deployerAddress = deployer.account.address;
    userAddress = user.account.address;
    claimAmount = parseEther("0.01");

    // Deploy NFT contract
    nftContract = await viem.deployContract("ZKPassportNFT", ["ZKPassport", "ZKP"]);

    // Deploy SponsorContract
    sponsorContract = await viem.deployContract("SponsorContract", [
      deployerAddress,
      nftContract.address,
    ]);

    // Set sponsor contract in NFT
    await nftContract.write.setSponsor([sponsorContract.address]);

    // Deploy FaucetVault
    faucetVault = await viem.deployContract("FaucetVault", [
      nftContract.address,
      claimAmount,
    ]);

    // Mint NFT to user for testing
    await nftContract.write.setSponsor([deployerAddress]);
    await nftContract.write.mint([
      userAddress,
      "test-user-1",
      true,
      true,
    ]);
    await nftContract.write.setSponsor([sponsorContract.address]);
  });

  it("Should deploy with correct initial values", async function () {
    const nftAddr = await faucetVault.read.nftContract();
    assert.equal(nftAddr.toLowerCase(), nftContract.address.toLowerCase());
    assert.equal(await faucetVault.read.claimAmount(), claimAmount);
    assert.equal(await faucetVault.read.getBalance(), 0n);
  });

  it("Should allow owner to deposit ETH", async function () {
    const depositAmount = parseEther("1");
    await faucetVault.write.deposit({ value: depositAmount });

    const balance = await faucetVault.read.getBalance();
    assert.equal(balance, depositAmount);
  });

  it("Should allow NFT holder to claim ETH", async function () {
    const publicClient = await viem.getPublicClient();
    const initialBalance = await publicClient.getBalance({ address: userAddress });
    
    const txHash = await faucetVault.write.claim({ account: user.account });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    const gasUsed = receipt.gasUsed * receipt.gasPrice;

    const newBalance = await publicClient.getBalance({ address: userAddress });
    // Account for gas costs
    assert(newBalance >= initialBalance + claimAmount - gasUsed, "Balance should increase by claim amount minus gas");

    // Verify claim was recorded
    const hasClaimed = await faucetVault.read.hasClaimed([userAddress]);
    assert.equal(hasClaimed, true);
  });

  it("Should prevent second claim from same address", async function () {
    try {
      await faucetVault.write.claim({ account: user.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("already claimed"));
    }
  });

  it("Should prevent non-NFT holder from claiming", async function () {
    try {
      await faucetVault.write.claim({ account: nonHolder.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("must own ZKPassport NFT"));
    }
  });

  it("Should prevent claim when vault has insufficient balance", async function () {
    // Withdraw all funds
    const balance = await faucetVault.read.getBalance();
    await faucetVault.write.withdraw([balance]);

    // Mint NFT to another user
    await nftContract.write.setSponsor([deployerAddress]);
    await nftContract.write.mint([
      anotherUser.account.address,
      "test-user-2",
      true,
      true,
    ]);
    await nftContract.write.setSponsor([sponsorContract.address]);

    try {
      await faucetVault.write.claim({ account: anotherUser.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("insufficient balance"));
    }
  });

  it("Should allow owner to update claim amount", async function () {
    const newAmount = parseEther("0.02");
    await faucetVault.write.updateClaimAmount([newAmount]);

    assert.equal(await faucetVault.read.claimAmount(), newAmount);

    // Restore original amount
    await faucetVault.write.updateClaimAmount([claimAmount]);
  });

  it("Should prevent non-owner from updating claim amount", async function () {
    const newAmount = parseEther("0.02");

    try {
      await faucetVault.write.updateClaimAmount([newAmount], {
        account: user.account,
      });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("Ownable"));
    }
  });

  it("Should allow owner to withdraw ETH", async function () {
    // Deposit some ETH first
    await faucetVault.write.deposit({ value: parseEther("0.5") });

    const initialBalance = await faucetVault.read.getBalance();
    const withdrawAmount = parseEther("0.2");

    await faucetVault.write.withdraw([withdrawAmount]);

    const newBalance = await faucetVault.read.getBalance();
    assert.equal(newBalance, initialBalance - withdrawAmount);
  });

  it("Should prevent non-owner from withdrawing", async function () {
    const withdrawAmount = parseEther("0.1");

    try {
      await faucetVault.write.withdraw([withdrawAmount], {
        account: user.account,
      });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("Ownable"));
    }
  });

  it("Should allow owner to pause contract", async function () {
    await faucetVault.write.pause();

    // Try to claim while paused
    // First, mint NFT to a new user and deposit funds
    await nftContract.write.setSponsor([deployerAddress]);
    const pausedUser = nonHolder.account.address;
    await nftContract.write.mint([
      pausedUser,
      "test-user-paused",
      true,
      true,
    ]);
    await nftContract.write.setSponsor([sponsorContract.address]);
    await faucetVault.write.deposit({ value: claimAmount });

    try {
      await faucetVault.write.claim({ account: nonHolder.account });
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("Pausable") || error.message.includes("paused"));
    }

    // Unpause
    await faucetVault.write.unpause();
  });

  it("Should allow owner to update NFT contract", async function () {
    // Deploy new NFT contract
    const newNFT = await viem.deployContract("ZKPassportNFT", ["ZKPassport", "ZKP"]);

    await faucetVault.write.setNFTContract([newNFT.address]);
    const nftAddr = await faucetVault.read.nftContract();
    assert.equal(nftAddr.toLowerCase(), newNFT.address.toLowerCase());

    // Restore original NFT contract
    await faucetVault.write.setNFTContract([nftContract.address]);
  });

  it("Should reject invalid claim amount update", async function () {
    try {
      await faucetVault.write.updateClaimAmount([0n]);
      assert.fail("Should have reverted");
    } catch (error: any) {
      assert(error.message.includes("claim amount must be > 0"));
    }
  });
});

