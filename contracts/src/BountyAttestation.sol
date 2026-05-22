// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";

/// @title BountyAttestation
/// @notice Issues onchain attestations for completed bounties
/// @dev Lightweight SBT-style record — non-transferable proof of work
contract BountyAttestation {
    struct Attestation {
        address contributor;
        bytes32 bountyId;
        string issueUri;
        address token;
        uint256 amount;
        uint256 completedAt;
    }

    mapping(uint256 => Attestation) public attestations;
    mapping(address => uint256[]) public contributorAttestations;
    uint256 public totalAttestations;

    address public escrow; // only escrow can mint

    event AttestationMinted(
        uint256 indexed id,
        address indexed contributor,
        bytes32 indexed bountyId,
        string issueUri,
        uint256 amount
    );

    error Unauthorized();

    modifier onlyEscrow() {
        if (msg.sender != escrow) revert Unauthorized();
        _;
    }

    constructor(address _escrow) {
        escrow = _escrow;
    }

    function mint(
        address contributor,
        bytes32 bountyId,
        string calldata issueUri,
        address token,
        uint256 amount
    ) external onlyEscrow returns (uint256 id) {
        id = totalAttestations++;
        attestations[id] = Attestation({
            contributor: contributor,
            bountyId: bountyId,
            issueUri: issueUri,
            token: token,
            amount: amount,
            completedAt: block.timestamp
        });
        contributorAttestations[contributor].push(id);

        emit AttestationMinted(id, contributor, bountyId, issueUri, amount);
    }

    function getContributorAttestations(
        address contributor
    ) external view returns (uint256[] memory) {
        return contributorAttestations[contributor];
    }

    function getAttestation(uint256 id) external view returns (Attestation memory) {
        return attestations[id];
    }
}
