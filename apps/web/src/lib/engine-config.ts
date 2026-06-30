import fs from "fs";
import path from "path";
import type { RiskSettings, TradeMode, TradingStyle } from "@wicksense/core";
import { DEFAULT_RISK_SETTINGS } from "@wicksense/core";
import { MAIN_CHART_SLOT, MULTI_CHART_SLOT_IDS } from "@/lib/chart-slots";
import { DEFAULT_MAIN_CHART_PREFS } from "@/lib/main-chart-prefs";

const CONFIG_PATH = path.join(process.cwd(), "engine-config.local.json");

export interface EngineSlotConfig {
  symbol: string;
  timeframe: string;
  tradingStyle: TradingStyle;
  mode: TradeMode;
  safetyStopActive: boolean;
  consecutiveLosses: number;
}

export interface EngineConfig {
  activePresetId: string;
  riskSettings: RiskSettings;
  main: EngineSlotConfig;
  multi: Record<string, EngineSlotConfig>;
}

const DEFAULT_MULTI_SLOTS: EngineSlotConfig[] = [
  { symbol: "TSLA", timeframe: "5m", tradingStyle: "day", mode: "paper", safetyStopActive: false, consecutiveLosses: 0 },
  { symbol: "MSFT", timeframe: "5m", tradingStyle: "day", mode: "paper", safetyStopActive: false, consecutiveLosses: 0 },
  { symbol: "GOOGL", timeframe: "5m", tradingStyle: "day", mode: "paper", safetyStopActive: false, consecutiveLosses: 0 },
  { symbol: "NVDA", timeframe: "5m", tradingStyle: "day", mode: "paper", safetyStopActive: false, consecutiveLosses: 0 },
];

const VALID_TIMEFRAMES = new Set(["1m", "5m", "15m", "30m", "1h", "4h", "1d"]);

function normalizeSlot(raw: unknown, fallback: EngineSlotConfig): EngineSlotConfig {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const data = raw as Partial<EngineSlotConfig>;
  const symbol =
    typeof data.symbol === "string" && data.symbol.trim()
      ? data.symbol.trim().toUpperCase()
      : fallback.symbol;
  const timeframe =
    typeof data.timeframe === "string" && VALID_TIMEFRAMES.has(data.timeframe)
      ? data.timeframe
      : fallback.timeframe;
  const tradingStyle =
    data.tradingStyle === "day" || data.tradingStyle === "swing"
      ? data.tradingStyle
      : fallback.tradingStyle;
  const mode =
    data.mode === "paper" || data.mode === "live" || data.mode === "manual"
      ? data.mode
      : fallback.mode;
  return {
    symbol,
    timeframe,
    tradingStyle,
    mode,
    safetyStopActive: Boolean(data.safetyStopActive),
    consecutiveLosses:
      typeof data.consecutiveLosses === "number" && data.consecutiveLosses >= 0
        ? data.consecutiveLosses
        : fallback.consecutiveLosses,
  };
}

function defaultConfig(): EngineConfig {
  const multi = Object.fromEntries(
    MULTI_CHART_SLOT_IDS.map((id, index) => [id, { ...DEFAULT_MULTI_SLOTS[index] }])
  );
  return {
    activePresetId: "day-scalper",
    riskSettings: { ...DEFAULT_RISK_SETTINGS },
    main: {
      symbol: DEFAULT_MAIN_CHART_PREFS.symbol,
      timeframe: DEFAULT_MAIN_CHART_PREFS.timeframe,
      tradingStyle: DEFAULT_MAIN_CHART_PREFS.tradingStyle,
      mode: "paper",
      safetyStopActive: false,
      consecutiveLosses: 0,
    },
    multi,
  };
}

function normalizeConfig(raw: unknown): EngineConfig {
  const defaults = defaultConfig();
  if (!raw || typeof raw !== "object") return defaults;
  const data = raw as Partial<EngineConfig>;

  const multi: Record<string, EngineSlotConfig> = { ...defaults.multi };
  if (data.multi && typeof data.multi === "object") {
    for (const slotId of MULTI_CHART_SLOT_IDS) {
      multi[slotId] = normalizeSlot(
        (data.multi as Record<string, unknown>)[slotId],
        defaults.multi[slotId]
      );
    }
  }

  return {
    activePresetId:
      typeof data.activePresetId === "string" && data.activePresetId.trim()
        ? data.activePresetId.trim()
        : defaults.activePresetId,
    riskSettings: { ...DEFAULT_RISK_SETTINGS, ...(data.riskSettings ?? {}) },
    main: normalizeSlot(data.main, defaults.main),
    multi,
  };
}

export function loadEngineConfig(): EngineConfig {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return defaultConfig();
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return normalizeConfig(raw);
  } catch {
    return defaultConfig();
  }
}

export function saveEngineConfig(updates: Partial<EngineConfig>): EngineConfig {
  const current = loadEngineConfig();
  const next = normalizeConfig({
    ...current,
    ...updates,
    main: updates.main ? { ...current.main, ...updates.main } : current.main,
    multi: updates.multi ? { ...current.multi, ...updates.multi } : current.multi,
    riskSettings: updates.riskSettings
      ? { ...current.riskSettings, ...updates.riskSettings }
      : current.riskSettings,
  });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function patchEngineSlot(
  slotId: string,
  patch: Partial<EngineSlotConfig>
): EngineConfig {
  if (slotId === MAIN_CHART_SLOT) {
    return saveEngineConfig({ main: patch });
  }
  if (MULTI_CHART_SLOT_IDS.includes(slotId as (typeof MULTI_CHART_SLOT_IDS)[number])) {
    const current = loadEngineConfig();
    return saveEngineConfig({
      multi: {
        ...current.multi,
        [slotId]: { ...current.multi[slotId], ...patch },
      },
    });
  }
  throw new Error(`Unknown chart slot: ${slotId}`);
}

export const ENGINE_CONFIG_PATH = CONFIG_PATH;
