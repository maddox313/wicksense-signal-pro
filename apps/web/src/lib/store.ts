import { create } from "zustand";
import type {
  ChartMarker,
  Trade,
  StrategyPreset,
  PerformanceStats,
  TradeMode,
  RiskSettings,
  AlertSettings,
  Signal,
  TradingStyle,
  OHLCV,
} from "@wicksense/core";
import { DEFAULT_RISK_SETTINGS, DEFAULT_ALERT_SETTINGS, DEFAULT_TRADING_SCHEDULE } from "@wicksense/core";
import type { TradingScheduleSettings } from "@wicksense/core";
import { ALL_CHART_SLOT_IDS } from "./chart-slots";
import {
  type ChartStyle,
  loadChartStyles,
  persistChartStyles,
} from "./chart-style";
import { loadChartMarkers, persistChartMarkers } from "./chart-markers-persist";
import {
  type ModeUnrealizedPnlSnapshot,
  EMPTY_MODE_UNREALIZED,
} from "./alpaca-unrealized-pnl-shared";
import { loadMainChartPrefs, persistMainChartPrefs } from "./main-chart-prefs";

export interface SlotMarketData {
  bars: OHLCV[];
  quote?: { price: number; change: number };
  loading: boolean;
  refreshing: boolean;
  fetchError: string | null;
  dataSource: "live" | "mock" | null;
}

export const EMPTY_SLOT_MARKET_DATA: SlotMarketData = {
  bars: [],
  loading: true,
  refreshing: false,
  fetchError: null,
  dataSource: null,
};

function createInitialSlotMarketData(): Record<string, SlotMarketData> {
  return Object.fromEntries(
    ALL_CHART_SLOT_IDS.map((id) => [id, { ...EMPTY_SLOT_MARKET_DATA }])
  );
}

export interface AutoExitMonitorStatus {
  enabled: boolean;
  monitoredCount: number;
  lastCheckAt: number | null;
  lastError: string | null;
}

export const EMPTY_AUTO_EXIT_STATUS: AutoExitMonitorStatus = {
  enabled: false,
  monitoredCount: 0,
  lastCheckAt: null,
  lastError: null,
};

export interface PositionSyncModeStatus {
  mode: "paper" | "live";
  skipped: boolean;
  imported: number;
  closed: number;
  quantityUpdated: number;
  alpacaSymbols: string[];
  error?: string;
}

export interface SyncStatusState {
  lastSyncTime: string | null;
  loading: boolean;
  paper: PositionSyncModeStatus | null;
  live: PositionSyncModeStatus | null;
  error: string | null;
}

export const EMPTY_UNREALIZED_PNL = {
  paper: { ...EMPTY_MODE_UNREALIZED, mode: "paper" as const },
  live: { ...EMPTY_MODE_UNREALIZED, mode: "live" as const },
};

export type { ModeUnrealizedPnlSnapshot };

export const EMPTY_SYNC_STATUS: SyncStatusState = {
  lastSyncTime: null,
  loading: false,
  paper: null,
  live: null,
  error: null,
};

export interface MultiChartSlot {
  id: string;
  label: string;
  symbol: string;
  timeframe: string;
  tradingStyle: TradingStyle;
  mode: TradeMode;
  autoTradeEnabled: boolean;
  markers: ChartMarker[];
  safetyStopActive: boolean;
  consecutiveLosses: number;
}

const DEFAULT_MULTI_SLOTS: MultiChartSlot[] = [
  { id: "multi-1", label: "Chart 1", symbol: "TSLA", timeframe: "5m", tradingStyle: "day", mode: "paper", autoTradeEnabled: false, markers: [], safetyStopActive: false, consecutiveLosses: 0 },
  { id: "multi-2", label: "Chart 2", symbol: "MSFT", timeframe: "5m", tradingStyle: "day", mode: "paper", autoTradeEnabled: false, markers: [], safetyStopActive: false, consecutiveLosses: 0 },
  { id: "multi-3", label: "Chart 3", symbol: "GOOGL", timeframe: "5m", tradingStyle: "day", mode: "paper", autoTradeEnabled: false, markers: [], safetyStopActive: false, consecutiveLosses: 0 },
  { id: "multi-4", label: "Chart 4", symbol: "NVDA", timeframe: "5m", tradingStyle: "day", mode: "paper", autoTradeEnabled: false, markers: [], safetyStopActive: false, consecutiveLosses: 0 },
];

interface AppState {
  symbol: string;
  timeframe: string;
  tradingStyle: "day" | "swing";
  mode: TradeMode;
  autoTradeEnabled: boolean;
  markers: ChartMarker[];
  trades: Trade[];
  signals: Signal[];
  presets: StrategyPreset[];
  activePresetId: string;
  riskSettings: RiskSettings;
  alertSettings: AlertSettings;
  performance: PerformanceStats | null;
  safetyStopActive: boolean;
  consecutiveLosses: number;
  multiChartSlots: MultiChartSlot[];
  slotMarketData: Record<string, SlotMarketData>;
  syncStatus: SyncStatusState;
  autoExitStatus: AutoExitMonitorStatus;
  unrealizedPnl: { paper: ModeUnrealizedPnlSnapshot; live: ModeUnrealizedPnlSnapshot };
  tradingSchedule: TradingScheduleSettings;
  chartStyles: Record<string, ChartStyle>;

  setSymbol: (symbol: string) => void;
  setTimeframe: (tf: string) => void;
  setTradingStyle: (style: "day" | "swing") => void;
  setMode: (mode: TradeMode) => void;
  setAutoTradeEnabled: (enabled: boolean) => void;
  addMarker: (marker: ChartMarker) => void;
  clearMarkers: () => void;
  addTrade: (trade: Trade) => void;
  setTrades: (trades: Trade[]) => void;
  updateTrade: (id: string, updates: Partial<Trade>) => void;
  addSignal: (signal: Signal) => void;
  setPresets: (presets: StrategyPreset[]) => void;
  setActivePresetId: (id: string) => void;
  setRiskSettings: (settings: RiskSettings) => void;
  setAlertSettings: (settings: AlertSettings) => void;
  setPerformance: (stats: PerformanceStats) => void;
  setSafetyStopActive: (active: boolean) => void;
  setConsecutiveLosses: (count: number) => void;
  resetSafetyStop: () => void;
  updateMultiChartSlot: (id: string, updates: Partial<MultiChartSlot>) => void;
  addMultiChartMarker: (slotId: string, marker: ChartMarker) => void;
  clearMultiChartMarkers: (slotId: string) => void;
  patchSlotMarketData: (slotId: string, patch: Partial<SlotMarketData>) => void;
  setSyncStatus: (status: Partial<SyncStatusState>) => void;
  setAutoExitStatus: (status: AutoExitMonitorStatus) => void;
  setUnrealizedPnl: (snapshot: { paper: ModeUnrealizedPnlSnapshot; live: ModeUnrealizedPnlSnapshot }) => void;
  setTradingSchedule: (schedule: TradingScheduleSettings) => void;
  setChartStyle: (slotId: string, style: ChartStyle) => void;
}

export const useAppStore = create<AppState>((set) => {
  const mainChartPrefs = loadMainChartPrefs();
  const persistedMarkers = loadChartMarkers();

  return {
  symbol: mainChartPrefs.symbol,
  timeframe: mainChartPrefs.timeframe,
  tradingStyle: mainChartPrefs.tradingStyle,
  mode: "paper",
  autoTradeEnabled: false,
  markers: persistedMarkers.main,
  trades: [],
  signals: [],
  presets: [],
  activePresetId: "",
  riskSettings: DEFAULT_RISK_SETTINGS,
  alertSettings: DEFAULT_ALERT_SETTINGS,
  performance: null,
  safetyStopActive: false,
  consecutiveLosses: 0,
  multiChartSlots: DEFAULT_MULTI_SLOTS.map((slot) => ({
    ...slot,
    markers: persistedMarkers.slots[slot.id] ?? [],
  })),
  slotMarketData: createInitialSlotMarketData(),
  syncStatus: { ...EMPTY_SYNC_STATUS },
  autoExitStatus: { ...EMPTY_AUTO_EXIT_STATUS },
  unrealizedPnl: { ...EMPTY_UNREALIZED_PNL },
  tradingSchedule: { ...DEFAULT_TRADING_SCHEDULE },
  chartStyles: loadChartStyles(),

  setSymbol: (symbol) =>
    set((s) => {
      const next = { ...s, symbol: symbol.toUpperCase() };
      persistMainChartPrefs({
        symbol: next.symbol,
        timeframe: next.timeframe,
        tradingStyle: next.tradingStyle,
      });
      return { symbol: next.symbol };
    }),
  setTimeframe: (timeframe) =>
    set((s) => {
      const next = { ...s, timeframe };
      persistMainChartPrefs({
        symbol: next.symbol,
        timeframe: next.timeframe,
        tradingStyle: next.tradingStyle,
      });
      return { timeframe };
    }),
  setTradingStyle: (tradingStyle) =>
    set((s) => {
      const next = { ...s, tradingStyle };
      persistMainChartPrefs({
        symbol: next.symbol,
        timeframe: next.timeframe,
        tradingStyle: next.tradingStyle,
      });
      return { tradingStyle };
    }),
  setMode: (mode) => set({ mode }),
  setAutoTradeEnabled: (autoTradeEnabled) => set({ autoTradeEnabled }),
  addMarker: (marker) =>
    set((s) => {
      const withoutDuplicate = s.markers.filter((m) => m.id !== marker.id);
      const markers = [...withoutDuplicate, marker].slice(-100);
      persistChartMarkers({
        main: markers,
        slots: Object.fromEntries(s.multiChartSlots.map((slot) => [slot.id, slot.markers])),
      });
      return { markers };
    }),
  clearMarkers: () =>
    set((s) => {
      persistChartMarkers({
        main: [],
        slots: Object.fromEntries(s.multiChartSlots.map((slot) => [slot.id, slot.markers])),
      });
      return { markers: [] };
    }),
  addTrade: (trade) =>
    set((s) => {
      const withoutDuplicate = s.trades.filter((t) => t.id !== trade.id);
      return { trades: [trade, ...withoutDuplicate] };
    }),
  setTrades: (trades) => set({ trades }),
  updateTrade: (id, updates) =>
    set((s) => ({
      trades: s.trades.map((t) => (t.id === id ? { ...t, ...updates } : t)),
    })),
  addSignal: (signal) =>
    set((s) => {
      const withoutDuplicate = s.signals.filter((existing) => existing.id !== signal.id);
      return { signals: [signal, ...withoutDuplicate].slice(0, 50) };
    }),
  setPresets: (presets) => set({ presets }),
  setActivePresetId: (activePresetId) => set({ activePresetId }),
  setRiskSettings: (riskSettings) => set({ riskSettings }),
  setAlertSettings: (alertSettings) => set({ alertSettings }),
  setPerformance: (performance) => set({ performance }),
  setSafetyStopActive: (safetyStopActive) => set({ safetyStopActive }),
  setConsecutiveLosses: (consecutiveLosses) => set({ consecutiveLosses }),
  resetSafetyStop: () => set({ safetyStopActive: false, consecutiveLosses: 0 }),
  updateMultiChartSlot: (id, updates) =>
    set((s) => ({
      multiChartSlots: s.multiChartSlots.map((slot) =>
        slot.id === id ? { ...slot, ...updates } : slot
      ),
    })),
  addMultiChartMarker: (slotId, marker) =>
    set((s) => {
      const multiChartSlots = s.multiChartSlots.map((slot) =>
        slot.id === slotId
          ? {
              ...slot,
              markers: [
                ...slot.markers.filter((m) => m.id !== marker.id),
                marker,
              ].slice(-100),
            }
          : slot
      );
      persistChartMarkers({
        main: s.markers,
        slots: Object.fromEntries(multiChartSlots.map((slot) => [slot.id, slot.markers])),
      });
      return { multiChartSlots };
    }),
  clearMultiChartMarkers: (slotId) =>
    set((s) => {
      const multiChartSlots = s.multiChartSlots.map((slot) =>
        slot.id === slotId ? { ...slot, markers: [] } : slot
      );
      persistChartMarkers({
        main: s.markers,
        slots: Object.fromEntries(multiChartSlots.map((slot) => [slot.id, slot.markers])),
      });
      return { multiChartSlots };
    }),
  patchSlotMarketData: (slotId, patch) =>
    set((s) => ({
      slotMarketData: {
        ...s.slotMarketData,
        [slotId]: { ...(s.slotMarketData[slotId] ?? EMPTY_SLOT_MARKET_DATA), ...patch },
      },
    })),
  setSyncStatus: (status) =>
    set((s) => ({
      syncStatus: { ...s.syncStatus, ...status },
    })),
  setAutoExitStatus: (autoExitStatus) => set({ autoExitStatus }),
  setUnrealizedPnl: (unrealizedPnl) => set({ unrealizedPnl }),
  setTradingSchedule: (tradingSchedule) => set({ tradingSchedule }),
  setChartStyle: (slotId, style) =>
    set((s) => {
      const chartStyles = { ...s.chartStyles, [slotId]: style };
      persistChartStyles(chartStyles);
      return { chartStyles };
    }),
};
});
