-- Minimal Supabase schema for a public restaurant menu and guest checkout.
-- Public access is provided through narrowly scoped RPC functions; table rows
-- stay behind RLS and are never directly readable by anon clients.
create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  currency char(3) not null default 'PKR',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  slug text not null,
  address text,
  timezone text not null default 'Asia/Karachi',
  is_active boolean not null default true,
  unique (restaurant_id, slug),
  unique (id, restaurant_id)
);
create table if not exists public.restaurant_settings (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  free_delivery_threshold numeric(12,2) check (free_delivery_threshold is null or free_delivery_threshold >= 0),
  minimum_order numeric(12,2) not null default 0 check (minimum_order >= 0),
  accepts_delivery boolean not null default true,
  accepts_pickup boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  unique (id, restaurant_id, branch_id),
  unique (branch_id, name),
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id) on delete cascade
);
create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  branch_id uuid not null,
  category_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 1200),
  sku text,
  image_url text,
  price numeric(12,2) not null check (price >= 0),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  prep_minutes smallint not null default 15 check (prep_minutes between 0 and 600),
  is_available boolean not null default true,
  is_published boolean not null default false,
  sort_order integer not null default 0,
  unique (id, restaurant_id, branch_id),
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id) on delete cascade,
  foreign key (category_id, restaurant_id, branch_id) references public.menu_categories(id, restaurant_id, branch_id)
);
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint generated always as identity unique,
  restaurant_id uuid not null references public.restaurants(id) on delete restrict,
  branch_id uuid not null,
  order_type text not null check (order_type in ('pickup','delivery')),
  source text not null default 'online' check (source = 'online'),
  status text not null default 'placed' check (status in ('placed','accepted','preparing','ready','out_for_delivery','completed','cancelled')),
  payment_status text not null default 'unpaid',
  customer_name text not null,
  customer_phone text not null,
  delivery_address text,
  customer_note text,
  subtotal numeric(12,2) not null check (subtotal >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  total numeric(12,2) not null check (total = subtotal + tax_amount + delivery_fee),
  request_id uuid not null,
  request_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique (restaurant_id, request_id),
  unique (id, restaurant_id, branch_id),
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id) on delete restrict,
  check (order_type <> 'delivery' or char_length(delivery_address) >= 8)
);
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null,
  restaurant_id uuid not null,
  branch_id uuid not null,
  menu_item_id uuid,
  item_name text not null,
  quantity integer not null check (quantity between 1 and 50),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total = quantity * unit_price),
  foreign key (order_id, restaurant_id, branch_id) references public.orders(id, restaurant_id, branch_id) on delete cascade,
  foreign key (menu_item_id, restaurant_id, branch_id) references public.menu_items(id, restaurant_id, branch_id)
);

create index if not exists menu_categories_public_idx on public.menu_categories(branch_id, is_active, sort_order);
create index if not exists menu_items_public_idx on public.menu_items(branch_id, is_published, is_available, sort_order);
create index if not exists orders_branch_created_idx on public.orders(branch_id, created_at desc);

alter table public.restaurants enable row level security;
alter table public.branches enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
revoke all on public.restaurants, public.branches, public.restaurant_settings, public.menu_categories,
  public.menu_items, public.orders, public.order_items from anon;

create or replace function public.get_public_menu(restaurant_slug text, branch_slug text default 'main')
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'restaurant', jsonb_build_object('id', r.id, 'name', r.name, 'slug', r.slug, 'currency', r.currency),
    'branch', jsonb_build_object('id', b.id, 'name', b.name, 'slug', b.slug, 'address', b.address),
    'settings', jsonb_build_object('tax_rate', coalesce(s.tax_rate,0), 'delivery_fee', coalesce(s.delivery_fee,0),
      'free_delivery_threshold', s.free_delivery_threshold, 'minimum_order', coalesce(s.minimum_order,0),
      'accepts_delivery', coalesce(s.accepts_delivery,true), 'accepts_pickup', coalesce(s.accepts_pickup,true)),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'items', coalesce((
          select jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'description', i.description,
            'image_url', i.image_url, 'price', i.price) order by i.sort_order, i.name)
          from public.menu_items i where i.category_id = c.id and i.restaurant_id = r.id and i.branch_id = b.id
            and i.is_available and i.is_published
        ), '[]'::jsonb)
      ) order by c.sort_order, c.name)
      from public.menu_categories c where c.restaurant_id = r.id and c.branch_id = b.id and c.is_active
    ), '[]'::jsonb)
  )
  from public.restaurants r join public.branches b on b.restaurant_id = r.id
  left join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = restaurant_slug and r.is_active and b.slug = branch_slug and b.is_active
  limit 1;
$$;

create or replace function public.place_public_order(
  restaurant_slug text,
  branch_slug text,
  customer_name text,
  customer_phone text,
  order_type text,
  delivery_address text,
  items jsonb,
  request_id uuid
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.restaurants%rowtype;
  b public.branches%rowtype;
  item jsonb;
  menu_row public.menu_items%rowtype;
  restaurant_options public.restaurant_settings%rowtype;
  qty integer;
  calculated_subtotal numeric(12,2) := 0;
  calculated_tax numeric(12,2) := 0;
  calculated_delivery numeric(12,2) := 0;
  fingerprint text;
  new_order public.orders%rowtype;
begin
  if char_length(trim(customer_name)) not between 2 and 120 then raise exception 'Customer name is invalid'; end if;
  if char_length(trim(customer_phone)) not between 7 and 32 then raise exception 'Customer phone is invalid'; end if;
  if order_type not in ('pickup','delivery') then raise exception 'Order type is invalid'; end if;
  if order_type = 'delivery' and char_length(trim(coalesce(delivery_address,''))) < 8 then raise exception 'Delivery address is required'; end if;
  if jsonb_typeof(items) is distinct from 'array' then raise exception 'Order items are invalid'; end if;
  if jsonb_array_length(items) not between 1 and 50 then raise exception 'Order items are invalid'; end if;

  select * into r from public.restaurants where slug = restaurant_slug and is_active;
  if not found then raise exception 'Restaurant is unavailable'; end if;
  select * into b from public.branches where restaurant_id = r.id and slug = branch_slug and is_active;
  if not found then raise exception 'Branch is unavailable'; end if;
  select * into restaurant_options from public.restaurant_settings where restaurant_id = r.id;
  if order_type = 'delivery' and not coalesce(restaurant_options.accepts_delivery,true) then raise exception 'Delivery is unavailable'; end if;
  if order_type = 'pickup' and not coalesce(restaurant_options.accepts_pickup,true) then raise exception 'Pickup is unavailable'; end if;

  fingerprint := encode(sha256(convert_to(concat_ws('|', r.id::text, b.id::text, trim(customer_name), trim(customer_phone),
    order_type, coalesce(trim(delivery_address),''), items::text), 'UTF8')), 'hex');
  select * into new_order from public.orders where restaurant_id = r.id and orders.request_id = place_public_order.request_id;
  if found then
    if new_order.request_fingerprint <> fingerprint then raise exception 'Checkout request ID was already used'; end if;
    return jsonb_build_object('id', new_order.id, 'order_number', new_order.order_number, 'status', new_order.status, 'total', new_order.total);
  end if;

  for item in select value from jsonb_array_elements(items) loop
    if not (item ? 'menu_item_id') or not (item ? 'quantity') then raise exception 'Order item details are missing'; end if;
    qty := (item->>'quantity')::integer;
    if qty is null or qty not between 1 and 50 then raise exception 'Item quantity is invalid'; end if;
    select * into menu_row from public.menu_items
      where id = (item->>'menu_item_id')::uuid and restaurant_id = r.id and branch_id = b.id
        and is_available and is_published;
    if not found then raise exception 'A menu item is unavailable'; end if;
    calculated_subtotal := calculated_subtotal + menu_row.price * qty;
  end loop;
  if calculated_subtotal < coalesce(restaurant_options.minimum_order,0) then raise exception 'Order is below the minimum amount'; end if;
  calculated_tax := round(calculated_subtotal * coalesce(restaurant_options.tax_rate,0) / 100, 2);
  if order_type = 'delivery' and (restaurant_options.free_delivery_threshold is null or calculated_subtotal < restaurant_options.free_delivery_threshold) then
    calculated_delivery := coalesce(restaurant_options.delivery_fee,0);
  end if;

  insert into public.orders (restaurant_id, branch_id, order_type, customer_name, customer_phone,
    delivery_address, subtotal, tax_amount, delivery_fee, total, request_id, request_fingerprint)
  values (r.id, b.id, order_type, trim(customer_name), trim(customer_phone), nullif(trim(coalesce(delivery_address,'')),''),
    calculated_subtotal, calculated_tax, calculated_delivery, calculated_subtotal + calculated_tax + calculated_delivery,
    request_id, fingerprint)
  returning * into new_order;

  for item in select value from jsonb_array_elements(items) loop
    qty := (item->>'quantity')::integer;
    select * into menu_row from public.menu_items
      where id = (item->>'menu_item_id')::uuid and restaurant_id = r.id and branch_id = b.id and is_available and is_published;
    insert into public.order_items (order_id, restaurant_id, branch_id, menu_item_id, item_name, quantity, unit_price, line_total)
    values (new_order.id, r.id, b.id, menu_row.id, menu_row.name, qty, menu_row.price, menu_row.price * qty);
  end loop;

  return jsonb_build_object('id', new_order.id, 'order_number', new_order.order_number, 'status', new_order.status, 'total', new_order.total);
end;
$$;

revoke all on function public.get_public_menu(text,text) from public;
revoke all on function public.place_public_order(text,text,text,text,text,text,jsonb,uuid) from public;
grant execute on function public.get_public_menu(text,text) to anon, authenticated;
grant execute on function public.place_public_order(text,text,text,text,text,text,jsonb,uuid) to anon, authenticated;

-- Synthetic menu data for an immediate local preview; no customer/auth records are created.
do $$
<<seed>>
declare
  spec record;
  restaurant_id uuid;
  branch_id uuid;
  category_id uuid;
  item record;
begin
  for spec in select * from (values
    ('Ember Burger','ember-burger','Burgers'),
    ('Casa Luna','casa-luna','Dinner'),
    ('Little Crumb','little-crumb','Bakery')
  ) as restaurants(name,slug,category_name) loop
    insert into public.restaurants(name,slug,currency) values (spec.name,spec.slug,'PKR')
      on conflict on constraint restaurants_slug_key do update set name=excluded.name returning id into restaurant_id;
    insert into public.branches(restaurant_id,name,slug) values (restaurant_id,'Main branch','main')
      on conflict on constraint branches_restaurant_id_slug_key do update set name=excluded.name returning id into branch_id;
    insert into public.restaurant_settings(restaurant_id) values (restaurant_id) on conflict on constraint restaurant_settings_pkey do nothing;
    insert into public.menu_categories(restaurant_id,branch_id,name,sort_order)
      values (restaurant_id,branch_id,spec.category_name,0)
      on conflict on constraint menu_categories_branch_id_name_key do update set is_active=true returning id into category_id;

    for item in select * from (values
      ('ember-burger','Ember Classic','Smash patty, cheddar, house sauce',1290::numeric),
      ('ember-burger','Crispy Chicken','Buttermilk chicken, pickles',1190::numeric),
      ('casa-luna','Wild Mushroom Risotto','Porcini, parmesan, herbs',2190::numeric),
      ('casa-luna','Roast Chicken','Lemon, thyme, seasonal greens',2590::numeric),
      ('little-crumb','Almond Croissant','Butter pastry, toasted almonds',550::numeric),
      ('little-crumb','Cardamom Bun','Freshly baked each morning',475::numeric)
    ) as products(slug,name,description,price) where slug=spec.slug loop
      if not exists (select 1 from public.menu_items i where i.branch_id=seed.branch_id and i.name=item.name) then
        insert into public.menu_items(restaurant_id,branch_id,category_id,name,description,price,is_available,is_published)
        values (restaurant_id,branch_id,category_id,item.name,item.description,item.price,true,true);
      end if;
    end loop;
  end loop;
end;
$$;
