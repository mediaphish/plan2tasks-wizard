import React, { useMemo, useState, useEffect } from "react";
import { Calendar, Users, Plus, Trash2, Edit3, Save, Search, Tag, FolderPlus, ArrowRight, Download, RotateCcw } from "lucide-react";
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
function fmtDayLabel(startDateStr, d){ try { return format(addDaysSafe(startDateStr, d), "EEE MM/dd"); } catch { return `Day ${d}`; } }

// 0=Sun..6=Sat
function dayOfWeek(startDateStr, dayOffset){
  const d = addDaysSafe(startDateStr, Number(dayOffset) || 0);
  return d.getDay();
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
          : <TasksOnlyWizard plannerEmail={plannerEmail} initialSelectedUserEmail={selectedUserEmail} />}
      </div>
    </div>
  );
}

/* ---------------- Users Dashboard (as before) ---------------- */
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

  function beginManageGroups(u) {
    setManageFor(u.email);
    setManageSelected((u.groups || []).map(g=>g.id));
  }
  async function saveManage() {
    const resp = await fetch(`/api/users?op=set-groups`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: manageFor, groupIds: manageSelected })
    });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Save groups failed");
    setManageFor(null); setManageSelected([]);
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

/* ---------------- Tasks-only + ICS + Recurrence + History ---------------- */
function TasksOnlyWizard({ plannerEmail, initialSelectedUserEmail = "" }) {
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
  const [histLists, setHistLists] = useState([]);           // lists for selected user
  const [openListId, setOpenListId] = useState("");         // currently expanded list
  const [histItems, setHistItems] = useState([]);           // items for open list
  const [selectedHistItemIds, setSelectedHistItemIds] = useState([]); // checkbox selection

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
    return [...tasks].sort((a, b) => (a.dayOffset||0) - (b.dayOffset||0) || (a.time || "").localeCompare(b.time || ""));
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

      // refresh history since we saved it
      const q = new URLSearchParams({ plannerEmail, userEmail: selectedUserEmail });
      const r2 = await fetch(`/api/history?${q.toString()}`);
      const j2 = await r2.json();
      setHistLists(j2.lists || []);
    } catch (e) {
      setResultMsg("Error: " + e.message);
    }
  }

  /* ---------- ICS export (VEVENT) ---------- */
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

      {/* 2) Add tasks (loop) with Recurrence */}
      <div className="mb-6">
        <div className="mb-2">
          <div className="text-sm font-semibold">2) Add tasks</div>
          <div className="text-xs text-gray-500">
            Add a task and click <b>Add task</b>. The form stays so you can add more. “Repeat” expands into multiple tasks.
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

      {/* 4) History for selected user */}
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
                      // refresh lists
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
                          <button className="rounded-lg border border-gray-300 px-2 py-1" onClick={()=>{
                            setSelectedHistItemIds(histItems.map(i => i.id));
                          }}>Select all</button>
                          <button className="rounded-lg border border-gray-300 px-2 py-1" onClick={()=>{
                            setSelectedHistItemIds([]);
                          }}>Clear</button>
                          <button className="rounded-lg border border-gray-300 px-2 py-1" onClick={()=>{
                            // add selected to composer
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
                              // reload items
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
                                <div className="text-gray-500">{fmtDayLabel(plan.startDate, i.day_offset)} • {i.time || "all-day"} • {i.duration_mins || 60}m{ i.notes ? ` • ${i.notes}` : ""}</div>
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
    </div>
  );
}

/* ---------- Recurrence-capable editor ---------- */
function TasksEditor({ startDate, tasks, setTasks }) {
  const [title, setTitle] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState("");
  const [dur, setDur] = useState(60);
  const [notes, setNotes] = useState("");

  // recurrence
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly
  const [interval, setInterval] = useState(1);  // every N days/weeks
  const [count, setCount] = useState(4);        // number of occurrences
  const [weeklyDays, setWeeklyDays] = useState([false,false,false,false,false,false,false]); // Sun..Sat

  const addSingle = (t) => setTasks(prev => [...prev, t]);

  function add() {
    const name = title.trim();
    if (!name) return;
    const durNum = Number(dur);
    const base = {
      title: name,
      dayOffset: Number(dayOffset) || 0,
      time: time || undefined,
      durationMins: Number.isFinite(durNum) && durNum > 0 ? durNum : 60,
      notes
    };

    if (repeat === "none") {
      addSingle({ id: uid(), ...base });
    } else if (repeat === "daily") {
      const n = Math.max(1, Number(count) || 1);
      const k = Math.max(1, Number(interval) || 1);
      for (let i = 0; i < n; i++) {
        addSingle({ id: uid(), ...base, dayOffset: base.dayOffset + i * k });
      }
    } else if (repeat === "weekly") {
      const n = Math.max(1, Number(count) || 1);   // number of weeks
      const k = Math.max(1, Number(interval) || 1); // every k weeks
      const baseDow = dayOfWeek(startDate, base.dayOffset); // 0..6
      for (let week = 0; week < n; week++) {
        for (let dow = 0; dow < 7; dow++) {
          if (!weeklyDays[dow]) continue;
          const deltaToThisDow = (dow - baseDow);
          const totalOffset = base.dayOffset + deltaToThisDow + (week * 7 * k);
          addSingle({ id: uid(), ...base, dayOffset: totalOffset });
        }
      }
    }

    // reset light
    setTitle(""); setNotes("");
  }

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
            {[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].map((d)=>(<option key={d} value={d}>{fmtDayLabel(startDate, d)}</option>))}
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

      {/* Recurrence */}
      <div className="mb-3 rounded-xl border border-gray-200 p-3">
        <div className="mb-2 flex items-center gap-3">
          <div className="text-sm font-medium">Repeat</div>
          <select value={repeat} onChange={(e)=>setRepeat(e.target.value)} className="rounded-xl border border-gray-300 px-2 py-1 text-sm">
            <option value="none">None</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          {repeat !== "none" && (
            <>
              <span className="text-sm">every</span>
              <input type="number" min={1} value={interval} onChange={(e)=>setInterval(e.target.value)}
                className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-sm">{repeat === "daily" ? "day(s)" : "week(s)"}</span>
              <span className="text-sm ml-3">for</span>
              <input type="number" min={1} value={count} onChange={(e)=>setCount(e.target.value)}
                className="w-16 rounded-xl border border-gray-300 px-2 py-1 text-sm" />
              <span className="text-sm">{repeat === "daily" ? "occurrence(s)" : "week(s)"}</span>
            </>
          )}
        </div>
        {repeat === "weekly" && (
          <div className="flex flex-wrap items-center gap-2">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((lbl, i)=>(
              <label key={i} className={cn("inline-flex items-center gap-2 rounded-xl border px-2 py-1 text-xs",
                weeklyDays[i] ? "border-cyan-500" : "border-gray-300")}>
                <input type="checkbox" checked={weeklyDays[i]} onChange={(e)=>{
                  setWeeklyDays(prev => { const next=[...prev]; next[i]=e.target.checked; return next; });
                }} />
                {lbl}
              </label>
            ))}
            <div className="text-xs text-gray-500">Pick days of week starting from the week of “Day (0=start)”.</div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={add} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
          <Plus className="h-4 w-4" /> Add task(s)
        </button>
        <button onClick={()=>setTasks([])} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-xs hover:bg-gray-50">
          <RotateCcw className="h-3 w-3" /> Clear composer
        </button>
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

/* ---------- Preview grid ---------- */
function PreviewWeek({ startDate, items }) {
  const grouped = useMemo(() => {
    const g = new Map();
    for (let d = 0; d < 7; d++) g.set(d, []);
    (items || []).forEach(it => {
      const key = Number(it.dayOffset) || 0;
      if (!g.has(key)) g.set(key, []);
      g.get(key).push(it);
    });
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

/* ---------- .ics builder (VEVENTs) ---------- */
function buildICS(plan, tasks){
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Plan2Tasks//EN"
  ];
  for (const t of tasks) {
    const dt = addDaysSafe(plan.startDate, t.dayOffset || 0);
    const y = dt.getUTCFullYear();
    const m = String(dt.getUTCMonth()+1).padStart(2,"0");
    const d = String(dt.getUTCDate()).padStart(2,"0");
    // if time present, include time; else all-day
    let dtstart, dtend;
    if (t.time) {
      const [hh, mm] = (t.time || "00:00").split(":").map(Number);
      const startUTC = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hh || 0, mm || 0));
      const endUTC = new Date(startUTC.getTime() + (t.durationMins || 60) * 60000);
      const fmt = (X)=> `${X.getUTCFullYear()}${String(X.getUTCMonth()+1).padStart(2,"0")}${String(X.getUTCDate()).padStart(2,"0")}T${String(X.getUTCHours()).padStart(2,"0")}${String(X.getUTCMinutes()).padStart(2,"0")}00Z`;
      dtstart = `DTSTART:${fmt(startUTC)}`;
      dtend   = `DTEND:${fmt(endUTC)}`;
    } else {
      dtstart = `DTSTART;VALUE=DATE:${y}${m}${d}`;
      // all-day single-day event
      dtend   = `DTEND;VALUE=DATE:${y}${m}${String(Number(d)+1).padStart(2,"0")}`;
    }

    const uid = `${uid()}@plan2tasks`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `SUMMARY:${escapeICS(t.title)}`,
      dtstart,
      dtend,
      `DESCRIPTION:${escapeICS([t.notes ? t.notes : "", t.time ? `Time: ${t.time} (${plan.timezone})` : "", t.durationMins ? `Duration: ${t.durationMins}m`:""].filter(Boolean).join("\\n"))}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function escapeICS(s=""){
  return String(s).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n");
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
