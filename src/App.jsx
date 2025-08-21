import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Check, ClipboardCopy, Download, ListChecks, Plus, Sparkles, Users, Trash2, Edit3, Save, LogOut, Search, Tags, FolderPlus, FolderX, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

// --- helpers ---
function cn(...classes){ return classes.filter(Boolean).join(" "); }
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];
function uid(){ return Math.random().toString(36).slice(2,10); }
function addDays(startDateStr, d){ const dt = new Date(startDateStr); dt.setDate(dt.getDate() + d); return dt; }
function escapeICS(text){ return String(text).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }

// --- ICS export ---
function toICS({ title, startDate, tasks, timezone }) {
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//Wizard//EN"];
  tasks.forEach((t) => {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + t.dayOffset);
    let DTSTART="", DTEND="";
    if (t.time) {
      const [h,m] = t.time.split(":").map(Number);
      dt.setHours(h, m||0, 0, 0);
      const end = new Date(dt.getTime() + (t.durationMins||60)*60000);
      DTSTART = `DTSTART;TZID=${timezone}:${format(dt, "yyyyMMdd'T'HHmm")}`;
      DTEND = `DTEND;TZID=${timezone}:${format(end, "yyyyMMdd'T'HHmm")}`;
    } else {
      const end = new Date(dt); end.setDate(end.getDate()+1);
      DTSTART = `DTSTART;VALUE=DATE:${format(dt,"yyyyMMdd")}`;
      DTEND = `DTEND;VALUE=DATE:${format(end,"yyyyMMdd")}`;
    }
    const uidStr=uid();
    lines.push("BEGIN:VEVENT",`UID:${uidStr}@plan2tasks`,`DTSTAMP:${format(new Date(),"yyyyMMdd'T'HHmmss")}Z`,`SUMMARY:${escapeICS(t.title)}`,`DESCRIPTION:${escapeICS(t.notes||"")}`,DTSTART,DTEND,"END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}

// --- Auth screen (Google + Email/Password) ---
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

// --- App ---
export default function App() {
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
          : <Wizard plannerEmail={plannerEmail} initialSelectedUserEmail={selectedUserEmail} />}
      </div>
    </div>
  );
}

// --- Users Dashboard with tabs, groups, search ---
function UsersDashboard({ plannerEmail, onCreateTasks }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [tab, setTab] = useState("connected"); // "connected" | "invited"
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState(""); // "", "null" (no group), or a UUID
  const [addEmail, setAddEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [editing, setEditing] = useState(null); const [editVal, setEditVal] = useState("");
  const [newGroupName, setNewGroupName] = useState("");

  async function loadGroups() {
    const resp = await fetch(`/api/groups/list?plannerEmail=${encodeURIComponent(plannerEmail)}`);
    const data = await resp.json();
    setGroups(data.groups || []);
  }
  async function loadUsers() {
    const params = new URLSearchParams({ plannerEmail, status: tab });
    if (q) params.set("q", q);
    if (groupId) params.set("groupId", groupId);
    const resp = await fetch(`/api/users/list?${params.toString()}`);
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
    const resp = await fetch("/api/users/delete", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: email }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Delete failed");
    await loadUsers();
  }
  async function saveEdit(oldEmail) {
    const resp = await fetch("/api/users/update", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: oldEmail, newEmail: editVal.trim() }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Update failed");
    setEditing(null); setEditVal("");
    await loadUsers();
  }
  async function createGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const resp = await fetch("/api/groups/create", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, name }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Create group failed");
    setNewGroupName("");
    await loadGroups();
  }
  async function deleteGroup(id) {
    if (!confirm("Delete this group? Users will remain but be unassigned.")) return;
    const resp = await fetch("/api/groups/delete", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, groupId: id }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Delete group failed");
    if (groupId === id) setGroupId("");
    await loadGroups(); await loadUsers();
  }
  async function assignGroup(email, id) {
    const resp = await fetch("/api/users/assign-group", { method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: email, groupId: id || null }) });
    const data = await resp.json();
    if (!resp.ok) return alert(data.error || "Assign group failed");
    await loadUsers();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Users Dashboard</h2>
          <p className="text-sm text-gray-500">Add, group, and manage users. Create tasks for a specific user with one click.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-gray-300 bg-white px-2 py-1">
            <Search className="h-4 w-4 text-gray-400" />
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search email"
              className="px-2 py-1 text-sm outline-none" />
          </div>
          <div className="flex items-center gap-2">
            <select value={groupId} onChange={(e)=>setGroupId(e.target.value)}
              className="rounded-xl border border-gray-300 px-3 py-2 text-sm">
              <option value="">All groups</option>
              <option value="null">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <input value={newGroupName} onChange={(e)=>setNewGroupName(e.target.value)} placeholder="New group"
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm" />
              <button onClick={createGroup} title="Create group"
                className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"><FolderPlus className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
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

      {/* Add user */}
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input value={addEmail} onChange={(e)=>setAddEmail(e.target.value)} type="email" placeholder="user@example.com"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={addUser} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Add user</button>
      </div>
      <div className="mb-4 text-xs text-gray-600">{statusMsg}</div>

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2">Email</th>
              <th className="py-2">Status</th>
              <th className="py-2">Group</th>
              <th className="py-2">Invite link</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.email} className="border-t">
                <td className="py-2">{u.email}</td>
                <td className="py-2">{u.status === "connected" ? "✓ connected" : "invited"}</td>
                <td className="py-2">
                  <select value={u.groupId || ""} onChange={(e)=>assignGroup(u.email, e.target.value || null)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs">
                    <option value="">—</option>
                    {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
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

// --- Planner wizard (unchanged except for initialSelectedUserEmail support) ---
function Wizard({ plannerEmail, initialSelectedUserEmail = "" }) {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState({ title:"Weekly Plan", startDate: format(new Date(), "yyyy-MM-dd"), timezone: "America/Chicago" });
  const [blocks, setBlocks] = useState([{ id: uid(), label:"Gym", days:[1,2,3,4,5], time:"12:00", durationMins:60 }]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState(initialSelectedUserEmail);
  const [inviteLink, setInviteLink] = useState("");

  useEffect(()=>{ (async()=>{
    const resp = await fetch(`/api/users/list?plannerEmail=${encodeURIComponent(plannerEmail)}`);
    const data = await resp.json();
    setUsers(data.users || []);
    if (!initialSelectedUserEmail) {
      const connected = (data.users || []).find(u => u.status === "connected");
      const any = (data.users || [])[0];
      const sel = connected?.email || any?.email || "";
      setSelectedUserEmail(sel);
      const row = (data.users || []).find(u => u.email === sel);
      setInviteLink(row?.inviteLink || "");
    } else {
      const row = (data.users || []).find(u => u.email === initialSelectedUserEmail);
      setInviteLink(row?.inviteLink || "");
    }
  })(); }, [plannerEmail, initialSelectedUserEmail]);

  function usePreviewItems() {
    return useMemo(() => {
      const out = [...tasks.map((t) => ({ ...t, type:"task" }))];
      blocks.forEach((b) => { for (let d=0; d<7; d++) {
        const date=new Date(plan.startDate); date.setDate(date.getDate()+d);
        const dow=date.getDay(); if (b.days.includes(dow)) out.push({ id: uid(), type:"block", title:b.label, dayOffset:d, time:b.time, durationMins:b.durationMins, notes:"Recurring block" });
      }});
      return out.sort((a,b)=> a.dayOffset - b.dayOffset || (a.time||"").localeCompare(b.time||""));
    }, [blocks, tasks, plan.startDate]);
  }

  async function pushToSelectedUser() {
    const outEl = document.getElementById("push-result");
    try {
      if (outEl) outEl.textContent = "Pushing...";
      if (!selectedUserEmail) throw new Error("Choose a user first.");
      if (tasks.length === 0) throw new Error("Add at least one task.");

      const planBlock = renderPlanBlock({ plan, blocks, tasks });
      const resp = await fetch("/api/push", {
        method: "POST", headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ userEmail: selectedUserEmail, planBlock }),
      });
      const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
      if (!resp.ok) throw new Error(data.error || "Push failed");
      if (outEl) outEl.textContent = `Success — created ${data.created} tasks for ${selectedUserEmail}.`;
    } catch (e) { if (outEl) outEl.textContent = "Error: " + e.message; }
  }

  return (
    <>
      {/* Minimal wizard UI from your current build */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Plan</h2>
        <div className="w-72">
          <select value={selectedUserEmail} onChange={(e)=>{ setSelectedUserEmail(e.target.value); const u=(users||[]).find(x=>x.email===e.target.value); setInviteLink(u?.inviteLink||""); }}
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            <option value="">— Choose user —</option>
            {users.map(u=>(
              <option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓":"(invited)"}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Basics */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="block">
            <div className="mb-1 text-sm font-medium">Plan title</div>
            <input value={plan.title} onChange={(e)=>setPlan({ ...plan, title:e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium">Start date</div>
            <input type="date" value={plan.startDate} onChange={(e)=>setPlan({ ...plan, startDate:e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-medium">Timezone</div>
            <select value={plan.timezone} onChange={(e)=>setPlan({ ...plan, timezone:e.target.value })}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
              {TIMEZONES.map((tz)=>(<option key={tz} value={tz}>{tz}</option>))}
            </select>
          </label>
        </div>

        <hr className="my-4" />

        {/* Tasks editor (simple) */}
        <TasksEditor startDate={plan.startDate} tasks={tasks} setTasks={setTasks} />

        <hr className="my-4" />

        {/* Preview + Export + Push */}
        <div className="mb-3 text-sm font-semibold">Preview</div>
        <PreviewWeek startDate={plan.startDate} items={usePreviewItems()} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={async()=>{ await navigator.clipboard.writeText(renderPlanBlock({ plan, blocks, tasks })); alert("Plan2Tasks block copied."); }}
            className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
            <ClipboardCopy className="h-4 w-4" /> Copy Plan2Tasks block
          </button>
          <button onClick={()=>{ const url = toICS({ title: plan.title, startDate: plan.startDate, tasks: usePreviewItems(), timezone: plan.timezone }); const a=document.createElement("a"); a.href=url; a.download=`${plan.title.replace(/\s+/g,"_")}.ics`; a.click(); URL.revokeObjectURL(url); }}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
            <Download className="h-4 w-4" /> Export .ics
          </button>
          <button onClick={pushToSelectedUser}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Push Plan to Selected User
          </button>
          <div id="push-result" className="text-xs text-gray-600"></div>
        </div>
      </div>
    </>
  );
}

// --- Simple tasks editor & preview (unchanged) ---
function TasksEditor({ startDate, tasks, setTasks }) {
  const [title, setTitle] = useState(""); const [dayOffset, setDayOffset] = useState(0);
  const [time, setTime] = useState(""); const [dur, setDur] = useState(60); const [notes, setNotes] = useState("");
  const add = () => { if (!title.trim()) return; setTasks([...tasks, { id: uid(), title: title.trim(), dayOffset:Number(dayOffset)||0, time: time||undefined, durationMins:Number(dur)||60, notes }]); setTitle(""); setNotes(""); };
  const remove = (id) => setTasks(tasks.filter((t)=>t.id!==id));
  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-5">
        <label className="block">
          <div className="mb-1 text-sm font-medium">Title</div>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g., Write proposal" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Day</div>
          <select value={dayOffset} onChange={(e)=>setDayOffset(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm">
            {[0,1,2,3,4,5,6].map((d)=>(<option key={d} value={d}>{format(addDays(startDate, d), "EEE MM/dd")}</option>))}
          </select>
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Time (optional)</div>
          <input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Duration (mins)</div>
          <input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <div className="mb-1 text-sm font-medium">Notes</div>
          <input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="optional" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm" />
        </label>
      </div>
      {tasks.length > 0 && (<div className="mt-2 space-y-2">{tasks.map((t)=>(
        <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-sm">
            <div className="font-medium text-gray-900">{t.title}</div>
            <div className="text-gray-500">{format(addDays(startDate, t.dayOffset), "EEE MM/dd")} • {t.time || "all-day"} • {t.durationMins}m{t.notes ? ` • ${t.notes}` : ""}</div>
          </div>
          <button onClick={()=>remove(t.id)} className="rounded-lg border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">Remove</button>
        </div>
      ))}</div>)}
    </div>
  );
}
function PreviewWeek({ startDate, items }) {
  const grouped = useMemo(()=>{ const g=new Map(); for (let d=0; d<7; d++) g.set(d, []); items.forEach((it)=>{ g.get(it.dayOffset)?.push(it); }); return g; }, [items]);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
      {[0,1,2,3,4,5,6].map((d)=>(
        <div key={d} className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
          <div className="mb-2 text-sm font-semibold text-gray-800">{format(addDays(startDate, d), "EEE MMM d")}</div>
          <div className="space-y-2">
            {(grouped.get(d) || []).length === 0 && (<div className="text-xs text-gray-400">No items</div>)}
            {(grouped.get(d) || []).map((it)=>(
              <div key={it.id} className="rounded-xl border bg-white p-2 text-xs">
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
export function renderPlanBlock({ plan, blocks, tasks }) {
  const lines = [];
  lines.push("### PLAN2TASKS ###");
  lines.push(`Title: ${plan.title}`);
  lines.push(`Start: ${plan.startDate}`);
  lines.push(`Timezone: ${plan.timezone}`);
  lines.push("--- Blocks ---");
  for (const b of blocks) lines.push(`- ${b.label} | days=${b.days?.join(",") || ""} | time=${b.time || ""} | dur=${b.durationMins || 60}`);
  lines.push("--- Tasks ---");
  for (const t of tasks) lines.push(`- ${t.title} | day=${t.dayOffset} | time=${t.time || ""} | dur=${t.durationMins || 60} | notes=${t.notes || ""}`);
  lines.push("### END ###");
  return lines.join("\n");
}
