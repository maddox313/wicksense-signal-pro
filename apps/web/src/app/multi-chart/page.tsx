"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { ChartSlotPanel } from "@/components/ChartSlotPanel";

export default function MultiChartPage() {
  const { multiChartSlots, presets, activePresetId, setPresets, setActivePresetId } = useAppStore();

  useEffect(() => {
    if (presets.length > 0) return;
    fetch("/api/presets")
      .then((r) => r.json())
      .then((d) => {
        const loaded = d.presets ?? [];
        setPresets(loaded);
        if (loaded[0] && !activePresetId) {
          setActivePresetId(loaded[0].id);
        }
      })
      .catch(() => {});
  }, [presets.length, activePresetId, setPresets, setActivePresetId]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Multi-Chart</h1>
        <p className="text-sm text-[var(--muted)]">
          Run up to 4 charts at once — each with its own symbol, mode, and auto-trading settings
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {multiChartSlots.map((slot) => (
          <ChartSlotPanel key={slot.id} slot={slot} />
        ))}
      </div>
    </div>
  );
}
