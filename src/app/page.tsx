const capabilities = [
  { number: "01", title: "Your own ordering website", detail: "Give every guest a polished, mobile friendly place to browse your menu and order directly from you.", label: "DIRECT ONLINE ORDERING" },
  { number: "02", title: "A menu you can manage", detail: "Update dishes and availability in your workspace. Changes show up on your storefront right away.", label: "LIVE MENU CONTROL" },
  { number: "03", title: "Every order in one view", detail: "Keep the front of house and kitchen on the same page with a clear, simple order workflow.", label: "RESTAURANT OPERATIONS" },
];

const steps = [
  { number: "01", title: "Set up your restaurant", detail: "Create your workspace and add your first branch." },
  { number: "02", title: "Publish your menu", detail: "Add categories, dishes, and prices in a few minutes." },
  { number: "03", title: "Share your link", detail: "Guests can place pickup or delivery orders from any device." },
];

export default function HomePage() {
  return (
    <main className="marketing-page">
      <div className="marketing-shell">
        <header className="marketing-header">
          <a className="brand" href="/" aria-label="Tablecraft home">tablecraft<span>.</span></a>
          <nav className="marketing-nav" aria-label="Main navigation">
            <a href="#platform">Platform</a>
            <a href="#how-it-works">How it works</a>
            <a href="/login">Sign in</a>
            <a className="marketing-nav-cta" href="/signup">Start your restaurant <span aria-hidden="true">→</span></a>
          </nav>
        </header>

        <section className="marketing-hero">
          <div className="marketing-hero-copy">
            <span className="marketing-kicker"><i /> RESTAURANT COMMERCE, MADE SIMPLE</span>
            <h1>Your restaurant deserves its own <em>front door.</em></h1>
            <p>Bring your menu, online orders, and daily operations together in one thoughtful workspace, built around your restaurant.</p>
            <div className="marketing-actions">
              <a className="marketing-primary" href="/signup">Build your restaurant site <span aria-hidden="true">→</span></a>
              <a className="marketing-secondary" href="#platform">Explore the platform <span aria-hidden="true">↓</span></a>
            </div>
            <div className="marketing-trust"><span className="trust-check">✓</span> Set up your first branch and menu in one place</div>
          </div>
          <div className="marketing-visual" role="img" aria-label="Freshly made burger and fries on a restaurant table">
            <div className="visual-topline"><span>THE GUEST EXPERIENCE</span><span className="visual-live"><i /> READY TO ORDER</span></div>
            <div className="visual-food-photo" />
            <div className="visual-order-card">
              <div className="visual-order-mark">TC</div>
              <div><small>A TABLECRAFT STOREFRONT</small><strong>Your menu, your way.</strong></div>
              <span className="visual-order-arrow">↗</span>
            </div>
            <div className="visual-caption">A direct line from your kitchen to your guests.</div>
          </div>
        </section>

        <section className="marketing-proof" aria-label="Platform benefits">
          <div><span className="proof-icon">↗</span><span><strong>Direct ordering</strong><small>Your brand stays front and center</small></span></div>
          <div><span className="proof-icon">⌘</span><span><strong>One clear workspace</strong><small>Menu and orders together</small></span></div>
          <div><span className="proof-icon">◎</span><span><strong>Made for every screen</strong><small>A smooth guest experience on mobile</small></span></div>
        </section>

        <section id="platform" className="platform-section">
          <div className="section-intro">
            <div><span className="marketing-eyebrow">A PLATFORM THAT WORKS WITH YOU</span><h2>Everything guests need.<br /><em>Everything you need.</em></h2></div>
            <p>Give customers an easy way to order while your team keeps the details moving behind the scenes.</p>
          </div>
          <div className="capability-grid">
            {capabilities.map((capability) => (
              <article className="capability-card" key={capability.number}>
                <div className="capability-card-top"><span>{capability.number}</span><span className="capability-arrow">↗</span></div>
                <div className="capability-rule" />
                <span className="marketing-eyebrow">{capability.label}</span>
                <h3>{capability.title}</h3>
                <p>{capability.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="setup-section">
          <div className="setup-copy"><span className="marketing-eyebrow">FROM FIRST STEP TO FIRST ORDER</span><h2>Up and running,<br /><em>without the busywork.</em></h2><p>Start with the essentials. Your restaurant workspace grows with your team and your guests.</p><a href="/signup" className="setup-link">Create your workspace <span aria-hidden="true">→</span></a></div>
          <div className="setup-steps">{steps.map((step) => <article className="setup-step" key={step.number}><span>{step.number}</span><div><h3>{step.title}</h3><p>{step.detail}</p></div><b aria-hidden="true">↗</b></article>)}</div>
        </section>

        <section className="marketing-cta"><div><span className="marketing-eyebrow">YOUR RESTAURANT, READY FOR WHAT'S NEXT</span><h2>Let's bring your restaurant online.</h2><p>Create your workspace and start shaping a guest experience that feels like yours.</p></div><a href="/signup">Get started <span aria-hidden="true">→</span></a></section>

        <footer className="marketing-footer"><a className="brand" href="/">tablecraft<span>.</span></a><span>Restaurant commerce, made simple.</span><div><a href="/login">Sign in</a><a href="mailto:hello@tablecraft.example">Contact</a></div><small>© 2026 Tablecraft</small></footer>
      </div>
    </main>
  );
}
