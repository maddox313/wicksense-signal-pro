export type TradeMode = "auto" | "manual" | "paper" | "live";
export type TradeSide = "buy" | "sell";
export type Timeframe = "1m" | "5m" | "15m" | "30m" | "1h" | "4h" | "1d" | "1w";
export type TradingStyle = "day" | "swing";

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Signal {
  id: string;
  symbol: string;
  side: TradeSide;
  price: number;
  time: number;
  strategy: string;
  confidence: number;
  reason: string;
}

export interface ChartMarker {
  id: string;
  time: number;
  price: number;
  side: TradeSide;
  label: string;
  strategy?: string;
}

export interface Trade {
  id: string;
  symbol: string;
  side: TradeSide;
  quantity: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: number;
  exitTime?: number;
  pnl?: number;
  pnlPercent?: number;
  mode: TradeMode;
  strategy: string;
  status: "open" | "closed" | "cancelled";
  chartSlot?: string;
}

export interface RiskSettings {
  maxConsecutiveLosses: number;
  positionSizeMinPercent: number;
  positionSizeMaxPercent: number;
  riskPercentMin: number;
  riskPercentMax: number;
  maxOpenPositions: number;
}

export interface AlertSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  onBuy: boolean;
  onSell: boolean;
  onStopLoss: boolean;
  onSafetyStop: boolean;
}

export interface StrategyPreset {
  id: string;
  name: string;
  description: string;
  tradingStyle: TradingStyle;
  strategies: string[];
  timeframe: Timeframe;
  riskSettings: RiskSettings;
  isAiGenerated: boolean;
  enabled: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  defaultMode: TradeMode;
  defaultPresetId?: string;
  riskSettings: RiskSettings;
  alertSettings: AlertSettings;
}

export interface PerformanceStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  consecutiveLosses: number;
  safetyStopTriggered: boolean;
}

export interface ScannerResult {
  symbol: string;
  signal: Signal;
  volume: number;
  changePercent: number;
  marketCap?: number;
}

export interface BacktestResult {
  presetId: string;
  symbol: string;
  startTime: number;
  endTime: number;
  trades: Trade[];
  stats: PerformanceStats;
  equityCurve: { time: number; equity: number }[];
}

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
  maxConsecutiveLosses: 3,
  positionSizeMinPercent: 1,
  positionSizeMaxPercent: 5,
  riskPercentMin: 0.5,
  riskPercentMax: 2,
  maxOpenPositions: 5,
};

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  emailEnabled: false,
  smsEnabled: false,
  pushEnabled: true,
  onBuy: true,
  onSell: true,
  onStopLoss: true,
  onSafetyStop: true,
};
