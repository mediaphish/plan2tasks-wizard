/* src/App.jsx — Users→Plan wiring fix + everything else intact */
import React, { useEffect, useMemo, useState } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Download, Archive, ArchiveRestore, Trash2, ArrowRight, X, CheckSquare, Square,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Plus, RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

/* -------------------- tiny utils -------------------- */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function parseISODate(s){ if (!s) return null; const d=new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime())?null:d; }
function addDaysSafe(startDateStr, n){ const b=parseISODate(startDateStr)||new Date(); const d=new Date(b); d.setDate(d.getDate()+(Number(n)||0)); return d; }
function fmtDateYMD(d){ const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,"0"); const dd=String(d.getUTCDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
function fmtDayLabel(startDateStr, off){ try{ return format(addDaysSafe(startDateStr, off||0), "EEE MMM d"); }catch{return"";} }
function daysBetweenUTC(a,b){ const ms=86400000; const da=Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()); const db=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()); return Math.round((db-da)/ms); }
function lastDayOfMonthUTC(y,m0){ return new Date(Date.UTC(y,m0+1,0)).getUTCDate(); }
function addMonthsUTC(dateUTC, months){
  const y=dateUTC.getUTCFullYear(), m=dateUTC.getUTCMonth(), d=dateUTC.getUTCDate();
  const nm=m+months, ny=y+Math.floor(nm/12), nmo=((nm%12)+12)%12;
  const last=lastDayOfMonthUTC(ny,nmo), nd=Math.min(d,last);
  return new Date(Date.UTC(ny,nmo,nd));
}
function firstWeekdayOfMonthUTC(y,m0,weekday){ const first=new Date(Date.UTC(y,m0,1)); const shift=(7+weekday-first.getUTCDay())%7; return new Date(Date.UTC(y,m0,1+shift)); }
function nthWeekdayOfMonthUTC(y,m0,weekday,nth){ const first=firstWeekdayOfMonthUTC(y,m0,weekday); const c=new Date(Date.UTC(y,m0, first.getUTCDate()+7*(nth-1))); return c.getUTCMonth()===m0?c:null; }
function lastWeekdayOfMonthUTC(y,m0,weekday){ const lastD=lastDayOfMonthUTC(y,m0); const last=new Date(Date.UTC(y,m0,lastD)); const shift=(7+last.getUTCDay()-weekday)%7; return new Date(Date.UTC(y,m0,lastD-shift)); }
function offsetFromStart(startDateStr, cellDateUTC){
  const s=parseISODate(startDateStr); const sUTC=Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const cUTC=Date.UTC(cellDateUTC.getUTCFullYear(), cellDateUTC.getUTCMonth(), cellDateUTC.getUTCDate());
  return Math.round((cUTC - sUTC)/86400000);
}
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];

/* -------------------- ErrorBoundary -------------------- */
class ErrorBoundary extends React.Component{
  constructor(p){ super(p); this.state={error:null}; }
  static getDerivedStateFromError(e){ return {error:e}; }
  componentDidCatch(e, info){ console.error("UI crash:", e, info); }
  render(){
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-red-50 p-6">
          <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-4">
            <div className="text-red-700 font-bold mb-2">Something went wrong in the UI</div>
            <pre className="bg-red-100 p-3 text-xs text-red-900 overflow-auto rounded">{String(this.state.error?.message || this.state.error)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* -------------------- Auth -------------------- */
function AuthScreen({ onSignedIn }){
  const [mode,setMode]=useState("signin");
  const [email,setEmail]=useState(""); const [pw,setPw]=useState(""); const [msg,setMsg]=useState("");
  async function handleSignup(){ setMsg("Creating account...");
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pw });
    if (error) return setMsg("Error: "+error.message);
    if (!data.session) { setMsg("Check your email to confirm, then sign in."); return; }
    onSignedIn(data.session);
  }
  async function handleSignin(){ setMsg("Signing in...");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pw });
    if (error) return setMsg("Error: "+error.message);
    onSignedIn(data.session);
  }
  async function handleGoogle(){ setMsg("Redirecting…");
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin }});
    if (error) setMsg("Error: "+error.message);
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-1">Plan2Tasks – Planner</h1>
        <p className="text-sm text-gray-500 mb-4">Sign in to manage users and deliver task lists.</p>

        <button onClick={handleGoogle}
          className="w-full mb-4 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
          <img alt="" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-4 w-4" />
          Continue with Google
        </button>
        <div className="my-3 text-center text-xs text-gray-400">or</div>

        <label className="block mb-2 text-sm font-medium">Email</label>
        <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <label className="block mb-2 text-sm font-medium">Password</label>
        <input value={pw} onChange={(e)=>setPw(e.target.value)} type="password"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {mode==="signup" ? (
          <button onClick={handleSignup} className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Create account</button>
        ) : (
          <button onClick={handleSignin} className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Sign in</button>
        )}
        <div className="mt-3 text-xs text-gray-600">{msg}</div>
        <div className="mt-4 text-xs">
          {mode==="signup" ? (
            <span>Already have an account? <button className="text-cyan-700 underline" onClick={()=>setMode("signin")}>Sign in</button></span>
          ) : (
            <span>New here? <button className="text-cyan-700 underline" onClick={()=>setMode("signup")}>Create an account</button></span>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Root -------------------- */
export default function App(){
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner(){
  const [session,setSession]=useState(null);
  useEffect(()=>{ supabaseClient.auth.getSession().then(({data})=>setSession(data.session||null));
    const { data:{ subscription } } = supabaseClient.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=>subscription?.unsubscribe();
  },[]);
  if (!session) return <AuthScreen onSignedIn={(s)=>setSession(s)} />;
  const plannerEmail = session.user?.email || "";
  return <AppShell plannerEmail={plannerEmail} />;
}

/* -------------------- Shell -------------------- */
function AppShell({ plannerEmail }){
  const [prefs, setPrefs] = useState({
    default_view: "users",
    auto_archive_after_assign: true,
    default_timezone: "America/Chicago",
    default_push_mode: "append",
    show_inbox_badge: true,
    open_drawer_on_import: false
  });
  const [view,setView]=useState("users"); // users | plan | settings
  const [inboxOpen,setInboxOpen]=useState(false);
  const [inboxBadge,setInboxBadge]=useState(0);
  const [selectedUserEmail, setSelectedUserEmail] = useState(""); // << NEW: owned here

  // Load prefs & decide default view
  useEffect(()=>{
    (async ()=>{
      try{
        const qs=new URLSearchParams({ plannerEmail });
        const r=await fetch(`/api/prefs/get?${qs.toString()}`);
        if (r.ok){ const j=await r.json(); setPrefs(j.prefs || j); setView((j.prefs?.default_view)||"users"); }
      }catch{}
    })();
  },[plannerEmail]);

  // Fetch inbox badge (count New)
  async function loadBadge(){
    try{
      const qs=new URLSearchParams({ plannerEmail, status:"new" });
      const r=await fetch(`/api/inbox?${qs.toString()}`);
      const j=await r.json();
      setInboxBadge((j.bundles||[]).length);
    }catch{}
  }
  useEffect(()=>{ if (prefs.show_inbox_badge) loadBadge(); },[plannerEmail, prefs.show_inbox_badge]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-bold">Plan2Tasks</div>
            <nav className="ml-4 flex gap-2">
              <NavBtn active={view==="users"} onClick={()=>setView("users")} icon={<Users className="h-4 w-4" />}>Users</NavBtn>
              <NavBtn active={view==="plan"} onClick={()=>setView("plan")} icon={<Calendar className="h-4 w-4" />}>Plan</NavBtn>
              <NavBtn active={view==="settings"} onClick={()=>setView("settings")} icon={<SettingsIcon className="h-4 w-4" />}>Settings</NavBtn>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={()=>setInboxOpen(true)}
              className="relative rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
              title="Inbox (GPT imports)"
            >
              <InboxIcon className="inline h-4 w-4 mr-1" />
              Inbox
              {prefs.show_inbox_badge && inboxBadge>0 && (
                <span className="absolute -top-2 -right-2 rounded-full bg-cyan-600 px-2 py-[2px] text-[10px] font-bold text-white">
                  {inboxBadge}
                </span>
              )}
            </button>
            <span className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm">Signed in: <b>{plannerEmail}</b></span>
            <button onClick={()=>supabaseClient.auth.signOut()} className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">Sign out</button>
          </div>
        </div>

        {view==="users" && (
          <UsersView
            plannerEmail={plannerEmail}
            onManage={(email)=>{ setSelectedUserEmail(email); setView("plan"); }} // << switch view + set user
          />
        )}

        {view==="plan" && (
          <PlanView
            plannerEmail={plannerEmail}
            selectedUserEmail={selectedUserEmail}
            setSelectedUserEmail={setSelectedUserEmail}
          />
        )}

        {view==="settings" && <SettingsView plannerEmail={plannerEmail} prefs={prefs} onChange={setPrefs} />}

        {inboxOpen && (
          <InboxDrawer
            plannerEmail={plannerEmail}
            autoArchive={!!prefs.auto_archive_after_assign}
            onClose={async()=>{ setInboxOpen(false); await loadBadge(); }}
          />
        )}
      </div>
    </div>
  );
}
function NavBtn({ active, onClick, icon, children }){
  return (
    <button onClick={onClick}
      className={cn("rounded-xl px-3 py-2 text-sm font-semibold", active?"bg-cyan-600 text-white":"bg-white border border-gray-300 hover:bg-gray-50")}>
      <span className="inline-flex items-center gap-1">{icon}{children}</span>
    </button>
  );
}

/* -------------------- Inbox Drawer (unchanged) -------------------- */
function InboxDrawer({ plannerEmail, autoArchive, onClose }){
  const [tab,setTab]=useState("new"); // new|assigned|archived
  const [rows,setRows]=useState([]);
  const [users,setUsers]=useState([]);
  const [assignTo,setAssignTo]=useState("");
  const [sel,setSel]=useState(new Set());
  const [confirm,setConfirm]=useState(null);

  useEffect(()=>{ (async ()=>{
    const qs = new URLSearchParams({ op:"list", plannerEmail, status:"all" });
    const r = await fetch(`/api/users?${qs.toString()}`); const j = await r.json();
    setUsers(j.users || []);
  })(); },[plannerEmail]);

  async function load(){
    const qs=new URLSearchParams({ plannerEmail, status: tab });
    const r=await fetch(`/api/inbox?${qs.toString()}`); const j=await r.json();
    setRows(j.bundles||[]); setSel(new Set());
  }
  useEffect(()=>{ load(); },[plannerEmail, tab]);

  function toggle(id){ const n=new Set(sel); n.has(id)?n.delete(id):n.add(id); setSel(n); }
  function setAll(on){ setSel(on? new Set(rows.map(r=>r.id)) : new Set()); }

  async function doAction(action, ids){
    const ep = action==="archive" ? "/api/inbox/archive" : action==="restore" ? "/api/inbox/restore" : "/api/inbox/delete";
    await fetch(ep, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, bundleIds: ids })
    });
    await load();
  }
  async function assignRow(row){
    if (!assignTo) return alert("Choose a user first.");
    const r = await fetch("/api/inbox/assign", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, inboxId: row.id, userEmail: assignTo })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error||"Assign failed");
    if (autoArchive) await doAction("archive", [row.id]); else await load();
    alert(`Assigned "${row.title}" to ${assignTo}. Open Plan to deliver.`);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white border-l border-gray-200 shadow-xl p-5 overflow-y-auto">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Inbox (GPT imports)</div>
            <div className="text-xs text-gray-500">Auto-archive after Assign: <b>{autoArchive ? "On" : "Off"}</b> · <a href="#" onClick={(e)=>{e.preventDefault(); alert("Change this in Settings.");}} className="underline">Change in Settings</a></div>
          </div>
          <button onClick={onClose} className="rounded-xl border px-3 py-2 text-sm"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          {["new","assigned","archived"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn("rounded-xl px-3 py-2 text-xs font-semibold", tab===t?"bg-cyan-600 text-white":"bg-white border border-gray-300")}>
              {t==="new"?"New":t==="assigned"?"Assigned":"Archived"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span>Assign to</span>
            <select value={assignTo} onChange={(e)=>setAssignTo(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1">
              <option value="">—</option>
              {users.map(u=><option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓":""}</option>)}
            </select>
          </div>
        </div>

        {/* bulk bar */}
        <div className="mb-2 flex items-center justify-between text-xs">
          <button onClick={()=>setAll(sel.size!==rows.length)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
            {sel.size===rows.length && rows.length>0 ? <CheckSquare className="h-3 w-3"/> : <Square className="h-3 w-3" />} Select all
          </button>
          <div className="flex items-center gap-2">
            {tab!=="archived" && (
              <button onClick={()=>setConfirm({action:"archive", ids:Array.from(sel), text:`Archive ${sel.size} bundle(s)?`})}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><Archive className="h-3 w-3"/> Archive</button>
            )}
            {tab==="archived" && (
              <button onClick={()=>setConfirm({action:"restore", ids:Array.from(sel), text:`Restore ${sel.size} bundle(s)?`})}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><ArchiveRestore className="h-3 w-3"/> Restore</button>
            )}
            <button onClick={()=>setConfirm({action:"delete", ids:Array.from(sel), text:`Permanently delete ${sel.size} bundle(s)? This cannot be undone.`})}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1"><Trash2 className="h-3 w-3"/> Delete…</button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="py-2 px-2"></th>
                <th className="py-2 px-2">Title</th>
                <th className="py-2 px-2">Items</th>
                <th className="py-2 px-2">Start</th>
                <th className="py-2 px-2">Status</th>
                <th className="py-2 px-2">Assigned to</th>
                <th className="py-2 px-2">Created</th>
                <th className="py-2 px-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r=>(
                <tr key={r.id} className="border-t">
                  <td className="py-2 px-2"><input type="checkbox" checked={sel.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                  <td className="py-2 px-2">{r.title}</td>
                  <td className="py-2 px-2">{r.count}</td>
                  <td className="py-2 px-2">{r.start_date}</td>
                  <td className="py-2 px-2">{r.archived_at? "Archived" : r.assigned_user ? "Assigned" : "New"}</td>
                  <td className="py-2 px-2">{r.assigned_user || "—"}</td>
                  <td className="py-2 px-2">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 px-2">
                    <div className="flex justify-end gap-2">
                      {tab!=="archived" && (
                        <button onClick={()=>assignRow(r)} className="rounded-lg bg-cyan-600 px-2 py-1 text-white">Assign</button>
                      )}
                      {tab!=="archived" ? (
                        <button onClick={()=>setConfirm({action:"archive", ids:[r.id], text:`Archive “${r.title}”?`})} className="rounded-lg border px-2 py-1">Archive</button>
                      ) : (
                        <button onClick={()=>setConfirm({action:"restore", ids:[r.id], text:`Restore “${r.title}”?`})} className="rounded-lg border px-2 py-1">Restore</button>
                      )}
                      <button onClick={()=>setConfirm({action:"delete", ids:[r.id], text:`Permanently delete “${r.title}”? This cannot be undone.`})}
                        className="rounded-lg border border-red-300 text-red-700 px-2 py-1">Delete…</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length===0 && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-500">No bundles on this tab.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* confirm modal */}
        {confirm && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0" />
            <div className="fixed inset-0 flex items-center justify-center">
              <div className="absolute inset-0 bg-black/40" onClick={()=>setConfirm(null)} />
              <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
                <div className="mb-2 text-sm font-semibold">Please confirm</div>
                <div className="mb-3 text-xs text-gray-700 whitespace-pre-wrap">{confirm.text}</div>
                <div className="flex justify-end gap-2">
                  <button onClick={()=>setConfirm(null)} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
                  <button
                    onClick={async ()=>{ const {action,ids}=confirm; setConfirm(null); await doAction(action, ids); }}
                    className={cn("rounded-lg px-3 py-1.5 text-xs text-white", confirm.action==="delete"?"bg-red-600":"bg-cyan-600")}>
                    {confirm.action==="delete"?"Delete":confirm.action==="archive"?"Archive":"Restore"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* -------------------- Users (table) -------------------- */
function UsersView({ plannerEmail, onManage = () => {} }){
  const [status,setStatus]=useState("all");
  const [q,setQ]=useState("");
  const [rows,setRows]=useState([]);
  const [addEmail,setAddEmail]=useState("");
  const [msg,setMsg]=useState("");

  async function load(){
    const qs=new URLSearchParams({ op:"list", plannerEmail, status, q });
    const r=await fetch(`/api/users?${qs.toString()}`);
    const j=await r.json(); setRows(j.users||[]);
  }
  useEffect(()=>{ load(); },[plannerEmail, status, q]);

  async function addUser(){
    setMsg("Creating invite…");
    const r=await fetch("/api/invite", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: addEmail.trim() })
    });
    const j=await r.json();
    if (!r.ok) return setMsg(j.error||"Invite failed");
    setMsg(j.emailed ? "Invite created & emailed." : "Invite created. Email not configured.");
    setAddEmail(""); await load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Users</div>
          <div className="text-xs text-gray-500">Add users and manage their task lists.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-gray-300 bg-white">
            {["all","invited","connected"].map(s=>(
              <button key={s} onClick={()=>setStatus(s)}
                className={cn("px-3 py-2 text-xs", status===s?"bg-cyan-600 text-white":"")}>
                {s[0].toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search users…" className="px-2 py-1 text-sm outline-none" />
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input value={addEmail} onChange={(e)=>setAddEmail(e.target.value)} type="email" placeholder="user@example.com"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={addUser} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Add user</button>
      </div>
      <div className="mb-3 text-xs text-gray-600">{msg}</div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="py-2 px-2">Email</th>
              <th className="py-2 px-2">Status</th>
              <th className="py-2 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.email} className="border-t">
                <td className="py-2 px-2">{r.email}</td>
                <td className="py-2 px-2">{r.status==="connected"?"✓ connected":"invited"}</td>
                <td className="py-2 px-2">
                  <div className="flex justify-end">
                    <button
                      onClick={(e)=>{ e.preventDefault(); onManage(r.email); }} // << call up into shell
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2 py-1 text-white"
                    >
                      Manage user <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length===0 && (
              <tr><td className="py-6 text-center text-gray-500" colSpan={3}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* -------------------- Settings -------------------- */
function SettingsView({ plannerEmail, prefs, onChange }){
  const [local, setLocal] = useState(prefs);
  useEffect(()=>{ setLocal(prefs); },[prefs]);

  async function save(){
    const r=await fetch("/api/prefs/set", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, prefs: local })
    });
    const j=await r.json();
    if (!r.ok) return alert(j.error||"Save failed");
    onChange(j.prefs || local);
    alert("Preferences saved.");
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-lg font-semibold">Settings</div>
        <div className="text-xs text-gray-500">Personalize defaults and Inbox behavior.</div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border p-4">
          <div className="text-sm font-semibold mb-2">Preferences</div>
          <label className="block mb-2 text-sm">Default landing view</label>
          <select value={local.default_view} onChange={(e)=>setLocal({...local, default_view:e.target.value})}
            className="mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="users">Users</option>
            <option value="plan">Plan</option>
          </select>

          <label className="block mb-2 text-sm">Default timezone</label>
          <select value={local.default_timezone} onChange={(e)=>setLocal({...local, default_timezone:e.target.value})}
            className="mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz}</option>)}
          </select>

          <label className="block mb-2 text-sm">Default push mode</label>
          <select value={local.default_push_mode} onChange={(e)=>setLocal({...local, default_push_mode:e.target.value})}
            className="mb-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="append">Append</option>
            <option value="replace">Replace</option>
          </select>

          <div className="mb-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={local.auto_archive_after_assign}
                onChange={(e)=>setLocal({...local, auto_archive_after_assign:e.target.checked})} />
              Auto-archive bundles after Assign
            </label>
          </div>

          <button onClick={save} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white">Save preferences</button>
        </div>

        <div className="rounded-xl border p-4">
          <div className="text-sm font-semibold mb-2">Inbox</div>
          <div className="mb-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={local.show_inbox_badge} onChange={(e)=>setLocal({...local, show_inbox_badge:e.target.checked})} />
              Show Inbox badge
            </label>
          </div>
          <div className="mb-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={local.open_drawer_on_import} onChange={(e)=>setLocal({...local, open_drawer_on_import:e.target.checked})} />
              Open Inbox drawer when a new bundle arrives
            </label>
          </div>
          <button onClick={()=>alert("Open the Inbox via the header icon.")} className="rounded-xl border px-3 py-2 text-sm">Open Inbox</button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Plan (composer + history) -------------------- */

function PlanView({ plannerEmail, selectedUserEmail, setSelectedUserEmail }){
  const [users,setUsers]=useState([]);
  const [plan,setPlan]=useState({
    title: "Weekly Plan",
    startDate: format(new Date(), "yyyy-MM-dd"),
    timezone: "America/Chicago"
  });
  const [tasks,setTasks]=useState([]);
  const [replaceMode,setReplaceMode]=useState(false);
  const [msg,setMsg]=useState("");
  const [prefill, setPrefill] = useState(null);

  // Fetch users & set default selected if not set
  useEffect(()=>{ (async ()=>{
    const qs=new URLSearchParams({ op:"list", plannerEmail, status:"all" });
    const r=await fetch(`/api/users?${qs.toString()}`); const j=await r.json();
    setUsers(j.users||[]);
    if (!selectedUserEmail) {
      const connected=(j.users||[]).find(u=>u.status==="connected")?.email;
      setSelectedUserEmail(connected || (j.users?.[0]?.email || ""));
    }
  })(); },[plannerEmail]);

  // load last prefill if present
  useEffect(()=>{ try{ const raw=localStorage.getItem("p2t_last_prefill"); if (raw){ const p=JSON.parse(raw);
    if (p && p.ok && p.plan && Array.isArray(p.tasks)) setPrefill(p); } }catch{} },[]);
  useEffect(()=>{ if (prefill){ setPlan(prefill.plan); setTasks(prefill.tasks.map(t=>({ id: uid(), ...t }))); } },[prefill]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Plan (create & deliver tasks)</div>
          <div className="text-xs text-gray-500">Title becomes the Google Tasks list name. Add tasks, preview, then push.</div>
        </div>
        <div className="w-72">
          <select value={selectedUserEmail || ""} onChange={(e)=>setSelectedUserEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="">— Choose user —</option>
            {users.map(u=><option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓":""}</option>)}
          </select>
        </div>
      </div>

      <PlanBasics plan={plan} setPlan={setPlan} />
      <DatePickButton startDate={plan.startDate} />
      <TaskEditor startDate={plan.startDate} onAdd={(items)=>setTasks(prev=>[...prev, ...items.map(t=>({ id: uid(), ...t }))])} />

      <ComposerPreview
        plannerEmail={plannerEmail}
        selectedUserEmail={selectedUserEmail}
        plan={plan}
        tasks={tasks}
        setTasks={setTasks}
        replaceMode={replaceMode}
        setReplaceMode={setReplaceMode}
        msg={msg}
        setMsg={setMsg}
      />

      <HistoryPanel plannerEmail={plannerEmail} userEmail={selectedUserEmail} />
    </div>
  );
}

function PlanBasics({ plan, setPlan }){
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
      <label className="block">
        <div className="mb-1 text-sm font-medium">Task list title</div>
        <input value={plan.title} onChange={(e)=>setPlan({...plan, title:e.target.value})}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., Week of Sep 1" />
      </label>
      <label className="block">
        <div className="mb-1 text-sm font-medium">Plan start date</div>
        <input type="date" value={plan.startDate} onChange={(e)=>setPlan({...plan, startDate:e.target.value})}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
      </label>
      <label className="block">
        <div className="mb-1 text-sm font-medium">Timezone</div>
        <select value={plan.timezone} onChange={(e)=>setPlan({...plan, timezone:e.target.value})}
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
          {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz}</option>)}
        </select>
      </label>
    </div>
  );
}

/* ---- Date picker (grid) ---- */
function Modal({ title, children, onClose }){
  useEffect(()=>{ function onEsc(e){ if (e.key==="Escape") onClose?.(); } window.addEventListener("keydown", onEsc); return ()=>window.removeEventListener("keydown", onEsc); },[onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function CalendarGrid({ startDate, valueOffset=0, onPickOffset }){
  const start=parseISODate(startDate)||new Date();
  const [vm,setVm]=useState(()=>new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)));
  const maxDays=180;
  const startUTC=new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC=new Date(startUTC.getTime()+maxDays*86400000);
  const selectedUTC=new Date(startUTC.getTime()+valueOffset*86400000);
  function monthLabel(d){ return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), "MMMM yyyy"); }
  function gotoMonth(delta){ const y=vm.getUTCFullYear(), m=vm.getUTCMonth(); setVm(new Date(Date.UTC(y, m+delta, 1))); }
  const year=vm.getUTCFullYear(), month=vm.getUTCMonth();
  const firstOfMonth=new Date(Date.UTC(year, month, 1));
  const startDow=firstOfMonth.getUTCDay();
  const gridStart=new Date(Date.UTC(year, month, 1-startDow));
  const weeks=Array.from({length:6}).map((_,w)=>Array.from({length:7}).map((_,d)=>{
    const cell=new Date(gridStart); cell.setUTCDate(gridStart.getUTCDate()+(w*7+d));
    const isSameMonth=cell.getUTCMonth()===month;
    const isDisabled=cell<startUTC||cell>endUTC;
    const isSelected=fmtDateYMD(cell)===fmtDateYMD(selectedUTC);
    return {cell,isSameMonth,isDisabled,isSelected,label:String(cell.getUTCDate())};
  }));
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(-12)} title="Prev year"><ChevronsLeft className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(-1)} title="Prev month"><ChevronLeft className="h-3 w-3" /></button>
          <div className="px-2 text-sm font-semibold">{monthLabel(vm)}</div>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(1)} title="Next month"><ChevronRight className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(12)} title="Next year"><ChevronsRight className="h-3 w-3" /></button>
        </div>
        <button className="rounded-lg border px-2 py-1 text-xs"
          onClick={()=>{ setVm(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))); }}>
          Jump to plan start
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row,ri)=>row.map((c,ci)=>(
          <button key={`${ri}-${ci}`} type="button"
            className={cn("h-8 w-8 rounded-full text-xs flex items-center justify-center transition",
              c.isDisabled?"text-gray-300 cursor-not-allowed":c.isSelected?"bg-cyan-600 text-white":"hover:bg-gray-100",
              !c.isSameMonth && !c.isDisabled && !c.isSelected ? "text-gray-400":"text-gray-700")}
            onClick={()=>{ if (c.isDisabled) return; const off=offsetFromStart(startDate, c.cell); onPickOffset?.(off); }}>
            {c.label}
          </button>
        )))}
      </div>
    </div>
  );
}
function DatePickButton({ startDate }){
  const [open,setOpen]=useState(false); const [offset,setOffset]=useState(0);
  const label=fmtDayLabel(startDate, offset);
  return (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
        <Calendar className="h-4 w-4" /> Pick date
      </button>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">Selected: <b>{label}</b></div>
      {open && (
        <Modal title="Choose a date" onClose={()=>setOpen(false)}>
          <CalendarGrid startDate={startDate} valueOffset={offset}
            onPickOffset={(o)=>{ setOffset(o); }} />
        </Modal>
      )}
    </div>
  );
}

/* ---- Task editor with recurrence ---- */
function TaskEditor({ startDate, onAdd }){
  const [title,setTitle]=useState("");
  const [notes,setNotes]=useState("");
  const [baseOffset,setBaseOffset]=useState(0);
  const [time,setTime]=useState("");
  const [dur,setDur]=useState(60);

  const [repeat,setRepeat]=useState("none"); // none|daily|weekly|monthly
  const [interval,setInterval]=useState(1);
  const [endMode,setEndMode]=useState("count"); // count|until|infinite
  const [count,setCount]=useState(4);
  const [untilDate,setUntilDate]=useState("");
  const [horizonMonths,setHorizonMonths]=useState(6);
  const [weeklyDays,setWeeklyDays]=useState([false,true,false,true,false,false,false]);
  const [monthlyMode,setMonthlyMode]=useState("dom");

  function generate(){
    const name=title.trim(); if (!name) return;
    const base=addDaysSafe(startDate, Number(baseOffset)||0);
    const baseObj={ title:name, time: time || undefined, durationMins: (Number(dur)>0?Number(dur):60), notes };
    const added=[];
    const start=parseISODate(startDate);
    function pushIfOnOrAfter(d){ const off=daysBetweenUTC(start,d); if (d>=base) added.push({ ...baseObj, dayOffset: off }); }
    const step=Math.max(1, Number(interval)||1);

    if (repeat==="none"){ pushIfOnOrAfter(base); }
    if (repeat==="daily"){
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1);
        for (let i=0;i<n;i++){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); pushIfOnOrAfter(d); } }
      else if (endMode==="until"){ const until=parseISODate(untilDate); let i=0; while (true){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); if (d>until) break; pushIfOnOrAfter(d); if(++i>1000) break; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let i=0; while (true){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); if (d>end) break; pushIfOnOrAfter(d); if(++i>2000) break; } }
    }
    if (repeat==="weekly"){
      const checked=weeklyDays.map((v,i)=>v?i:null).filter(v=>v!==null);
      if (checked.length===0) { alert("Pick at least one weekday."); return; }
      const baseWeekday=base.getUTCDay(); const baseStartOfWeek=new Date(base); baseStartOfWeek.setUTCDate(base.getUTCDate()-baseWeekday);
      const emitWeek=(weekIndex)=>{ for(const dow of checked){ const d=new Date(baseStartOfWeek); d.setUTCDate(baseStartOfWeek.getUTCDate()+dow+weekIndex*7*step); pushIfOnOrAfter(d); } };
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1); let emitted=0, week=0; while (emitted<n && week<520){ const before=added.length; emitWeek(week); emitted+=(added.length-before); week++; } if (added.length>n) added.length=n; }
      else if (endMode==="until"){ const until=parseISODate(untilDate); let week=0; while (week<520){ const before=added.length; emitWeek(week);
        if (added.length>before){ const last=addDaysSafe(startDate, added[added.length-1].dayOffset||0); if (last>until){ while (added.length && addDaysSafe(startDate, added[added.length-1].dayOffset||0)>until) added.pop(); break; } } week++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let week=0; while (week<520){ emitWeek(week); const last=added.length?addDaysSafe(startDate, added[added.length-1].dayOffset||0):base; if (last>end) break; week++; } }
    }
    if (repeat==="monthly"){
      const by=base.getUTCFullYear(), bm=base.getUTCMonth(), bd=base.getUTCDate(), bw=base.getUTCDay();
      const firstSame=firstWeekdayOfMonthUTC(by,bm,bw);
      const nth=Math.floor((base.getUTCDate()-firstSame.getUTCDate())/7)+1;
      const lastSame=lastWeekdayOfMonthUTC(by,bm,bw);
      const isLast=(base.getUTCDate()===lastSame.getUTCDate());
      const compute=(y,m0)=> monthlyMode==="dom"
        ? new Date(Date.UTC(y,m0, Math.min(bd, lastDayOfMonthUTC(y,m0))))
        : (isLast ? lastWeekdayOfMonthUTC(y,m0,bw) : (nthWeekdayOfMonthUTC(y,m0,bw, Math.max(1,nth)) || lastWeekdayOfMonthUTC(y,m0,bw)));
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1);
        for (let i=0;i<n;i++){ const t=addMonthsUTC(base, i*step); pushIfOnOrAfter(compute(t.getUTCFullYear(), t.getUTCMonth())); } }
      else if (endMode==="until"){ const until=parseISODate(untilDate); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const d=compute(t.getUTCFullYear(), t.getUTCMonth()); if (d>until) break; pushIfOnOrAfter(d); i++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||12)); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const d=compute(t.getUTCFullYear(), t.getUTCMonth()); if (d>end) break; pushIfOnOrAfter(d); i++; } }
    }

    added.sort((a,b)=>(a.dayOffset||0)-(b.dayOffset||0) || (a.time||"").localeCompare(b.time||""));
    if (!added.length) return;
    onAdd(added);
    setTitle(""); setNotes("");
  }

  const pill = (on)=>cn("rounded-full px-3 py-1 text-xs border", on?"bg-cyan-600 text-white border-cyan-600":"bg-white text-gray-700 border-gray-300 hover:bg-gray-50");

  return (
    <div className="rounded-xl border border-gray-200 p-4">
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task title</div>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., Strength training" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Offset (days from plan start)</div>
          <input type="number" value={baseOffset} onChange={(e)=>setBaseOffset(Number(e.target.value)||0)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Time (optional)</div>
          <input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Duration (mins)</div>
          <input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>

      <label className="block mb-3">
        <div className="mb-1 text-sm font-medium">Notes (optional)</div>
        <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
      </label>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="text-sm font-medium">Repeat</div>
        <select value={repeat} onChange={(e)=>setRepeat(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
          <option value="none">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
        {repeat==="weekly" && (
          <div className="flex flex-wrap items-center gap-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=>(
              <button key={d} type="button" className={pill(weeklyDays[i])} onClick={()=>setWeeklyDays(v=>{const n=[...v]; n[i]=!n[i]; return n;})}>{d}</button>
            ))}
          </div>
        )}
      </div>

      {repeat!=="none" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">every</span>
            <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
            <span className="text-sm">{repeat==="daily"?"day(s)":repeat==="weekly"?"week(s)":"month(s)"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="endMode" value="count" checked={endMode==="count"} onChange={()=>setEndMode("count")} />after</label>
            <input type="number" min={1} disabled={endMode!=="count"} value={count} onChange={(e)=>setCount(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
            <span className="text-sm">occurrence(s)</span>
            <span className="mx-2 text-xs text-gray-400">or</span>
            <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="endMode" value="until" checked={endMode==="until"} onChange={()=>setEndMode("until")} />on date</label>
            <input type="date" disabled={endMode!=="until"} value={untilDate} onChange={(e)=>setUntilDate(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="endMode" value="infinite" checked={endMode==="infinite"} onChange={()=>setEndMode("infinite")} />No end (generate next …)</label>
            <input type="number" min={1} max={repeat==="monthly"?36:24} value={horizonMonths} onChange={(e)=>setHorizonMonths(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
            <span className="text-sm">month(s)</span>
          </div>
          {repeat==="monthly" && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">Pattern</span>
              <select value={monthlyMode} onChange={(e)=>setMonthlyMode(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
                <option value="dom">Same day of month</option>
                <option value="dow">Same weekday pattern</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"><Plus className="h-4 w-4" /> Add task(s)</button>
        <button onClick={()=>{ setTitle(""); setNotes(""); setTime(""); setDur(60); setRepeat("none"); setBaseOffset(0); }} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><RotateCcw className="h-3 w-3" /> Reset fields</button>
      </div>
    </div>
  );
}

/* ---- Preview & push ---- */
function buildICS(plan, tasks){
  const lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//EN"];
  const addDays=(d,n)=>{ const x=new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate()+n); return x; };
  const start=new Date(`${plan.startDate}T00:00:00Z`);
  const fmt=(X)=>`${X.getUTCFullYear()}${String(X.getUTCMonth()+1).padStart(2,"0")}${String(X.getUTCDate()).padStart(2,"0")}T${String(X.getUTCHours()).padStart(2,"0")}${String(X.getUTCMinutes()).padStart(2,"0")}00Z`;
  const esc=(s="")=>String(s).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n");
  for (const t of tasks){
    const dt=addDays(start, t.dayOffset||0);
    let dtstart, dtend;
    if (t.time){
      const [hh,mm]=t.time.split(":").map(Number);
      const st=new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hh||0, mm||0));
      const en=new Date(st.getTime() + (t.durationMins||60)*60000);
      dtstart=`DTSTART:${fmt(st)}`; dtend=`DTEND:${fmt(en)}`;
    }else{
      const ymd=`${dt.getUTCFullYear()}${String(dt.getUTCMonth()+1).padStart(2,"0")}${String(dt.getUTCDate()).padStart(2,"0")}`;
      const next=addDays(dt,1); const ymd2=`${next.getUTCFullYear()}${String(next.getUTCMonth()+1).padStart(2,"0")}${String(next.getUTCDate()).padStart(2,"0")}`;
      dtstart=`DTSTART;VALUE=DATE:${ymd}`; dtend=`DTEND;VALUE=DATE:${ymd2}`;
    }
    const id=`${uid()}@plan2tasks`;
    lines.push("BEGIN:VEVENT", `UID:${id}`, `SUMMARY:${esc(t.title)}`, dtstart, dtend, `DESCRIPTION:${esc(t.notes||"")}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR"); return lines.join("\r\n");
}
function renderPlanBlock({ plan, tasks }){
  const lines=[];
  lines.push("### PLAN2TASKS ###");
  lines.push(`Title: ${plan.title}`); lines.push(`Start: ${plan.startDate}`); lines.push(`Timezone: ${plan.timezone}`);
  lines.push("--- Blocks ---"); lines.push("--- Tasks ---");
  for (const t of tasks) lines.push(`- ${t.title} | day=${t.dayOffset||0} | time=${t.time||""} | dur=${t.durationMins||60} | notes=${t.notes||""}`);
  lines.push("### END ###"); return lines.join("\n");
}

function ComposerPreview({ plannerEmail, selectedUserEmail, plan, tasks, setTasks, replaceMode, setReplaceMode, msg, setMsg }){
  const preview = useMemo(()=>[...tasks].sort((a,b)=>(a.dayOffset||0)-(b.dayOffset||0) || (a.time||"").localeCompare(b.time||"")), [tasks]);

  function downloadICS(){
    const ics=buildICS(plan, preview); const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`${(plan.title||"plan").replace(/[^\w\-]+/g,"_").slice(0,40)}.ics`;
    document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
  }

  async function push(){
    try{
      setMsg("Pushing…");
      if (!selectedUserEmail) throw new Error("Choose a user first.");
      if (!preview.length) throw new Error("Add at least one task.");
      const block=renderPlanBlock({ plan, tasks: preview });
      const r=await fetch("/api/push",{ method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ userEmail: selectedUserEmail, plannerEmail, planBlock: block, mode: (replaceMode?"replace":"append") })
      });
      const text=await r.text(); let data; try{ data=JSON.parse(text); }catch{ throw new Error(text.slice(0,200)); }
      if (!r.ok) throw new Error(data.error||"Push failed");

      // Snapshot history
      await fetch("/api/history/snapshot", { method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ plannerEmail, userEmail: selectedUserEmail, plan, tasks: preview, mode: replaceMode?"replace":"append", listTitle: data.listTitle || plan.title })
      });

      setTasks([]); // clear composer immediately
      setMsg(`Success — ${data.created} created in “${data.listTitle||plan.title}”. Composer cleared.`);
    }catch(e){ setMsg("Error: "+e.message); }
  }

  const groups=useMemo(()=>{
    const map=new Map(); for (const it of preview){ const d=addDaysSafe(plan.startDate, it.dayOffset||0); const ymd=fmtDateYMD(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))); if(!map.has(ymd)) map.set(ymd, []); map.get(ymd).push(it); }
    return Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([ymd, arr])=>({ ymd, items: arr.sort((a,b)=>(a.time||"").localeCompare(b.time||"")) }));
  },[preview, plan.startDate]);

  return (
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold">Preview & deliver</div>
      {preview.length===0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500">Nothing to preview yet — add a task above or load from Inbox/History.</div>
      ) : (
        <>
          <div className="space-y-3">
            {groups.map(g=>(
              <div key={g.ymd} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                <div className="mb-1 text-sm font-semibold text-gray-800">{format(parseISODate(g.ymd),"EEE MMM d, yyyy")}</div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {g.items.map((it,idx)=>(
                    <div key={idx} className="rounded-xl border bg-white p-2 text-xs">
                      <div className="font-medium text-gray-900">{it.title}</div>
                      <div className="text-gray-500">{it.time || "all-day"} • {it.durationMins||60}m{it.notes?` • ${it.notes}`:""}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={replaceMode} onChange={(e)=>setReplaceMode(e.target.checked)} />
              Replace existing tasks in this list before pushing
            </label>
            <button onClick={push} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">Push to selected user</button>
            <button onClick={downloadICS} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><Download className="h-3 w-3" /> Export .ics</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---- History (user) ---- */
function HistoryPanel({ plannerEmail, userEmail }){
  const [tab,setTab]=useState("active"); const [rows,setRows]=useState([]); const [q,setQ]=useState("");
  const [sel,setSel]=useState(new Set()); const [confirm,setConfirm]=useState(null);

  async function load(){
    if (!userEmail){ setRows([]); return; }
    const qs=new URLSearchParams({ plannerEmail, userEmail, status: tab, q });
    const r=await fetch(`/api/history/list?${qs.toString()}`); const j=await r.json(); setRows(j.items||[]); setSel(new Set());
  }
  useEffect(()=>{ load(); },[plannerEmail, userEmail, tab, q]);

  function toggle(id){ const n=new Set(sel); n.has(id)?n.delete(id):n.add(id); setSel(n); }
  function setAll(on){ setSel(on? new Set(rows.map(r=>r.id)) : new Set()); }

  async function doAction(action, ids){
    const ep = action==="archive" ? "/api/history/archive" : action==="unarchive" ? "/api/history/unarchive" : "/api/history/delete";
    await fetch(ep,{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, planIds: ids }) });
    await load();
  }
  async function restore(id, duplicate=false){
    const r=await fetch("/api/history/restore",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, planId: id }) });
    const j=await r.json(); if (!r.ok) return alert(j.error||"Restore failed");
    const payload={ ok:true, userEmail, plan:j.plan, tasks:j.tasks }; if (duplicate) payload.plan.title = `${payload.plan.title} (copy)`;
    localStorage.setItem("p2t_last_prefill", JSON.stringify(payload)); alert("Loaded to composer. Switch to Plan tab.");
  }

  return (
    <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">History</div>
          <div className="text-xs text-gray-500">Previously pushed lists for {userEmail || "—"}.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search title…" className="px-2 py-1 text-sm outline-none" />
          </div>
          <div className="rounded-xl border border-gray-300 bg-white">
            <button onClick={()=>setTab("active")} className={cn("px-3 py-2 text-xs", tab==="active"?"bg-cyan-600 text-white rounded-l-xl":"")}>Active</button>
            <button onClick={()=>setTab("archived")} className={cn("px-3 py-2 text-xs", tab==="archived"?"bg-cyan-600 text-white rounded-r-xl":"")}>Archived</button>
          </div>
        </div>
      </div>

      {/* bulk */}
      <div className="mb-2 flex items-center justify-between text-xs">
        <button onClick={()=>setAll(sel.size!==rows.length)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
          {sel.size===rows.length && rows.length>0 ? <CheckSquare className="h-3 w-3"/> : <Square className="h-3 w-3" />} Select all
        </button>
        <div className="flex items-center gap-2">
          {tab==="active"
            ? <button onClick={()=>setConfirm({action:"archive", ids:Array.from(sel), text:`Archive ${sel.size} plan(s)?`})} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><Archive className="h-3 w-3" /> Archive</button>
            : <button onClick={()=>setConfirm({action:"unarchive", ids:Array.from(sel), text:`Unarchive ${sel.size} plan(s)?`})} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><ArchiveRestore className="h-3 w-3" /> Unarchive</button>
          }
          <button onClick={()=>setConfirm({action:"delete", ids:Array.from(sel), text:`Permanently delete ${sel.size} plan(s)? This cannot be undone.`})}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1"><Trash2 className="h-3 w-3" /> Delete…</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="py-2 px-2"></th>
              <th className="py-2 px-2">Title</th>
              <th className="py-2 px-2">Start</th>
              <th className="py-2 px-2">Items</th>
              <th className="py-2 px-2">Mode</th>
              <th className="py-2 px-2">Pushed</th>
              <th className="py-2 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.id} className="border-t">
                <td className="py-2 px-2"><input type="checkbox" checked={sel.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                <td className="py-2 px-2">{r.title}</td>
                <td className="py-2 px-2">{r.start_date}</td>
                <td className="py-2 px-2">{r.items_count}</td>
                <td className="py-2 px-2">{r.mode}</td>
                <td className="py-2 px-2">{new Date(r.pushed_at).toLocaleString()}</td>
                <td className="py-2 px-2">
                  <div className="flex justify-end gap-2">
                    <a href={`/api/history/ics?planId=${r.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><Download className="h-3 w-3" /> .ics</a>
                    <button onClick={()=>restore(r.id,false)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">Restore</button>
                    <button onClick={()=>restore(r.id,true)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">Duplicate</button>
                    {tab==="active"
                      ? <button onClick={()=>setConfirm({action:"archive", ids:[r.id], text:`Archive “${r.title}”?`})} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><Archive className="h-3 w-3" /></button>
                      : <button onClick={()=>setConfirm({action:"unarchive", ids:[r.id], text:`Unarchive “${r.title}”?`})} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><ArchiveRestore className="h-3 w-3" /></button>
                    }
                    <button onClick={()=>setConfirm({action:"delete", ids:[r.id], text:`Permanently delete “${r.title}”? This cannot be undone.`})}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length===0 && (
              <tr><td colSpan={7} className="py-6 text-center text-gray-500">No history on this tab.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* confirm */}
      {confirm && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0" />
          <div className="fixed inset-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={()=>setConfirm(null)} />
            <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
              <div className="mb-2 text-sm font-semibold">Please confirm</div>
              <div className="mb-3 text-xs text-gray-700 whitespace-pre-wrap">{confirm.text}</div>
              <div className="flex justify-end gap-2">
                <button onClick={()=>setConfirm(null)} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
                <button onClick={async ()=>{ const {action, ids}=confirm; setConfirm(null); await doAction(action, ids); }}
                  className={cn("rounded-lg px-3 py-1.5 text-xs text-white", confirm.action==="delete"?"bg-red-600":"bg-cyan-600")}>
                  {confirm.action==="delete"?"Delete":confirm.action==="archive"?"Archive":"Unarchive"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
