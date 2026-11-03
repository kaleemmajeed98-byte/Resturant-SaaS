"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const supabase = getSupabase();
    if (!supabase) { setError("Add your Supabase project URL and publishable key to .env.local first."); setBusy(false); return; }
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) { setError(authError.message); setBusy(false); return; }
    router.replace("/admin"); router.refresh();
  }

  return <main className="auth-page"><Link className="order-brand" href="/">tablecraft<span>.</span></Link><section className="auth-card"><span className="checkout-eyebrow">WELCOME BACK</span><h1>Good to see you.</h1><p>Sign in to your restaurant workspace.</p><form onSubmit={submit} className="checkout-form"><label>Email<input type="email" required autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label>Password<input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} /></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="checkout-button" disabled={busy}>{busy?"Signing in…":"Sign in"}<span>→</span></button></form><div className="auth-foot">New to Tablecraft? <Link href="/signup">Create an account</Link></div></section></main>;
}
