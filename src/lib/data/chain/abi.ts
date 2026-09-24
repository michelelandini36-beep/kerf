import { parseAbi } from "viem";

export const v3PoolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
]);

export const v2PairAbi = parseAbi(["function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"]);

// QuoterV2 is not a view function on-chain, but it is only ever used through eth_call.
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) view returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);

export const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

export const erc20Abi = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
]);

export const factoryAbi = parseAbi([
  "function getPool(address, address, uint24) view returns (address)",
  "function getPair(address, address) view returns (address)",
]);

export const executorAbi = parseAbi([
  "struct Hop { address pool; address tokenIn; address tokenOut; uint24 fee; uint8 kind; }",
  "function execute(Hop[] hops, uint256 amountIn, uint256 minProfit, uint256 deadline) returns (uint256 userProfit, uint256 protocolFee)",
  "function VERSION() view returns (string)",
  "function owner() view returns (address)",
  "function feeRecipient() view returns (address)",
  "function paused() view returns (bool)",
  "function protocolFeeBps() view returns (uint256)",
  "function v2Factory() view returns (address)",
  "function v3Factory() view returns (address)",
  "event CycleExecuted(address indexed caller, address indexed settlementToken, uint256 amountIn, uint256 grossProfit, uint256 userProfit, uint256 protocolFee, address[] pools)",
  "error NotOwner()",
  "error Paused()",
  "error Reentrancy()",
  "error DeadlineExpired()",
  "error BadHopCount()",
  "error ZeroAmount()",
  "error NotACycle()",
  "error BrokenPath(uint256 hop)",
  "error TokenNotAllowed(address token)",
  "error PoolNotCanonical(uint256 hop)",
  "error DuplicatePool(uint256 hop)",
  "error BadKind(uint256 hop)",
  "error UnexpectedCallback()",
  "error BadPayload()",
  "error PartialFill()",
  "error ReceivedMismatch(uint256 expected, uint256 actual)",
  "error CycleNotProfitable(uint256 owed, uint256 returned)",
  "error MinProfitNotMet(uint256 userProfit, uint256 minProfit)",
  "error FeeTooHigh()",
  "error TransferFailed()",
  "error ZeroAddress()",
]);
