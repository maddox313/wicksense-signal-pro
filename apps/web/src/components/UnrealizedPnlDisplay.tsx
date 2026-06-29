"use client";

import {
  formatUnrealizedPlpc,
  UNREALIZED_PNL_TOOLTIP,
  type AlpacaUnrealizedPosition,
} from "@/lib/alpaca-unrealized-pnl-shared";

export function UnrealizedPnlDisplay({
  position,
}: {
  position: AlpacaUnrealizedPosition | null | undefined;
}) {
  if (!position) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  const positive = position.unrealizedPl >= 0;

  return (
    <span
      title={UNREALIZED_PNL_TOOLTIP}
      className={positive ? "text-[var(--accent)]" : "text-[var(--danger)]"}
    >
      ${position.unrealizedPl.toFixed(2)}
      <span className="ml-1 text-[10px] text-[var(--muted)]">
        ({formatUnrealizedPlpc(position.unrealizedPlpc)})
      </span>
    </span>
  );
}
