import type { OHLCV } from "@wicksense/core";
import {
  getBrokerCredentials,
  getPaperCredentials,
  getLiveCredentials,
  hasPaperCredentials,
  hasLiveCredentials,
} from "./broker-config";
import { DEFAULT_STARTING_BALANCE } from "./account-utils";
import {
  parseAlpacaOrderFill,
  isFilledOrderStatus,
  isTerminalOrderStatus,
  type AlpacaOrderFill,
} from "./alpaca-order-fill";

export type { AlpacaOrderFill };
export { parseAlpacaOrderFill, isFilledOrderStatus, isTerminalOrderStatus } from "./alpaca-order-fill";

const ALPACA_DATA_URL = "https://data.alpaca.markets/v2";
const ALPACA_PAPER_URL = "https://paper-api.alpaca.markets";
const ALPACA_LIVE_URL = "https://api.alpaca.markets";

export interface AlpacaOrder {
  id: string;
  symbol: string;
  qty: string;
  side: "buy" | "sell";
  type: string;
  status: string;
  filled_avg_price?: string | null;
  filled_qty?: string | null;
  stop_price?: string;
  limit_price?: string;
  created_at: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  avg_entry_price: string;
}

function getHeaders(creds?: { apiKey: string; secretKey: string }) {
  const { apiKey, secretKey } = creds ?? getBrokerCredentials();
  return {
    "APCA-API-KEY-ID": apiKey,
    "APCA-API-SECRET-KEY": secretKey,
  };
}

function getTradingUrl(paper: boolean) {
  return paper ? ALPACA_PAPER_URL : ALPACA_LIVE_URL;
}

export function hasAlpacaCredentials(): boolean {
  return hasPaperCredentials() || hasLiveCredentials();
}

export { hasPaperCredentials, hasLiveCredentials };

export interface AlpacaAccountSnapshot {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  currency: string;
  status: string;
}

export async function fetchAlpacaAccount(
  paper: boolean
): Promise<{ account: AlpacaAccountSnapshot | null; error?: string }> {
  const creds = paper ? getPaperCredentials() : getLiveCredentials();
  if (!creds.apiKey || !creds.secretKey) {
    return { account: null, error: paper ? "No paper keys configured" : "No live keys configured" };
  }

  try {
    const res = await fetch(`${getTradingUrl(paper)}/v2/account`, {
      headers: getHeaders(creds),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        (data as { message?: string }).message ||
        (data as { error?: string }).error ||
        `HTTP ${res.status}`;
      return { account: null, error: msg };
    }

    const raw = data as Record<string, string>;
    return {
      account: {
        equity: parseFloat(raw.equity ?? "0"),
        cash: parseFloat(raw.cash ?? "0"),
        buyingPower: parseFloat(raw.buying_power ?? "0"),
        portfolioValue: parseFloat(raw.portfolio_value ?? raw.equity ?? "0"),
        currency: raw.currency ?? "USD",
        status: raw.status ?? "unknown",
      },
    };
  } catch (err) {
    return {
      account: null,
      error: err instanceof Error ? err.message : "Failed to reach Alpaca",
    };
  }
}

/** Account equity for position sizing — paper/live from Alpaca, fallback for disconnected modes. */
export async function resolveAccountEquity(
  mode: "paper" | "live" | "manual" | "auto"
): Promise<{ equity: number; source: "alpaca" | "fallback" }> {
  if (mode === "live") {
    const { account, error } = await fetchAlpacaAccount(false);
    if (account && account.equity > 0) {
      return { equity: account.equity, source: "alpaca" };
    }
    throw new Error(error ?? "Live Alpaca account equity unavailable");
  }

  const { account, error } = await fetchAlpacaAccount(true);
  if (account && account.equity > 0) {
    return { equity: account.equity, source: "alpaca" };
  }

  if (mode === "paper") {
    throw new Error(error ?? "Paper Alpaca account equity unavailable");
  }

  return { equity: DEFAULT_STARTING_BALANCE, source: "fallback" };
}

function formatOrderPrice(price: number): string {
  return price >= 1 ? price.toFixed(2) : price.toFixed(4);
}

const TIMEFRAME_MAP: Record<string, string> = {
  "1m": "1Min",
  "5m": "5Min",
  "15m": "15Min",
  "30m": "30Min",
  "1h": "1Hour",
  "4h": "4Hour",
  "1d": "1Day",
  "1w": "1Week",
};

export async function fetchBars(
  symbol: string,
  timeframe: string,
  limit = 300
): Promise<{ bars: OHLCV[]; source: "alpaca" | "mock"; error?: string }> {
  const tf = TIMEFRAME_MAP[timeframe] ?? "5Min";
  // Free IEX feed: end must be at least ~15 minutes before now
  const end = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const start = new Date(Date.now() - 30 * 86400000).toISOString();

  if (!hasAlpacaCredentials()) {
    return {
      bars: generateMockBars(symbol, limit),
      source: "mock",
      error: "No Alpaca credentials saved",
    };
  }

  const url = `${ALPACA_DATA_URL}/stocks/${symbol}/bars?timeframe=${tf}&start=${start}&end=${end}&limit=${limit}&adjustment=split&feed=iex`;

  try {
    const res = await fetch(url, { headers: getHeaders(), cache: "no-store" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        (data as { message?: string }).message ||
        (data as { error?: string }).error ||
        `HTTP ${res.status}`;
      return {
        bars: generateMockBars(symbol, limit),
        source: "mock",
        error: `Alpaca error: ${msg}`,
      };
    }

    const bars = ((data as { bars?: unknown[] }).bars ?? []).map(
      (b: { t: string; o: number; h: number; l: number; c: number; v: number }) => ({
        time: Math.floor(new Date(b.t).getTime() / 1000),
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      })
    );

    if (bars.length === 0) {
      return {
        bars: generateMockBars(symbol, limit),
        source: "mock",
        error: "Alpaca returned no bars for this symbol/timeframe",
      };
    }

    return { bars, source: "alpaca" };
  } catch (err) {
    return {
      bars: generateMockBars(symbol, limit),
      source: "mock",
      error: err instanceof Error ? err.message : "Failed to reach Alpaca",
    };
  }
}

export async function getAccount() {
  const { paper } = getBrokerCredentials();
  const result = await fetchAlpacaAccount(paper);
  if (!result.account) throw new Error(result.error ?? "Failed to fetch account");
  return result.account;
}

export async function placeOrder(params: {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type?: "market" | "limit";
  limit_price?: number;
  paper?: boolean;
}) {
  const usePaper = params.paper ?? getBrokerCredentials().paper;
  const creds = usePaper ? getPaperCredentials() : getLiveCredentials();
  const res = await fetch(`${getTradingUrl(usePaper)}/v2/orders`, {
    method: "POST",
    headers: { ...getHeaders(creds), "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: params.symbol,
      qty: params.qty,
      side: params.side,
      type: params.type ?? "market",
      time_in_force: "day",
      limit_price: params.limit_price,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Order failed: ${err}`);
  }
  return res.json();
}

export async function fetchOrder(
  orderId: string,
  paper: boolean
): Promise<AlpacaOrder> {
  const creds = paper ? getPaperCredentials() : getLiveCredentials();
  const res = await fetch(`${getTradingUrl(paper)}/v2/orders/${orderId}`, {
    headers: getHeaders(creds),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch order ${orderId}: ${err}`);
  }
  return res.json();
}

export async function waitForOrderFill(
  orderId: string,
  paper: boolean,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<AlpacaOrderFill> {
  const maxAttempts = options?.maxAttempts ?? 20;
  const delayMs = options?.delayMs ?? 400;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const order = await fetchOrder(orderId, paper);
    const status = order.status ?? "unknown";
    const fill = parseAlpacaOrderFill(order);

    if (fill && isFilledOrderStatus(status)) {
      if (status === "filled" || attempt === maxAttempts - 1) {
        return fill;
      }
    }

    if (isTerminalOrderStatus(status)) {
      throw new Error(`Order ${orderId} ended with status ${status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Order ${orderId} not filled after ${maxAttempts} attempts`);
}

export async function placeOrderWithFill(params: {
  symbol: string;
  qty: number;
  side: "buy" | "sell";
  type?: "market" | "limit";
  limit_price?: number;
  paper?: boolean;
}): Promise<AlpacaOrderFill> {
  const order = (await placeOrder(params)) as AlpacaOrder;
  if (!order.id) {
    throw new Error("Order response missing id");
  }

  const immediate = parseAlpacaOrderFill(order);
  if (immediate && order.status === "filled") {
    return immediate;
  }

  return waitForOrderFill(order.id, params.paper ?? getBrokerCredentials().paper);
}

export async function getPositions(paper?: boolean): Promise<AlpacaPosition[]> {
  const usePaper = paper ?? getBrokerCredentials().paper;
  const creds = usePaper ? getPaperCredentials() : getLiveCredentials();
  const res = await fetch(`${getTradingUrl(usePaper)}/v2/positions`, {
    headers: getHeaders(creds),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch positions");
  return res.json();
}

export async function getLivePositions(): Promise<AlpacaPosition[]> {
  if (!hasLiveCredentials()) return [];
  return getPositions(false);
}

export async function getLiveOpenOrders(): Promise<AlpacaOrder[]> {
  if (!hasLiveCredentials()) return [];
  const creds = getLiveCredentials();
  const res = await fetch(`${ALPACA_LIVE_URL}/v2/orders?status=open&limit=100`, {
    headers: getHeaders(creds),
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch open orders");
  return res.json();
}

/** Broker-side stop-loss sell order — live account only. */
export async function placeLiveStopLossOrder(params: {
  symbol: string;
  qty: number;
  stopPrice: number;
}): Promise<AlpacaOrder> {
  const creds = getLiveCredentials();
  if (!creds.apiKey || !creds.secretKey) {
    throw new Error("Live Alpaca credentials not configured");
  }
  const res = await fetch(`${ALPACA_LIVE_URL}/v2/orders`, {
    method: "POST",
    headers: { ...getHeaders(creds), "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: params.symbol,
      qty: params.qty,
      side: "sell",
      type: "stop",
      stop_price: formatOrderPrice(params.stopPrice),
      time_in_force: "gtc",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stop-loss order failed: ${err}`);
  }
  return res.json();
}

/** Cancel open live stop orders for a symbol before a manual/app sell. */
export async function cancelLiveStopOrdersForSymbol(symbol: string): Promise<number> {
  const orders = await getLiveOpenOrders();
  const stops = orders.filter(
    (o) =>
      o.symbol === symbol &&
      o.side === "sell" &&
      (o.type === "stop" || o.type === "stop_limit")
  );
  const creds = getLiveCredentials();
  let cancelled = 0;
  for (const order of stops) {
    const res = await fetch(`${ALPACA_LIVE_URL}/v2/orders/${order.id}`, {
      method: "DELETE",
      headers: getHeaders(creds),
    });
    if (res.ok) cancelled++;
  }
  return cancelled;
}

function generateMockBars(symbol: string, count: number): OHLCV[] {
  const seed = symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  let price = 100 + (seed % 200);
  const bars: OHLCV[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = count; i > 0; i--) {
    const change = (Math.sin(i * 0.1 + seed) + Math.random() * 0.5 - 0.25) * 2;
    const open = price;
    price = Math.max(1, price + change);
    const high = Math.max(open, price) + Math.random();
    const low = Math.min(open, price) - Math.random();
    bars.push({
      time: now - i * 300,
      open,
      high,
      low,
      close: price,
      volume: Math.floor(Math.random() * 1_000_000),
    });
  }
  return bars;
}

export async function fetchQuote(symbol: string) {
  try {
    const res = await fetch(`${ALPACA_DATA_URL}/stocks/${symbol}/quotes/latest?feed=iex`, {
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("quote error");
    return res.json();
  } catch {
    const bars = generateMockBars(symbol, 2);
    const last = bars[bars.length - 1];
    return { quote: { ap: last.close, bp: last.close * 0.999 } };
  }
}

export const WATCHLIST = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AMD",
  "SPY", "QQQ", "IWM", "DIA", "BA", "JPM", "V", "DIS",
];
