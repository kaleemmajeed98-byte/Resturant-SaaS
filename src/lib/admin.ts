import { z } from "zod";

export const restaurantSetupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  branchName: z.string().trim().min(2).max(120),
});

export const menuItemInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1200).default(""),
  price: z.coerce.number().finite().min(0).max(1_000_000),
  categoryId: z.string().uuid().nullable(),
});

export function slugFromName(name: string) {
  return name.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

export function nextOrderStatus(status: string, orderType: string): string | null {
  if (status === "placed") return "accepted";
  if (status === "accepted") return "preparing";
  if (status === "preparing") return "ready";
  if (status === "ready") return orderType === "delivery" ? "out_for_delivery" : "completed";
  if (status === "out_for_delivery") return "completed";
  return null;
}
