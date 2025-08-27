import * as React from "react";
import { addDays, format, parseISO, isValid as isValidDate } from "date-fns";
import { supabase } from "../lib/supabase.js";
import { Calendar, Users as UsersIcon, Send, LogOut, Settings as SettingsIcon, Tag, ChevronDown } from "lucide-react";

/* ----------------------- tiny helpers ----------------------- */
function clsx(...xs) { return xs.filter(Boolean).join(" "); }
function toast(msg, type="ok"){ alert((type==="error"?"Error: ":"")+msg); }

/* ----------------------- brand ----------------------- */
function BrandLogo() {
  // Your logo path—ensure file exists at /public/brand/logo-dark.svg
  return <img src="/brand/logo-dark.svg" alt="Plan2Tasks" className="h-6 w-auto" />;
}

/* ----------------------- shells ----------------------- */
function Section({ title, right, children }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-3">{children}</div>
    </div>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-gray-50">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ----------------------- Invite Modal (top-right only) ----------------------- */
function InviteModal({ plannerEmail, userEmail: presetEmail, onClose }) {
  const [email, setEmail] = React.useState(presetEmail || "");
  const [state, setState] = React.useState({ loading:false, link:"", emailed:false, canSend:false, sending:false, error:"", fromLabel:"" });

  React.useEffect(()=>{
    (async()=>{
      try{
        const r = await fetch("/api/invite/cansend");
        const j = await r.json();
        setState(s=>({...s, canSend: !!j.emailEnabled, fromLabel: j.from||""}));
      }catch{}
    })();
  },[]);

  async function createLink(){
    setState(s=>({...s, loading:true, error:"", link:"", emailed:false}));
    try{
      if(!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
      const qs = new URLSearchParams({ plannerEmail, userEmail: email });
      const r = await fetch(`/api/invite/preview?`+qs.toString());
      const j = await r.json();
      if(!r.ok || j.error || !j.inviteUrl) throw new Error(j.error || "Failed to prepare invite");
      setState(s=>({...s, loading:false, link:j.inviteUrl}));
      toast("Invite link created");
    }catch(e){ setState(s=>({...s, loading:false})); toast(String(e.message||e), "error"); }
  }
  async function copy(){ try{ await navigator.clipboard.writeText(state.link); toast("Invite link copied"); }catch{ toast("Could not copy link","error"); } }
  async function send(){
    if(!state.canSend) return;
    setState(s=>({...s, sending:true}));
    try{
      const r = await fetch(`/api/invite/send`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, userEmail: email })});
      const j = await r.json();
      if(!r.ok || j.error) throw new Error(j.error || "Send failed");
      setState(s=>({...s, sending:false, emailed:true}));
      toast("Invite email sent");
    }catch(e){ setState(s=>({...s, sending:false})); toast(String(e.message||e),"error"); }
  }

  return (
    <Modal title="Invite user to connect Google Tasks" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <div className="mb-1 text-xs font-medium">User email</div>
          <input value={email} onChange={e=>setEmail(e.target.value)} type="email" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" placeholder="name@example.com"/>
        </label>
        <div className="flex items-center gap-2">
          <button onClick={createLink} className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700">Create Invite Link</button>
          {state.link ? <button onClick={copy} className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">Copy Link</button> : null}
        </div>
        {state.loading ? <div className="text-sm text-gray-600">Preparing invite…</div> : null}
        {state.error ? <div className="text-sm text-red-600">Error: {state.error}</div> : null}
        {state.link ? (
          <>
            <div className="text-xs text-gray-600">Invite link</div>
            <div className="flex items-center gap-2">
              <input readOnly value={state.link} className="flex-1 rounded-xl border px-3 py-2 text-xs" />
              <button onClick={copy} className="rounded-xl border px-2.5 py-2 text-xs hover:bg-gray-50">Copy</button>
            </div>
          </>
        ):null}
        <div className="border-t pt-2">
          {state.canSend ? (
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-500">From: <b>{state.fromLabel}</b></div>
              <button onClick={send} disabled={!state.link||state.sending} className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50">
                {state.emailed ? "Resend Email" : "Send Email"}
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
              Email sending is not configured. You can still copy and share the link.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------- Settings (modal) ----------------------- */
function SettingsModal({ onClose }) {
  const key = "p2t.autoArchive";
  const [autoArchive, setAutoArchive] = React.useState(() => localStorage.getItem(key) === "1");
  function toggle(){
    const v = !autoArchive;
    setAutoArchive(v);
    localStorage.setItem(key, v ? "1" : "0");
    toast(v ? "Auto-archive enabled" : "Auto-archive disabled");
  }
  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Auto-archive after assign</div>
          <div className="text-xs text-gray-600">When ON, Inbox bundles auto-archive after assignment.</div>
        </div>
        <button onClick={toggle} className={clsx("rounded-full px-3 py-1.5 text-xs border", autoArchive ? "bg-cyan-600 text-white border-cyan-600" : "hover:bg-gray-50")}>
          {autoArchive ? "On" : "Off"}
        </button>
      </div>
    </Modal>
  );
}

/* ----------------------- date & time ----------------------- */
function parseUserTimeTo24h(input){
  if(!input) return null;
  let s = String(input).trim().toLowerCase().replace(/\s+/g,"");
  const ampm = s.endsWith("am") ? "am" : s.endsWith("pm") ? "pm" : "";
  if(ampm) s = s.slice(0,-2);
  if(/^\d{3,4}$/.test(s)){
    const hh = s.length===3 ? "0"+s[0] : s.slice(0,2);
    const mm = s.slice(-2);
    let H = parseInt(hh,10); const M = parseInt(mm,10);
    if(isNaN(H)||isNaN(M)||H>23||M>59) return null;
    return `${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}`;
  }
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if(!m) return null;
  let H = parseInt(m[1],10);
  let M = m[2] ? parseInt(m[2],10) : 0;
  if(ampm==="am"){ if(H===12) H=0; } else if(ampm==="pm"){ if(H!==12) H=H+12; }
  if(H>23||M>59) return null;
  return `${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}`;
}

function DateInput({ value, onChange, buttonLabel }){
  const [open,setOpen] = React.useState(false);
  const d = value ? (typeof value==="string" ? parseISO(value) : value) : null;
  const label = d && isValidDate(d) ? format(d,"EEE, MMM d, yyyy") : "Choose date";
  return (
    <div className="relative">
      <button type="button" onClick={()=>setOpen(v=>!v)} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
        {buttonLabel || label}
      </button>
      {open ? (
        <div className="absolute z-10 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <CalendarGrid initialDate={d || new Date()} onPick={(picked)=>{ setOpen(false); onChange(picked); }}/>
        </div>
      ):null}
    </div>
  );
}
function CalendarGrid({ initialDate, onPick }){
  const [base,setBase] = React.useState(new Date(initialDate));
  const monthLabel = format(base,"MMMM yyyy");
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const firstDay = start.getDay();
  const daysInMonth = new Date(base.getFullYear(), base.getMonth()+1, 0).getDate();
  const cells=[]; for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1; d<=daysInMonth; d++) cells.push(new Date(base.getFullYear(), base.getMonth(), d));
  return (
    <div className="text-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <button className="rounded-lg px-2 py-1 hover:bg-gray-50" onClick={()=>setBase(b=>new Date(b.getFullYear(), b.getMonth()-1,1))}>‹</button>
        <div className="font-semibold">{monthLabel}</div>
        <button className="rounded-lg px-2 py-1 hover:bg-gray-50" onClick={()=>setBase(b=>new Date(b.getFullYear(), b.getMonth()+1,1))}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map(w=><div key={w} className="pb-1 text-center text-[11px] text-gray-500">{w}</div>)}
        {cells.map((c,idx)=> c ? (
          <button key={idx} onClick={()=>onPick(c)} className="rounded-lg px-0.5 py-1.5 text-center hover:bg-gray-50">{c.getDate()}</button>
        ) : <div key={idx} />)}
      </div>
    </div>
  );
}

/* ----------------------- Time input (picker or custom) ----------------------- */
function TimeInput({ value, onChange }) {
  const [mode, setMode] = React.useState("picker"); // "picker" | "custom"
  const times = React.useMemo(()=>{
    const result=[];
    const start=6*60, end=21*60+30; // 6:00 to 21:30
    for(let m=start;m<=end;m+=30){
      const H=Math.floor(m/60), M=m%60;
      const dt = new Date(); dt.setHours(H,M,0,0);
      const label = format(dt, "h:mma").toLowerCase();
      const v = `${String(H).padStart(2,"0")}:${String(M).padStart(2,"0")}`;
      result.push({ v, label });
    }
    return result;
  },[]);

  if(mode==="custom"){
    return (
      <div>
        <input
          value={value}
          onChange={(e)=>onChange(e.target.value)}
          placeholder="e.g., 1:30pm"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="mt-1 flex items-center justify-between">
          <div className="text-[11px] text-gray-500">Formats: “1pm”, “1:30pm”, “13:30”, “1330”</div>
          <button className="text-[11px] underline" onClick={()=>setMode("picker")}>Use picker</button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={value || ""}
        onChange={(e)=>onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-gray-300 px-3 py-2 text-sm"
      >
        <option value="">—</option>
        {times.map(t=> <option key={t.v} value={t.v}>{t.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4 text-gray-500" />
      <div className="mt-1 text-right">
        <button className="text-[11px] underline" onClick={()=>setMode("custom")}>Custom…</button>
      </div>
    </div>
  );
}

/* ----------------------- Users: edit categories ----------------------- */
function CategoriesModal({ plannerEmail, user, onClose, onSaved }) {
  const [input, setInput] = React.useState("");
  const [chips, setChips] = React.useState(Array.isArray(user.groups) ? user.groups : (user.group ? [user.group] : []));
  function addChip(){
    const v = input.trim();
    if(!v) return;
    if(!chips.includes(v)) setChips([...chips, v]);
    setInput("");
  }
  function removeChip(t){ setChips(chips.filter(c=>c!==t)); }
  async function save(){
    try{
      const r = await fetch("/api/users/update", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ plannerEmail, userEmail: user.email, groups: chips })
      });
      const j = await r.json().catch(()=>({}));
      if(!r.ok || j.error) throw new Error(j.error || "Save failed");
      toast("Categories saved");
      onSaved?.(chips);
      onClose();
    }catch(e){ toast(String(e.message||e),"error"); }
  }
  return (
    <Modal title={`Edit categories – ${user.email}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input value={input} onChange={e=>setInput(e.target.value)} placeholder="Add category (e.g., Mentoring)" className="flex-1 rounded-xl border px-3 py-2 text-sm"/>
          <button onClick={addChip} className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.length===0 ? <div className="text-sm text-gray-500">No categories yet.</div> : chips.map(c=>(
            <span key={c} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
              <Tag size={12} /> {c}
              <button onClick={()=>removeChip(c)} className="rounded px-1 text-[10px] hover:bg-gray-100">×</button>
            </span>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">Cancel</button>
          <button onClick={save} className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}

/* ----------------------- Users view ----------------------- */
function UsersView({ plannerEmail, onManage }) {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [editUser, setEditUser] = React.useState(null);

  React.useEffect(()=>{ loadUsers(); /* eslint-disable-next-line */ },[plannerEmail]);

  async function loadUsers(){
    setLoading(true);
    try{
      const qs = new URLSearchParams({ plannerEmail });
      let r = await fetch(`/api/users?`+qs.toString());
      if(r.status===404) r = await fetch(`/api/users/list?`+qs.toString());
      const j = await r.json().catch(()=>({}));
      const arr = Array.isArray(j) ? j : j.users || [];
      setUsers(arr);
    }catch{ toast("Failed to load users","error"); }
    finally{ setLoading(false); }
  }

  const filtered = users.filter(u=>{
    if(!q) return true;
    const hay = `${u.email||""} ${(Array.isArray(u.groups)?u.groups.join(" "):u.group||"")} ${u.status||""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  function applySavedGroups(userEmail, groups){
    setUsers(prev=> prev.map(u=> u.email===userEmail ? {...u, groups} : u));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search (email, categories, status)" className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-64"/>
          <button onClick={()=>setInviteOpen(true)} className="rounded-xl bg-cyan-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-cyan-700">Invite User</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-gray-600">
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Categories</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
            ) : filtered.length===0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">No users yet.</td></tr>
            ) : (
              filtered.map(u=>(
                <tr key={u.email} className="border-t">
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(u.groups) && u.groups.length>0 ? u.groups.join(", ") : (u.group || "—")}
                  </td>
                  <td className="px-3 py-2">
                    {u.status==="connected" ? (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 border border-green-200">Connected</span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-800 border border-yellow-200">Not connected</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={()=>setEditUser(u)} className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Edit Categories</button>
                      <button onClick={()=>onManage(u.email)} className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700">Manage User</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {inviteOpen ? <InviteModal plannerEmail={plannerEmail} userEmail="" onClose={()=>setInviteOpen(false)} /> : null}
      {editUser ? (
        <CategoriesModal
          plannerEmail={plannerEmail}
          user={editUser}
          onClose={()=>setEditUser(null)}
          onSaved={(groups)=>{ applySavedGroups(editUser.email, groups); }}
        />
      ) : null}
    </div>
  );
}

/* ----------------------- Plan view (includes History section inside) ----------------------- */

function DayPills({ value, onChange }) {
  const days = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d,idx)=>{
        const on = value.includes(idx);
        return (
          <button key={d} type="button" onClick={()=>{
            const set = new Set(value); if(on) set.delete(idx); else set.add(idx);
            onChange(Array.from(set).sort((a,b)=>a-b));
          }} className={clsx("rounded-full px-2.5 py-1 text-xs border", on?"bg-cyan-600 text-white border-cyan-600":"bg-white text-gray-700 hover:bg-gray-50")}>
            {d}
          </button>
        );
      })}
    </div>
  );
}

function PlanView({ plannerEmail, selectedUserEmail, onChangeUserEmail, onPushed }) {
  const [users, setUsers] = React.useState([]);
  const [listTitle, setListTitle] = React.useState("");
  const [planDate, setPlanDate] = React.useState(null);
  const [timezone, setTimezone] = React.useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");

  const [items, setItems] = React.useState([]);
  const [newTitle, setNewTitle] = React.useState("");
  const [newNotes, setNewNotes] = React.useState("");
  const [newDate, setNewDate] = React.useState(null);
  const [newTime, setNewTime] = React.useState("");
  const [recurring, setRecurring] = React.useState({ type:"none", weeklyDays:[], monthlyDay:null, end:"none", count:5, until:null });

  // History embedded
  const [histTab, setHistTab] = React.useState("active"); // active | archived
  const [historyRows, setHistoryRows] = React.useState([]);
  const [histLoading, setHistLoading] = React.useState(false);

  React.useEffect(()=>{ (async()=>{
    try{
      const qs = new URLSearchParams({ plannerEmail });
      let r = await fetch(`/api/users?`+qs.toString());
      if(r.status===404) r = await fetch(`/api/users/list?`+qs.toString());
      const j = await r.json().catch(()=>({}));
      const arr = Array.isArray(j) ? j : j.users || [];
      // Prefer connected first
      arr.sort((a,b)=> (a.status==="connected"?0:1) - (b.status==="connected"?0:1));
      setUsers(arr);
    }catch{ /* ignore */ }
  })(); },[plannerEmail]);

  React.useEffect(()=>{ loadHistory(); /* eslint-disable-next-line */ },[plannerEmail, selectedUserEmail, histTab]);

  async function loadHistory(){
    setHistLoading(true);
    try{
      const body = { plannerEmail, userEmail: selectedUserEmail || undefined, status: histTab };
      const r = await fetch("/api/history/list",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      setHistoryRows(Array.isArray(j.items) ? j.items : []);
    }catch{ setHistoryRows([]); }
    finally{ setHistLoading(false); }
  }

  function applyPrefill(block){
    if(!block) return;
    setListTitle(block.title||"");
    setPlanDate(block.start_date ? parseISO(block.start_date) : null);
    setTimezone(block.timezone || timezone);
    const mapped = (block.items||[]).map(it=>({
      title: it.title||"", notes: it.notes||"", date: it.due ? parseISO(it.due) : null, time: it.due ? format(parseISO(it.due),"HH:mm") : ""
    }));
    setItems(mapped);
  }

  async function restoreHistory(id){
    try{
      const r = await fetch("/api/history/restore",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, historyId:id })});
      const j = await r.json();
      if(!j.ok) throw new Error(j.error||"Restore failed");
      applyPrefill(j.planBlock);
      toast("Restored into Plan");
    }catch(e){ toast(String(e.message||e),"error"); }
  }
  async function setArchived(id, archived){
    try{
      const r = await fetch("/api/history/archive",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, historyId:id, archived })});
      const j = await r.json();
      if(!j.ok) throw new Error(j.error||"Update failed");
      await loadHistory();
      toast(archived ? "Archived" : "Unarchived");
    }catch(e){ toast(String(e.message||e),"error"); }
  }

  function addItem(){
    if(!newTitle.trim()) return toast("Add a task title","error");
    const batch=[]; const baseDate = newDate || planDate || new Date();
    const time24 = newTime ? newTime : null; // picker already returns HH:mm, custom validated later
    const timeParsed = time24 || parseUserTimeTo24h(newTime);
    function withTime(d){ if(!d) return null; if(!timeParsed) return d; const [hh,mm]=timeParsed.split(":").map(n=>parseInt(n,10)); const dt=new Date(d); dt.setHours(hh,mm,0,0); return dt; }

    if(recurring.type==="none"){
      batch.push({ title:newTitle.trim(), notes:newNotes.trim(), date:withTime(baseDate), time: timeParsed||"" });
    } else if(recurring.type==="daily"){
      const n = recurring.end==="count" ? Math.max(1,Number(recurring.count||1)) : 10;
      let cur = new Date(baseDate);
      for(let i=0;i<n;i++){ batch.push({ title:newTitle.trim(), notes:newNotes.trim(), date:withTime(cur), time: timeParsed||"" }); cur=addDays(cur,1); }
    } else if(recurring.type==="weekly"){
      if(!recurring.weeklyDays.length) return toast("Pick days of week","error");
      const n = recurring.end==="count" ? Math.max(1,Number(recurring.count||1)) : 10;
      let cur=new Date(baseDate), added=0;
      const until = recurring.until ? new Date(recurring.until) : null;
      while(added<n){
        if(until && cur>until) break;
        if(recurring.weeklyDays.includes(cur.getDay())){ batch.push({ title:newTitle.trim(), notes:newNotes.trim(), date:withTime(cur), time: timeParsed||"" }); added++; }
        cur=addDays(cur,1);
      }
    } else if(recurring.type==="monthly"){
      const n = recurring.end==="count" ? Math.max(1,Number(recurring.count||1)) : 6;
      const start=new Date(baseDate); const day=recurring.monthlyDay||start.getDate();
      for(let i=0;i<n;i++){
        const d=new Date(start.getFullYear(), start.getMonth()+i, Math.min(day,28));
        if(recurring.until && d > new Date(recurring.until)) break;
        batch.push({ title:newTitle.trim(), notes:newNotes.trim(), date:withTime(d), time: timeParsed||"" });
      }
    }
    setItems(prev=>[...prev, ...batch]);
    setNewTitle(""); setNewNotes(""); setNewTime("");
    setRecurring({ type:"none", weeklyDays:[], monthlyDay:null, end:"none", count:5, until:null });
  }
  function removeItem(idx){ setItems(prev=>prev.filter((_,i)=>i!==idx)); }

  async function pushToGoogle(){
    if(!selectedUserEmail) return toast("Select a user first","error");
    if(!listTitle.trim()) return toast("List title is required","error");
    if(items.length===0) return toast("No tasks to push","error");
    const startISO = planDate ? format(planDate,"yyyy-MM-dd") : format(new Date(),"yyyy-MM-dd");
    const planBlock = {
      title:listTitle.trim(), start_date:startISO, timezone,
      items: items.map(it=>{
        const due = it.date ? format(it.date,"yyyy-MM-dd") + (it.time ? `T${it.time}:00.000Z` : "") : null;
        return { title: it.title, notes: it.notes, due };
      }),
    };
    try{
      const r = await fetch("/api/push",{ method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ plannerEmail, userEmail: selectedUserEmail, planBlock, mode:"append" })});
      const j = await r.json();
      if(!r.ok || j.error) throw new Error(j.error||"Push failed");
      toast("Pushed to Google Tasks"); onPushed?.(); setItems([]);
    }catch(e){ toast(String(e.message||e),"error"); }
  }

  function exportICS(){
    const startISO = planDate ? format(planDate,"yyyy-MM-dd") : format(new Date(),"yyyy-MM-dd");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Plan2Tasks//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VTODO"
    ];
    lines.push(`SUMMARY:${listTitle || "Tasks"}`);
    lines.push(`DTSTAMP:${format(new Date(), "yyyyMMdd'T'HHmmss'Z'")}`);
    items.forEach((it, idx)=>{
      lines.push("END:VTODO");
      lines.push("BEGIN:VTODO");
      lines.push(`UID:p2t-${idx}-${Date.now()}@plan2tasks`);
      lines.push(`SUMMARY:${it.title}`);
      if(it.notes) lines.push(`DESCRIPTION:${it.notes.replace(/\n/g,"\\n")}`);
      if(it.date){
        const dueDate = format(it.date, it.time ? "yyyyMMdd'T'HHmmss'Z'" : "yyyyMMdd");
        lines.push(`DUE:${dueDate}`);
      }
    });
    lines.push("END:VTODO");
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(listTitle || "plan2tasks").replace(/\s+/g,"-").toLowerCase()}.ics`;
    a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 1500);
  }

  return (
    <div className="space-y-4">
      {/* Deliver-to user + timezone */}
      <Section
        title="Plan"
        right={
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="hidden sm:inline">Timezone</span>
            <input value={timezone} onChange={e=>setTimezone(e.target.value)} className="w-48 rounded-xl border border-gray-300 px-2 py-1 text-xs"/>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <div className="mb-1 text-xs font-medium">Deliver to user</div>
            <select
              value={selectedUserEmail || ""}
              onChange={(e)=> onChangeUserEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Select user —</option>
              {users.map(u=>(
                <option key={u.email} value={u.email}>
                  {u.email}{u.status==="connected"?"":" (not connected)"}
                </option>
              ))}
            </select>
          </label>

          <div className="block">
            <div className="mb-1 text-xs font-medium">Choose Plan Start Date</div>
            <DateInput value={planDate} onChange={d=>setPlanDate(d)} buttonLabel={planDate ? format(planDate,"EEE, MMM d, yyyy") : "Pick date"} />
          </div>
        </div>

        <div className="mt-2 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium">Task list title</div>
            <input value={listTitle} onChange={e=>setListTitle(e.target.value)} placeholder="e.g., Onboarding – Week 1" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"/>
          </label>
          <div />

          <label className="block">
            <div className="mb-1 text-xs font-medium">Task title</div>
            <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="What needs to be done?" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"/>
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium">Notes (optional)</div>
            <input value={newNotes} onChange={e=>setNewNotes(e.target.value)} placeholder="Any extra details" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"/>
          </label>

          <div className="block">
            <div className="mb-1 text-xs font-medium">Task date</div>
            <DateInput value={newDate} onChange={d=>setNewDate(d)} buttonLabel={newDate ? format(newDate,"EEE, MMM d, yyyy") : "Pick date"} />
          </div>
          <label className="block">
            <div className="mb-1 text-xs font-medium">Time (optional)</div>
            <TimeInput value={newTime} onChange={setNewTime} />
          </label>

          {/* Recurrence */}
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium">Recurrence</div>
            <div className="flex flex-wrap gap-2">
              {["none","daily","weekly","monthly"].map(t=>(
                <button key={t} type="button" onClick={()=>setRecurring(r=>({...r, type:t}))} className={clsx("rounded-full border px-3 py-1 text-xs", recurring.type===t?"bg-cyan-600 text-white border-cyan-600":"hover:bg-gray-50")}>
                  {t[0].toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>

            {recurring.type==="weekly" ? (
              <div className="mt-2">
                <div className="mb-1 text-xs text-gray-600">Days of week</div>
                <DayPills value={recurring.weeklyDays} onChange={v=>setRecurring(r=>({...r, weeklyDays:v}))}/>
              </div>
            ):null}

            {recurring.type==="monthly" ? (
              <div className="mt-2">
                <div className="mb-1 text-xs text-gray-600">Day of month</div>
                <input type="number" min={1} max={31} value={recurring.monthlyDay||""} onChange={e=>setRecurring(r=>({...r, monthlyDay:Number(e.target.value||1)}))} className="w-24 rounded-xl border border-gray-300 px-2 py-1 text-sm"/>
              </div>
            ):null}

            {recurring.type!=="none" ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="rec-end" checked={recurring.end==="none"} onChange={()=>setRecurring(r=>({...r,end:"none", until:null}))}/>
                  <span>Indefinite (limited preview)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" name="rec-end" checked={recurring.end==="count"} onChange={()=>setRecurring(r=>({...r,end:"count", until:null}))}/>
                  <span>Generate <input type="number" min={1} value={recurring.count} onChange={e=>setRecurring(r=>({...r,count:Number(e.target.value||1)}))} className="mx-1 w-16 rounded-lg border px-2 py-1 text-sm" /> items</span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" name="rec-end" checked={recurring.end==="until"} onChange={()=>setRecurring(r=>({...r,end:"until"}))}/>
                    <span>End on date</span>
                  </label>
                  {recurring.end==="until" ? (
                    <DateInput value={recurring.until} onChange={(d)=>setRecurring(r=>({...r, until:d }))} />
                  ) : null}
                </div>
              </div>
            ):null}
          </div>

          <div className="col-span-full flex items-center gap-2">
            <button onClick={addItem} className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">Add task</button>
          </div>
        </div>
      </Section>

      {/* History embedded */}
      <Section
        title={`History ${selectedUserEmail ? `for ${selectedUserEmail}` : ""}`}
        right={
          <div className="rounded-xl border">
            <div className="flex overflow-hidden rounded-xl">
              {["active","archived"].map(t=>(
                <button key={t} onClick={()=>setHistTab(t)} className={clsx("px-3 py-1.5 text-xs", histTab===t?"bg-gray-900 text-white":"hover:bg-gray-50")}>
                  {t[0].toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-600">
                <th className="px-3 py-2 font-medium">Title</th>
                <th className="px-3 py-2 font-medium">Start date</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium">Mode</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {histLoading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Loading…</td></tr>
              ) : historyRows.length===0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Nothing here yet.</td></tr>
              ) : (
                historyRows.map(r=>(
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.title}</td>
                    <td className="px-3 py-2">{r.start_date}</td>
                    <td className="px-3 py-2">{r.items_count}</td>
                    <td className="px-3 py-2">{r.mode}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={()=>restoreHistory(r.id)} className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Restore</button>
                        {histTab==="active" ? (
                          <button onClick={()=>setArchived(r.id,true)} className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Archive</button>
                        ) : (
                          <button onClick={()=>setArchived(r.id,false)} className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Unarchive</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Preview & Deliver */}
      {items.length>0 ? (
        <Section
          title="Preview & Deliver"
          right={
            <div className="flex items-center gap-2">
              <button onClick={exportICS} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Export .ics</button>
              <button onClick={pushToGoogle} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
                <Send size={16}/> Push to Google Tasks
              </button>
            </div>
          }
        >
          <div className="space-y-2">
            <div className="text-sm text-gray-600">Delivering to: <b>{selectedUserEmail || "—"}</b></div>
            <div className="rounded-xl border border-gray-100">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-gray-600">
                    <th className="px-3 py-2 font-medium">Task</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                    <th className="px-3 py-2 font-medium text-right">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it,idx)=>(
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2">{it.date ? format(it.date,"yyyy-MM-dd") : "—"}</td>
                      <td className="px-3 py-2">{it.time || "—"}</td>
                      <td className="px-3 py-2">{it.notes || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={()=>removeItem(idx)} className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/* ----------------------- App Shell ----------------------- */
function AppShell() {
  const [sessionEmail, setSessionEmail] = React.useState("");
  const [tab, setTab] = React.useState("users");
  const [selectedUserEmail, setSelectedUserEmail] = React.useState("");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  React.useEffect(()=>{
    (async()=>{
      try{
        const { data } = await supabase.auth.getUser();
        setSessionEmail(data?.user?.email || "");
      }catch{}
    })();
  },[]);

  async function logout(){ try{ await supabase.auth.signOut(); window.location.href="/"; }catch{ window.location.href="/"; } }

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandLogo />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={()=>setInviteOpen(true)} className="hidden sm:inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">
            Invite User
          </button>
          <button onClick={()=>setSettingsOpen(true)} className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">
            <SettingsIcon size={14}/> Settings
          </button>
          <button onClick={logout} className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">
            <LogOut size={14}/> Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-2">
        <button onClick={()=>setTab("users")} className={clsx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm", tab==="users"?"bg-gray-900 text-white border-gray-900":"hover:bg-gray-50")}>
          <UsersIcon size={16}/> Users
        </button>
        <button onClick={()=>setTab("plan")} className={clsx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm", tab==="plan"?"bg-gray-900 text-white border-gray-900":"hover:bg-gray-50")}>
          <Calendar size={16}/> Plan
        </button>
      </div>

      {/* Views */}
      {tab==="users" ? (
        <UsersView plannerEmail={sessionEmail} onManage={(email)=>{ setSelectedUserEmail(email); setTab("plan"); }}/>
      ) : (
        <PlanView
          plannerEmail={sessionEmail}
          selectedUserEmail={selectedUserEmail}
          onChangeUserEmail={setSelectedUserEmail}
          onPushed={()=>{/* after push we stay here; history is embedded */}}
        />
      )}

      {inviteOpen ? <InviteModal plannerEmail={sessionEmail} userEmail="" onClose={()=>setInviteOpen(false)} /> : null}
      {settingsOpen ? <SettingsModal onClose={()=>setSettingsOpen(false)} /> : null}
    </div>
  );
}

export default function Plan2TasksApp(){ return <AppShell/>; }
