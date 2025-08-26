/* src/App.jsx — date button polish + responsive spacing; History UI unchanged */
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

/* -------------------- Inbox Drawer (unchanged) -------------------- */
// ... (KEEP YOUR EXISTING InboxDrawer FROM THE PREVIOUS FILE) ...

/* -------------------- UsersView (unchanged) -------------------- */
// ... (KEEP YOUR EXISTING UsersView FROM THE PREVIOUS FILE) ...

/* -------------------- SettingsView (unchanged) -------------------- */
// ... (KEEP YOUR EXISTING SettingsView FROM THE PREVIOUS FILE) ...

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

  const planDateText = format(parseISODate(plan.startDate)||new Date(),"EEE MMM d, yyyy");

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
      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-3">
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
          <button type="button" onClick={()=>setPlanDateOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">
            <Calendar className="h-4 w-4" /> {planDateText}
          </button>
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
        setMsg={(m)=>setMsg(m)}
      />

      <HistoryPanel plannerEmail={plannerEmail} userEmail={selectedUserEmail} />
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

  const taskDateText = format(parseISODate(taskDate)||new Date(),"EEE MMM d, yyyy");

  return (
    <div className="rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-4">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task title</div>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., Strength training" />
        </label>
        <div className="block">
          <div className="mb-1 text-sm font-medium">Task date</div>
          <button type="button" onClick={()=>setTaskDateOpen(true)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">
            <Calendar className="h-4 w-4" /> {taskDateText}
          </button>
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
        <button onClick={()=>{ setTitle(""); setNotes(""); setTime(""); setDur(60); setRepeat("none"); setTaskDate(planStartDate); }}
          className="inline-flex items-center gap-2 rounded-xl border px-2.5 sm:px-3 py-2 text-[11px] sm:text-xs whitespace-nowrap"><RotateCcw className="h-3 w-3" /> Reset</button>
      </div>
    </div>
  );
}

/* ---- Preview & push (unchanged, still snapshots History) ---- */
// ... (KEEP YOUR EXISTING ComposerPreview FROM THE PREVIOUS FILE) ...

/* ---- HistoryPanel (unchanged) ---- */
// ... (KEEP YOUR EXISTING HistoryPanel FROM THE PREVIOUS FILE) ...
