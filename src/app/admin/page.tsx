"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { menuItemInputSchema, nextOrderStatus } from "@/lib/admin";
import { getSupabase } from "@/lib/supabase";

type Restaurant={id:string;name:string;slug:string};
type Branch={id:string;name:string;slug:string;restaurant_id:string};
type Category={id:string;name:string;sort_order:number};
type MenuItem={id:string;name:string;description:string;price:number;category_id:string|null;is_available:boolean;is_published:boolean};
type Order={id:string;order_number:number;status:string;order_type:string;customer_name:string|null;customer_phone:string|null;total:number;created_at:string};
type Summary={orders_today:number;gross_sales_today:number;pending_orders:number;completed_orders_today:number};
type Tab="overview"|"orders"|"menu";

const statusNames:Record<string,string>={placed:"New",accepted:"Accepted",preparing:"Preparing",ready:"Ready",out_for_delivery:"On the way",completed:"Completed",cancelled:"Cancelled"};
function money(value:number,currency="PKR"){try{return new Intl.NumberFormat("en-PK",{style:"currency",currency}).format(value)}catch{return `${currency} ${Number(value).toFixed(2)}`}}

export default function AdminPage(){
  const router=useRouter();
  const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const [email,setEmail]=useState("");const [restaurant,setRestaurant]=useState<Restaurant|null>(null);const [branch,setBranch]=useState<Branch|null>(null);
  const [tab,setTab]=useState<Tab>("overview");const [orders,setOrders]=useState<Order[]>([]);const [summary,setSummary]=useState<Summary>({orders_today:0,gross_sales_today:0,pending_orders:0,completed_orders_today:0});
  const [categories,setCategories]=useState<Category[]>([]);const [items,setItems]=useState<MenuItem[]>([]);const [categoryName,setCategoryName]=useState("");
  const [dish,setDish]=useState({name:"",description:"",price:"",categoryId:""});const [saving,setSaving]=useState(false);
  const supabase=getSupabase();

  const loadData=useCallback(async(userId:string)=>{
    if(!supabase)return;
    setError("");
    const memberships=await supabase.from("restaurant_memberships").select("restaurant_id,branch_id").eq("user_id",userId).eq("is_active",true);
    if(memberships.error){setError(memberships.error.message);return;}
    const ids=[...new Set((memberships.data??[]).map((m)=>m.restaurant_id))];
    if(ids.length===0){setRestaurant(null);setBranch(null);return;}
    const restaurants=await supabase.from("restaurants").select("id,name,slug").in("id",ids).eq("is_active",true);
    if(restaurants.error){setError(restaurants.error.message);return;}
    const chosen=restaurants.data?.[0] as Restaurant|undefined;
    if(!chosen){setRestaurant(null);setBranch(null);return;}
    setRestaurant(chosen);
    const membership=memberships.data?.find((m)=>m.restaurant_id===chosen.id);
    const branchQuery=supabase.from("branches").select("id,name,slug,restaurant_id").eq("restaurant_id",chosen.id).eq("is_active",true);
    const branchResult=membership?.branch_id?await branchQuery.eq("id",membership.branch_id).limit(1):await branchQuery.order("name").limit(1);
    if(branchResult.error){setError(branchResult.error.message);return;}
    const selectedBranch=branchResult.data?.[0] as Branch|undefined;
    setBranch(selectedBranch??null);
    if(!selectedBranch)return;
    const [stats,orderResult,categoryResult,itemResult]=await Promise.all([
      supabase.rpc("get_branch_dashboard",{target_branch:selectedBranch.id}),
      supabase.from("orders").select("id,order_number,status,order_type,customer_name,customer_phone,total,created_at").eq("branch_id",selectedBranch.id).order("created_at",{ascending:false}).limit(30),
      supabase.from("menu_categories").select("id,name,sort_order").eq("branch_id",selectedBranch.id).order("sort_order").order("name"),
      supabase.from("menu_items").select("id,name,description,price,category_id,is_available,is_published").eq("branch_id",selectedBranch.id).order("sort_order").order("name"),
    ]);
    if(stats.error){setError(stats.error.message);return;}
    if(orderResult.error||categoryResult.error||itemResult.error){setError(orderResult.error?.message??categoryResult.error?.message??itemResult.error?.message??"Could not load your workspace.");return;}
    setSummary(stats.data as Summary);setOrders((orderResult.data??[]) as Order[]);setCategories((categoryResult.data??[]) as Category[]);setItems((itemResult.data??[]) as MenuItem[]);
  },[supabase]);

  useEffect(()=>{
    if(!supabase){setError("Configure your Supabase project URL and publishable key in .env.local.");setReady(true);return;}
    let userId="";
    supabase.auth.getSession().then(({data})=>{if(!data.session){router.replace("/login");return;}userId=data.session.user.id;setEmail(data.session.user.email??"");void loadData(userId).finally(()=>setReady(true));});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{if(!session)router.replace("/login");else {userId=session.user.id;setEmail(session.user.email??"");void loadData(userId);}});
    return()=>subscription.unsubscribe();
  },[supabase,router,loadData]);

  const pending=useMemo(()=>orders.filter((order)=>["placed","accepted","preparing"].includes(order.status)),[orders]);
  async function changeStatus(order:Order){
    if(!supabase)return;const next=nextOrderStatus(order.status,order.order_type);
    if(!next)return;setBusy(true);setError("");const {error:rpcError}=await supabase.rpc("transition_order_status",{target_order:order.id,next_status:next});
    if(rpcError)setError(rpcError.message);else if(email)await loadData((await supabase.auth.getUser()).data.user?.id??"");setBusy(false);
  }

  async function addCategory(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase||!restaurant||!branch)return;setSaving(true);setError("");const name=categoryName.trim();if(name.length<1||name.length>80){setError("Category name must be 1 to 80 characters.");setSaving(false);return;}const {error:insertError}=await supabase.from("menu_categories").insert({restaurant_id:restaurant.id,branch_id:branch.id,name,sort_order:categories.length});if(insertError)setError(insertError.message);else{setCategoryName("");await loadData((await supabase.auth.getUser()).data.user?.id??"");}setSaving(false);}

  async function addDish(event:React.FormEvent<HTMLFormElement>){event.preventDefault();if(!supabase||!restaurant||!branch)return;const checked=menuItemInputSchema.safeParse({name:dish.name,description:dish.description,price:dish.price,categoryId:dish.categoryId||null});if(!checked.success){setError(checked.error.issues[0]?.message??"Check the dish details.");return;}setSaving(true);setError("");const {error:insertError}=await supabase.from("menu_items").insert({restaurant_id:restaurant.id,branch_id:branch.id,category_id:checked.data.categoryId,name:checked.data.name,description:checked.data.description,price:checked.data.price,is_available:true,is_published:true});if(insertError)setError(insertError.message);else{setDish({name:"",description:"",price:"",categoryId:""});await loadData((await supabase.auth.getUser()).data.user?.id??"");}setSaving(false);}

  async function toggleItem(item:MenuItem){if(!supabase||!email)return;const {error:updateError}=await supabase.from("menu_items").update({is_available:!item.is_available}).eq("id",item.id).eq("branch_id",branch?.id);if(updateError)setError(updateError.message);else await loadData((await supabase.auth.getUser()).data.user?.id??"");}
  async function signOut(){await supabase?.auth.signOut();router.replace("/");}

  if(!ready)return <main className="admin-loading">Opening your workspace…</main>;
  if(!supabase||error.startsWith("Configure your Supabase"))return <main className="admin-empty"><Link className="order-brand" href="/">tablecraft<span>.</span></Link><h1>Connect your Supabase project</h1><p>{error}</p></main>;
  if(!restaurant)return <main className="admin-empty"><Link className="order-brand" href="/">tablecraft<span>.</span></Link><div className="admin-empty-icon">✳</div><h1>Your workspace starts here.</h1><p>Create your restaurant space, add your first menu items, and you’ll be ready to take orders.</p><Link className="admin-primary" href="/onboarding">Set up your restaurant <span>→</span></Link><button className="text-button" onClick={signOut}>Sign out</button></main>;

  return <main className="admin-shell"><aside className="admin-sidebar"><Link className="order-brand" href="/">tablecraft<span>.</span></Link><div className="workspace-label">YOUR WORKSPACE</div><div className="workspace-restaurant"><div className="restaurant-avatar">{restaurant.name.slice(0,1).toUpperCase()}</div><div><strong>{restaurant.name}</strong><span>{branch?.name??"Loading branch"}</span></div><span className="workspace-chevron">⌄</span></div><div className="side-label">OPERATIONS</div><nav className="side-nav"><button className={tab==="overview"?"selected":""} onClick={()=>setTab("overview")}><span>◫</span> Overview</button><button className={tab==="orders"?"selected":""} onClick={()=>setTab("orders")}><span>▤</span> Orders{pending.length>0&&<b>{pending.length}</b>}</button><button className={tab==="menu"?"selected":""} onClick={()=>setTab("menu")}><span>☷</span> Menu</button></nav><div className="sidebar-bottom"><div className="help-card"><span>✦</span><strong>Need a hand?</strong><p>We’re here to help your restaurant thrive.</p><a href="mailto:hello@tablecraft.example">Contact support →</a></div><button className="profile-button" onClick={signOut}><span className="profile-avatar">{email.slice(0,1).toUpperCase()}</span><span><strong>{email}</strong><small>Sign out</small></span><span className="profile-dots">···</span></button></div></aside>
    <section className="admin-main"><header className="admin-topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{tab[0].toUpperCase()+tab.slice(1)}</strong></div><div className="admin-top-actions"><span className="live-status">STAFF WORKSPACE</span><Link href={`/order/${restaurant.slug}`} target="_blank" className="view-store">View storefront <span>↗</span></Link></div></header>
      <div className="admin-content">{error&&!error.startsWith("Configure")&&<div className="admin-error" role="alert">{error}<button onClick={()=>setError("")}>×</button></div>}
      {tab==="overview"&&<><div className="admin-heading"><div><span className="admin-eyebrow">HERE’S YOUR DAY</span><h1>Good day, {restaurant.name}.</h1><p>Here’s what’s happening at {branch?.name??"your branch"}.</p></div><button className="refresh-button" onClick={async()=>loadData((await supabase.auth.getUser()).data.user?.id??"")}>↻ <span>Refresh</span></button></div><div className="stats-grid"><article className="stat-card"><span>ORDERS TODAY</span><strong>{summary.orders_today}</strong><small><i className="stat-icon peach">▤</i> All orders placed today</small></article><article className="stat-card"><span>GROSS SALES TODAY</span><strong>{money(Number(summary.gross_sales_today))}</strong><small><i className="stat-icon green">↗</i> Excludes cancelled orders</small></article><article className="stat-card"><span>NEEDS ATTENTION</span><strong>{summary.pending_orders}</strong><small><i className="stat-icon amber">◷</i> Orders in progress</small></article><article className="stat-card"><span>COMPLETED TODAY</span><strong>{summary.completed_orders_today}</strong><small><i className="stat-icon blue">✓</i> Ready and served</small></article></div><div className="admin-panel"><div className="panel-title"><div><h2>Recent orders</h2><p>Your latest guest orders at this branch.</p></div><button className="panel-link" onClick={()=>setTab("orders")}>All orders <span>→</span></button></div><OrderTable orders={orders.slice(0,6)} busy={busy} onAdvance={changeStatus}/></div><div className="dashboard-lower"><div className="tip-card"><div className="tip-icon">✳</div><div><span>YOUR RESTAURANT LINK</span><p>Share your storefront directly with your guests.</p><Link href={`/order/${restaurant.slug}`} target="_blank">tablecraft.local/order/{restaurant.slug} ↗</Link></div></div><div className="tip-card menu-tip"><div className="tip-icon">☷</div><div><span>KEEP YOUR MENU FRESH</span><p>Mark dishes unavailable as soon as you run out.</p><button onClick={()=>setTab("menu")}>Manage menu →</button></div></div></div></>}
      {tab==="orders"&&<><div className="admin-heading"><div><span className="admin-eyebrow">THE PASS</span><h1>Orders</h1><p>See what’s coming in and keep every order moving.</p></div><button className="refresh-button" onClick={async()=>loadData((await supabase.auth.getUser()).data.user?.id??"")}>↻ <span>Refresh</span></button></div><div className="admin-panel"><div className="panel-title"><div><h2>Latest orders</h2><p>New orders appear at the top.</p></div><span className="orders-live"><i/> Live data</span></div><OrderTable orders={orders} busy={busy} onAdvance={changeStatus}/></div></>}
      {tab==="menu"&&<><div className="admin-heading"><div><span className="admin-eyebrow">WHAT’S COOKING</span><h1>Your menu</h1><p>Keep dishes current and let guests know what’s available.</p></div><Link className="view-store" href={`/order/${restaurant.slug}`} target="_blank">Preview storefront <span>↗</span></Link></div><div className="menu-admin-grid"><section className="admin-panel"><div className="panel-title"><div><h2>Menu items</h2><p>{items.length} items in this branch.</p></div></div><div className="admin-menu-list">{items.map((item)=><article key={item.id} className="admin-menu-row"><div className="admin-menu-thumb">{item.name.slice(0,1)}</div><div className="admin-menu-name"><strong>{item.name}</strong><span>{item.description||"No description"}</span></div><b className="admin-menu-price">{money(Number(item.price))}</b><button className={item.is_available?"availability available":"availability unavailable"} onClick={()=>toggleItem(item)}>{item.is_available?"Available":"Sold out"}</button></article>)}{items.length===0&&<div className="admin-no-data">No dishes yet. Add the first one to start your menu.</div>}</div></section><aside className="admin-panel menu-create"><div className="panel-title"><div><h2>Add a dish</h2><p>New items are published to your storefront.</p></div></div><form className="checkout-form" onSubmit={addDish}><label>Dish name<input required maxLength={160} value={dish.name} onChange={(e)=>setDish({...dish,name:e.target.value})} placeholder="e.g. House burger" /></label><label>Description<textarea maxLength={1200} value={dish.description} onChange={(e)=>setDish({...dish,description:e.target.value})} placeholder="A little about the dish" /></label><label>Price (PKR)<input required type="number" min="0" max="1000000" step="0.01" value={dish.price} onChange={(e)=>setDish({...dish,price:e.target.value})} placeholder="0.00" /></label><label>Category<select value={dish.categoryId} onChange={(e)=>setDish({...dish,categoryId:e.target.value})}><option value="">No category</option>{categories.map((category)=><option value={category.id} key={category.id}>{category.name}</option>)}</select></label><button className="admin-primary" disabled={saving}>Add to menu <span>→</span></button></form><form className="category-create" onSubmit={addCategory}><label>New category<input maxLength={80} value={categoryName} onChange={(e)=>setCategoryName(e.target.value)} placeholder="e.g. Sides" /></label><button className="category-add" disabled={saving||!categoryName.trim()}>+ Add</button></form></aside></div></>}
      </div>
    </section>
  </main>;
}

function OrderTable({orders,busy,onAdvance}:{orders:Order[];busy:boolean;onAdvance:(order:Order)=>void}){
  if(!orders.length)return <div className="admin-no-data"><div className="admin-empty-icon">⌑</div><strong>No orders yet</strong><p>Guest orders will show here as soon as they come in.</p></div>;
  return <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>ORDER</th><th>GUEST</th><th>TYPE</th><th>PLACED</th><th>TOTAL</th><th>STATUS</th><th/></tr></thead><tbody>{orders.map((order)=><tr key={order.id}><td className="order-num">#{order.order_number}</td><td><strong>{order.customer_name||"Guest"}</strong><small>{order.customer_phone||""}</small></td><td><span className="order-type">{order.order_type.replaceAll("_"," ")}</span></td><td className="order-time">{new Date(order.created_at).toLocaleTimeString("en-PK",{hour:"numeric",minute:"2-digit"})}</td><td className="order-total">{money(Number(order.total))}</td><td><span className={`status-badge status-${order.status}`}>{statusNames[order.status]??order.status}</span></td><td>{["placed","accepted","preparing","ready","out_for_delivery"].includes(order.status)&&<button className="advance-order" disabled={busy} onClick={()=>onAdvance(order)}>{order.status==="placed"?"Accept":order.status==="preparing"?"Ready":order.status==="ready"&&order.order_type!=="delivery"?"Complete":"Next →"}</button>}</td></tr>)}</tbody></table></div>;
}
