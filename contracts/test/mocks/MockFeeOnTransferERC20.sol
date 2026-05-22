// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @dev ERC-20 that silently takes 1% on every transferFrom (USDT-style).
/// Used to verify escrow is undercollateralized when such tokens are deposited.
contract MockFeeOnTransferERC20 {
    string public name = "Fee Token";
    string public symbol = "FEE";
    uint8 public decimals = 6;

    uint256 public constant TRANSFER_FEE_BPS = 100; // 1%

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        uint256 fee = (amount * TRANSFER_FEE_BPS) / 10000;
        uint256 received = amount - fee;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += received;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 fee = (amount * TRANSFER_FEE_BPS) / 10000;
        uint256 received = amount - fee;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += received;
        return true;
    }
}
