const features = [
  ["01", "A home that feels like yours", "A clean, welcoming online storefront built around your restaurant, menu, and neighborhood."],
  ["02", "Orders, made simple", "Let guests order pickup or delivery without downloading an app or creating an account."],
  ["03", "Your team stays in control", "Live menu availability and checkout totals are checked by the restaurant database every time."],
];

const restaurants = [
  ["Ember Burger", "ember-burger", "A little smoky. A lot satisfying."],
  ["Casa Luna", "casa-luna", "Seasonal plates, made with care."],
  ["Little Crumb", "little-crumb", "Small batch, fresh from the oven."],
];

export default function HomePage() {
  return <main><div className="shell"><header className="topbar"><a className="brand" href="/">tablecraft<span>.</span></a><nav className="nav"><a href="#how">How it works</a><a href="#restaurants">Restaurants</a><a href="mailto:hello@tablecraft.example">Contact</a><a className="sign" href="#restaurants">Explore menus <span aria-hidden="true">→</span></a></nav></header>
    <section className="hero"><div><div className="eyebrow">GOOD FOOD, ONE GOOD LINK</div><h1>Your next favorite meal is just around the corner.</h1><p>Discover neighborhood kitchens, explore their menus, and order something lovely for pickup or delivery.</p><div className="actions"><a className="primary" href="#restaurants">Find your table <span aria-hidden="true">→</span></a><a className="under" href="#how">A little about us</a></div></div><div className="visual" role="img" aria-label="Illustration of a freshly prepared meal"><div className="plate"/><div className="visual-tag">GOOD FOOD · MADE WITH CARE</div></div></section>
    <div className="proof"><div><strong>Made for local</strong>Independent kitchens, one place.</div><div><strong>Easy to order</strong>No app or account required.</div><div><strong>Made fresh</strong>Menus come from the restaurant.</div></div>
    <section id="how" className="section"><div className="eyebrow">A BETTER WAY TO ORDER</div><h2>Good hospitality starts before the door.</h2><div className="cards">{features.map(([icon,title,body])=><article className="card" key={icon}><div className="icon">{icon}</div><h3>{title}</h3><p>{body}</p></article>)}</div></section>
    <section id="restaurants" className="section" style={{ paddingTop: 0 }}><div className="eyebrow">PICK YOUR CRAVING</div><h2>Come on in.</h2><p style={{ color: "var(--muted)", fontSize: 13 }}>Browse a sample menu and place a real order when your Supabase project is connected.</p><div className="demo-links">{restaurants.map(([name,slug,description])=><a href={`/order/${slug}`} key={slug}><strong>{name}</strong><span style={{ display: "block", color: "var(--muted)", fontWeight: 400, marginTop: 4 }}>{description}</span></a>)}</div></section>
  </div></main>;
}
