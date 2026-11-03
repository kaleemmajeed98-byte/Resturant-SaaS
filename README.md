# Tablecraft

A restaurant storefront and guest ordering starter built with Next.js and Supabase. Guests can browse a restaurant menu, add items to a cart, select pickup or delivery, and submit an order. Supabase Postgres serves the published menu and calculates order totals inside a restricted database function.

## Supabase setup

1. Create or open a Supabase project.
2. Open **SQL Editor** and run these files as separate queries, in order: `supabase/migrations/20261103010000_public_storefront.sql`, then `supabase/migrations/20261103020000_staff_portal.sql`. They create any missing storefront/order/auth tables, enable row-level security, add guest-order and staff RPC functions, and seed three synthetic demo restaurants. The migrations are designed to run after your earlier restaurant schema too.
3. In project settings, copy the **Project URL** and the **publishable key** (or legacy anon key). Create `.env.local` in the project root:

   ```env
   NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_PUBLISHABLE_OR_ANON_KEY"
   ```

   The publishable/anon key is intended for browser use. Never put a `service_role` or secret key in a `NEXT_PUBLIC_` variable.

4. Start the app:

   ```powershell
   npm install
   npm run dev
   ```

5. Open `http://localhost:3000`, then try `/order/ember-burger`, `/order/casa-luna`, or `/order/little-crumb`.

## How checkout works

- The browser reads menu data only through `get_public_menu`; it does not receive a database service key.
- The checkout sends item IDs and quantities to `place_public_order`. Postgres verifies each item is published and available for that restaurant and branch, recalculates prices and tax, applies configured minimum order/delivery options, stores item snapshots, and returns an order number.
- A request ID prevents a retried checkout from creating a duplicate order.
- Direct table access remains behind row-level security. The demo migration seeds public restaurant/menu data, but does not create customer accounts or admin users.

## Tests and build

```powershell
npm test
npm run build
```

The test suite includes unit tests and PostgreSQL integration tests that execute both migrations, public menu and guest checkout RPCs, exact order pricing, idempotent retries, cross-restaurant item rejection, owner onboarding, tenant RLS, menu write access, and legal order status transitions using an in-process PostgreSQL engine. Tests do not connect to or modify your Supabase project.

## Current scope

This is a working initial restaurant SaaS slice. It includes owner sign-up, restaurant onboarding, a tenant-scoped staff dashboard, menu/category editing, order status progression, public restaurant storefronts, and guest ordering. Platform-wide super-admin management, staff invitations/role editing, product modifiers, image uploads, billing/payment collection, delivery zones, custom domains, rate limiting, and production notifications remain to be implemented before a production launch.

The initial Prisma files remain in the repository but are inactive; app data and migrations now use Supabase. `prisma/` is excluded from the TypeScript build.
