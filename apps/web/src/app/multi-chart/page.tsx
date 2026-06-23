"use client";

import { useAppStore } from "@/lib/store";
import { ChartSlotPanel } from "@/components/ChartSlotPanel";

export default function MultiChartPage() {
  const { multiChartSlots } = useAppStore();

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-xl font-bold">Multi-Chart</h1>
        <p className="text-sm text-[var(--muted)]">
          Run up to 4 charts at once — auto trade continues in the background while you navigate
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
