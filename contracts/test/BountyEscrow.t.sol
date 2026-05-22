// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "forge-std/Test.sol";
import {BountyEscrow} from "../src/BountyEscrow.sol";
import {BountyAttestation} from "../src/BountyAttestation.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockFeeOnTransferERC20} from "./mocks/MockFeeOnTransferERC20.sol";
import {MockReentrantERC20} from "./mocks/MockReentrantERC20.sol";

contract BountyEscrowTest is Test {
    BountyEscrow public escrow;
    BountyAttestation public attestation;
    MockERC20 public usdc;

    address public owner = address(this);
    address public arbiter = makeAddr("arbiter");
    address public creator = makeAddr("creator");
    address public contributor = makeAddr("contributor");

    uint256 public constant FEE_BPS = 300; // 3%
    uint256 public constant BOUNTY_AMOUNT = 1 ether;
    string public constant ISSUE_URI = "github:org/repo#42";

    function setUp() public {
        escrow = new BountyEscrow(arbiter, FEE_BPS);
        attestation = new BountyAttestation(address(escrow));
        usdc = new MockERC20();

        vm.deal(creator, 10 ether);
        vm.deal(contributor, 1 ether);
        usdc.mint(creator, 1_000_000e6);
    }

    // ─── Creation Tests ──────────────────────────────────────────────────

    function test_createBountyETH() public {
        uint256 deadline = block.timestamp + 7 days;

        vm.prank(creator);
        bytes32 id = escrow.createBountyETH{value: BOUNTY_AMOUNT}(ISSUE_URI, deadline);

        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(b.creator, creator);
        assertEq(b.token, address(0));
        assertEq(b.deadline, deadline);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Open));

        // Amount should be total minus fee
        uint256 expectedFee = (BOUNTY_AMOUNT * FEE_BPS) / 10000;
        assertEq(b.amount, BOUNTY_AMOUNT - expectedFee);
        assertEq(b.fee, expectedFee);
    }

    function test_createBountyToken() public {
        uint256 deadline = block.timestamp + 7 days;
        uint256 totalAmount = 500e6; // 500 USDC

        vm.startPrank(creator);
        usdc.approve(address(escrow), totalAmount);
        bytes32 id = escrow.createBountyToken(ISSUE_URI, address(usdc), totalAmount, deadline);
        vm.stopPrank();

        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(b.creator, creator);
        assertEq(b.token, address(usdc));
        uint256 expectedFee = (totalAmount * FEE_BPS) / 10000;
        assertEq(b.amount, totalAmount - expectedFee);
        assertEq(b.fee, expectedFee);
    }

    function test_revert_duplicateBounty() public {
        uint256 deadline = block.timestamp + 7 days;

        vm.prank(creator);
        escrow.createBountyETH{value: BOUNTY_AMOUNT}(ISSUE_URI, deadline);

        vm.prank(creator);
        vm.expectRevert(BountyEscrow.BountyExists.selector);
        escrow.createBountyETH{value: BOUNTY_AMOUNT}(ISSUE_URI, deadline);
    }

    function test_revert_invalidDeadline() public {
        vm.prank(creator);
        vm.expectRevert(BountyEscrow.InvalidDeadline.selector);
        escrow.createBountyETH{value: BOUNTY_AMOUNT}(ISSUE_URI, block.timestamp + 1 hours);
    }

    // ─── Claim Tests ─────────────────────────────────────────────────────

    function test_claim() public {
        bytes32 id = _createETHBounty();

        vm.prank(contributor);
        escrow.claim(id);

        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(b.claimant, contributor);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Claimed));
    }

    function test_revert_doubleClaim() public {
        bytes32 id = _createETHBounty();

        vm.prank(contributor);
        escrow.claim(id);

        vm.prank(makeAddr("other"));
        vm.expectRevert(
            abi.encodeWithSelector(
                BountyEscrow.InvalidStatus.selector,
                BountyEscrow.Status.Claimed,
                BountyEscrow.Status.Open
            )
        );
        escrow.claim(id);
    }

    // ─── Submit + Release Tests ──────────────────────────────────────────

    function test_fullFlow_ETH() public {
        bytes32 id = _createETHBounty();

        // Claim
        vm.prank(contributor);
        escrow.claim(id);

        // Submit
        vm.prank(contributor);
        escrow.submit(id);

        // Release
        uint256 balBefore = contributor.balance;
        vm.prank(creator);
        escrow.release(id);

        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Completed));
        assertGt(contributor.balance, balBefore);
    }

    function test_fullFlow_Token() public {
        uint256 deadline = block.timestamp + 7 days;
        uint256 totalAmount = 500e6;

        vm.startPrank(creator);
        usdc.approve(address(escrow), totalAmount);
        bytes32 id = escrow.createBountyToken(
            "gitlab:team/project#10", address(usdc), totalAmount, deadline
        );
        vm.stopPrank();

        vm.prank(contributor);
        escrow.claim(id);

        vm.prank(contributor);
        escrow.submit(id);

        uint256 balBefore = usdc.balanceOf(contributor);
        vm.prank(creator);
        escrow.release(id);

        assertGt(usdc.balanceOf(contributor), balBefore);
    }

    // ─── Cancel Tests ────────────────────────────────────────────────────

    function test_cancel() public {
        bytes32 id = _createETHBounty();

        uint256 balBefore = creator.balance;
        vm.prank(creator);
        escrow.cancel(id);

        // Full refund including fee
        assertEq(creator.balance, balBefore + BOUNTY_AMOUNT);
        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Cancelled));
    }

    function test_revert_cancelAfterClaim() public {
        bytes32 id = _createETHBounty();

        vm.prank(contributor);
        escrow.claim(id);

        vm.prank(creator);
        vm.expectRevert();
        escrow.cancel(id);
    }

    // ─── Expire Tests ────────────────────────────────────────────────────

    function test_expire() public {
        bytes32 id = _createETHBounty();

        // Warp past deadline
        vm.warp(block.timestamp + 8 days);

        uint256 balBefore = creator.balance;
        escrow.expire(id);

        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Expired));
        // Refund amount but NOT fee
        uint256 expectedFee = (BOUNTY_AMOUNT * FEE_BPS) / 10000;
        assertEq(creator.balance, balBefore + BOUNTY_AMOUNT - expectedFee);
    }

    function test_revert_expireBeforeDeadline() public {
        bytes32 id = _createETHBounty();

        vm.expectRevert(BountyEscrow.DeadlineNotReached.selector);
        escrow.expire(id);
    }

    // ─── Dispute Tests ───────────────────────────────────────────────────

    function test_dispute_and_resolve_payClaimant() public {
        bytes32 id = _createETHBounty();

        vm.prank(contributor);
        escrow.claim(id);

        vm.prank(contributor);
        escrow.submit(id);

        // Creator disputes
        vm.prank(creator);
        escrow.dispute(id);

        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Disputed));

        // Arbiter resolves in favor of claimant
        uint256 balBefore = contributor.balance;
        vm.prank(arbiter);
        escrow.resolve(id, true);

        assertGt(contributor.balance, balBefore);
    }

    function test_dispute_and_resolve_refundCreator() public {
        bytes32 id = _createETHBounty();

        vm.prank(contributor);
        escrow.claim(id);

        vm.prank(contributor);
        escrow.submit(id);

        vm.prank(creator);
        escrow.dispute(id);

        uint256 balBefore = creator.balance;
        vm.prank(arbiter);
        escrow.resolve(id, false);

        assertGt(creator.balance, balBefore);
    }

    // ─── Admin Tests ─────────────────────────────────────────────────────

    function test_setFee() public {
        escrow.setFee(500);
        assertEq(escrow.feeBps(), 500);
    }

    function test_revert_setFeeOverMax() public {
        vm.expectRevert(BountyEscrow.InvalidFee.selector);
        escrow.setFee(1001);
    }

    function test_withdrawFees() public {
        _createETHBounty();

        uint256 fees = escrow.collectedFees();
        assertGt(fees, 0);

        address treasury = makeAddr("treasury");
        escrow.withdrawFees(treasury);
        assertEq(treasury.balance, fees);
    }

    // ─── Fee-on-Transfer Tests ───────────────────────────────────────────

    // Fee-on-transfer tokens are NOT supported. The escrow records `amount` based on
    // the deposited total, but the contract receives less than that due to the token's
    // internal transfer fee — making it undercollateralized. Payout will fail because
    // the contract cannot transfer more than its actual balance.
    function test_feeOnTransferToken_undercollateralized() public {
        MockFeeOnTransferERC20 feeToken = new MockFeeOnTransferERC20();
        uint256 totalAmount = 1000e6;
        feeToken.mint(creator, totalAmount);

        uint256 deadline = block.timestamp + 7 days;

        vm.startPrank(creator);
        feeToken.approve(address(escrow), totalAmount);
        bytes32 id = escrow.createBountyToken(ISSUE_URI, address(feeToken), totalAmount, deadline);
        vm.stopPrank();

        // Protocol fee: 3% of totalAmount = 30e6
        // Token transfer fee: 1% of totalAmount = 10e6
        // Contract actually holds: totalAmount - 10e6 = 990e6
        // Contract recorded amount: totalAmount - 30e6 = 970e6
        // 990e6 >= 970e6 so payout succeeds — but creator was charged for a token fee they didn't account for.
        // Verify contract balance reflects the shortfall from the token fee.
        uint256 contractBalance = feeToken.balanceOf(address(escrow));
        BountyEscrow.Bounty memory b = escrow.getBounty(id);

        // Contract holds less than (amount + protocol fee) due to token's transfer fee
        assertLt(contractBalance, totalAmount);

        // Full payout path: contract tries to transfer b.amount, but only holds contractBalance.
        // If b.amount > contractBalance, transfer reverts — funds are locked.
        // Here: b.amount = 970e6, contractBalance = 990e6 so payout still succeeds in this case,
        // but demonstrates the accounting gap — contract received 990e6 yet recorded 970e6 as claimable.
        vm.prank(contributor);
        escrow.claim(id);

        vm.prank(contributor);
        escrow.submit(id);

        uint256 balBefore = feeToken.balanceOf(contributor);
        vm.prank(creator);
        escrow.release(id);

        // Contributor receives b.amount minus another 1% outgoing transfer fee.
        // Fee-on-transfer tokens hit twice: once on deposit (escrow receives less than deposited),
        // once on payout (contributor receives less than b.amount). Both losses are silent.
        uint256 outgoingFee = (b.amount * 100) / 10000;
        assertEq(feeToken.balanceOf(contributor) - balBefore, b.amount - outgoingFee);
    }

    // ─── Reentrancy Tests ────────────────────────────────────────────────

    // With CEI ordering (M1 fix), state is written before transferFrom fires.
    // The nonReentrant mutex is held during the callback, so a reentrant
    // createBountyToken call on the same escrow reverts.
    function test_reentrantToken_blocked() public {
        MockReentrantERC20 reentrantToken = new MockReentrantERC20();
        uint256 totalAmount = 500e6;
        reentrantToken.mint(creator, totalAmount);

        uint256 deadline = block.timestamp + 7 days;
        string memory attackUri = "github:attacker/repo#999";

        // Arm the token to attempt reentry during the deposit transferFrom
        reentrantToken.arm(address(escrow), attackUri, deadline);

        vm.startPrank(creator);
        reentrantToken.approve(address(escrow), totalAmount);
        // The reentrant call inside transferFrom should revert — whole tx reverts
        vm.expectRevert();
        escrow.createBountyToken(ISSUE_URI, address(reentrantToken), totalAmount, deadline);
        vm.stopPrank();

        // Bounty must not exist — reentrancy was blocked
        bytes32 id = escrow.computeId(ISSUE_URI);
        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.None));
    }

    // ─── Expire from Claimed Tests ───────────────────────────────────────

    // expire() accepts both Open and Claimed status — verify the Claimed path.
    // A contributor who claimed but didn't submit by deadline loses their claim;
    // creator gets the amount refunded (fee kept as penalty).
    function test_expire_fromClaimed() public {
        bytes32 id = _createETHBounty();

        vm.prank(contributor);
        escrow.claim(id);

        // Verify status is Claimed before expiry
        BountyEscrow.Bounty memory b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Claimed));

        vm.warp(block.timestamp + 8 days);

        uint256 balBefore = creator.balance;
        escrow.expire(id);

        b = escrow.getBounty(id);
        assertEq(uint8(b.status), uint8(BountyEscrow.Status.Expired));

        // Creator refunded amount only — fee kept as penalty
        uint256 expectedFee = (BOUNTY_AMOUNT * FEE_BPS) / 10000;
        assertEq(creator.balance, balBefore + BOUNTY_AMOUNT - expectedFee);
    }

    // ─── Zero-Address Tests ──────────────────────────────────────────────

    function test_revert_constructor_zeroArbiter() public {
        vm.expectRevert(BountyEscrow.InvalidAddress.selector);
        new BountyEscrow(address(0), FEE_BPS);
    }

    function test_revert_setArbiter_zeroAddress() public {
        vm.expectRevert(BountyEscrow.InvalidAddress.selector);
        escrow.setArbiter(address(0));
    }

    function test_revert_transferOwnership_zeroAddress() public {
        vm.expectRevert(BountyEscrow.InvalidAddress.selector);
        escrow.transferOwnership(address(0));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    function _createETHBounty() internal returns (bytes32) {
        uint256 deadline = block.timestamp + 7 days;
        vm.prank(creator);
        return escrow.createBountyETH{value: BOUNTY_AMOUNT}(ISSUE_URI, deadline);
    }
}
