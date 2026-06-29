import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isFilledOrderStatus,
  isTerminalOrderStatus,
  parseAlpacaOrderFill,
} from "./alpaca-order-fill.ts";

describe("parseAlpacaOrderFill", () => {
  it("parses filled market orders", () => {
    const fill = parseAlpacaOrderFill({
      id: "ord-1",
      status: "filled",
      filled_avg_price: "186.5400",
      filled_qty: "11",
      qty: "11",
    });
    assert.deepEqual(fill, {
      orderId: "ord-1",
      filledAvgPrice: 186.54,
      filledQty: 11,
      status: "filled",
    });
  });

  it("returns null when fill price is missing", () => {
    assert.equal(
      parseAlpacaOrderFill({
        id: "ord-2",
        status: "new",
        filled_avg_price: null,
        filled_qty: "0",
      }),
      null
    );
  });

  it("classifies order statuses", () => {
    assert.equal(isFilledOrderStatus("filled"), true);
    assert.equal(isFilledOrderStatus("partially_filled"), true);
    assert.equal(isTerminalOrderStatus("canceled"), true);
    assert.equal(isTerminalOrderStatus("new"), false);
  });
});
