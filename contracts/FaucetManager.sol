// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./ZKPassportNFT.sol";

/**
 * @title FaucetManager
 * @notice Multi-vault faucet system with returnable/non-returnable vault types and flexible access control
 * @dev Admin can create multiple vaults for different purposes (hackathons, staking, etc.)
 *      Vaults can optionally require ZKPassport NFT for anti-sybil protection.
 *      Vaults can optionally require whitelist or specific token/NFT holding for access control.
 */
contract FaucetManager is AccessControl, ReentrancyGuard, Pausable {
    // Role definitions
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // Vault types
    enum VaultType {
        NonReturnable,  // User keeps the ETH (gifts, grants)
        Returnable      // User expected to return ETH (hackathon deposits, staking)
    }

    // Vault configuration
    struct Vault {
        string name;            // e.g., "ETHGlobal Online 2026"
        string description;     // Purpose of this vault
        uint256 claimAmount;    // ETH per claim (in wei)
        uint256 balance;        // Current vault balance
        uint256 totalClaimed;   // Total ETH claimed from this vault
        uint256 totalReturned;  // Total ETH returned to this vault
        VaultType vaultType;    // Returnable or NonReturnable
        bool active;            // Whether vault accepts claims
        bool whitelistEnabled;  // Whether whitelist is required to claim
        bool zkPassportRequired; // Whether ZKPassport NFT is required
        address allowedToken;   // Token/NFT address required to claim (address(0) = no requirement)
        uint256 createdAt;      // Timestamp of creation
    }

    // User claim info per vault
    struct ClaimInfo {
        bool hasClaimed;        // Whether user has claimed
        uint256 claimedAmount;  // Amount claimed
        uint256 claimedAt;      // Timestamp of claim
        bool hasReturned;       // Whether user has returned (for Returnable vaults)
        uint256 returnedAmount; // Amount returned
        uint256 returnedAt;     // Timestamp of return
    }

    // ZKPassport NFT contract
    ZKPassportNFT public nftContract;

    // Vault storage
    uint256 public vaultCount;
    mapping(uint256 => Vault) public vaults;

    // Claims tracking: vaultId => user => ClaimInfo
    mapping(uint256 => mapping(address => ClaimInfo)) public claims;

    // Whitelist tracking: vaultId => user => isWhitelisted
    mapping(uint256 => mapping(address => bool)) public whitelist;

    // Track users who have returned (good actors) across all vaults
    mapping(address => uint256) public returnCount;

    // Events
    event VaultCreated(
        uint256 indexed vaultId,
        string name,
        VaultType vaultType,
        uint256 claimAmount,
        bool whitelistEnabled,
        bool zkPassportRequired,
        address allowedToken
    );
    event VaultGatingUpdated(uint256 indexed vaultId, bool zkPassportRequired, address allowedToken);
    event VaultUpdated(uint256 indexed vaultId, string name, string description, uint256 claimAmount, bool active);
    event VaultDeposit(uint256 indexed vaultId, address indexed depositor, uint256 amount);
    event VaultWithdraw(uint256 indexed vaultId, address indexed to, uint256 amount);
    event Claimed(uint256 indexed vaultId, address indexed user, uint256 amount);
    event Returned(uint256 indexed vaultId, address indexed user, uint256 amount);
    event NFTContractUpdated(address indexed oldContract, address indexed newContract);
    event WhitelistUpdated(uint256 indexed vaultId, bool enabled);
    event AddressWhitelisted(uint256 indexed vaultId, address indexed user);
    event AddressRemovedFromWhitelist(uint256 indexed vaultId, address indexed user);

    /**
     * @notice Constructor
     * @param _nftContract Address of the ZKPassportNFT contract
     * @param initialAdmin Address to set as admin (use address(0) for deployer)
     */
    constructor(address _nftContract, address initialAdmin) {
        require(_nftContract != address(0), "FaucetManager: invalid NFT contract");
        nftContract = ZKPassportNFT(_nftContract);

        address admin = initialAdmin == address(0) ? msg.sender : initialAdmin;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
    }

    // ============ Admin Functions ============

    /**
     * @notice Create a new vault
     * @param name Vault name (e.g., "ETHGlobal Online 2026")
     * @param description Vault purpose description
     * @param claimAmount Amount of ETH per claim (in wei)
     * @param vaultType Whether vault is Returnable or NonReturnable
     * @param whitelistEnabled Whether whitelist is required to claim
     * @param zkPassportRequired Whether ZKPassport NFT is required to claim
     * @param allowedToken Token/NFT address required to claim (address(0) to disable)
     */
    function createVault(
        string memory name,
        string memory description,
        uint256 claimAmount,
        VaultType vaultType,
        bool whitelistEnabled,
        bool zkPassportRequired,
        address allowedToken
    ) external onlyRole(ADMIN_ROLE) returns (uint256 vaultId) {
        require(bytes(name).length > 0, "FaucetManager: empty name");
        require(claimAmount > 0, "FaucetManager: claim amount must be > 0");

        vaultId = vaultCount;
        vaultCount++;

        vaults[vaultId] = Vault({
            name: name,
            description: description,
            claimAmount: claimAmount,
            balance: 0,
            totalClaimed: 0,
            totalReturned: 0,
            vaultType: vaultType,
            active: true,
            whitelistEnabled: whitelistEnabled,
            zkPassportRequired: zkPassportRequired,
            allowedToken: allowedToken,
            createdAt: block.timestamp
        });

        emit VaultCreated(vaultId, name, vaultType, claimAmount, whitelistEnabled, zkPassportRequired, allowedToken);
    }

    /**
     * @notice Update vault configuration
     * @param vaultId Vault ID to update
     * @param name New name
     * @param description New description
     * @param claimAmount New claim amount
     * @param active Whether vault is active
     */
    function updateVault(
        uint256 vaultId,
        string memory name,
        string memory description,
        uint256 claimAmount,
        bool active
    ) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        require(bytes(name).length > 0, "FaucetManager: empty name");
        require(claimAmount > 0, "FaucetManager: claim amount must be > 0");

        Vault storage vault = vaults[vaultId];
        vault.name = name;
        vault.description = description;
        vault.claimAmount = claimAmount;
        vault.active = active;

        emit VaultUpdated(vaultId, name, description, claimAmount, active);
    }

    /**
     * @notice Enable or disable whitelist for a vault
     * @param vaultId Vault ID
     * @param enabled Whether whitelist is enabled
     */
    function setWhitelistEnabled(uint256 vaultId, bool enabled) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        vaults[vaultId].whitelistEnabled = enabled;
        emit WhitelistUpdated(vaultId, enabled);
    }

    /**
     * @notice Add a single address to vault whitelist
     * @param vaultId Vault ID
     * @param user Address to whitelist
     */
    function addToWhitelist(uint256 vaultId, address user) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        require(user != address(0), "FaucetManager: invalid address");
        whitelist[vaultId][user] = true;
        emit AddressWhitelisted(vaultId, user);
    }

    /**
     * @notice Add multiple addresses to vault whitelist
     * @param vaultId Vault ID
     * @param users Array of addresses to whitelist
     */
    function addBatchToWhitelist(uint256 vaultId, address[] calldata users) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        for (uint256 i = 0; i < users.length; i++) {
            if (users[i] != address(0)) {
                whitelist[vaultId][users[i]] = true;
                emit AddressWhitelisted(vaultId, users[i]);
            }
        }
    }

    /**
     * @notice Remove address from vault whitelist
     * @param vaultId Vault ID
     * @param user Address to remove
     */
    function removeFromWhitelist(uint256 vaultId, address user) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        whitelist[vaultId][user] = false;
        emit AddressRemovedFromWhitelist(vaultId, user);
    }

    /**
     * @notice Remove multiple addresses from vault whitelist
     * @param vaultId Vault ID
     * @param users Array of addresses to remove
     */
    function removeBatchFromWhitelist(uint256 vaultId, address[] calldata users) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        for (uint256 i = 0; i < users.length; i++) {
            whitelist[vaultId][users[i]] = false;
            emit AddressRemovedFromWhitelist(vaultId, users[i]);
        }
    }

    /**
     * @notice Update vault gating configuration
     * @param vaultId Vault ID
     * @param zkPassportRequired Whether ZKPassport is required
     * @param allowedToken Token address for gating (address(0) to disable)
     */
    function updateVaultGating(
        uint256 vaultId,
        bool zkPassportRequired,
        address allowedToken
    ) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        vaults[vaultId].zkPassportRequired = zkPassportRequired;
        vaults[vaultId].allowedToken = allowedToken;
        emit VaultGatingUpdated(vaultId, zkPassportRequired, allowedToken);
    }

    /**
     * @notice Deposit ETH to a specific vault
     * @param vaultId Vault ID to deposit to
     */
    function deposit(uint256 vaultId) external payable onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        require(msg.value > 0, "FaucetManager: must send ETH");

        vaults[vaultId].balance += msg.value;

        emit VaultDeposit(vaultId, msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from a specific vault
     * @param vaultId Vault ID to withdraw from
     * @param amount Amount to withdraw
     */
    function withdraw(uint256 vaultId, uint256 amount) external onlyRole(ADMIN_ROLE) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        require(amount > 0, "FaucetManager: amount must be > 0");
        require(vaults[vaultId].balance >= amount, "FaucetManager: insufficient balance");

        vaults[vaultId].balance -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "FaucetManager: withdrawal failed");

        emit VaultWithdraw(vaultId, msg.sender, amount);
    }

    /**
     * @notice Update the NFT contract address
     * @param newContract New NFT contract address
     */
    function setNFTContract(address newContract) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newContract != address(0), "FaucetManager: invalid contract");
        address oldContract = address(nftContract);
        nftContract = ZKPassportNFT(newContract);
        emit NFTContractUpdated(oldContract, newContract);
    }

    /**
     * @notice Add a new admin
     * @param admin Address to grant admin role
     */
    function addAdmin(address admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(admin != address(0), "FaucetManager: invalid address");
        _grantRole(ADMIN_ROLE, admin);
    }

    /**
     * @notice Remove an admin
     * @param admin Address to revoke admin role
     */
    function removeAdmin(address admin) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _revokeRole(ADMIN_ROLE, admin);
    }

    /**
     * @notice Pause the contract
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause the contract
     */
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ============ User Functions ============

    /**
     * @notice Claim ETH from a vault (one-time per vault)
     * @param vaultId Vault ID to claim from
     */
    function claim(uint256 vaultId) external nonReentrant whenNotPaused {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");

        Vault storage vault = vaults[vaultId];
        require(vault.active, "FaucetManager: vault not active");
        require(vault.balance >= vault.claimAmount, "FaucetManager: insufficient vault balance");

        ClaimInfo storage userClaim = claims[vaultId][msg.sender];
        require(!userClaim.hasClaimed, "FaucetManager: already claimed from this vault");

        // Anti-sybil: require ZKPassport NFT (if enabled for this vault)
        if (vault.zkPassportRequired) {
            require(nftContract.hasNFTByAddress(msg.sender), "FaucetManager: must own ZKPassport NFT");
        }

        // Check whitelist if enabled
        if (vault.whitelistEnabled) {
            require(whitelist[vaultId][msg.sender], "FaucetManager: not whitelisted");
        }

        // Check allowed token/NFT holding if configured
        if (vault.allowedToken != address(0)) {
            uint256 balance;
            try IERC721(vault.allowedToken).balanceOf(msg.sender) returns (uint256 bal) {
                balance = bal;
            } catch {
                balance = IERC20(vault.allowedToken).balanceOf(msg.sender);
            }
            require(balance > 0, "FaucetManager: must hold required token");
        }

        // Update state
        userClaim.hasClaimed = true;
        userClaim.claimedAmount = vault.claimAmount;
        userClaim.claimedAt = block.timestamp;

        vault.balance -= vault.claimAmount;
        vault.totalClaimed += vault.claimAmount;

        // Transfer ETH
        (bool success, ) = payable(msg.sender).call{value: vault.claimAmount}("");
        require(success, "FaucetManager: transfer failed");

        emit Claimed(vaultId, msg.sender, vault.claimAmount);
    }

    /**
     * @notice Return ETH to a returnable vault (voluntary)
     * @param vaultId Vault ID to return to
     */
    function returnFunds(uint256 vaultId) external payable nonReentrant whenNotPaused {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");

        Vault storage vault = vaults[vaultId];
        require(vault.vaultType == VaultType.Returnable, "FaucetManager: vault is not returnable");

        ClaimInfo storage userClaim = claims[vaultId][msg.sender];
        require(userClaim.hasClaimed, "FaucetManager: must claim first");
        require(!userClaim.hasReturned, "FaucetManager: already returned");
        require(msg.value > 0, "FaucetManager: must send ETH");

        // Update state
        userClaim.hasReturned = true;
        userClaim.returnedAmount = msg.value;
        userClaim.returnedAt = block.timestamp;

        vault.balance += msg.value;
        vault.totalReturned += msg.value;

        // Track good actor
        returnCount[msg.sender]++;

        emit Returned(vaultId, msg.sender, msg.value);
    }

    // ============ View Functions ============

    /**
     * @notice Get vault details
     * @param vaultId Vault ID
     */
    function getVault(uint256 vaultId) external view returns (Vault memory) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        return vaults[vaultId];
    }

    /**
     * @notice Get all vaults
     * @return Array of all vaults
     */
    function getAllVaults() external view returns (Vault[] memory) {
        Vault[] memory allVaults = new Vault[](vaultCount);
        for (uint256 i = 0; i < vaultCount; i++) {
            allVaults[i] = vaults[i];
        }
        return allVaults;
    }

    /**
     * @notice Get active vaults only
     * @return Array of active vaults and their IDs
     */
    function getActiveVaults() external view returns (uint256[] memory, Vault[] memory) {
        // Count active vaults
        uint256 activeCount = 0;
        for (uint256 i = 0; i < vaultCount; i++) {
            if (vaults[i].active) activeCount++;
        }

        // Build arrays
        uint256[] memory ids = new uint256[](activeCount);
        Vault[] memory activeVaults = new Vault[](activeCount);
        uint256 j = 0;
        for (uint256 i = 0; i < vaultCount; i++) {
            if (vaults[i].active) {
                ids[j] = i;
                activeVaults[j] = vaults[i];
                j++;
            }
        }
        return (ids, activeVaults);
    }

    /**
     * @notice Get user's claim info for a specific vault
     * @param vaultId Vault ID
     * @param user User address
     */
    function getClaimInfo(uint256 vaultId, address user) external view returns (ClaimInfo memory) {
        require(vaultId < vaultCount, "FaucetManager: vault does not exist");
        return claims[vaultId][user];
    }

    /**
     * @notice Check if user is whitelisted for a vault
     * @param vaultId Vault ID
     * @param user User address
     */
    function isWhitelisted(uint256 vaultId, address user) external view returns (bool) {
        return whitelist[vaultId][user];
    }

    /**
     * @notice Check if user can claim from a vault
     * @param vaultId Vault ID
     * @param user User address
     * @return canClaim Whether user can claim
     * @return reason Reason if cannot claim
     */
    function canUserClaim(uint256 vaultId, address user) external view returns (bool canClaim, string memory reason) {
        if (vaultId >= vaultCount) return (false, "Vault does not exist");

        Vault storage vault = vaults[vaultId];
        if (!vault.active) return (false, "Vault not active");
        if (vault.balance < vault.claimAmount) return (false, "Insufficient vault balance");
        if (claims[vaultId][user].hasClaimed) return (false, "Already claimed from this vault");
        if (vault.zkPassportRequired && !nftContract.hasNFTByAddress(user)) return (false, "Must own ZKPassport NFT");
        if (vault.whitelistEnabled && !whitelist[vaultId][user]) return (false, "Not whitelisted");
        if (vault.allowedToken != address(0)) {
            try IERC721(vault.allowedToken).balanceOf(user) returns (uint256 bal) {
                if (bal == 0) return (false, "Must hold required token");
            } catch {
                if (IERC20(vault.allowedToken).balanceOf(user) == 0) return (false, "Must hold required token");
            }
        }

        return (true, "");
    }

    /**
     * @notice Get user's claim status across all vaults
     * @param user User address
     * @return vaultIds Array of vault IDs
     * @return claimInfos Array of claim info
     */
    function getUserClaims(address user) external view returns (uint256[] memory vaultIds, ClaimInfo[] memory claimInfos) {
        vaultIds = new uint256[](vaultCount);
        claimInfos = new ClaimInfo[](vaultCount);

        for (uint256 i = 0; i < vaultCount; i++) {
            vaultIds[i] = i;
            claimInfos[i] = claims[i][user];
        }
    }

    /**
     * @notice Check if user is a "good actor" (has returned funds)
     * @param user User address
     * @return Number of times user has returned funds
     */
    function getReturnCount(address user) external view returns (uint256) {
        return returnCount[user];
    }

    /**
     * @notice Check if address is admin
     * @param account Address to check
     */
    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    /**
     * @notice Check if address is super admin
     * @param account Address to check
     */
    function isSuperAdmin(address account) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, account);
    }

    // Allow contract to receive ETH (for returns or direct deposits)
    receive() external payable {
        // ETH sent directly goes to vault 0 if it exists
        if (vaultCount > 0) {
            vaults[0].balance += msg.value;
            emit VaultDeposit(0, msg.sender, msg.value);
        }
    }
}
