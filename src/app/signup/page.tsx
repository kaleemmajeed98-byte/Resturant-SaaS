"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const supabase = getSupabase();
    if (!supabase) { setError("Add your Supabase project URL and publishable key to .env.local first."); setBusy(false); return; }
    const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: fullName.trim() } } });
    if (authError) { setError(authError.message); setBusy(false); return; }
    if (data.session) { router.replace("/onboarding"); return; }
    setMessage("Check your email to confirm your account, then sign in to set up your restaurant."); setBusy(false);
  }

  return <main className="auth-page"><Link className="order-brand" href="/">tablecraft<span>.</span></Link><section className="auth-card"><span className="checkout-eyebrow">YOUR RESTAURANT, YOUR WAY</span><h1>Let’s get you set up.</h1><p>Create an owner account to start your restaurant workspace.</p><form onSubmit={submit} className="checkout-form"><label>Your name<input required minLength={2} maxLength={120} autoComplete="name" value={fullName} onChange={(e)=>setFullName(e.target.value)} /></label><label>Email<input type="email" required autoComplete="email" value={email} onChange={(e)=>setEmail(e.target.value)} /></label><label>Password<input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e)=>setPassword(e.target.value)} /><small className="field-hint">At least 8 characters. Supabase sends confirmation if enabled in Auth settings.</small></label>{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="success-copy" role="status">{message}</p>}<button className="checkout-button" disabled={busy}>{busy?"Creating account…":"Create account"}<span>→</span></button></form><div className="auth-foot">Already have a workspace? <Link href="/login">Sign in</Link></div></section></main>;
}
