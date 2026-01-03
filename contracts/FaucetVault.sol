// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./ZKPassportNFT.sol";

/**
 * @title FaucetVault
 * @notice Vault that distributes ETH to ZKPassport NFT holders
 * @dev One-time claim per NFT holder, admin-controlled
 */
contract FaucetVault is Ownable, ReentrancyGuard, Pausable {
    // Address of the ZKPassportNFT contract
    ZKPassportNFT public nftContract;

    // Amount of ETH that can be claimed per NFT holder
    uint256 public claimAmount;

    // Mapping to track which addresses have claimed
    mapping(address => bool) public hasClaimed;

    // Events
    event Claimed(address indexed claimant, uint256 amount);
    event ClaimAmountUpdated(uint256 oldAmount, uint256 newAmount);
    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event NFTContractUpdated(address indexed oldContract, address indexed newContract);

    /**
     * @notice Constructor
     * @param _nftContract Address of the ZKPassportNFT contract
     * @param _claimAmount Initial claim amount in wei
     */
    constructor(address _nftContract, uint256 _claimAmount) Ownable(msg.sender) {
        require(_nftContract != address(0), "FaucetVault: invalid NFT contract");
        require(_claimAmount > 0, "FaucetVault: claim amount must be > 0");
        
        nftContract = ZKPassportNFT(_nftContract);
        claimAmount = _claimAmount;
    }

    /**
     * @notice Claim ETH from the faucet (one-time per NFT holder)
     */
    function claim() external nonReentrant whenNotPaused {
        require(!hasClaimed[msg.sender], "FaucetVault: already claimed");
        require(nftContract.hasNFTByAddress(msg.sender), "FaucetVault: must own ZKPassport NFT");
        require(address(this).balance >= claimAmount, "FaucetVault: insufficient balance");

        hasClaimed[msg.sender] = true;

        (bool success, ) = payable(msg.sender).call{value: claimAmount}("");
        require(success, "FaucetVault: transfer failed");

        emit Claimed(msg.sender, claimAmount);
    }

    /**
     * @notice Update the claim amount (admin only)
     * @param newAmount New claim amount in wei
     */
    function updateClaimAmount(uint256 newAmount) external onlyOwner {
        require(newAmount > 0, "FaucetVault: claim amount must be > 0");
        uint256 oldAmount = claimAmount;
        claimAmount = newAmount;
        emit ClaimAmountUpdated(oldAmount, newAmount);
    }

    /**
     * @notice Deposit ETH to the vault (admin only)
     */
    function deposit() external payable onlyOwner {
        require(msg.value > 0, "FaucetVault: must send ETH");
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the vault (admin only)
     * @param amount Amount to withdraw in wei
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "FaucetVault: amount must be > 0");
        require(address(this).balance >= amount, "FaucetVault: insufficient balance");

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "FaucetVault: withdrawal failed");

        emit Withdrawn(owner(), amount);
    }

    /**
     * @notice Update the NFT contract address (admin only)
     * @param newContract New NFT contract address
     */
    function setNFTContract(address newContract) external onlyOwner {
        require(newContract != address(0), "FaucetVault: invalid contract");
        address oldContract = address(nftContract);
        nftContract = ZKPassportNFT(newContract);
        emit NFTContractUpdated(oldContract, newContract);
    }

    /**
     * @notice Pause the contract (admin only)
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @notice Unpause the contract (admin only)
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Get the vault's ETH balance
     * @return The vault balance in wei
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Allow contract to receive ETH
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }
}

