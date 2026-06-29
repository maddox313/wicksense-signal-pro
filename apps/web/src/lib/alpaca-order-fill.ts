export interface AlpacaOrderFill {
  orderId: string;
  filledAvgPrice: number;
  filledQty: number;
  status: string;
}

export function isTerminalOrderStatus(status: string): boolean {
  return ["canceled", "expired", "rejected", "replaced"].includes(status);
}

export function isFilledOrderStatus(status: string): boolean {
  return status === "filled" || status === "partially_filled";
}

export function parseAlpacaOrderFill(order: {
  id?: string;
  status?: string;
  filled_avg_price?: string | null;
  filled_qty?: string | null;
  qty?: string | null;
}): AlpacaOrderFill | null {
  if (!order.id) return null;

  const status = order.status ?? "unknown";
  const priceRaw = order.filled_avg_price;
  const qtyRaw = order.filled_qty ?? order.qty;
  const filledAvgPrice = priceRaw != null && priceRaw !== "" ? parseFloat(priceRaw) : NaN;
  const filledQty = qtyRaw != null && qtyRaw !== "" ? parseFloat(qtyRaw) : NaN;

  if (!Number.isFinite(filledAvgPrice) || filledAvgPrice <= 0) return null;
  if (!Number.isFinite(filledQty) || filledQty <= 0) return null;

  return {
    orderId: order.id,
    filledAvgPrice,
    filledQty,
    status,
  };
}
