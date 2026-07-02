import type { RiskSettings, Trade, PerformanceStats } from "./types";

export class RiskEngine {
  private consecutiveLosses = 0;
  private safetyStopTriggered = false;

  constructor(private settings: RiskSettings) {}

  updateSettings(settings: RiskSettings) {
    this.settings = settings;
  }

  isSafetyStopActive(): boolean {
    return this.safetyStopTriggered;
  }

  resetSafetyStop() {
    this.consecutiveLosses = 0;
    this.safetyStopTriggered = false;
  }

  recordTradeResult(pnl: number) {
    if (pnl < 0) {
      this.consecutiveLosses++;
      if (this.consecutiveLosses >= this.settings.maxConsecutiveLosses) {
        this.safetyStopTriggered = true;
      }
    } else {
      this.consecutiveLosses = 0;
    }
  }

  canOpenTrade(openPositions: number): { allowed: boolean; reason?: string } {
    if (this.safetyStopTriggered) {
      return { allowed: false, reason: "Safety stop triggered — max consecutive losses reached" };
    }
    if (openPositions >= this.settings.maxOpenPositions) {
      return { allowed: false, reason: "Max open positions reached" };
    }
    return { allowed: true };
  }

  calculatePositionSize(
    accountBalance: number,
    entryPrice: number,
    stopLossPrice: number,
    riskPercent?: number
  ): { quantity: number; riskPercent: number; positionPercent: number } {
    const risk = Math.min(
      this.settings.riskPercentMax,
      Math.max(
        this.settings.riskPercentMin,
        riskPercent ?? (this.settings.riskPercentMin + this.settings.riskPercentMax) / 2
      )
    );
    const riskAmount = accountBalance * (risk / 100);
    const stopDistance = Math.abs(entryPrice - stopLossPrice);
    if (stopDistance === 0) return { quantity: 0, riskPercent: risk, positionPercent: 0 };

    const quantity = Math.floor(riskAmount / stopDistance);
    const positionValue = quantity * entryPrice;
    const positionPercent = (positionValue / accountBalance) * 100;

    const clampedPercent = Math.min(
      this.settings.positionSizeMaxPercent,
      Math.max(this.settings.positionSizeMinPercent, positionPercent)
    );
    const clampedQuantity = Math.floor((accountBalance * (clampedPercent / 100)) / entryPrice);

    return { quantity: clampedQuantity, riskPercent: risk, positionPercent: clampedPercent };
  }

  getConsecutiveLosses() {
    return this.consecutiveLosses;
  }

  /** Restore persisted slot state after server restart. */
  hydratePersistedState(consecutiveLosses: number, safetyStopActive: boolean) {
    this.consecutiveLosses = Math.max(0, consecutiveLosses);
    this.safetyStopTriggered = safetyStopActive;
  }
}

export function computePerformanceStats(trades: Trade[]): PerformanceStats {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl !== undefined);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) <= 0);
  const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const totalPnlPercent = closed.reduce((sum, t) => sum + (t.pnlPercent ?? 0), 0);
  const grossWin = wins.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.pnl ?? 0), 0));

  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  let consecutiveLosses = 0;
  let maxConsecutiveLosses = 0;

  for (const trade of closed) {
    equity += trade.pnl ?? 0;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if ((trade.pnl ?? 0) < 0) {
      consecutiveLosses++;
      maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses);
    } else {
      consecutiveLosses = 0;
    }
  }

  return {
    totalTrades: closed.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    totalPnl,
    totalPnlPercent,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss === 0 ? grossWin : grossWin / grossLoss,
    maxDrawdown,
    consecutiveLosses: maxConsecutiveLosses,
    safetyStopTriggered: false,
  };
}
