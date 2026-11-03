export type TenantRecord = {
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  published: boolean;
};

export type TenantLookup = {
  bySlug(slug: string): Promise<TenantRecord | null>;
  byVerifiedDomain(hostname: string): Promise<TenantRecord | null>;
};

const RESERVED = new Set(["www", "admin", "api", "login", "app", "platform"]);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(host: string): string | null {
  let normalized = host.trim().toLowerCase();
  if (!normalized || normalized.length > 260 || normalized.includes("/") || normalized.includes("@")) return null;
  if (normalized.includes(":")) {
    const parts = normalized.split(":");
    if (parts.length !== 2 || !/^\d{1,5}$/.test(parts[1]) || Number(parts[1]) > 65535) return null;
    normalized = parts[0];
  }
  const hostname = normalized.replace(/\.$/, "");
  if (!hostname || hostname.split(".").some((label) => !LABEL.test(label))) return null;
  return hostname;
}

export async function resolveTenant(host: string, rootDomain: string, lookup: TenantLookup): Promise<TenantRecord | null> {
  const hostname = normalizeHostname(host);
  const root = normalizeHostname(rootDomain);
  if (!hostname || !root || hostname === root || hostname === `www.${root}`) return null;

  const suffix = `.${root}`;
  if (hostname.endsWith(suffix)) {
    const slug = hostname.slice(0, -suffix.length);
    if (!slug || slug.includes(".") || RESERVED.has(slug)) return null;
    const tenant = await lookup.bySlug(slug);
    return tenant?.status === "ACTIVE" && tenant.published ? tenant : null;
  }

  const tenant = await lookup.byVerifiedDomain(hostname);
  return tenant?.status === "ACTIVE" && tenant.published ? tenant : null;
}
