import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Trash2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, RotateCcw, Info
} from "lucide-react";
import { format } from "date-fns";

/* ───────────── utils (LOCAL DATE ONLY) ───────────── */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function parseYMDLocal(s){
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return new Date(y, mo-1, d);
}
function fmtYMDLocal(d){
  const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const dd=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function addDaysLocal(base, days){
  return new Date(base.getFullYear(), base.getMonth(), base.getDate()+days);
}
function daysBetweenLocal(a,b){
  const a0=new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const b0=new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round((b0 - a0)/86400000);
}
function addMonthsLocal(date, months){
  const y=date.getFullYear(), m=date.getMonth(), d=date.getDate();
  const nmo=m+months; const ny=y+Math.floor(nmo/12); const nm=((nmo%12)+12)%12;
  const last=new Date(ny, nm+1, 0).getDate();
  return new Date(ny, nm, Math.min(d,last));
}
function lastDayOfMonthLocal(y,m0){ return new Date(y, m0+1, 0).getDate(); }
function firstWeekdayOfMonthLocal(y,m0,weekday){
  const first=new Date(y,m0,1);
  const shift=(7+weekday-first.getDay())%7;
  return new Date(y,m0,1+shift);
}
function nthWeekdayOfMonthLocal(y,m0,weekday,nth){
  const first=firstWeekdayOfMonthLocal(y,m0,weekday);
  const c=new Date(y,m0, first.getDate()+7*(nth-1));
  return c.getMonth()===m0?c:null;
}
function lastWeekdayOfMonthLocal(y,m0,weekday){
  const lastD=lastDayOfMonthLocal(y,m0);
  const last=new Date(y,m0,lastD);
  const shift=(7+last.getDay()-weekday)%7;
  return new Date(y,m0,lastD-shift);
}

/* time formatting (display only) */
function to12hDisplay(hhmm){
  if (!hhmm) return "";
  const [h,m] = hhmm.split(":").map(Number);
  const ampm = h>=12 ? "pm" : "am";
  const h12 = h%12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

/* New: Dropdown time selector (15-minute steps) */
const TIME_OPTIONS = (() => {
  const out = [{ value: "", label: "— none —" }];
  for (let h=0; h<24; h++){
    for (let m=0; m<60; m+=15){
      const v = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      const h12 = (h%12) || 12;
      const ampm = h>=12 ? "pm" : "am";
      const label = `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
      out.push({ value: v, label });
    }
  }
  return out;
})();

function TimeSelect({ value, onChange }){
  return (
    <select
      value={value || ""}
      onChange={(e)=>onChange(e.target.value)}
      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm h-10"
    >
      {TIME_OPTIONS.map(opt=>(
        <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
      ))}
    </select>
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
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp(){
  const urlPE = new URLSearchParams(typeof window!=="undefined" ? window.location.search : "").get("plannerEmail");
  const plannerEmail = urlPE || "bartpaden@gmail.com";

  const [view,setView]=useState("users");
  const [selectedUserEmail,setSelectedUserEmail]=useState("");
  const [prefs,setPrefs]=useState({});
  const [inboxOpen,setInboxOpen]=useState(false);
  const [inboxBadge,setInboxBadge]=useState(0);
  const [toasts,setToasts]=useState([]);

  useEffect(()=>{ (async ()=>{
    try{
      const qs=new URLSearchParams({ plannerEmail });
      const r=await fetch(`/api/prefs/get?${qs.toString()}`);
      if (r.ok){ const j=await r.json(); const p=j.prefs||j;
        setPrefs(p||{});
        setView((p&&p.default_view) || "users");
      }
    }catch(e){/* noop */}
  })(); },[plannerEmail]);

  async function loadBadge(){
    try{
      const qs=new URLSearchParams({ plannerEmail, status:"new" });
      const r=await fetch(`/api/inbox?${qs.toString()}`); const j=await r.json();
      setInboxBadge((j.bumpCount||0));
    }catch(e){/* noop */}
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
              <span className="hidden sm:inline">Signed in:&nbsp;</span><b className="truncate inline-block max-w-[160px] align-bottom">{plannerEmail}</b>
            </span>
          </div>
        </div>

        {view==="users" && (
          <UsersView
            plannerEmail={plannerEmail}
            onToast={(t,m)=>toast(t,m)}
            onManage={(email)=>{ 
              setSelectedUserEmail(email);
              setView("plan");
            }}
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
          />
        )}
      </div>
    </div>
  );
}

/* ───────── nav & toasts ───────── */
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
            "relative rounded-xl border px-3 py-2 text-sm shadow-sm",
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

/* ───────── Inbox Drawer ───────── */
function InboxDrawer({ plannerEmail, onClose }){
  const [query,setQuery]=useState("");
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(false);
  const [sel,setSel]=useState({});

  async function search(){
    setLoading(true);
    try{
      const r=await fetch(`/api/inbox/search?q=${encodeURIComponent(query)}&plannerEmail=${encodeURIComponent(plannerEmail)}`);
      const j=await r.json();
      setItems(j.results||[]);
      const m={}; for (const r of (j.results||[])) m[r.id]=false; setSel(m);
    }catch(e){/* noop */}
    setLoading(false);
  }
  useEffect(()=>{ if (query.trim().length===0) setItems([]); },[query]);

  return (
    <div className="fixed inset-0 z-50 bg-black/10 p-2 sm:p-4">
      <div className="mx-auto max-w-2xl rounded-xl border bg-white p-3 sm:p-4 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Inbox</div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </div>

        <div className="mb-2 flex gap-2">
          <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search..." className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          <button onClick={search} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"><Search className="h-4 w-4" /></button>
        </div>

        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="py-1.5 px-2">Pick</th>
                <th className="py-1.5 px-2">Title</th>
                <th className="py-1.5 px-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {items.map(r=>(
                <tr key={r.id} className="border-t">
                  <td className="py-1.5 px-2"><input type="checkbox" checked={!!sel[r.id]} onChange={()=>setSel(s=>({ ...s, [r.id]: !s[r.id] }))} /></td>
                  <td className="py-1.5 px-2">{r.title}</td>
                  <td className="py-1.5 px-2 text-gray-500">{r.notes||"—"}</td>
                </tr>
              ))}
              {(!items||items.length===0) && (
                <tr><td colSpan={3} className="py-4 text-center text-gray-500">{loading?"Searching…":"No results"}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-gray-500">Search your inbox items to add to a plan.</div>
          <button onClick={onClose} className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">Done</button>
        </div>
      </div>
    </div>
  );
}

/* ───────── Modal + Calendar (LOCAL) ───────── */
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
  const init = parseYMDLocal(initialDate) || new Date();
  const sel = parseYMDLocal(selectedDate) || init;
  const [vm,setVm]=useState(()=>new Date(sel.getFullYear(), sel.getMonth(), 1));

  function same(d1,d2){ return d2 && d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate(); }

  const weeks = useMemo(()=>{
    const out=[];
    const firstDow=new Date(vm.getFullYear(), vm.getMonth(), 1).getDay();
    const start=new Date(vm.getFullYear(), vm.getMonth(), 1-firstDow);
    let cur = new Date(start);
    for (let r=0;r<6;r++){
      const row=[];
      for (let c=0;c<7;c++){ row.push(new Date(cur)); cur = addDaysLocal(cur,1); }
      out.push(row);
    }
    return out;
  },[vm]);

  const monthLabel = (d)=> format(d, "LLLL yyyy");

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(v.getFullYear()-1, v.getMonth(), 1))} title="Prev year"><ChevronsLeft className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(v.getFullYear(), v.getMonth()-1, 1))} title="Prev month"><ChevronLeft className="h-3 w-3" /></button>
          <div className="px-2 text-sm font-semibold">{monthLabel(vm)}</div>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(v.getFullYear(), v.getMonth()+1, 1))} title="Next month"><ChevronRight className="h-3 w-4" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(v=>new Date(v.getFullYear()+1, v.getMonth(), 1))} title="Next year"><ChevronsRight className="h-3 w-3" /></button>
        </div>
        <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>setVm(new Date(init.getFullYear(), init.getMonth(), 1))}>Jump to current</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row,ri)=>row.map((c,ci)=>(
          <button key={`${ri}-${ci}`} type="button"
            onClick={()=>onPick?.(fmtYMDLocal(c))}
            className={cn(
              "rounded-lg border px-2 py-2 text-sm",
              c.getMonth()===vm.getMonth() ? "bg-white hover:bg-gray-50" : "bg-gray-50 text-gray-400",
              same(c, parseYMDLocal(selectedDate)||new Date(0)) ? "border-gray-800 ring-1 ring-gray-700" : "border-gray-300"
            )}
          >
            {c.getDate()}
          </button>
        )))}
      </div>
    </div>
  );
}

/* ───────── Plan view ───────── */
function PlanView({ plannerEmail, selectedUserEmailProp, onToast }){
  const [users,setUsers]=useState([]);
  const [selectedUserEmail,setSelectedUserEmail]=useState("");
  const [plan,setPlan]=useState({ title:"Weekly Plan", startDate: format(new Date(),"yyyy-MM-dd"), timezone:"America/Chicago" });
  const [tasks,setTasks]=useState([]);
  const [replaceMode,setReplaceMode]=useState(false);
  const [msg,setMsg]=useState("");
  const [planDateOpen,setPlanDateOpen]=useState(false);
  const [histReloadKey,setHistReloadKey]=useState(0);

  useEffect(()=>{ 
    if (selectedUserEmailProp) setSelectedUserEmail(selectedUserEmailProp);
  },[selectedUserEmailProp]);

  useEffect(()=>{ (async ()=>{
    const qs=new URLSearchParams({ op:"list", plannerEmail, status:"all" });
    const r=await fetch(`/api/users?${qs.toString()}`); const j=await r.json();
    const arr = (j.users||[]).map(u => ({ ...u, email: u.email || u.userEmail || u.user_email || "" }));
    setUsers(arr);
    if (!selectedUserEmail) {
      const fromProp = selectedUserEmailProp && arr.find(a=>a.email===selectedUserEmailProp)?.email;
      const connected = arr.find(u=>u.status==="connected")?.email;
      const fallback = arr[0]?.email || "";
      setSelectedUserEmail(fromProp || connected || fallback || "");
    }
  })(); },[plannerEmail]);

  useEffect(()=>{ setTasks([]); setMsg(""); },[selectedUserEmail]);

  const planDateText = format(parseYMDLocal(plan.startDate)||new Date(),"EEE MMM d, yyyy");

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
          <div className="text-[11px] sm:text-xs text-gray-500">Set the <b>Plan Name</b>, timezone, and start date. Add tasks, preview, then push.</div>
          {!!msg && <div className="mt-1 text-xs text-gray-600">{msg}</div>}
        </div>
        <div className="w-full sm:w-72">
          <select
            value={selectedUserEmail || ""}
            onChange={(e)=>setSelectedUserEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            title={selectedUserEmail || "— Choose user —"}
          >
            <option value="">— Choose user —</option>
            {users.map(u=>(
              <option key={u.email} value={u.email} title={u.email}>
                {u.email} {u.status==="connected" ? "✓" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))]">
        <label className="block">
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

      <TaskEditor
        planStartDate={plan.startDate}
        onAdd={(items)=>{
          setTasks(prev=>[...prev, ...items.map(t=>({ id: uid(), ...t }))]);
          onToast?.("ok", `Added ${items.length} task${items.length>1?"s":""} to plan`);
        }}
      />

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
          setMsg={setMsg}
          onToast={onToast}
          onPushed={()=>{ setHistReloadKey(k=>k+1); }}
        />
      )}

      <HistoryPanel plannerEmail={plannerEmail} userEmail={selectedUserEmail} reloadKey={histReloadKey} onPrefill={applyPrefill} />
    </div>
  );
}

/* ───────── Task editor (Recurrence UI modernized) ───────── */
function TaskEditor({ planStartDate, onAdd }){
  const [title,setTitle]=useState("");
  const [notes,setNotes]=useState("");
  const [taskDate,setTaskDate]=useState(planStartDate);
  const [taskDateOpen,setTaskDateOpen]=useState(false);
  const [time,setTime]=useState("");
  const [dur,setDur]=useState(60);

  const [repeat,setRepeat]=useState("none");    // none | daily | weekly | monthly
  const [interval,setInterval]=useState(1);     // every N units (1 = every day/week/month)
  // End options: align with Google Calendar phrasing
  const [endMode,setEndMode]=useState("count"); // "horizon" (No end), "until" (On date), "count" (After)
  const [count,setCount]=useState(4);           // After <count> occurrences
  const [untilDate,setUntilDate]=useState("");  // On <date>
  const [untilOpen,setUntilOpen]=useState(false);
  const [horizonMonths,setHorizonMonths]=useState(6); // planning window for "No end date"
  const [weeklyDays,setWeeklyDays]=useState([false,true,false,true,false,false,false]);
  const [monthlyMode,setMonthlyMode]=useState("dom"); // dom | dow

  useEffect(()=>{ if (!taskDate) setTaskDate(planStartDate); },[planStartDate]);

  function generate(){
    const name=title.trim(); if (!name) return;
    const planStart=parseYMDLocal(planStartDate)||new Date();
    const base=parseYMDLocal(taskDate)||planStart;
    const baseObj={ title:name, time: time || undefined, durationMins: Number(dur)||undefined, notes: notes || undefined };

    const added=[];
    function push(d){ const off=daysBetweenLocal(planStart, d); added.push({ ...baseObj, dayOffset: off }); }

    const step=Math.max(1, Number(interval)||1);

    if (repeat==="none"){ push(base); }

    if (repeat==="daily"){
      if (endMode==="count"){
        const n=Math.max(1, Number(count)||1);
        for (let i=0;i<n;i++){ push(addDaysLocal(base, i*step)); }
      } else if (endMode==="until"){
        const until=parseYMDLocal(untilDate)||addMonthsLocal(base, 1);
        let i=0; while (i<2000){ const d=addDaysLocal(base, i*step); if (d>until) break; push(d); i++; }
      } else { // "horizon" => No end date (bounded by planning window)
        const end=addMonthsLocal(base, Math.max(1, Number(horizonMonths)||6));
        let i=0; for(;;){ const d=addDaysLocal(base, i*step); if (d>end) break; push(d); if(++i>2000) break; }
      }
    }

    if (repeat==="weekly"){
      const checked=weeklyDays.map((v,i)=>v?i:null).filter(v=>v!==null);
      if (checked.length===0) { alert("Pick at least one weekday."); return; }
      const baseDow=base.getDay();
      const baseStartOfWeek=addDaysLocal(base, -baseDow);
      const emitWeek=(weekIndex)=>{
        for(const dow of checked){
          const d=addDaysLocal(baseStartOfWeek, dow + weekIndex*7*step);
          if (d>=base) push(d);
        }
      };
      if (endMode==="count"){
        const n=Math.max(1, Number(count)||1);
        let week=0; while (added.length<n){ emitWeek(week); week++; }
        if (added.length>n) added.length=n;
      } else if (endMode==="until"){
        const until=parseYMDLocal(untilDate)||addMonthsLocal(base, 3);
        let week=0;
        while (week<520){
          emitWeek(week);
          const lastOff=added.length? (added[added.length-1].dayOffset||0) : 0;
          const lastDate = addDaysLocal(planStart, lastOff);
          if (lastDate>until) break;
          week++;
        }
      } else {
        const end=addMonthsLocal(base, Math.max(1, Number(horizonMonths)||6));
        let week=0;
        while (week<520){
          emitWeek(week);
          const lastOff=added.length? (added[added.length-1].dayOffset||0) : 0;
          const lastDate = addDaysLocal(planStart, lastOff);
          if (lastDate>end) break;
          week++;
        }
      }
    }

    if (repeat==="monthly"){
      const by=base.getFullYear(), bm=base.getMonth(), bd=base.getDate(), bw=base.getDay();
      const firstSame=firstWeekdayOfMonthLocal(by,bm,bw);
      const nth=Math.floor((base.getDate()-firstSame.getDate())/7)+1;
      const lastSame=lastWeekdayOfMonthLocal(by,bm,bw);
      const isLast=(base.getDate()===lastSame.getDate());
      const compute=(y,m0)=> monthlyMode==="dom"
        ? new Date(y,m0, Math.min(bd, lastDayOfMonthLocal(y,m0)))
        : (isLast ? lastWeekdayOfMonthLocal(y,m0,bw) : (nthWeekdayOfMonthLocal(y,m0,bw, Math.max(1,nth)) || lastWeekdayOfMonthLocal(y,m0,bw)));
      if (endMode==="count"){
        const n=Math.max(1, Number(count)||1);
        for (let i=0;i<n;i++){ const t=addMonthsLocal(base, i*step); push(compute(t.getFullYear(), t.getMonth())); }
      } else if (endMode==="until"){
        const until=parseYMDLocal(untilDate)||addMonthsLocal(base, 6);
        let i=0; while (i<240){ const t=addMonthsLocal(base, i*step); const d=compute(t.getFullYear(), t.getMonth()); if (d>until) break; push(d); i++; }
      } else {
        const end=addMonthsLocal(base, Math.max(1, Number(horizonMonths)||6));
        let i=0; while (i<240){ const t=addMonthsLocal(base, i*step); const d=compute(t.getFullYear(), t.getMonth()); if (d>end) break; push(d); i++; }
      }
    }

    if (added.length===0) return;
    onAdd(added);
    setTitle(""); setNotes("");
  }

  const taskDateText = format(parseYMDLocal(taskDate||planStartDate)||new Date(),"EEE MMM d, yyyy");

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
          <TimeSelect value={time} onChange={setTime} />
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

      {/* Recurrence — wording already modernized */}
      <div className="mt-2 rounded-xl border border-gray-200 bg-white p-2 sm:p-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-sm font-medium">Repeat</div>
          <select value={repeat} onChange={(e)=>setRepeat(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
            <option value="none">Doesn’t repeat</option>
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
          <div className="text-sm font-medium">Ends</div>
          <select
            value={endMode}
            onChange={(e)=>setEndMode(e.target.value)}
            className="rounded-xl border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="horizon">No end date</option>
            <option value="until">On date</option>
            <option value="count">After</option>
          </select>

          {endMode==="count" && (
            <>
              <input
                type="number"
                min={1}
                value={count}
                onChange={(e)=>setCount(e.target.value)}
                className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm"
              />
              <span className="text-sm">occurrence(s)</span>
            </>
          )}

          {endMode==="until" && (
            <>
              <span className="text-sm">Date</span>
              {/* using same calendar modal pattern */}
              <UntilDatePicker value={untilDate} setValue={setUntilDate} planStartDate={planStartDate} />
            </>
          )}

          {endMode==="horizon" && (
            <>
              <span className="text-sm">Planning window (months)</span>
              <input
                type="number"
                min={1}
                value={horizonMonths}
                onChange={(e)=>setHorizonMonths(e.target.value)}
                className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm"
              />
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

/* helper for until date picking */
function UntilDatePicker({ value, setValue, planStartDate }){
  const [open,setOpen]=useState(false);
  const label = value ? format(parseYMDLocal(value)||new Date(),"MMM d, yyyy") : "Pick date";
  return (
    <>
      <button type="button" onClick={()=>setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
        <Calendar className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <Modal title="Choose Until Date" onClose={()=>setOpen(false)}>
          <CalendarGridFree
            initialDate={value || planStartDate}
            selectedDate={value || planStartDate}
            onPick={(ymd)=>{ setValue(ymd); setOpen(false); }}
          />
        </Modal>
      )}
    </>
  );
}

function pill(on){ return cn("rounded-full border px-2 py-1 text-xs sm:text-sm", on?"border-gray-800 bg-gray-900 text-white":"border-gray-300 bg-white hover:bg-gray-50"); }

/* ───────── Preview / Deliver ───────── */
function ComposerPreview({ plannerEmail, selectedUserEmail, plan, tasks, setTasks, replaceMode, setReplaceMode, msg, setMsg, onToast, onPushed }){
  const total=tasks.length;

  async function pushNow(){
    if (!selectedUserEmail) { setMsg("Choose a user first."); onToast?.("warn","Choose a user first"); return; }
    if (!plan.title?.trim()) { setMsg("Title is required."); onToast?.("warn","Title is required"); return; }
    if (!plan.startDate) { setMsg("Plan start date is required."); onToast?.("warn","Plan start date is required"); return; }
    if (!total) { setMsg("Add at least one task."); onToast?.("warn","Add at least one task"); return; }
    setMsg("Pushing…");
    try {
      // 1) Push to Google Tasks (existing backend)
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

      // 2) Snapshot to History (backend)
      try{
        const snap = await fetch("/api/history/snapshot",{
          method:"POST", headers:{ "Content-Type":"application/json" },
          body: JSON.stringify({
            plannerEmail,
            userEmail: selectedUserEmail,
            listTitle: plan.title,
            startDate: plan.startDate,
            mode: replaceMode ? "replace" : "append",
            items: tasks.map(t=>({ title:t.title, dayOffset:t.dayOffset, time:t.time, durationMins:t.durationMins, notes:t.notes }))
          })
        });
        const sj = await snap.json();
        if (!snap.ok || sj.error) {
          onToast?.("warn", "Pushed, but could not save to History");
        }
      } catch (_e) {
        onToast?.("warn", "Pushed, but could not save to History");
      }

      const created = j.created || total;
      setMsg(`Success — ${created} task(s) created`);
      onToast?.("ok", `Pushed ${created} task${created>1?"s":""}`);
      setTasks([]);                 // clear preview
      onPushed?.(created);          // ask History to reload
    } catch (e) {
      const m = String(e.message||e);
      setMsg("Error: "+m);
      onToast?.("error", m);
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
        <>
          <div className="mb-3 rounded-lg border overflow-x-auto">
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

          <div className="flex items-center justify-end">
            <button onClick={pushNow} className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
              Push to Google Tasks
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── History ───────── */
function HistoryPanel({ plannerEmail, userEmail, reloadKey, onPrefill }){
  const [rows,setRows]=useState([]);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [loading,setLoading]=useState(false);

  async function load(){
    if (!userEmail) { setRows([]); setTotal(0); return; }
    setLoading(true);
    try{
      const r=await fetch(`/api/history/list`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ plannerEmail, userEmail, status: "active", page })
      });
      const j=await r.json();
      setRows(j.rows||[]);
      setTotal(j.total||0);
    }catch(e){/* noop */}
    setLoading(false);
  }
  useEffect(()=>{ load(); },[plannerEmail,userEmail,page,reloadKey]);

  return (
    <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold">History</div>
        <div className="text-xs text-gray-500">{total} plan(s)</div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="py-1.5 px-2">Title</th>
              <th className="py-1.5 px-2">Start</th>
              <th className="py-1.5 px-2">Items</th>
              <th className="py-1.5 px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.id} className="border-t">
                <td className="py-1.5 px-2">{r.title}</td>
                <td className="py-1.5 px-2">{r.startDate}</td>
                <td className="py-1.5 px-2">{r.itemsCount||"—"}</td>
                <td className="py-1.5 px-2">
                  <div className="flex justify-end">
                    <button onClick={()=>onPrefill?.({ plan:{ title:r.title, startDate:r.startDate, timezone:r.timezone }, tasks:r.tasks, mode:r.mode })} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50">Restore</button>
                  </div>
                </td>
              </tr>
            ))}
            {(!rows || rows.length===0) && (
              <tr><td colSpan={4} className="py-6 text-center text-gray-500">{loading?"Loading…":"No history yet"}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2">
        <button onClick={()=>setPage(p=>Math.max(1,p-1))} className="rounded-lg border px-2 py-1 text-xs"><ChevronLeft className="h-3 w-3" /></button>
        <div className="text-xs">Page {page}</div>
        <button onClick={()=>setPage(p=>p+1)} className="rounded-lg border px-2 py-1 text-xs"><ChevronRight className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

/* ───────── Users view ───────── */
function UsersView({ plannerEmail, onToast, onManage }){
  const [rows,setRows]=useState([]);
  const [filter,setFilter]=useState("");
  const [groups,setGroups]=useState({});
  const [sending,setSending]=useState(false);

  async function load(){
    const qs=new URLSearchParams({ plannerEmail, status:"all" });
    const r=await fetch(`/api/users?${qs.toString()}`); const j=await r.json();
    const arr = (j.users||[]).map(u => ({ ...u, email: u.email || u.userEmail || u.user_email || "" }));
    setRows(arr);
  }
  useEffect(()=>{ load(); },[plannerEmail]);

  async function saveGroups(email){
    try{
      const body={ plannerEmail, userEmail: email, groups: groups[email]||[] };
      const r=await fetch("/api/users",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const j=await r.json();
      if (!r.ok || j.error) throw new Error(j.error||"Save failed");
      onToast?.("ok", "Saved groups");
    }catch(e){ onToast?.("error", String(e.message||e)); }
  }

  const visible = rows.filter(r=>!filter || (r.email||"").toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold">Users</div>
        <div className="flex items-center gap-2">
          <input value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="Search…" className="rounded-xl border border-gray-300 px-2 py-1 text-sm" />
          <button onClick={load} className="rounded-xl border px-2 py-1 text-sm hover:bg-gray-50"><RotateCcw className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="py-1.5 px-2">Email</th>
              <th className="py-1.5 px-2">Status</th>
              <th className="py-1.5 px-2">Groups</th>
              <th className="py-1.5 px-2 text-right w-56">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r=>(
              <tr key={r.email} className="border-t">
                <td className="py-1.5 px-2">{r.email || "Unknown"}</td>
                <td className="py-1.5 px-2">{r.status||"—"}</td>
                <td className="py-1.5 px-2">
                  <div className="flex flex-wrap gap-1">
                    {(groups[r.email]||r.groups||[]).map(g=>(
                      <span key={g} className="rounded-full border px-2 py-0.5 text-xs">{g}</span>
                    ))}
                  </div>
                </td>
                <td className="py-1.5 px-2">
                  <div className="flex flex-nowrap items-center justify-end gap-1.5">
                    <button onClick={()=>onManage?.(r.email)} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50">Manage</button>
                    <button onClick={()=>{ const v=prompt("Comma-separated groups", (groups[r.email]||r.groups||[]).join(", ")); if (v===null) return; const arr=v.split(",").map(s=>s.trim()).filter(Boolean); setGroups(g=>({ ...g, [r.email]: arr })); saveGroups(r.email); }} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50">Edit Groups</button>
                    {(r.status!=="connected") && (
                      <button disabled={sending} onClick={async()=>{ setSending(true); try{ const resp=await fetch("/api/invite/send",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ plannerEmail, userEmail:r.email })}); const j=await resp.json(); if (!resp.ok || j.error) throw new Error(j.error||"Invite failed"); onToast?.("ok","Invite sent"); }catch(e){ onToast?.("error",String(e.message||e)); } setSending(false); }} className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50">Send Invite</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {visible.length===0 && (
              <tr><td colSpan={4} className="py-6 text-center text-gray-500">No users</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────── Settings ───────── */
function SettingsView({ plannerEmail, prefs, onChange }){
  const [local,setLocal]=useState(()=>{
    return {
      default_view: prefs.default_view || "users",
      default_timezone: prefs.default_timezone || "America/Chicago",
      default_push_mode: prefs.default_push_mode || "append",
      auto_archive_after_assign: !!prefs.auto_archive_after_assign,
      show_inbox_badge: !!prefs.show_inbox_badge,
    };
  });

  useEffect(()=>{ setLocal({
    default_view: prefs.default_view || "users",
    default_timezone: prefs.default_timezone || "America/Chicago",
    default_push_mode: prefs.default_push_mode || "append",
    auto_archive_after_assign: !!prefs.auto_archive_after_assign,
    show_inbox_badge: !!prefs.show_inbox_badge,
  }); },[prefs]);

  async function save(){
    try{
      const body={ plannerEmail, prefs: local };
      const r=await fetch("/api/prefs/set",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(body) });
      const j=await r.json();
      if (!r.ok || j.error) throw new Error(j.error||"Save failed");
      onChange?.(local);
    }catch(e){/* noop */}
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm">
      <div className="mb-3 text-sm font-semibold">Settings</div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Default view</div>
          <select value={local.default_view} onChange={(e)=>setLocal({...local, default_view:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="users">Users</option>
            <option value="plan">Plan</option>
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium">Default timezone</div>
          <select value={local.default_timezone} onChange={(e)=>setLocal({...local, default_timezone:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz}</option>)}
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium">Default push mode</div>
          <select value={local.default_push_mode} onChange={(e)=>setLocal({...local, default_push_mode:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="append">Append</option>
            <option value="replace">Replace</option>
          </select>
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium">Auto-archive after assign</div>
          <input type="checkbox" checked={!!local.auto_archive_after_assign} onChange={(e)=>setLocal({...local, auto_archive_after_assign:(e.target.checked)})} />
        </label>

        <label className="block">
          <div className="mb-1 text-sm font-medium">Show inbox badge</div>
          <input type="checkbox" checked={!!local.show_inbox_badge} onChange={(e)=>setLocal({...local, show_inbox_badge:(e.target.checked)})} />
        </label>
      </div>

      <div className="mt-3">
        <button onClick={save} className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">Save</button>
      </div>
    </div>
  );
}

/* ───────── Timezones ───────── */
const TIMEZONES = [
  "America/Chicago","America/New_York","America/Denver","America/Los_Angeles",
  "UTC","Europe/London","Europe/Berlin","Asia/Tokyo","Australia/Sydney"
];
