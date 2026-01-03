// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IZKPassportNFT {
    function mint(
        address to,
        string memory uniqueIdentifier,
        bool faceMatchPassed,
        bool personhoodVerified
    ) external;
}

/**
 * @title SponsorContract
 * @notice Smart contract that holds ETH and sponsors gasless NFT mints
 * @dev Validates mint requests with EIP-712 signatures and sponsors the mint operation
 */
contract SponsorContract is Ownable, ReentrancyGuard, EIP712 {
    using ECDSA for bytes32;

    // EIP-712 type hash for MintRequest
    bytes32 private constant MINT_REQUEST_TYPE_HASH =
        keccak256(
            "MintRequest(address to,string uniqueIdentifier,bool faceMatchPassed,bool personhoodVerified,uint256 nonce,uint256 deadline)"
        );

    struct MintRequest {
        address to;
        string uniqueIdentifier;
        bool faceMatchPassed;
        bool personhoodVerified;
        uint256 nonce;
        uint256 deadline;
    }

    // Address of the authorized backend signer
    address public authorizedSigner;

    // Address of the ZKPassportNFT contract
    IZKPassportNFT public nftContract;

    // Mapping to track used nonces (prevents replay attacks)
    mapping(uint256 => bool) public usedNonces;

    // Events
    event MintSponsored(
        address indexed to,
        string uniqueIdentifier,
        bool faceMatchPassed,
        bool personhoodVerified,
        uint256 nonce
    );
    event AuthorizedSignerUpdated(address indexed oldSigner, address indexed newSigner);
    event NFTContractUpdated(address indexed oldContract, address indexed newContract);
    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    /**
     * @notice Constructor
     * @param _authorizedSigner Address of the backend signer
     * @param _nftContract Address of the ZKPassportNFT contract
     */
    constructor(address _authorizedSigner, address _nftContract) Ownable(msg.sender) EIP712("ZKPassportSponsor", "1") {
        require(_authorizedSigner != address(0), "SponsorContract: invalid signer");
        require(_nftContract != address(0), "SponsorContract: invalid NFT contract");
        
        authorizedSigner = _authorizedSigner;
        nftContract = IZKPassportNFT(_nftContract);
    }

    /**
     * @notice Sponsor and execute a mint operation
     * @param request The mint request data
     * @param signature The EIP-712 signature from the authorized signer
     */
    function sponsorMint(
        MintRequest memory request,
        bytes memory signature
    ) external nonReentrant {
        // Validate request
        require(request.to != address(0), "SponsorContract: invalid recipient");
        require(bytes(request.uniqueIdentifier).length > 0, "SponsorContract: empty identifier");
        require(request.deadline >= block.timestamp, "SponsorContract: signature expired");
        require(!usedNonces[request.nonce], "SponsorContract: nonce already used");

        // Verify signature
        bytes32 structHash = keccak256(
            abi.encode(
                MINT_REQUEST_TYPE_HASH,
                request.to,
                keccak256(bytes(request.uniqueIdentifier)),
                request.faceMatchPassed,
                request.personhoodVerified,
                request.nonce,
                request.deadline
            )
        );
        bytes32 hash = _hashTypedDataV4(structHash);
        address signer = hash.recover(signature);
        require(signer == authorizedSigner, "SponsorContract: invalid signature");

        // Mark nonce as used
        usedNonces[request.nonce] = true;

        // Sponsor the mint (contract pays gas)
        nftContract.mint(
            request.to,
            request.uniqueIdentifier,
            request.faceMatchPassed,
            request.personhoodVerified
        );

        emit MintSponsored(
            request.to,
            request.uniqueIdentifier,
            request.faceMatchPassed,
            request.personhoodVerified,
            request.nonce
        );
    }

    /**
     * @notice Deposit ETH to the contract
     */
    function deposit() external payable {
        require(msg.value > 0, "SponsorContract: must send ETH");
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the contract (admin only)
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 amount) external onlyOwner {
        require(amount > 0, "SponsorContract: amount must be > 0");
        require(address(this).balance >= amount, "SponsorContract: insufficient balance");
        
        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "SponsorContract: withdrawal failed");
        
        emit Withdrawn(owner(), amount);
    }

    /**
     * @notice Update the authorized signer address (admin only)
     * @param newSigner New authorized signer address
     */
    function setAuthorizedSigner(address newSigner) external onlyOwner {
        require(newSigner != address(0), "SponsorContract: invalid signer");
        address oldSigner = authorizedSigner;
        authorizedSigner = newSigner;
        emit AuthorizedSignerUpdated(oldSigner, newSigner);
    }

    /**
     * @notice Update the NFT contract address (admin only)
     * @param newContract New NFT contract address
     */
    function setNFTContract(address newContract) external onlyOwner {
        require(newContract != address(0), "SponsorContract: invalid contract");
        address oldContract = address(nftContract);
        nftContract = IZKPassportNFT(newContract);
        emit NFTContractUpdated(oldContract, newContract);
    }

    /**
     * @notice Get the contract's ETH balance
     * @return The contract balance in wei
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Check if a nonce has been used
     * @param nonce The nonce to check
     * @return True if the nonce has been used
     */
    function isNonceUsed(uint256 nonce) external view returns (bool) {
        return usedNonces[nonce];
    }

    // Allow contract to receive ETH
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }
}

