import React, { useMemo, useState, useEffect } from "react";
import {
  Calendar, Users, Plus, Trash2, Edit3, Save, Search, Tag, FolderPlus,
  ArrowRight, Download, RotateCcw, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, X
} from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

/* ---------------- Error Boundary ---------------- */
class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ console.error("UI crash:", error, info); }
  render(){
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-red-50 p-6">
          <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-4">
            <h2 className="mb-2 text-lg font-bold text-red-700">Something went wrong in the UI</h2>
            <pre className="overflow-auto rounded bg-red-100 p-3 text-xs text-red-900">
{String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- helpers ---------------- */
function cn(...classes){ return classes.filter(Boolean).join(" "); }
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];
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

/* ---------------- Auth ---------------- */
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

/* ---------------- Root ---------------- */
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

/* ---------------- Shell ---------------- */
function AppShell({ plannerEmail }) {
  const [view, setView] = useState("users");
  const [selectedUserEmail, setSelectedUserEmail] = useState("");

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Plan2Tasks</h1>
            <nav className="ml-4 flex gap-2">
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

        {view === "users"
          ? <UsersDashboard
              plannerEmail={plannerEmail}
              onCreateTasks={(email)=>{ setSelectedUserEmail(email); setView("plan"); }}
            />
          : <TasksWizard plannerEmail={plannerEmail} initialSelectedUserEmail={selectedUserEmail} />}
      </div>
    </div>
  );
}

/* ---------------- Users Dashboard ---------------- */
function UsersDashboard({ plannerEmail, onCreateTasks }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [tab, setTab] = useState("connected");
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const [editing, setEditing] = useState(null); const [editVal, setEditVal] = useState("");
  const [manageFor, setManageFor] = useState(null);
  const [manageSelected, setManageSelected] = useState([]);

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  async function loadGroups() {
    const params = new URLSearchParams({ op:"list", plannerEmail });
    const resp = await fetch(`/api/groups?${params.toString()}`);
    const data = await resp.json();
    setGroups(data.groups || []);
  }
  async function loadUsers() {
    const params = new URLSearchParams({ op:"list", plannerEmail, status: tab });
    if (q) params.set("q", q);
    if (groupId) params.set("groupId", groupId);
    const resp = await fetch(`/api/users?${params.toString()}`);
    const data = await resp.json();
    setUsers(data.users || []);
  }
  useEffect(()=>{ loadGroups(); }, [plannerEmail]);
  useEffect(()=>{ loadUsers(); }, [plannerEmail, tab, q, groupId]);

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
  async function delUser(email) {
    if (!confirm(`Delete ${email}?`)) return;
    const resp = await fetch(`/api/users?op=delete`, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: email }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Delete failed");
    await loadUsers();
  }
  async function saveEdit(oldEmail) {
    const resp = await fetch(`/api/users?op=update`, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: oldEmail, newEmail: editVal.trim() }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Update failed");
    setEditing(null); setEditVal("");
    await loadUsers();
  }

  async function createGroup() {
    const resp = await fetch(`/api/groups?op=create`, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, name: newGroupName.trim() }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Create group failed");
    setNewGroupName("");
    setShowCreateGroup(false);
    await loadGroups();
  }
  async function deleteGroup(id) {
    if (!confirm("Delete this group? Users will remain but be unassigned from it.")) return;
    const resp = await fetch(`/api/groups?op=delete`, { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, groupId: id }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Delete group failed");
    if (groupId === id) setGroupId("");
    await loadGroups(); await loadUsers();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users Dashboard</h2>
          <p className="text-sm text-gray-500">Add, group, and manage users. Click “Create tasks” to deliver tasks to a user’s Google Tasks.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search email"
              className="px-2 py-1 text-sm outline-none" />
          </div>
          <select value={groupId} onChange={(e)=>setGroupId(e.target.value)}
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="">All groups</option>
            <option value="null">No group</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          {!showCreateGroup ? (
            <button onClick={()=>setShowCreateGroup(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">
              <FolderPlus className="h-4 w-4" /> Create group
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <input value={newGroupName} onChange={(e)=>setNewGroupName(e.target.value)} placeholder="Group name"
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={createGroup} className="rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Create</button>
              <button onClick={()=>{ setShowCreateGroup(false); setNewGroupName(""); }} className="rounded-xl border border-gray-300 px-3 py-2 text-sm">Cancel</button>
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={()=>setTab("connected")}
          className={cn("rounded-xl px-3 py-2 text-sm font-semibold", tab==="connected" ? "bg-emerald-600 text-white" : "bg-white border border-gray-300")}>
          Connected
        </button>
        <button onClick={()=>setTab("invited")}
          className={cn("rounded-xl px-3 py-2 text-sm font-semibold", tab==="invited" ? "bg-amber-600 text-white" : "bg-white border border-gray-300")}>
          Invited
        </button>
      </div>

      <AddUserRow
        addEmail={addEmail}
        setAddEmail={setAddEmail}
        onAdd={addUser}
        statusMsg={statusMsg}
      />

      <UsersTable
        users={users}
        groups={groups}
        onCreateTasks={onCreateTasks}
        onDelete={delUser}
        onEditSave={saveEdit}
        setEditing={setEditing}
        editing={editing}
        editVal={editVal}
        setEditVal={setEditVal}
        setManageFor={setManageFor}
        manageFor={manageFor}
        manageSelected={manageSelected}
        setManageSelected={setManageSelected}
        onCreateGroup={createGroup}
        onDeleteGroup={deleteGroup}
      />
    </div>
  );
}

function AddUserRow({ addEmail, setAddEmail, onAdd, statusMsg }) {
  return (
    <>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input value={addEmail} onChange={(e)=>setAddEmail(e.target.value)} type="email" placeholder="user@example.com"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={onAdd} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Add user</button>
      </div>
      <div className="mb-4 text-xs text-gray-600">{statusMsg}</div>
    </>
  );
}

function UsersTable(props){
  const {
    users, groups, onCreateTasks, onDelete, onEditSave,
    setEditing, editing, editVal, setEditVal,
    setManageFor, manageFor, manageSelected, setManageSelected
  } = props;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2">Email</th>
            <th className="py-2">Status</th>
            <th className="py-2">Groups</th>
            <th className="py-2">Invite link</th>
            <th className="py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(users || []).map((u) => (
            <React.Fragment key={u.email}>
              <tr className="border-t">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.status === "connected" ? "✓ connected" : "invited"}</td>
                <td className="py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {(u.groups && u.groups.length > 0) ? u.groups.map(g => (
                      <span key={g.id} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-gray-50 px-2 py-0.5 text-[11px]">
                        <Tag className="h-3 w-3 text-gray-500" /> {g.name || "—"}
                      </span>
                    )) : <span className="text-xs text-gray-400">—</span>}
                    <button onClick={()=>{ setManageFor(u.email); setManageSelected((u.groups||[]).map(g=>g.id)); }}
                      className="ml-2 rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Manage</button>
                  </div>
                </td>
                <td className="py-2">
                  {u.inviteLink ? (
                    <div className="flex items-center gap-2">
                      <button onClick={()=>{ navigator.clipboard.writeText(u.inviteLink); alert("Invite link copied"); }}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-xs">Copy</button>
                      <a href={u.inviteLink} target="_blank" rel="noreferrer" className="text-cyan-700 underline text-xs">Open</a>
                    </div>
                  ) : <span className="text-xs text-gray-400">—</span>}
                </td>
                <td className="py-2">
                  <div className="flex justify-end gap-2">
                    {u.status !== "connected" ? (
                      <>
                        <button onClick={()=>{ setEditing(u.email); setEditVal(u.email); }}
                          className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs">
                          <Edit3 className="h-3 w-3" /> Edit
                        </button>
                        {editing === u.email && (
                          <>
                            <input value={editVal} onChange={(e)=>setEditVal(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs" />
                            <button onClick={()=>onEditSave(u.email)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                              <Save className="h-3 w-3" /> Save
                            </button>
                          </>
                        )}
                      </>
                    ) : null}

                    <button onClick={()=>onCreateTasks(u.email)}
                      className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-2 py-1 text-xs font-semibold text-white hover:bg-black">
                      Create tasks <ArrowRight className="h-3 w-3" />
                    </button>
                    <button onClick={()=>onDelete(u.email)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </td>
              </tr>

              {manageFor === u.email && (
                <tr className="border-b bg-gray-50">
                  <td colSpan={5} className="p-3">
                    <div className="text-xs text-gray-500">Assign/unassign groups from the separate Groups UI (not shown here for brevity).</div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
          {(!users || users.length === 0) && (
            <tr><td className="py-6 text-gray-500" colSpan={5}>No users found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Tasks wizard ---------------- */
function TasksWizard({ plannerEmail, initialSelectedUserEmail = "" }) {
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

  // history
  const [histLists, setHistLists] = useState([]);
  const [openListId, setOpenListId] = useState("");
  const [histItems, setHistItems] = useState([]);
  const [selectedHistItemIds, setSelectedHistItemIds] = useState([]);

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

  useEffect(() => {
    if (!selectedUserEmail) { setHistLists([]); return; }
    (async () => {
      const q = new URLSearchParams({ plannerEmail, userEmail: selectedUserEmail });
      const r = await fetch(`/api/history?${q.toString()}`);
      const j = await r.json();
      setHistLists(j.lists || []);
      setOpenListId(""); setHistItems([]); setSelectedHistItemIds([]);
    })();
  }, [plannerEmail, selectedUserEmail]);

  const previewItems = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ao = a.dayOffset||0, bo=b.dayOffset||0;
      if (ao !== bo) return ao - bo;
      return (a.time || "").localeCompare(b.time || "");
    });
  }, [tasks]);

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

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
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
            Google Tasks shows items on the All-day row; we include time in the title so it’s obvious.
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
      <div className="mb-6">
        <div className="mb-2">
          <div className="text-sm font-semibold">2) Add tasks</div>
          <div className="text-xs text-gray-500">
            Click <b>Pick date</b> to open the calendar grid (with month/year controls). That sets the task’s <b>date</b>.
            Choose Repeat (Daily / Weekly / Monthly), then <b>Add task(s)</b>.
          </div>
        </div>

        <DatePickerButton startDate={plan.startDate} />

        <TasksEditorAdvanced startDate={plan.startDate} />
      </div>

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
        downloadICS={downloadICS}
      />

      {/* 4) History for selected user */}
      <HistoryPanel
        plannerEmail={plannerEmail}
        selectedUserEmail={selectedUserEmail}
        histLists={histLists}
        setHistLists={setHistLists}
        openListId={openListId}
        setOpenListId={setOpenListId}
        histItems={histItems}
        setHistItems={setHistItems}
        selectedHistItemIds={selectedHistItemIds}
        setSelectedHistItemIds={setSelectedHistItemIds}
        plan={plan}
        setTasks={setTasks}
      />
    </div>
  );
}

/* ---------------- Compact “Pick date” -> modal calendar ---------------- */
function DatePickerButton({ startDate }) {
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0); // current selection

  useEffect(()=>{
    // initialize downstream editor once
    const ev = new CustomEvent("p2t:setBaseOffset",{ detail:{ offset: 0 }});
    window.dispatchEvent(ev);
  },[]);

  const label = fmtDayLabel(startDate, offset);

  return (
    <div className="mb-3 flex items-center gap-2">
      <button
        type="button"
        onClick={()=>setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
      >
        <Calendar className="h-4 w-4" />
        Pick date
      </button>

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
        Selected: <b>{label}</b>
      </div>

      {open && (
        <Modal onClose={()=>setOpen(false)} title="Choose a date">
          <CalendarGrid
            startDate={startDate}
            valueOffset={offset}
            onPickOffset={(o)=>{
              setOffset(o);
              // notify the task editor
              const ev = new CustomEvent("p2t:setBaseOffset",{ detail:{ offset: o }});
              window.dispatchEvent(ev);
              setOpen(false);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }) {
  useEffect(() => {
    function onEsc(e){ if (e.key === "Escape") onClose?.(); }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* Calendar grid with month/year controls (compact) */
function CalendarGrid({ startDate, valueOffset = 0, onPickOffset }) {
  const start = parseISODate(startDate) || new Date();
  const [viewMonth, setViewMonth] = useState(() => new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)));
  const maxDays = 180; // ~6 months window
  const startUTC = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const endUTC = new Date(startUTC.getTime() + maxDays*24*3600*1000);
  const selectedUTC = new Date(startUTC.getTime() + valueOffset*24*3600*1000);

  function monthLabel(d){ return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)), "MMMM yyyy"); }
  function gotoMonth(delta){ const y=viewMonth.getUTCFullYear(), m=viewMonth.getUTCMonth(); setViewMonth(new Date(Date.UTC(y, m+delta, 1))); }

  // build 6-week grid
  const year = viewMonth.getUTCFullYear(), month = viewMonth.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startDow = firstOfMonth.getUTCDay(); // 0..6 Sun..Sat
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
        <button
          className="rounded-lg border px-2 py-1 text-xs"
          onClick={()=>{ setViewMonth(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))); }}
        >
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

      <div className="mt-2 text-xs text-gray-600">
        Window: {format(startUTC, "MMM d")} → {format(endUTC, "MMM d")} •
        Selected: {format(selectedUTC, "EEE MMM d")}
      </div>
    </div>
  );
}

/* ---------- Tasks editor ---------- */
function TasksEditorAdvanced({ startDate }) {
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

  const [repeat, setRepeat] = useState("none"); // none | daily | weekly | monthly
  const [interval, setInterval] = useState(1);
  const [endMode, setEndMode] = useState("count"); // count | until
  const [count, setCount] = useState(4);
  const [untilDate, setUntilDate] = useState("");

  const [weeklyDays, setWeeklyDays] = useState([false,true,false,true,false,false,false]); // Mon/Wed default
  const WEEK_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const [monthlyMode, setMonthlyMode] = useState("dom"); // dom | nth

  function addTasks(newOnes){
    const ev = new CustomEvent("p2t:addTasks",{ detail: newOnes });
    window.dispatchEvent(ev);
  }

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

    if (repeat === "none") {
      addTasks([{ ...baseObj, dayOffset: Number(baseOffset) || 0 }]);
      setTitle(""); setNotes("");
      return;
    }

    if (endMode === "until" && !untilDate) { alert("Pick an End date or switch to 'after N occurrences'."); return; }

    const added = [];

    if (repeat === "daily") {
      const step = Math.max(1, Number(interval) || 1);
      if (endMode === "count") {
        const n = Math.max(1, Number(count) || 1);
        for (let i=0;i<n;i++){
          const d = new Date(base); d.setUTCDate(d.getUTCDate() + i*step);
          added.push({ ...baseObj, dayOffset: daysBetweenUTC(parseISODate(startDate), d) });
        }
      } else {
        const until = parseISODate(untilDate);
        let i=0; while (true) {
          const d = new Date(base); d.setUTCDate(d.getUTCDate() + i*step);
          if (d > until) break;
          added.push({ ...baseObj, dayOffset: daysBetweenUTC(parseISODate(startDate), d) });
          if (++i>1000) break;
        }
      }
    }

    if (repeat === "weekly") {
      const stepWeeks = Math.max(1, Number(interval) || 1);
      const checkedDays = weeklyDays.map((v,i)=>v?i:null).filter(v=>v!==null);
      if (checkedDays.length===0) { alert("Pick at least one weekday."); return; }
      const baseWeekday = base.getUTCDay();
      const baseStartOfWeek = new Date(base); baseStartOfWeek.setUTCDate(base.getUTCDate() - baseWeekday); // Sunday

      const emitWeek = (weekIndex)=>{
        for (const dow of checkedDays){
          const d = new Date(baseStartOfWeek);
          d.setUTCDate(baseStartOfWeek.getUTCDate() + dow + weekIndex*7*stepWeeks);
          const off = daysBetweenUTC(parseISODate(startDate), d);
          if (d >= base) added.push({ ...baseObj, dayOffset: off });
        }
      };

      if (endMode === "count") {
        const n = Math.max(1, Number(count) || 1);
        let emitted=0, week=0;
        while (emitted < n*checkedDays.length && week < 520){
          const before = added.length; emitWeek(week); emitted += (added.length - before); week++;
        }
        while (added.length > n) added.pop();
      } else {
        const until = parseISODate(untilDate);
        let week=0;
        while (week < 520){
          const before = added.length; emitWeek(week);
          if (added.length > before) {
            const last = addDaysSafe(startDate, added[added.length-1].dayOffset||0);
            if (last > until) {
              while (added.length > 0) {
                const dt = addDaysSafe(startDate, added[added.length-1].dayOffset||0);
                if (dt <= until) break;
                added.pop();
              }
              break;
            }
          }
          week++;
        }
      }
    }

    if (repeat === "monthly") {
      const stepMonths = Math.max(1, Number(interval) || 1);
      const baseY = base.getUTCFullYear(), baseM = base.getUTCMonth(), baseD = base.getUTCDate();
      const baseW = base.getUTCDay();

      const firstSameW = firstWeekdayOfMonthUTC(baseY, baseM, baseW);
      const nth = Math.floor((base.getUTCDate() - firstSameW.getUTCDate())/7)+1;
      const lastSameW = lastWeekdayOfMonthUTC(baseY, baseM, baseW);
      const isLast = (base.getUTCDate() === lastSameW.getUTCDate());

      const computeTarget = (y,m0)=>{
        if (monthlyMode === "dom") {
          const last = lastDayOfMonthUTC(y,m0);
          const d = Math.min(baseD, last);
          return new Date(Date.UTC(y,m0,d));
        } else {
          if (isLast) return lastWeekdayOfMonthUTC(y,m0,baseW);
          const nthCand = nthWeekdayOfMonthUTC(y,m0,baseW, Math.max(1,nth));
          return nthCand || lastWeekdayOfMonthUTC(y,m0,baseW);
        }
      };

      const start = parseISODate(startDate);
      if (endMode === "count") {
        const n = Math.max(1, Number(count) || 1);
        for (let i=0;i<n;i++){
          const targetMonthDate = addMonthsUTC(base, i*stepMonths);
          const y=targetMonthDate.getUTCFullYear(), m0=targetMonthDate.getUTCMonth();
          const d = computeTarget(y,m0);
          added.push({ ...baseObj, dayOffset: daysBetweenUTC(start, d) });
        }
      } else {
        const until = parseISODate(untilDate);
        let i=0; while (i < 240) {
          const targetMonthDate = addMonthsUTC(base, i*stepMonths);
          const y=targetMonthDate.getUTCFullYear(), m0=targetMonthDate.getUTCMonth();
          const d = computeTarget(y,m0);
          if (d > until) break;
          added.push({ ...baseObj, dayOffset: daysBetweenUTC(start, d) });
          i++;
        }
      }
    }

    added.sort((a,b)=> (a.dayOffset||0)-(b.dayOffset||0) || (a.time||"").localeCompare(b.time||""));
    addTasks(added);
    setTitle(""); setNotes("");
  }

  const pillClass = (active) =>
    cn(
      "rounded-full px-3 py-1 text-xs border transition",
      active
        ? "bg-cyan-600 text-white border-cyan-600"
        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
    );

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
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            {fmtDayLabel(startDate, baseOffset)}
          </div>
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

        {repeat !== "none" && (
          <>
            <span className="text-sm">every</span>
            <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)}
              className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
            <span className="text-sm">
              {repeat === "daily" ? "day(s)" : repeat === "weekly" ? "week(s)" : "month(s)"}
            </span>
          </>
        )}
        </div>

        {repeat === "weekly" && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((lbl, i)=>(
              <button
                type="button"
                key={i}
                className={cn(
                  "rounded-full px-3 py-1 text-xs border transition",
                  weeklyDays[i] ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                )}
                aria-pressed={weeklyDays[i] ? "true" : "false"}
                onClick={()=> setWeeklyDays(prev => { const next = [...prev]; next[i] = !next[i]; return next; })}
                title={lbl}
              >
                {lbl}
              </button>
            ))}
            <div className="text-xs text-gray-500 ml-1">Pick days of week.</div>
          </div>
        )}

        {repeat === "monthly" && (
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium">On</div>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="monthlyMode" value="dom" checked={monthlyMode==="dom"} onChange={()=>setMonthlyMode("dom")} />
              day-of-month (like the 15th)
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="radio" name="monthlyMode" value="nth" checked={monthlyMode==="nth"} onChange={()=>setMonthlyMode("nth")} />
              the Nth weekday (e.g., 2nd Tue)
            </label>
            <div className="text-xs text-gray-500">Based on the selected date.</div>
          </div>
        )}

        {repeat !== "none" && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="text-sm font-medium">Ends</div>
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
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={generate} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
          <Plus className="h-4 w-4" /> Add task(s)
        </button>
        <button onClick={()=>{ setTitle(""); setTime(""); setDur(60); setNotes(""); setRepeat("none"); setInterval(1); setEndMode("count"); setCount(4); setUntilDate(""); setWeeklyDays([false,true,false,true,false,false,false]); setMonthlyMode("dom"); }}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50">
          <RotateCcw className="h-3 w-3" /> Reset fields
        </button>
      </div>
    </div>
  );
}

/* ---------- Preview & push ---------- */
function TaskComposerAndPreview({ plan, tasks, setTasks, replaceMode, setReplaceMode, resultMsg, setResultMsg, selectedUserEmail, plannerEmail, downloadICS }) {
  useEffect(()=>{
    function onAdd(e){
      const add = (e.detail || []).map(t => ({ id: uid(), ...t }));
      setTasks(prev => [...prev, ...add]);
    }
    window.addEventListener("p2t:addTasks", onAdd);
    return () => window.removeEventListener("p2t:addTasks", onAdd);
  }, [setTasks]);

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
      const deletedMsg = data.mode === "replace" ? `Removed ${data.deleted} existing tasks. ` : "";
      setResultMsg(`${deletedMsg}Success — created ${data.created} tasks in "${data.listTitle}".`);
    } catch (e) {
      setResultMsg("Error: " + e.message);
    }
  }

  return (
    <>
      <div className="mb-3 text-sm font-semibold">3) Preview & deliver</div>
      {previewItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500">
          Nothing to preview yet — add a task above.
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
    </>
  );
}

/* ---------- Preview list grouped by date ---------- */
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
                <div className="text-gray-500">{it.time || "all-day"} • {it.durationMins || 60}m{it.notes ? ` • ${it.notes}` : ""}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- History Panel ---------- */
function HistoryPanel({
  plannerEmail, selectedUserEmail,
  histLists, setHistLists, openListId, setOpenListId,
  histItems, setHistItems, selectedHistItemIds, setSelectedHistItemIds,
  plan, setTasks
}) {
  return (
    <div className="mt-8">
      <div className="mb-2 text-sm font-semibold">History for {selectedUserEmail || "—"}</div>
      {!selectedUserEmail ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">Choose a user to load history.</div>
      ) : (
        <div className="space-y-3">
          {(histLists || []).map(l => (
            <div key={l.id} className="rounded-xl border border-gray-200">
              <div className="flex items-center justify-between p-3">
                <div className="text-sm">
                  <div className="font-medium">{l.title}</div>
                  <div className="text-gray-500 text-xs">{format(new Date(l.created_at), "MMM d, yyyy p")} • {l.count} items • Start {l.start_date}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-gray-300 px-2 py-1 text-xs" onClick={async()=>{
                    setOpenListId(prev => prev === l.id ? "" : l.id);
                    if (openListId !== l.id) {
                      const q = new URLSearchParams({ op:"items", listId: l.id });
                      const r = await fetch(`/api/history?${q.toString()}`);
                      const j = await r.json();
                      setHistItems(j.items || []);
                      setSelectedHistItemIds([]);
                    }
                  }}>
                    {openListId === l.id ? "Hide" : "View items"}
                  </button>
                  <button className="rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs" onClick={async()=>{
                    if (!confirm("Delete this list and all its items?")) return;
                    const r = await fetch(`/api/history?op=delete-lists`, { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ listIds: [l.id] })});
                    const j = await r.json();
                    if (!r.ok) return alert(j.error || "Delete failed");
                    const q = new URLSearchParams({ plannerEmail, userEmail: selectedUserEmail });
                    const r2 = await fetch(`/api/history?${q.toString()}`); const j2 = await r2.json();
                    setHistLists(j2.lists || []);
                    if (openListId === l.id) { setOpenListId(""); setHistItems([]); }
                  }}>
                    Delete list
                  </button>
                </div>
              </div>

              {openListId === l.id && (
                <div className="border-t p-3">
                  {(histItems || []).length === 0 ? (
                    <div className="text-xs text-gray-500">No items.</div>
                  ) : (
                    <>
                      <div className="mb-2 flex items-center gap-2 text-xs">
                        <button className="rounded-lg border border-gray-300 px-2 py-1" onClick={()=>{ setSelectedHistItemIds(histItems.map(i => i.id)); }}>Select all</button>
                        <button className="rounded-lg border border-gray-300 px-2 py-1" onClick={()=>{ setSelectedHistItemIds([]); }}>Clear</button>
                        <button className="rounded-lg border border-gray-300 px-2 py-1" onClick={()=>{
                          const add = histItems.filter(i => selectedHistItemIds.includes(i.id))
                            .map(i => ({
                              id: uid(),
                              title: i.title,
                              dayOffset: i.day_offset,
                              time: i.time || undefined,
                              durationMins: i.duration_mins || 60,
                              notes: i.notes || ""
                            }));
                          setTasks(prev => [...prev, ...add]);
                        }}>
                          Add selected to composer
                        </button>
                        {selectedHistItemIds.length > 0 && (
                          <button className="rounded-lg border border-red-300 text-red-700 px-2 py-1" onClick={async()=>{
                            if (!confirm(`Delete ${selectedHistItemIds.length} selected item(s)?`)) return;
                            const r = await fetch(`/api/history?op=delete-items`, { method:"POST", headers:{ "Content-Type":"application/json" },
                              body: JSON.stringify({ listId: l.id, itemIds: selectedHistItemIds }) });
                            const j = await r.json();
                            if (!r.ok) return alert(j.error || "Delete failed");
                            const q = new URLSearchParams({ op:"items", listId: l.id });
                            const r2 = await fetch(`/api/history?${q.toString()}`); const j2 = await r2.json();
                            setHistItems(j2.items || []);
                            setSelectedHistItemIds([]);
                          }}>
                            Delete selected
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        {histItems.map(i => (
                          <label key={i.id} className="flex items-start gap-2 rounded-xl border border-gray-200 bg-white p-2 text-xs">
                            <input
                              type="checkbox"
                              checked={selectedHistItemIds.includes(i.id)}
                              onChange={(e)=>{
                                setSelectedHistItemIds(prev => e.target.checked ? [...prev, i.id] : prev.filter(x=>x!==i.id));
                              }}
                            />
                            <div>
                              <div className="font-medium text-gray-900">{i.title}</div>
                              <div className="text-gray-500">{format(addDaysSafe(l.start_date, i.day_offset||0), "EEE MM/dd")} • {i.time || "all-day"} • {i.duration_mins || 60}m{ i.notes ? ` • ${i.notes}` : ""}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {histLists.length === 0 && <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500">No history yet.</div>}
        </div>
      )}
    </div>
  );
}

/* ---------- .ics builder ---------- */
function buildICS(plan, tasks){
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//EN"];
  for (const t of tasks) {
    const dt = addDaysSafe(plan.startDate, t.dayOffset || 0);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth()+1).padStart(2,"0");
    const d = String(dt.getUTCDate()).padStart(2,"0");
    let dtstart, dtend;
    if (t.time) {
      const [hh, mm] = (t.time || "00:00").split(":").map(Number);
      const startUTC = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hh || 0, mm || 0));
      const endUTC = new Date(startUTC.getTime() + (t.durationMins || 60) * 60000);
      const fmt = (X)=> `${X.getUTCFullYear()}${String(X.getUTCMonth()+1).padStart(2,"0")}${String(X.getUTCDate()).padStart(2,"0")}T${String(X.getUTCHours()).padStart(2,"0")}${String(X.getUTCMinutes()).padStart(2,"0")}00Z`;
      dtstart = `DTSTART:${fmt(startUTC)}`; dtend = `DTEND:${fmt(endUTC)}`;
    } else {
      dtstart = `DTSTART;VALUE=DATE:${y}${m}${d}`;
      dtend   = `DTEND;VALUE=DATE:${y}${m}${String(Number(d)+1).padStart(2,"0")}`;
    }
    const id = `${uid()}@plan2tasks`;
    lines.push("BEGIN:VEVENT", `UID:${id}`, `SUMMARY:${escapeICS(t.title)}`, dtstart, dtend,
      `DESCRIPTION:${escapeICS([t.notes ? t.notes : "", t.time ? `Time: ${t.time} (${plan.timezone})` : "", t.durationMins ? `Duration: ${t.durationMins}m`:""].filter(Boolean).join("\\n"))}`,
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function escapeICS(s=""){ return String(s).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n"); }

/* ---------- Plan2Tasks export text ---------- */
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
