import { getPositions, type AlpacaPosition } from "@/lib/alpaca";
import { hasLiveCredentials, hasPaperCredentials } from "@/lib/broker-config";
import {
  alpacaPositionQty,
  alpacaPositionSide,
  positionKey,
} from "@/lib/position-sync-helpers";
import {
  EMPTY_MODE_UNREALIZED,
  type AlpacaUnrealizedPosition,
  type ModeUnrealizedPnlSnapshot,
} from "@/lib/alpaca-unrealized-pnl-shared";

const LOG_PREFIX = "[alpaca-unrealized-pnl]";

function parseAlpacaPosition(pos: AlpacaPosition): AlpacaUnrealizedPosition | null {
  const qty = alpacaPositionQty(pos);
  if (qty <= 0) return null;

  const side = alpacaPositionSide(pos);
  return {
    symbol: pos.symbol,
    side,
    unrealizedPl: parseFloat(pos.unrealized_pl) || 0,
    unrealizedPlpc: parseFloat(pos.unrealized_plpc) || 0,
    marketValue: parseFloat(pos.market_value) || 0,
    qty,
    currentPrice: parseFloat(pos.current_price) || 0,
    avgEntryPrice: parseFloat(pos.avg_entry_price) || 0,
  };
}

export function buildUnrealizedSnapshotFromPositions(
  mode: "paper" | "live",
  positions: AlpacaPosition[],
  openTradeSymbols: string[] = []
): ModeUnrealizedPnlSnapshot {
  const byPositionKey: Record<string, AlpacaUnrealizedPosition> = {};
  let totalUnrealizedPl = 0;

  for (const pos of positions) {
    const parsed = parseAlpacaPosition(pos);
    if (!parsed) continue;
    byPositionKey[positionKey(parsed.symbol, parsed.side)] = parsed;
    totalUnrealizedPl += parsed.unrealizedPl;
  }

  const positionCount = Object.keys(byPositionKey).length;
  const alpacaSymbols = new Set(Object.values(byPositionKey).map((p) => p.symbol));
  const matchedSymbols = [...new Set(openTradeSymbols.filter((symbol) => alpacaSymbols.has(symbol)))];

  console.log(`${LOG_PREFIX} ${mode}`, {
    positionCount,
    matchedSymbols,
    totalUnrealizedPl,
  });

  return {
    mode,
    skipped: false,
    positionCount,
    matchedSymbols,
    totalUnrealizedPl,
    byPositionKey,
  };
}

export async function fetchModeUnrealizedPnl(
  mode: "paper" | "live",
  openTradeSymbols: string[] = []
): Promise<ModeUnrealizedPnlSnapshot> {
  const skipped = { ...EMPTY_MODE_UNREALIZED, mode };

  if (mode === "paper" && !hasPaperCredentials()) return skipped;
  if (mode === "live" && !hasLiveCredentials()) return skipped;

  try {
    const positions = await getPositions(mode === "paper");
    return buildUnrealizedSnapshotFromPositions(mode, positions, openTradeSymbols);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch Alpaca positions";
    console.error(`${LOG_PREFIX} ${mode} failed`, { message });
    return { ...skipped, skipped: false, error: message };
  }
}

export async function fetchAllUnrealizedPnl(
  openTrades: Array<{ mode: string; symbol: string; status: string }>
): Promise<{ paper: ModeUnrealizedPnlSnapshot; live: ModeUnrealizedPnlSnapshot }> {
  const paperSymbols = openTrades
    .filter((trade) => trade.status === "open" && trade.mode === "paper")
    .map((trade) => trade.symbol);
  const liveSymbols = openTrades
    .filter((trade) => trade.status === "open" && trade.mode === "live")
    .map((trade) => trade.symbol);

  const [paper, live] = await Promise.all([
    fetchModeUnrealizedPnl("paper", paperSymbols),
    fetchModeUnrealizedPnl("live", liveSymbols),
  ]);

  return { paper, live };
}
