// src/App.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Download, Archive, ArchiveRestore, Trash2, ArrowRight, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown,
  Plus, RotateCcw, Info, Clock
} from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

/* ───────────── utils ───────────── */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function parseISODate(s){ if (!s) return null; const d=new Date(`${s}T00:00:00Z`); return Number.isNaN(d.getTime())?null:d; }
function fmtDateYMD(d){ const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,"0"); const dd=String(d.getUTCDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
function daysBetweenUTC(a,b){ const ms=86400000; const da=Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()); const db=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()); return Math.round((db-da)/ms); }
function addMonthsUTC(dateUTC, months){ const y=dateUTC.getUTCFullYear(), m=dateUTC.getUTCMonth(), d=dateUTC.getUTCDate(); const nmo=m+months; const ny=y+Math.floor(nmo/12); const nm=((nmo%12)+12)%12; const last=lastDayOfMonthUTC(ny,nm); const nd=Math.min(d,last); return new Date(Date.UTC(ny,nm,nd)); }
function lastDayOfMonthUTC(y,m0){ return new Date(Date.UTC(y,m0+1,0)).getUTCDate(); }
function firstWeekdayOfMonthUTC(y,m0,weekday){ const first=new Date(Date.UTC(y,m0,1)); const shift=(7+weekday-first.getUTCDay())%7; return new Date(Date.UTC(y,m0,1+shift)); }
function nthWeekdayOfMonthUTC(y,m0,weekday,nth){ const first=firstWeekdayOfMonthUTC(y,m0,weekday); const c=new Date(Date.UTC(y,m0, first.getUTCDate()+7*(nth-1))); return c.getUTCMonth()===m0?c:null; }
function lastWeekdayOfMonthUTC(y,m0,weekday){ const lastD=lastDayOfMonthUTC(y,m0); const last=new Date(Date.UTC(y,m0,lastD)); const shift=(7+last.getUTCDay()-weekday)%7; return new Date(Date.UTC(y,m0,lastD-shift)); }

/* human time parsing/formatting (baseline behavior) */
function parseTimeHuman(str){
  if (!str) return "";
  let s = String(str).trim().toLowerCase();
  if (s==="noon") return "12:00";
  if (s==="midnight") return "00:00";
  s = s.replace(/\./g, ":").replace(/\s+/g,"");
  const hasAm = /am$/.test(s); const hasPm = /pm$/.test(s);
  s = s.replace(/(am|pm)$/,"");
  let h=0, m=0;

  if (s.includes(":")){
    const [hh,mm="0"]=s.split(":");
    if (!/^\d+$/.test(hh) || !/^\d+$/.test(mm)) return null;
    h = Number(hh); m = Number(mm);
  } else {
    if (!/^\d+$/.test(s)) return null;
    if (s.length<=2) { h=Number(s); m=0; }
    else if (s.length===3) { h=Number(s.slice(0,1)); m=Number(s.slice(1)); }
    else { h=Number(s.slice(0,2)); m=Number(s.slice(2,4)); }
  }
  if (m<0||m>59) return null;
  if (hasAm||hasPm){
    if (h<1||h>12) return null;
    if (hasPm && h<12) h+=12;
    if (hasAm && h===12) h=0;
  } else {
    if (h<0||h>23) return null;
  }
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function to12hDisplay(hhmm){
  if (!hhmm) return "";
  const [h,m] = hhmm.split(":").map(Number);
  const ampm = h>=12 ? "pm" : "am";
  const h12 = h%12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}
function TimeInput({ value, onChange, placeholder="e.g., 2:30 pm" }){
  const [text,setText]=useState(() => to12hDisplay(value));
  const [bad,setBad]=useState(false);
  useEffect(()=>{ setText(to12hDisplay(value)); },[value]);

  function commit(){
    const parsed = parseTimeHuman(text);
    if (parsed===null){ setBad(true); return; }
    setBad(false);
    onChange(parsed || "");
    setText(to12hDisplay(parsed));
  }
  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e)=>{ setText(e.target.value); setBad(false); }}
        onBlur={commit}
        onKeyDown={(e)=>{ if (e.key==="Enter") { e.preventDefault(); commit(); } }}
        placeholder={placeholder}
        className={cn("w-full rounded-xl border px-3 py-2 text-sm h-10", bad?"border-red-400":"border-gray-300")}
      />
      {value && (
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          title="Clear"
          onClick={()=>{ onChange(""); setText(""); setBad(false); }}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/* ───────── Error boundary ───────── */
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
            <pre className="bg-red-100 p-3 text-xs text-red-900 overflow-auto rounded">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ───────── App shell ───────── */
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

  const [view,setView]=useState("users");
  const [selectedUserEmail,setSelectedUserEmail]=useState("");
  const [prefs,setPrefs]=useState({});
  const [inboxOpen,setInboxOpen]=useState(false);
  const [inboxBadge,setInboxBadge]=useState(0);
  const [toasts,setToasts]=useState([]);

  useEffect(()=>{ (async ()=>{
    const qs=new URLSearchParams({ plannerEmail });
    const r=await fetch(`/api/prefs/get?${qs.toString()}`);
    if (r.ok){ const j=await r.json(); const p=j.prefs||j;
      setPrefs(p);
      setView(p.default_view || "users");
    }
  })(); },[plannerEmail]);

  async function loadBadge(){
    try{
      const qs=new URLSearchParams({ plannerEmail, status:"new" });
      const r=await fetch(`/api/inbox?${qs.toString()}`); const j=await r.json();
      setInboxBadge((j.bumpCount||0));
    }catch(e){}
  }
  useEffect(()=>{ if (prefs.show_inbox_badge) loadBadge(); },[plannerEmail,prefs.show_inbox_badge]);

  function toast(type, text){ const id=uid(); setToasts(t=>[...t,{ id,type,text }]); setTimeout(()=>dismissToast(id), 5000); }
  function dismissToast(id){ setToasts(t=>t.filter(x=>x.id!==id)); }

  return (
    <div className="min-h-screen bg-gray-100">
      <Toasts items={toasts} dismiss={dismissToast} />
      <div className="mx-auto max-w-6xl">
        <div className="mb-3 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-lg sm:text-2xl font-bold whitespace-nowrap">Plan2Tasks</div>
            <nav className="ml-1 sm:ml-4 flex gap-1 sm:gap-2">
              <NavBtn active={view==="users"} onClick={()=>setView("users")} icon={<Users className="h-4 w-4" />}><span className="hidden sm:inline">Users</span></NavBtn>
              <NavBtn active={view==="plan"} onClick={()=>setView("plan")} icon={<Calendar className="h-4 w-4" />}><span className="hidden sm:inline">Plan</span></NavBtn>
              <NavBtn active={view==="settings"} onClick={()=>setView("settings")} icon={<SettingsIcon className="h-4 w-4" />}><span className="hidden sm:inline">Settings</span></NavBtn>
            </nav>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={()=>setInboxOpen(true)} className="relative rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs sm:text-sm hover:bg-gray-50 whitespace-nowrap">
              <InboxIcon className="inline h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Inbox</span>
              {prefs.show_inbox_badge && inboxBadge>0 && (
                <span className="absolute -top-2 -right-2 rounded-full bg-red-600 px-1.5 py-[2px] text-[10px] font-bold text-white">{inboxBadge}</span>
              )}
            </button>
            <span className="rounded-xl border border-gray-300 bg-white px-2.5 py-2 text-xs sm:text-sm whitespace-nowrap">
              <span className="hidden sm:inline">Signed in:&nbsp;</span><b className="truncate inline-block max-w-[140px] align-bottom">{plannerEmail}</b>
            </span>
            <button onClick={()=>supabaseClient.auth.signOut()} className="rounded-xl bg-gray-900 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-black whitespace-nowrap">Sign out</button>
          </div>
        </div>

        {view==="users" && (
          <UsersView
            plannerEmail={plannerEmail}
            onToast={(t,m)=>toast(t,m)}
            onManage={(email)=>{ setSelectedUserEmail(email); setView("plan"); }}
          />
        )}

        {view==="plan" && (
          <PlanView
            plannerEmail={plannerEmail}
            selectedUserEmailProp={selectedUserEmail}
            onToast={(t,m)=>toast(t,m)}
          />
        )}

        {view==="settings" && <SettingsView plannerEmail={plannerEmail} prefs={prefs} onChange={(p)=>setPrefs(p)} />}

        {inboxOpen && (
          <InboxDrawer
            plannerEmail={plannerEmail}
            onClose={()=>setInboxOpen(false)}
            onToast={(t,m)=>toast(t,m)}
          />
        )}
      </div>
    </div>
  );
}

/* ───────── nav & common ───────── */
function NavBtn({ active, onClick, icon, children }){
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs sm:text-sm",
        active ? "border-gray-800 bg-gray-900 text-white" : "border-gray-300 bg-white hover:bg-gray-50"
      )}
    >
      {icon} {children}
    </button>
  );
}
function Toasts({ items, dismiss }){
  return (
    <div className="fixed bottom-2 left-0 right-0 z-50 flex justify-center">
      <div className="flex max-w-[90vw] flex-col gap-2">
        {items.map(t=>(
          <div key={t.id} className={cn(
            "rounded-xl border px-3 py-2 text-sm shadow-sm",
            t.type==="ok" ? "border-green-300 bg-green-50 text-green-800" :
            t.type==="warn" ? "border-yellow-300 bg-yellow-50 text-yellow-800" :
            "border-red-300 bg-red-50 text-red-800"
          )}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{t.type==="ok"?"Success":t.type==="warn"?"Heads up":"Error"}</span>
              <span className="opacity-70">{t.text}</span>
            </div>
            <button onClick={()=>dismiss(t.id)} className="absolute right-1 top-1 text-xs text-gray-500 hover:text-gray-800">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Inbox Drawer (baseline) ───────── */
// (keep your baseline InboxDrawer code here)

/* ───────── Calendar modal (baseline) ───────── */
function Modal({ title, onClose, children }){
  useEffect(()=>{
    function onKey(e){ if (e.key==="Escape") onClose?.(); }
    document.addEventListener("keydown", onKey);
    return ()=>document.removeEventListener("keydown", onKey);
  },[onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black/10 p-2 sm:p-4">
      <div className="mx-auto max-w-lg rounded-xl border bg-white p-3 sm:p-4 shadow-lg">
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
  function same(d1,d2){ return d1.getUTCFullYear()===d2.getUTCFullYear() && d1.getUTCMonth()===d2.getUTCMonth() && d1.getUTCDate()===d2.getUTCDate(); }
  const weeks = useMemo(()=>{
    const out=[]; const firstDow=new Date(Date.UTC(vm.getUTCFullYear(), vm.getUTCMonth(), 1)).getUTCDay();
    const start=new Date(Date.UTC(vm.getUTCFullYear(), vm.getUTCMonth(), 1-firstDow));
    let cur = new Date(start); for (let r=0;r<6;r++){ const row=[]; for (let c=0;c<7;c++){ row.push(new Date(cur)); cur.setUTCDate(cur.getUTCDate()+1);} out.push(row); }
    return out;
  },[vm]);
  const monthLabel = (d)=> format(d, "LLLL yyyy");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(Date.UTC(v.getUTCFullYear()-1, v.getUTCMonth(), 1)))} title="Prev year"><ChevronsLeft className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth()-1, 1)))} title="Prev month"><ChevronLeft className="h-3 w-3" /></button>
          <div className="px-2 text-sm font-semibold">{monthLabel(vm)}</div>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth()+1, 1)))} title="Next month"><ChevronRight className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(Date.UTC(v.getUTCFullYear()+1, v.getUTCMonth(), 1)))} title="Next year"><ChevronsRight className="h-3 w-3" /></button>
        </div>
        <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(new Date(Date.UTC(init.getUTCFullYear(), init.getUTCMonth(), 1)))}>Jump to current</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row,ri)=>row.map((c,ci)=>(
          <button key={`${ri}-${ci}`} type="button"
            onClick={()=>onPick?.(fmtDateYMD(c))}
            className={cn(
              "rounded-lg border px-2 py-2 text-sm",
              c.getUTCMonth()===vm.getUTCMonth() ? "bg-white hover:bg-gray-50" : "bg-gray-50 text-gray-400",
              same(c, parseISODate(selectedDate)||new Date(0)) ? "border-gray-800 ring-1 ring-gray-700" : "border-gray-300"
            )}
          >
            {c.getUTCDate()}
          </button>
        )))}
      </div>
    </div>
  );
}

/* ───────── Plan view (baseline visuals; tiny tweaks noted inline) ───────── */
function PlanView({ plannerEmail, selectedUserEmailProp, onToast }){
  const [users,setUsers]=useState([]);
  const [selectedUserEmail,setSelectedUserEmail]=useState("");
  const [plan,setPlan]=useState({ title:"Weekly Plan", startDate: format(new Date(),"yyyy-MM-dd"), timezone:"America/Chicago" });
  const [tasks,setTasks]=useState([]);
  const [replaceMode,setReplaceMode]=useState(false);
  const [msg,setMsg]=useState("");
  const [planDateOpen,setPlanDateOpen]=useState(false);

  useEffect(()=>{ (async ()=>{
    const qs=new URLSearchParams({ op:"list", plannerEmail, status:"all" });
    const r=await fetch(`/api/users?${qs.toString()}`); const j=await r.json();
    setUsers(j.users||[]);
    const initial = selectedUserEmailProp || (j.users||[]).find(u=>u.status==="connected")?.email || (j.users?.[0]?.email || "");
    setSelectedUserEmail(initial);
  })(); },[plannerEmail, selectedUserEmailProp]);

  useEffect(()=>{ setTasks([]); setMsg(""); },[selectedUserEmail]);

  const planDateText = format(parseISODate(plan.startDate)||new Date(),"EEE MMM d, yyyy");

  const applyPrefill = useCallback(({ plan: rp, tasks: rt, mode })=>{
    try{
      setPlan(p=>({
        ...p,
        title: rp?.title ?? p.title,
        startDate: rp?.startDate ?? p.startDate,
        timezone: rp?.timezone ?? p.timezone
      }));
      setReplaceMode(mode === "replace");
      if (Array.isArray(rt)) {
        setTasks(rt.map(t=>({ id: uid(), ...t })));
        setMsg(`Restored ${rt.length} task(s) from history`);
        onToast?.("ok", `Restored ${rt.length} task(s)`);
      }
    }catch(e){ console.error("applyPrefill error", e); }
  },[onToast]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base sm:text-lg font-semibold">Plan (create & deliver tasks)</div>
          <div className="text-[11px] sm:text-xs text-gray-500">Set the <b>Plan Name</b> (list title), timezone, and start date. Add tasks, preview, then push.</div>
        </div>
        <div className="w-full sm:w-72">
          <select value={selectedUserEmail || ""} onChange={(e)=>setSelectedUserEmail(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="">— Choose user —</option>
            {users.map(u=><option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓":""}</option>)}
          </select>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <label className="block">
          {/* Change #1: label text */}
          <div className="mb-1 text-sm font-medium">Plan Name</div>
          <input value={plan.title} onChange={(e)=>setPlan({...plan, title:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="e.g., Week of Sep 1" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Timezone</div>
          <select value={plan.timezone} onChange={(e)=>setPlan({...plan, timezone:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz}</option>)}
          </select>
        </label>
        <div className="block">
          <div className="mb-1 text-sm font-medium">Plan start date</div>
          <button type="button" onClick={()=>setPlanDateOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap">
            <Calendar className="h-4 w-4" /> Choose Plan Start Date: {planDateText}
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

      <TaskEditor planStartDate={plan.startDate} onAdd={(items)=>setTasks(prev=>[...prev, ...items.map(t=>({ id: uid(), ...t }))])} />

      {/* Change #2: hide Preview & Deliver until at least one task exists */}
      {tasks.length>0 && (
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
      )}

      <HistoryPanel plannerEmail={plannerEmail} userEmail={selectedUserEmail} onPrefill={applyPrefill} />
    </div>
  );
}

/* ───────── Task editor (baseline) ───────── */
function TaskEditor({ planStartDate, onAdd }){
  const [title,setTitle]=useState("");
  const [notes,setNotes]=useState("");
  const [taskDate,setTaskDate]=useState(planStartDate);
  const [taskDateOpen,setTaskDateOpen]=useState(false);
  const [time,setTime]=useState("");
  const [dur,setDur]=useState(60);

  const [repeat,setRepeat]=useState("none");
  const [interval,setInterval]=useState(1);
  const [endMode,setEndMode]=useState("count");
  const [count,setCount]=useState(4);
  const [untilDate,setUntilDate]=useState("");
  const [horizonMonths,setHorizonMonths]=useState(6);
  const [weeklyDays,setWeeklyDays]=useState([false,true,false,true,false,false,false]);
  const [monthlyMode,setMonthlyMode]=useState("dom");

  useEffect(()=>{ if (!taskDate) setTaskDate(planStartDate); },[planStartDate]);

  function generate(){
    const name=title.trim(); if (!name) return;
    const planStart=parseISODate(planStartDate)||new Date();
    const base=parseISODate(taskDate)||planStart;
    const baseObj={ title:name, time: time || undefined, durationMins: Number(dur)||undefined, notes: notes || undefined };

    const added=[];
    function push(d){ const off=daysBetweenUTC(planStart, d); added.push({ ...baseObj, dayOffset: off }); }

    const step=Math.max(1, Number(interval)||1);
    if (repeat==="none"){ push(base); }
    if (repeat==="daily"){
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1);
        for (let i=0;i<n;i++){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); push(d); } }
      else if (endMode==="until"){ const until=parseISODate(untilDate)||new Date(addMonthsUTC(base, 1)); let i=0; while (i<2000){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); if (d>until) break; push(d); i++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let i=0; while (true){ const d=new Date(base); d.setUTCDate(d.getUTCDate()+i*step); if (d>end) break; push(d); if(++i>2000) break; } }
    }
    if (repeat==="weekly"){
      const checked=weeklyDays.map((v,i)=>v?i:null).filter(v=>v!==null);
      if (checked.length===0) { alert("Pick at least one weekday."); return; }
      const baseWeekday=base.getUTCDay();
      const baseStartOfWeek=new Date(base); baseStartOfWeek.setUTCDate(base.getUTCDate()-baseWeekday);
      const emitWeek=(weekIndex)=>{ for(const dow of checked){ const d=new Date(baseStartOfWeek); d.setUTCDate(d.getUTCDate()+dow+weekIndex*7*step); if (d>=base) push(d); } };
      if (endMode==="count"){ const n=Math.max(1, Number(count)||1); let week=0; while (added.length<n){ const before=added.length; emitWeek(week); if (added.length===before){ week++; continue; } if (added.length-before>checked.length) { /* safety */ } week++; if (added.length-before>checked.length) break; } if (added.length>n) added.length=n; }
      else if (endMode==="until"){ const until=parseISODate(untilDate)||new Date(addMonthsUTC(base, 3)); let week=0; while (week<520){ const before=added.length; emitWeek(week);
        if (added.length>before){ const lastIdx=added.length-1; const last=new Date(`${fmtDateYMD(new Date(planStart))}T00:00:00Z`); const lastOff=added[lastIdx]?.dayOffset??0; last.setUTCDate(last.getUTCDate()+lastOff);
          if (last>until){ while (added.length){ const test=new Date(`${fmtDateYMD(new Date(planStart))}T00:00:00Z`); const testOff=added[added.length-1]?.dayOffset??0; test.setUTCDate(test.getUTCDate()+testOff); if (test<=until) break; added.pop(); } break; } } week++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let week=0; while (week<520){ emitWeek(week);
        const lastDate=new Date(`${fmtDateYMD(new Date(planStart))}T00:00:00Z`); const lastOff=added.length? (added[added.length-1].dayOffset||0):0; lastDate.setUTCDate(lastDate.getUTCDate()+lastOff);
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
      else if (endMode==="until"){ const until=parseISODate(untilDate)||new Date(addMonthsUTC(base, 6)); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const d=compute(t.getUTCFullYear(), t.getUTCMonth()); if (d>until) break; push(d); i++; } }
      else { const end=addMonthsUTC(base, Math.max(1, Number(horizonMonths)||6)); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const d=compute(t.getUTCFullYear(), t.getUTCMonth()); if (d>end) break; push(d); i++; } }
    }

    if (added.length===0) return;
    onAdd(added);
    setTitle(""); setNotes(""); /* keep date/time for convenience */
  }

  const taskDateText = format(parseISODate(taskDate||planStartDate)||new Date(),"EEE MMM d, yyyy");

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-2 sm:p-3">
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2 sm:gap-3">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task title</div>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder='e.g., "Workout" or "Read 20 pages"' />
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium">Notes (optional)</div>
          <input value={notes} onChange={(e)=>setNotes(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>

      <div className="mt-2 grid grid-cols-1 sm:grid-cols-[repeat(3,minmax(0,1fr))] gap-2 sm:gap-3">
        <div className="block min-w-0">
          <div className="mb-1 text-sm font-medium">Task date</div>
          <button type="button" onClick={()=>setTaskDateOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap overflow-hidden h-10">
            <Calendar className="h-4 w-4 shrink-0" /> <span className="truncate">{taskDateText}</span>
          </button>
        </div>

        <label className="block min-w-0">
          <div className="mb-1 text-sm font-medium">Time (optional)</div>
          <TimeInput value={time} onChange={setTime} />
        </label>

        <label className="block min-w-0">
          <div className="mb-1 text-sm font-medium">Duration (mins)</div>
          <input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm h-10" />
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

      {/* Recurrence block (baseline) */}
      <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-sm font-medium">Repeat</div>
          <select value={repeat} onChange={(e)=>setRepeat(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>

          {repeat==="daily" && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm">Every</span>
              <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-sm">day(s)</span>
            </div>
          )}

          {repeat==="weekly" && (
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d,i)=>(
                <button key={d} type="button" className={pill(weeklyDays[i])} onClick={()=>setWeeklyDays(v=>{const n=[...v]; n[i]=!n[i]; return n;})}>{d}</button>
              ))}
            </div>
          )}

          {repeat==="monthly" && (
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-sm">Every</span>
              <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-sm">month(s)</span>
            </div>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-sm font-medium">End</div>
          <select value={endMode} onChange={(e)=>setEndMode(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
            <option value="count">After N</option>
            <option value="until">Until date</option>
            <option value="horizon">Over horizon</option>
          </select>

          {endMode==="count" && (
            <>
              <input type="number" min={1} value={count} onChange={(e)=>setCount(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-sm">occurrence(s)</span>
            </>
          )}

          {endMode==="until" && (
            <>
              <span className="text-sm">Date</span>
              <button type="button" onClick={()=>setTaskDateOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
                <Calendar className="h-4 w-4" /> {untilDate ? format(parseISODate(untilDate)||new Date(),"MMM d, yyyy") : "Pick date"}
              </button>
            </>
          )}

          {endMode==="horizon" && (
            <>
              <span className="text-sm">Months</span>
              <input type="number" min={1} value={horizonMonths} onChange={(e)=>setHorizonMonths(e.target.value)} className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
            </>
          )}
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
      </div>

      <div className="mt-3 flex items-center justify-between">
        <button onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-3 sm:px-4 py-2 text-sm font-semibold text-white hover:bg-black">
          <Plus className="h-4 w-4" /> Add to Plan
        </button>
        <div className="text-[11px] sm:text-xs text-gray-500 flex items-center gap-2">
          <Info className="h-3.5 w-3.5" /> Times are optional; recurrence supported above.
        </div>
      </div>
    </div>
  );
}
function pill(on){ return cn("rounded-full border px-2 py-1 text-xs sm:text-sm", on?"border-gray-800 bg-gray-900 text-white":"border-gray-300 bg-white hover:bg-gray-50"); }

/* ───────── Preview / Deliver (baseline) ───────── */
function ComposerPreview({ plannerEmail, selectedUserEmail, plan, tasks, setTasks, replaceMode, setReplaceMode, msg, setMsg }){
  const total=tasks.length;
  async function pushNow(){
    if (!selectedUserEmail) { setMsg("Choose a user first."); return; }
    if (!plan.title?.trim()) { setMsg("Title is required."); return; }
    if (!plan.startDate) { setMsg("Plan start date is required."); return; }
    if (!total) { setMsg("Add at least one task."); return; }
    setMsg("Pushing…");
    try {
      const resp = await fetch("/api/push", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          plannerEmail,
          userEmail: selectedUserEmail,
          listTitle: plan.title,
          timezone: plan.timezone,
          startDate: plan.startDate,
          mode: replaceMode ? "replace" : "append",
          items: tasks.map(t=>({ title:t.title, dayOffset:t.dayOffset, time:t.time, durationMins:t.durationMins, notes:t.notes }))
        })
      });
      const j = await resp.json();
      if (!resp.ok || j.error) throw new Error(j.error || "Push failed");

      await fetch("/api/history/snapshot",{
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          plannerEmail,
          userEmail: selectedUserEmail,
          listTitle: plan.title,
          plan: { title: plan.title, startDate: plan.startDate, timezone: plan.timezone },
          tasks: tasks.map(t=>({ title:t.title, dayOffset:t.dayOffset, time:t.time, durationMins:t.durationMins, notes:t.notes })),
          mode: replaceMode ? "replace" : "append",
        })
      });

      setMsg(`Success — ${j.created||total} task(s) created`);
      setTasks([]);
    } catch (e) {
      setMsg("Error: "+String(e.message||e));
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Preview & Deliver</div>
        <label className="inline-flex items-center gap-2 text-xs whitespace-nowrap">
          <input type="checkbox" checked={replaceMode} onChange={(e)=>setReplaceMode(e.target.checked)} />
          Replace existing list
        </label>
      </div>

      {!!msg && <div className="mb-2 text-xs sm:text-sm text-gray-500">{msg}</div>}

      {total===0 ? (
        <div className="text-sm text-gray-500">No tasks yet.</div>
      ) : (
        <div className="mb-3 sm:max-h-56 sm:overflow-auto rounded-lg border overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs sm:text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="py-1.5 px-2">Title</th>
                <th className="py-1.5 px-2">Offset</th>
                <th className="py-1.5 px-2">Time</th>
                <th className="py-1.5 px-2">Dur</th>
                <th className="py-1.5 px-2">Notes</th>
                <th className="py-1.5 px-2 text-right w-40 sm:w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(t=>(
                <tr key={t.id} className="border-t">
                  <td className="py-1.5 px-2">{t.title}</td>
                  <td className="py-1.5 px-2">{String(t.dayOffset||0)}</td>
                  <td className="py-1.5 px-2">{t.time?to12hDisplay(t.time):"—"}</td>
                  <td className="py-1.5 px-2">{t.durationMins||"—"}</td>
                  <td className="py-1.5 px-2 text-gray-500 truncate max-w-[200px]">{t.notes||"—"}</td>
                  <td className="py-1.5 px-2">
                    <div className="flex flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap">
                      <button onClick={()=>setTasks(prev=>prev.filter(x=>x.id!==t.id))} className="inline-flex items-center rounded-lg border p-1.5 hover:bg-gray-50" title="Remove">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span className="sr-only">Remove</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ───────── History/Users/Settings (baseline) ───────── */
// (keep your baseline HistoryPanel, UsersView, SettingsView code here)

/* ───────── Timezones (baseline) ───────── */
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];
