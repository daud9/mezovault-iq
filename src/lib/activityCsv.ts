import { formatTokenUnits } from "./tokenAmount";

export interface ActivityCsvTransfer {
  token: "MUSD" | "MEZO";
  decimals: number;
  log: {
    txHash: string;
    logIndex: number;
    blockNumber: number;
    from: string;
    to: string;
    valueRaw: bigint;
    direction: "incoming" | "outgoing" | "self";
  };
}

export interface ActivityCsvCoverage {
  fromBlock: number;
  toBlock: number;
  snapshotBlock: number;
  retrievedAt: string;
}

function csvCell(value: string | number): string {
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Exports exactly the rows currently loaded in Activity, without fetching more history. */
export function buildActivityCsv(transfers: ActivityCsvTransfer[], coverage: ActivityCsvCoverage): string {
  const header = [
    "token",
    "direction",
    "block_number",
    "transaction_hash",
    "log_index",
    "from_address",
    "to_address",
    "amount",
    "raw_amount",
    "token_decimals",
    "coverage_from_block",
    "coverage_to_block",
    "snapshot_block",
    "retrieved_at_utc",
  ];
  const rows = transfers.map(({ token, decimals, log }) => [
    token,
    log.direction,
    log.blockNumber,
    log.txHash,
    log.logIndex,
    log.from,
    log.to,
    formatTokenUnits(log.valueRaw, decimals, Math.min(18, decimals)),
    log.valueRaw.toString(),
    decimals,
    coverage.fromBlock,
    coverage.toBlock,
    coverage.snapshotBlock,
    coverage.retrievedAt,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
