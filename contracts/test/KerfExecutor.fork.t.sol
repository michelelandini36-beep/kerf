// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {KerfExecutor} from "../src/KerfExecutor.sol";
import {IERC20, IUniswapV2Pair, IUniswapV3Pool} from "../src/interfaces.sol";

/// Fork tests against real Uniswap V2/V3 pools on Robinhood Chain (4663).
/// Run: KERF_RPC_URL=<rpc> forge test   (defaults to the public RPC)
contract KerfExecutorForkTest is Test {
    address constant V2_FACTORY = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    address constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;
    address constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;
    address constant POOL_V3_100 = 0x52e65B17fB6E5BA00Ed806f37Afcd2DaA50271Ca; // WETH/USDG 0.01 %
    address constant POOL_V3_500 = 0x69BfaF19C9f377BB306a89aEd9F6B07e2c1a8d9a; // WETH/USDG 0.05 %
    address constant PAIR_V2 = 0x8803c117ccae7B5146297876c2A25DF135141C4d; // WETH/USDG V2

    uint160 constant MIN_SQRT = 4295128740;
    uint160 constant MAX_SQRT = 1461446703485210103287273052203988822378723970341;

    KerfExecutor ex;
    address user = makeAddr("user");
    address feeTo = makeAddr("feeTo");

    function setUp() public {
        vm.createSelectFork(vm.envOr("KERF_RPC_URL", string("https://rpc.mainnet.chain.robinhood.com")));
        ex = new KerfExecutor(V2_FACTORY, V3_FACTORY, 0, address(this), feeTo);
        address[] memory t = new address[](2);
        t[0] = USDG;
        t[1] = WETH;
        ex.setTokens(t, true);
    }

    // ---------- helpers

    function _hop(address pool, address tin, address tout, uint24 fee, uint8 kind) internal pure returns (KerfExecutor.Hop memory) {
        return KerfExecutor.Hop({pool: pool, tokenIn: tin, tokenOut: tout, fee: fee, kind: kind});
    }

    function _cycle(address p0, uint24 f0, uint8 k0, address p1, uint24 f1, uint8 k1) internal pure returns (KerfExecutor.Hop[] memory h) {
        h = new KerfExecutor.Hop[](2);
        h[0] = _hop(p0, USDG, WETH, f0, k0);
        h[1] = _hop(p1, WETH, USDG, f1, k1);
    }

    /// Dump WETH into a V3 pool so WETH becomes cheap there.
    function _dumpWethV3(address pool, uint256 amount) internal {
        deal(WETH, address(this), amount);
        IUniswapV3Pool(pool).swap(address(this), WETH < USDG, int256(amount), WETH < USDG ? MIN_SQRT : MAX_SQRT, "");
    }

    function _dumpWethV2(uint256 amount) internal {
        deal(WETH, address(this), amount);
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(PAIR_V2).getReserves();
        bool wethIs0 = WETH < USDG;
        (uint256 rIn, uint256 rOut) = wethIs0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 out = (amount * 997 * rOut) / (rIn * 1000 + amount * 997);
        IERC20(WETH).transfer(PAIR_V2, amount);
        IUniswapV2Pair(PAIR_V2).swap(wethIs0 ? 0 : out, wethIs0 ? out : 0, address(this), "");
    }

    function uniswapV3SwapCallback(int256 a0, int256 a1, bytes calldata) external {
        address token0 = WETH < USDG ? WETH : USDG;
        address token1 = WETH < USDG ? USDG : WETH;
        if (a0 > 0) IERC20(token0).transfer(msg.sender, uint256(a0));
        if (a1 > 0) IERC20(token1).transfer(msg.sender, uint256(a1));
    }

    // ---------- behaviour on live state

    function test_unprofitableCycleReverts() public {
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, POOL_V3_500, 500, 1);
        vm.prank(user);
        vm.expectPartialRevert(KerfExecutor.CycleNotProfitable.selector);
        ex.execute(h, 100e6, 0, block.timestamp + 60);
    }

    function test_profitableV3CyclePaysCaller() public {
        _dumpWethV3(POOL_V3_500, 60 ether);
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_500, 500, 1, POOL_V3_100, 100, 1);
        vm.prank(user);
        (uint256 profit, uint256 fee) = ex.execute(h, 20_000e6, 1e6, block.timestamp + 60);
        assertGt(profit, 1e6, "profit");
        assertEq(fee, 0);
        assertEq(IERC20(USDG).balanceOf(user), profit, "paid to caller");
        assertEq(IERC20(USDG).balanceOf(address(ex)), 0, "nothing left behind");
    }

    function test_v2FlashThenV3Hop() public {
        _dumpWethV2(2 ether);
        KerfExecutor.Hop[] memory h = _cycle(PAIR_V2, 0, 0, POOL_V3_100, 100, 1);
        vm.prank(user);
        (uint256 profit,) = ex.execute(h, 300e6, 0, block.timestamp + 60);
        assertGt(profit, 0);
        assertEq(IERC20(USDG).balanceOf(user), profit);
    }

    function test_v3FlashThenV2Hop() public {
        // Make WETH expensive on V2 by pulling WETH out of it with USDG.
        deal(USDG, address(this), 5_000e6);
        (uint112 r0, uint112 r1,) = IUniswapV2Pair(PAIR_V2).getReserves();
        bool usdgIs0 = USDG < WETH;
        (uint256 rIn, uint256 rOut) = usdgIs0 ? (uint256(r0), uint256(r1)) : (uint256(r1), uint256(r0));
        uint256 amt = 2_000e6;
        uint256 out = (amt * 997 * rOut) / (rIn * 1000 + amt * 997);
        IERC20(USDG).transfer(PAIR_V2, amt);
        IUniswapV2Pair(PAIR_V2).swap(usdgIs0 ? 0 : out, usdgIs0 ? out : 0, address(this), "");

        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, PAIR_V2, 0, 0);
        vm.prank(user);
        (uint256 profit,) = ex.execute(h, 300e6, 0, block.timestamp + 60);
        assertGt(profit, 0);
    }

    function test_protocolFeeSplit() public {
        KerfExecutor fx = new KerfExecutor(V2_FACTORY, V3_FACTORY, 500, address(this), feeTo);
        address[] memory t = new address[](2);
        t[0] = USDG;
        t[1] = WETH;
        fx.setTokens(t, true);
        _dumpWethV3(POOL_V3_500, 60 ether);
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_500, 500, 1, POOL_V3_100, 100, 1);
        vm.prank(user);
        (uint256 profit, uint256 fee) = fx.execute(h, 20_000e6, 0, block.timestamp + 60);
        assertEq(IERC20(USDG).balanceOf(feeTo), fee);
        assertEq(fee, ((profit + fee) * 500) / 10_000);
    }

    function test_minProfitEnforced() public {
        _dumpWethV3(POOL_V3_500, 60 ether);
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_500, 500, 1, POOL_V3_100, 100, 1);
        vm.prank(user);
        vm.expectPartialRevert(KerfExecutor.MinProfitNotMet.selector);
        ex.execute(h, 20_000e6, 1_000_000e6, block.timestamp + 60);
    }

    function test_existingBalanceCannotSubsidise() public {
        deal(USDG, address(ex), 1_000_000e6);
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, POOL_V3_500, 500, 1);
        vm.prank(user);
        vm.expectPartialRevert(KerfExecutor.CycleNotProfitable.selector);
        ex.execute(h, 100e6, 0, block.timestamp + 60);
        assertEq(IERC20(USDG).balanceOf(user), 0);
    }

    function test_threeHopThroughStockToken() public {
        address NVDA = 0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC;
        address[] memory t = new address[](1);
        t[0] = NVDA;
        ex.setTokens(t, true);
        KerfExecutor.Hop[] memory h = new KerfExecutor.Hop[](3);
        h[0] = _hop(0xd4EB21209C4D6093f80B5b84f5C45cc093EA14a3, USDG, NVDA, 500, 1);
        h[1] = _hop(0x62AB521f71431f78ac374CdbadC6cda3c8916b6C, NVDA, WETH, 500, 1);
        h[2] = _hop(POOL_V3_100, WETH, USDG, 100, 1);
        // Every hop settles through the real stock token; the loop is simply not profitable
        // on live state, so it must fail with the decoded reason rather than a transfer error.
        vm.prank(user);
        vm.expectPartialRevert(KerfExecutor.CycleNotProfitable.selector);
        ex.execute(h, 50e6, 0, block.timestamp + 60);
    }

    // ---------- guards

    function test_rejectsNonCanonicalPool() public {
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 500, 1, POOL_V3_500, 500, 1); // wrong fee for pool 0
        vm.expectRevert(abi.encodeWithSelector(KerfExecutor.PoolNotCanonical.selector, 0));
        ex.execute(h, 100e6, 0, block.timestamp + 60);
    }

    function test_rejectsDuplicatePool() public {
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, POOL_V3_100, 100, 1);
        vm.expectRevert(abi.encodeWithSelector(KerfExecutor.DuplicatePool.selector, 1));
        ex.execute(h, 100e6, 0, block.timestamp + 60);
    }

    function test_rejectsOpenPath() public {
        KerfExecutor.Hop[] memory h = new KerfExecutor.Hop[](2);
        h[0] = _hop(POOL_V3_100, USDG, WETH, 100, 1);
        h[1] = _hop(POOL_V3_500, USDG, WETH, 500, 1);
        vm.expectRevert(KerfExecutor.NotACycle.selector);
        ex.execute(h, 100e6, 0, block.timestamp + 60);
    }

    function test_rejectsDisallowedToken() public {
        address[] memory t = new address[](1);
        t[0] = WETH;
        ex.setTokens(t, false);
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, POOL_V3_500, 500, 1);
        vm.expectRevert(abi.encodeWithSelector(KerfExecutor.TokenNotAllowed.selector, WETH));
        ex.execute(h, 100e6, 0, block.timestamp + 60);
    }

    function test_deadline() public {
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, POOL_V3_500, 500, 1);
        vm.expectRevert(KerfExecutor.DeadlineExpired.selector);
        ex.execute(h, 100e6, 0, block.timestamp - 1);
    }

    function test_pause() public {
        ex.setPaused(true);
        KerfExecutor.Hop[] memory h = _cycle(POOL_V3_100, 100, 1, POOL_V3_500, 500, 1);
        vm.expectRevert(KerfExecutor.Paused.selector);
        ex.execute(h, 100e6, 0, block.timestamp + 60);
    }

    function test_directCallbacksRejected() public {
        vm.expectRevert(KerfExecutor.UnexpectedCallback.selector);
        ex.uniswapV3SwapCallback(1, -1, "");
        vm.expectRevert(KerfExecutor.UnexpectedCallback.selector);
        ex.uniswapV2Call(address(ex), 1, 0, "");
    }

    function test_onlyOwner() public {
        vm.startPrank(user);
        vm.expectRevert(KerfExecutor.NotOwner.selector);
        ex.setPaused(true);
        vm.expectRevert(KerfExecutor.NotOwner.selector);
        ex.setFeeRecipient(user);
        vm.expectRevert(KerfExecutor.NotOwner.selector);
        ex.sweep(USDG, user, 1);
        vm.stopPrank();
    }

    function test_feeCap() public {
        vm.expectRevert(KerfExecutor.FeeTooHigh.selector);
        new KerfExecutor(V2_FACTORY, V3_FACTORY, 1001, address(this), feeTo);
    }
}
