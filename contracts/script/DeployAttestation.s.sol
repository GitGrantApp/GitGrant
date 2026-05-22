// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Script.sol";
import {BountyAttestation} from "../src/BountyAttestation.sol";

contract DeployAttestation is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address escrow = vm.envAddress("ESCROW_ADDRESS");

        vm.startBroadcast(deployerKey);
        BountyAttestation attestation = new BountyAttestation(escrow);
        console.log("BountyAttestation deployed:", address(attestation));
        vm.stopBroadcast();
    }
}
