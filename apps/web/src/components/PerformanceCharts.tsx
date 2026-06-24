"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  ColorType,
  LineSeries,
  type IChartApi,
  type Time,
} from "lightweight-charts";
import type { EquityPoint, PerformanceStats, TradePnLPoint } from "@wicksense/core";

export function EquityCurveChart({ points }: { points: EquityPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e17" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: { borderColor: "#1f2937" },
      timeScale: { borderColor: "#1f2937", visible: false },
      width: containerRef.current.clientWidth || 640,
      height: 260,
    });

    const series = chart.addSeries(LineSeries, {
      color: "#10b981",
      lineWidth: 2,
      title: "Cumulative P&L",
    });

    if (points.length > 1) {
      series.setData(
        points.map((p, i) => ({
          time: (i + 1) as Time,
          value: p.equity,
        }))
      );
    }

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const resize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth || 640 });
      }
    };
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
    };
  }, [points]);

  if (points.length <= 1) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg bg-black/20 text-sm text-[var(--muted)]">
        No closed trades to chart yet
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}

export function WinLossChart({ stats }: { stats: PerformanceStats }) {
  const total = stats.totalTrades || 1;
  const winPct = (stats.winningTrades / total) * 100;
  const lossPct = (stats.losingTrades / total) * 100;

  return (
    <div className="space-y-3">
      <BarRow label="Wins" value={stats.winningTrades} pct={winPct} color="bg-[var(--accent)]" />
      <BarRow label="Losses" value={stats.losingTrades} pct={lossPct} color="bg-[var(--danger)]" />
      <div className="flex justify-between text-xs text-[var(--muted)]">
        <span>Win rate {stats.winRate.toFixed(1)}%</span>
        <span>Loss rate {((stats.losingTrades / total) * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}

function BarRow({
  label,
  value,
  pct,
  color,
}: {
  label: string;
  value: number;
  pct: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/5">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }} />
      </div>
    </div>
  );
}

export function TradePnLBars({ trades }: { trades: TradePnLPoint[] }) {
  if (trades.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg bg-black/20 text-sm text-[var(--muted)]">
        No closed trades to display
      </div>
    );
  }

  const maxAbs = Math.max(...trades.map((t) => Math.abs(t.pnl)), 1);

  return (
    <div className="flex h-[260px] items-end gap-1 overflow-x-auto px-1 pb-6 pt-4">
      {trades.map((t) => {
        const height = Math.max(8, (Math.abs(t.pnl) / maxAbs) * 180);
        const positive = t.pnl >= 0;
        return (
          <div key={t.id} className="flex min-w-[28px] flex-1 flex-col items-center justify-end gap-1">
            <div
              className={`w-full max-w-[36px] rounded-t ${positive ? "bg-[var(--accent)]" : "bg-[var(--danger)]"}`}
              style={{ height }}
              title={`${t.symbol} ${t.pnl >= 0 ? "+" : ""}$${t.pnl.toFixed(2)}`}
            />
            <span className="truncate text-[9px] text-[var(--muted)]">{t.symbol}</span>
          </div>
        );
      })}
    </div>
  );
}
