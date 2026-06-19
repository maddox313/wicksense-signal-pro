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
  type Time,
  type ISeriesMarkersPluginApi,
} from "lightweight-charts";
import { ema, rsi, bollingerBands } from "@wicksense/core";
import type { OHLCV, ChartMarker } from "@wicksense/core";
import { Eraser, TrendingUp } from "lucide-react";

const INDICATORS = [
  { id: "ema9", label: "EMA 9" },
  { id: "ema21", label: "EMA 21" },
  { id: "rsi", label: "RSI" },
  { id: "bb", label: "Bollinger" },
] as const;

interface TradingChartProps {
  bars: OHLCV[];
  markers: ChartMarker[];
  onClearMarkers: () => void;
  height?: number;
  compact?: boolean;
  title?: string;
}

function normalizeBars(bars: OHLCV[]): CandlestickData<Time>[] {
  const byTime = new Map<number, OHLCV>();
  for (const bar of bars) {
    byTime.set(bar.time, bar);
  }
  return Array.from(byTime.values())
    .sort((a, b) => a.time - b.time)
    .map((b) => ({
      time: b.time as Time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));
}

export function TradingChart({
  bars,
  markers,
  onClearMarkers,
  height = 480,
  compact = false,
  title = "Trading Chart",
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
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

      const candles = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });

      chartRef.current = chart;
      candleRef.current = candles;
      markersPluginRef.current = createSeriesMarkers(candles, []);
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
      candleRef.current = null;
      chart?.remove();
      chartRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    if (!candleRef.current || !chartRef.current || bars.length === 0) return;

    try {
      const candleData = normalizeBars(bars);
      if (candleData.length === 0) return;

      candleRef.current.setData(candleData);

      overlayRefs.current.forEach((s) => chartRef.current?.removeSeries(s));
      overlayRefs.current = [];

      const sortedBars = [...bars].sort((a, b) => a.time - b.time);
      const closes = sortedBars.map((b) => b.close);

      if (activeIndicators.includes("ema9")) {
        const series = chartRef.current.addSeries(LineSeries, {
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
        const series = chartRef.current.addSeries(LineSeries, {
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
        for (const [values, color, title] of [
          [upper, "#f59e0b", "BB Upper"],
          [middle, "#6b7280", "BB Mid"],
          [lower, "#f59e0b", "BB Lower"],
        ] as const) {
          const series = chartRef.current.addSeries(LineSeries, {
            color,
            lineWidth: 1,
            title,
          });
          series.setData(
            sortedBars
              .map((b, i) => ({ time: b.time as Time, value: values[i] }))
              .filter((d) => !isNaN(d.value))
          );
          overlayRefs.current.push(series);
        }
      }

      chartRef.current.timeScale().fitContent();
      setChartError(null);
    } catch (err) {
      setChartError(err instanceof Error ? err.message : "Failed to render chart data");
    }
  }, [bars, activeIndicators]);

  useEffect(() => {
    if (!markersPluginRef.current) return;
    const barTimes = new Set(bars.map((b) => b.time));
    markersPluginRef.current.setMarkers(
      markers
        .filter((m) => barTimes.has(m.time))
        .map((m) => ({
          time: m.time as Time,
          position: m.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
          color: m.side === "buy" ? "#10b981" : "#ef4444",
          shape: m.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
          text: m.label,
        }))
    );
  }, [markers, bars]);

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
      <div ref={containerRef} className="w-full" style={{ minHeight: height }} />
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
