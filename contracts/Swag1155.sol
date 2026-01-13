// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ETH Cali Swag (ERC-1155)
 * @notice Admin-managed onchain inventory for swag using ERC-1155.
 *         Users buy with USDC (6 decimals). Each size/variant is a tokenId.
 *         Supports multiple admins via AccessControl.
 */
contract Swag1155 is ERC1155, AccessControl, ReentrancyGuard {
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    struct Variant {
        uint256 price;      // USDC price (6 decimals)
        uint256 maxSupply;  // Total available stock
        uint256 minted;     // Already sold/minted
        bool active;        // Sale status
    }

    // Payment token (USDC)
    address public usdc;

    // Treasury receiver
    address public treasury;

    // Variants by tokenId
    mapping(uint256 => Variant) public variants;

    // Per-token metadata URIs (for dynamic product creation)
    mapping(uint256 => string) private _tokenURIs;

    // Track known tokenIds for optional iteration (not required but helpful)
    using EnumerableSet for EnumerableSet.UintSet;
    EnumerableSet.UintSet private _tokenIds;

    event Purchased(address indexed buyer, uint256 indexed tokenId, uint256 quantity, uint256 unitPrice, uint256 totalPrice);
    event PurchasedBatch(address indexed buyer, uint256[] tokenIds, uint256[] quantities, uint256 totalPrice);

    event VariantUpdated(uint256 indexed tokenId, uint256 price, uint256 maxSupply, bool active);
    event VariantURISet(uint256 indexed tokenId, string uri);
    event TreasuryUpdated(address indexed newTreasury);
    event USDCUpdated(address indexed newUSDC);
    event AdminAdded(address indexed admin);
    event AdminRemoved(address indexed admin);

    constructor(string memory baseURI, address _usdc, address _treasury) ERC1155(baseURI) {
        require(_usdc != address(0), "invalid USDC");
        require(_treasury != address(0), "invalid treasury");
        usdc = _usdc;
        treasury = _treasury;

        // Grant deployer the default admin role (can manage other roles)
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Grant deployer the admin role (can manage products)
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    // ---------- Admin Management ----------

    /**
     * @notice Add a new admin who can manage products
     * @param admin Address to grant admin role
     */
    function addAdmin(address admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(admin != address(0), "invalid address");
        _grantRole(ADMIN_ROLE, admin);
        emit AdminAdded(admin);
    }

    /**
     * @notice Remove an admin
     * @param admin Address to revoke admin role
     */
    function removeAdmin(address admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ADMIN_ROLE, admin);
        emit AdminRemoved(admin);
    }

    /**
     * @notice Check if an address is an admin
     * @param account Address to check
     */
    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    /**
     * @notice Check if an address is the super admin (can add/remove admins)
     * @param account Address to check
     */
    function isSuperAdmin(address account) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, account);
    }

    // ---------- Product Admin (ADMIN_ROLE) ----------

    function setTreasury(address newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newTreasury != address(0), "invalid treasury");
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function setUSDC(address newUSDC) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newUSDC != address(0), "invalid USDC");
        usdc = newUSDC;
        emit USDCUpdated(newUSDC);
    }

    /**
     * @notice Create or update a variant for tokenId
     * @dev maxSupply must be >= current minted to avoid invalid state
     */
    function setVariant(uint256 tokenId, uint256 price, uint256 maxSupply, bool active) external onlyRole(ADMIN_ROLE) {
        Variant storage v = variants[tokenId];
        require(maxSupply >= v.minted, "maxSupply < minted");
        v.price = price;
        v.maxSupply = maxSupply;
        v.active = active;
        _tokenIds.add(tokenId);
        emit VariantUpdated(tokenId, price, maxSupply, active);
    }

    /**
     * @notice Create a variant with a per-token metadata URI (for dynamic product creation)
     * @param tokenId Unique identifier for this variant
     * @param price USDC price (6 decimals)
     * @param maxSupply Maximum supply available
     * @param active Sale status
     * @param tokenURI Full IPFS URI for this token's metadata (e.g., ipfs://Qm.../metadata.json)
     */
    function setVariantWithURI(
        uint256 tokenId,
        uint256 price,
        uint256 maxSupply,
        bool active,
        string memory tokenURI
    ) external onlyRole(ADMIN_ROLE) {
        require(bytes(tokenURI).length > 0, "invalid URI");
        Variant storage v = variants[tokenId];
        require(maxSupply >= v.minted, "maxSupply < minted");
        v.price = price;
        v.maxSupply = maxSupply;
        v.active = active;
        _tokenURIs[tokenId] = tokenURI;
        _tokenIds.add(tokenId);
        emit VariantUpdated(tokenId, price, maxSupply, active);
        emit VariantURISet(tokenId, tokenURI);
    }

    function setBaseURI(string memory newURI) external onlyRole(ADMIN_ROLE) {
        _setURI(newURI);
    }

    // ---------- Views ----------

    function remaining(uint256 tokenId) public view returns (uint256) {
        Variant memory v = variants[tokenId];
        if (v.maxSupply <= v.minted) return 0;
        return v.maxSupply - v.minted;
    }

    function getVariant(uint256 tokenId) external view returns (Variant memory) {
        return variants[tokenId];
    }

    function listTokenIds() external view returns (uint256[] memory) {
        return _tokenIds.values();
    }

    /**
     * @notice Get metadata URI for a token (per-token or baseURI fallback)
     * @dev Returns per-token URI if set, otherwise uses baseURI
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenURI = _tokenURIs[tokenId];
        if (bytes(tokenURI).length > 0) {
            return tokenURI;
        }
        return super.uri(tokenId);
    }

    // ---------- Purchases ----------

    function buy(uint256 tokenId, uint256 quantity) external nonReentrant {
        require(quantity > 0, "invalid quantity");
        Variant storage v = variants[tokenId];
        require(v.active, "variant inactive");
        require(v.minted + quantity <= v.maxSupply, "exceeds supply");

        uint256 total = v.price * quantity;
        // Pull USDC from buyer to treasury
        IERC20(usdc).transferFrom(msg.sender, treasury, total);

        // Mint after successful payment
        v.minted += quantity;
        _mint(msg.sender, tokenId, quantity, "");

        emit Purchased(msg.sender, tokenId, quantity, v.price, total);
    }

    function buyBatch(uint256[] calldata tokenIds, uint256[] calldata quantities) external nonReentrant {
        require(tokenIds.length == quantities.length, "length mismatch");
        uint256 len = tokenIds.length;
        require(len > 0, "empty batch");

        uint256 total = 0;
        for (uint256 i = 0; i < len; i++) {
            uint256 tokenId = tokenIds[i];
            uint256 qty = quantities[i];
            require(qty > 0, "invalid quantity");
            Variant storage v = variants[tokenId];
            require(v.active, "variant inactive");
            require(v.minted + qty <= v.maxSupply, "exceeds supply");
            total += v.price * qty;
        }

        // Single payment for batch
        IERC20(usdc).transferFrom(msg.sender, treasury, total);

        // Update supply and mint
        for (uint256 i = 0; i < len; i++) {
            Variant storage v2 = variants[tokenIds[i]];
            v2.minted += quantities[i];
        }
        _mintBatch(msg.sender, tokenIds, quantities, "");

        emit PurchasedBatch(msg.sender, tokenIds, quantities, total);
    }

    // ---------- Required Overrides ----------

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
