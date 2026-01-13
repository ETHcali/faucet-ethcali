import assert from "node:assert/strict";
import { describe, it, before } from "node:test";
import { network } from "hardhat";

const USDC_DECIMALS = 6n;
const USDC = (n: number) => BigInt(n) * 10n ** USDC_DECIMALS;

describe("Swag1155", async function () {
  const { viem } = await network.connect();
  const [deployer, buyer, buyer2, treasury] = await viem.getWalletClients();

  let usdc: any;
  let swag: any;

  const BASE_URI = "https://wallet.ethcali.org/metadata/{id}.json";

  before(async function () {
    // Deploy MockUSDC
    usdc = await viem.deployContract("MockUSDC", []);

    // Mint USDC to buyers
    await usdc.write.mint([buyer.account.address, USDC(1000)]);
    await usdc.write.mint([buyer2.account.address, USDC(1000)]);

    // Deploy Swag1155
    swag = await viem.deployContract("Swag1155", [BASE_URI, usdc.address, treasury.account.address]);
  });

  it("Initial configuration set correctly", async function () {
    // OZ ERC1155 returns the base URI; clients replace {id}
    assert.equal(await swag.read.uri([0n]), BASE_URI);
    const usdcAddr = await swag.read.usdc();
    const treasAddr = await swag.read.treasury();
    assert.equal(usdcAddr.toLowerCase(), usdc.address.toLowerCase());
    assert.equal(treasAddr.toLowerCase(), treasury.account.address.toLowerCase());
  });

  it("Admin can upsert variant and users can buy", async function () {
    const tokenId = 102n; // Product 1, size 02 (M)

    // Upsert variant: price 25 USDC, maxSupply 100, active
    await swag.write.setVariant([tokenId, USDC(25), 100n, true]);

    // Approve USDC
    await usdc.write.approve([swag.address, USDC(1000)], { account: buyer.account });

    // Buy 2 units
    await swag.write.buy([tokenId, 2n], { account: buyer.account });

    const bal = await swag.read.balanceOf([buyer.account.address, tokenId]);
    assert.equal(bal, 2n);

    const v = await swag.read.getVariant([tokenId]);
    assert.equal(v.minted, 2n);
    assert.equal(v.price, USDC(25));
    assert.equal(v.maxSupply, 100n);

    // Treasury received 50 USDC
    const tBal = await usdc.read.balanceOf([treasury.account.address]);
    assert.equal(tBal, USDC(50));
  });

  it("Enforces supply limits and active status", async function () {
    const tokenId = 103n; // Product 1, size 03 (L)

    await swag.write.setVariant([tokenId, USDC(15), 3n, false]);

    // Inactive should revert
    try {
      await swag.write.buy([tokenId, 1n], { account: buyer.account });
      assert.fail("Should revert for inactive variant");
    } catch (e: any) {
      assert(e.message.includes("variant inactive"));
    }

    // Activate and test supply enforcement
    await swag.write.setVariant([tokenId, USDC(15), 3n, true]);
    await usdc.write.approve([swag.address, USDC(100)], { account: buyer.account });

    await swag.write.buy([tokenId, 2n], { account: buyer.account });

    // Exceed remaining
    try {
      await swag.write.buy([tokenId, 2n], { account: buyer.account });
      assert.fail("Should revert for exceeds supply");
    } catch (e: any) {
      assert(e.message.includes("exceeds supply"));
    }
  });

  it("Batch purchase works with single payment", async function () {
    const ids = [201n, 202n];
    const qtys = [1n, 3n];

    await swag.write.setVariant([ids[0], USDC(10), 10n, true]);
    await swag.write.setVariant([ids[1], USDC(5), 10n, true]);

    const total = USDC(10) + USDC(5) * 3n; // 25 USDC

    await usdc.write.approve([swag.address, USDC(100)], { account: buyer2.account });
    const tBefore = await usdc.read.balanceOf([treasury.account.address]);

    await swag.write.buyBatch([ids, qtys], { account: buyer2.account });

    const b1 = await swag.read.balanceOf([buyer2.account.address, ids[0]]);
    const b2 = await swag.read.balanceOf([buyer2.account.address, ids[1]]);
    assert.equal(b1, 1n);
    assert.equal(b2, 3n);

    const tAfter = await usdc.read.balanceOf([treasury.account.address]);
    assert.equal(tAfter - tBefore, total);

    const v201 = await swag.read.getVariant([ids[0]]);
    const v202 = await swag.read.getVariant([ids[1]]);
    assert.equal(v201.minted, 1n);
    assert.equal(v202.minted, 3n);
  });

  it("Reverts on zero quantity and length mismatch", async function () {
    const id = 301n;
    await swag.write.setVariant([id, USDC(1), 10n, true]);
    await usdc.write.approve([swag.address, USDC(10)], { account: buyer.account });

    try {
      await swag.write.buy([id, 0n], { account: buyer.account });
      assert.fail("Should revert invalid quantity");
    } catch (e: any) {
      assert(e.message.includes("invalid quantity"));
    }

    try {
      await swag.write.buyBatch([[id], [1n, 2n]], { account: buyer.account } as any);
      assert.fail("Should revert length mismatch");
    } catch (e: any) {
      assert(e.message.includes("length mismatch"));
    }
  });

  it("Admin can set variant with per-token URI", async function () {
    const tokenId = 401n;
    const metadataURI = "ipfs://QmAbc123/metadata.json";

    await swag.write.setVariantWithURI([
      tokenId,
      USDC(30),
      50n,
      true,
      metadataURI,
    ]);

    const v = await swag.read.getVariant([tokenId]);
    assert.equal(v.price, USDC(30));
    assert.equal(v.maxSupply, 50n);
    assert.equal(v.active, true);

    const uri = await swag.read.uri([tokenId]);
    assert.equal(uri, metadataURI);
  });

  it("Per-token URI overrides baseURI", async function () {
    const tokenId = 402n;
    const metadataURI = "ipfs://QmCustom/token.json";

    await swag.write.setVariantWithURI([tokenId, USDC(20), 20n, true, metadataURI]);

    const uri = await swag.read.uri([tokenId]);
    assert.equal(uri, metadataURI);

    // Token without per-token URI should use baseURI
    const tokenId2 = 403n;
    await swag.write.setVariant([tokenId2, USDC(20), 20n, true]);

    const uri2 = await swag.read.uri([tokenId2]);
    assert(uri2.includes(BASE_URI) || uri2.includes("0000000000000000000000000000000000000000000000000000000000000193"));
  });
});
