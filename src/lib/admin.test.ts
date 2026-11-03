import { describe, expect, it } from "vitest";
import { menuItemInputSchema, nextOrderStatus, restaurantSetupSchema, slugFromName } from "./admin";

describe("restaurant admin validation", () => {
  it("creates URL-safe restaurant slugs", () => expect(slugFromName("Café Luna & Sons")).toBe("cafe-luna-sons"));
  it("rejects unsafe slugs and invalid dish details", () => {
    expect(restaurantSetupSchema.safeParse({ name: "Good Cafe", slug: "Good Cafe", branchName: "Main" }).success).toBe(false);
    expect(menuItemInputSchema.safeParse({ name: "", price: -4, categoryId: null }).success).toBe(false);
  });
  it("validates clean menu data and legal next order states", () => {
    expect(menuItemInputSchema.parse({ name: "Soup", price: "850", categoryId: null }).price).toBe(850);
    expect(nextOrderStatus("placed", "pickup")).toBe("accepted");
    expect(nextOrderStatus("ready", "delivery")).toBe("out_for_delivery");
    expect(nextOrderStatus("completed", "pickup")).toBeNull();
  });
});
