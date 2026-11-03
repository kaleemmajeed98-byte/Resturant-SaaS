"use client";

import { useEffect, useMemo, useState } from "react";
import { placeGuestOrder } from "@/lib/orders";
import { getSupabase } from "@/lib/supabase";
import { changeQuantity, subtotal, type CartLine } from "@/lib/storefront";

type MenuItem = { id: string; name: string; description: string; image_url: string | null; price: number };
type Category = { id: string; name: string; items: MenuItem[] };
type PublicMenu = {
  restaurant: { id: string; name: string; slug: string; currency: string };
  branch: { id: string; name: string; slug: string; address: string | null };
  settings: { tax_rate: number; delivery_fee: number; free_delivery_threshold: number | null; minimum_order: number; accepts_delivery: boolean; accepts_pickup: boolean };
  categories: Category[];
};

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PK", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

export default function Storefront({ restaurantSlug, branchSlug }: { restaurantSlug: string; branchSlug: string }) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderDone, setOrderDone] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", orderType: "pickup", address: "" });

  useEffect(() => {
    let alive = true;
    const supabase = getSupabase();
    if (!supabase) { setProblem("Supabase is not configured yet. Add your project URL and anon key to .env.local."); setLoading(false); return; }
    supabase.rpc("get_public_menu", { restaurant_slug: restaurantSlug, branch_slug: branchSlug }).then(({ data, error }) => {
      if (!alive) return;
      if (error) setProblem("We could not load this menu. Apply the Supabase migration and check your project settings.");
      else if (!data) setProblem("We could not find this restaurant.");
      else {
        const result = data as PublicMenu;
        setMenu(result);
        setActiveCategory(result.categories[0]?.id ?? "");
      }
      setLoading(false);
    });
    return () => { alive = false; };
  }, [restaurantSlug, branchSlug]);

  const lines = useMemo(() => menu?.categories.flatMap((category) => category.items
    .map((item) => ({ item, quantity: cart.find((line) => line.id === item.id)?.quantity ?? 0 }))
    .filter(({ quantity }) => quantity > 0)) ?? [], [menu, cart]);
  const count = cart.reduce((total, line) => total + line.quantity, 0);
  const currentSubtotal = subtotal(cart);
  const taxAmount = Math.round(currentSubtotal * Number(menu?.settings.tax_rate ?? 0)) / 100;
  const freeThreshold = menu?.settings.free_delivery_threshold;
  const deliveryFee = customer.orderType === "delivery" && (freeThreshold == null || currentSubtotal < Number(freeThreshold)) ? Number(menu?.settings.delivery_fee ?? 0) : 0;
  const total = currentSubtotal + taxAmount + deliveryFee;

  function add(item: MenuItem) {
    setCart((old) => {
      const existing = old.find((line) => line.id === item.id);
      return existing ? old.map((line) => line.id === item.id ? { ...line, quantity: Math.min(50, line.quantity + 1) } : line)
        : [...old, { id: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
  }

  async function submitOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase || !menu) return;
    setSending(true); setProblem("");
    try {
      const result = await placeGuestOrder(supabase, restaurantSlug, branchSlug, {
        customer_name: customer.name, customer_phone: customer.phone, order_type: customer.orderType,
        delivery_address: customer.address,
        items: cart.map((line) => ({ menu_item_id: line.id, quantity: line.quantity })),
        request_id: crypto.randomUUID(),
      });
      setOrderDone(String(result.order_number)); setCart([]); setCheckout(false);
    } catch (error) { setProblem(error instanceof Error ? error.message : "We could not place the order. Please try again."); }
    finally { setSending(false); }
  }

  if (loading) return <main className="order-page"><div className="order-loading">Preparing the menu…</div></main>;
  if (problem && !menu) return <main className="order-page"><div className="order-message"><a className="order-brand" href="/">tablecraft<span>.</span></a><h1>Let’s get the kitchen ready.</h1><p>{problem}</p><a className="back-link" href="/">Back to home <span>→</span></a></div></main>;
  if (!menu) return null;

  return <main className="order-page">
    <header className="order-header"><a className="order-brand" href="/">tablecraft<span>.</span></a><div className="order-header-right"><span className="branch-name">{menu.branch.name}</span><button className="cart-pill" onClick={() => setCheckout(true)} aria-label={`Open cart with ${count} items`}>Your order <b>{count}</b></button></div></header>
    <section className="restaurant-hero"><div className="restaurant-hero-copy"><span className="open-label"><i/> FRESH FROM THE KITCHEN</span><h1>{menu.restaurant.name}</h1><p>{menu.branch.address || "A good meal, made with care. Order ahead and we’ll have it ready."}</p><div className="hero-meta"><span>Freshly prepared</span><span>•</span><span>{menu.settings.accepts_delivery ? "Pickup & delivery" : "Pickup available"}</span></div></div><div className="hero-art" aria-hidden="true"><div className="hero-dish"><div className="hero-food"/></div><span className="hero-art-label">GOOD FOOD<br/>GOOD MOOD</span></div></section>
    <div className="menu-toolbar"><div className="menu-title"><span>MADE FOR YOUR TABLE</span><h2>Our menu</h2></div><div className="category-tabs" role="tablist" aria-label="Menu categories">{menu.categories.map((category) => <button key={category.id} className={activeCategory === category.id ? "category-tab active" : "category-tab"} onClick={() => { setActiveCategory(category.id); document.getElementById(`category-${category.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{category.name}</button>)}</div></div>
    {orderDone && <div className="success-banner"><div><strong>Order #{orderDone} is in.</strong><span>The restaurant will confirm it shortly. Keep your phone close.</span></div><button onClick={() => setOrderDone("")} aria-label="Dismiss">×</button></div>}
    {problem && <div className="inline-error" role="alert">{problem}</div>}
    <div className="menu-layout"><div className="menu-sections">{menu.categories.map((category) => <section className="menu-section" id={`category-${category.id}`} key={category.id}><div className="category-heading"><h3>{category.name}</h3><span>{category.items.length} items</span></div><div className="menu-grid">{category.items.map((item, index) => <article className="menu-card" key={item.id}><div className={`menu-photo photo-${index % 4}`}>
      {item.image_url ? <img src={item.image_url} alt="" /> : <div className="food-illustration" aria-hidden="true"><span>{item.name.split(" ").map((part) => part[0]).join("").slice(0,2)}</span></div>}
      <button className="add-button" onClick={() => add(item)} aria-label={`Add ${item.name} to order`}>+</button></div><div className="menu-card-info"><h4>{item.name}</h4><p>{item.description || "Made fresh with ingredients we love."}</p><strong>{money(Number(item.price), menu.restaurant.currency)}</strong></div></article>)}</div></section>)}</div>
      <aside className="desktop-cart"><div className="cart-head"><div><span>YOUR TABLE</span><h3>Your order</h3></div><span className="cart-count">{count}</span></div>{cart.length === 0 ? <div className="cart-empty"><div className="empty-bag">⌑</div><strong>Your order is waiting</strong><p>Add something delicious to get started.</p></div> : <><div className="cart-lines">{lines.map(({ item, quantity }) => <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><span>{money(Number(item.price) * quantity, menu.restaurant.currency)}</span><div className="quantity-control"><button onClick={() => setCart((old) => changeQuantity(old, item.id, -1))} aria-label={`Remove one ${item.name}`}>−</button><span>{quantity}</span><button onClick={() => add(item)} aria-label={`Add one ${item.name}`}>+</button></div></div></div>)}</div><div className="cart-totals"><div><span>Subtotal</span><b>{money(currentSubtotal, menu.restaurant.currency)}</b></div>{taxAmount > 0 && <div><span>Tax</span><b>{money(taxAmount, menu.restaurant.currency)}</b></div>}{deliveryFee > 0 && <div><span>Delivery</span><b>{money(deliveryFee, menu.restaurant.currency)}</b></div>}<div className="grand-total"><span>Total</span><b>{money(total, menu.restaurant.currency)}</b></div></div><button className="checkout-button" onClick={() => setCheckout(true)}>Continue to checkout <span>→</span></button></>}</aside></div>
    <div className="mobile-cart-bar"><span>{count} items <b>{money(total, menu.restaurant.currency)}</b></span><button onClick={() => setCheckout(true)}>View order <span>→</span></button></div>
    {checkout && <div className="checkout-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCheckout(false); }}><section className="checkout-sheet" role="dialog" aria-modal="true" aria-labelledby="checkout-title"><button className="close-checkout" onClick={() => setCheckout(false)} aria-label="Close checkout">×</button><span className="checkout-eyebrow">ALMOST THERE</span><h2 id="checkout-title">A few details, then we’ll get cooking.</h2><form onSubmit={submitOrder} className="checkout-form"><label>Your name<input required minLength={2} maxLength={120} value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} autoComplete="name" /></label><label>Phone number<input required minLength={7} maxLength={32} value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} autoComplete="tel" placeholder="03xx xxxxxxx" /></label><label>How would you like your order?<select value={customer.orderType} onChange={(event) => setCustomer({ ...customer, orderType: event.target.value })}>{menu.settings.accepts_pickup && <option value="pickup">Pickup</option>}{menu.settings.accepts_delivery && <option value="delivery">Delivery</option>}</select></label>{customer.orderType === "delivery" && <label>Delivery address<textarea required minLength={8} maxLength={500} value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} placeholder="House, street, area" /></label>}<div className="checkout-summary"><span>{count} items · {customer.orderType === "delivery" ? "Delivery" : "Pickup"}</span><strong>{money(total, menu.restaurant.currency)}</strong></div>{problem && <p className="form-error" role="alert">{problem}</p>}<button className="checkout-button" disabled={sending || cart.length === 0}>{sending ? "Sending your order…" : <>Place order <span>→</span></>}</button><p className="privacy-note">Your order details go directly to {menu.restaurant.name} to prepare your meal.</p></form></section></div>}
    <footer className="order-footer"><a className="order-brand" href="/">tablecraft<span>.</span></a><span>Good food deserves a good place online.</span><a href="mailto:hello@tablecraft.example">Need a hand?</a></footer>
  </main>;
}
