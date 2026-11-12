import type { MezoNetworkConfig } from "../config/chains";
import { TESTNET_CL_CONTRACTS } from "../config/clPositions";
import { decodeUint256, encodeAddressWord, isAddress } from "./abi";
import { calculateClTokenSplit, type ClPlannerPool, type ClSplitResult } from "./clPlanner";
import { parseChainId } from "./network";
import type { RpcClient } from "./rpc";

/** Verified Slipstream interface from the exact-match verified Mezo Testnet deployment. */
export const SLIPSTREAM_MINT_SIGNATURE =
  "mint((address,address,int24,int24,int24,uint256,uint256,uint256,uint256,address,uint256,uint160))";
export const SLIPSTREAM_MINT_SELECTOR = "0xb5007d1f";
export const ERC20_APPROVE_SELECTOR = "0x095ea7b3";
export const CL_GET_POOL_INT24_SELECTOR = "0x28af8d0b";
export const CL_GET_SWAP_FEE_SELECTOR = "0x35458dcc";
export const CL_DEPOSIT_DEADLINE_SECONDS = 300;
export const CL_DEPOSIT_REVIEW_MAX_AGE_MS = 180_000;

const SELECTOR = {
  managerFactory: "0xc45a0155",
  token0: "0x0dfe1681",
  token1: "0xd21220a7",
  tickSpacing: "0xd0c93a7c",
  slot0: "0x3850c7bd",
  liquidity: "0x1a686502",
  decimals: "0x313ce567",
  balanceOf: "0x70a08231",
  allowance: "0xdd62ed3e",
} as const;
const Q192 = 1n << 192n;
const MAX_UINT256 = (1n << 256n) - 1n;

export interface ClDepositTransaction {
  from: `0x${string}`;
  to: `0x${string}`;
  data: string;
  value: "0x0";
  gas?: string;
}

export interface ClDepositReview {
  chainId: number;
  blockNumber: number;
  blockTimestamp: number;
  reviewedAtMs: number;
  wallet: `0x${string}`;
  manager: typeof TESTNET_CL_CONTRACTS.positionManager;
  factory: typeof TESTNET_CL_CONTRACTS.factory;
  pool: ClPlannerPool;
  feePips: number;
  split: ClSplitResult;
  slippageBps: number;
  amount0Desired: string;
  amount1Desired: string;
  amount0Min: string;
  amount1Min: string;
  balance0: string;
  balance1: string;
  allowance0: string;
  allowance1: string;
  deadline: number;
  mintTransaction: ClDepositTransaction;
}

export interface SimulatedClTransaction {
  kind: "mint" | "approve" | "reset-approval";
  transaction: ClDepositTransaction & { gas: string };
  gasEstimate: string;
  gasLimit: string;
  blockNumber: number;
  checkedAtMs: number;
  simulatedLiquidity?: string;
  simulatedAmount0?: string;
  simulatedAmount1?: string;
  approvalTokenIndex?: 0 | 1;
  approvalAmount?: string;
}

export class ClDepositPreflightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClDepositPreflightError";
  }
}

/**
 * Builds a wallet review from one fresh Testnet block. This only reads public state and
 * constructs unsigned requests; it never signs or submits a transaction.
 */
export async function readClDepositReview(options: {
  network: MezoNetworkConfig;
  rpc: RpcClient;
  account: string;
  selectedPool: ClPlannerPool;
  lowerPrice: string;
  upperPrice: string;
  budgetToken1: string;
  slippageBps: number;
  nowMs?: number;
}): Promise<ClDepositReview> {
  const { network, rpc, selectedPool } = options;
  const nowMs = options.nowMs ?? Date.now();
  const account = normalizeAddress(options.account, "connected wallet");
  assertTestnet(network);
  assertSlippage(options.slippageBps);
  const chainId = await readChainId(rpc);
  if (chainId !== TESTNET_CL_CONTRACTS.chainId) {
    throw new ClDepositPreflightError(`The read RPC reports chain ${chainId}; Mezo Testnet chain 31611 is required.`);
  }
  const block = await readCurrentBlock(rpc);
  const tag = block.tag;
  await Promise.all([
    requireCode(rpc, TESTNET_CL_CONTRACTS.factory, tag, "CL Factory"),
    requireCode(rpc, TESTNET_CL_CONTRACTS.positionManager, tag, "Nonfungible Position Manager"),
    requireCode(rpc, selectedPool.address, tag, "selected CL pool"),
  ]);
  const managerFactory = await readAddress(rpc, TESTNET_CL_CONTRACTS.positionManager, SELECTOR.managerFactory, [], tag, "position manager factory");
  if (!sameAddress(managerFactory, TESTNET_CL_CONTRACTS.factory)) {
    throw new ClDepositPreflightError("The deployed position manager is not linked to Mezo’s documented Testnet CL Factory. No wallet action is available.");
  }

  const [token0, token1, spacingHex, slotHex, liquidityHex] = await Promise.all([
    call(rpc, selectedPool.address, SELECTOR.token0, tag),
    call(rpc, selectedPool.address, SELECTOR.token1, tag),
    call(rpc, selectedPool.address, SELECTOR.tickSpacing, tag),
    call(rpc, selectedPool.address, SELECTOR.slot0, tag),
    call(rpc, selectedPool.address, SELECTOR.liquidity, tag),
  ]);
  const token0Address = decodeAddress(token0, "pool token0");
  const token1Address = decodeAddress(token1, "pool token1");
  const spacing = decodeInt24(BigInt(`0x${decodeWord(spacingHex, "pool tick spacing")}`));
  const slotWords = decodeWords(slotHex, 6, "pool slot0");
  const sqrtPriceX96 = BigInt(`0x${slotWords[0]}`);
  const currentTick = decodeInt24(BigInt(`0x${slotWords[1]}`));
  const activeLiquidity = decodeUint256(liquidityHex);
  if (!sameAddress(token0Address, selectedPool.token0.address) || !sameAddress(token1Address, selectedPool.token1.address) || spacing !== selectedPool.tickSpacing) {
    throw new ClDepositPreflightError("The selected pool’s token order or tick spacing changed. Refresh the planner and review the updated pool before continuing.");
  }
  if (sqrtPriceX96 <= 0n || sqrtPriceX96 >= (1n << 160n) || activeLiquidity === 0n) {
    throw new ClDepositPreflightError("The selected pool is not currently initialized with active liquidity. The deposit is blocked.");
  }
  const mappedPool = await readAddress(
    rpc,
    TESTNET_CL_CONTRACTS.factory,
    CL_GET_POOL_INT24_SELECTOR,
    [encodeAddressWord(token0Address), encodeAddressWord(token1Address), int24Word(BigInt(spacing))],
    tag,
    "factory pool lookup",
  );
  if (!sameAddress(mappedPool, selectedPool.address)) {
    throw new ClDepositPreflightError("The selected pool does not match the live factory lookup for its token pair and signed tick spacing.");
  }
  await Promise.all([
    requireCode(rpc, token0Address, tag, "token0"),
    requireCode(rpc, token1Address, tag, "token1"),
  ]);
  const [decimals0, decimals1, feePips, timestamp] = await Promise.all([
    readUint(rpc, token0Address, SELECTOR.decimals, [ ], tag, "token0 decimals"),
    readUint(rpc, token1Address, SELECTOR.decimals, [ ], tag, "token1 decimals"),
    readUint(rpc, TESTNET_CL_CONTRACTS.factory, CL_GET_SWAP_FEE_SELECTOR, [encodeAddressWord(selectedPool.address)], tag, "live pool swap fee"),
    readBlockTimestamp(rpc, block.tag),
  ]);
  if (decimals0 > 36n || decimals1 > 36n) throw new ClDepositPreflightError("This pool’s token decimals are outside the supported range.");
  if (Number(decimals0) !== selectedPool.token0.decimals || Number(decimals1) !== selectedPool.token1.decimals) {
    throw new ClDepositPreflightError("The selected pool’s token decimals changed since the planner snapshot. Refresh and review the pool again.");
  }
  if (feePips > 0xff_ffffn) throw new ClDepositPreflightError("The factory returned an invalid CL swap fee.");
  const livePool: ClPlannerPool = {
    ...selectedPool,
    tickSpacing: spacing,
    currentTick,
    sqrtPriceX96: sqrtPriceX96.toString(),
    activeLiquidity: activeLiquidity.toString(),
  };
  const lower = parsePositiveNumber(options.lowerPrice, "lower price");
  const upper = parsePositiveNumber(options.upperPrice, "upper price");
  const budget = parsePositiveNumber(options.budgetToken1, `budget in ${livePool.token1.symbol}`);
  const budgetRaw = parseTokenAmount(options.budgetToken1, Number(decimals1), `budget in ${livePool.token1.symbol}`);
  const split = calculateClTokenSplit(livePool, { lowerPrice: lower, upperPrice: upper, budgetToken1: budget });
  let amount0Desired = numberToRaw(split.token0Amount, Number(decimals0));
  let amount1Desired = numberToRaw(split.token1Amount, Number(decimals1));
  if (amount0Desired === 0n && amount1Desired === 0n) {
    throw new ClDepositPreflightError("The estimated token amounts round to zero base units. Enter a larger budget.");
  }
  const cappedAmounts = capRawAmountsToToken1Budget(amount0Desired, amount1Desired, budgetRaw, sqrtPriceX96);
  amount0Desired = cappedAmounts.amount0Desired;
  amount1Desired = cappedAmounts.amount1Desired;
  if (amount0Desired === 0n && amount1Desired === 0n) {
    throw new ClDepositPreflightError("The budget is too small for non-zero token base units in this pool.");
  }
  const amount0Min = minimumAmount(amount0Desired, options.slippageBps);
  const amount1Min = minimumAmount(amount1Desired, options.slippageBps);
  const [balance0, balance1, allowance0, allowance1] = await Promise.all([
    readUint(rpc, token0Address, SELECTOR.balanceOf, [encodeAddressWord(account)], tag, "token0 balance"),
    readUint(rpc, token1Address, SELECTOR.balanceOf, [encodeAddressWord(account)], tag, "token1 balance"),
    readUint(rpc, token0Address, SELECTOR.allowance, [encodeAddressWord(account), encodeAddressWord(TESTNET_CL_CONTRACTS.positionManager)], tag, "token0 allowance"),
    readUint(rpc, token1Address, SELECTOR.allowance, [encodeAddressWord(account), encodeAddressWord(TESTNET_CL_CONTRACTS.positionManager)], tag, "token1 allowance"),
  ]);
  if (balance0 < amount0Desired || balance1 < amount1Desired) {
    const missing = [
      balance0 < amount0Desired ? livePool.token0.symbol : null,
      balance1 < amount1Desired ? livePool.token1.symbol : null,
    ].filter(Boolean).join(" and ");
    throw new ClDepositPreflightError(`The connected wallet does not hold enough ${missing} for the exact desired amounts. No approval or deposit request was made.`);
  }
  const deadline = timestamp + CL_DEPOSIT_DEADLINE_SECONDS;
  const mintTransaction: ClDepositTransaction = {
    from: account,
    to: TESTNET_CL_CONTRACTS.positionManager,
    data: encodeClMintCall({
      token0: token0Address,
      token1: token1Address,
      tickSpacing: spacing,
      tickLower: split.lowerTick,
      tickUpper: split.upperTick,
      amount0Desired,
      amount1Desired,
      amount0Min,
      amount1Min,
      recipient: account,
      deadline,
    }),
    value: "0x0",
  };
  return {
    chainId,
    blockNumber: block.number,
    blockTimestamp: timestamp,
    reviewedAtMs: nowMs,
    wallet: account,
    manager: TESTNET_CL_CONTRACTS.positionManager,
    factory: TESTNET_CL_CONTRACTS.factory,
    pool: livePool,
    feePips: Number(feePips),
    split,
    slippageBps: options.slippageBps,
    amount0Desired: amount0Desired.toString(),
    amount1Desired: amount1Desired.toString(),
    amount0Min: amount0Min.toString(),
    amount1Min: amount1Min.toString(),
    balance0: balance0.toString(),
    balance1: balance1.toString(),
    allowance0: allowance0.toString(),
    allowance1: allowance1.toString(),
    deadline,
    mintTransaction,
  };
}

/** Creates the exact static tuple call for Slipstream mint; sqrtPriceX96=0 prevents pool creation. */
export function encodeClMintCall(input: {
  token0: string;
  token1: string;
  tickSpacing: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: string;
  deadline: number | bigint;
}): string {
  const spacing = BigInt(input.tickSpacing);
  const lower = BigInt(input.tickLower);
  const upper = BigInt(input.tickUpper);
  if (!isAddress(input.token0) || !isAddress(input.token1) || !isAddress(input.recipient)) throw new ClDepositPreflightError("A mint address is invalid.");
  if (sameAddress(input.token0, input.token1)) throw new ClDepositPreflightError("The mint token pair is invalid.");
  if (spacing <= 0n || spacing >= (1n << 23n) || lower < -(1n << 23n) || lower >= (1n << 23n) || upper < -(1n << 23n) || upper >= (1n << 23n)) {
    throw new ClDepositPreflightError("The mint tick spacing or bounds do not fit the verified signed int24 ABI.");
  }
  if (lower >= upper || lower % spacing !== 0n || upper % spacing !== 0n) throw new ClDepositPreflightError("Mint ticks must be ordered and aligned to the live pool spacing.");
  if (input.amount0Desired < 0n || input.amount1Desired < 0n || input.amount0Min < 0n || input.amount1Min < 0n || input.amount0Min > input.amount0Desired || input.amount1Min > input.amount1Desired) {
    throw new ClDepositPreflightError("Mint token amounts or minimums are inconsistent.");
  }
  if (input.amount0Desired === 0n && input.amount1Desired === 0n) throw new ClDepositPreflightError("At least one desired token amount must be positive.");
  const deadline = BigInt(input.deadline);
  const words = [
    encodeAddressWord(input.token0),
    encodeAddressWord(input.token1),
    int24Word(spacing),
    int24Word(lower),
    int24Word(upper),
    uintWord(input.amount0Desired),
    uintWord(input.amount1Desired),
    uintWord(input.amount0Min),
    uintWord(input.amount1Min),
    encodeAddressWord(input.recipient),
    uintWord(deadline),
    uintWord(0n), // uint160 sqrtPriceX96: existing, initialized pool only; never create a pool.
  ];
  return `${SLIPSTREAM_MINT_SELECTOR}${words.join("")}`;
}

export function encodeClApproveCall(spender: string, amount: bigint): string {
  if (!isAddress(spender) || amount < 0n) throw new ClDepositPreflightError("The approval spender or amount is invalid.");
  return `${ERC20_APPROVE_SELECTOR}${encodeAddressWord(spender)}${uintWord(amount)}`;
}

/** Re-simulates the exact mint at one current block, with fresh fee, tick, balances and allowances. */
export async function simulateClMint(options: {
  network: MezoNetworkConfig;
  rpc: RpcClient;
  review: ClDepositReview;
  nowMs?: number;
}): Promise<SimulatedClTransaction> {
  const { network, rpc, review } = options;
  const nowMs = options.nowMs ?? Date.now();
  assertTestnet(network);
  assertReviewUsable(review, nowMs);
  const chainId = await readChainId(rpc);
  if (chainId !== review.chainId) throw new ClDepositPreflightError("The wallet plan is no longer on Mezo Testnet. Review the network before continuing.");
  const block = await readCurrentBlock(rpc);
  const timestamp = await readBlockTimestamp(rpc, block.tag);
  if (timestamp + 30 >= review.deadline) throw new ClDepositPreflightError("The mint deadline is too close. Refresh the planner and prepare a new review.");
  await assertManagerAndPool(rpc, review, block.tag);
  const [tick, fee, activeLiquidity, balance0, balance1, allowance0, allowance1] = await Promise.all([
    readPoolTick(rpc, review.pool.address, block.tag),
    readUint(rpc, review.factory, CL_GET_SWAP_FEE_SELECTOR, [encodeAddressWord(review.pool.address)], block.tag, "live pool swap fee"),
    readUint(rpc, review.pool.address, SELECTOR.liquidity, [], block.tag, "active pool liquidity"),
    readUint(rpc, review.pool.token0.address, SELECTOR.balanceOf, [encodeAddressWord(review.wallet)], block.tag, "token0 balance"),
    readUint(rpc, review.pool.token1.address, SELECTOR.balanceOf, [encodeAddressWord(review.wallet)], block.tag, "token1 balance"),
    readUint(rpc, review.pool.token0.address, SELECTOR.allowance, [encodeAddressWord(review.wallet), encodeAddressWord(review.manager)], block.tag, "token0 allowance"),
    readUint(rpc, review.pool.token1.address, SELECTOR.allowance, [encodeAddressWord(review.wallet), encodeAddressWord(review.manager)], block.tag, "token1 allowance"),
  ]);
  if (tick !== review.pool.currentTick || fee !== BigInt(review.feePips)) {
    throw new ClDepositPreflightError("The live pool tick or swap fee changed since review. Refresh the planner and prepare the updated amounts before minting.");
  }
  if (activeLiquidity === 0n) throw new ClDepositPreflightError("The selected pool no longer has active liquidity. Refresh the planner and review a currently active pool before minting.");
  const amount0 = BigInt(review.amount0Desired);
  const amount1 = BigInt(review.amount1Desired);
  if (balance0 < amount0 || balance1 < amount1) throw new ClDepositPreflightError("A token balance changed and no longer covers the reviewed maximum amounts.");
  if (allowance0 < amount0 || allowance1 < amount1) throw new ClDepositPreflightError("The position manager still needs a separate exact token approval. No mint request was made.");
  return simulateTransaction(rpc, review.mintTransaction, block, nowMs, "mint");
}

/** Preflights one exact token approval; any zero-reset is returned as its own separate action. */
export async function simulateClApproval(options: {
  network: MezoNetworkConfig;
  rpc: RpcClient;
  review: ClDepositReview;
  tokenIndex: 0 | 1;
  nowMs?: number;
}): Promise<SimulatedClTransaction> {
  const { network, rpc, review, tokenIndex } = options;
  const nowMs = options.nowMs ?? Date.now();
  assertTestnet(network);
  assertReviewUsable(review, nowMs);
  const chainId = await readChainId(rpc);
  if (chainId !== review.chainId) throw new ClDepositPreflightError("The wallet plan is no longer on Mezo Testnet.");
  const block = await readCurrentBlock(rpc);
  await Promise.all([
    requireCode(rpc, review.manager, block.tag, "Nonfungible Position Manager"),
    requireCode(rpc, TESTNET_CL_CONTRACTS.factory, block.tag, "CL Factory"),
  ]);
  const managerFactory = await readAddress(rpc, review.manager, SELECTOR.managerFactory, [], block.tag, "position manager factory");
  if (!sameAddress(managerFactory, review.factory)) throw new ClDepositPreflightError("The live position manager factory changed. No approval is available.");
  const token = tokenIndex === 0 ? review.pool.token0 : review.pool.token1;
  const desired = BigInt(tokenIndex === 0 ? review.amount0Desired : review.amount1Desired);
  const [balance, allowance] = await Promise.all([
    readUint(rpc, token.address, SELECTOR.balanceOf, [encodeAddressWord(review.wallet)], block.tag, "token balance"),
    readUint(rpc, token.address, SELECTOR.allowance, [encodeAddressWord(review.wallet), encodeAddressWord(review.manager)], block.tag, "token allowance"),
  ]);
  if (balance < desired) throw new ClDepositPreflightError(`The wallet no longer has enough ${token.symbol} for the reviewed position.`);
  if (allowance >= desired) throw new ClDepositPreflightError(`The ${token.symbol} allowance is already sufficient. Recheck the deposit review instead of approving again.`);
  const makeApproval = (amount: bigint) => ({
    from: review.wallet,
    to: token.address,
    data: encodeClApproveCall(review.manager, amount),
    value: "0x0" as const,
  });
  try {
    return await simulateTransaction(rpc, makeApproval(desired), block, nowMs, "approve", { tokenIndex, amount: desired.toString() });
  } catch (directError) {
    if (allowance === 0n) throw directError;
    try {
      return await simulateTransaction(rpc, makeApproval(0n), block, nowMs, "reset-approval", { tokenIndex, amount: "0" });
    } catch {
      throw directError;
    }
  }
}

function assertReviewUsable(review: ClDepositReview, nowMs: number): void {
  if (review.chainId !== TESTNET_CL_CONTRACTS.chainId || review.manager.toLowerCase() !== TESTNET_CL_CONTRACTS.positionManager.toLowerCase()) {
    throw new ClDepositPreflightError("The deposit review does not match the verified Mezo Testnet manager.");
  }
  if (nowMs < review.reviewedAtMs || nowMs - review.reviewedAtMs > CL_DEPOSIT_REVIEW_MAX_AGE_MS) {
    throw new ClDepositPreflightError("This deposit review has expired. Prepare a fresh review before any wallet prompt.");
  }
}

async function assertManagerAndPool(rpc: RpcClient, review: ClDepositReview, tag: string): Promise<void> {
  await Promise.all([
    requireCode(rpc, review.manager, tag, "Nonfungible Position Manager"),
    requireCode(rpc, review.factory, tag, "CL Factory"),
    requireCode(rpc, review.pool.address, tag, "selected CL pool"),
    requireCode(rpc, review.pool.token0.address, tag, "token0"),
    requireCode(rpc, review.pool.token1.address, tag, "token1"),
  ]);
  const [managerFactory, token0, token1, spacing, mappedPool] = await Promise.all([
    readAddress(rpc, review.manager, SELECTOR.managerFactory, [], tag, "position manager factory"),
    readAddress(rpc, review.pool.address, SELECTOR.token0, [], tag, "pool token0"),
    readAddress(rpc, review.pool.address, SELECTOR.token1, [], tag, "pool token1"),
    readInt24(rpc, review.pool.address, SELECTOR.tickSpacing, tag, "pool tick spacing"),
    readAddress(rpc, review.factory, CL_GET_POOL_INT24_SELECTOR, [encodeAddressWord(review.pool.token0.address), encodeAddressWord(review.pool.token1.address), int24Word(BigInt(review.pool.tickSpacing))], tag, "factory pool lookup"),
  ]);
  if (!sameAddress(managerFactory, review.factory) || !sameAddress(token0, review.pool.token0.address) || !sameAddress(token1, review.pool.token1.address) || spacing !== review.pool.tickSpacing || !sameAddress(mappedPool, review.pool.address)) {
    throw new ClDepositPreflightError("The live manager, factory, pool key or token order no longer matches the reviewed transaction.");
  }
}

async function simulateTransaction(
  rpc: RpcClient,
  transaction: ClDepositTransaction,
  block: { number: number; tag: string },
  nowMs: number,
  kind: SimulatedClTransaction["kind"],
  approval?: { tokenIndex: 0 | 1; amount: string },
): Promise<SimulatedClTransaction> {
  let gasEstimate: bigint;
  try {
    gasEstimate = parseRpcQuantity(await rpc.call<string>("eth_estimateGas", [transaction, block.tag]), "gas estimate");
    if (gasEstimate <= 0n) throw new ClDepositPreflightError("The transaction gas estimate was not positive.");
    const gasLimit = (gasEstimate * 12_000n + 9_999n) / 10_000n;
    const result = await rpc.call<string>("eth_call", [{ ...transaction, gas: toHexQuantity(gasLimit) }, block.tag]);
    if (kind === "mint") {
      const words = decodeWords(result, 4, "simulated mint return");
      const simulatedLiquidity = BigInt(`0x${words[1]}`);
      const simulatedAmount0 = BigInt(`0x${words[2]}`);
      const simulatedAmount1 = BigInt(`0x${words[3]}`);
      if (simulatedLiquidity === 0n) throw new ClDepositPreflightError("The mint simulation returned zero liquidity.");
      const desired0 = readMintWord(transaction.data, 5);
      const desired1 = readMintWord(transaction.data, 6);
      const minimum0 = readMintWord(transaction.data, 7);
      const minimum1 = readMintWord(transaction.data, 8);
      if (simulatedAmount0 > desired0 || simulatedAmount1 > desired1 || simulatedAmount0 < minimum0 || simulatedAmount1 < minimum1) {
        throw new ClDepositPreflightError("The simulated token use is outside the reviewed desired/minimum amounts. The mint is blocked.");
      }
      return {
        kind,
        transaction: { ...transaction, gas: toHexQuantity(gasLimit) },
        gasEstimate: gasEstimate.toString(),
        gasLimit: gasLimit.toString(),
        blockNumber: block.number,
        checkedAtMs: nowMs,
        simulatedLiquidity: simulatedLiquidity.toString(),
        simulatedAmount0: simulatedAmount0.toString(),
        simulatedAmount1: simulatedAmount1.toString(),
      };
    }
    if (result !== "0x") {
      const returned = decodeUint256(result);
      if (returned !== 1n) throw new ClDepositPreflightError("The token approval simulation did not return true.");
    }
    return {
      kind,
      transaction: { ...transaction, gas: toHexQuantity(gasLimit) },
      gasEstimate: gasEstimate.toString(),
      gasLimit: gasLimit.toString(),
      blockNumber: block.number,
      checkedAtMs: nowMs,
      approvalTokenIndex: approval?.tokenIndex,
      approvalAmount: approval?.amount,
    };
  } catch (error) {
    if (error instanceof ClDepositPreflightError) throw error;
    throw new ClDepositPreflightError(`The exact ${kind === "mint" ? "mint" : "approval"} call could not be simulated at the checked Testnet block. No wallet request was made.`);
  }
}

export function minimumAmount(desired: bigint, slippageBps: number): bigint {
  assertSlippage(slippageBps);
  if (desired < 0n) throw new ClDepositPreflightError("A token amount cannot be negative.");
  return desired * BigInt(10_000 - slippageBps) / 10_000n;
}

/** Converts token0 raw units to token1 raw units using the raw-unit pool price, rounding up. */
export function token0RawValueInToken1Raw(amount0Raw: bigint, sqrtPriceX96: bigint): bigint {
  if (amount0Raw < 0n || sqrtPriceX96 <= 0n || sqrtPriceX96 >= (1n << 160n)) throw new ClDepositPreflightError("The raw token amount or pool price is invalid.");
  const numerator = amount0Raw * sqrtPriceX96 * sqrtPriceX96;
  return (numerator + Q192 - 1n) / Q192;
}

/** Caps a raw token split to an exact token1-denominated budget without over-spending by rounding. */
export function capRawAmountsToToken1Budget(
  amount0Raw: bigint,
  amount1Raw: bigint,
  budget1Raw: bigint,
  sqrtPriceX96: bigint,
): { amount0Desired: bigint; amount1Desired: bigint } {
  if (amount0Raw < 0n || amount1Raw < 0n || budget1Raw < 0n) throw new ClDepositPreflightError("Raw token amounts and budget cannot be negative.");
  const totalValueRaw = token0RawValueInToken1Raw(amount0Raw, sqrtPriceX96) + amount1Raw;
  if (totalValueRaw <= budget1Raw) return { amount0Desired: amount0Raw, amount1Desired: amount1Raw };

  let amount0Desired = amount0Raw * budget1Raw / totalValueRaw;
  let amount1Desired = amount1Raw * budget1Raw / totalValueRaw;
  let value0InToken1Raw = token0RawValueInToken1Raw(amount0Desired, sqrtPriceX96);
  if (value0InToken1Raw > budget1Raw) {
    amount0Desired = budget1Raw * Q192 / (sqrtPriceX96 * sqrtPriceX96);
    value0InToken1Raw = token0RawValueInToken1Raw(amount0Desired, sqrtPriceX96);
  }
  const remainingBudgetRaw = budget1Raw - value0InToken1Raw;
  if (amount1Desired > remainingBudgetRaw) amount1Desired = remainingBudgetRaw;
  if (token0RawValueInToken1Raw(amount0Desired, sqrtPriceX96) + amount1Desired > budget1Raw) {
    throw new ClDepositPreflightError("Raw-unit rounding could not be kept within the entered token1 budget. Refresh and review the amount again.");
  }
  return { amount0Desired, amount1Desired };
}

export function parseTokenAmount(value: string, decimals: number, label = "amount"): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new ClDepositPreflightError(`${label} has unsupported on-chain decimals.`);
  const text = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(text)) throw new ClDepositPreflightError(`Enter ${label} as a plain decimal number.`);
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new ClDepositPreflightError(`${label} supports at most ${decimals} decimal places.`);
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

export function formatRawTokenAmount(raw: string | bigint, decimals: number): string {
  const value = typeof raw === "bigint" ? raw : BigInt(raw);
  if (value < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) return "unavailable";
  const scale = 10n ** BigInt(decimals);
  const whole = (value / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (decimals === 0) return whole;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function formatClFeePips(feePips: number): string {
  if (!Number.isSafeInteger(feePips) || feePips < 0) return "unavailable";
  const percent = feePips / 10_000;
  return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(percent)}%`;
}

function numberToRaw(value: number, decimals: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new ClDepositPreflightError("The estimated token split is outside the supported numeric range.");
  const text = expandExponential(value.toString());
  const [whole, fraction = ""] = text.split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new ClDepositPreflightError("The estimated token amount could not be converted to base units.");
  }
  return BigInt(whole + fraction.slice(0, decimals).padEnd(decimals, "0"));
}

function expandExponential(value: string): string {
  const match = /^([+-]?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/.exec(value);
  if (!match) return value;
  const sign = match[1];
  const integer = match[2];
  const fraction = match[3] ?? "";
  const exponent = Number(match[4]);
  const digits = integer + fraction;
  const point = integer.length + exponent;
  if (Math.abs(exponent) > 1_000) throw new ClDepositPreflightError("The estimated token amount exceeds the supported numeric range.");
  if (point <= 0) return `${sign}0.${"0".repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${"0".repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function parsePositiveNumber(value: string, label: string): number {
  const text = value.trim();
  if (!/^\d+(?:\.\d*)?$/.test(text)) throw new ClDepositPreflightError(`Enter a positive ${label} as a plain decimal number.`);
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) throw new ClDepositPreflightError(`Enter a positive finite ${label}.`);
  return number;
}

function assertSlippage(bps: number): void {
  if (!Number.isInteger(bps) || bps < 0 || bps > 2_000) throw new ClDepositPreflightError("Slippage must be between 0% and 20% in basis points.");
}

function assertTestnet(network: MezoNetworkConfig): void {
  if (network.key !== "testnet" || network.chainId !== TESTNET_CL_CONTRACTS.chainId) {
    throw new ClDepositPreflightError("CL position deposits are available only on Mezo Testnet (chain 31611). No transaction request was made.");
  }
}

async function readCurrentBlock(rpc: RpcClient): Promise<{ number: number; tag: string }> {
  const blockHex = await rpc.call<string>("eth_blockNumber");
  const numberBig = parseRpcQuantity(blockHex, "block number");
  const number = toSafeNumber(numberBig, "block number");
  return { number, tag: toHexQuantity(numberBig) };
}

async function readBlockTimestamp(rpc: RpcClient, tag: string): Promise<number> {
  const block = await rpc.call<{ timestamp?: unknown }>("eth_getBlockByNumber", [tag, false]);
  if (typeof block.timestamp !== "string") throw new ClDepositPreflightError("The checked Testnet block did not provide a timestamp; no deadline was guessed.");
  return toSafeNumber(parseRpcQuantity(block.timestamp, "block timestamp"), "block timestamp");
}

async function readChainId(rpc: RpcClient): Promise<number> {
  const chain = parseChainId(await rpc.call<unknown>("eth_chainId"));
  if (chain === null) throw new ClDepositPreflightError("The read RPC returned an invalid chain ID.");
  return chain;
}

async function readPoolTick(rpc: RpcClient, pool: string, tag: string): Promise<number> {
  const words = decodeWords(await call(rpc, pool, SELECTOR.slot0, tag), 6, "pool slot0");
  return decodeInt24(BigInt(`0x${words[1]}`));
}

async function readUint(rpc: RpcClient, to: string, selector: string, args: string[], tag: string, label: string): Promise<bigint> {
  const result = await call(rpc, to, `${selector}${args.join("")}`, tag);
  try { return decodeUint256(result); } catch { throw new ClDepositPreflightError(`The RPC returned an invalid ${label}.`); }
}

async function readAddress(rpc: RpcClient, to: string, selector: string, args: string[], tag: string, label: string): Promise<`0x${string}`> {
  return decodeAddress(await call(rpc, to, `${selector}${args.join("")}`, tag), label);
}

async function readInt24(rpc: RpcClient, to: string, selector: string, tag: string, label: string): Promise<number> {
  const word = decodeWord(await call(rpc, to, selector, tag), label);
  return decodeInt24(BigInt(`0x${word}`));
}

async function call(rpc: RpcClient, to: string, data: string, tag: string): Promise<string> {
  return rpc.call<string>("eth_call", [{ to, data }, tag]);
}

async function requireCode(rpc: RpcClient, address: string, tag: string, label: string): Promise<void> {
  const code = await rpc.call<string>("eth_getCode", [address, tag]);
  if (typeof code !== "string" || !/^0x[0-9a-fA-F]*$/.test(code) || code.length <= 2 || /^0x0+$/i.test(code)) {
    throw new ClDepositPreflightError(`No deployed bytecode was found for ${label} on the checked Testnet block.`);
  }
}

function decodeAddress(data: string, label: string): `0x${string}` {
  const word = decodeWord(data, label);
  const address = `0x${word.slice(-40)}`;
  if (!isAddress(address)) throw new ClDepositPreflightError(`The RPC returned an invalid ${label}.`);
  return address;
}

function decodeWord(data: string, label: string): string {
  return decodeWords(data, 1, label)[0];
}

function decodeWords(data: string, count: number, label: string): string[] {
  if (typeof data !== "string" || !/^0x[0-9a-fA-F]*$/.test(data) || data.length < 2 + count * 64) {
    throw new ClDepositPreflightError(`The RPC returned malformed ${label} data.`);
  }
  const body = data.slice(2);
  return Array.from({ length: count }, (_, index) => body.slice(index * 64, (index + 1) * 64));
}

function decodeInt24(data: bigint): number {
  const signed = data >= (1n << 255n) ? data - (1n << 256n) : data;
  if (signed < -(1n << 23n) || signed >= (1n << 23n)) throw new ClDepositPreflightError("A live tick does not fit the signed int24 ABI.");
  return Number(signed);
}

function int24Word(value: bigint): string {
  if (value < -(1n << 23n) || value >= (1n << 23n)) throw new ClDepositPreflightError("A signed tick does not fit the int24 ABI.");
  return uintWord(value < 0n ? (1n << 256n) + value : value);
}

function uintWord(value: bigint): string {
  if (value < 0n || value > MAX_UINT256) throw new ClDepositPreflightError("An ABI uint256 argument is out of range.");
  return value.toString(16).padStart(64, "0");
}

function parseRpcQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new ClDepositPreflightError(`The RPC returned an invalid ${label}.`);
  return BigInt(value);
}

function toHexQuantity(value: bigint): string {
  if (value < 0n) throw new ClDepositPreflightError("A transaction quantity cannot be negative.");
  return `0x${value.toString(16)}`;
}

function toSafeNumber(value: bigint, label: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new ClDepositPreflightError(`The ${label} is outside the safe integer range.`);
  return Number(value);
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function normalizeAddress(value: string, label: string): `0x${string}` {
  if (!isAddress(value)) throw new ClDepositPreflightError(`The ${label} address is invalid.`);
  return value;
}

function readMintWord(data: string, index: number): bigint {
  const wordStart = 10 + index * 64;
  const word = data.slice(wordStart, wordStart + 64);
  if (word.length !== 64) throw new ClDepositPreflightError("The encoded mint transaction was incomplete.");
  return BigInt(`0x${word}`);
}
