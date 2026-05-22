// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";
import {BountyAttestation} from "../src/BountyAttestation.sol";

contract DeployGitGrant is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address arbiter = vm.envAddress("ARBITER_ADDRESS");
        uint256 feeBps = vm.envOr("FEE_BPS", uint256(300)); // default 3%

        // OWNER_ADDRESS should be a multisig (Gnosis Safe) on mainnet.
        // Falls back to the deployer address for testnet convenience.
        address deployer = vm.addr(deployerKey);
        address owner = vm.envOr("OWNER_ADDRESS", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Deploy escrow (deployer is temporary owner)
        BountyEscrow escrow = new BountyEscrow(arbiter, feeBps);
        console.log("BountyEscrow deployed:", address(escrow));

        // 2. Deploy attestation (linked to escrow)
        BountyAttestation attestation = new BountyAttestation(address(escrow));
        console.log("BountyAttestation deployed:", address(attestation));

        // 3. Transfer ownership to multisig — deployer key has no further admin power
        if (owner != deployer) {
            escrow.transferOwnership(owner);
            console.log("Ownership transferred to:", owner);
        }

        vm.stopBroadcast();

        // Log summary
        console.log("---");
        console.log("Chain ID:", block.chainid);
        console.log("Owner:", owner);
        console.log("Arbiter:", arbiter);
        console.log("Fee BPS:", feeBps);
    }
}
