// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20, IUniswapV2Factory, IUniswapV2Pair, IUniswapV3Factory, IUniswapV3Pool} from "./interfaces.sol";

/// @title KerfExecutor
/// @notice Runs a closed loop of 2–4 Uniswap V2/V3 swaps that starts and ends in the same
///         settlement token, funded by a flash swap on the first pool, in one transaction.
///         The caller supplies no tokens and grants no allowance. Profit is the measured
///         increase of this contract's settlement balance over the whole call; anything
///         else reverts.
/// @dev    Not independently audited.
contract KerfExecutor {
    string public constant VERSION = "1.0.0";
    uint256 public constant MAX_FEE_BPS = 1000; // 10 %

    uint8 internal constant KIND_V2 = 0;
    uint8 internal constant KIND_V3 = 1;

    uint8 internal constant MODE_NONE = 0;
    uint8 internal constant MODE_FLASH = 1;
    uint8 internal constant MODE_HOP = 2;

    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342;

    struct Hop {
        address pool;
        address tokenIn;
        address tokenOut;
        uint24 fee; // V3 fee tier in pips; ignored for V2
        uint8 kind; // 0 = V2, 1 = V3
    }

    event CycleExecuted(
        address indexed caller,
        address indexed settlementToken,
        uint256 amountIn,
        uint256 grossProfit,
        uint256 userProfit,
        uint256 protocolFee,
        address[] pools
    );
    event TokenAllowed(address indexed token, bool allowed);
    event FeeRecipientChanged(address indexed recipient);
    event PausedChanged(bool paused);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error Paused();
    error Reentrancy();
    error DeadlineExpired();
    error BadHopCount();
    error ZeroAmount();
    error NotACycle();
    error BrokenPath(uint256 hop);
    error TokenNotAllowed(address token);
    error PoolNotCanonical(uint256 hop);
    error DuplicatePool(uint256 hop);
    error BadKind(uint256 hop);
    error UnexpectedCallback();
    error BadPayload();
    error PartialFill();
    error ReceivedMismatch(uint256 expected, uint256 actual);
    error CycleNotProfitable(uint256 owed, uint256 returned);
    error MinProfitNotMet(uint256 userProfit, uint256 minProfit);
    error FeeTooHigh();
    error TransferFailed();
    error ZeroAddress();

    IUniswapV2Factory public immutable v2Factory;
    IUniswapV3Factory public immutable v3Factory;
    uint256 public immutable protocolFeeBps;

    address public owner;
    address public feeRecipient;
    bool public paused;
    mapping(address => bool) public allowedToken;

    // Per-execution state. Cleared before execute() returns.
    bool private _active;
    uint8 private _mode;
    address private _expectedPool;
    bytes32 private _payloadHash;
    uint256 private _flashOutBefore;
    address private _hopTokenIn;
    uint256 private _hopAmount;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address v2Factory_, address v3Factory_, uint256 protocolFeeBps_, address owner_, address feeRecipient_) {
        if (v2Factory_ == address(0) || v3Factory_ == address(0) || owner_ == address(0) || feeRecipient_ == address(0)) {
            revert ZeroAddress();
        }
        if (protocolFeeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        v2Factory = IUniswapV2Factory(v2Factory_);
        v3Factory = IUniswapV3Factory(v3Factory_);
        protocolFeeBps = protocolFeeBps_;
        owner = owner_;
        feeRecipient = feeRecipient_;
        emit OwnershipTransferred(address(0), owner_);
        emit FeeRecipientChanged(feeRecipient_);
    }

    // ------------------------------------------------------------------ execute

    function execute(Hop[] calldata hops, uint256 amountIn, uint256 minProfit, uint256 deadline)
        external
        returns (uint256 userProfit, uint256 protocolFee)
    {
        if (_active) revert Reentrancy();
        if (paused) revert Paused();
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amountIn == 0) revert ZeroAmount();
        uint256 n = hops.length;
        if (n < 2 || n > 4) revert BadHopCount();

        address settlement = hops[0].tokenIn;
        if (hops[n - 1].tokenOut != settlement) revert NotACycle();
        address[] memory pools = new address[](n);
        for (uint256 i; i < n; ++i) {
            _validateHop(hops, i);
            pools[i] = hops[i].pool;
        }

        uint256 balanceBefore = _balance(settlement);

        _active = true;
        bytes memory payload = abi.encode(hops, amountIn);
        _payloadHash = keccak256(payload);
        _flashOutBefore = _balance(hops[0].tokenOut);
        _mode = MODE_FLASH;
        _expectedPool = hops[0].pool;

        _startFlash(hops[0], amountIn, payload);

        // The callback must have run exactly once and cleared the flash state.
        if (_expectedPool != address(0) || _payloadHash != bytes32(0)) revert UnexpectedCallback();
        _active = false;
        _flashOutBefore = 0;

        uint256 balanceAfter = _balance(settlement);
        if (balanceAfter <= balanceBefore) revert CycleNotProfitable(balanceBefore, balanceAfter);
        uint256 gross = balanceAfter - balanceBefore;
        protocolFee = (gross * protocolFeeBps) / 10_000;
        userProfit = gross - protocolFee;
        if (userProfit < minProfit) revert MinProfitNotMet(userProfit, minProfit);

        _safeTransfer(settlement, msg.sender, userProfit);
        if (protocolFee > 0) _safeTransfer(settlement, feeRecipient, protocolFee);

        emit CycleExecuted(msg.sender, settlement, amountIn, gross, userProfit, protocolFee, pools);
    }

    // ---------------------------------------------------------------- callbacks

    function uniswapV3SwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external {
        if (!_active || msg.sender != _expectedPool) revert UnexpectedCallback();
        _expectedPool = address(0);
        uint8 mode = _mode;
        _mode = MODE_NONE;

        uint256 owed = amount0Delta > 0 ? uint256(amount0Delta) : uint256(amount1Delta);
        uint256 received = amount0Delta < 0 ? uint256(-amount0Delta) : uint256(-amount1Delta);

        if (mode == MODE_HOP) {
            if (owed != _hopAmount) revert PartialFill();
            address tokenIn = _hopTokenIn;
            _hopTokenIn = address(0);
            _hopAmount = 0;
            _safeTransfer(tokenIn, msg.sender, owed);
        } else if (mode == MODE_FLASH) {
            _runFlash(data, received, owed);
        } else {
            revert UnexpectedCallback();
        }
    }

    function uniswapV2Call(address sender, uint256 amount0, uint256 amount1, bytes calldata data) external {
        if (!_active || msg.sender != _expectedPool || sender != address(this) || _mode != MODE_FLASH) {
            revert UnexpectedCallback();
        }
        _expectedPool = address(0);
        _mode = MODE_NONE;
        (, uint256 amountIn) = abi.decode(data, (Hop[], uint256));
        _runFlash(data, amount0 + amount1, amountIn);
    }

    /// @dev Runs hops 2..n with what the first pool actually sent, then repays the first pool.
    function _runFlash(bytes calldata data, uint256 reported, uint256 owed) internal {
        if (keccak256(data) != _payloadHash) revert BadPayload();
        _payloadHash = bytes32(0);
        (Hop[] memory hops, uint256 amountIn) = abi.decode(data, (Hop[], uint256));
        if (owed != amountIn) revert PartialFill();

        uint256 actual = _balance(hops[0].tokenOut) - _flashOutBefore;
        if (actual != reported || actual == 0) revert ReceivedMismatch(reported, actual);

        uint256 amount = actual;
        for (uint256 i = 1; i < hops.length; ++i) {
            amount = _swapExactIn(hops[i], amount);
        }
        // The loop's own output must cover the debt: balances already held here never subsidise it.
        if (amount <= amountIn) revert CycleNotProfitable(amountIn, amount);
        _safeTransfer(hops[0].tokenIn, hops[0].pool, amountIn);
    }

    // -------------------------------------------------------------------- swaps

    function _startFlash(Hop calldata hop, uint256 amountIn, bytes memory payload) internal {
        if (hop.kind == KIND_V3) {
            bool zeroForOne = hop.tokenIn < hop.tokenOut;
            IUniswapV3Pool(hop.pool).swap(
                address(this), zeroForOne, int256(amountIn), zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1, payload
            );
        } else {
            (uint256 out0, uint256 out1) = _v2Outs(hop, amountIn);
            IUniswapV2Pair(hop.pool).swap(out0, out1, address(this), payload);
        }
    }

    function _swapExactIn(Hop memory hop, uint256 amountIn) internal returns (uint256 received) {
        uint256 before = _balance(hop.tokenOut);
        uint256 reported;
        if (hop.kind == KIND_V3) {
            bool zeroForOne = hop.tokenIn < hop.tokenOut;
            _mode = MODE_HOP;
            _expectedPool = hop.pool;
            _hopTokenIn = hop.tokenIn;
            _hopAmount = amountIn;
            (int256 a0, int256 a1) = IUniswapV3Pool(hop.pool).swap(
                address(this), zeroForOne, int256(amountIn), zeroForOne ? MIN_SQRT_RATIO + 1 : MAX_SQRT_RATIO - 1, ""
            );
            if (_expectedPool != address(0)) revert UnexpectedCallback();
            reported = uint256(-(zeroForOne ? a1 : a0));
        } else {
            (uint256 out0, uint256 out1) = _v2Outs(hop, amountIn);
            reported = out0 + out1;
            _safeTransfer(hop.tokenIn, hop.pool, amountIn);
            IUniswapV2Pair(hop.pool).swap(out0, out1, address(this), "");
        }
        received = _balance(hop.tokenOut) - before;
        if (received != reported || received == 0) revert ReceivedMismatch(reported, received);
    }

    function _v2Outs(Hop memory hop, uint256 amountIn) internal view returns (uint256 out0, uint256 out1) {
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(hop.pool).getReserves();
        bool inIs0 = hop.tokenIn < hop.tokenOut;
        (uint256 rIn, uint256 rOut) = inIs0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 withFee = amountIn * 997;
        uint256 out = (withFee * rOut) / (rIn * 1000 + withFee);
        if (out == 0) revert PartialFill();
        (out0, out1) = inIs0 ? (uint256(0), out) : (out, uint256(0));
    }

    // --------------------------------------------------------------- validation

    function _validateHop(Hop[] calldata hops, uint256 i) internal view {
        Hop calldata h = hops[i];
        if (h.tokenIn == h.tokenOut) revert BrokenPath(i);
        if (i > 0 && h.tokenIn != hops[i - 1].tokenOut) revert BrokenPath(i);
        if (!allowedToken[h.tokenIn]) revert TokenNotAllowed(h.tokenIn);
        if (!allowedToken[h.tokenOut]) revert TokenNotAllowed(h.tokenOut);
        for (uint256 j; j < i; ++j) {
            if (hops[j].pool == h.pool) revert DuplicatePool(i);
        }
        address canonical;
        if (h.kind == KIND_V2) canonical = v2Factory.getPair(h.tokenIn, h.tokenOut);
        else if (h.kind == KIND_V3) canonical = v3Factory.getPool(h.tokenIn, h.tokenOut, h.fee);
        else revert BadKind(i);
        if (canonical == address(0) || canonical != h.pool) revert PoolNotCanonical(i);
    }

    // -------------------------------------------------------------------- owner

    function setTokens(address[] calldata tokens, bool allowed) external onlyOwner {
        for (uint256 i; i < tokens.length; ++i) {
            allowedToken[tokens[i]] = allowed;
            emit TokenAllowed(tokens[i], allowed);
        }
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientChanged(recipient);
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedChanged(paused_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Recover tokens sent here by mistake. Never touches a running execution.
    function sweep(address token, address to, uint256 amount) external onlyOwner {
        if (_active) revert Reentrancy();
        if (to == address(0)) revert ZeroAddress();
        _safeTransfer(token, to, amount);
    }

    // ------------------------------------------------------------------ helpers

    function _balance(address token) internal view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory ret) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}
