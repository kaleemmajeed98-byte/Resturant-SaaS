-- Authenticated owner/staff access for restaurant onboarding and daily operations.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restaurant_memberships (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','manager','cashier','waiter','kitchen','inventory')),
  branch_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (restaurant_id, user_id),
  foreign key (branch_id, restaurant_id) references public.branches(id, restaurant_id)
);
create index if not exists restaurant_memberships_user_idx on public.restaurant_memberships(user_id, is_active);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurants(id) on delete cascade,
  plan_code text not null default 'starter',
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled','incomplete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_status_events (
  id bigint generated always as identity primary key,
  restaurant_id uuid not null,
  branch_id uuid not null,
  order_id uuid not null,
  previous_status text,
  next_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (order_id, restaurant_id, branch_id) references public.orders(id, restaurant_id, branch_id) on delete cascade
);
create index if not exists order_status_events_order_idx on public.order_status_events(order_id, created_at);

create or replace function public.user_has_restaurant_access(target_restaurant uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.restaurant_memberships m
    where m.restaurant_id = target_restaurant and m.user_id = (select auth.uid()) and m.is_active);
$$;

create or replace function public.user_has_restaurant_role(target_restaurant uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.restaurant_memberships m
    where m.restaurant_id = target_restaurant and m.user_id = (select auth.uid())
      and m.is_active and m.role = any(allowed_roles));
$$;

create or replace function public.user_can_access_branch(target_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.branches b join public.restaurant_memberships m on m.restaurant_id = b.restaurant_id
    where b.id = target_branch and b.is_active and m.user_id = (select auth.uid()) and m.is_active
      and (m.branch_id is null or m.branch_id = b.id));
$$;

create or replace function public.user_can_manage_branch(target_branch uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.branches b join public.restaurant_memberships m on m.restaurant_id = b.restaurant_id
    where b.id = target_branch and b.is_active and m.user_id = (select auth.uid()) and m.is_active
      and (m.branch_id is null or m.branch_id = b.id) and m.role = any(array['owner','admin','manager']));
$$;

create or replace function public.user_has_branch_role(target_branch uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.branches b join public.restaurant_memberships m on m.restaurant_id = b.restaurant_id
    where b.id = target_branch and b.is_active and m.user_id = (select auth.uid()) and m.is_active
      and (m.branch_id is null or m.branch_id = b.id) and m.role = any(allowed_roles));
$$;

create or replace function public.create_restaurant_with_owner(restaurant_name text, restaurant_slug text, first_branch_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_restaurant_id uuid;
  new_branch_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if char_length(trim(restaurant_name)) not between 2 and 120 then raise exception 'Restaurant name is invalid'; end if;
  if restaurant_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then raise exception 'Restaurant URL is invalid'; end if;
  if char_length(trim(first_branch_name)) not between 2 and 120 then raise exception 'Branch name is invalid'; end if;

  insert into public.restaurants (name, slug) values (trim(restaurant_name), restaurant_slug)
    returning id into new_restaurant_id;
  insert into public.restaurant_memberships (restaurant_id, user_id, role)
    values (new_restaurant_id, (select auth.uid()), 'owner');
  insert into public.branches (restaurant_id, name, slug)
    values (new_restaurant_id, trim(first_branch_name), 'main') returning id into new_branch_id;
  insert into public.restaurant_settings (restaurant_id) values (new_restaurant_id);
  insert into public.restaurant_subscriptions (restaurant_id) values (new_restaurant_id);
  return new_restaurant_id;
end;
$$;

create or replace function public.transition_order_status(target_order uuid, next_status text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_order public.orders%rowtype;
  allowed boolean := false;
  prior_status text;
  required_roles text[];
begin
  select * into current_order from public.orders where id = target_order for update;
  if not found then raise exception 'Order not found'; end if;
  prior_status := current_order.status;
  if not public.user_can_access_branch(current_order.branch_id) then raise exception 'Not authorized'; end if;
  if current_order.status = 'placed' then
    allowed := next_status in ('accepted','cancelled');
  elsif current_order.status = 'accepted' then
    allowed := next_status in ('preparing','cancelled');
  elsif current_order.status = 'preparing' then
    allowed := next_status in ('ready','cancelled');
  elsif current_order.status = 'ready' then
    allowed := next_status in ('out_for_delivery','completed');
  elsif current_order.status = 'out_for_delivery' then
    allowed := next_status = 'completed';
  end if;
  if not allowed then raise exception 'Order status transition is not allowed'; end if;
  if next_status in ('preparing','ready') then
    required_roles := array['owner','admin','manager','kitchen'];
  elsif next_status = 'accepted' then
    required_roles := array['owner','admin','manager','cashier','waiter'];
  elsif next_status = 'out_for_delivery' then
    required_roles := array['owner','admin','manager','waiter'];
  elsif next_status = 'completed' then
    required_roles := array['owner','admin','manager','cashier','waiter'];
  else
    required_roles := array['owner','admin','manager','cashier'];
  end if;
  if not public.user_has_branch_role(current_order.branch_id, required_roles) then
    raise exception 'Not authorized to update this order';
  end if;
  update public.orders set status = next_status where id = target_order returning * into current_order;
  insert into public.order_status_events(restaurant_id, branch_id, order_id, previous_status, next_status, changed_by)
    values (current_order.restaurant_id, current_order.branch_id, current_order.id, prior_status, next_status, (select auth.uid()));
  return jsonb_build_object('id',current_order.id,'order_number',current_order.order_number,'status',current_order.status);
end;
$$;

create or replace function public.get_branch_dashboard(target_branch uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  summary jsonb;
  local_day_start timestamptz;
  branch_timezone text;
begin
  if not public.user_has_branch_role(target_branch,array['owner','admin','manager','cashier','waiter','kitchen']) then
    raise exception 'Not authorized';
  end if;
  select coalesce(b.timezone,'Asia/Karachi') into branch_timezone from public.branches b where b.id=target_branch;
  local_day_start := date_trunc('day', now() at time zone branch_timezone) at time zone branch_timezone;
  select jsonb_build_object(
    'orders_today', count(*) filter (where o.created_at >= local_day_start),
    'gross_sales_today', coalesce(sum(o.total) filter (where o.created_at >= local_day_start and o.status <> 'cancelled'),0),
    'pending_orders', count(*) filter (where o.status in ('placed','accepted','preparing')),
    'completed_orders_today', count(*) filter (where o.created_at >= local_day_start and o.status = 'completed')
  ) into summary from public.orders o where o.branch_id = target_branch;
  return summary;
end;
$$;

alter table public.profiles enable row level security;
alter table public.restaurant_memberships enable row level security;
alter table public.restaurant_subscriptions enable row level security;
alter table public.order_status_events enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists restaurants_select_member on public.restaurants;
create policy restaurants_select_member on public.restaurants for select to authenticated using (public.user_has_restaurant_access(id));
drop policy if exists memberships_select_self_or_owner on public.restaurant_memberships;
create policy memberships_select_self_or_owner on public.restaurant_memberships for select to authenticated
  using (user_id = (select auth.uid()) or public.user_has_restaurant_role(restaurant_id,array['owner','admin']));
drop policy if exists memberships_insert_owner on public.restaurant_memberships;
create policy memberships_insert_owner on public.restaurant_memberships for insert to authenticated
  with check (role <> 'owner' and public.user_has_restaurant_role(restaurant_id,array['owner','admin']));
drop policy if exists memberships_update_owner on public.restaurant_memberships;
create policy memberships_update_owner on public.restaurant_memberships for update to authenticated
  using (role <> 'owner' and public.user_has_restaurant_role(restaurant_id,array['owner','admin']))
  with check (role <> 'owner' and public.user_has_restaurant_role(restaurant_id,array['owner','admin']));
drop policy if exists memberships_delete_owner on public.restaurant_memberships;
create policy memberships_delete_owner on public.restaurant_memberships for delete to authenticated
  using (role <> 'owner' and public.user_has_restaurant_role(restaurant_id,array['owner']));
drop policy if exists branches_select_member on public.branches;
create policy branches_select_member on public.branches for select to authenticated
  using (public.user_can_access_branch(id) or public.user_has_restaurant_role(restaurant_id,array['owner','admin','manager']));
drop policy if exists categories_select_branch on public.menu_categories;
create policy categories_select_branch on public.menu_categories for select to authenticated using (public.user_can_access_branch(branch_id));
drop policy if exists categories_insert_manager on public.menu_categories;
create policy categories_insert_manager on public.menu_categories for insert to authenticated with check (public.user_can_manage_branch(branch_id));
drop policy if exists categories_update_manager on public.menu_categories;
create policy categories_update_manager on public.menu_categories for update to authenticated using (public.user_can_manage_branch(branch_id)) with check (public.user_can_manage_branch(branch_id));
drop policy if exists categories_delete_manager on public.menu_categories;
create policy categories_delete_manager on public.menu_categories for delete to authenticated using (public.user_can_manage_branch(branch_id));
drop policy if exists menu_items_select_branch on public.menu_items;
create policy menu_items_select_branch on public.menu_items for select to authenticated using (public.user_can_access_branch(branch_id));
drop policy if exists menu_items_insert_manager on public.menu_items;
create policy menu_items_insert_manager on public.menu_items for insert to authenticated with check (public.user_can_manage_branch(branch_id));
drop policy if exists menu_items_update_manager on public.menu_items;
create policy menu_items_update_manager on public.menu_items for update to authenticated using (public.user_can_manage_branch(branch_id)) with check (public.user_can_manage_branch(branch_id));
drop policy if exists menu_items_delete_manager on public.menu_items;
create policy menu_items_delete_manager on public.menu_items for delete to authenticated using (public.user_can_manage_branch(branch_id));
drop policy if exists orders_select_branch on public.orders;
create policy orders_select_branch on public.orders for select to authenticated
  using (public.user_has_branch_role(branch_id,array['owner','admin','manager','cashier','waiter','kitchen']));
drop policy if exists order_items_select_branch on public.order_items;
create policy order_items_select_branch on public.order_items for select to authenticated
  using (public.user_has_branch_role(branch_id,array['owner','admin','manager','cashier','waiter','kitchen']));
drop policy if exists order_status_events_select_branch on public.order_status_events;
create policy order_status_events_select_branch on public.order_status_events for select to authenticated
  using (public.user_has_branch_role(branch_id,array['owner','admin','manager','cashier','waiter','kitchen']));
drop policy if exists subscriptions_select_admin on public.restaurant_subscriptions;
create policy subscriptions_select_admin on public.restaurant_subscriptions for select to authenticated
  using (public.user_has_restaurant_role(restaurant_id,array['owner','admin']));

revoke all on public.profiles, public.restaurant_memberships, public.restaurant_subscriptions, public.order_status_events from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.restaurant_memberships to authenticated;
grant select on public.restaurant_subscriptions, public.order_status_events to authenticated;
grant select on public.restaurants, public.branches, public.menu_categories, public.orders, public.order_items to authenticated;
revoke all on public.menu_items from authenticated;
grant select (id,restaurant_id,branch_id,category_id,name,description,image_url,price,is_available,is_published,sort_order) on public.menu_items to authenticated;
grant insert (restaurant_id,branch_id,category_id,name,description,price,is_available,is_published) on public.menu_items to authenticated;
grant update (category_id,name,description,price,is_available,is_published,sort_order) on public.menu_items to authenticated;
grant delete on public.menu_items to authenticated;
grant insert, update, delete on public.menu_categories to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke all on function public.user_has_restaurant_access(uuid) from public, anon, authenticated;
revoke all on function public.user_has_restaurant_role(uuid,text[]) from public, anon, authenticated;
revoke all on function public.user_can_access_branch(uuid) from public, anon, authenticated;
revoke all on function public.user_can_manage_branch(uuid) from public, anon, authenticated;
revoke all on function public.user_has_branch_role(uuid,text[]) from public, anon, authenticated;
revoke all on function public.create_restaurant_with_owner(text,text,text) from public, anon, authenticated;
revoke all on function public.transition_order_status(uuid,text) from public, anon, authenticated;
revoke all on function public.get_branch_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.user_has_restaurant_access(uuid) to authenticated;
grant execute on function public.user_has_restaurant_role(uuid,text[]) to authenticated;
grant execute on function public.user_can_access_branch(uuid) to authenticated;
grant execute on function public.user_can_manage_branch(uuid) to authenticated;
grant execute on function public.user_has_branch_role(uuid,text[]) to authenticated;
grant execute on function public.create_restaurant_with_owner(text,text,text) to authenticated;
grant execute on function public.transition_order_status(uuid,text) to authenticated;
grant execute on function public.get_branch_dashboard(uuid) to authenticated;

-- Create a profile alongside each Supabase Auth user when no profile trigger exists.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,full_name) values (new.id,coalesce(new.raw_user_meta_data->>'full_name',''))
    on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists profiles_on_auth_user_created on auth.users;
create trigger profiles_on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

