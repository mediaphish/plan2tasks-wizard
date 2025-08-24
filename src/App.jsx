/* src/App.jsx — Plan2Tasks
   - Inbox tabs (New / Assigned / Archived) with bulk actions + confirm modals
   - Assign stamps metadata; optional auto-archive toggle
   - Manage User view includes History panel with restore/duplicate/export/archive/delete
   - Snapshot saved after successful push via /api/history/snapshot
*/
import React, { useMemo, useState, useEffect } from "react";
import {
  Calendar, Users, Inbox as InboxIcon, Plus, Trash2, Edit3, Save, Search, Tag, FolderPlus,
  ArrowRight, Download, RotateCcw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, X, Info,
  Archive, ArchiveRestore, CheckSquare, Square
} from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

/* ---------- tiny utils ---------- */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function parseISODate(s){ if (!s) return null; const d = new Date(`${s}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
function addDaysSafe(startDateStr, d){ const base = parseISODate(startDateStr) || new Date(); const dt = new Date(base); dt.setDate(dt.getDate() + (Number(d) || 0)); return dt; }
function fmtDateYMD(d){ const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,"0"); const dd=String(d.getUTCDate()).padStart(2,"0"); return `${y}-${m}-${dd}`; }
function fmtDayLabel(startDateStr, d){ try { return format(addDaysSafe(startDateStr, d), "EEE MMM d"); } catch { return ""; } }
function daysBetweenUTC(a,b){ const ms=24*3600*1000; const da=Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),a.getUTCDate()); const db=Date.UTC(b.getUTCFullYear(),b.getUTCMonth(),b.getUTCDate()); return Math.round((db-da)/ms); }
function lastDayOfMonthUTC(y, m0){ return new Date(Date.UTC(y, m0+1, 0)).getUTCDate(); }
function addMonthsUTC(dateUTC, months){
  const y=dateUTC.getUTCFullYear(), m=dateUTC.getUTCMonth(), d=dateUTC.getUTCDate();
  const nm = m + months; const ny = y + Math.floor(nm/12); const nmo = ((nm%12)+12)%12;
  const last = lastDayOfMonthUTC(ny, nmo); const nd = Math.min(d, last);
  return new Date(Date.UTC(ny, nmo, nd));
}
function firstWeekdayOfMonthUTC(y,m0,weekday){ const first = new Date(Date.UTC(y,m0,1)); const shift = (7 + weekday - first.getUTCDay()) % 7; return new Date(Date.UTC(y,m0,1+shift)); }
function nthWeekdayOfMonthUTC(y,m0,weekday,nth){ const first = firstWeekdayOfMonthUTC(y,m0,weekday); const candidate = new Date(Date.UTC(y,m0, first.getUTCDate() + 7*(nth-1))); return candidate.getUTCMonth()===m0 ? candidate : null; }
function lastWeekdayOfMonthUTC(y,m0,weekday){ const lastD = lastDayOfMonthUTC(y,m0); const last = new Date(Date.UTC(y,m0,lastD)); const shift = (7 + last.getUTCDay() - weekday) % 7; return new Date(Date.UTC(y,m0,lastD - shift)); }
function offsetFromStart(startDateStr, cellDateUTC){
  const s = parseISODate(startDateStr);
  const sUTC = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  const cUTC = Date.UTC(cellDateUTC.getUTCFullYear(), cellDateUTC.getUTCMonth(), cellDateUTC.getUTCDate());
  return Math.round((cUTC - sUTC) / (24*3600*1000));
}
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];

/* ---------- ErrorBoundary ---------- */
class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={ error:null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error("UI crash:", error, info); }
  render(){
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-red-50 p-6">
          <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-red-700">Something went wrong in the UI</h2>
            <pre className="overflow-auto rounded bg-red-100 p-3 text-xs text-red-900">{String(this.state.error?.message || this.state.error)}</pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------- Auth ---------- */
function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState("");
  const [msg, setMsg] = useState("");

  async function handleSignup() {
    setMsg("Creating account...");
    const { data, error } = await supabaseClient.auth.signUp({ email, password: pw });
    if (error) return setMsg("Error: " + error.message);
    if (!data.session) { setMsg("Check your email to confirm, then sign in."); return; }
    onSignedIn(data.session);
  }
  async function handleSignin() {
    setMsg("Signing in...");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pw });
    if (error) return setMsg("Error: " + error.message);
    onSignedIn(data.session);
  }
  async function handleGoogle() {
    setMsg("Redirecting to Google...");
    const { error } = await supabaseClient.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setMsg("Error: " + error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-1">Plan2Tasks – Planner Account</h1>
        <p className="text-sm text-gray-500 mb-4">Create your planner account, then manage users and deliver tasks.</p>

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
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        {mode === "signup" ? (
          <button onClick={handleSignup} className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Create account</button>
        ) : (
          <button onClick={handleSignin} className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Sign in</button>
        )}
        <div className="mt-3 text-xs text-gray-600">{msg}</div>
        <div className="mt-4 text-xs">
          {mode === "signup" ? (
            <span>Already have an account? <button className="text-cyan-700 underline" onClick={()=>setMode("signin")}>Sign in</button></span>
          ) : (
            <span>New here? <button className="text-cyan-700 underline" onClick={()=>setMode("signup")}>Create an account</button></span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Root ---------- */
export default function App() {
  return (
    <ErrorBoundary>
      <AppInner />
    </ErrorBoundary>
  );
}

function AppInner(){
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription?.unsubscribe();
  }, []);
  if (!session) return <AuthScreen onSignedIn={(s)=>setSession(s)} />;

  const plannerEmail = session.user?.email || "";
  return <AppShell plannerEmail={plannerEmail} />;
}

/* ---------- Shell & routing ---------- */
function AppShell({ plannerEmail }) {
  const [view, setView] = useState("inbox"); // inbox | users | plan
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [prefillPayload, setPrefillPayload] = useState(null);

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Plan2Tasks</h1>
            <nav className="ml-4 flex gap-2">
              <button onClick={()=>setView("inbox")}
                className={cn("rounded-xl px-3 py-2 text-sm font-semibold", view==="inbox" ? "bg-cyan-600 text-white" : "bg-white border border-gray-300")}>
                <InboxIcon className="inline h-4 w-4 mr-1" /> Inbox
              </button>
              <button onClick={()=>setView("users")}
                className={cn("rounded-xl px-3 py-2 text-sm font-semibold", view==="users" ? "bg-cyan-600 text-white" : "bg-white border border-gray-300")}>
                <Users className="inline h-4 w-4 mr-1" /> Users
              </button>
              <button onClick={()=>setView("plan")}
                className={cn("rounded-xl px-3 py-2 text-sm font-semibold", view==="plan" ? "bg-cyan-600 text-white" : "bg-white border border-gray-300")}>
                <Calendar className="inline h-4 w-4 mr-1" /> Plan
              </button>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="rounded-xl border border-gray-300 bg-white px-3 py-2">Signed in: <b>{plannerEmail}</b></span>
            <button onClick={()=>supabaseClient.auth.signOut()} className="rounded-xl bg-gray-900 px-3 py-2 font-semibold text-white hover:bg-black">Sign out</button>
          </div>
        </header>

        {view === "inbox" && (
          <InboxScreen
            plannerEmail={plannerEmail}
            onAssign={(payload)=>{
              try { localStorage.setItem("p2t_last_prefill", JSON.stringify(payload)); } catch {}
              setPrefillPayload(payload);
              setSelectedUserEmail(payload.userEmail);
              setView("plan");
            }}
          />
        )}
        {view === "users" && (
          <UsersDashboard
            plannerEmail={plannerEmail}
            onCreateTasks={(email)=>{ setSelectedUserEmail(email); setView("plan"); }}
          />
        )}
        {view === "plan" && (
          <TasksWizard
            plannerEmail={plannerEmail}
            initialSelectedUserEmail={selectedUserEmail}
            prefillPayload={prefillPayload}
            onPrefillConsumed={()=>setPrefillPayload(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ---------- Confirm Modal ---------- */
function ConfirmModal({ open, title, body, confirmText="Confirm", confirmClass="bg-red-600", onConfirm, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 text-sm font-semibold">{title}</div>
        <div className="mb-3 text-xs text-gray-700 whitespace-pre-wrap">{body}</div>
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border px-3 py-1.5 text-xs">Cancel</button>
          <button onClick={onConfirm} className={cn("rounded-lg px-3 py-1.5 text-xs text-white", confirmClass)}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Inbox Screen with tabs & bulk ---------- */
function InboxScreen({ plannerEmail, onAssign }) {
  const [tab, setTab] = useState("new"); // new | assigned | archived
  const [bundles, setBundles] = useState([]);
  const [assignUser, setAssignUser] = useState("");
  const [users, setUsers] = useState([]);
  const [autoArchive, setAutoArchive] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [mod, setMod] = useState({open:false, action:null, ids:[], text:""});

  async function loadBundles() {
    const qs = new URLSearchParams({ plannerEmail, status: tab });
    const r = await fetch(`/api/inbox?${qs.toString()}`);
    const j = await r.json();
    setBundles(j.bundles || []);
    setSelected(new Set());
  }
  async function loadUsers() {
    const params = new URLSearchParams({ op:"list", plannerEmail, status: "connected" });
    const resp = await fetch(`/api/users?${params.toString()}`);
    const data = await resp.json();
    setUsers(data.users || []);
  }
  useEffect(()=>{ loadUsers(); }, [plannerEmail]);
  useEffect(()=>{ loadBundles(); }, [plannerEmail, tab]);

  function toggle(id){
    const next = new Set(selected); next.has(id) ? next.delete(id) : next.add(id); setSelected(next);
  }
  function allIds(){ return (bundles||[]).map(b=>b.id); }
  function setAll(checked){
    setSelected(checked ? new Set(allIds()) : new Set());
  }

  async function doAction(action, ids) {
    const body = { plannerEmail, bundleIds: ids };
    const ep = action === "archive" ? "/api/inbox/archive"
            : action === "restore" ? "/api/inbox/restore"
            : "/api/inbox/delete";
    const r = await fetch(ep, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) alert(j.error || "Failed");
    await loadBundles();
  }

  async function assignBundle(b) {
    if (!assignUser) return alert("Choose a user to assign to.");
    const resp = await fetch("/api/inbox/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannerEmail, inboxId: b.id, userEmail: assignUser })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Assign failed");
    onAssign({ userEmail: assignUser, ...data });
    if (autoArchive) {
      await doAction("archive", [b.id]);
    } else {
      await loadBundles();
    }
  }

  function confirmBulk(action){
    const ids = Array.from(selected);
    if (!ids.length) return;
    const verb = action === "archive" ? "Archive" : action === "restore" ? "Restore" : "Permanently delete";
    setMod({
      open:true, action, ids,
      text: `${verb} ${ids.length} bundle${ids.length>1?"s":""}? This cannot be undone for Delete.`
    });
  }
  function confirmSingle(action, id, title){
    const verb = action === "archive" ? "Archive" : action === "restore" ? "Restore" : "Permanently delete";
    setMod({
      open:true, action, ids:[id],
      text: `${verb} “${title}”? This cannot be undone for Delete.`
    });
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Inbox</h2>
          <p className="text-sm text-gray-500">Assign bundles to a user, then open Plan to push. Toggle auto-archive after assign if you like.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-gray-600 flex items-center gap-2">
            <input id="aa" type="checkbox" checked={autoArchive} onChange={e=>setAutoArchive(e.target.checked)} />
            <label htmlFor="aa">Auto-archive after assign</label>
          </div>
          <div>
            <label className="text-xs block mb-1">Assign to user</label>
            <select value={assignUser} onChange={(e)=>setAssignUser(e.target.value)} className="rounded-xl border border-gray-300 px-3 py-2 text-sm">
              <option value="">— Choose user —</option>
              {users.map(u => <option key={u.email} value={u.email}>{u.email}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex items-center gap-2">
        {["new","assigned","archived"].map(t=>(
          <button key={t} onClick={()=>setTab(t)}
            className={cn("rounded-xl px-3 py-2 text-sm font-semibold",
              tab===t ? "bg-cyan-600 text-white" : "bg-white border border-gray-300")}>
            {t==="new"?"New":t==="assigned"?"Assigned":"Archived"}
          </button>
        ))}
      </div>

      {/* Bulk bar */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs">
          <button onClick={()=>setAll(selected.size !== bundles.length)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
            {selected.size === bundles.length && bundles.length>0 ? <CheckSquare className="h-3 w-3"/> : <Square className="h-3 w-3" />} Select all
          </button>
          <span className="text-gray-500">{selected.size} selected</span>
        </div>
        <div className="flex items-center gap-2">
          {tab!=="archived" && (
            <button onClick={()=>confirmBulk("archive")} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
              <Archive className="h-3 w-3" /> Archive
            </button>
          )}
          {tab==="archived" && (
            <button onClick={()=>confirmBulk("restore")} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs">
              <ArchiveRestore className="h-3 w-3" /> Restore
            </button>
          )}
          <button onClick={()=>confirmBulk("delete")} className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs">
            <Trash2 className="h-3 w-3" /> Delete…
          </button>
        </div>
      </div>

      {/* List */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(bundles || []).map(b => (
          <div key={b.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-1 text-sm font-semibold">{b.title}</div>
                <div className="text-xs text-gray-600">
                  Items: {b.count} • Start {b.start_date} • {b.timezone} • Source: {b.source}
                  {b.assigned_user ? <> • Assigned to {b.assigned_user}</> : null}
                  {b.archived_at ? <> • Archived</> : null}
                </div>
              </div>
              <input type="checkbox" checked={selected.has(b.id)} onChange={()=>toggle(b.id)} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              {tab!=="archived" && (
                <button
                  onClick={()=>assignBundle(b)}
                  className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white">
                  Assign to selected user
                </button>
              )}
              {tab!=="archived" && (
                <button onClick={()=>confirmSingle("archive", b.id, b.title)} className="rounded-xl border px-3 py-2 text-xs">
                  Archive
                </button>
              )}
              {tab==="archived" && (
                <button onClick={()=>confirmSingle("restore", b.id, b.title)} className="rounded-xl border px-3 py-2 text-xs">
                  Restore
                </button>
              )}
              <button onClick={()=>confirmSingle("delete", b.id, b.title)} className="rounded-xl border border-red-300 text-red-700 px-3 py-2 text-xs">
                Delete…
              </button>
            </div>
          </div>
        ))}
      </div>

      {(bundles || []).length === 0 && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-500">
          No bundles on this tab.
        </div>
      )}

      <ConfirmModal
        open={mod.open}
        title="Please confirm"
        body={mod.text}
        confirmText={mod.action==="archive"?"Archive":mod.action==="restore"?"Restore":"Delete"}
        confirmClass={mod.action==="delete"?"bg-red-600":"bg-cyan-600"}
        onClose={()=>setMod({open:false})}
        onConfirm={async ()=>{
          const { action, ids } = mod;
          setMod({open:false});
          await doAction(action, ids);
        }}
      />
    </div>
  );
}

/* ---------- Users Dashboard (same add user; history lives on Manage User) ---------- */
function UsersDashboard({ plannerEmail, onCreateTasks }) {
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  async function loadUsers() {
    const params = new URLSearchParams({ op:"list", plannerEmail, status: "all", q });
    const resp = await fetch(`/api/users?${params.toString()}`);
    const data = await resp.json();
    setUsers(data.users || []);
  }
  useEffect(()=>{ loadUsers(); }, [plannerEmail, q]);

  async function addUser() {
    setStatusMsg("Creating invite...");
    const resp = await fetch("/api/invite", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: addEmail.trim() }) });
    const data = await resp.json();
    if (!resp.ok) return setStatusMsg(data.error || "Invite failed");
    setStatusMsg(data.emailed ? "Invite link created & emailed." : "Invite link created. Email not configured — copy and send.");
    setAddEmail("");
    await loadUsers();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users</h2>
          <p className="text-sm text-gray-500">Search users and click <b>Manage user</b> to create and deliver tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search email/name/status"
              className="px-2 py-1 text-sm outline-none" />
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input value={addEmail} onChange={(e)=>setAddEmail(e.target.value)} type="email" placeholder="user@example.com"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={addUser} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Add user</button>
      </div>
      <div className="mb-4 text-xs text-gray-600">{statusMsg}</div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2">Email</th>
              <th className="py-2">Status</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.email} className="border-t">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.status === "connected" ? "✓ connected" : "invited"}</td>
                <td className="py-2">
                  <div className="flex justify-end gap-2">
                    <button onClick={()=>onCreateTasks(u.email)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2 py-1 text-xs font-semibold text-white hover:bg-black">
                      Manage user <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr><td className="py-6 text-gray-500" colSpan={3}>No users found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------- Date Picker Modal components (same as before) ---------- */
function Modal({ title, children, onClose }) {
  useEffect(() => { function onEsc(e){ if (e.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onEsc); return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
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
function CalendarGrid({ startDate, valueOffset = 0, onPickOffset }) {
  const start = parseISODate(startDate) || new Date();
  const [viewMonth, setViewMonth] = useState(() => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)));
  const maxDays = 180;
  const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(startUTC.getTime() + maxDays*24*3600*1000);
  const selectedUTC = new Date(startUTC.getTime() + valueOffset*24*3600*1000);
  function monthLabel(d){ return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), "MMMM yyyy"); }
  function gotoMonth(delta){ const y=viewMonth.getUTCFullYear(), m=viewMonth.getUTCMonth(); setViewMonth(new Date(Date.UTC(y, m+delta, 1))); }
  const year = viewMonth.getUTCFullYear(), month = viewMonth.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startDow = firstOfMonth.getUTCDay();
  const gridStart = new Date(Date.UTC(year, month, 1 - startDow));
  const weeks = Array.from({ length: 6 }).map((_, w) =>
    Array.from({ length: 7 }).map((_, d) => {
      const cell = new Date(gridStart);
      cell.setUTCDate(gridStart.getUTCDate() + (w*7 + d));
      const isSameMonth = cell.getUTCMonth() === month;
      const isDisabled = cell < startUTC || cell > endUTC;
      const isSelected = fmtDateYMD(cell) === fmtDateYMD(selectedUTC);
      return { cell, isSameMonth, isDisabled, isSelected, label: String(cell.getUTCDate()) };
    })
  );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(-12)} title="Prev year"><ChevronsLeft className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(-1)} title="Prev month"><ChevronLeft className="h-3 w-3" /></button>
          <div className="px-2 text-sm font-semibold">{monthLabel(viewMonth)}</div>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(1)} title="Next month"><ChevronRight className="h-3 w-3" /></button>
          <button className="rounded-lg border px-2 py-1 text-xs" onClick={()=>gotoMonth(12)} title="Next year"><ChevronsRight className="h-3 w-3" /></button>
        </div>
        <button className="rounded-lg border px-2 py-1 text-xs"
          onClick={()=>{ setViewMonth(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))); }}>
          Jump to plan start
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500 mb-1">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d)=>(<div key={d}>{d}</div>))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.map((row, ri) => row.map((c, ci) => (
          <button
            key={`${ri}-${ci}`}
            type="button"
            className={cn(
              "h-8 w-8 rounded-full text-xs flex items-center justify-center transition",
              c.isDisabled ? "text-gray-300 cursor-not-allowed"
              : c.isSelected ? "bg-cyan-600 text-white"
              : "hover:bg-gray-100",
              !c.isSameMonth && !c.isDisabled && !c.isSelected ? "text-gray-400" : "text-gray-700"
            )}
            onClick={()=>{
              if (c.isDisabled) return;
              const off = offsetFromStart(startDate, c.cell);
              onPickOffset?.(off);
            }}
          >
            {c.label}
          </button>
        )))}
      </div>
    </div>
  );
}
function DatePickerButton({ startDate }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  useEffect(()=>{ window.dispatchEvent(new CustomEvent("p2t:setBaseOffset",{ detail:{ offset: 0 }})); },[]);
  const label = fmtDayLabel(startDate, offset);
  return (
    <div className="mb-3 flex items-center gap-2">
      <button type="button" onClick={()=>setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
        <Calendar className="h-4 w-4" /> Pick date
      </button>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">Selected: <b>{label}</b></div>
      {open && (
        <Modal onClose={()=>setOpen(false)} title="Choose a date">
          <CalendarGrid startDate={startDate} valueOffset={offset}
            onPickOffset={(o)=>{ setOffset(o); window.dispatchEvent(new CustomEvent("p2t:setBaseOffset",{ detail:{ offset: o }})); setOpen(false); }} />
        </Modal>
      )}
    </div>
  );
}

/* ---------- Tasks editor / preview / push ---------- */
function TasksEditorAdvanced({ startDate, onAdd }) {
  const [title, setTitle] = useState("");
  const [baseOffset, setBaseOffset] = useState(0);
  const [time, setTime] = useState("");
  const [dur, setDur] = useState(60);
  const [notes, setNotes] = useState("");

  useEffect(()=>{
    function onPick(e){ setBaseOffset(Number(e.detail?.offset || 0)); }
    window.addEventListener("p2t:setBaseOffset", onPick);
    return () => window.removeEventListener("p2t:setBaseOffset", onPick);
  },[]);

  const [repeat, setRepeat] = useState("none");
  const [interval, setInterval] = useState(1);
  const [endMode, setEndMode] = useState("count");
  const [count, setCount] = useState(4);
  const [untilDate, setUntilDate] = useState("");
  const [horizonMonths, setHorizonMonths] = useState(6);
  const [weeklyDays, setWeeklyDays] = useState([false,true,false,true,false,false,false]);
  const [monthlyMode, setMonthlyMode] = useState("dom");

  function generate() {
    const name = title.trim();
    if (!name) return;
    const base = addDaysSafe(startDate, Number(baseOffset) || 0);
    const baseObj = {
      title: name,
      time: time || undefined,
      durationMins: Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : 60,
      notes
    };
    const added = [];
    const start = parseISODate(startDate);
    function pushIfOnOrAfter(d){
      const off = daysBetweenUTC(start, d);
      if (d >= base) added.push({ ...baseObj, dayOffset: off });
    }
    const step = Math.max(1, Number(interval) || 1);

    if (repeat === "none") pushIfOnOrAfter(base);

    if (repeat === "daily") {
      if (endMode === "count") {
        const n = Math.max(1, Number(count) || 1);
        for (let i=0;i<n;i++){ const d = new Date(base); d.setUTCDate(d.getUTCDate() + i*step); pushIfOnOrAfter(d); }
      } else if (endMode === "until") {
        const until = parseISODate(untilDate); let i=0;
        while (true){ const d = new Date(base); d.setUTCDate(d.getUTCDate() + i*step); if (d > until) break; pushIfOnOrAfter(d); if (++i>1000) break; }
      } else {
        const end = addMonthsUTC(base, Math.max(1, Number(horizonMonths) || 6)); let i=0;
        while (true){ const d = new Date(base); d.setUTCDate(d.getUTCDate() + i*step); if (d > end) break; pushIfOnOrAfter(d); if (++i>2000) break; }
      }
    }

    if (repeat === "weekly") {
      const checked = weeklyDays.map((v,i)=>v?i:null).filter(v=>v!==null);
      if (checked.length===0) { alert("Pick at least one weekday."); return; }
      const baseWeekday = base.getUTCDay();
      const baseStartOfWeek = new Date(base); baseStartOfWeek.setUTCDate(base.getUTCDate() - baseWeekday);
      const emitWeek = (weekIndex)=>{
        for (const dow of checked){
          const d = new Date(baseStartOfWeek);
          d.setUTCDate(baseStartOfWeek.getUTCDate() + dow + weekIndex*7*step);
          pushIfOnOrAfter(d);
        }
      };
      if (endMode === "count") {
        const n = Math.max(1, Number(count) || 1);
        let emitted=0, week=0;
        while (emitted < n && week < 520){
          const before = added.length; emitWeek(week);
          emitted += (added.length - before);
          week++;
        }
        if (added.length > n) added.length = n;
      } else if (endMode === "until") {
        const until = parseISODate(untilDate);
        let week=0; while (week < 520){ const before=added.length; emitWeek(week);
          if (added.length > before) { const last = addDaysSafe(startDate, added[added.length-1].dayOffset||0); if (last > until) { while (added.length && addDaysSafe(startDate, added[added.length-1].dayOffset||0) > until) added.pop(); break; } }
          week++;
        }
      } else {
        const end = addMonthsUTC(base, Math.max(1, Number(horizonMonths) || 6));
        let week=0; while (week < 520){ emitWeek(week); const last = added.length ? addDaysSafe(startDate, added[added.length-1].dayOffset||0) : base; if (last > end) break; week++; }
      }
    }

    if (repeat === "monthly") {
      const baseY = base.getUTCFullYear(), baseM = base.getUTCMonth(), baseD = base.getUTCDate(), baseW = base.getUTCDay();
      const firstSameW = firstWeekdayOfMonthUTC(baseY, baseM, baseW);
      const nth = Math.floor((base.getUTCDate() - firstSameW.getUTCDate())/7)+1;
      const lastSameW = lastWeekdayOfMonthUTC(baseY, baseM, baseW);
      const isLast = (base.getUTCDate() === lastSameW.getUTCDate());
      const computeTarget = (y,m0)=>{
        if (monthlyMode === "dom") {
          const last = lastDayOfMonthUTC(y,m0); const d = Math.min(baseD, last);
          return new Date(Date.UTC(y,m0,d));
        } else {
          if (isLast) return lastWeekdayOfMonthUTC(y,m0,baseW);
          const nthCand = nthWeekdayOfMonthUTC(y,m0,baseW, Math.max(1,nth));
          return nthCand || lastWeekdayOfMonthUTC(y,m0,baseW);
        }
      };
      if (endMode === "count") {
        const n = Math.max(1, Number(count) || 1);
        for (let i=0;i<n;i++){ const t = addMonthsUTC(base, i*step); const y=t.getUTCFullYear(), m0=t.getUTCMonth(); pushIfOnOrAfter(computeTarget(y,m0)); }
      } else if (endMode === "until") {
        const until = parseISODate(untilDate); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const y=t.getUTCFullYear(), m0=t.getUTCMonth(); const d=computeTarget(y,m0); if (d > until) break; pushIfOnOrAfter(d); i++; }
      } else {
        const end = addMonthsUTC(base, Math.max(1, Number(horizonMonths) || 12)); let i=0; while (i<240){ const t=addMonthsUTC(base, i*step); const y=t.getUTCFullYear(), m0=t.getUTCMonth(); const d=computeTarget(y,m0); if (d > end) break; pushIfOnOrAfter(d); i++; }
      }
    }

    added.sort((a,b)=> (a.dayOffset||0)-(b.dayOffset||0) || (a.time||"").localeCompare(b.time||""));
    if (added.length === 0) return;
    onAdd(added);
    setTitle(""); setNotes("");
  }

  const pillClass = (active) =>
    cn("rounded-full px-3 py-1 text-xs border transition", active ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50");

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Strength training"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <div className="block">
          <div className="mb-1 text-sm font-medium">Selected date</div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">{fmtDayLabel(startDate, baseOffset)}</div>
        </div>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Time (optional)</div>
          <input type="time" value={time} onChange={(e)=>setTime(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Duration (mins)</div>
          <input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
      </div>

      <label className="block mb-3">
        <div className="mb-1 text-sm font-medium">Notes (optional)</div>
        <textarea value={notes} onChange={(e)=>setNotes(e.target.value)} rows={3}
          placeholder="Any extra details, links, or instructions…"
          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
      </label>

      <div className="mb-1 text-xs text-gray-500">Tip: use the <b>Pick date</b> button above to set the date.</div>

      <div className="mt-3 mb-3 rounded-xl border border-gray-200 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <div className="text-sm font-medium">Repeat</div>
          <select value={repeat} onChange={(e)=>setRepeat(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          {repeat === "weekly" && (
            <div className="flex flex-wrap items-center gap-2">
              {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((lbl, i)=>(
                <button type="button" key={i} className={pillClass(weeklyDays[i])}
                  onClick={()=> setWeeklyDays(prev => { const next = [...prev]; next[i] = !next[i]; return next; })}>
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>

        {repeat !== "none" && (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <span className="text-sm">every</span>
              <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)}
                className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-sm">{repeat === "daily" ? "day(s)" : repeat === "weekly" ? "week(s)" : "month(s)"}</span>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="radio" name="endMode" value="count" checked={endMode==="count"} onChange={()=>setEndMode("count")} />
                  after
                </label>
                <input type="number" min={1} disabled={endMode!=="count"} value={count} onChange={(e)=>setCount(e.target.value)}
                  className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
                <span className="text-sm">occurrence(s)</span>

                <span className="mx-2 text-xs text-gray-400">or</span>

                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="radio" name="endMode" value="until" checked={endMode==="until"} onChange={()=>setEndMode("until")} />
                  on date
                </label>
                <input type="date" disabled={endMode!=="until"} value={untilDate} onChange={(e)=>setUntilDate(e.target.value)}
                  className="rounded-xl border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100" />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input type="radio" name="endMode" value="infinite" checked={endMode==="infinite"} onChange={()=>setEndMode("infinite")} />
                  No end (generate next …)
                </label>
                <input type="number" min={1} max={repeat === "monthly" ? 36 : 24} value={horizonMonths} onChange={(e)=>setHorizonMonths(e.target.value)}
                  className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
                <span className="text-sm">month(s)</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
          <Plus className="h-4 w-4" /> Add task(s)
        </button>
        <button onClick={()=>{ /* could reset */ }}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50">
          <RotateCcw className="h-3 w-3" /> Reset fields
        </button>
      </div>
    </div>
  );
}

function buildICS(plan, tasks){
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//EN"];
  const addDays = (d,n)=>{ const x=new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate()+n); return x; };
  const start = new Date(`${plan.startDate}T00:00:00Z`);
  const fmt = (X)=> `${X.getUTCFullYear()}${String(X.getUTCMonth()+1).padStart(2,"0")}${String(X.getUTCDate()).padStart(2,"0")}T${String(X.getUTCHours()).padStart(2,"0")}${String(X.getUTCMinutes()).padStart(2,"0")}00Z`;
  function escapeICS(s=""){ return String(s).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n"); }
  for (const t of tasks) {
    const dt = addDays(start, t.dayOffset || 0);
    let dtstart, dtend;
    if (t.time) {
      const [hh,mm] = t.time.split(":").map(Number);
      const st = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hh||0, mm||0));
      const en = new Date(st.getTime() + (t.durationMins || 60) * 60000);
      dtstart = `DTSTART:${fmt(st)}`; dtend = `DTEND:${fmt(en)}`;
    } else {
      const ymd = `${dt.getUTCFullYear()}${String(dt.getUTCMonth()+1).padStart(2,"0")}${String(dt.getUTCDate()).padStart(2,"0")}`;
      const next = addDays(dt,1);
      const ymd2 = `${next.getUTCFullYear()}${String(next.getUTCMonth()+1).padStart(2,"0")}${String(next.getUTCDate()).padStart(2,"0")}`;
      dtstart = `DTSTART;VALUE=DATE:${ymd}`; dtend = `DTEND;VALUE=DATE:${ymd2}`;
    }
    const id = `${uid()}@plan2tasks`;
    lines.push("BEGIN:VEVENT", `UID:${id}`, `SUMMARY:${escapeICS(t.title)}`, dtstart, dtend,
      `DESCRIPTION:${escapeICS(t.notes || "")}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function renderPlanBlock({ plan, tasks }) {
  const lines = [];
  lines.push("### PLAN2TASKS ###");
  lines.push(`Title: ${plan.title}`);
  lines.push(`Start: ${plan.startDate}`);
  lines.push(`Timezone: ${plan.timezone}`);
  lines.push("--- Blocks ---");
  lines.push("--- Tasks ---");
  for (const t of tasks) lines.push(`- ${t.title} | day=${t.dayOffset || 0} | time=${t.time || ""} | dur=${t.durationMins || 60} | notes=${t.notes || ""}`);
  lines.push("### END ###");
  return lines.join("\n");
}

/* ---------- Preview & push + History panel ---------- */
function TaskComposerAndPreview({ plan, tasks, setTasks, replaceMode, setReplaceMode, resultMsg, setResultMsg, selectedUserEmail, plannerEmail }) {
  function downloadICS() {
    const ics = buildICS(plan, tasks);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = plan.title.replace(/[^\w\-]+/g, "_").slice(0,40) || "plan";
    a.download = `${safe}.ics`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  const previewItems = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ao = a.dayOffset||0, bo=b.dayOffset||0;
      if (ao !== bo) return ao - bo;
      return (a.time || "").localeCompare(b.time || "");
    });
  }, [tasks]);

  async function pushToSelectedUser() {
    try {
      setResultMsg("Pushing...");
      if (!selectedUserEmail) throw new Error("Choose a user first.");
      if (tasks.length === 0) throw new Error("Add at least one task.");
      const planBlock = renderPlanBlock({ plan, tasks });
      const resp = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: selectedUserEmail, plannerEmail, planBlock, mode: (replaceMode ? "replace" : "append") }),
      });
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
      if (!resp.ok) throw new Error(data.error || "Push failed");

      // Snapshot history
      await fetch("/api/history/snapshot", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          plannerEmail, userEmail: selectedUserEmail, plan, tasks,
          mode: replaceMode ? "replace" : "append",
          listTitle: data.listTitle || plan.title
        })
      });

      const deletedMsg = data.mode === "replace" ? `Removed ${data.deleted} existing tasks. ` : "";
      setResultMsg(`${deletedMsg}Success — created ${data.created} tasks in "${data.listTitle || plan.title}".`);
    } catch (e) {
      setResultMsg("Error: " + e.message);
    }
  }

  return (
    <>
      <div className="mb-3 text-sm font-semibold">3) Preview & deliver</div>
      {previewItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500">
          Nothing to preview yet — add a task above or load an Inbox bundle.
        </div>
      ) : (
        <>
          <PreviewSchedule startDate={plan.startDate} items={previewItems} />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={replaceMode} onChange={(e)=>setReplaceMode(e.target.checked)} />
              Replace existing tasks in this list before pushing
            </label>
            <button
              onClick={pushToSelectedUser}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Push Plan to Selected User
            </button>
            <button
              onClick={downloadICS}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-50"
              title="Export a .ics calendar file of these items"
            >
              <Download className="h-4 w-4" /> Export .ics
            </button>
            <div className="text-xs text-gray-600">{resultMsg}</div>
          </div>
        </>
      )}
      <HistoryPanel plannerEmail={plannerEmail} userEmail={selectedUserEmail} />
    </>
  );
}

function PreviewSchedule({ startDate, items }) {
  const groups = useMemo(()=>{
    const map = new Map();
    (items||[]).forEach(it=>{
      const dt = addDaysSafe(startDate, it.dayOffset||0);
      const ymd = fmtDateYMD(new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate())));
      if (!map.has(ymd)) map.set(ymd, []);
      map.get(ymd).push(it);
    });
    const keys = Array.from(map.keys()).sort();
    return keys.map(k => ({ ymd:k, items: map.get(k).sort((a,b)=>(a.time||"").localeCompare(b.time||"")) }));
  }, [startDate, items]);

  return (
    <div className="space-y-3">
      {groups.map(g=>(
        <div key={g.ymd} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">{format(parseISODate(g.ymd), "EEE MMM d, yyyy")}</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {g.items.map((it, idx)=>(
              <div key={idx} className="rounded-xl border bg-white p-2 text-xs">
                <div className="font-medium text-gray-900">{it.title}</div>
                <div className="text-gray-500">
                  {it.time || "all-day"} • {it.durationMins || 60}m{it.notes ? ` • ${it.notes}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- History Panel ---------- */
function HistoryPanel({ plannerEmail, userEmail }) {
  const [tab, setTab] = useState("active"); // active | archived
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [mod, setMod] = useState({open:false, action:null, ids:[], text:""});

  async function load() {
    if (!userEmail) { setRows([]); return; }
    const qs = new URLSearchParams({ plannerEmail, userEmail, status: tab, q });
    const r = await fetch(`/api/history/list?${qs.toString()}`);
    const j = await r.json();
    setRows(j.items || []);
    setSelected(new Set());
  }
  useEffect(()=>{ load(); }, [plannerEmail, userEmail, tab, q]);

  function toggle(id){ const next=new Set(selected); next.has(id)?next.delete(id):next.add(id); setSelected(next); }
  function setAll(checked){ setSelected(checked ? new Set(rows.map(r=>r.id)) : new Set()); }

  async function doAction(action, ids){
    const ep = action==="archive" ? "/api/history/archive"
            : action==="unarchive" ? "/api/history/unarchive"
            : "/api/history/delete";
    const r = await fetch(ep, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, planIds: ids })
    });
    const j = await r.json();
    if (!r.ok) alert(j.error || "Failed");
    await load();
  }

  async function restore(planId, duplicate=false){
    const r = await fetch("/api/history/restore", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, planId }) });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Restore failed");
    // Fill composer via localStorage handoff
    const payload = { ok:true, userEmail, plan: j.plan, tasks: j.tasks };
    if (duplicate) payload.plan.title = `${payload.plan.title} (copy)`;
    try { localStorage.setItem("p2t_last_prefill", JSON.stringify(payload)); } catch {}
    alert("Loaded to composer. Go to Plan tab.");
  }

  function confirmBulk(action){
    const ids = Array.from(selected);
    if (!ids.length) return;
    const verb = action==="archive"?"Archive":action==="unarchive"?"Unarchive":"Permanently delete";
    setMod({ open:true, action, ids, text: `${verb} ${ids.length} item(s)? This cannot be undone for Delete.` });
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
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search title…" className="px-2 py-1 text-sm outline-none" />
          </div>
          <div className="rounded-xl border border-gray-300 bg-white">
            <button onClick={()=>setTab("active")} className={cn("px-3 py-2 text-xs", tab==="active"?"bg-cyan-600 text-white rounded-l-xl":"")}>Active</button>
            <button onClick={()=>setTab("archived")} className={cn("px-3 py-2 text-xs", tab==="archived"?"bg-cyan-600 text-white rounded-r-xl":"")}>Archived</button>
          </div>
        </div>
      </div>

      {/* bulk bar */}
      <div className="mb-2 flex items-center justify-between text-xs">
        <button onClick={()=>setAll(selected.size !== rows.length)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1">
          {selected.size === rows.length && rows.length>0 ? <CheckSquare className="h-3 w-3"/> : <Square className="h-3 w-3" />} Select all
        </button>
        <div className="flex items-center gap-2">
          {tab==="active" ? (
            <button onClick={()=>confirmBulk("archive")} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> <Archive className="h-3 w-3" /> Archive </button>
          ) : (
            <button onClick={()=>confirmBulk("unarchive")} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> <ArchiveRestore className="h-3 w-3" /> Unarchive </button>
          )}
          <button onClick={()=>confirmBulk("delete")} className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1"> <Trash2 className="h-3 w-3" /> Delete… </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2"></th>
              <th className="py-2">Title</th>
              <th className="py-2">Start</th>
              <th className="py-2">Items</th>
              <th className="py-2">Mode</th>
              <th className="py-2">Pushed</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={r.id} className="border-t">
                <td className="py-2"><input type="checkbox" checked={selected.has(r.id)} onChange={()=>toggle(r.id)} /></td>
                <td className="py-2">{r.title}</td>
                <td className="py-2">{r.start_date}</td>
                <td className="py-2">{r.items_count}</td>
                <td className="py-2">{r.mode}</td>
                <td className="py-2">{new Date(r.pushed_at).toLocaleString()}</td>
                <td className="py-2">
                  <div className="flex justify-end gap-2">
                    <a href={`/api/history/ics?planId=${r.id}`} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> <Download className="h-3 w-3" /> .ics </a>
                    <button onClick={()=>restore(r.id, false)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> Restore </button>
                    <button onClick={()=>restore(r.id, true)} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> Duplicate </button>
                    {tab==="active" ? (
                      <button onClick={()=>setMod({open:true, action:"archive", ids:[r.id], text:`Archive “${r.title}”?`})}
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> <Archive className="h-3 w-3" /> </button>
                    ) : (
                      <button onClick={()=>setMod({open:true, action:"unarchive", ids:[r.id], text:`Unarchive “${r.title}”?`})}
                        className="inline-flex items-center gap-1 rounded-lg border px-2 py-1"> <ArchiveRestore className="h-3 w-3" /> </button>
                    )}
                    <button onClick={()=>setMod({open:true, action:"delete", ids:[r.id], text:`Permanently delete “${r.title}”? This cannot be undone.`})}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1"> <Trash2 className="h-3 w-3" /> </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-gray-500">No history on this tab.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={mod.open}
        title="Please confirm"
        body={mod.text}
        confirmText={mod.action==="delete"?"Delete":mod.action==="archive"?"Archive":mod.action==="unarchive"?"Unarchive":"Confirm"}
        confirmClass={mod.action==="delete"?"bg-red-600":"bg-cyan-600"}
        onClose={()=>setMod({open:false})}
        onConfirm={async ()=>{
          const { action, ids } = mod;
          setMod({open:false});
          await doAction(action, ids);
        }}
      />
    </div>
  );
}

/* ---------- Tasks Wizard (Plan) ---------- */
function TasksWizard({ plannerEmail, initialSelectedUserEmail = "", prefillPayload, onPrefillConsumed }) {
  const [plan, setPlan] = useState({
    title: "Weekly Plan",
    startDate: format(new Date(), "yyyy-MM-dd"),
    timezone: "America/Chicago",
  });
  const [tasks, setTasks] = useState([]);

  const [users, setUsers] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState(initialSelectedUserEmail);
  const [replaceMode, setReplaceMode] = useState(false);
  const [resultMsg, setResultMsg] = useState("");

  const [inboxBanner, setInboxBanner] = useState(null);
  const [loadedFromStorage, setLoadedFromStorage] = useState(false);

  // Apply Inbox prefill
  useEffect(() => {
    if (prefillPayload && prefillPayload.ok && prefillPayload.plan && Array.isArray(prefillPayload.tasks)) {
      setPlan(prefillPayload.plan);
      setTasks(prefillPayload.tasks.map(t => ({ id: uid(), ...t })));
      setInboxBanner({
        title: prefillPayload.plan.title || "Inbox import",
        count: prefillPayload.tasks.length || 0,
        userEmail: prefillPayload.userEmail || ""
      });
      onPrefillConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPayload]);

  // Fallback: load last payload from localStorage
  useEffect(() => {
    if (tasks.length === 0 && !prefillPayload && !loadedFromStorage) {
      try {
        const raw = localStorage.getItem("p2t_last_prefill");
        if (raw) {
          const p = JSON.parse(raw);
          if (p && p.ok && p.plan && Array.isArray(p.tasks)) {
            setPlan(p.plan);
            setTasks(p.tasks.map(t => ({ id: uid(), ...t })));
            setInboxBanner({
              title: p.plan.title || "Inbox import",
              count: p.tasks.length || 0,
              userEmail: p.userEmail || ""
            });
            setLoadedFromStorage(true);
          }
        }
      } catch {}
    }
  }, [tasks.length, prefillPayload, loadedFromStorage]);

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams({ op:"list", plannerEmail });
      const resp = await fetch(`/api/users?${params.toString()}`);
      const data = await resp.json();
      setUsers(data.users || []);
      if (!initialSelectedUserEmail) {
        const connected = (data.users || []).find(u => u.status === "connected");
        const any = (data.users || [])[0];
        const sel = connected?.email || any?.email || "";
        setSelectedUserEmail(sel);
      } else {
        setSelectedUserEmail(initialSelectedUserEmail);
      }
    })();
  }, [plannerEmail, initialSelectedUserEmail]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {inboxBanner && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">
          <Info className="h-4 w-4 mt-0.5" />
          <div>
            Loaded <b>{inboxBanner.count}</b> tasks from <b>“{inboxBanner.title}”</b>
            {inboxBanner.userEmail ? <> for <b>{inboxBanner.userEmail}</b></> : null}.
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plan (Tasks only)</h2>
        <div className="w-72">
          <select
            value={selectedUserEmail}
            onChange={(e) => setSelectedUserEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Choose user —</option>
            {users.map(u => (
              <option key={u.email} value={u.email}>
                {u.email} {u.status === "connected" ? "✓" : "(invited)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1) List title / Start date / Timezone */}
      <div className="mb-6">
        <div className="mb-2">
          <div className="text-sm font-semibold">1) Task list (Google)</div>
          <div className="text-xs text-gray-500">
            <b>Title</b> becomes the Google Tasks <b>list name</b>. Tasks you add below go inside that list.
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block">
            <div className="mb-1 text-sm font-medium">Task list title</div>
            <input
              value={plan.title}
              onChange={(e) => setPlan({ ...plan, title: e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g., Week of Sep 1"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium">Plan start date</div>
            <input
              type="date"
              value={plan.startDate}
              onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium">Timezone</div>
            <select
              value={plan.timezone}
              onChange={(e) => setPlan({ ...plan, timezone: e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              {TIMEZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
            </select>
          </label>
        </div>
      </div>

      {/* 2) Add tasks */}
      <DatePickerButton startDate={plan.startDate} />
      <TasksEditorAdvanced startDate={plan.startDate} onAdd={(items)=>{
        const withIds = items.map(t => ({ id: uid(), ...t }));
        setTasks(prev => [...prev, ...withIds]);
      }} />

      {/* 3) Preview & deliver */}
      <TaskComposerAndPreview
        plan={plan}
        tasks={tasks}
        setTasks={setTasks}
        replaceMode={replaceMode}
        setReplaceMode={setReplaceMode}
        resultMsg={resultMsg}
        setResultMsg={setResultMsg}
        selectedUserEmail={selectedUserEmail}
        plannerEmail={plannerEmail}
      />
    </div>
  );
}
