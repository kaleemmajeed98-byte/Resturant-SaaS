import { buildOrderPayload } from "./storefront";

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> };

export async function placeGuestOrder(client: RpcClient, restaurantSlug: string, branchSlug: string, input: unknown) {
  const payload = buildOrderPayload(input);
  const { data, error } = await client.rpc("place_public_order", {
    restaurant_slug: restaurantSlug,
    branch_slug: branchSlug,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    order_type: payload.order_type,
    delivery_address: payload.order_type === "delivery" ? payload.delivery_address : "",
    items: payload.items,
    request_id: payload.request_id,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || !("order_number" in data)) throw new Error("Order confirmation was not returned.");
  return data as { id: string; order_number: number | string; status: string; total: number };
}
