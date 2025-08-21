import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Check, ChevronLeft, ChevronRight, ClipboardCopy, Download, ListChecks, Plus, Sparkles, Wand2 } from "lucide-react";
import { format } from "date-fns";

// ====== Planner identity (edit this to your email) ======
const PLANNER_EMAIL = "planner@yourdomain.com"; // <-- change to your email (used to filter your users)
// ========================================================

function cn(...classes) { return classes.filter(Boolean).join(" "); }
const THEME = { brand: "#111827", accent: "#22d3ee", accentStrong: "#06b6d4", soft: "#f3f4f6", text: "#111827", ring: "#22d3ee" };

const STEPS = [
  { key: "basics", title: "Plan basics", icon: Calendar, subtitle: "Name your plan, choose dates & timezone." },
  { key: "blocks", title: "Recurring blocks", icon: ListChecks, subtitle: "Gym time, meetings, and fixed commitments." },
  { key: "tasks", title: "Add tasks", icon: Plus, subtitle: "Quickly capture what needs doing by day." },
  { key: "review", title: "Review & generate", icon: Sparkles, subtitle: "Preview, then deliver to a selected user." },
];

const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];
function uid() { return Math.random().toString(36).slice(2, 10); }

// ----- ICS generation -----
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
function escapeICS(text){ return String(text).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;"); }

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
function Field({ label, hint, children, required }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-medium text-gray-800">{label} {required && <span className="text-red-500">*</span>}</div>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </label>
  );
}
function Chip({ children, onRemove }) {
  return <span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs">{children}{onRemove && (<button className="ml-1 text-gray-400 hover:text-gray-600" onClick={onRemove} aria-label="Remove">×</button>)}</span>;
}
function SectionCard({ title, description, children, footer }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3"><h3 className="text-lg font-semibold text-gray-900">{title}</h3>{description && <p className="mt-1 text-sm text-gray-500">{description}</p>}</div>
      <div>{children}</div>
      {footer && <div className="mt-4 border-t pt-4">{footer}</div>}
    </div>
  );
}
function ActionBar({ canBack, canNext, onBack, onNext, nextLabel = "Next" }) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <button onClick={onBack} disabled={!canBack}
        className={cn("inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium",
          canBack ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50" : "border-gray-200 bg-gray-100 text-gray-400")}>
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      <button onClick={onNext} disabled={!canNext}
        className={cn("inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm",
          canNext ? "bg-cyan-600 hover:bg-cyan-700" : "bg-gray-300")}>
        {nextLabel} <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Plan2TasksWizard() {
  const [mode, setMode] = useState("wizard");
  const [step, setStep] = useState(0);

  const [plan, setPlan] = useState({
    title: "Weekly Plan",
    startDate: format(new Date(), "yyyy-MM-dd"),
    timezone: "America/Chicago",
  });

  const [blocks, setBlocks] = useState([{ id: uid(), label: "Gym", days: [1,2,3,4,5], time: "12:00", durationMins: 60 }]);
  const [tasks, setTasks] = useState([
    { id: uid(), title: "Finish Accidental CEO Ch. 11", dayOffset: 0, time: "09:00", durationMins: 120, notes: "Narrative pass first." },
    { id: uid(), title: "Polish Starter Kit PDF", dayOffset: 2, time: "09:00", durationMins: 120, notes: "Visual polish + export." },
    { id: uid(), title: "Weekly Review", dayOffset: 4, time: "15:30", durationMins: 45, notes: "Wins, shipped, blockers." },
  ]);

  // ==== NEW: Users-first state ====
  const [users, setUsers] = useState([]);                    // [{email, status, inviteLink}]
  const [selectedUserEmail, setSelectedUserEmail] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");      // Working / Error / etc.

  useEffect(() => { refreshUsers(); }, []);

  async function refreshUsers() {
    try {
      const resp = await fetch(`https://plan2tasks-wizard.vercel.app/api/users/list?plannerEmail=${encodeURIComponent(PLANNER_EMAIL)}`);
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
      if (!resp.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data.users || []);
      // Auto-select a connected user if available
      const connected = (data.users || []).find(u => u.status === "connected");
      const any = (data.users || [])[0];
      setSelectedUserEmail(prev => prev || (connected?.email || any?.email || ""));
      // If a selected user has an inviteLink, show it
      const sel = (data.users || []).find(u => u.email === (connected?.email || any?.email));
      setInviteLink(sel?.inviteLink || "");
    } catch (e) {
      console.error(e);
    }
  }

  // Build the Plan2Tasks block string
  function buildPlanBlock() { return renderPlanBlock({ plan, blocks, tasks }); }

  // Create Invite (Add user -> invite link)
  async function createInvite() {
    try {
      setInviteStatus("Working...");
      setInviteLink("");
      const email = (newUserEmail || "").trim();
      if (!email) throw new Error("Enter an email first.");
      const resp = await fetch("https://plan2tasks-wizard.vercel.app/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerEmail: PLANNER_EMAIL, userEmail: email }),
      });
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 200)); }
      if (!resp.ok) throw new Error(data.error || "Invite failed");

      setInviteLink(data.inviteLink);
      setInviteStatus("Invite link created.");
      setSelectedUserEmail(email);
      setNewUserEmail("");
      await refreshUsers();
    } catch (e) {
      setInviteStatus("Error: " + e.message);
    }
  }

  // Push plan to selected user
  async function pushToSelectedUser() {
    try {
      const outEl = document.getElementById("push-result");
      if (outEl) outEl.textContent = "Pushing...";
      if (!selectedUserEmail) throw new Error("Choose a user first.");
      if (tasks.length === 0) throw new Error("Add at least one task.");

      const planBlock = buildPlanBlock();
      const resp = await fetch("https://plan2tasks-wizard.vercel.app/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userEmail: selectedUserEmail, planBlock }),
      });
      const text = await resp.text();
      let data; try { data = JSON.parse(text); } catch { throw new Error(text.slice(0,200)); }
      if (!resp.ok) throw new Error(data.error || "Push failed");

      if (outEl) outEl.textContent = `Success — created ${data.created} tasks for ${selectedUserEmail}.`;
    } catch (e) {
      const outEl = document.getElementById("push-result"); if (outEl) outEl.textContent = "Error: " + e.message;
    }
  }

  const previewItems = useMemo(() => {
    const out = [...tasks.map((t) => ({ ...t, type: "task" }))];
    blocks.forEach((b) => { for (let d = 0; d < 7; d++) {
      const date = new Date(plan.startDate); date.setDate(date.getDate() + d);
      const dow = date.getDay(); if (b.days.includes(dow)) out.push({ id: uid(), type: "block", title: b.label, dayOffset: d, time: b.time, durationMins: b.durationMins, notes: "Recurring block" });
    }});
    return out.sort((a,b)=> a.dayOffset - b.dayOffset || (a.time || "").localeCompare(b.time || ""));
  }, [blocks, tasks, plan.startDate]);

  const canNext = useMemo(() => {
    if (mode === "single") return true;
    if (step === 0) return Boolean(plan.title && plan.startDate && plan.timezone);
    if (step === 1) return true;
    if (step === 2) return tasks.length > 0;
    return true;
  }, [step, plan, tasks, mode]);

  const copyPlanBlock = async () => {
    const block = renderPlanBlock({ plan, blocks, tasks });
    await navigator.clipboard.writeText(block);
    alert("Plan2Tasks block copied to clipboard.");
  };
  const downloadICS = () => {
    const url = toICS({ title: plan.title, startDate: plan.startDate, tasks: previewItems, timezone: plan.timezone });
    const a = document.createElement("a"); a.href = url; a.download = `${plan.title.replace(/\s+/g, "_")}.ics`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: THEME.text }}>Plan2Tasks – Wizard</h1>
            <p className="text-sm text-gray-500">Plan for a user, then deliver to their Google Tasks.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
              <Wand2 className="h-4 w-4 text-cyan-600" />
              <span>Wizard mode</span>
              <input type="checkbox" className="peer sr-only" checked={mode === "wizard"} onChange={(e) => setMode(e.target.checked ? "wizard" : "single")} />
              <span className="ml-1 inline-flex h-5 w-9 items-center rounded-full bg-gray-200 p-0.5 peer-checked:bg-cyan-600">
                <span className="h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </span>
            </label>
          </div>
        </header>

        {mode === "wizard" ? (
          <div>
            <Stepper current={step} onJump={(idx)=>setStep(idx)} />
            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.div key="s1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <SectionCard title="Plan basics" description="These drive dates and export options.">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Field label="Plan title" required>
                        <input value={plan.title} onChange={(e) => setPlan({ ...plan, title: e.target.value })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="e.g., Week of Aug 25" />
                      </Field>
                      <Field label="Start date" hint="Your Monday or Day 1" required>
                        <input type="date" value={plan.startDate} onChange={(e) => setPlan({ ...plan, startDate: e.target.value })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      </Field>
                      <Field label="Timezone" required>
                        <select value={plan.timezone} onChange={(e) => setPlan({ ...plan, timezone: e.target.value })}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                          {TIMEZONES.map((tz) => (<option key={tz} value={tz}>{tz}</option>))}
                        </select>
                      </Field>
                    </div>
                  </SectionCard>
                  <ActionBar canBack={false} canNext={canNext} onBack={()=>{}} onNext={()=>setStep(1)} />
                </motion.div>
              )}

              {step === 1 && (
                <motion.div key="s2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <SectionCard title="Recurring blocks" description="Add fixed commitments that appear in your week automatically.">
                    <BlocksEditor blocks={blocks} setBlocks={setBlocks} />
                  </SectionCard>
                  <ActionBar canBack canNext={canNext} onBack={()=>setStep(0)} onNext={()=>setStep(2)} />
                </motion.div>
              )}

              {step === 2 && (
                <motion.div key="s3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <SectionCard title="Tasks" description="Capture tasks by day. Times are optional; duration defaults to 60m.">
                    <TasksEditor startDate={plan.startDate} tasks={tasks} setTasks={setTasks} />
                  </SectionCard>
                  <ActionBar canBack canNext={canNext} onBack={()=>setStep(1)} onNext={()=>setStep(3)} />
                </motion.div>
              )}

              {step === 3 && (
                <motion.div key="s4" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <SectionCard title="Plan preview & export" description="Preview your week. Export to calendar or copy the Plan2Tasks block.">
                    <PreviewWeek startDate={plan.startDate} items={previewItems} />
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button onClick={copyPlanBlock} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
                        <ClipboardCopy className="h-4 w-4" /> Copy Plan2Tasks block
                      </button>
                      <button onClick={()=>{
                        const url = toICS({ title: plan.title, startDate: plan.startDate, tasks: previewItems, timezone: plan.timezone });
                        const a = document.createElement("a"); a.href = url; a.download = `${plan.title.replace(/\s+/g, "_")}.ics`; a.click(); URL.revokeObjectURL(url);
                      }} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                        <Download className="h-4 w-4" /> Export .ics
                      </button>
                    </div>
                  </SectionCard>

                  {/* ===== Users & Delivery (NEW) ===== */}
                  <div className="mt-6 rounded-2xl border-2 border-cyan-300 bg-cyan-50 p-4">
                    <div className="mb-3 text-sm font-semibold text-cyan-900">Users & Delivery</div>

                    {/* Select existing user */}
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-cyan-200 bg-white p-3">
                        <div className="text-sm font-medium mb-2">Select a user</div>
                        <select
                          value={selectedUserEmail}
                          onChange={(e)=>{
                            const email = e.target.value;
                            setSelectedUserEmail(email);
                            const u = users.find(x=>x.email===email);
                            setInviteLink(u?.inviteLink || "");
                          }}
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          <option value="">— Choose —</option>
                          {users.map(u=>(
                            <option key={u.email} value={u.email}>
                              {u.email} {u.status === "connected" ? "✓" : "(invited)"}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2 text-xs text-gray-600">
                          Planner: <b>{PLANNER_EMAIL}</b> (edit in code if needed)
                        </div>

                        {inviteLink && (
                          <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                            <div className="text-xs font-medium text-amber-900 mb-1">Invite link (for this user)</div>
                            <div className="break-words text-xs">{inviteLink}</div>
                            <button
                              className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                              onClick={() => { navigator.clipboard.writeText(inviteLink); alert("Invite link copied"); }}
                            >Copy link</button>
                          </div>
                        )}
                      </div>

                      {/* Add new user + create invite */}
                      <div className="rounded-xl border border-cyan-200 bg-white p-3">
                        <div className="text-sm font-medium mb-2">Add user & create invite</div>
                        <input
                          value={newUserEmail}
                          onChange={(e)=>setNewUserEmail(e.target.value)}
                          type="email"
                          placeholder="user@example.com"
                          className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                        <button
                          onClick={createInvite}
                          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
                        >
                          Create Invite
                        </button>
                        <div className="mt-2 text-xs text-gray-600">{inviteStatus}</div>
                        {inviteLink && !selectedUserEmail && (
                          <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">
                            {inviteLink}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Push */}
                    <div className="mt-4">
                      <button
                        onClick={pushToSelectedUser}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Push Plan to Selected User
                      </button>
                      <div id="push-result" className="mt-2 text-xs text-gray-600"></div>
                    </div>
                  </div>
                  {/* ===== End Users & Delivery ===== */}

                  <ActionBar canBack canNext={true} onBack={()=>setStep(2)} onNext={() => alert("All set!")} nextLabel="Finish" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          // Single-page mode keeps same Users & Delivery card below
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <SectionCard title="Plan basics" description="Name, dates, timezone">
              <div className="grid grid-cols-1 gap-4">
                <Field label="Plan title" required><input value={plan.title} onChange={(e)=>setPlan({ ...plan, title: e.target.value })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Start date" required><input type="date" value={plan.startDate} onChange={(e)=>setPlan({ ...plan, startDate: e.target.value })}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" /></Field>
                  <Field label="Timezone" required>
                    <select value={plan.timezone} onChange={(e)=>setPlan({ ...plan, timezone: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500">
                      {TIMEZONES.map((tz)=>(<option key={tz} value={tz}>{tz}</option>))}
                    </select>
                  </Field>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Recurring blocks" description="Gym, meetings, etc."><BlocksEditor blocks={blocks} setBlocks={setBlocks} /></SectionCard>
            <SectionCard title="Tasks" description="Add your tasks by day"><TasksEditor startDate={plan.startDate} tasks={tasks} setTasks={setTasks} /></SectionCard>
            <SectionCard title="Preview & export" description="Review your week, copy block, or export .ics">
              <PreviewWeek startDate={plan.startDate} items={previewItems} />
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button onClick={copyPlanBlock} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black">
                  <ClipboardCopy className="h-4 w-4" /> Copy Plan2Tasks block
                </button>
                <button onClick={()=>{
                  const url = toICS({ title: plan.title, startDate: plan.startDate, tasks: previewItems, timezone: plan.timezone });
                  const a = document.createElement("a"); a.href = url; a.download = `${plan.title.replace(/\s+/g, "_")}.ics`; a.click(); URL.revokeObjectURL(url);
                }} className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50">
                  <Download className="h-4 w-4" /> Export .ics
                </button>
              </div>

              {/* Users & Delivery card in single-page */}
              <div className="mt-6 rounded-2xl border-2 border-cyan-300 bg-cyan-50 p-4">
                <div className="mb-3 text-sm font-semibold text-cyan-900">Users & Delivery</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-cyan-200 bg-white p-3">
                    <div className="text-sm font-medium mb-2">Select a user</div>
                    <select
                      value={selectedUserEmail}
                      onChange={(e)=>{
                        const email = e.target.value;
                        setSelectedUserEmail(email);
                        const u = users.find(x=>x.email===email);
                        setInviteLink(u?.inviteLink || "");
                      }}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">— Choose —</option>
                      {users.map(u=>(
                        <option key={u.email} value={u.email}>
                          {u.email} {u.status === "connected" ? "✓" : "(invited)"}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-gray-600">Planner: <b>{PLANNER_EMAIL}</b></div>
                    {inviteLink && (
                      <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                        <div className="text-xs font-medium text-amber-900 mb-1">Invite link</div>
                        <div className="break-words text-xs">{inviteLink}</div>
                        <button className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                          onClick={() => { navigator.clipboard.writeText(inviteLink); alert("Invite link copied"); }}>Copy link</button>
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-cyan-200 bg-white p-3">
                    <div className="text-sm font-medium mb-2">Add user & create invite</div>
                    <input value={newUserEmail} onChange={(e)=>setNewUserEmail(e.target.value)} type="email" placeholder="user@example.com"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                    <button onClick={createInvite} className="mt-2 inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700">
                      Create Invite
                    </button>
                    <div className="mt-2 text-xs text-gray-600">{inviteStatus}</div>
                    {inviteLink && !selectedUserEmail && (<div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs">{inviteLink}</div>)}
                  </div>
                </div>

                <div className="mt-4">
                  <button onClick={pushToSelectedUser} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Push Plan to Selected User
                  </button>
                  <div id="push-result" className="mt-2 text-xs text-gray-600"></div>
                </div>
              </div>
            </SectionCard>
          </div>
        )}

        <footer className="mt-10 text-center text-xs text-gray-500"><p>Tip: Edit your planner email at the top of <code>App.jsx</code> to filter your users.</p></footer>
      </div>
    </div>
  );
}

// ----- Blocks Editor -----
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
        <Chip key={b.id} onRemove={()=>remove(b.id)}>{b.label} • {b.time} • {b.durationMins}m • {renderDays(b.days)}</Chip>
      ))}</div>)}
    </div>
  );
}
function renderDays(days){ const map=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]; return days.map((d)=>map[d]).join(", "); }

// ----- Tasks Editor -----
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
        <div className="text-xs text-gray-500">Tip: Times are optional; tasks without times export as all-day.</div>
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
function addDays(startDateStr, d){ const dt = new Date(startDateStr); dt.setDate(dt.getDate() + d); return dt; }

// ----- Preview Week -----
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
              <div key={it.id} className={cn("rounded-xl border bg-white p-2 text-xs", it.type === "block" ? "border-cyan-200" : "border-gray-200")}>
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

// ----- Render Plan2Tasks Block -----
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
