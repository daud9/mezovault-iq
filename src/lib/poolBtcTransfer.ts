/**
 * Safe preflight for the Mezo Testnet MUSD/BTC pool's BTC ERC-20 output.
 * This prepares a wallet request only; it never signs or broadcasts it.
 */
import type { MezoNetworkConfig } from "../config/chains";
import { TESTNET_POOL_BTC_TOKEN } from "../config/pools";
import { decodeAbiString, decodeUint256, encodeAddressWord, isAddress, SELECTORS } from "./abi";
import { parseChainId } from "./network";
import { readSnapshotBlock } from "./readSnapshotBlock";
import type { RpcClient } from "./rpc";
import { buildTransfer, parseAmount, validateRecipient, type TxRequest } from "./transfer";

const GAS_BUFFER_NUMERATOR = 120n;
const GAS_BUFFER_DENOMINATOR = 100n;

export interface PreparedPoolBtcTransfer {
  transaction: TxRequest;
  recipient: `0x${string}`;
  amountRaw: bigint;
  amountText: string;
  tokenBalanceRaw: bigint;
  nativeBtcRaw: bigint;
  blockNumber: number;
  gasEstimate: bigint;
  gasLimit: bigint;
  gasPrice: bigint;
  maximumFeeRaw: bigint;
  preparedAtMs: number;
}

/** Verify live token identity, exact balances, the exact transfer call, and gas before review. */
export async function preparePoolBtcTransfer(options: {
  network: MezoNetworkConfig;
  owner: string;
  recipient: string;
  amount: string;
  rpc: RpcClient;
  nowMs?: number;
}): Promise<PreparedPoolBtcTransfer> {
  const { network, owner, recipient, amount, rpc } = options;
  const nowMs = options.nowMs ?? Date.now();
  if (network.key !== "testnet" || network.chainId !== 31_611 || network.chainIdHex !== "0x7b7b") {
    throw new Error("Pool BTC (ERC-20) transfers are available only on Mezo Testnet (chain ID 31611).");
  }
  if (!isAddress(owner)) throw new Error("Connect a valid wallet account before preparing this transfer.");
  if (!Number.isSafeInteger(nowMs) || nowMs <= 0) throw new Error("The local clock is invalid; refresh and try again.");
  const recipientError = validateRecipient(recipient, owner);
  if (recipientError) throw new Error(recipientError);
  const parsedAmount = parseAmount(amount, TESTNET_POOL_BTC_TOKEN.decimals);
  if (!parsedAmount.ok) throw new Error(parsedAmount.error);

  const rpcChainId = parseChainId(await rpc.call<unknown>("eth_chainId"));
  if (rpcChainId !== 31_611) {
    throw new Error("The RPC does not report Mezo Testnet (chain ID 31611). No transfer is prepared.");
  }
  const { blockTag, blockNumber } = await readSnapshotBlock(rpc);
  const tokenAddress = TESTNET_POOL_BTC_TOKEN.address;
  const code = await rpc.call<string>("eth_getCode", [tokenAddress, blockTag]);
  if (typeof code !== "string" || code === "0x" || /^0x0+$/i.test(code)) {
    throw new Error("The Pool BTC (ERC-20) contract has no bytecode at the current Testnet read. No transfer is prepared.");
  }
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(code)) {
    throw new Error("The Pool BTC (ERC-20) bytecode response is invalid. No transfer is prepared.");
  }

  const at = (data: string) => rpc.call<string>("eth_call", [{ to: tokenAddress, data }, blockTag]);
  const [symbolHex, decimalsHex, balanceHex, nativeBalanceHex] = await Promise.all([
    at(SELECTORS.symbol),
    at(SELECTORS.decimals),
    at(`${SELECTORS.balanceOf}${encodeAddressWord(owner)}`),
    rpc.call<string>("eth_getBalance", [owner, blockTag]),
  ]);
  if (decodeAbiString(symbolHex) !== TESTNET_POOL_BTC_TOKEN.symbol) {
    throw new Error("The token at the configured Pool BTC address does not report symbol BTC. No transfer is prepared.");
  }
  if (decodeUint256(decimalsHex) !== BigInt(TESTNET_POOL_BTC_TOKEN.decimals)) {
    throw new Error("The Pool BTC (ERC-20) token does not report 18 decimals. No transfer is prepared.");
  }
  const tokenBalanceRaw = decodeUint256(balanceHex);
  const nativeBtcRaw = parseRpcQuantity(nativeBalanceHex, "native BTC gas balance");
  if (tokenBalanceRaw < parsedAmount.raw) {
    throw new Error("There is not enough Pool BTC (ERC-20) in this wallet for the requested amount.");
  }

  const token = {
    kind: "erc20" as const,
    symbol: "Pool BTC (ERC-20)" as const,
    decimals: TESTNET_POOL_BTC_TOKEN.decimals,
    address: tokenAddress,
  };
  const baseTransaction = buildTransfer(token, owner as `0x${string}`, recipient as `0x${string}`, parsedAmount.raw);
  const gasEstimate = parseRpcQuantity(
    await rpc.call<string>("eth_estimateGas", [{ ...baseTransaction }, blockTag]),
    "gas estimate",
  );
  if (gasEstimate <= 0n) throw new Error("The network returned a zero gas estimate. No transfer is prepared.");
  const gasLimit = (gasEstimate * GAS_BUFFER_NUMERATOR + GAS_BUFFER_DENOMINATOR - 1n) / GAS_BUFFER_DENOMINATOR;
  const gasPrice = parseRpcQuantity(await rpc.call<string>("eth_gasPrice", []), "gas price");
  if (gasPrice <= 0n) throw new Error("The current network gas price could not be verified.");
  const maximumFeeRaw = gasLimit * gasPrice;
  if (maximumFeeRaw > nativeBtcRaw) {
    throw new Error("Not enough native BTC (gas BTC) for the maximum reviewed network fee.");
  }

  const transaction: TxRequest = {
    ...baseTransaction,
    gas: toRpcQuantity(gasLimit),
  };
  const simulationResult = decodeUint256(await rpc.call<string>(
    "eth_call",
    [{ ...transaction }, blockTag],
  ));
  if (simulationResult !== 1n) {
    throw new Error("The exact Pool BTC (ERC-20) transfer simulation did not return true. No transfer is prepared.");
  }

  return {
    transaction,
    recipient: recipient as `0x${string}`,
    amountRaw: parsedAmount.raw,
    amountText: amount.trim(),
    tokenBalanceRaw,
    nativeBtcRaw,
    blockNumber,
    gasEstimate,
    gasLimit,
    gasPrice,
    maximumFeeRaw,
    preparedAtMs: nowMs,
  };
}

function parseRpcQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) {
    throw new Error(`The RPC returned an invalid ${label}.`);
  }
  return BigInt(value);
}

function toRpcQuantity(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`;
}
