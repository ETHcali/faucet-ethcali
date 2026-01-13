import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { configVariable, defineConfig } from "hardhat/config";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, hardhatVerify],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
    ethereum: {
      type: "http",
      chainType: "l1",
      url: configVariable("ETHEREUM_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
    base: {
      type: "http",
      chainType: "l1",
      url: configVariable("BASE_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
    unichain: {
      type: "http",
      chainType: "l1",
      url: configVariable("UNICHAIN_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("BASESCAN_API_KEY"),
    },
  },
});
