// src/App.jsx
import * as React from "react";
import { format, parseISO, addDays, isValid as isValidDate } from "date-fns";
import { supabase } from "../lib/supabase.js";
import { Calendar, Users as UsersIcon, Settings as SettingsIcon, LogOut, Send } from "lucide-react";

/* ---------- helpers ---------- */
const clsx = (...xs) => xs.filter(Boolean).join(" ");
const toast = (m, t = "ok") => alert((t === "error" ? "Error: " : "") + m);

/* ---------- brand ---------- */
function BrandLogo() {
  return <img src="/brand/logo-dark.svg" alt="Plan2Tasks" className="h-6 w-auto" />;
}

/* ---------- layout ---------- */
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

/* ---------- date UI ---------- */
function DateButton({ value, onChange, labelWhenEmpty = "Pick date" }) {
  const [open, setOpen] = React.useState(false);
  const d = value ? (typeof value === "string" ? parseISO(value) : value) : null;
  const btnLabel = d && isValidDate(d) ? format(d, "EEE, MMM d, yyyy") : labelWhenEmpty;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
      >
        {btnLabel}
      </button>
      {open ? (
        <div className="absolute z-10 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <CalendarGrid
            initialDate={d || new Date()}
            onPick={(picked) => { setOpen(false); onChange(picked); }}
          />
        </div>
      ) : null}
    </div>
  );
}
function CalendarGrid({ initialDate, onPick }) {
  const [base, setBase] = React.useState(initialDate);
  const monthLabel = format(base, "MMMM yyyy");
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const firstDay = start.getDay();
  const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(base.getFullYear(), base.getMonth(), d));
  return (
    <div className="text-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <button className="rounded-lg px-2 py-1 hover:bg-gray-50"
          onClick={() => setBase((b) => new Date(b.getFullYear(), b.getMonth() - 1, 1))}>‹</button>
        <div className="font-semibold">{monthLabel}</div>
        <button className="rounded-lg px-2 py-1 hover:bg-gray-50"
          onClick={() => setBase((b) => new Date(b.getFullYear(), b.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] text-gray-500">{w}</div>
        ))}
        {cells.map((c, idx) => c ? (
          <button key={idx} onClick={() => onPick(c)} className="rounded-lg px-0.5 py-1.5 text-center hover:bg-gray-50">
            {c.getDate()}
          </button>
        ) : <div key={idx} />)}
      </div>
    </div>
  );
}

/* ---------- small utils ---------- */
function parseUserTimeTo24h(input) {
  if (!input) return "";
  let s = String(input).trim().toLowerCase().replace(/\s+/g, "");
  const ampm = s.endsWith("am") ? "am" : s.endsWith("pm") ? "pm" : "";
  if (ampm) s = s.slice(0, -2);
  if (/^\d{3,4}$/.test(s)) {
    const hh = s.length === 3 ? "0" + s[0] : s.slice(0, 2);
    const mm = s.slice(-2);
    const H = parseInt(hh, 10), M = parseInt(mm, 10);
    if (Number.isNaN(H) || Number.isNaN(M) || H > 23 || M > 59) return "";
    return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
  }
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return "";
  let H = parseInt(m[1], 10);
  let M = m[2] ? parseInt(m[2], 10) : 0;
  if (ampm === "am") { if (H === 12) H = 0; }
  else if (ampm === "pm") { if (H !== 12) H += 12; }
  if (H > 23 || M > 59) return "";
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

/* ---------- Invite modal (unchanged UX, fixes "Send Email" w/o link first) ---------- */
function InviteModal({ plannerEmail, onClose, presetEmail = "" }) {
  const [email, setEmail] = React.useState(presetEmail);
  const [sending, setSending] = React.useState(false);
  const [canSend, setCanSend] = React.useState(false);
  const [fromLabel, setFromLabel] = React.useState("");

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/invite/cansend");
        const j = await r.json();
        setCanSend(!!j.emailEnabled);
        setFromLabel(j.from || "");
      } catch {}
    })();
  }, []);

  async function ensureLink() {
    const qs = new URLSearchParams({ plannerEmail, userEmail: email });
    const r = await fetch(`/api/invite/preview?` + qs.toString());
    const j = await r.json();
    if (!r.ok || j.error || !j.inviteUrl) throw new Error(j.error || "Failed to prepare invite");
    return j.inviteUrl;
  }

  async function onSend() {
    try {
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
      setSending(true);
      await ensureLink(); // auto-create if needed
      const r = await fetch(`/api/invite/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerEmail, userEmail: email }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Send failed");
      toast("Invite email sent");
    } catch (e) { toast(String(e.message || e), "error"); }
    finally { setSending(false); }
  }

  return (
    <Modal title="Invite user to connect Google Tasks" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <div className="mb-1 text-xs font-medium">User email</div>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            placeholder="name@example.com"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const u = await ensureLink();
                await navigator.clipboard.writeText(u);
                toast("Invite link copied");
              } catch (e) { toast(String(e.message || e), "error"); }
            }}
            className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50"
          >
            Create & Copy Invite Link
          </button>
          <button
            onClick={onSend}
            disabled={!canSend || sending}
            className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {sending ? "Sending…" : `Send Email${fromLabel ? ` (from ${fromLabel})` : ""}`}
          </button>
        </div>
        {!canSend ? (
          <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
            Email isn’t configured; share the link manually instead.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ---------- Users ---------- */
function UsersView({ plannerEmail, onManage }) {
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [users, setUsers] = React.useState([]);
  const [q, setQ] = React.useState("");
  const [editUser, setEditUser] = React.useState(null);
  const [newCat, setNewCat] = React.useState("");

  React.useEffect(() => { load(); /* eslint-disable-next-line */ }, [plannerEmail]);

  async function load() {
    setLoading(true);
    try {
      let r = await fetch(`/api/users?plannerEmail=${encodeURIComponent(plannerEmail)}`);
      if (r.status === 404) r = await fetch(`/api/users/list?plannerEmail=${encodeURIComponent(plannerEmail)}`);
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j) ? j : j.users || [];
      arr.sort((a, b) => (a.status === "connected" ? 0 : 1) - (b.status === "connected" ? 0 : 1));
      setUsers(arr);
    } catch { toast("Failed to load users", "error"); }
    finally { setLoading(false); }
  }

  async function saveCats(u, cats) {
    const r = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plannerEmail, userEmail: u.email, groups: cats }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || "Save failed");
  }

  const filtered = users.filter((u) => {
    if (!q) return true;
    const hay = `${u.email || ""} ${(Array.isArray(u.groups) ? u.groups.join(" ") : "")} ${u.status || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search (email, categories, status)"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-64"
          />
          <button
            onClick={() => setInviteOpen(true)}
            className="rounded-xl bg-cyan-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-cyan-700"
          >
            Invite User
          </button>
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
            ) : filtered.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">No users yet.</td></tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.email} className="border-t">
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      {(u.groups || []).map((g) => (
                        <span key={g} className="rounded-full border px-2 py-0.5 text-[11px]">{g}</span>
                      ))}
                      <button
                        onClick={() => setEditUser(u)}
                        className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-gray-50"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {u.status === "connected" ? (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 border border-green-200">Connected</span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-800 border border-yellow-200">Not connected</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onManage(u.email)}
                        className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
                      >
                        Manage User
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {inviteOpen ? <InviteModal plannerEmail={plannerEmail} onClose={() => setInviteOpen(false)} /> : null}
      {editUser ? (
        <EditCats
          plannerEmail={plannerEmail}
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={async (cats) => {
            try {
              await saveCats(editUser, cats);
              // update local
              udate(setUsers, editUser.email, cats);
              toast("Categories saved");
              setEditUser(null);
            } catch (e) { toast(String(e.message || e), "error"); }
          }}
        />
      ) : null}
    </div>
  );

  function udate(setter, email, cats) {
    setter((prev) => prev.map((x) => (x.email === email ? { ...x, groups: cats } : x)));
  }
}

function EditCats({ plannerEmail, user, onClose, onSave }) {
  const [chips, setChips] = React.useState(Array.isArray(user.groups) ? user.groups : []);
  const [input, setInput] = React.useState("");
  function add() {
    const v = input.trim();
    if (!v) return;
    if (!chips.includes(v)) setChips([...chips, v]);
    setInput("");
  }
  function remove(v) { setChips(chips.filter((c) => c !== v)); }
  return (
    <Modal title={`Edit categories – ${user.email}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)} className="flex-1 rounded-xl border px-3 py-2 text-sm" placeholder="Add category…" />
          <button onClick={add} className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">Add</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {chips.length ? chips.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
              {c}
              <button onClick={() => remove(c)} className="rounded px-1 text-[10px] hover:bg-gray-100">×</button>
            </span>
          )) : <div className="text-sm text-gray-500">No categories yet.</div>}
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50">Cancel</button>
          <button onClick={() => onSave(chips)} className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700">Save</button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------- Recurrence chips ---------- */
function DayPills({ value, onChange }) {
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d, idx) => {
        const on = value.includes(idx);
        return (
          <button
            key={d}
            type="button"
            onClick={() => {
              const s = new Set(value);
              if (on) s.delete(idx); else s.add(idx);
              onChange(Array.from(s).sort((a, b) => a - b));
            }}
            className={clsx(
              "rounded-full px-2.5 py-1 text-xs border",
              on ? "bg-cyan-600 text-white border-cyan-600" : "bg-white text-gray-700 hover:bg-gray-50"
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Plan + History ---------- */
function PlanView({ plannerEmail, selectedUserEmail, onChangeUserEmail, onPushed }) {
  const [users, setUsers] = React.useState([]);
  const [planTitle, setPlanTitle] = React.useState("");
  const [planDate, setPlanDate] = React.useState(null);
  const [timezone, setTimezone] = React.useState(
    localStorage.getItem("p2t.defaultTz") || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"
  );

  const [items, setItems] = React.useState([]);
  const [taskTitle, setTaskTitle] = React.useState("");
  const [taskNotes, setTaskNotes] = React.useState("");
  const [taskDate, setTaskDate] = React.useState(null);
  const [taskTime, setTaskTime] = React.useState("");

  const [recurring, setRecurring] = React.useState({
    type: "none", weeklyDays: [], monthlyDay: null, end: "none", count: 5, until: null,
  });

  const [histTab, setHistTab] = React.useState("active");
  const [historyRows, setHistoryRows] = React.useState([]);
  const [histLoading, setHistLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const pageSize = 10;

  React.useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams({ plannerEmail });
        let r = await fetch(`/api/users?` + qs.toString());
        if (r.status === 404) r = await fetch(`/api/users/list?` + qs.toString());
        const j = await r.json().catch(() => ({}));
        const arr = Array.isArray(j) ? j : j.users || [];
        arr.sort((a, b) => (a.status === "connected" ? 0 : 1) - (b.status === "connected" ? 0 : 1));
        setUsers(arr);
      } catch {}
    })();
  }, [plannerEmail]);

  React.useEffect(() => {
    if (!selectedUserEmail) {
      setHistoryRows([]);
      return;
    }
    loadHistory();
    // eslint-disable-next-line
  }, [plannerEmail, selectedUserEmail, histTab]);

  async function loadHistory() {
    setHistLoading(true);
    try {
      const body = { plannerEmail, userEmail: selectedUserEmail, status: histTab };
      const r = await fetch("/api/history/list", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      const arr = Array.isArray(j.items) ? j.items : [];
      setHistoryRows(arr);
      setPage(1);
    } catch {
      setHistoryRows([]);
    } finally {
      setHistLoading(false);
    }
  }

  function pageRows() {
    const start = (page - 1) * pageSize;
    return historyRows.slice(start, start + pageSize);
  }

  function addTask() {
    if (!taskTitle.trim()) return toast("Add a task title", "error");
    const baseDate = taskDate || planDate || new Date();
    const time24 = parseUserTimeTo24h(taskTime);

    const pushItem = (d) => ({
      title: taskTitle.trim(),
      notes: taskNotes.trim(),
      date: d ? new Date(d) : null,
      time: time24 || "",
    });

    const out = [];
    if (recurring.type === "none") {
      out.push(pushItem(baseDate));
    } else if (recurring.type === "daily") {
      const n = recurring.end === "count" ? Math.max(1, Number(recurring.count || 1)) : 10;
      let cur = new Date(baseDate);
      for (let i = 0; i < n; i++) { out.push(pushItem(cur)); cur = addDays(cur, 1); }
    } else if (recurring.type === "weekly") {
      if (!recurring.weeklyDays.length) return toast("Pick days of week", "error");
      const n = recurring.end === "count" ? Math.max(1, Number(recurring.count || 1)) : 10;
      const until = recurring.until ? new Date(recurring.until) : null;
      let added = 0; let cur = new Date(baseDate);
      while (added < n) {
        if (until && cur > until) break;
        if (recurring.weeklyDays.includes(cur.getDay())) { out.push(pushItem(cur)); added++; }
        cur = addDays(cur, 1);
      }
    } else if (recurring.type === "monthly") {
      const n = recurring.end === "count" ? Math.max(1, Number(recurring.count || 1)) : 6;
      const start = new Date(baseDate);
      const day = recurring.monthlyDay || start.getDate();
      for (let i = 0; i < n; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, Math.min(day, 28));
        if (recurring.until && d > new Date(recurring.until)) break;
        out.push(pushItem(d));
      }
    }

    setItems((prev) => [...prev, ...out]);
    setTaskTitle(""); setTaskNotes(""); setTaskTime("");
    setRecurring({ type: "none", weeklyDays: [], monthlyDay: null, end: "none", count: 5, until: null });
  }

  function removeTask(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  function exportICS() {
    const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//EN","CALSCALE:GREGORIAN"];
    items.forEach((it, i) => {
      lines.push("BEGIN:VTODO");
      lines.push(`UID:p2t-${i}-${Date.now()}@plan2tasks`);
      lines.push(`SUMMARY:${it.title}`);
      if (it.notes) lines.push(`DESCRIPTION:${it.notes.replace(/\n/g, "\\n")}`);
      if (it.date) {
        const due = it.time ? format(it.date, "yyyyMMdd'T'HHmmss'Z'") : format(it.date, "yyyyMMdd");
        lines.push(`DUE:${due}`);
      }
      lines.push("END:VTODO");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${(planTitle || "plan2tasks").replace(/\s+/g, "-").toLowerCase()}.ics`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 800);
  }

  async function pushToGoogle() {
    if (!selectedUserEmail) return toast("Select a user first", "error");
    if (!planTitle.trim()) return toast("Plan Name is required", "error");
    if (items.length === 0) return toast("No tasks to push", "error");

    const startISO = planDate ? format(planDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");
    const itemsPayload = items.map((it) => {
      const due = it.date ? format(it.date, "yyyy-MM-dd") + (it.time ? `T${it.time}:00.000Z` : "") : null;
      return { title: it.title, notes: it.notes, due };
    });
    const planBlock = { title: planTitle.trim(), start_date: startISO, timezone, items: itemsPayload };

    try {
      const r = await fetch("/api/push", {
        method: "POST", headers: { "Content-Type": "application/json" },
        // send BOTH forms to satisfy older/newer server handlers
        body: JSON.stringify({
          plannerEmail, userEmail: selectedUserEmail,
          items: itemsPayload, planBlock, mode: "append"
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Push failed");
      toast("Pushed to Google Tasks");
      setItems([]);
      onPushed?.();
      // reload history
      await loadHistory();
    } catch (e) {
      toast(String(e.message || e), "error");
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Plan"
        right={
          <div className="text-right">
            <div className="mb-1 text-xs font-medium">Deliver to user</div>
            <select
              value={selectedUserEmail || ""}
              onChange={(e) => onChangeUserEmail(e.target.value)}
              className="w-64 rounded-xl border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— Select user —</option>
              {users.map((u) => (
                <option key={u.email} value={u.email}>
                  {u.email}{u.status === "connected" ? "" : " (not connected)"}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <div className="mb-1 text-xs font-medium">Plan Name</div>
            <input
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder="e.g., Onboarding – Week 1"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="block">
            <div className="mb-1 text-xs font-medium">Choose Plan Start Date</div>
            <DateButton value={planDate} onChange={(d) => setPlanDate(d)} labelWhenEmpty="Pick date" />
          </div>
        </div>

        <div className="mt-2 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium">Task title</div>
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium">Notes (optional)</div>
            <input
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              placeholder="Any extra details"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="block">
            <div className="mb-1 text-xs font-medium">Task date</div>
            <DateButton value={taskDate} onChange={(d) => setTaskDate(d)} labelWhenEmpty="Pick date" />
          </div>
          <label className="block">
            <div className="mb-1 text-xs font-medium">Time (optional)</div>
            <input
              value={taskTime}
              onChange={(e) => setTaskTime(e.target.value)}
              placeholder="e.g., 1pm, 1:30pm, 1330"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {/* Recurrence */}
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium">Recurrence</div>
            <div className="flex flex-wrap gap-2">
              {["none", "daily", "weekly", "monthly"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setRecurring((r) => ({ ...r, type: t }))}
                  className={clsx(
                    "rounded-full border px-3 py-1 text-xs",
                    recurring.type === t ? "bg-cyan-600 text-white border-cyan-600" : "hover:bg-gray-50"
                  )}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>

            {recurring.type === "weekly" ? (
              <div className="mt-2">
                <div className="mb-1 text-xs text-gray-600">Days of week</div>
                <DayPills
                  value={recurring.weeklyDays}
                  onChange={(v) => setRecurring((r) => ({ ...r, weeklyDays: v }))}
                />
              </div>
            ) : null}

            {recurring.type === "monthly" ? (
              <div className="mt-2">
                <div className="mb-1 text-xs text-gray-600">Day of month</div>
                <input
                  type="number" min={1} max={31}
                  value={recurring.monthlyDay || ""}
                  onChange={(e) => setRecurring((r) => ({ ...r, monthlyDay: Number(e.target.value || 1) }))}
                  className="w-24 rounded-xl border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            ) : null}

            {recurring.type !== "none" ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="rec-end"
                    checked={recurring.end === "none"}
                    onChange={() => setRecurring((r) => ({ ...r, end: "none", until: null }))}
                  />
                  <span>Indefinite (limited preview)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio" name="rec-end"
                    checked={recurring.end === "count"}
                    onChange={() => setRecurring((r) => ({ ...r, end: "count", until: null }))}
                  />
                  <span>
                    Generate{" "}
                    <input
                      type="number" min={1} value={recurring.count}
                      onChange={(e) => setRecurring((r) => ({ ...r, count: Number(e.target.value || 1) }))}
                      className="mx-1 w-16 rounded-lg border px-2 py-1 text-sm"
                    /> items
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio" name="rec-end"
                      checked={recurring.end === "until"}
                      onChange={() => setRecurring((r) => ({ ...r, end: "until" }))}
                    />
                    <span>End on date</span>
                  </label>
                  {recurring.end === "until" ? (
                    <DateButton value={recurring.until} onChange={(d) => setRecurring((r) => ({ ...r, until: d }))} />
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="col-span-full flex items-center gap-2">
            <button
              onClick={addTask}
              className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              Add task
            </button>
          </div>
        </div>
      </Section>

      {/* PREVIEW ABOVE HISTORY */}
      {items.length > 0 ? (
        <Section
          title="Preview & Deliver"
          right={
            <div className="flex items-center gap-2">
              <button onClick={exportICS} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
                Export .ics
              </button>
              <button
                onClick={pushToGoogle}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              >
                <Send size={16} /> Push to Google Tasks
              </button>
            </div>
          }
        >
          <div className="rounded-xl border border-gray-100 overflow-x-auto">
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
                {items.map((it, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{it.title}</td>
                    <td className="px-3 py-2">{it.date ? format(it.date, "yyyy-MM-dd") : "—"}</td>
                    <td className="px-3 py-2">{it.time || "—"}</td>
                    <td className="px-3 py-2">{it.notes || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => removeTask(idx)} className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}

      <Section
        title={`History ${selectedUserEmail ? `for ${selectedUserEmail}` : ""}`}
        right={
          <div className="rounded-xl border">
            <div className="flex overflow-hidden rounded-xl">
              {["active", "archived"].map((t) => (
                <button
                  key={t}
                  onClick={() => setHistTab(t)}
                  className={clsx("px-3 py-1.5 text-xs", histTab === t ? "bg-gray-900 text-white" : "hover:bg-gray-50")}
                >
                  {t[0].toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {!selectedUserEmail ? (
          <div className="text-sm text-gray-600">Select a user (top-right) to view their history.</div>
        ) : (
          <>
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
                  ) : pageRows().length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Nothing here yet.</td></tr>
                  ) : (
                    pageRows().map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2">{r.start_date}</td>
                        <td className="px-3 py-2">{r.items_count}</td>
                        <td className="px-3 py-2">{r.mode}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={async () => {
                                try {
                                  const rr = await fetch("/api/history/restore", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ plannerEmail, historyId: r.id }),
                                  });
                                  const jj = await rr.json();
                                  if (!rr.ok || jj.error) throw new Error(jj.error || "Restore failed");
                                  // prefill
                                  const block = jj.planBlock;
                                  setPlanTitle(block?.title || "");
                                  setPlanDate(block?.start_date ? parseISO(block.start_date) : null);
                                  setItems(
                                    (block?.items || []).map((it) => ({
                                      title: it.title || "",
                                      notes: it.notes || "",
                                      date: it.due ? parseISO(it.due) : null,
                                      time: it.due && it.due.includes("T") ? format(parseISO(it.due), "HH:mm") : "",
                                    }))
                                  );
                                  toast("Restored into Plan");
                                } catch (e) { toast(String(e.message || e), "error"); }
                              }}
                              className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"
                            >
                              Restore
                            </button>
                            {histTab === "active" ? (
                              <button
                                onClick={async () => {
                                  try {
                                    const rr = await fetch("/api/history/archive", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ plannerEmail, historyId: r.id, archived: true }),
                                    });
                                    const jj = await rr.json();
                                    if (!rr.ok || jj.error) throw new Error(jj.error || "Archive failed");
                                    await loadHistory();
                                  } catch (e) { toast(String(e.message || e), "error"); }
                                }}
                                className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"
                              >
                                Archive
                              </button>
                            ) : (
                              <button
                                onClick={async () => {
                                  try {
                                    const rr = await fetch("/api/history/archive", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ plannerEmail, historyId: r.id, archived: false }),
                                    });
                                    const jj = await rr.json();
                                    if (!rr.ok || jj.error) throw new Error(jj.error || "Unarchive failed");
                                    await loadHistory();
                                  } catch (e) { toast(String(e.message || e), "error"); }
                                }}
                                className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"
                              >
                                Unarchive
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* simple pagination */}
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50"
                disabled={page === 1}
              >
                Prev
              </button>
              <div className="text-xs text-gray-600">
                Page {page} of {Math.max(1, Math.ceil(historyRows.length / pageSize))}
              </div>
              <button
                onClick={() => setPage((p) => (p < Math.ceil(historyRows.length / pageSize) ? p + 1 : p))}
                className="rounded-xl border px-3 py-1.5 text-xs hover:bg-gray-50"
                disabled={page >= Math.ceil(historyRows.length / pageSize)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </Section>
    </div>
  );
}

/* ---------- Settings ---------- */
function SettingsView() {
  const keyTz = "p2t.defaultTz";
  const keyAA = "p2t.autoArchive";
  const [tz, setTz] = React.useState(
    localStorage.getItem(keyTz) || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago"
  );
  const [aa, setAa] = React.useState(localStorage.getItem(keyAA) === "1");
  function save() {
    localStorage.setItem(keyTz, tz);
    localStorage.setItem(keyAA, aa ? "1" : "0");
    toast("Settings saved");
  }
  return (
    <div className="space-y-4">
      <Section title="Settings">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium">Default Timezone</div>
            <input
              value={tz}
              onChange={(e) => setTz(e.target.value)}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              placeholder="America/Chicago"
            />
            <div className="mt-1 text-[11px] text-gray-500">Used as the default when creating plans.</div>
          </label>
          <div className="block">
            <div className="mb-1 text-xs font-medium">Auto-archive after assign</div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAa(!aa)}
                className={clsx(
                  "rounded-full px-3 py-1.5 text-xs border",
                  aa ? "bg-cyan-600 text-white border-cyan-600" : "hover:bg-gray-50"
                )}
              >
                {aa ? "On" : "Off"}
              </button>
              <div className="text-xs text-gray-600">Inbox bundles are archived after assignment.</div>
            </div>
          </div>
        </div>
        <div className="pt-3">
          <button onClick={save} className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black">
            Save settings
          </button>
        </div>
      </Section>
    </div>
  );
}

/* ---------- App shell ---------- */
function AppShell() {
  const [session, setSession] = React.useState(null);
  const [ready, setReady] = React.useState(false);
  const [tab, setTab] = React.useState("users");
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = React.useState("");

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) setSession(data?.session || null);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s || null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const plannerEmail = session?.user?.email || "";

  async function logout() { try { await supabase.auth.signOut(); } catch {} }

  if (ready && !session) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div className="mb-6 flex items-center justify-center"><BrandLogo /></div>
        <div className="rounded-2xl border p-4">
          <div className="mb-2 text-lg font-semibold">Sign in required</div>
          <div className="mb-4 text-sm text-gray-600">Please sign in to access your users and plans.</div>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } })}
              className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
            >
              Continue with Google
            </button>
            <a href="/" className="rounded-xl border px-4 py-2 text-center text-sm hover:bg-gray-50">
              Use email sign-in page
            </a>
          </div>
        </div>
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <BrandLogo />
          <div className="h-8 w-24 animate-pulse rounded-xl bg-gray-200" />
        </div>
        <div className="rounded-2xl border p-6">
          <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="mt-4 h-32 w-full animate-pulse rounded-xl bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BrandLogo />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setInviteOpen(true)} className="hidden sm:inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50">Invite User</button>
          <button onClick={() => setTab("settings")} className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"><SettingsIcon size={14} /> Settings</button>
          <button onClick={logout} className="inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"><LogOut size={14} /> Logout</button>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setTab("users")}
          className={clsx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm",
            tab === "users" ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-50")}
        >
          <UsersIcon size={16} /> Users
        </button>
        <button
          onClick={() => setTab("plan")}
          className={clsx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm",
            tab === "plan" ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-50")}
        >
          <Calendar size={16} /> Plan
        </button>
        <button
          onClick={() => setTab("settings")}
          className={clsx("inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm",
            tab === "settings" ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-50")}
        >
          <SettingsIcon size={16} /> Settings
        </button>
      </div>

      {tab === "users" ? (
        <UsersView
          plannerEmail={plannerEmail}
          onManage={(email) => { setSelectedUserEmail(email); setTab("plan"); }}
        />
      ) : tab === "plan" ? (
        <PlanView
          plannerEmail={plannerEmail}
          selectedUserEmail={selectedUserEmail}
          onChangeUserEmail={setSelectedUserEmail}
          onPushed={() => {}}
        />
      ) : (
        <SettingsView />
      )}

      {inviteOpen ? (
        <InviteModal plannerEmail={plannerEmail} onClose={() => setInviteOpen(false)} />
      ) : null}
    </div>
  );
}

export default function Plan2TasksApp() { return <AppShell />; }
