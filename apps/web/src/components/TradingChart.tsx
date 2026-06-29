"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { ema, rsi, bollingerBands } from "@wicksense/core";
import type { OHLCV, ChartMarker } from "@wicksense/core";
import { snapMarkerTimeToBars } from "@/lib/chart-marker-utils";
import { Eraser, TrendingUp } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { type ChartStyle, DEFAULT_CHART_STYLE } from "@/lib/chart-style";

const INDICATORS = [
  { id: "ema9", label: "EMA 9" },
  { id: "ema21", label: "EMA 21" },
  { id: "rsi", label: "RSI" },
  { id: "bb", label: "Bollinger" },
] as const;

const CHART_STYLES = [
  { id: "candles", label: "Candles", compact: "C" },
  { id: "heikin-ashi", label: "Heikin Ashi", compact: "HA" },
  { id: "line", label: "Line", compact: "L" },
] as const;

export type { ChartStyle };

interface TradingChartProps {
  slotId: string;
  bars: OHLCV[];
  markers: ChartMarker[];
  onClearMarkers: () => void;
  height?: number;
  compact?: boolean;
  title?: string;
  refreshing?: boolean;
}

function sortUniqueBars(bars: OHLCV[]): OHLCV[] {
  const byTime = new Map<number, OHLCV>();
  for (const bar of bars) {
    byTime.set(bar.time, bar);
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

function toCandleData(bars: OHLCV[]): CandlestickData<Time>[] {
  return sortUniqueBars(bars).map((b) => ({
    time: b.time as Time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
  }));
}

/** Display-only transform — raw bars used for signals/trades stay unchanged. */
function toHeikinAshiData(bars: OHLCV[]): CandlestickData<Time>[] {
  const sorted = sortUniqueBars(bars);
  if (sorted.length === 0) return [];

  const result: CandlestickData<Time>[] = [];
  let prevOpen = (sorted[0].open + sorted[0].close) / 2;
  let prevClose = (sorted[0].open + sorted[0].high + sorted[0].low + sorted[0].close) / 4;

  for (let i = 0; i < sorted.length; i++) {
    const bar = sorted[i];
    const haClose = (bar.open + bar.high + bar.low + bar.close) / 4;
    const haOpen = i === 0 ? (bar.open + bar.close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(bar.high, haOpen, haClose);
    const haLow = Math.min(bar.low, haOpen, haClose);

    result.push({
      time: bar.time as Time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
    });

    prevOpen = haOpen;
    prevClose = haClose;
  }

  return result;
}

function toLineData(bars: OHLCV[]): LineData<Time>[] {
  return sortUniqueBars(bars).map((b) => ({
    time: b.time as Time,
    value: b.close,
  }));
}

type MainSeries = ISeriesApi<"Candlestick"> | ISeriesApi<"Line">;

export function TradingChart({
  slotId,
  bars,
  markers,
  onClearMarkers,
  height = 480,
  compact = false,
  title = "Trading Chart",
  refreshing = false,
}: TradingChartProps) {
  const chartStyle = useAppStore(
    (s) => s.chartStyles[slotId] ?? DEFAULT_CHART_STYLE
  );
  const setChartStyle = useAppStore((s) => s.setChartStyle);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<MainSeries | null>(null);
  const mainSeriesStyleRef = useRef<ChartStyle | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<string[]>(["ema9", "ema21"]);
  const [chartError, setChartError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let chart: IChartApi | null = null;
    try {
      chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#0a0e17" },
          textColor: "#9ca3af",
        },
        grid: {
          vertLines: { color: "#1f2937" },
          horzLines: { color: "#1f2937" },
        },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: "#1f2937" },
        timeScale: { borderColor: "#1f2937", timeVisible: true },
        width: containerRef.current.clientWidth || 640,
        height,
      });

      chartRef.current = chart;
      setChartError(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : "Failed to initialize chart");
      return;
    }

    const resize = () => {
      if (containerRef.current && chart) {
        chart.applyOptions({
          width: containerRef.current.clientWidth || 640,
          height,
        });
      }
    };
    resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      markersPluginRef.current = null;
      overlayRefs.current = [];
      mainSeriesRef.current = null;
      mainSeriesStyleRef.current = null;
      chart?.remove();
      chartRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;

    try {
      if (mainSeriesRef.current && mainSeriesStyleRef.current !== chartStyle) {
        chart.removeSeries(mainSeriesRef.current);
        mainSeriesRef.current = null;
        mainSeriesStyleRef.current = null;
        markersPluginRef.current = null;
      }

      if (!mainSeriesRef.current) {
        if (chartStyle === "line") {
          mainSeriesRef.current = chart.addSeries(LineSeries, {
            color: "#10b981",
            lineWidth: 2,
            title: "Price",
          });
        } else {
          mainSeriesRef.current = chart.addSeries(CandlestickSeries, {
            upColor: "#10b981",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#10b981",
            wickDownColor: "#ef4444",
          });
        }
        mainSeriesStyleRef.current = chartStyle;
        markersPluginRef.current = createSeriesMarkers(mainSeriesRef.current, []);
      }

      const mainSeries = mainSeriesRef.current;
      if (chartStyle === "line") {
        (mainSeries as ISeriesApi<"Line">).setData(toLineData(bars));
      } else if (chartStyle === "heikin-ashi") {
        (mainSeries as ISeriesApi<"Candlestick">).setData(toHeikinAshiData(bars));
      } else {
        (mainSeries as ISeriesApi<"Candlestick">).setData(toCandleData(bars));
      }

      overlayRefs.current.forEach((s) => chart.removeSeries(s));
      overlayRefs.current = [];

      const sortedBars = sortUniqueBars(bars);
      const closes = sortedBars.map((b) => b.close);

      if (activeIndicators.includes("ema9")) {
        const series = chart.addSeries(LineSeries, {
          color: "#3b82f6",
          lineWidth: 1,
          title: "EMA 9",
        });
        const values = ema(closes, 9);
        series.setData(
          sortedBars
            .map((b, i) => ({ time: b.time as Time, value: values[i] }))
            .filter((d) => !isNaN(d.value))
        );
        overlayRefs.current.push(series);
      }

      if (activeIndicators.includes("ema21")) {
        const series = chart.addSeries(LineSeries, {
          color: "#a855f7",
          lineWidth: 1,
          title: "EMA 21",
        });
        const values = ema(closes, 21);
        series.setData(
          sortedBars
            .map((b, i) => ({ time: b.time as Time, value: values[i] }))
            .filter((d) => !isNaN(d.value))
        );
        overlayRefs.current.push(series);
      }

      if (activeIndicators.includes("bb")) {
        const { upper, lower, middle } = bollingerBands(closes);
        for (const [values, color, titleText] of [
          [upper, "#f59e0b", "BB Upper"],
          [middle, "#6b7280", "BB Mid"],
          [lower, "#f59e0b", "BB Lower"],
        ] as const) {
          const series = chart.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            title: titleText,
          });
          series.setData(
            sortedBars
              .map((b, i) => ({ time: b.time as Time, value: values[i] }))
              .filter((d) => !isNaN(d.value))
          );
          overlayRefs.current.push(series);
        }
      }

      chart.timeScale().fitContent();
      setChartError(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : "Failed to render chart data");
    }
  }, [bars, activeIndicators, chartStyle]);

  useEffect(() => {
    if (!markersPluginRef.current) return;
    const barTimes = bars.map((b) => b.time);
    const barTimeSet = new Set(barTimes);
    markersPluginRef.current.setMarkers(
      markers
        .map((m) => {
          const time = barTimeSet.has(m.time)
            ? m.time
            : snapMarkerTimeToBars(m.time, barTimes);
          return time == null ? null : { ...m, time };
        })
        .filter((m): m is ChartMarker => m != null)
        .map((m) => ({
          time: m.time as Time,
          position: m.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: m.side === "buy" ? "#10b981" : "#ef4444",
          shape: m.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: m.label,
        }))
    );
  }, [markers, bars, chartStyle]);

  const toggleIndicator = (id: string) => {
    setActiveIndicators((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  if (chartError) {
    return (
      <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--card)] p-8 text-center">
        <p className="text-sm text-[var(--danger)]">Chart error: {chartError}</p>
        <p className="mt-2 text-xs text-[var(--muted)]">Try refreshing the page.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)]">
      <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {CHART_STYLES.map(({ id, label, compact: shortLabel }) => (
            <button
              key={id}
              onClick={() => setChartStyle(slotId, id)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                chartStyle === id
                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "bg-white/5 text-[var(--muted)] hover:text-white"
              }`}
              title={label}
            >
              {compact ? shortLabel : label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-[var(--card-border)]" />
          {INDICATORS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => toggleIndicator(id)}
              className={`rounded px-2 py-1 text-xs transition-colors ${
                activeIndicators.includes(id)
                  ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                  : "bg-white/5 text-[var(--muted)] hover:text-white"
              }`}
            >
              {compact ? id.replace("ema", "E").replace("bb", "BB").replace("rsi", "R") : label}
            </button>
          ))}
          <button
            onClick={onClearMarkers}
            className="flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-xs text-[var(--muted)] hover:text-white"
            title="Clear trade markers"
          >
            <Eraser className="h-3 w-3" />
            Clear
          </button>
        </div>
      </div>
      <div className="relative w-full">
        {refreshing && (
          <div className="pointer-events-none absolute right-3 top-2 z-10 rounded bg-black/60 px-2 py-0.5 text-[10px] text-[var(--muted)]">
            Updating…
          </div>
        )}
        <div ref={containerRef} className="w-full" style={{ minHeight: height }} />
      </div>
      {!compact && activeIndicators.includes("rsi") && bars.length > 0 && <RsiPanel bars={bars} />}
    </div>
  );
}

function RsiPanel({ bars }: { bars: OHLCV[] }) {
  const values = rsi(bars.map((b) => b.close));
  const last = values[values.length - 1];
  const color =
    last > 70 ? "text-[var(--danger)]" : last < 30 ? "text-[var(--accent)]" : "text-[var(--muted)]";
  return (
    <div className="border-t border-[var(--card-border)] px-4 py-2 text-xs">
      RSI(14): <span className={color}>{isNaN(last) ? "—" : last.toFixed(1)}</span>
      <span className="ml-4 text-[var(--muted)]">OB: 70 | OS: 30</span>
    </div>
  );
}
