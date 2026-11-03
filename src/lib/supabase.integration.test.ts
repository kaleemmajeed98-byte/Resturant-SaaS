import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const storefrontMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261103010000_public_storefront.sql"), "utf8");
const staffMigration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261103020000_staff_portal.sql"), "utf8");
type QueryResult<T> = { rows: T[] };

describe("Supabase storefront SQL integration", () => {
  beforeAll(async () => {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    await db.exec("create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb not null default '{}'::jsonb);");
    await db.exec("create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;");
    await db.exec(storefrontMigration);
    await db.exec(staffMigration);
  });
  afterAll(async () => { await db.close(); });

  it("publishes the seeded menu through the safe public menu function", async () => {
    await db.exec("set role anon");
    try {
      const result = await db.query<{ menu: { restaurant: { slug: string }; categories: { items: { id: string }[] }[] } }>(
        "select public.get_public_menu($1, $2) as menu", ["ember-burger", "main"],
      ) as QueryResult<{ menu: { restaurant: { slug: string }; categories: { items: { id: string }[] }[] } }>;
      expect(result.rows[0].menu.restaurant.slug).toBe("ember-burger");
      expect(result.rows[0].menu.categories[0].items).toHaveLength(2);
      await expect(db.query("select * from public.menu_items")).rejects.toThrow();
    } finally { await db.exec("reset role"); }
  });

  it("prices guest orders from the database menu and makes retries idempotent", async () => {
    const result = await db.query<{ item_id: string }>(
      "select i.id as item_id from public.menu_items i join public.branches b on b.id=i.branch_id join public.restaurants r on r.id=b.restaurant_id where r.slug='ember-burger' order by i.name limit 1",
    ) as QueryResult<{ item_id: string }>;
    const args = ["ember-burger", "main", "Test Customer", "03001234567", "pickup", "", JSON.stringify([{ menu_item_id: result.rows[0].item_id, quantity: 2 }]), "123e4567-e89b-42d3-a456-426614174000"];
    const first = await db.query<{ order: { id: string; total: number; order_number: number } }>(
      "select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid) as order", args,
    ) as QueryResult<{ order: { id: string; total: number; order_number: number } }>;
    const retry = await db.query<{ order: { id: string; total: number; order_number: number } }>(
      "select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid) as order", args,
    ) as QueryResult<{ order: { id: string; total: number; order_number: number } }>;
    expect(first.rows[0].order.total).toBe(2380);
    expect(retry.rows[0].order.id).toBe(first.rows[0].order.id);
    const count = await db.query<{ count: number }>("select count(*)::int as count from public.orders") as QueryResult<{ count: number }>;
    expect(count.rows[0].count).toBe(1);
  });

  it("applies restaurant tax, delivery fee, free-delivery threshold, and minimum order", async () => {
    await db.exec("update public.restaurant_settings set tax_rate=5, delivery_fee=100, minimum_order=1000, free_delivery_threshold=3000 where restaurant_id=(select id from public.restaurants where slug='ember-burger')");
    const menuItem = await db.query<{ item_id: string }>("select id as item_id from public.menu_items where name='Crispy Chicken'") as QueryResult<{ item_id: string }>;
    const base = ["ember-burger", "main", "Test Customer", "03001234567", "delivery", "12 Food Street, Test Area"];
    const charged = await db.query<{ order: { total: number } }>(
      "select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid) as order",
      [...base, JSON.stringify([{ menu_item_id: menuItem.rows[0].item_id, quantity: 2 }]), "323e4567-e89b-42d3-a456-426614174000"],
    ) as QueryResult<{ order: { total: number } }>;
    expect(charged.rows[0].order.total).toBe(2599);
    const freeDelivery = await db.query<{ order: { total: number } }>(
      "select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid) as order",
      [...base, JSON.stringify([{ menu_item_id: menuItem.rows[0].item_id, quantity: 3 }]), "423e4567-e89b-42d3-a456-426614174000"],
    ) as QueryResult<{ order: { total: number } }>;
    expect(freeDelivery.rows[0].order.total).toBe(3748.5);
    await db.exec("update public.restaurant_settings set minimum_order=5000 where restaurant_id=(select id from public.restaurants where slug='ember-burger')");
    await expect(db.query(
      "select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid)",
      [...base, JSON.stringify([{ menu_item_id: menuItem.rows[0].item_id, quantity: 2 }]), "523e4567-e89b-42d3-a456-426614174000"],
    )).rejects.toThrow("Order is below the minimum amount");
  });

  it("rejects a menu item that belongs to a different restaurant", async () => {
    const result = await db.query<{ item_id: string }>(
      "select i.id as item_id from public.menu_items i join public.branches b on b.id=i.branch_id join public.restaurants r on r.id=b.restaurant_id where r.slug='casa-luna' limit 1",
    ) as QueryResult<{ item_id: string }>;
    const args = ["ember-burger", "main", "Test Customer", "03001234567", "pickup", "", JSON.stringify([{ menu_item_id: result.rows[0].item_id, quantity: 1 }]), "223e4567-e89b-42d3-a456-426614174000"];
    await expect(db.query("select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid)", args)).rejects.toThrow("A menu item is unavailable");
  });

  it("onboards an owner, enforces tenant RLS, and records allowed order status transitions", async () => {
    const ownerId = "823e4567-e89b-42d3-a456-426614174000";
    await db.query("insert into auth.users(id,raw_user_meta_data) values ($1,$2::jsonb)", [ownerId, JSON.stringify({ full_name: "Restaurant Owner" })]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ownerId]);
    await db.exec("set role authenticated");
    try {
      const created = await db.query<{ restaurant_id: string }>(
        "select public.create_restaurant_with_owner($1,$2,$3) as restaurant_id", ["Kitchen Club", "kitchen-club", "Main branch"],
      ) as QueryResult<{ restaurant_id: string }>;
      const restaurantId = created.rows[0].restaurant_id;
      const branch = await db.query<{ branch_id: string }>("select id as branch_id from public.branches where restaurant_id=$1", [restaurantId]) as QueryResult<{ branch_id: string }>;
      const branchId = branch.rows[0].branch_id;
      await db.query("insert into public.menu_categories(restaurant_id,branch_id,name) values ($1,$2,'Mains')", [restaurantId, branchId]);
      const category = await db.query<{ category_id: string }>("select id as category_id from public.menu_categories where branch_id=$1", [branchId]) as QueryResult<{ category_id: string }>;
      await db.query("insert into public.menu_items(restaurant_id,branch_id,category_id,name,price,is_available,is_published) values ($1,$2,$3,'House Burger',1000,true,true)", [restaurantId, branchId, category.rows[0].category_id]);
      const product = await db.query<{ item_id: string }>("select id as item_id from public.menu_items where branch_id=$1", [branchId]) as QueryResult<{ item_id: string }>;
      await expect(db.query("select cost_price from public.menu_items where id=$1", [product.rows[0].item_id])).rejects.toThrow();
      const placed = await db.query<{ order: { id: string } }>(
        "select public.place_public_order($1,$2,$3,$4,$5,$6,$7::jsonb,$8::uuid) as order",
        ["kitchen-club", "main", "Guest Customer", "03001234567", "pickup", "", JSON.stringify([{ menu_item_id: product.rows[0].item_id, quantity: 1 }]), "623e4567-e89b-42d3-a456-426614174000"],
      ) as QueryResult<{ order: { id: string } }>;
      const dashboard = await db.query<{ summary: { orders_today: number; gross_sales_today: number; pending_orders: number } }>(
        "select public.get_branch_dashboard($1) as summary", [branchId],
      ) as QueryResult<{ summary: { orders_today: number; gross_sales_today: number; pending_orders: number } }>;
      expect(dashboard.rows[0].summary).toMatchObject({ orders_today: 1, gross_sales_today: 1000, pending_orders: 1 });
      await db.query("select public.transition_order_status($1,'accepted')", [placed.rows[0].order.id]);
      await db.query("select public.transition_order_status($1,'preparing')", [placed.rows[0].order.id]);
      const events = await db.query<{ previous_status: string; next_status: string }>("select previous_status,next_status from public.order_status_events where order_id=$1 order by id", [placed.rows[0].order.id]) as QueryResult<{ previous_status: string; next_status: string }>;
      expect(events.rows).toEqual([{ previous_status: "placed", next_status: "accepted" }, { previous_status: "accepted", next_status: "preparing" }]);
      await expect(db.query("select public.transition_order_status($1,'completed')", [placed.rows[0].order.id])).rejects.toThrow("Order status transition is not allowed");
    } finally { await db.exec("reset role"); }

    const strangerId = "923e4567-e89b-42d3-a456-426614174000";
    await db.query("insert into auth.users(id) values ($1)", [strangerId]);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [strangerId]);
    await db.exec("set role authenticated");
    try {
      const rows = await db.query("select id from public.restaurants where slug='kitchen-club'");
      expect(rows.rows).toHaveLength(0);
    } finally { await db.exec("reset role"); }
  });
});
