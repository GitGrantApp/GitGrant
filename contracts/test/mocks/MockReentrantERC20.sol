// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BountyEscrow} from "../../src/BountyEscrow.sol";

/// @dev ERC-20 that attempts a reentrant createBountyToken call during transferFrom.
/// Used to verify the nonReentrant guard blocks reentry even with CEI ordering.
contract MockReentrantERC20 {
    string public name = "Reentrant Token";
    string public symbol = "REEN";
    uint8 public decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    BountyEscrow public escrow;
    string public attackUri;
    uint256 public attackDeadline;
    bool public armed;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function arm(address _escrow, string calldata _uri, uint256 _deadline) external {
        escrow = BountyEscrow(_escrow);
        attackUri = _uri;
        attackDeadline = _deadline;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        if (armed) {
            armed = false; // prevent infinite loop
            // attempt reentrant call — should revert with reentrancy guard
            allowance[address(this)][address(escrow)] = amount;
            balanceOf[address(this)] = amount;
            escrow.createBountyToken(attackUri, address(this), amount, attackDeadline);
        }

        return true;
    }
}
