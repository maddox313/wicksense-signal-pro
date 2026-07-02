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
  /** When set, marker is only shown on charts for this symbol. */
  symbol?: string;
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
  status: "open" | "closed" | "cancelled" | "needs_manual_close";
  chartSlot?: string;
  timeframe?: string;
  signalId?: string;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  closeReason?: TradeCloseReason;
  outcome?: "win" | "loss";
  alpacaOrderId?: string;
  alpacaStopOrderId?: string;
  archived?: boolean;
  archivedAt?: number;
}

export interface LiveTradingSettings {
  /** Attach a broker-side stop-loss order on live buys */
  brokerStopLossEnabled: boolean;
  /** Percent below entry for stop price (e.g. 2 = 2%) */
  stopLossPercent: number;
  /** Percent above entry for take-profit (e.g. 4 = 4%) */
  takeProfitPercent: number;
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
  onTradingStart: boolean;
  onTradingStop: boolean;
  onActionRequired: boolean;
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
  positionSizeMaxPercent: 4,
  riskPercentMin: 0.5,
  riskPercentMax: 1.5,
  maxOpenPositions: 3,
};

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  emailEnabled: false,
  smsEnabled: false,
  pushEnabled: true,
  onBuy: true,
  onSell: true,
  onStopLoss: true,
  onSafetyStop: true,
  onTradingStart: true,
  onTradingStop: true,
  onActionRequired: true,
};

export const DEFAULT_LIVE_TRADING_SETTINGS: LiveTradingSettings = {
  brokerStopLossEnabled: true,
  stopLossPercent: 1,
  takeProfitPercent: 2,
};

export type WeekdayKey = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

export interface TradingScheduleSettings {
  unrestricted: boolean;
  allowOvernight: boolean;
  allowAfterHours: boolean;
  days: Record<WeekdayKey, boolean>;
  /** 24-hour HH:mm in US Eastern Time */
  startTime: string;
  /** 24-hour HH:mm in US Eastern Time */
  endTime: string;
}

export const DEFAULT_TRADING_SCHEDULE: TradingScheduleSettings = {
  unrestricted: false,
  allowOvernight: false,
  allowAfterHours: false,
  days: {
    sun: false,
    mon: true,
    tue: true,
    wed: true,
    thu: true,
    fri: true,
    sat: false,
  },
  startTime: "09:30",
  endTime: "16:00",
};
