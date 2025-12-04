// FashionRecFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract FashionRecFHE is SepoliaConfig {
    struct EncryptedUserProfile {
        uint256 id;
        euint32 encryptedStylePreferences;
        euint32 encryptedBrowseHistory;
        euint32 encryptedSizeInfo;
        uint256 timestamp;
    }
    
    struct Recommendation {
        euint32 encryptedOutfitScore;
        euint32 encryptedCompatibilityScore;
        euint32 encryptedTrendScore;
    }

    struct DecryptedUserProfile {
        string stylePreferences;
        string browseHistory;
        string sizeInfo;
        bool isRevealed;
    }

    uint256 public userCount;
    mapping(uint256 => EncryptedUserProfile) public encryptedUserProfiles;
    mapping(uint256 => DecryptedUserProfile) public decryptedUserProfiles;
    mapping(uint256 => Recommendation) public recommendations;
    
    mapping(uint256 => uint256) private requestToUserId;
    
    event ProfileCreated(uint256 indexed id, uint256 timestamp);
    event RecommendationRequested(uint256 indexed userId);
    event RecommendationGenerated(uint256 indexed userId);
    event DecryptionRequested(uint256 indexed userId);
    event ProfileDecrypted(uint256 indexed userId);
    
    modifier onlyUser(uint256 userId) {
        _;
    }
    
    function createEncryptedProfile(
        euint32 encryptedStylePreferences,
        euint32 encryptedBrowseHistory,
        euint32 encryptedSizeInfo
    ) public {
        userCount += 1;
        uint256 newId = userCount;
        
        encryptedUserProfiles[newId] = EncryptedUserProfile({
            id: newId,
            encryptedStylePreferences: encryptedStylePreferences,
            encryptedBrowseHistory: encryptedBrowseHistory,
            encryptedSizeInfo: encryptedSizeInfo,
            timestamp: block.timestamp
        });
        
        decryptedUserProfiles[newId] = DecryptedUserProfile({
            stylePreferences: "",
            browseHistory: "",
            sizeInfo: "",
            isRevealed: false
        });
        
        emit ProfileCreated(newId, block.timestamp);
    }
    
    function requestProfileDecryption(uint256 userId) public onlyUser(userId) {
        EncryptedUserProfile storage profile = encryptedUserProfiles[userId];
        require(!decryptedUserProfiles[userId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(profile.encryptedStylePreferences);
        ciphertexts[1] = FHE.toBytes32(profile.encryptedBrowseHistory);
        ciphertexts[2] = FHE.toBytes32(profile.encryptedSizeInfo);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptProfile.selector);
        requestToUserId[reqId] = userId;
        
        emit DecryptionRequested(userId);
    }
    
    function decryptProfile(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 userId = requestToUserId[requestId];
        require(userId != 0, "Invalid request");
        
        EncryptedUserProfile storage eProfile = encryptedUserProfiles[userId];
        DecryptedUserProfile storage dProfile = decryptedUserProfiles[userId];
        require(!dProfile.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dProfile.stylePreferences = results[0];
        dProfile.browseHistory = results[1];
        dProfile.sizeInfo = results[2];
        dProfile.isRevealed = true;
        
        emit ProfileDecrypted(userId);
    }
    
    function requestFashionRecommendation(uint256 userId) public onlyUser(userId) {
        require(encryptedUserProfiles[userId].id != 0, "User not found");
        
        emit RecommendationRequested(userId);
    }
    
    function submitRecommendation(
        uint256 userId,
        euint32 encryptedOutfitScore,
        euint32 encryptedCompatibilityScore,
        euint32 encryptedTrendScore
    ) public {
        recommendations[userId] = Recommendation({
            encryptedOutfitScore: encryptedOutfitScore,
            encryptedCompatibilityScore: encryptedCompatibilityScore,
            encryptedTrendScore: encryptedTrendScore
        });
        
        emit RecommendationGenerated(userId);
    }
    
    function requestRecommendationDecryption(uint256 userId, uint8 scoreType) public onlyUser(userId) {
        Recommendation storage rec = recommendations[userId];
        require(FHE.isInitialized(rec.encryptedOutfitScore), "No recommendations available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (scoreType == 0) {
            ciphertexts[0] = FHE.toBytes32(rec.encryptedOutfitScore);
        } else if (scoreType == 1) {
            ciphertexts[0] = FHE.toBytes32(rec.encryptedCompatibilityScore);
        } else if (scoreType == 2) {
            ciphertexts[0] = FHE.toBytes32(rec.encryptedTrendScore);
        } else {
            revert("Invalid score type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptRecommendation.selector);
        requestToUserId[reqId] = userId * 10 + scoreType;
    }
    
    function decryptRecommendation(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToUserId[requestId];
        uint256 userId = compositeId / 10;
        uint8 scoreType = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string memory result = abi.decode(cleartexts, (string));
    }
    
    function getDecryptedProfile(uint256 userId) public view returns (
        string memory stylePreferences,
        string memory browseHistory,
        string memory sizeInfo,
        bool isRevealed
    ) {
        DecryptedUserProfile storage p = decryptedUserProfiles[userId];
        return (p.stylePreferences, p.browseHistory, p.sizeInfo, p.isRevealed);
    }
    
    function hasRecommendations(uint256 userId) public view returns (bool) {
        return FHE.isInitialized(recommendations[userId].encryptedOutfitScore);
    }
}