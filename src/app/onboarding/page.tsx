"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { restaurantSetupSchema, slugFromName } from "@/lib/admin";
import { getSupabase } from "@/lib/supabase";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [branchName, setBranchName] = useState("Main branch");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) { setError("Configure Supabase in .env.local before setting up a restaurant."); setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const validated = restaurantSetupSchema.safeParse({ name, slug, branchName });
    if (!validated.success) { setError(validated.error.issues[0]?.message ?? "Check the restaurant details."); return; }
    const supabase = getSupabase();
    if (!supabase) { setError("Supabase is not configured."); return; }
    setBusy(true);
    const { error: createError } = await supabase.rpc("create_restaurant_with_owner", {
      restaurant_name: validated.data.name,
      restaurant_slug: validated.data.slug,
      first_branch_name: validated.data.branchName,
    });
    if (createError) { setError(createError.message); setBusy(false); return; }
    router.replace("/admin"); router.refresh();
  }

  return <main className="auth-page"><Link className="order-brand" href="/">tablecraft<span>.</span></Link><section className="auth-card"><span className="checkout-eyebrow">FIRST, THE IMPORTANT DETAILS</span><h1>Tell us about your place.</h1><p>Your restaurant and first branch share one workspace. You can add a menu as soon as you’re in.</p><form onSubmit={submit} className="checkout-form"><label>Restaurant name<input required minLength={2} maxLength={120} value={name} onChange={(e)=>{setName(e.target.value);setSlug(slugFromName(e.target.value));}} placeholder="The Corner Kitchen" /></label><label>Your menu link<span className="slug-field"><span>tablecraft.local/</span><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={(e)=>setSlug(e.target.value)} /></span></label><label>First branch name<input required minLength={2} maxLength={120} value={branchName} onChange={(e)=>setBranchName(e.target.value)} /></label>{error&&<p className="form-error" role="alert">{error}</p>}<button className="checkout-button" disabled={busy||!ready}>{busy?"Creating your workspace…":"Create restaurant"}<span>→</span></button></form><div className="auth-foot">Need to sign out? <button onClick={async()=>{await getSupabase()?.auth.signOut();router.replace("/login");}}>Sign out</button></div></section></main>;
}
