"use client";

import type { MainChartRoutingState } from "@/lib/main-chart-routing-types";

export type { MainChartRoutingState };

export async function fetchMainChartRouting(): Promise<MainChartRoutingState | null> {
  try {
    const res = await fetch("/api/settings/main-chart-routing");
    if (!res.ok) return null;
    return (await res.json()) as MainChartRoutingState;
  } catch {
    return null;
  }
}

export async function setMainChartRoutingManual(symbol: string): Promise<MainChartRoutingState | null> {
  try {
    const res = await fetch("/api/settings/main-chart-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "MANUAL", symbol }),
    });
    if (!res.ok) return null;
    return (await res.json()) as MainChartRoutingState;
  } catch {
    return null;
  }
}

export async function setMainChartRoutingAuto(): Promise<MainChartRoutingState | null> {
  try {
    const res = await fetch("/api/settings/main-chart-routing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "AUTO" }),
    });
    if (!res.ok) return null;
    return (await res.json()) as MainChartRoutingState;
  } catch {
    return null;
  }
}
