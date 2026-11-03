"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { placeGuestOrder } from "@/lib/orders";
import { getSupabase } from "@/lib/supabase";
import { changeQuantity, subtotal, type CartLine } from "@/lib/storefront";
import styles from "./storefront.module.css";

type MenuItem = { id: string; name: string; description: string; image_url: string | null; price: number };
type Category = { id: string; name: string; items: MenuItem[] };
type PublicMenu = {
  restaurant: { id: string; name: string; slug: string; currency: string };
  branch: { id: string; name: string; slug: string; address: string | null };
  settings: { tax_rate: number; delivery_fee: number; free_delivery_threshold: number | null; minimum_order: number; accepts_delivery: boolean; accepts_pickup: boolean };
  categories: Category[];
};
type OrderType = "pickup" | "delivery";

const heroFallback = "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1800&q=85";
const oliveUakMenuPhotos: Record<string, string> = {
  "Chicken Zinger Burger": "/menu/olive-uak/chicken-zinger-burger.webp",
  "Classic Smash Burger": "/menu/olive-uak/classic-smash-burger.webp",
  "Double Cheese Burger": "/menu/olive-uak/double-cheese-burger.webp",
  "Chicken Nuggets (6 pcs)": "/menu/olive-uak/chicken-nuggets.webp",
  "Masala Fries": "/menu/olive-uak/masala-fries.webp",
  "Mint Margarita": "/menu/olive-uak/mint-margarita.webp",
  "Fresh Mojito": "/menu/olive-uak/fresh-mojito.jpg",
  "Signature Mocktail": "/menu/olive-uak/signature-mocktail.jpg",
  "Buffalo Wings": "/menu/olive-uak/buffalo-wings.jpg",
  "Beef Tenderloin Steak": "/menu/olive-uak/beef-tenderloin-steak.jpg",
  "Truffle Fries": "/menu/olive-uak/truffle-fries.jpg",
  "Lamb Chops": "/menu/olive-uak/lamb-chops.jpg",
  "Stuffed Chicken Breast": "/menu/olive-uak/stuffed-chicken-breast.jpg",
  "Dynamite Prawns": "/menu/olive-uak/dynamite-prawns.jpg",
  "Molten Lava Cake": "/menu/olive-uak/molten-lava-cake.jpg",
  "New York Cheesecake": "/menu/olive-uak/new-york-cheesecake.jpg",
  "Tiramisu": "/menu/olive-uak/tiramisu.jpg",
};

function money(value: number, currency: string) {
  try { return new Intl.NumberFormat("en-PK", { style: "currency", currency }).format(value); }
  catch { return `${currency} ${value.toFixed(2)}`; }
}

function Icon({ name, className = "" }: { name: "bag" | "close" | "menu" | "plus" | "minus" | "arrow" | "pin" | "plate" | "remove"; className?: string }) {
  const paths = {
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    plate: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /></>,
    remove: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></>,
  };

  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function FoodImage({ src, alt }: { src: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return <div aria-hidden="true" className={styles.foodPlaceholder}><Icon name="plate" className={styles.placeholderIcon} /></div>;
  }

  return <Image src={src} alt={alt} fill unoptimized sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 30vw" onError={() => setFailed(true)} className={styles.foodImage} />;
}

export default function Storefront({ restaurantSlug, branchSlug }: { restaurantSlug: string; branchSlug: string }) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState(false);
  const [sending, setSending] = useState(false);
  const [orderDone, setOrderDone] = useState("");
  const [toast, setToast] = useState("");
  const [customer, setCustomer] = useState<{ name: string; phone: string; orderType: OrderType; address: string }>({ name: "", phone: "", orderType: "pickup", address: "" });

  useEffect(() => {
    let alive = true;
    const supabase = getSupabase();
    if (!supabase) {
      setProblem("Supabase is not configured yet. Add your project URL and anon key to .env.local.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const { data, error } = await supabase.rpc("get_public_menu", { restaurant_slug: restaurantSlug, branch_slug: branchSlug });
        if (!alive) return;
        if (error) setProblem("We could not load this menu. Apply the Supabase migration and check your project settings.");
        else if (!data) setProblem("We could not find this restaurant.");
        else {
          const result = data as PublicMenu;
          setMenu(result);
          setActiveCategory("all");
          setCustomer((current) => ({ ...current, orderType: result.settings.accepts_pickup ? "pickup" : "delivery" }));
        }
        setLoading(false);
      } catch {
        if (!alive) return;
        setProblem("We could not load this menu. Please try again in a moment.");
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [restaurantSlug, branchSlug]);

  useEffect(() => {
    if (!checkout && !cartOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !sending) {
        if (checkout) setCheckout(false);
        else setCartOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [cartOpen, checkout, sending]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleCategories = useMemo(() => (menu?.categories ?? [])
    .map((category) => ({
      ...category,
      items: category.items.filter((item) => `${item.name} ${item.description}`.toLowerCase().includes(search.trim().toLowerCase())),
    }))
    .filter((category) => (activeCategory === "all" || category.id === activeCategory) && category.items.length > 0),
  [activeCategory, menu, search]);
  const lines = useMemo(() => menu?.categories.flatMap((category) => category.items
    .map((item) => ({ item, quantity: cart.find((line) => line.id === item.id)?.quantity ?? 0 }))
    .filter(({ quantity }) => quantity > 0)) ?? [], [menu, cart]);
  const count = cart.reduce((total, line) => total + line.quantity, 0);
  const currentSubtotal = subtotal(cart);
  const taxAmount = Math.round(currentSubtotal * Number(menu?.settings.tax_rate ?? 0)) / 100;
  const freeThreshold = menu?.settings.free_delivery_threshold;
  const freeDelivery = customer.orderType === "delivery" && freeThreshold != null && currentSubtotal >= Number(freeThreshold);
  const deliveryFee = customer.orderType === "delivery" && !freeDelivery ? Number(menu?.settings.delivery_fee ?? 0) : 0;
  const total = currentSubtotal + taxAmount + deliveryFee;
  const minimumOrder = Number(menu?.settings.minimum_order ?? 0);
  const orderTypeAvailable = customer.orderType === "pickup" ? menu?.settings.accepts_pickup : menu?.settings.accepts_delivery;
  const imageForItem = (item: MenuItem) => restaurantSlug === "olive-uak"
    ? oliveUakMenuPhotos[item.name] ?? item.image_url
    : item.image_url;
  const heroImage = menu?.categories.flatMap((category) => category.items).map(imageForItem).find(Boolean) ?? heroFallback;

  function add(item: MenuItem) {
    setCart((old) => {
      const existing = old.find((line) => line.id === item.id);
      return existing
        ? old.map((line) => line.id === item.id ? { ...line, quantity: Math.min(50, line.quantity + 1) } : line)
        : [...old, { id: item.id, name: item.name, price: Number(item.price), quantity: 1 }];
    });
    setCartOpen(true);
    setToast(`${item.name} added to your order`);
  }

  function updateQuantity(id: string, delta: number) {
    setCart((current) => changeQuantity(current, id, delta));
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabase();
    if (sending || !cart.length || !menu || !supabase) return;
    setSending(true);
    setProblem("");
    try {
      const result = await placeGuestOrder(supabase, restaurantSlug, branchSlug, {
        customer_name: customer.name,
        customer_phone: customer.phone,
        order_type: customer.orderType,
        delivery_address: customer.address,
        items: cart.map((line) => ({ menu_item_id: line.id, quantity: line.quantity })),
        request_id: crypto.randomUUID(),
      });
      setOrderDone(String(result.order_number));
      setCart([]);
      setCheckout(false);
      setCustomer((current) => ({ ...current, name: "", phone: "", address: "" }));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setProblem(error instanceof Error ? error.message : "We could not place the order. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const cartContents = (
    <>
      {lines.length ? (
        <div className={styles.cartLines}>
          {lines.map(({ item, quantity }) => (
            <article className={styles.cartLine} key={item.id}>
              <div className={styles.cartLineTop}><h3>{item.name}</h3><strong>{money(Number(item.price) * quantity, menu?.restaurant.currency ?? "PKR")}</strong></div>
              <div className={styles.cartLineBottom}>
                <div className={styles.quantityControl}>
                  <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.id, -1)}><Icon name="minus" /></button>
                  <span>{quantity}</span>
                  <button type="button" aria-label={`Increase ${item.name} quantity`} disabled={quantity >= 50} onClick={() => add(item)}><Icon name="plus" /></button>
                </div>
                <button type="button" className={styles.removeButton} onClick={() => setCart((current) => current.filter((line) => line.id !== item.id))}><Icon name="remove" />Remove</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyCart}>
          <span className={styles.emptyIcon}><Icon name="bag" /></span>
          <h3>Your cart is waiting</h3>
          <p>Find something you love and it will appear here.</p>
        </div>
      )}
      <div className={styles.totals}>
        <div><span>Subtotal</span><strong>{money(currentSubtotal, menu?.restaurant.currency ?? "PKR")}</strong></div>
        {taxAmount > 0 && <div><span>Tax</span><strong>{money(taxAmount, menu?.restaurant.currency ?? "PKR")}</strong></div>}
        <div><span>Delivery</span><strong>{freeDelivery ? "Complimentary" : money(deliveryFee, menu?.restaurant.currency ?? "PKR")}</strong></div>
        <div className={styles.grandTotal}><span>Total estimate</span><strong>{money(total, menu?.restaurant.currency ?? "PKR")}</strong></div>
      </div>
    </>
  );

  if (loading) {
    return <main className={styles.page}><div className={styles.loading}><span className={styles.loadingMark}>TC</span><p>Setting the table…</p><div className={styles.loadingBar} /></div></main>;
  }
  if (problem && !menu) {
    return <main className={styles.page}><div className={styles.message}><a className={styles.brand} href="/">tablecraft<span>.</span></a><h1>Let’s get the kitchen ready.</h1><p>{problem}</p><a className={styles.backLink} href="/">Back to home <Icon name="arrow" /></a></div></main>;
  }
  if (!menu) return null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="Tablecraft home">tablecraft<span>.</span></a>
        <nav id="restaurant-navigation" className={`${styles.navigation} ${mobileMenuOpen ? styles.mobileNavigationOpen : ""}`} aria-label="Restaurant navigation">
          <a href="#home" onClick={() => setMobileMenuOpen(false)}>Home</a><a href="#menu" onClick={() => setMobileMenuOpen(false)}>Menu</a><a href="#story" onClick={() => setMobileMenuOpen(false)}>Our story</a><a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact</a>
        </nav>
        <button type="button" className={styles.mobileMenuButton} aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileMenuOpen} aria-controls="restaurant-navigation" onClick={() => setMobileMenuOpen((open) => !open)}><Icon name={mobileMenuOpen ? "close" : "menu"} /></button>
        <div className={styles.headerRight}>
          <span className={styles.branchName}><Icon name="pin" />{menu.branch.name}</span>
          <button type="button" className={styles.cartButton} onClick={() => setCartOpen(true)} aria-label={`Open cart, ${count} items`}><Icon name="bag" /><span>Your order</span><b>{count}</b></button>
        </div>
      </header>

      <section id="home" className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> Fresh from the kitchen</p>
          <h1>{menu.restaurant.name}</h1>
          <p className={styles.heroDescription}>{menu.branch.address || "Good food, thoughtfully prepared. Choose your favourites and order directly from us."}</p>
          <div className={styles.heroActions}><a href="#menu" className={styles.primaryButton}>Explore the menu <Icon name="arrow" /></a><button type="button" className={styles.secondaryButton} onClick={() => count ? setCartOpen(true) : document.getElementById("menu")?.scrollIntoView({ behavior: "smooth" })}>Order now</button></div>
          <div className={styles.heroMeta}><span>Freshly prepared</span><i /><span>{menu.settings.accepts_delivery ? "Pickup & delivery" : "Pickup available"}</span><i /><span>Pay at the restaurant</span></div>
        </div>
        <div className={styles.heroImage}>
          <Image src={heroImage} alt={`${menu.restaurant.name} restaurant and menu`} fill unoptimized priority sizes="(max-width: 900px) 100vw, 55vw" className={styles.heroPhoto} />
          <div className={styles.heroShade} />
          <span className={styles.heroImageLabel}>The guest experience</span>
          <span className={styles.heroReady}><i /> Ready to order</span>
          <div className={styles.heroCard}><span className={styles.heroCardMark}>{menu.restaurant.name.trim().charAt(0).toUpperCase()}</span><div><small>{menu.branch.name}</small><strong>Your menu, your way.</strong></div><span className={styles.heroCardArrow}>↗</span></div>
          <span className={styles.heroCaption}>A direct line from our kitchen to your table.</span>
        </div>
      </section>

      {orderDone && <div role="status" className={styles.successBanner}><div><strong>Order #{orderDone} is in.</strong><span>The restaurant will confirm it shortly. Keep your phone close.</span></div><button type="button" onClick={() => setOrderDone("")} aria-label="Dismiss confirmation"><Icon name="close" /></button></div>}

      <section id="menu" className={styles.menuSection}>
        <div className={styles.menuHeading}>
          <div><p className={styles.sectionEyebrow}>Made for your table</p><h2>Our menu</h2><p className={styles.menuIntro}>A few good things, made with care.</p></div>
          <label className={styles.searchBox}><span className={styles.srOnly}>Search menu</span><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></svg><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the menu" /></label>
        </div>
        <div className={styles.menuLayout}>
          <div className={styles.menuContent}>
            <div className={styles.categoryTabs} role="group" aria-label="Filter menu by category">
              <button type="button" aria-pressed={activeCategory === "all"} className={activeCategory === "all" ? styles.activeCategory : ""} onClick={() => setActiveCategory("all")}>All items</button>
              {menu.categories.map((category) => <button type="button" key={category.id} aria-pressed={activeCategory === category.id} className={activeCategory === category.id ? styles.activeCategory : ""} onClick={() => setActiveCategory(category.id)}>{category.name}</button>)}
            </div>
            {visibleCategories.length ? (
              <div className={styles.menuGrid}>
                {visibleCategories.flatMap((category) => category.items.map((item) => (
                  <article className={styles.menuCard} key={item.id}>
                    <div className={styles.menuPhoto}><FoodImage src={imageForItem(item)} alt={item.name} /><span className={styles.photoCategory}>{category.name}</span></div>
                    <div className={styles.menuCardInfo}>
                      <div className={styles.itemTitle}><h3>{item.name}</h3><strong>{money(Number(item.price), menu.restaurant.currency)}</strong></div>
                      <p>{item.description || "Thoughtfully prepared and ready to enjoy."}</p>
                      <div className={styles.cardFooter}><span>{cart.find((line) => line.id === item.id)?.quantity ? `${cart.find((line) => line.id === item.id)?.quantity} in your order` : "Prepared to order"}</span><button type="button" onClick={() => add(item)} aria-label={`Add ${item.name} to your order`}><Icon name="plus" />Add</button></div>
                    </div>
                  </article>
                )))}
              </div>
            ) : <div className={styles.noResults}><Icon name="plate" /><h3>{search ? "Nothing found" : "The menu is being prepared"}</h3><p>{search ? "Try another search or category." : "Check back soon for something delicious."}</p>{search && <button type="button" onClick={() => { setSearch(""); setActiveCategory("all"); }}>Clear filters</button>}</div>}
          </div>

        </div>
      </section>

      <section id="story" className={styles.story}><div><p className={styles.sectionEyebrow}>At the table</p><h2>Good things are better shared.</h2></div><p>Discover the menu, choose your favourites, and let our team take care of the rest. We look forward to welcoming you.</p></section>
      <footer id="contact" className={styles.footer}><div><a className={styles.brand} href="/">tablecraft<span>.</span></a><p>{menu.restaurant.name}</p>{menu.branch.address && <p className={styles.footerAddress}><Icon name="pin" />{menu.branch.address}</p>}</div><div className={styles.footerRight}>{menu.restaurant.name && <span>Freshly prepared, just for you.</span>}<a href="#home">Back to top ↑</a></div></footer>

      {count > 0 && !checkout && !cartOpen && <div className={styles.mobileBar}><button type="button" onClick={() => setCartOpen(true)}><span><Icon name="bag" />View order · {count}</span><span>{money(total, menu.restaurant.currency)} <Icon name="arrow" /></span></button></div>}

      {cartOpen && (
        <div className={styles.drawerLayer}>
          <button type="button" aria-label="Close cart" className={`${styles.backdrop} ${styles.cartBackdrop}`} onClick={() => setCartOpen(false)} />
          <section className={`${styles.drawer} ${styles.cartDrawer}`} role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <div className={styles.drawerHeader}>
              <div><p>Your selections</p><h2 id="cart-title">Your order</h2></div>
              <span className={styles.drawerCount}>{count} {count === 1 ? "item" : "items"}</span>
              <button type="button" className={styles.closeButton} onClick={() => setCartOpen(false)} aria-label="Close cart"><Icon name="close" /></button>
            </div>
            <div className={styles.drawerScroll}>
              <div className={styles.cartContent}>{cartContents}</div>
              {currentSubtotal > 0 && currentSubtotal < minimumOrder && <p className={styles.minimumNote}>Add {money(minimumOrder - currentSubtotal, menu.restaurant.currency)} more to meet this order&apos;s minimum.</p>}
            </div>
            <div className={styles.drawerFooter}>
              <button type="button" className={styles.checkoutButton} disabled={!cart.length || !orderTypeAvailable || currentSubtotal < minimumOrder} onClick={() => { setCartOpen(false); setCheckout(true); setProblem(""); }}>Continue to checkout <Icon name="arrow" /></button>
              <p className={styles.paymentNote}>No online payment required · Pay at the restaurant</p>
            </div>
          </section>
        </div>
      )}

      {checkout && (
        <div className={styles.drawerLayer}>
          <button type="button" aria-label="Close checkout" className={styles.backdrop} onClick={() => !sending && setCheckout(false)} />
          <section className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <div className={styles.drawerHeader}><div><p>Almost there</p><h2 id="checkout-title">Your order</h2></div><button type="button" disabled={sending} className={styles.closeButton} onClick={() => setCheckout(false)} aria-label="Close checkout"><Icon name="close" /></button></div>
            <form onSubmit={submitOrder} className={styles.checkoutForm}>
              <div className={styles.drawerScroll}>
                {cartContents}
                {currentSubtotal > 0 && currentSubtotal < minimumOrder && <p className={styles.minimumNote}>Add {money(minimumOrder - currentSubtotal, menu.restaurant.currency)} more to meet this order&apos;s minimum.</p>}
                {menu.settings.accepts_pickup && menu.settings.accepts_delivery && <label className={styles.formField}>How would you like your order?<select value={customer.orderType} onChange={(event) => setCustomer({ ...customer, orderType: event.target.value as OrderType })}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label>}
                <div className={styles.customerFields}>
                  <p className={styles.sectionEyebrow}>Your details</p>
                  <label className={styles.formField}>Your name<input required minLength={2} maxLength={120} value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} autoComplete="name" placeholder="Your name" /></label>
                  <label className={styles.formField}>Phone number<input required minLength={7} maxLength={32} type="tel" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} autoComplete="tel" placeholder="03xx xxxxxxx" /></label>
                  {customer.orderType === "delivery" && <label className={styles.formField}>Delivery address<textarea required minLength={8} maxLength={500} value={customer.address} onChange={(event) => setCustomer({ ...customer, address: event.target.value })} autoComplete="street-address" placeholder="House, street and area" rows={3} /></label>}
                </div>
              </div>
              <div className={styles.drawerFooter}>
                {problem && <p className={styles.formError} role="alert">{problem}</p>}
                {!orderTypeAvailable && <p className={styles.formError} role="status">Online ordering is not available for this order type.</p>}
                <button type="submit" className={styles.checkoutButton} disabled={sending || !cart.length || !orderTypeAvailable || currentSubtotal < minimumOrder}>{sending ? "Sending your order…" : <>Place order · {money(total, menu.restaurant.currency)} <Icon name="arrow" /></>}</button>
                <p className={styles.paymentNote}>Your details go directly to {menu.restaurant.name}. Pay at the restaurant.</p>
              </div>
            </form>
          </section>
        </div>
      )}
      {toast && <div className={styles.toast} role="status" aria-live="polite">{toast}</div>}
    </main>
  );
}
