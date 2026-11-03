import { z } from "zod";

export const checkoutSchema = z.object({
  customer_name: z.string().trim().min(2).max(120),
  customer_phone: z.string().trim().min(7).max(32),
  order_type: z.enum(["pickup", "delivery"]),
  delivery_address: z.string().trim().max(500).optional().default(""),
  items: z.array(z.object({ menu_item_id: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1).max(50),
  request_id: z.string().uuid(),
});

export type CartLine = { id: string; name: string; price: number; quantity: number };

export function subtotal(lines: CartLine[]): number {
  return lines.reduce((total, line) => total + line.price * line.quantity, 0);
}

export function changeQuantity(lines: CartLine[], id: string, delta: number): CartLine[] {
  return lines.flatMap((line) => {
    if (line.id !== id) return [line];
    const quantity = line.quantity + delta;
    return quantity > 0 ? [{ ...line, quantity: Math.min(quantity, 50) }] : [];
  });
}

export function buildOrderPayload(input: unknown) {
  const parsed = checkoutSchema.parse(input);
  if (parsed.order_type === "delivery" && parsed.delivery_address.length < 8) {
    throw new Error("Delivery address must be at least 8 characters.");
  }
  return parsed;
}
