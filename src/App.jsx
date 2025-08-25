/* src/App.jsx — Polishing pass: responsive, tables+pagination, toasts, spacing */
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Download, Archive, ArchiveRestore, Trash2, ArrowRight, X,
  CheckSquare, Square, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, RotateCcw
} from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

/* -------------------- tiny utils -------------------- */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function parseISODate(s){ if (!s) return null; const d=new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime())?null:d; }
function fmtDateYMD(d){ const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,"0"); const dd=String(d.getUTCDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
function daysBetweenUTC(a,b){ const ms=86400000; const da=Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()); const db=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()); return Math.round((db-da)/ms); }
function addMonthsUTC(dateUTC, months){
  const y=dateUTC.getUTCFullYear(), m=dateUTC.getUTCMonth(), d=dateUTC.getUTCDate();
  const nm=m+months, ny=y+Math.floor(nm/12), nmo=((nm%12)+12)%12;
  const last=new Date(Date.UTC(ny,nmo+1,0)).getUTCDate();
  const nd=Math.min(d,last);
  return new Date(Date.UTC(ny,nmo,nd));
}
function lastDayOfMonthUTC(y,m0){ return new Date(Date.UTC(y,m0+1,0)).getUTCDate(); }
function firstWeekdayOfMonthUTC(y,m0,weekday){ const first=new Date(Date.UTC(y,m0,1)); const shift=(7+weekday-first.getUTCDay())%7; return new Date(Date.UTC(y,m0,1+shift)); }
function nthWeekdayOfMonthUTC(y,m0,weekday,nth){ const first=firstWeekdayOfMonthUTC(y,m0,weekday); const c=new Date(Date.UTC(y,m0, first.getUTCDate()+7*(nth-1))); return c.getUTCMonth()===m0?c:null; }
function lastWeekdayOfMonthUTC(y,m0,weekday){ const lastD=lastDayOfMonthUTC(y,m0); const last=new Date(Date.UTC(y,m0,lastD)); const shift=(7+last.getUTCDay()-weekday)%7; return new Date(Date.UTC(y,m0,lastD-shift)); }
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];

/* -------------------- ErrorBoundary -------------------- */
class ErrorBoundary extends React.Component{
  constructor(p){ super(p); this.state={error:null}; }
  static getDerivedStateFromError(e){ return {error:e}; }
  componentDidCatch(e, info){ console.error("UI crash:", e, info); }
  render(){
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-red-50 p-4 sm:p-6">
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

/* -------------------- Toasts -------------------- */
function Toasts({ items, dismiss }){
  return (
    <div className="fixed right-3 top-3 z-[60] flex flex-col gap-2">
      {items.map(t=>(
        <div key={t.id}
          className={cn("rounded-xl px-3 py-2 shadow-sm border text-xs sm:text-sm",
            t.type==="error" ? "bg-red-600 text-white border-red-700" :
            t.type==="warn" ? "bg-amber-600 text-white border-amber-700" :
            "bg-emerald-600 text-white border-emerald-700"
          )}>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{t.title || (t.type==="error"?"Error":"Success")}</span>
            <button className="ml-auto opacity-80 hover:opacity-100" onClick={()=>dismiss(t.id)} aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
          </div>
          {t.message && <div className="mt-0.5 opacity-90">{t.message}</div>}
        </div>
      ))}
    </div>
  );
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-4 sm:p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg sm:text-xl font-bold mb-1">Plan2Tasks – Planner</h1>
        <p className="text-xs sm:text-sm text-gray-500 mb-4">Sign in to manage users and deliver task lists.</p>

        <button onClick={handleGoogle}
          className="w-full mb-3 inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold hover:bg-gray-50">
          <img alt="" src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-4 w-4" />
          <span className="whitespace-nowrap">Continue with Google</span>
        </button>
        <div className="my-2 text-center text-[11px] text-gray-400">or</div>

        <label className="block mb-1 text-xs sm:text-sm font-medium">Email</label>
        <input value={email} onChange={(e)=>setEmail(e.target.value)} type="email"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <label className="block mb-1 text-xs sm:text-sm font-medium">Password</label>
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
  const [selectedUserEmail, setSelectedUserEmail] = useState("");

  /* toasts */
  const [toasts,setToasts]=useState([]);
  const toast = useCallback((type, message, title) => {
    const id=uid(); setToasts(ts=>[...ts,{id,type,message,title}]);
    setTimeout(()=>setToasts(ts=>ts.filter(t=>t.id!==id)), 4500);
  },[]);
  const dismissToast = (id)=>setToasts(ts=>ts.filter(t=>t.id!==id));

  useEffect(()=>{
    (async ()=>{
      try{
        const qs=new URLSearchParams({ plannerEmail });
        const r=await fetch(`/api/prefs/get?${qs.toString()}`);
        if (r.ok){ const j=await r.json(); setPrefs(j.prefs || j); setView((j.prefs?.default_view)||"users"); }
      }catch{}
    })();
  },[plannerEmail]);

  async function loadBadge(){
    try{
      const qs=new URLSearchParams({ plannerEmail, status:"new" });
      const r=await fetch(`/api/inbox?${qs.toString()}`); const j=await r.json();
      setInboxBadge((j.bundles||[]).length);
    }catch{}
  }
  useEffect(()=>{ if (prefs.show_inbox_badge) loadBadge(); },[plannerEmail, prefs.show_inbox_badge]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 p-4 sm:p-6">
      <Toasts items={toasts} dismiss={dismissToast} />
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-xl sm:text-2xl font-bold">Plan2Tasks</div>
            <nav className="ml-1 sm:ml-4 flex gap-1 sm:gap-2">
              <NavBtn active={view==="users"} onClick={()=>setView("users")} icon={<Users className="h-4 w-4" />}>
                <span className="hidden sm:inline">Users</span>
              </NavBtn>
              <NavBtn active={view==="plan"} onClick={()=>setView("plan")} icon={<Calendar className="h-4 w-4" />}>
                <span className="hidden sm:inline">Plan</span>
              </NavBtn>
              <NavBtn active={view==="settings"} onClick={()=>setView("settings")} icon={<SettingsIcon className="h-4 w-4" />}>
                <span className="hidden sm:inline">Settings</span>
              </NavBtn>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={()=>setInboxOpen(true)}
              className="relative rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs sm:text-sm hover:bg-gray-50 whitespace-nowrap"
              title="Inbox (GPT imports)"
            >
              <InboxIcon className="inline h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Inbox</span>
              {prefs.show_inbox_badge && inboxBadge>0 && (
                <span className="absolute -top-2 -right-2 rounded-full bg-cyan-600 px-1.5 py-[2px] text-[10px] font-bold text-white">
                  {inboxBadge}
                </span>
              )}
            </button>
            <span className="rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs sm:text-sm whitespace-nowrap">
              <span className="hidden sm:inline">Signed in:&nbsp;</span><b className="truncate inline-block max-w-[140px] align-bottom">{plannerEmail}</b>
            </span>
            <button onClick={()=>supabaseClient.auth.signOut()} className="rounded-xl bg-gray-900 px-2.5 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-black whitespace-nowrap">Sign out</button>
          </div>
        </div>

        {view==="users" && (
          <UsersView
            plannerEmail={plannerEmail}
            onManage={(email)=>{ setSelectedUserEmail(email); setView("plan"); }}
            toast={toast}
          />
        )}

        {view==="plan" && (
          <PlanView
            plannerEmail={plannerEmail}
            selectedUserEmail={selectedUserEmail}
            setSelectedUserEmail={(v)=>{ setSelectedUserEmail(v); }}
            toast={toast}
          />
        )}

        {view==="settings" && <SettingsView plannerEmail={plannerEmail} prefs={prefs} onChange={(p)=>{ setPrefs(p); toast("success","Preferences saved."); }} />}

        {inboxOpen && (
          <InboxDrawer
            plannerEmail={plannerEmail}
            autoArchive={!!prefs.auto_archive_after_assign}
            onClose={async()=>{ setInboxOpen(false); await loadBadge(); }}
            toast={toast}
          />
        )}
      </div>
    </div>
  );
}
function NavBtn({ active, onClick, icon, children }){
  return (
    <button onClick={onClick}
      className={cn(
        "rounded-xl px-2.5 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap",
        active?"bg-cyan-600 text-white":"bg-white border border-gray-300 hover:bg-gray-50"
      )}>
      <span className="inline-flex items-center gap-1">{icon}{children}</span>
    </button>
  );
}

/* -------------------- Modal + Calendar Grid -------------------- */
function Modal({ title, children, onClose }){
  useEffect(()=>{ function onEsc(e){ if (e.key==="Escape") onClose?.(); } window.addEventListener("keydown", onEsc); return ()=>window.removeEventListener("keydown", onEsc); },[onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3">
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
function CalendarGridFree({ initialDate, selectedDate, onPick }){
  const init = parseISODate(initialDate) || new Date();
  const sel = parseISODate(selectedDate) || init;
  const [vm,setVm]=useState(()=>new Date(Date.UTC(sel.getUTCFullYear(), sel.getUTCMonth(), 1)));
  function monthLabel(d){ return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), "MMMM yyyy"); }
  function gotoMonth(delta){ const y=vm.getUTCFullYear(), m=vm.getUTCMonth(); setVm(new Date(Date.UTC(y, m+delta, 1))); }

  const year=vm.getUTCFullYear(), month=vm.getUTCMonth();
  const firstOfMonth=new Date(Date.UTC(year, month, 1));
  const startDow=firstOfMonth.getUTCDay();
  const gridStart=new Date(Date.UTC(year, month, 1-startDow));
  const weeks=Array.from({length:6}).map((_,w)=>Array.from({length:7}).map((_,d)=>{
    const cell=new Date(gridStart); cell.setUTCDate(gridStart.getUTCDate()+(w*7+d));
    const isSameMonth=cell.getUTCMonth()===month;
    const isSelected=fmtDateYMD(cell)===fmtDateYMD(sel);
    return {cell,isSameMonth,isSelected,label:String(cell.getUTCDate())};
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
          onClick={()=>{ setVm(new Date(Date.UTC(init.getUTCFullYear(), init.getUTCMonth(), 1))); }}>
          Jump to current
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row,ri)=>row.map((c,ci)=>(
          <button key={`${ri}-${ci}`} type="button"
            className={cn("h-8 w-8 rounded-full text-xs flex items-center justify-center transition",
              c.isSelected?"bg-cyan-600 text-white":"hover:bg-gray-100",
              !c.isSameMonth && !c.isSelected ? "text-gray-400":"text-gray-700")}
            onClick={()=>onPick?.(fmtDateYMD(c.cell))}
          >
            {c.label}
          </button>
        )))}
      </div>
    </div>
  );
}

/* -------------------- Inbox Drawer -------------------- */
function InboxDrawer({ plannerEmail, autoArchive, onClose, toast }){
  const [tab,setTab]=useState("new"); // new|assigned|archived
  const [rows,setRows]=useState([]);
  const [users,setUsers]=useState([]);
  const [assignTo,setAssignTo]=useState("");
  const [sel,setSel]=useState(new Set());

  // pagination
  const [page,setPage]=useState(1); const pageSize=25;
  const pageCount=Math.max(1, Math.ceil(rows.length/pageSize));
  const pageRows = useMemo(()=> rows.slice((page-1)*pageSize, (page)*pageSize), [rows,page]);

  useEffect(()=>{ (async ()=>{
    const qs = new URLSearchParams({ op:"list", plannerEmail, status:"all" });
    const r = await fetch(`/api/users?${qs.toString()}`); const j = await r.json();
    setUsers(j.users || []);
  })(); },[plannerEmail]);

  async function load(){
    const qs=new URLSearchParams({ plannerEmail, status: tab });
    const r=await fetch(`/api/inbox?${qs.toString()}`); const j=await r.json();
    setRows(j.bundles||[]); setSel(new Set()); setPage(1);
  }
  useEffect(()=>{ load(); },[plannerEmail, tab]);

  function toggle(id){ const n=new Set(sel); n.has(id)?n.delete(id):n.add(id); setSel(n); }
  function setAll(on){ setSel(on? new Set(pageRows.map(r=>r.id)) : new Set()); } // page-scoped select all
  async function doAction(action, ids){
    if (!ids.length) return;
    const ep = action==="archive" ? "/api/inbox/archive" : action==="restore" ? "/api/inbox/restore" : "/api/inbox/delete";
    const r = await fetch(ep, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, bundleIds: ids })
    });
    if (!r.ok){ const t=await r.text(); toast("error", t.slice(0,180)); return; }
    await load();
    toast("success", `${action[0].toUpperCase()+action.slice(1)}d ${ids.length} bundle(s).`);
  }
  async function assignRow(r){
    if (!assignTo) return toast("warn","Choose a user first.");
    const res = await fetch("/api/inbox/assign", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, inboxId: r.id, userEmail: assignTo })
    });
    const j = await res.json();
    if (!res.ok) { toast("error", j.error||"Assign failed"); return; }
    if (autoArchive) await doAction("archive", [r.id]); else await load();
    toast("success", `Assigned "${r.title}" to ${assignTo}.`);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-3xl bg-white border-l border-gray-200 shadow-xl p-4 sm:p-5 overflow-y-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm sm:text-base font-semibold">Inbox (GPT imports)</div>
            <div className="text-[11px] sm:text-xs text-gray-500">Auto-archive after Assign: <b>{autoArchive ? "On" : "Off"}</b> · Change in <b>Settings</b>.</div>
          </div>
          <button onClick={onClose} className="rounded-xl border px-3 py-2 text-xs sm:text-sm whitespace-nowrap"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          {["new","assigned","archived"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={cn("rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold whitespace-nowrap", tab===t?"bg-cyan-600 text-white":"bg-white border border-gray-300")}>
              {t==="new"?"New":t==="assigned"?"Assigned":"Archived"}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-gray-600">Assign to</span>
            <select value={assignTo} onChange={(e)=>setAssignTo(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1">
              <option value="">—</option>
              {users.map(u=><option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓":""}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center justify-between text-[11px] sm:text-xs gap-2">
          <button onClick={()=>setAll(true)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap">
            <CheckSquare className="h-3 w-3"/> Select page
          </button>
          <div className="flex items-center gap-2">
            {tab!=="archived" && (
              <button onClick={()=>doAction("archive", Array.from(sel))}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap"><Archive className="h-3 w-3"/> Archive</button>
            )}
            {tab==="archived" && (
              <button onClick={()=>doAction("restore", Array.from(sel))}
                className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap"><ArchiveRestore className="h-3 w-3"/> Restore</button>
            )}
            <button onClick={()=>doAction("delete", Array.from(sel))}
              className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1 whitespace-nowrap"><Trash2 className="h-3 w-3"/> Delete…</button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-xs table-fixed min-w-[720px]">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="py-2 px-2 w-8"></th>
                <th className="py-2 px-2 w-[35%]">Title</th>
                <th className="py-2 px-2 w-16">Items</th>
                <th className="py-2 px-2 w-28 whitespace-nowrap">Start</th>
                <th className="py-2 px-2 w-24">Status</th>
                <th className="py-2 px-2 w-[22%]">Assigned to</th>
                <th className="py-2 px-2 w-36">Created</th>
                <th className="py-2 px-2 w-40 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(r=>(
                <tr key={r.id} className="border-t">
                  <td className="py-2 px-2"><input type="checkbox" checked={sel.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                  <td className="py-2 px-2 truncate">{r.title}</td>
                  <td className="py-2 px-2">{r.count}</td>
                  <td className="py-2 px-2 whitespace-nowrap">{r.start_date}</td>
                  <td className="py-2 px-2">{r.archived_at? "Archived" : r.assigned_user ? "Assigned" : "New"}</td>
                  <td className="py-2 px-2 truncate">{r.assigned_user || "—"}</td>
                  <td className="py-2 px-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="py-2 px-2">
                    <div className="flex justify-end gap-1 sm:gap-2">
                      {tab!=="archived" && (
                        <button onClick={()=>assignRow(r)} className="rounded-lg bg-cyan-600 px-2 py-1 text-white text-xs sm:text-sm whitespace-nowrap">Assign</button>
                      )}
                      {tab!=="archived" ? (
                        <button onClick={()=>doAction("archive", [r.id])} className="rounded-lg border px-2 py-1 text-xs sm:text-sm">Archive</button>
                      ) : (
                        <button onClick={()=>doAction("restore", [r.id])} className="rounded-lg border px-2 py-1 text-xs sm:text-sm">Restore</button>
                      )}
                      <button onClick={()=>doAction("delete", [r.id])}
                        className="rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs sm:text-sm">Delete…</button>
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

        {/* Pagination */}
        {rows.length>pageSize && (
          <div className="mt-3 flex items-center justify-between text-xs">
            <div className="text-gray-600">Page {page} of {pageCount}</div>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(1)} disabled={page===1}><ChevronsLeft className="h-3 w-3" /></button>
              <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft className="h-3 w-3" /></button>
              <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(p=>Math.min(pageCount,p+1))} disabled={page===pageCount}><ChevronRight className="h-3 w-3" /></button>
              <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(pageCount)} disabled={page===pageCount}><ChevronsRight className="h-3 w-3" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------- Users table -------------------- */
function UsersView({ plannerEmail, onManage = () => {}, toast }){
  const [status,setStatus]=useState("all");
  const [q,setQ]=useState("");
  const [rows,setRows]=useState([]);
  const [addEmail,setAddEmail]=useState("");
  const [msg,setMsg]=useState("");

  // pagination
  const [page,setPage]=useState(1); const pageSize=25;
  const pageRows = useMemo(()=> rows.slice((page-1)*pageSize, (page)*pageSize), [rows,page]);
  const pageCount=Math.max(1, Math.ceil(rows.length/pageSize));

  async function load(){
    const qs=new URLSearchParams({ op:"list", plannerEmail, status, q });
    const r=await fetch(`/api/users?${qs.toString()}`);
    const j=await r.json(); setRows(j.users||[]); setPage(1);
  }
  useEffect(()=>{ load(); },[plannerEmail, status, q]);

  async function addUser(){
    setMsg("Creating invite…");
    const r=await fetch("/api/invite", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: addEmail.trim() })
    });
    const j=await r.json();
    if (!r.ok) { setMsg(j.error||"Invite failed"); toast("error", j.error||"Invite failed"); return; }
    setMsg(j.emailed ? "Invite created & emailed." : "Invite created. Email not configured.");
    toast("success", "Invite created.");
    setAddEmail(""); await load();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base sm:text-lg font-semibold">Users</div>
          <div className="text-[11px] sm:text-xs text-gray-500">Add users and manage their task lists.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl border border-gray-300 bg-white overflow-hidden">
            {["all","invited","connected"].map(s=>(
              <button key={s} onClick={()=>setStatus(s)}
                className={cn("px-2.5 py-1.5 text-xs sm:text-sm whitespace-nowrap", status===s?"bg-cyan-600 text-white":"")}>
                {s[0].toUpperCase()+s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search users…" className="px-2 py-1 text-sm outline-none w-36 sm:w-52" />
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 sm:grid-cols-[1fr_auto]">
        <input value={addEmail} onChange={(e)=>setAddEmail(e.target.value)} type="email" placeholder="user@example.com"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={addUser} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 whitespace-nowrap">Add user</button>
      </div>
      <div className="mb-2 text-xs text-gray-600">{msg}</div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs table-fixed min-w-[560px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="py-2 px-2 w-[55%]">Email</th>
              <th className="py-2 px-2 w-[20%]">Status</th>
              <th className="py-2 px-2 w-[25%] text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r=>(
              <tr key={r.email} className="border-t">
                <td className="py-2 px-2 truncate">{r.email}</td>
                <td className="py-2 px-2">{r.status==="connected"?"✓ connected":"invited"}</td>
                <td className="py-2 px-2">
                  <div className="flex justify-end">
                    <button
                      onClick={(e)=>{ e.preventDefault(); onManage(r.email); }}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2.5 py-1.5 text-white text-xs sm:text-sm whitespace-nowrap"
                    >
                      <span className="hidden sm:inline">Manage user</span>
                      <ArrowRight className="h-3 w-3 sm:ml-0" />
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

      {rows.length>pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="text-gray-600">Page {page} of {pageCount}</div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(1)} disabled={page===1}><ChevronsLeft className="h-3 w-3" /></button>
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft className="h-3 w-3" /></button>
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(p=>Math.min(pageCount,p+1))} disabled={page===pageCount}><ChevronRight className="h-3 w-3" /></button>
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(pageCount)} disabled={page===pageCount}><ChevronsRight className="h-3 w-3" /></button>
          </div>
        </div>
      )}
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
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="mb-3">
        <div className="text-base sm:text-lg font-semibold">Settings</div>
        <div className="text-[11px] sm:text-xs text-gray-500">Defaults & Inbox behavior.</div>
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

function PlanView({ plannerEmail, selectedUserEmail, setSelectedUserEmail, toast }){
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
  const [planDateOpen,setPlanDateOpen]=useState(false);

  useEffect(()=>{ (async ()=>{
    const qs=new URLSearchParams({ op:"list", plannerEmail, status:"all" });
    const r=await fetch(`/api/users?${qs.toString()}`); const j=await r.json();
    setUsers(j.users||[]);
    if (!selectedUserEmail) {
      const connected=(j.users||[]).find(u=>u.status==="connected")?.email;
      setSelectedUserEmail(connected || (j.users?.[0]?.email || ""));
    }
  })(); },[plannerEmail]);

  useEffect(()=>{ try{
    const raw=localStorage.getItem("p2t_last_prefill");
    if (raw){ const p=JSON.parse(raw);
      if (p && p.ok && p.plan && Array.isArray(p.tasks)) { setPrefill(p); }
      localStorage.removeItem("p2t_last_prefill");
    }
  }catch{} },[]);
  useEffect(()=>{ if (prefill){ setPlan(prefill.plan); setTasks(prefill.tasks.map(t=>({ id: uid(), ...t }))); } },[prefill]);

  useEffect(()=>{ setTasks([]); setMsg(""); },[selectedUserEmail]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base sm:text-lg font-semibold">Plan (create & deliver tasks)</div>
          <div className="text-[11px] sm:text-xs text-gray-500">Title becomes the Google Tasks list name. Add tasks, preview, then push.</div>
        </div>
        <div className="w-full sm:w-72">
          <select value={selectedUserEmail || ""} onChange={(e)=>setSelectedUserEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="">— Choose user —</option>
            {users.map(u=><option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓":""}</option>)}
          </select>
        </div>
      </div>

      {/* Plan basics */}
      <div className="mb-3 grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-3">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task list title</div>
          <input value={plan.title} onChange={(e)=>setPlan({...plan, title:e.target.value})}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., Week of Sep 1" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Timezone</div>
          <select value={plan.timezone} onChange={(e)=>setPlan({...plan, timezone:e.target.value})}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz}</option>)}
          </select>
        </label>
        <div className="block">
          <div className="mb-1 text-sm font-medium">Plan start date</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={()=>setPlanDateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">
              <Calendar className="h-4 w-4" /> <span className="hidden sm:inline">Choose Plan Start Date</span><span className="sm:hidden">Pick date</span>
            </button>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm whitespace-nowrap">
              {format(parseISODate(plan.startDate)||new Date(),"EEE MMM d, yyyy")}
            </div>
          </div>
        </div>
      </div>

      {planDateOpen && (
        <Modal title="Choose Plan Start Date" onClose={()=>setPlanDateOpen(false)}>
          <CalendarGridFree
            initialDate={plan.startDate}
            selectedDate={plan.startDate}
            onPick={(ymd)=>{ setPlan({...plan, startDate: ymd}); setPlanDateOpen(false); }}
          />
        </Modal>
      )}

      <TaskEditor
        planStartDate={plan.startDate}
        onAdd={(items)=>setTasks(prev=>[...prev, ...items.map(t=>({ id: uid(), ...t }))])}
      />

      <ComposerPreview
        plannerEmail={plannerEmail}
        selectedUserEmail={selectedUserEmail}
        plan={plan}
        tasks={tasks}
        setTasks={setTasks}
        replaceMode={replaceMode}
        setReplaceMode={setReplaceMode}
        msg={msg}
        setMsg={(m)=>{ setMsg(m); if (m.startsWith("Success")) toast("success", m); if (m.startsWith("Error")) toast("error", m); }}
      />

      <HistoryPanel plannerEmail={plannerEmail} userEmail={selectedUserEmail} toast={toast} />
    </div>
  );
}

/* ---- Task editor ---- */
function TaskEditor({ planStartDate, onAdd }){
  const [title,setTitle]=useState("");
  const [notes,setNotes]=useState("");
  const [taskDate,setTaskDate]=useState(planStartDate); // YYYY-MM-DD
  const [taskDateOpen,setTaskDateOpen]=useState(false);
  const [time,setTime]=useState("");
  const [dur,setDur]=useState(60);

  const [repeat,setRepeat]=useState("none"); // none|daily|weekly|monthly
  const [interval,setInterval]=useState(1);
  const [endMode,setEndMode]=useState("count"); // count|until|infinite
  const [count,setCount]=useState(4);
  const [untilDate,setUntilDate]=useState("");
  const [horizonMonths,setHorizonMonths]=useState(6);
  const [weeklyDays,setWeeklyDays]=useState([false,true,false,true,false,false,false]);
  const [monthlyMode,setMonthlyMode]=useState("dom"); // dom|dow

  useEffect(()=>{ if (!taskDate) setTaskDate(planStartDate); },[planStartDate]);

  function generate(){
    const name=title.trim(); if (!name) return;
    const planStart=parseISODate(planStartDate)||new Date();
    const base=parseISODate(taskDate)||planStart;

    const baseObj={ title:name, time: time || undefined, durationMins: (Number(dur)>0?Number(dur):60), notes };
    const added=[];
    function push(d){ const off=daysBetweenUTC(planStart, d); added.push({ ...baseObj, dayOffset: off }); }

    const step=Math.max(1, Number(interval)||1);

    if (repeat==="none"){ push(base); }
    if (repeat==="daily"){
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1);
        for (let i=0;i<n;i++){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); push(d); } }
      else if (endMode==="until"){ const until=parseISODate(untilDate); let i=0; while(true){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); if (d>until) break; push(d); if(++i>1000) break; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let i=0; while(true){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); if (d>end) break; push(d); if(++i>2000) break; } }
    }
    if (repeat==="weekly"){
      const checked=weeklyDays.map((v,i)=>v?i:null).filter(v=>v!==null);
      if (checked.length===0) { alert("Pick at least one weekday."); return; }
      const baseWeekday=base.getUTCDay();
      const baseStartOfWeek=new Date(base); baseStartOfWeek.setUTCDate(base.getUTCDate()-baseWeekday);
      const emitWeek=(weekIndex)=>{ for(const dow of checked){ const d=new Date(baseStartOfWeek); d.setUTCDate(baseStartOfWeek.getUTCDate()+dow+weekIndex*7*step); if (d>=base) push(d); } };
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1); let emitted=0, week=0; while (emitted<n && week<520){ const before=added.length; emitWeek(week); emitted+=(added.length-before); week++; } if (added.length>n) added.length=n; }
      else if (endMode==="until"){ const until=parseISODate(untilDate); let week=0; while (week<520){ const before=added.length; emitWeek(week);
        if (added.length>before){ const lastIdx=added.length-1; const last=new Date(`${fmtDateYMD(new Date(planStart))}T00:00:00Z`); last.setUTCDate(last.getUTCDate()+added[lastIdx].dayOffset);
          if (last>until){ while (added.length){ const test=new Date(`${fmtDateYMD(new Date(planStart))}T00:00:00Z`); test.setUTCDate(test.getUTCDate()+added[added.length-1].dayOffset); if (test<=until) break; added.pop(); } break; } } week++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let week=0; while (week<520){ emitWeek(week);
        const lastDate=new Date(`${fmtDateYMD(new Date(planStart))}T00:00:00Z`); const lastOff=added.length?added[added.length-1].dayOffset:0; lastDate.setUTCDate(lastDate.getUTCDate()+lastOff);
        if (lastDate>end) break; week++; } }
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
        for (let i=0;i<n;i++){ const t=addMonthsUTC(base, i*step); push(compute(t.getUTCFullYear(), t.getUTCMonth())); } }
      else if (endMode==="until"){ const until=parseISODate(untilDate); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const d=compute(t.getUTCFullYear(), t.getUTCMonth()); if (d>until) break; push(d); i++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||12)); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const d=compute(t.getUTCFullYear(), t.getUTCMonth()); if (d>end) break; push(d); i++; } }
    }

    added.sort((a,b)=>(a.dayOffset||0)-(b.dayOffset||0) || (a.time||"").localeCompare(b.time||""));
    if (!added.length) return;
    onAdd(added);
    setTitle(""); setNotes("");
  }

  const pill = (on)=>cn("rounded-full px-2.5 sm:px-3 py-1 text-[11px] sm:text-xs border whitespace-nowrap", on?"bg-cyan-600 text-white border-cyan-600":"bg-white text-gray-700 border-gray-300 hover:bg-gray-50");

  return (
    <div className="rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-4">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task title</div>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., Strength training" />
        </label>
        <div className="block">
          <div className="mb-1 text-sm font-medium">Task date</div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={()=>setTaskDateOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">
              <Calendar className="h-4 w-4" /> <span className="hidden sm:inline">Choose Task Date</span><span className="sm:hidden">Pick date</span>
            </button>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm whitespace-nowrap">
              {format(parseISODate(taskDate)||new Date(),"EEE MMM d, yyyy")}
            </div>
          </div>
        </div>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Time (optional)</div>
          <input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Duration (mins)</div>
          <input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>

      {taskDateOpen && (
        <Modal title="Choose Task Date" onClose={()=>setTaskDateOpen(false)}>
          <CalendarGridFree
            initialDate={taskDate || planStartDate}
            selectedDate={taskDate || planStartDate}
            onPick={(ymd)=>{ setTaskDate(ymd); setTaskDateOpen(false); }}
          />
        </Modal>
      )}

      <label className="block mb-3">
        <div className="mb-1 text-sm font-medium">Notes (optional)</div>
        <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
      </label>

      <div className="mb-2 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="text-sm font-medium">Repeat</div>
        <select value={repeat} onChange={(e)=>setRepeat(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
          <option value="none">None</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
        {repeat==="weekly" && (
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=>(
              <button key={d} type="button" className={pill(weeklyDays[i])} onClick={()=>setWeeklyDays(v=>{const n=[...v]; n[i]=!n[i]; return n;})}>{d}</button>
            ))}
          </div>
        )}
      </div>

      {repeat!=="none" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-sm">every</span>
            <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)} className="w-14 sm:w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
            <span className="text-sm">{repeat==="daily"?"day(s)":repeat==="weekly"?"week(s)":"month(s)"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="endMode" value="count" checked={endMode==="count"} onChange={()=>setEndMode("count")} />after</label>
            <input type="number" min={1} disabled={endMode!=="count"} value={count} onChange={(e)=>setCount(e.target.value)} className="w-14 sm:w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
            <span className="text-sm">occurrence(s)</span>
            <span className="mx-2 text-[11px] sm:text-xs text-gray-400">or</span>
            <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="endMode" value="until" checked={endMode==="until"} onChange={()=>setEndMode("until")} />on date</label>
            <input type="date" disabled={endMode!=="until"} value={untilDate} onChange={(e)=>setUntilDate(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="inline-flex items-center gap-2 text-sm"><input type="radio" name="endMode" value="infinite" checked={endMode==="infinite"} onChange={()=>setEndMode("infinite")} />No end (generate next …)</label>
            <input type="number" min={1} max={repeat==="monthly"?36:24} value={horizonMonths} onChange={(e)=>setHorizonMonths(e.target.value)} className="w-14 sm:w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
            <span className="text-sm">month(s)</span>
          </div>
          {repeat==="monthly" && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
        <button onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 sm:px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 whitespace-nowrap"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add task(s)</span><span className="sm:hidden">Add</span></button>
        <button onClick={()=>{ setTitle(""); setNotes(""); setTime(""); setDur(60); setRepeat("none"); setTaskDate(planStartDate); }} className="inline-flex items-center gap-2 rounded-xl border px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs whitespace-nowrap"><RotateCcw className="h-3 w-3" /> Reset</button>
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

      await fetch("/api/history/snapshot", { method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ plannerEmail, userEmail: selectedUserEmail, plan, tasks: preview, mode: replaceMode?"replace":"append", listTitle: data.listTitle || plan.title })
      });

      setTasks([]); localStorage.removeItem("p2t_last_prefill"); setReplaceMode(false);
      setMsg(`Success — ${data.created} created in “${data.listTitle||plan.title}”. Composer cleared.`);
    }catch(e){ setMsg("Error: "+e.message); }
  }

  const groups=useMemo(()=>{
    const map=new Map(); for (const it of preview){ const d=new Date(`${plan.startDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate()+(it.dayOffset||0)); const ymd=fmtDateYMD(d); if(!map.has(ymd)) map.set(ymd, []); map.get(ymd).push(it); }
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
                      <div className="font-medium text-gray-900 truncate">{it.title}</div>
                      <div className="text-gray-500 truncate">{it.time || "all-day"} • {it.durationMins||60}m{it.notes?` • ${it.notes}`:""}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-3">
            <label className="inline-flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap">
              <input type="checkbox" checked={replaceMode} onChange={(e)=>setReplaceMode(e.target.checked)} />
              <span className="hidden sm:inline">Replace existing tasks in this list before pushing</span>
              <span className="sm:hidden">Replace existing</span>
            </label>
            <button onClick={push} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-emerald-700 whitespace-nowrap">
              <span className="hidden sm:inline">Push to selected user</span><span className="sm:hidden">Push</span>
            </button>
            <button onClick={downloadICS} className="inline-flex items-center gap-2 rounded-xl border px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs whitespace-nowrap">
              <Download className="h-3 w-3" /> .ics
            </button>
            <button onClick={()=>{ setTasks([]); localStorage.removeItem("p2t_last_prefill"); setReplaceMode(false); setMsg("Preview cleared."); }}
              className="inline-flex items-center gap-2 rounded-xl border px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs whitespace-nowrap"><X className="h-3 w-3" /> Clear</button>
          </div>
        </>
      )}
      {msg && <div className="mt-2 text-xs text-gray-700">{msg}</div>}
    </div>
  );
}

/* ---- History ---- */
function HistoryPanel({ plannerEmail, userEmail, toast }){
  const [tab,setTab]=useState("active"); const [rows,setRows]=useState([]); const [q,setQ]=useState("");
  const [sel,setSel]=useState(new Set());

  // pagination
  const [page,setPage]=useState(1); const pageSize=25;
  const pageRows = useMemo(()=> rows.slice((page-1)*pageSize, (page)*pageSize), [rows,page]);
  const pageCount=Math.max(1, Math.ceil(rows.length/pageSize));

  async function load(){
    if (!userEmail){ setRows([]); return; }
    const qs=new URLSearchParams({ plannerEmail, userEmail, status: tab, q });
    const r=await fetch(`/api/history/list?${qs.toString()}`); const j=await r.json(); setRows(j.items||[]); setSel(new Set()); setPage(1);
  }
  useEffect(()=>{ load(); },[plannerEmail, userEmail, tab, q]);

  function toggle(id){ const n=new Set(sel); n.has(id)?n.delete(id):n.add(id); setSel(n); }
  function setAll(on){ setSel(on? new Set(pageRows.map(r=>r.id)) : new Set()); }

  async function doAction(action, ids){
    if (!ids.length) return;
    const ep = action==="archive" ? "/api/history/archive" : action==="unarchive" ? "/api/history/unarchive" : "/api/history/delete";
    const r=await fetch(ep,{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, planIds: ids }) });
    if (!r.ok){ const t=await r.text(); toast("error", t.slice(0,180)); return; }
    await load(); toast("success", `${action[0].toUpperCase()+action.slice(1)} ${ids.length} plan(s).`);
  }
  async function restore(id, duplicate=false){
    const r=await fetch("/api/history/restore",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, planId: id }) });
    const j=await r.json(); if (!r.ok) { toast("error", j.error||"Restore failed"); return; }
    const payload={ ok:true, userEmail, plan:j.plan, tasks:j.tasks }; if (duplicate) payload.plan.title = `${payload.plan.title} (copy)`;
    localStorage.setItem("p2t_last_prefill", JSON.stringify(payload)); toast("success","Loaded to composer. Switch to Plan tab.");
  }

  return (
    <div className="mt-6 sm:mt-8 rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="mb-2 sm:mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">History</div>
          <div className="text-[11px] sm:text-xs text-gray-500">Previously pushed lists for {userEmail || "—"}.</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" /><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search title…" className="px-2 py-1 text-sm outline-none w-36 sm:w-52" />
          </div>
          <div className="rounded-xl border border-gray-300 bg-white overflow-hidden">
            <button onClick={()=>setTab("active")} className={cn("px-2.5 py-1.5 text-xs", tab==="active"?"bg-cyan-600 text-white":"")}>Active</button>
            <button onClick={()=>setTab("archived")} className={cn("px-2.5 py-1.5 text-xs", tab==="archived"?"bg-cyan-600 text-white":"")}>Archived</button>
          </div>
        </div>
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px] sm:text-xs">
        <button onClick={()=>setAll(true)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
          <CheckSquare className="h-3 w-3"/> Select page
        </button>
        <div className="flex items-center gap-2">
          {tab==="active"
            ? <button onClick={()=>doAction("archive", Array.from(sel))} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><Archive className="h-3 w-3" /> Archive</button>
            : <button onClick={()=>doAction("unarchive", Array.from(sel))} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"><ArchiveRestore className="h-3 w-3" /> Unarchive</button>
          }
          <button onClick={()=>doAction("delete", Array.from(sel))}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1"><Trash2 className="h-3 w-3" /> Delete…</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs table-fixed min-w-[760px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="py-2 px-2 w-8"></th>
              <th className="py-2 px-2 w-[36%]">Title</th>
              <th className="py-2 px-2 w-28">Start</th>
              <th className="py-2 px-2 w-16">Items</th>
              <th className="py-2 px-2 w-20">Mode</th>
              <th className="py-2 px-2 w-40">Pushed</th>
              <th className="py-2 px-2 w-44 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r=>(
              <tr key={r.id} className="border-t">
                <td className="py-2 px-2"><input type="checkbox" checked={sel.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                <td className="py-2 px-2 truncate">{r.title}</td>
                <td className="py-2 px-2 whitespace-nowrap">{r.start_date}</td>
                <td className="py-2 px-2">{r.items_count}</td>
                <td className="py-2 px-2">{r.mode}</td>
                <td className="py-2 px-2 whitespace-nowrap">{new Date(r.pushed_at).toLocaleString()}</td>
                <td className="py-2 px-2">
                  <div className="flex justify-end gap-1 sm:gap-2">
                    <a href={`/api/history/ics?planId=${r.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap"><Download className="h-3 w-3" /> .ics</a>
                    <button onClick={()=>restore(r.id,false)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap">Restore</button>
                    <button onClick={()=>restore(r.id,true)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap">Duplicate</button>
                    {tab==="active"
                      ? <button onClick={()=>doAction("archive", [r.id])} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap"><Archive className="h-3 w-3" /></button>
                      : <button onClick={()=>doAction("unarchive", [r.id])} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 whitespace-nowrap"><ArchiveRestore className="h-3 w-3" /></button>
                    }
                    <button onClick={()=>doAction("delete", [r.id])}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1 whitespace-nowrap"><Trash2 className="h-3 w-3" /></button>
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

      {rows.length>pageSize && (
        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="text-gray-600">Page {page} of {pageCount}</div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(1)} disabled={page===1}><ChevronsLeft className="h-3 w-3" /></button>
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}><ChevronLeft className="h-3 w-3" /></button>
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(p=>Math.min(pageCount,p+1))} disabled={page===pageCount}><ChevronRight className="h-3 w-3" /></button>
            <button className="rounded-lg border px-2 py-1" onClick={()=>setPage(pageCount)} disabled={page===pageCount}><ChevronsRight className="h-3 w-3" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
