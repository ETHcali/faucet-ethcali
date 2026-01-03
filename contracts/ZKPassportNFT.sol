// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title ZKPassportNFT
 * @notice Soulbound ERC721 NFT representing ZKPassport verification
 * @dev Only the sponsor contract can mint. NFTs are soulbound (non-transferable)
 */
contract ZKPassportNFT is ERC721, ERC721URIStorage, Ownable {
    using Strings for uint256;

    // Address of the sponsor contract (only it can mint)
    address public sponsorContract;

    // Mapping to prevent duplicate uniqueIdentifiers
    mapping(string => bool) private _usedIdentifiers;

    // Mapping to prevent multiple NFTs per address
    mapping(address => bool) private _hasNFT;

    // Mapping to store token data
    mapping(uint256 => TokenData) private _tokenData;

    // Token counter
    uint256 private _tokenIdCounter;

    struct TokenData {
        string uniqueIdentifier;
        bool faceMatchPassed;
        bool personhoodVerified;
    }

    // Events
    event NFTMinted(
        address indexed to,
        uint256 indexed tokenId,
        string uniqueIdentifier,
        bool faceMatchPassed,
        bool personhoodVerified
    );
    event SponsorContractUpdated(address indexed oldSponsor, address indexed newSponsor);

    /**
     * @notice Constructor
     * @param name NFT name
     * @param symbol NFT symbol
     */
    constructor(string memory name, string memory symbol) ERC721(name, symbol) Ownable(msg.sender) {}

    /**
     * @notice Mint a new NFT (only callable by sponsor contract)
     * @param to Address to mint to
     * @param uniqueIdentifier ZKPassport unique identifier
     * @param faceMatchPassed Whether face match verification passed
     * @param personhoodVerified Whether personhood verification passed
     */
    function mint(
        address to,
        string memory uniqueIdentifier,
        bool faceMatchPassed,
        bool personhoodVerified
    ) external {
        require(msg.sender == sponsorContract, "ZKPassportNFT: only sponsor can mint");
        require(to != address(0), "ZKPassportNFT: invalid recipient");
        require(bytes(uniqueIdentifier).length > 0, "ZKPassportNFT: empty identifier");
        require(!_usedIdentifiers[uniqueIdentifier], "ZKPassportNFT: identifier already used");
        require(!_hasNFT[to], "ZKPassportNFT: address already has NFT");

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _usedIdentifiers[uniqueIdentifier] = true;
        _hasNFT[to] = true;
        _tokenData[tokenId] = TokenData({
            uniqueIdentifier: uniqueIdentifier,
            faceMatchPassed: faceMatchPassed,
            personhoodVerified: personhoodVerified
        });

        _safeMint(to, tokenId);
        _setTokenURI(tokenId, _generateTokenURI(tokenId));

        emit NFTMinted(to, tokenId, uniqueIdentifier, faceMatchPassed, personhoodVerified);
    }

    /**
     * @notice Set the sponsor contract address (admin only)
     * @param newSponsor New sponsor contract address
     */
    function setSponsor(address newSponsor) external onlyOwner {
        require(newSponsor != address(0), "ZKPassportNFT: invalid sponsor");
        address oldSponsor = sponsorContract;
        sponsorContract = newSponsor;
        emit SponsorContractUpdated(oldSponsor, newSponsor);
    }

    /**
     * @notice Check if an identifier has been used
     * @param uniqueIdentifier The identifier to check
     * @return True if the identifier has been used
     */
    function hasNFT(string memory uniqueIdentifier) external view returns (bool) {
        return _usedIdentifiers[uniqueIdentifier];
    }

    /**
     * @notice Check if an address has an NFT
     * @param user The address to check
     * @return True if the address has an NFT
     */
    function hasNFTByAddress(address user) external view returns (bool) {
        return _hasNFT[user];
    }

    /**
     * @notice Get token data
     * @param tokenId The token ID
     * @return TokenData struct with verification results
     */
    function getTokenData(uint256 tokenId) external view returns (TokenData memory) {
        require(_ownerOf(tokenId) != address(0), "ZKPassportNFT: token does not exist");
        return _tokenData[tokenId];
    }

    /**
     * @notice Override transfer functions to make NFT soulbound
     */
    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        // Allow minting (from address(0))
        if (auth == address(0)) {
            return super._update(to, tokenId, auth);
        }
        // Prevent all transfers (soulbound)
        revert("ZKPassportNFT: soulbound token - transfers not allowed");
    }

    /**
     * @notice Generate token URI with metadata
     * @param tokenId The token ID
     * @return Base64 encoded JSON metadata
     */
    function _generateTokenURI(uint256 tokenId) private view returns (string memory) {
        TokenData memory data = _tokenData[tokenId];
        
        string memory image = _generateSVG(tokenId, data);
        
        string memory json = Base64.encode(
            bytes(
                string(
                    abi.encodePacked(
                        '{"name":"ZKPassport Verification #',
                        tokenId.toString(),
                        '","description":"This is a proof of liveness and personhood respecting the privacy yours and enabling you to interact with the benefits of ETHCALI Smart Contracts.","image":"data:image/svg+xml;base64,',
                        Base64.encode(bytes(image)),
                        '","attributes":[',
                        '{"trait_type":"Face Match","value":"',
                        data.faceMatchPassed ? "Passed" : "Failed",
                        '"},',
                        '{"trait_type":"Personhood","value":"',
                        data.personhoodVerified ? "Verified" : "Not Verified",
                        '"},',
                        '{"trait_type":"Unique Identifier","value":"',
                        data.uniqueIdentifier,
                        '"}',
                        ']}'
                    )
                )
            )
        );

        return string(abi.encodePacked("data:application/json;base64,", json));
    }

    /**
     * @notice Generate SVG image for the NFT
     * @param tokenId The token ID
     * @param data The token data
     * @return SVG string
     */
    function _generateSVG(uint256 tokenId, TokenData memory data) private pure returns (string memory) {
        string memory faceMatchColor = data.faceMatchPassed ? "#10b981" : "#ef4444";
        string memory personhoodColor = data.personhoodVerified ? "#10b981" : "#ef4444";
        string memory faceMatchText = data.faceMatchPassed ? "Passed" : "Failed";
        string memory personhoodText = data.personhoodVerified ? "Verified" : "Not Verified";

        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
                '<rect width="400" height="400" fill="#1a1a1a"/>',
                '<text x="200" y="80" font-family="Arial, sans-serif" font-size="24" fill="#ffffff" text-anchor="middle" font-weight="bold">ZKPassport</text>',
                '<text x="200" y="110" font-family="Arial, sans-serif" font-size="16" fill="#9ca3af" text-anchor="middle">Verification #',
                tokenId.toString(),
                '</text>',
                '<circle cx="200" cy="180" r="50" fill="#3b82f6" opacity="0.3"/>',
                '<text x="200" y="190" font-family="Arial, sans-serif" font-size="32" fill="#3b82f6" text-anchor="middle">OK</text>',
                '<text x="200" y="260" font-family="Arial, sans-serif" font-size="18" fill="',
                faceMatchColor,
                '" text-anchor="middle">Face Match: ',
                faceMatchText,
                '</text>',
                '<text x="200" y="290" font-family="Arial, sans-serif" font-size="18" fill="',
                personhoodColor,
                '" text-anchor="middle">Personhood: ',
                personhoodText,
                '</text>',
                '<text x="200" y="350" font-family="Arial, sans-serif" font-size="12" fill="#6b7280" text-anchor="middle">ETHCALI</text>',
                '</svg>'
            )
        );
    }

    // Override tokenURI to use our generated URI
    function tokenURI(uint256 tokenId) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    // Override supportsInterface
    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}

