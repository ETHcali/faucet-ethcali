/**
 * Backend Integration Example
 * 
 * This file demonstrates how to integrate ZKPassport SDK with the smart contracts
 * to enable gasless NFT minting for verified users.
 * 
 * In a real implementation, this would be part of your Express.js/Node.js backend service.
 * 
 * NOTE: This is a reference implementation. To use this code:
 * 1. Install dependencies: npm install @zkpassport/sdk viem
 * 2. Install types: npm install --save-dev @types/node
 * 3. Configure tsconfig.json to include "node" in types and "dom" in lib if needed
 * 4. Update import paths for contract ABIs based on your build output
 */

import { ZKPassport } from "@zkpassport/sdk";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { signTypedData } from "viem";

// Configuration - load from environment variables
const ZKPASSPORT_DOMAIN = process.env.ZKPASSPORT_DOMAIN || "your-domain.com";
const BACKEND_SIGNER_PRIVATE_KEY = process.env.BACKEND_SIGNER_PRIVATE_KEY || "";
const SPONSOR_CONTRACT_ADDRESS = process.env.SPONSOR_CONTRACT_ADDRESS || "";
const NFT_CONTRACT_ADDRESS = process.env.NFT_CONTRACT_ADDRESS || "";
const RPC_URL = process.env.BASE_RPC_URL || process.env.ETHEREUM_RPC_URL || "";

// Database interface (implement with your preferred database)
interface VerificationRecord {
  uniqueIdentifier: string;
  userAddress: string;
  faceMatchPassed: boolean;
  personhoodVerified: boolean;
  tokenId?: number;
  mintedAt?: Date;
  createdAt: Date;
}

// Mock database (replace with your actual database)
const verifications: Map<string, VerificationRecord> = new Map();

/**
 * Initialize ZKPassport SDK
 */
const zkPassport = new ZKPassport(ZKPASSPORT_DOMAIN);

/**
 * Request ZKPassport verification with facematch and personhood
 * @param userAddress The wallet address of the user
 * @returns QR code URL and request ID
 */
export async function requestVerification(userAddress: string) {
  const queryBuilder = await zkPassport.request({
    name: "ETHCALI Faucet",
    logo: "https://ethcali.com/logo.png",
    purpose: "Prove your liveness and personhood to access ETHCALI Smart Contracts",
    scope: "ethcali-faucet",
  });

  const { url, requestId, onResult } = queryBuilder
    .facematch("strict") // Use strict mode for better security
    .done();

  // Set up result handler
  onResult(async ({ verified, result, uniqueIdentifier }) => {
    if (verified) {
      const faceMatchPassed = result.facematch?.passed || false;
      const personhoodVerified = uniqueIdentifier !== undefined;

      // Store verification results
      const record: VerificationRecord = {
        uniqueIdentifier: uniqueIdentifier || "",
        userAddress,
        faceMatchPassed,
        personhoodVerified,
        createdAt: new Date(),
      };

      verifications.set(uniqueIdentifier || "", record);

      // Automatically mint NFT if both verifications passed
      if (faceMatchPassed && personhoodVerified) {
        await mintNFT(record);
      }
    } else {
      console.error("Verification failed for user:", userAddress);
    }
  });

  return { url, requestId };
}

/**
 * Mint NFT using sponsor contract (gasless)
 * @param record Verification record
 */
async function mintNFT(record: VerificationRecord) {
  try {
    // Create wallet client for signing
    const account = privateKeyToAccount(BACKEND_SIGNER_PRIVATE_KEY as `0x${string}`);
    const chain = RPC_URL.includes("base") ? base : mainnet;
    const walletClient = createWalletClient({
      account,
      chain,
      transport: http(RPC_URL),
    });

    // Get chain ID
    const publicClient = await walletClient.getPublicClient();
    const chainId = await publicClient.getChainId();

    // Generate nonce (use timestamp or database counter)
    const nonce = BigInt(Date.now());
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour

    // Create EIP-712 signature
    const domain = {
      name: "ZKPassportSponsor",
      version: "1",
      chainId,
      verifyingContract: SPONSOR_CONTRACT_ADDRESS as `0x${string}`,
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
      to: record.userAddress as `0x${string}`,
      uniqueIdentifier: record.uniqueIdentifier,
      faceMatchPassed: record.faceMatchPassed,
      personhoodVerified: record.personhoodVerified,
      nonce,
      deadline,
    };

    const signature = await signTypedData({
      account,
      domain,
      types,
      primaryType: "MintRequest",
      message,
    });

    // Call sponsor contract (backend pays minimal gas)
    const { abi: sponsorABI } = await import("../artifacts/contracts/SponsorContract.sol/SponsorContract.json");
    
    const hash = await walletClient.writeContract({
      address: SPONSOR_CONTRACT_ADDRESS as `0x${string}`,
      abi: sponsorABI,
      functionName: "sponsorMint",
      args: [message, signature],
    });

    // Wait for transaction
    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    // Extract token ID from events (if needed)
    // Update record with token ID
    record.mintedAt = new Date();
    verifications.set(record.uniqueIdentifier, record);

    console.log(`✓ NFT minted for ${record.userAddress}, tx: ${hash}`);
    return { hash, receipt };
  } catch (error) {
    console.error("Error minting NFT:", error);
    throw error;
  }
}

/**
 * Get verification status
 * @param uniqueIdentifier ZKPassport unique identifier
 * @returns Verification record or null
 */
export function getVerificationStatus(uniqueIdentifier: string): VerificationRecord | null {
  return verifications.get(uniqueIdentifier) || null;
}

/**
 * Check sponsor contract balance
 */
export async function checkSponsorBalance() {
  const publicClient = await createWalletClient({
    transport: http(RPC_URL),
  }).getPublicClient();

  const { abi: sponsorABI } = await import("../artifacts/contracts/SponsorContract.sol/SponsorContract.json");
  
  const balance = await publicClient.readContract({
    address: SPONSOR_CONTRACT_ADDRESS as `0x${string}`,
    abi: sponsorABI,
    functionName: "getBalance",
  });

  return balance;
}

/**
 * Example Express.js API endpoints
 * 
 * app.post('/api/verify', async (req, res) => {
 *   const { userAddress } = req.body;
 *   const { url, requestId } = await requestVerification(userAddress);
 *   res.json({ url, requestId });
 * });
 * 
 * app.get('/api/verification/:identifier', (req, res) => {
 *   const record = getVerificationStatus(req.params.identifier);
 *   res.json(record);
 * });
 * 
 * app.get('/api/sponsor/balance', async (req, res) => {
 *   const balance = await checkSponsorBalance();
 *   res.json({ balance: balance.toString() });
 * });
 */

