import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Check, ClipboardCopy, Download, ListChecks, Plus, Sparkles, Users, Trash2, Edit3, Save, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { supabaseClient } from "../lib/supabase-client.js";

function cn(...classes){ return classes.filter(Boolean).join(" "); }
const THEME = { brand:"#111827", ring:"#22d3ee" };
const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];

const STEPS = [
  { key:"basics", title:"Plan basics", icon: Calendar, subtitle:"Name your plan, choose dates & timezone." },
  { key:"blocks", title:"Recurring blocks", icon: ListChecks, subtitle:"Gym time, meetings, and fixed commitments." },
  { key:"tasks", title:"Add tasks", icon: Plus, subtitle:"Quickly capture what needs doing by day." },
  { key:"review", title:"Review & generate", icon: Sparkles, subtitle:"Preview, then deliver to a selected user." },
];

function uid(){ return Math.random().toString(36).slice(2,10); }
function addDays(startDateStr, d){ const dt = new Date(startDateStr); dt.setDate(dt.getDate() + d); return dt; }
function escapeICS(text){ return String(text).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }

function toICS({ title, startDate, tasks, timezone }) {
  const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//Wizard//EN"];
  tasks.forEach((t) => {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + t.dayOffset);
    let DTSTART = "", DTEND = "";
    if (t.time) {
      const [h, m] = t.time.split(":").map(Number);
      dt.setHours(h, m || 0, 0, 0);
      const end = new Date(dt.getTime() + (t.durationMins || 60) * 60000);
      DTSTART = `DTSTART;TZID=${timezone}:${format(dt, "yyyyMMdd'T'HHmm")}`;
      DTEND = `DTEND;TZID=${timezone}:${format(end, "yyyyMMdd'T'HHmm")}`;
    } else {
      const end = new Date(dt); end.setDate(end.getDate() + 1);
      DTSTART = `DTSTART;VALUE=DATE:${format(dt, "yyyyMMdd")}`;
      DTEND = `DTEND;VALUE=DATE:${format(end, "yyyyMMdd")}`;
    }
    const uidStr = uid();
    lines.push("BEGIN:VEVENT",`UID:${uidStr}@plan2tasks`,`DTSTAMP:${dtstamp}Z`,`SUMMARY:${escapeICS(t.title)}`,`DESCRIPTION:${escapeICS(t.notes || "")}`,DTSTART,DTEND,"END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}

// ---------- Auth screen ----------
function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("signup");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
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
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
    if (error) setMsg("Error: " + error.message);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold mb-1">Plan2Tasks – Planner Account</h1>
        <p className="text-sm text-gray-500 mb-4">Create your planner account, then add users and deliver tasks.</p>

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

// ---------- App shell ----------
export default function App() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription?.unsubscribe();
  }, []);
  if (!session) return <AuthScreen onSignedIn={(s)=>setSession(s)} />;

  const plannerEmail = session.user?.email || "";
  return <AppShell plannerEmail={plannerEmail} onSignOut={() => supabaseClient.auth.signOut()} />;
}

function AppShell({ plannerEmail, onSignOut }) {
  const [view, setView] = useState("users"); // "users" first
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
            <button onClick={onSignOut} className="rounded-xl bg-gray-900 px-3 py-2 font-semibold text-white hover:bg-black">
              <LogOut className="inline h-4 w-4 mr-1" /> Sign out
            </button>
          </div>
        </header>

        {view === "users" ? <UsersDashboard plannerEmail={plannerEmail} onGoPlan={()=>setView("plan")} /> : <Wizard plannerEmail={plannerEmail} />}
      </div>
    </div>
  );
}

// ---------- Users Dashboard ----------
function UsersDashboard({ plannerEmail, onGoPlan }) {
  const [users, setUsers] = useState([]);
  const [newEmail, setNewEmail] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [editing, setEditing] = useState(null); // email being edited
  const [editVal, setEditVal] = useState("");

  async function refresh() {
    const resp = await fetch(`/api/users/list?plannerEmail=${encodeURIComponent(plannerEmail)}`);
    const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!resp.ok) return setStatusMsg(data.error || "Failed to load users");
    setUsers(data.users || []);
  }
  useEffect(()=>{ refresh(); }, [plannerEmail]);

  async function addUser() {
    setStatusMsg("Creating invite...");
    const resp = await fetch("/api/invite", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: newEmail.trim() }) });
    const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { return setStatusMsg(text); }
    if (!resp.ok) return setStatusMsg(data.error || "Invite failed");
    setStatusMsg(data.emailed ? "Invite link created & emailed." : "Invite link created. Email not configured — copy and send.");
    setNewEmail("");
    await refresh();
  }

  async function delUser(email) {
    if (!confirm(`Delete ${email}?`)) return;
    const resp = await fetch("/api/users/delete", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: email }) });
    const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!resp.ok) return alert(data.error || "Delete failed");
    await refresh();
  }

  async function saveEdit(oldEmail) {
    const resp = await fetch("/api/users/update", { method:"POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: oldEmail, newEmail: editVal.trim() }) });
    const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { data = { error: text }; }
    if (!resp.ok) return alert(data.error || "Update failed");
    setEditing(null); setEditVal(""); await refresh();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Users Dashboard</h2>
        <p className="text-sm text-gray-500">Add, edit, or delete users. Invites email automatically on creation.</p>
      </div>

      {/* Add user */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
        <input value={newEmail} onChange={(e)=>setNewEmail(e.target.value)} type="email" placeholder="user@example.com"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
        <button onClick={addUser} className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">Add user</button>
      </div>
      <div className="mb-3 text-xs text-gray-600">{statusMsg}</div>

      {/* Users table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="py-2">Email</th>
              <th className="py-2">Status</th>
              <th className="py-2">Invite link</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.email} className="border-t">
                <td className="py-2">
                  {editing === u.email ? (
                    <input value={editVal} onChange={(e)=>setEditVal(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" />
                  ) : (
                    <span>{u.email}</span>
                  )}
                </td>
                <td className="py-2">{u.status === "connected" ? "✓ connected" : "invited"}</td>
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
                    {u.status !== "connected" && (
                      editing === u.email ? (
                        <button onClick={()=>saveEdit(u.email)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">
                          <Save className="h-3 w-3" /> Save
                        </button>
                      ) : (
                        <button onClick={()=>{ setEditing(u.email); setEditVal(u.email); }} className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-xs">
                          <Edit3 className="h-3 w-3" /> Edit
                        </button>
                      )
                    )}
                    <button onClick={()=>delUser(u.email)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 text-red-700 px-2 py-1 text-xs">
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!users || users.length === 0) && (
              <tr><td className="py-6 text-gray-500" colSpan={4}>No users yet. Add one above to send an invite.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <button onClick={onGoPlan} className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
          Go to Plan
        </button>
      </div>
    </div>
  );
}

// ---------- Wizard (existing planner) ----------
function Wizard({ plannerEmail }) {
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState({ title: "Weekly Plan", startDate: format(new Date(), "yyyy-MM-dd"), timezone: "America/Chicago" });
  const [blocks, setBlocks] = useState([{ id: uid(), label: "Gym", days: [1,2,3,4,5], time: "12:00", durationMins: 60 }]);
  const [tasks, setTasks] = useState([
    { id: uid(), title: "Finish Accidental CEO Ch. 11", dayOffset: 0, time: "09:00", durationMins: 120, notes: "Narrative pass first." },
    { id: uid(), title: "Polish Starter Kit PDF", dayOffset: 2, time: "09:00", durationMins: 120, notes: "Visual polish + export." },
    { id: uid(), title: "Weekly Review", dayOffset: 4, time: "15:30", durationMins: 45, notes: "Wins, shipped, blockers." },
  ]);

  const [users, setUsers] = useState([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  useEffect(()=>{ (async()=>{
    const resp = await fetch(`/api/users/list?plannerEmail=${encodeURIComponent(plannerEmail)}`);
    const data = await resp.json();
    setUsers(data.users || []);
    const connected = (data.users || []).find(u => u.status === "connected");
    const any = (data.users || [])[0];
    const selEmail = connected?.email || any?.email || "";
    setSelectedUserEmail(selEmail);
    const sel = (data.users || []).find(u => u.email === selEmail);
    setInviteLink(sel?.inviteLink || "");
  })(); }, [plannerEmail]);

  const previewItems = useMemo(() => {
    const out = [...tasks.map((t) => ({ ...t, type: "task" }))];
    blocks.forEach((b) => { for (let d = 0; d < 7; d++) {
      const date = new Date(plan.startDate); date.setDate(date.getDate() + d);
      const dow = date.getDay(); if (b.days.includes(dow)) out.push({ id: uid(), type: "block", title: b.label, dayOffset: d, time: b.time, durationMins: b.durationMins, notes: "Recurring block" });
    }});
    return out.sort((a,b)=> a.dayOffset - b.dayOffset || (a.time || "").localeCompare(b.time || ""));
  }, [blocks, tasks, plan.startDate]);

  async function pushToSelectedUser() {
    const outEl = document.getElementById("push-result");
    try {
      if (outEl) outEl.textContent = "Pushing...";
      if (!selectedUserEmail) throw new Error("Choose a user first.");
      if (tasks.length === 0) throw new Error("Add at least one task.");

      const planBlock = renderPlanBlock({ plan, blocks, tasks });
      const resp = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: selectedUserEmail, planBlock }),
      });
      const text = await resp.text(); let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
      if (!resp.ok) throw new Error(data.error || "Push failed");
      if (outEl) outEl.textContent = `Success — created ${data.created} tasks for ${selectedUserEmail}.`;
    } catch (e) {
      if (outEl) outEl.textContent = "Error: " + e.message;
    }
  }

  return (
    <>
      <Stepper current={step} onJump={(idx)=>setStep(idx)} />

      <AnimatePresence mode="wait">
        {step === 0 && (
          <motion.div key="s1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <SectionCard title="Plan basics" description="These drive dates and export options.">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Plan title" required>
                  <input value={plan.title} onChange={(e)=>setPlan({ ...plan, title: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="e.g., Week of Aug 25" />
                </Field>
                <Field label="Start date" hint="Your Monday or Day 1" required>
                  <input type="date" value={plan.startDate} onChange={(e)=>setPlan({ ...plan, startDate: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                </Field>
                <Field label="Timezone" required>
                  <select value={plan.timezone} onChange={(e)=>setPlan({ ...plan, timezone: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                    {TIMEZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
                  </select>
                </Field>
              </div>
            </SectionCard>
            <ActionBar canBack={false} canNext={true} onBack={()=>{}} onNext={()=>setStep(1)} />
          </motion.div>
        )}

        {step === 1 && (
          <motion.div key="s2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <SectionCard title="Recurring blocks" description="Add fixed commitments that appear in your week automatically.">
              <BlocksEditor blocks={blocks} setBlocks={setBlocks} />
            </SectionCard>
            <ActionBar canBack canNext onBack={()=>setStep(0)} onNext={()=>setStep(2)} />
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="s3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <SectionCard title="Tasks" description="Capture tasks by day. Times are optional; duration defaults to 60m.">
              <TasksEditor startDate={plan.startDate} tasks={tasks} setTasks={setTasks} />
            </SectionCard>
            <ActionBar canBack canNext={tasks.length>0} onBack={()=>setStep(1)} onNext={()=>setStep(3)} />
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="s4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <SectionCard title="Plan preview & export" description="Preview your week. Export or deliver to a connected user.">
              <PreviewWeek startDate={plan.startDate} items={usePreviewItems(plan, blocks, tasks)} />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={async()=>{ await navigator.clipboard.writeText(renderPlanBlock({ plan, blocks, tasks })); alert("Plan2Tasks block copied."); }}
                  className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
                  <ClipboardCopy className="h-4 w-4" /> Copy Plan2Tasks block
                </button>
                <button onClick={()=>{ const url = toICS({ title: plan.title, startDate: plan.startDate, tasks: usePreviewItems(plan, blocks, tasks), timezone: plan.timezone }); const a=document.createElement("a"); a.href=url; a.download=`${plan.title.replace(/\s+/g,"_")}.ics`; a.click(); URL.revokeObjectURL(url); }}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                  <Download className="h-4 w-4" /> Export .ics
                </button>
              </div>
            </SectionCard>

            {/* Delivery */}
            <div className="mt-6 rounded-2xl border-2 border-cyan-300 bg-cyan-50 p-4">
              <div className="mb-3 text-sm font-semibold text-cyan-900">Deliver to a user</div>
              <select
                value={selectedUserEmail}
                onChange={(e)=>{ const email = e.target.value; setSelectedUserEmail(email); const u = users.find(x=>x.email===email); setInviteLink(u?.inviteLink || ""); }}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="">— Choose —</option>
                {users.map(u=>(
                  <option key={u.email} value={u.email}>{u.email} {u.status==="connected"?"✓": "(invited)"}</option>
                ))}
              </select>

              {inviteLink && (
                <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="text-xs font-medium text-amber-900 mb-1">Invite link (for this user)</div>
                  <div className="break-words text-xs">{inviteLink}</div>
                </div>
              )}

              <div className="mt-3">
                <button onClick={pushToSelectedUser} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  Push Plan to Selected User
                </button>
                <div id="push-result" className="mt-2 text-xs text-gray-600"></div>
              </div>
            </div>

            <ActionBar canBack canNext onBack={()=>setStep(2)} onNext={()=>alert("All set!")} nextLabel="Finish" />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------- UI atoms ----------
function Stepper({ current, onJump }) {
  return (
    <ol className="grid grid-cols-4 gap-2 mb-6">
      {STEPS.map((s, idx) => {
        const active = idx === current; const done = idx < current; const Icon = s.icon;
        return (
          <li key={s.key}>
            <button onClick={() => (done ? onJump(idx) : null)}
              className={cn("w-full flex items-center gap-3 rounded-2xl p-3 border",
                active ? "border-transparent bg-cyan-50 ring-2 ring-offset-2" : done ? "border-gray-200 bg-white" : "border-dashed border-gray-300 bg-gray-50")}
              style={active ? { boxShadow: `0 0 0 2px ${THEME.ring}` } : undefined}>
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl",
                done ? "bg-emerald-500 text-white" : active ? "bg-cyan-500 text-white" : "bg-gray-200 text-gray-700")}>
                {done ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
              </div>
              <div className="text-left">
                <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                <div className="text-xs text-gray-500">{s.subtitle}</div>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
function SectionCard({ title, description, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3"><h3 className="text-lg font-semibold text-gray-900">{title}</h3>{description && <p className="mt-1 text-sm text-gray-500">{description}</p>}</div>
      <div>{children}</div>
    </div>
  );
}
function Field({ label, hint, children, required }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-gray-800">{label} {required && <span className="text-red-500">*</span>}</div>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </label>
  );
}
function BlocksEditor({ blocks, setBlocks }) {
  const [label, setLabel] = useState(""); const [time, setTime] = useState("12:00"); const [dur, setDur] = useState(60); const [days, setDays] = useState([1,2,3,4,5]);
  const toggleDay = (d) => setDays((arr) => (arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d]));
  const add = () => { if (!label.trim()) return; setBlocks([...blocks, { id: uid(), label: label.trim(), time, durationMins: Number(dur) || 60, days: [...days].sort() }]); setLabel(""); };
  const remove = (id) => setBlocks(blocks.filter((b) => b.id !== id));
  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Label" required><input value={label} onChange={(e)=>setLabel(e.target.value)} placeholder="e.g., Gym" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
        <Field label="Time"><input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
        <Field label="Duration (mins)"><input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
        <Field label="Days of week"><div className="flex flex-wrap gap-2">{"SMTWTFS".split("").map((ch, idx) => (
          <button key={idx} onClick={()=>toggleDay(idx)} className={cn("h-9 w-9 rounded-xl border text-sm font-medium", days.includes(idx) ? "border-cyan-500 bg-cyan-50 text-cyan-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50")}>{ch}</button>
        ))}</div></Field>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={add} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"><Plus className="h-4 w-4" /> Add block</button>
        <div className="text-xs text-gray-500">Tip: Blocks auto-populate across the week.</div>
      </div>
      {blocks.length > 0 && (<div className="mt-4 flex flex-wrap gap-2">{blocks.map((b)=>(
        <span key={b.id} className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs">
          {b.label} • {b.time} • {b.durationMins}m
          <button className="ml-1 text-gray-400 hover:text-gray-600" onClick={()=>remove(b.id)} aria-label="Remove">×</button>
        </span>
      ))}</div>)}
    </div>
  );
}
function TasksEditor({ startDate, tasks, setTasks }) {
  const [title, setTitle] = useState(""); const [dayOffset, setDayOffset] = useState(0); const [time, setTime] = useState(""); const [dur, setDur] = useState(60); const [notes, setNotes] = useState("");
  const add = () => { if (!title.trim()) return; setTasks([...tasks, { id: uid(), title: title.trim(), dayOffset: Number(dayOffset) || 0, time: time || undefined, durationMins: Number(dur) || 60, notes }]); setTitle(""); setNotes(""); };
  const remove = (id) => setTasks(tasks.filter((t)=>t.id!==id));
  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-5">
        <Field label="Title" required><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g., Write proposal" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
        <Field label="Day" hint="0 = start date">
          <select value={dayOffset} onChange={(e)=>setDayOffset(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
            {[0,1,2,3,4,5,6].map((d)=>(<option key={d} value={d}>{format(addDays(startDate, d), "EEE MM/dd")}</option>))}
          </select>
        </Field>
        <Field label="Time (optional)"><input type="time" value={time} onChange={(e)=>setTime(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
        <Field label="Duration (mins)"><input type="number" min={15} step={15} value={dur} onChange={(e)=>setDur(e.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
        <Field label="Notes"><input value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="optional" className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
      </div>
      <div className="flex items-center justify-between">
        <button onClick={add} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"><Plus className="h-4 w-4" /> Add task</button>
        <div className="text-xs text-gray-500">Times optional; no time → all-day.</div>
      </div>
      {tasks.length > 0 && (<div className="mt-4 space-y-2">{tasks.map((t)=>(
        <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-sm"><div className="font-medium text-gray-900">{t.title}</div>
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
function usePreviewItems(plan, blocks, tasks) {
  return useMemo(() => {
    const out = [...tasks.map((t) => ({ ...t, type: "task" }))];
    blocks.forEach((b) => { for (let d = 0; d < 7; d++) {
      const date = new Date(plan.startDate); date.setDate(date.getDate() + d);
      const dow = date.getDay(); if (b.days.includes(dow)) out.push({ id: uid(), type: "block", title: b.label, dayOffset: d, time: b.time, durationMins: b.durationMins, notes: "Recurring block" });
    }});
    return out.sort((a,b)=> a.dayOffset - b.dayOffset || (a.time || "").localeCompare(b.time || ""));
  }, [blocks, tasks, plan.startDate]);
}
export function renderPlanBlock({ plan, blocks, tasks }) {
  const lines = [];
  lines.push("### PLAN2TASKS ###");
  lines.push(`Title: ${plan.title}`);
  lines.push(`Start: ${plan.startDate}`);
  lines.push(`Timezone: ${plan.timezone}`);
  lines.push("--- Blocks ---");
  for (const b of blocks) { lines.push(`- ${b.label} | days=${b.days.join(",")} | time=${b.time} | dur=${b.durationMins}`); }
  lines.push("--- Tasks ---");
  for (const t of tasks) { lines.push(`- ${t.title} | day=${t.dayOffset} | time=${t.time || ""} | dur=${t.durationMins} | notes=${t.notes || ""}`); }
  lines.push("### END ###");
  return lines.join("\n");
}
