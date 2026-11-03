import { describe, expect, it } from "vitest";
import { buildOrderPayload, changeQuantity, subtotal } from "./storefront";
import { placeGuestOrder } from "./orders";

const itemId = "123e4567-e89b-42d3-a456-426614174000";
describe("cart calculations", () => {
  it("calculates a subtotal from item prices and quantities", () => {
    expect(subtotal([{ id: "a", name: "Burger", price: 1250, quantity: 2 }, { id: "b", name: "Tea", price: 250, quantity: 1 }])).toBe(2750);
  });
  it("updates and removes quantities without changing other lines", () => {
    const lines = [{ id: "a", name: "Burger", price: 1000, quantity: 1 }, { id: "b", name: "Tea", price: 250, quantity: 1 }];
    expect(changeQuantity(lines, "a", 1)[0].quantity).toBe(2);
    expect(changeQuantity(lines, "a", -1)).toHaveLength(1);
  });
  it("validates guest checkout fields and requires a usable delivery address", () => {
    const order = { customer_name: "Hasan Ali", customer_phone: "+923001234567", order_type: "pickup", items: [{ menu_item_id: itemId, quantity: 2 }], request_id: itemId };
    expect(buildOrderPayload(order).order_type).toBe("pickup");
    expect(() => buildOrderPayload({ ...order, order_type: "delivery", delivery_address: "123" })).toThrow("Delivery address");
    expect(() => buildOrderPayload({ ...order, items: [] })).toThrow();
  });
  it("sends only validated item IDs and quantities to the server priced RPC", async () => {
    const rpc = { rpc: async (_name: string, args: Record<string, unknown>) => ({ data: { id: itemId, order_number: 45, status: "placed", total: 2500 }, error: null }) };
    const result = await placeGuestOrder(rpc, "ember-burger", "main", {
      customer_name: "Hasan Ali", customer_phone: "03001234567", order_type: "pickup", items: [{ menu_item_id: itemId, quantity: 2 }], request_id: itemId,
    });
    expect(result.order_number).toBe(45);
  });
});
