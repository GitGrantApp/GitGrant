// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "forge-std/interfaces/IERC20.sol";
import {ReentrancyGuard} from "./utils/ReentrancyGuard.sol";

/// @title GitGrant Escrow
/// @notice Trustless escrow for git-based bounties across any platform
/// @dev Supports ETH and ERC20 tokens. One bounty per unique issueHash.
contract BountyEscrow is ReentrancyGuard {
    // ─── Types ───────────────────────────────────────────────────────────

    enum Status {
        None,
        Open,
        Claimed,
        Submitted,
        Completed,
        Disputed,
        Expired,
        Cancelled
    }

    struct Bounty {
        address creator;
        address token; // address(0) = ETH
        uint256 amount;
        uint256 fee;
        uint256 deadline;
        address claimant;
        Status status;
        string issueUri; // "github:owner/repo#123" or "gitlab:group/proj#45"
    }

    // ─── State ───────────────────────────────────────────────────────────

    mapping(bytes32 => Bounty) public bounties;
    bytes32[] public bountyIds;

    address public owner;
    address public arbiter; // dispute resolver
    uint256 public feeBps; // basis points (300 = 3%)
    uint256 public constant MAX_FEE_BPS = 1000; // 10% cap
    uint256 public constant MIN_DEADLINE = 1 days;

    uint256 public collectedFees; // ETH fees
    mapping(address => uint256) public collectedTokenFees; // ERC20 fees

    // ─── Events ──────────────────────────────────────────────────────────

    event BountyCreated(
        bytes32 indexed bountyId,
        address indexed creator,
        address token,
        uint256 amount,
        uint256 deadline,
        string issueUri
    );
    event BountyClaimed(bytes32 indexed bountyId, address indexed claimant);
    event BountySubmitted(bytes32 indexed bountyId, address indexed claimant);
    event BountyCompleted(bytes32 indexed bountyId, address indexed claimant, uint256 payout);
    event BountyDisputed(bytes32 indexed bountyId, address indexed disputedBy);
    event BountyResolved(bytes32 indexed bountyId, address indexed winner, uint256 payout);
    event BountyExpired(bytes32 indexed bountyId);
    event BountyCancelled(bytes32 indexed bountyId);
    event FeeUpdated(uint256 oldFee, uint256 newFee);
    event ArbiterUpdated(address indexed oldArbiter, address indexed newArbiter);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // ─── Errors ──────────────────────────────────────────────────────────

    error Unauthorized();
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidFee();
    error BountyExists();
    error BountyNotFound();
    error InvalidStatus(Status current, Status expected);
    error DeadlineNotReached();
    error DeadlinePassed();
    error AlreadyClaimed();
    error TransferFailed();
    error InvalidAddress();

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    modifier onlyArbiter() {
        if (msg.sender != arbiter) revert Unauthorized();
        _;
    }

    modifier onlyCreator(bytes32 bountyId) {
        if (msg.sender != bounties[bountyId].creator) revert Unauthorized();
        _;
    }

    modifier inStatus(bytes32 bountyId, Status expected) {
        Status current = bounties[bountyId].status;
        if (current != expected) revert InvalidStatus(current, expected);
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────

    constructor(address _arbiter, uint256 _feeBps) {
        if (_arbiter == address(0)) revert InvalidAddress();
        if (_feeBps > MAX_FEE_BPS) revert InvalidFee();
        owner = msg.sender;
        arbiter = _arbiter;
        feeBps = _feeBps;
    }

    // ─── Core Functions ──────────────────────────────────────────────────

    /// @notice Create a new bounty with ETH
    function createBountyETH(
        string calldata issueUri,
        uint256 deadline
    ) external payable nonReentrant returns (bytes32 bountyId) {
        if (msg.value == 0) revert InvalidAmount();
        if (deadline < block.timestamp + MIN_DEADLINE) revert InvalidDeadline();

        bountyId = _computeId(issueUri);
        if (bounties[bountyId].status != Status.None) revert BountyExists();

        uint256 fee = (msg.value * feeBps) / 10000;
        uint256 amount = msg.value - fee;

        bounties[bountyId] = Bounty({
            creator: msg.sender,
            token: address(0),
            amount: amount,
            fee: fee,
            deadline: deadline,
            claimant: address(0),
            status: Status.Open,
            issueUri: issueUri
        });
        bountyIds.push(bountyId);
        collectedFees += fee;

        emit BountyCreated(bountyId, msg.sender, address(0), amount, deadline, issueUri);
    }

    /// @notice Create a new bounty with ERC20 token
    function createBountyToken(
        string calldata issueUri,
        address token,
        uint256 totalAmount,
        uint256 deadline
    ) external nonReentrant returns (bytes32 bountyId) {
        if (totalAmount == 0) revert InvalidAmount();
        if (token == address(0)) revert InvalidAmount();
        if (deadline < block.timestamp + MIN_DEADLINE) revert InvalidDeadline();

        bountyId = _computeId(issueUri);
        if (bounties[bountyId].status != Status.None) revert BountyExists();

        uint256 fee = (totalAmount * feeBps) / 10000;
        uint256 amount = totalAmount - fee;

        bounties[bountyId] = Bounty({
            creator: msg.sender,
            token: token,
            amount: amount,
            fee: fee,
            deadline: deadline,
            claimant: address(0),
            status: Status.Open,
            issueUri: issueUri
        });
        bountyIds.push(bountyId);
        collectedTokenFees[token] += fee;

        bool ok = IERC20(token).transferFrom(msg.sender, address(this), totalAmount);
        if (!ok) revert TransferFailed();

        emit BountyCreated(bountyId, msg.sender, token, amount, deadline, issueUri);
    }

    /// @notice Contributor claims a bounty (signals intent to work)
    function claim(bytes32 bountyId) external inStatus(bountyId, Status.Open) {
        Bounty storage b = bounties[bountyId];
        if (block.timestamp > b.deadline) revert DeadlinePassed();
        if (b.claimant != address(0)) revert AlreadyClaimed();

        b.claimant = msg.sender;
        b.status = Status.Claimed;

        emit BountyClaimed(bountyId, msg.sender);
    }

    /// @notice Claimant marks work as submitted (PR opened)
    function submit(bytes32 bountyId) external inStatus(bountyId, Status.Claimed) {
        Bounty storage b = bounties[bountyId];
        if (msg.sender != b.claimant) revert Unauthorized();

        b.status = Status.Submitted;

        emit BountySubmitted(bountyId, msg.sender);
    }

    /// @notice Creator approves and releases payment (or bot on PR merge)
    function release(bytes32 bountyId)
        external
        onlyCreator(bountyId)
        inStatus(bountyId, Status.Submitted)
        nonReentrant
    {
        _payout(bountyId);
    }

    /// @notice Either party can dispute after submission
    function dispute(bytes32 bountyId) external {
        Bounty storage b = bounties[bountyId];
        if (b.status != Status.Submitted && b.status != Status.Claimed) {
            revert InvalidStatus(b.status, Status.Submitted);
        }
        if (msg.sender != b.creator && msg.sender != b.claimant) {
            revert Unauthorized();
        }

        b.status = Status.Disputed;

        emit BountyDisputed(bountyId, msg.sender);
    }

    /// @notice Arbiter resolves dispute — pays winner or refunds creator
    function resolve(
        bytes32 bountyId,
        bool payClaimant
    ) external onlyArbiter inStatus(bountyId, Status.Disputed) nonReentrant {
        Bounty storage b = bounties[bountyId];

        if (payClaimant) {
            _payout(bountyId);
        } else {
            // Refund creator (fee is NOT refunded)
            b.status = Status.Cancelled;
            _transfer(b.token, b.creator, b.amount);
            emit BountyResolved(bountyId, b.creator, b.amount);
        }
    }

    /// @notice Creator cancels bounty if still Open (no one claimed)
    function cancel(bytes32 bountyId)
        external
        onlyCreator(bountyId)
        inStatus(bountyId, Status.Open)
        nonReentrant
    {
        Bounty storage b = bounties[bountyId];
        b.status = Status.Cancelled;

        // Refund full amount + fee
        uint256 refund = b.amount + b.fee;
        if (b.token == address(0)) {
            collectedFees -= b.fee;
        } else {
            collectedTokenFees[b.token] -= b.fee;
        }
        _transfer(b.token, b.creator, refund);

        emit BountyCancelled(bountyId);
    }

    /// @notice Anyone can expire a bounty past deadline with no submission
    function expire(bytes32 bountyId) external nonReentrant {
        Bounty storage b = bounties[bountyId];
        if (b.status != Status.Open && b.status != Status.Claimed) {
            revert InvalidStatus(b.status, Status.Open);
        }
        if (block.timestamp <= b.deadline) revert DeadlineNotReached();

        b.status = Status.Expired;

        // Refund creator (fee kept as penalty for expired bounty)
        _transfer(b.token, b.creator, b.amount);

        emit BountyExpired(bountyId);
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function setFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        emit FeeUpdated(feeBps, newFeeBps);
        feeBps = newFeeBps;
    }

    function setArbiter(address newArbiter) external onlyOwner {
        if (newArbiter == address(0)) revert InvalidAddress();
        emit ArbiterUpdated(arbiter, newArbiter);
        arbiter = newArbiter;
    }

    function withdrawFees(address to) external onlyOwner nonReentrant {
        uint256 amount = collectedFees;
        collectedFees = 0;
        _transfer(address(0), to, amount);
    }

    function withdrawTokenFees(address token, address to) external onlyOwner nonReentrant {
        uint256 amount = collectedTokenFees[token];
        collectedTokenFees[token] = 0;
        _transfer(token, to, amount);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function getBounty(bytes32 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    function getBountyCount() external view returns (uint256) {
        return bountyIds.length;
    }

    function computeId(string calldata issueUri) external pure returns (bytes32) {
        return _computeId(issueUri);
    }

    // ─── Internal ────────────────────────────────────────────────────────

    function _payout(bytes32 bountyId) internal {
        Bounty storage b = bounties[bountyId];
        b.status = Status.Completed;
        _transfer(b.token, b.claimant, b.amount);
        emit BountyCompleted(bountyId, b.claimant, b.amount);
    }

    function _transfer(address token, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            bool ok2 = IERC20(token).transfer(to, amount);
            if (!ok2) revert TransferFailed();
        }
    }

    function _computeId(string calldata issueUri) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(issueUri));
    }
}
