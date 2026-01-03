import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
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
  etherscan: {
    apiKey: {
      mainnet: configVariable("ETHERSCAN_API_KEY"),
      base: configVariable("BASESCAN_API_KEY"),
      baseSepolia: configVariable("BASESCAN_API_KEY"),
    },
    customChains: [
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.basescan.org/api",
          browserURL: "https://basescan.org",
        },
      },
    ],
  },
});
