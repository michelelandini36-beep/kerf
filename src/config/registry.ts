// Public on-chain infrastructure for Robinhood Chain (4663), as documented
// by the respective operators. These are chain facts, not secrets. The real
// backend should re-verify each one (eth_getCode + factory() checks) at boot.
// The Kerf executor and $KERF token addresses come from env once deployed.

export const REGISTRY = {
  chainId: 4663,
  publicRpc: "https://rpc.mainnet.chain.robinhood.com",
  explorer: "https://robinhoodchain.blockscout.com",
  assetsApi: "https://api.robinhood.com/rhj/assets",
  stockBeacon: "0xe10b6f6B275de231345c20D14Ab812db62151b00",
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  uniswapV2Factory: "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f",
  uniswapV3Factory: "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA",
  quoterV2: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  v4PoolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
  chainlinkEthUsd: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
  chainlinkUsdgUsd: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2",
  v3FeeTiers: [100, 500, 3000, 10000],
} as const;
