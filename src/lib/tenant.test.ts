import { describe, expect, it, vi } from "vitest";
import { normalizeHostname, resolveTenant, type TenantLookup } from "./tenant";

const burger = { slug: "burger", name: "Burger House", status: "ACTIVE" as const, published: true };
function lookup(): TenantLookup {
  return {
    bySlug: vi.fn(async (slug: string) => slug === "burger" ? burger : null),
    byVerifiedDomain: vi.fn(async (host: string) => host === "order.burger-house.test" ? burger : null),
  };
}

describe("normalizeHostname", () => {
  it("normalizes case, ports, and a trailing dot", () => expect(normalizeHostname("BURGER.example.com.:3000")).toBe("burger.example.com"));
  it("rejects malformed hostnames", () => expect(normalizeHostname("bad host/path")).toBeNull());
});

describe("resolveTenant", () => {
  it("resolves a published active subdomain", async () => expect(await resolveTenant("burger.example.com", "example.com", lookup())).toEqual(burger));
  it("does not treat reserved routes as tenant slugs", async () => expect(await resolveTenant("admin.example.com", "example.com", lookup())).toBeNull());
  it("rejects the root, unknown, suspended, and unpublished tenants", async () => {
    expect(await resolveTenant("example.com", "example.com", lookup())).toBeNull();
    expect(await resolveTenant("missing.example.com", "example.com", lookup())).toBeNull();
    const unready = { ...lookup(), bySlug: vi.fn(async () => ({ ...burger, published: false })) };
    expect(await resolveTenant("burger.example.com", "example.com", unready)).toBeNull();
  });
  it("resolves only through the verified-domain repository method for custom hosts", async () => {
    const repository = lookup();
    expect(await resolveTenant("order.burger-house.test", "example.com", repository)).toEqual(burger);
    expect(repository.byVerifiedDomain).toHaveBeenCalledWith("order.burger-house.test");
  });
});
