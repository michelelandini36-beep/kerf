// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {KerfExecutor} from "../src/KerfExecutor.sol";

/// Deploys KerfExecutor on Robinhood Chain and allow-lists the tokens in tokens.json.
///
///   cast wallet import kerf-deployer --interactive          # once; the key never leaves your keystore
///   KERF_OWNER=0x... forge script script/Deploy.s.sol \
///     --rpc-url robinhood --account kerf-deployer --broadcast --verify
///
/// Env: KERF_OWNER (required), KERF_FEE_RECIPIENT (default owner), KERF_FEE_BPS (default 0, max 1000).
contract Deploy is Script {
    address constant V2_FACTORY = 0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f;
    address constant V3_FACTORY = 0x1f7d7550B1b028f7571E69A784071F0205FD2EfA;

    function run() external returns (KerfExecutor ex) {
        require(block.chainid == 4663, "not Robinhood Chain");
        address owner = vm.envAddress("KERF_OWNER");
        address feeRecipient = vm.envOr("KERF_FEE_RECIPIENT", owner);
        uint256 feeBps = vm.envOr("KERF_FEE_BPS", uint256(0));
        address[] memory tokens = vm.parseJsonAddressArray(vm.readFile("tokens.json"), ".addresses");

        vm.startBroadcast();
        ex = new KerfExecutor(V2_FACTORY, V3_FACTORY, feeBps, msg.sender, feeRecipient);
        // setTokens in chunks to stay far below the block gas limit
        for (uint256 i; i < tokens.length; i += 50) {
            uint256 end = i + 50 > tokens.length ? tokens.length : i + 50;
            address[] memory chunk = new address[](end - i);
            for (uint256 j = i; j < end; ++j) chunk[j - i] = tokens[j];
            ex.setTokens(chunk, true);
        }
        if (owner != msg.sender) ex.transferOwnership(owner);
        vm.stopBroadcast();

        console2.log("KerfExecutor", address(ex));
        console2.log("tokens allowed", tokens.length);
        console2.log("owner", owner);
    }
}
