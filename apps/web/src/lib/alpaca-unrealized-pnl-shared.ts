import type { Trade, TradeSide } from "@wicksense/core";
import { positionKey } from "@/lib/position-sync-helpers";

export interface AlpacaUnrealizedPosition {
  symbol: string;
  side: TradeSide;
  unrealizedPl: number;
  unrealizedPlpc: number;
  marketValue: number;
  qty: number;
  currentPrice: number;
  avgEntryPrice: number;
}

export interface ModeUnrealizedPnlSnapshot {
  mode: "paper" | "live";
  skipped: boolean;
  positionCount: number;
  matchedSymbols: string[];
  totalUnrealizedPl: number;
  byPositionKey: Record<string, AlpacaUnrealizedPosition>;
  error?: string;
}

export const EMPTY_MODE_UNREALIZED: ModeUnrealizedPnlSnapshot = {
  mode: "paper",
  skipped: true,
  positionCount: 0,
  matchedSymbols: [],
  totalUnrealizedPl: 0,
  byPositionKey: {},
};

export function formatUnrealizedPlpc(plpc: number): string {
  return `${(plpc * 100).toFixed(2)}%`;
}

export const UNREALIZED_PNL_TOOLTIP =
  "Unrealized P&L from Alpaca for WickSense open trades only (excludes orphaned broker positions)";

/** Match open trade rows to Alpaca positions by symbol (and side when available). */
export function lookupUnrealizedForOpenTrade(
  trade: Pick<Trade, "status" | "symbol" | "side">,
  snapshot: ModeUnrealizedPnlSnapshot | null | undefined
): AlpacaUnrealizedPosition | null {
  if (trade.status !== "open" || !snapshot || snapshot.skipped) return null;

  const sideKey = positionKey(trade.symbol, trade.side);
  if (snapshot.byPositionKey[sideKey]) {
    return snapshot.byPositionKey[sideKey];
  }

  return (
    Object.values(snapshot.byPositionKey).find((position) => position.symbol === trade.symbol) ??
    null
  );
}
