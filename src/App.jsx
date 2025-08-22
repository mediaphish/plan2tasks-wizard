import React, { useMemo, useState, useEffect } from "react";
import { Calendar, Users, Plus, Trash2, Edit3, Save, Search, Tag, FolderPlus, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

/* ---------------- Error Boundary (prevents black screen) ---------------- */
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
            <p className="mb-3 text-sm text-red-700">
              The screen would have gone black. I’ve caught the error so you can see it:
            </p>
            <pre className="overflow-auto rounded bg-red-100 p-3 text-xs text-red-900">
{String(this.state.error?.message || this.state.error)}
            </pre>
            <p className="mt-3 text-xs text-gray-500">Open the browser console for details if needed.</p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------------- helpers (defensive) ---------------- */
function cn(...classes){ return classes.filter(Boolean).join(" "); }
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];
function uid(){ return Math.random().toString(36).slice(2,10); }

// Safely parse ISO date from <input type="date"> ("yyyy-MM-dd")
function parseISODate(s){
  if (!s) return null;
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function addDaysSafe(startDateStr, d){
  const base = parseISODate(startDateStr) || new Date();
  const dt = new Date(base);
  dt.setDate(dt.getDate() + (Number(d) || 0));
  return dt;
}
function fmtDayLabel(startDateStr, d){
  try { return format(addDaysSafe(startDateStr, d), "EEE MM/dd"); }
  catch { return `Day ${d}`; }
}

/* ---------------- Auth screen ---------------- */
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

/* ---------------- App shell ---------------- */
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
          : <TasksOnlyWizard plannerEmail={plannerEmail} initialSelectedUserEmail={selectedUserEmail} />}
      </div>
    </div>
  );
}

/* ---------------- Users Dashboard (unchanged behavior) ---------------- */
function UsersDashboard({ plannerEmail, onCreateTasks }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [tab, setTab] = useState("connected"); // connected | invited
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState(""); // "", "null", or uuid
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

  function beginManageGroups(u) {
    setManageFor(u.email);
    setManageSelected((u.groups || []).map(g=>g.id));
  }
  function cancelManage() { setManageFor(null); setManageSelected([]); }
  async function saveManage() {
    const resp = await fetch(`/api/users?op=set-groups`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: manageFor, groupIds: manageSelected })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Save groups failed");
    cancelManage();
    await loadUsers();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users Dashboard</h2>
          <p className="text-sm text-gray-500">Add, group, and manage users. Click “Create tasks” to deliver tasks to a specific user’s Google Tasks.</p>
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
                              <button onClick={()=>saveEdit(u.email)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
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
                      <button onClick={()=>delUser(u.email)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs">
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Inline multi-group manager */}
                {manageFor === u.email && (
                  <tr className="border-b bg-gray-50">
                    <td colSpan={5} className="p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {groups.length === 0 && <span className="text-xs text-gray-500">No groups yet. Click “Create group”.</span>}
                        {groups.map(g => {
                          const checked = manageSelected.includes(g.id);
                          return (
                            <label key={g.id} className={cn("inline-flex items-center gap-2 rounded-xl border px-2 py-1 text-xs",
                              checked ? "border-cyan-500 bg-white" : "border-gray-300 bg-white")}>
                              <input type="checkbox" checked={checked} onChange={(e)=>{
                                setManageSelected(prev => e.target.checked ? [...prev, g.id] : prev.filter(x=>x!==g.id));
                              }} />
                              {g.name}
                            </label>
                          );
                        })}
                        <div className="ml-auto flex items-center gap-2">
                          <button onClick={async()=>{ await saveManage(); }} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700">Save</button>
                          <button onClick={()=>{ setManageFor(null); setManageSelected([]); }} className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs">Cancel</button>
                          {groups.length > 0 && (
                            <button onClick={async()=>{ setManageSelected([]); await saveManage(); }} className="rounded-xl border border-gray-300 px-3 py-1.5 text-xs">Clear all</button>
                          )}
                        </div>
                      </div>
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
    </div>
  );
}

/* ---------------- Tasks-only wizard ---------------- */
function TasksOnlyWizard({ plannerEmail, initialSelectedUserEmail = "" }) {
  const [plan, setPlan] = useState({
    title: "Weekly Plan",
    startDate: format(new Date(), "yyyy-MM-dd"),
    timezone: "America/Chicago",
  });
  const [tasks, setTasks] = useState([]);

  const [users, setUsers] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState(initialSelectedUserEmail);
  const [resultMsg, setResultMsg] = useState("");

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

  const previewItems = useMemo(() => {
    return [...tasks].sort((a, b) => (a.dayOffset||0) - (b.dayOffset||0) || (a.time || "").localeCompare(b.time || ""));
  }, [tasks]);

  async function pushToSelectedUser() {
    try {
      setResultMsg("Pushing...");
      if (!selectedUserEmail) throw new Error("Choose a user first.");
      if (tasks.length === 0) throw new Error("Add at least one task.");

      const planBlock = renderPlanBlock({ plan, tasks }); // tasks only
      const resp = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: selectedUserEmail, planBlock }),
      });
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
      if (!resp.ok) throw new Error(data.error || "Push failed");
      setResultMsg(`Success — created ${data.created} tasks for ${selectedUserEmail}.`);
    } catch (e) {
      setResultMsg("Error: " + e.message);
    }
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
            <div className="mb-1 text-sm font-medium">Start date (Day 0)</div>
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

      {/* 2) Add tasks (loop) */}
      <div className="mb-6">
        <div className="mb-2">
          <div className="text-sm font-semibold">2) Add tasks</div>
          <div className="text-xs text-gray-500">
            Add a task and click <b>Add task</b>. The form stays put so you can add more. Day is an offset from the Start date (0–6).
          </div>
        </div>
        <TasksEditor startDate={plan.startDate} tasks={tasks} setTasks={setTasks} />
      </div>

      {/* 3) Preview & deliver */}
      <div className="mb-3 text-sm font-semibold">3) Preview & deliver</div>
      {previewItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-500">
          Nothing to preview yet — add a task above.
        </div>
      ) : (
        <>
          <PreviewWeek startDate={plan.startDate} items={previewItems} />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={pushToSelectedUser}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Push Plan to Selected User
            </button>
            <div className="text-xs text-gray-600">{resultMsg}</div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- Individual tasks editor (loop) ---------- */
function TasksEditor({ startDate, tasks, setTasks }) {
  const [title, setTitle] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState("");
  const [dur, setDur] = useState(60);
  const [notes, setNotes] = useState("");

  const add = () => {
    const name = title.trim();
    if (!name) return;
    const durNum = Number(dur);
    setTasks([
      ...tasks,
      {
        id: uid(),
        title: name,
        dayOffset: Number(dayOffset) || 0,
        time: time || undefined,
        durationMins: Number.isFinite(durNum) && durNum > 0 ? durNum : 60,
        notes
      }
    ]);
    setTitle(""); setNotes("");
  };

  const remove = (id) => setTasks(tasks.filter((t) => t.id !== id));

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-5">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Task title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Write proposal"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Day (0 = start)</div>
          <select value={dayOffset} onChange={(e)=>setDayOffset(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {[0,1,2,3,4,5,6].map((d)=>(<option key={d} value={d}>{fmtDayLabel(startDate, d)}</option>))}
          </select>
        </label>
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
        <label className="block">
          <div className="mb-1 text-sm font-medium">Notes</div>
          <input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="optional"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        </label>
      </div>

      <div className="flex items-center justify-between">
        <button onClick={add} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
          <Plus className="h-4 w-4" /> Add task
        </button>
        <div className="text-xs text-gray-500">Add another right away — the form stays here as you build the list.</div>
      </div>

      {tasks.length > 0 && (
        <div className="mt-4 space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
              <div className="text-sm">
                <div className="font-medium text-gray-900">{t.title}</div>
                <div className="text-gray-500">
                  {fmtDayLabel(startDate, t.dayOffset)} • {t.time || "all-day"} • {t.durationMins}m{t.notes ? ` • ${t.notes}` : ""}
                </div>
              </div>
              <button onClick={()=>remove(t.id)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Preview grid (added; fixes 'PreviewWeek is not defined') ---------- */
function PreviewWeek({ startDate, items }) {
  // Group items by dayOffset 0..6
  const grouped = useMemo(() => {
    const g = new Map();
    for (let d = 0; d < 7; d++) g.set(d, []);
    (items || []).forEach(it => {
      const key = Number(it.dayOffset) || 0;
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(it);
    });
    // sort each day by time string
    for (const d of g.keys()) {
      g.get(d).sort((a,b) => (a.time || "").localeCompare(b.time || ""));
    }
    return g;
  }, [items]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
      {[0,1,2,3,4,5,6].map((d)=>(
        <div key={d} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">{fmtDayLabel(startDate, d)}</div>
          <div className="space-y-2">
            {(grouped.get(d) || []).length === 0 && (<div className="text-xs text-gray-400">No items</div>)}
            {(grouped.get(d) || []).map((it, idx)=>(
              <div key={(it.id || `${d}-${idx}`)} className="rounded-xl border bg-white p-2 text-xs">
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

/* ---------- Plan2Tasks export text (tasks only) ---------- */
export function renderPlanBlock({ plan, tasks }) {
  const lines = [];
  lines.push("### PLAN2TASKS ###");
  lines.push(`Title: ${plan.title}`);
  lines.push(`Start: ${plan.startDate}`);
  lines.push(`Timezone: ${plan.timezone}`);
  lines.push("--- Blocks ---"); // (intentionally empty)
  lines.push("--- Tasks ---");
  for (const t of tasks) lines.push(`- ${t.title} | day=${t.dayOffset || 0} | time=${t.time || ""} | dur=${t.durationMins || 60} | notes=${t.notes || ""}`);
  lines.push("### END ###");
  return lines.join("\n");
}
