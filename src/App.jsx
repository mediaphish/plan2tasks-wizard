import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  addDays,
  format,
  parseISO,
  isValid as isValidDate,
} from "date-fns";
import { supabase } from "../lib/supabase.js"; // <-- your existing browser client
import { Calendar, Users as UsersIcon, Clock, History as HistoryIcon, Send } from "lucide-react";

/* ----------------------- UI helpers ----------------------- */

function clsx(...xs) {
  return xs.filter(Boolean).join(" ");
}

function toast(msg, type = "ok") {
  // super-lightweight toast: replace with your own if you have one
  alert((type === "error" ? "Error: " : "") + msg);
}

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
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm hover:bg-gray-50">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ----------------------- Invite Modal ----------------------- */

function InviteModal({ plannerEmail, userEmail: presetEmail, onClose }) {
  const [email, setEmail] = React.useState(presetEmail || "");
  const [state, setState] = React.useState({
    loading: false,
    link: "",
    emailed: false,
    canSend: false,
    sending: false,
    error: "",
    fromLabel: "",
  });

  React.useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/invite/cansend`);
        const j = await r.json();
        setState((s) => ({ ...s, canSend: !!j.emailEnabled, fromLabel: j.from || "" }));
      } catch {
        // ignore
      }
    })();
  }, []);

  async function createLink() {
    setState((s) => ({ ...s, loading: true, error: "", link: "", emailed: false }));
    try {
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error("Enter a valid email address.");
      const qs = new URLSearchParams({ plannerEmail, userEmail: email });
      const r = await fetch(`/api/invite/preview?` + qs.toString());
      const j = await r.json();
      if (!r.ok || j.error || !j.inviteUrl) throw new Error(j.error || "Failed to prepare invite");
      setState((s) => ({ ...s, loading: false, link: j.inviteUrl }));
      toast("Invite link created");
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: String(e.message || e) }));
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.link);
      toast("Invite link copied");
    } catch {
      toast("Could not copy link", "error");
    }
  }

  async function send() {
    if (!state.canSend) return;
    setState((s) => ({ ...s, sending: true }));
    try {
      const r = await fetch(`/api/invite/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerEmail, userEmail: email }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Send failed");
      setState((s) => ({ ...s, sending: false, emailed: true }));
      toast("Invite email sent");
    } catch (e) {
      setState((s) => ({ ...s, sending: false }));
      toast(String(e.message || e), "error");
    }
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
            placeholder="name@example.com"
            className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="flex items-center gap-2">
          <button
            onClick={createLink}
            className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-700 whitespace-nowrap"
          >
            Create Invite Link
          </button>
          {state.link ? (
            <button onClick={copy} className="rounded-xl border px-3 py-2 text-xs hover:bg-gray-50 whitespace-nowrap">
              Copy Link
            </button>
          ) : null}
        </div>

        {state.loading ? <div className="text-sm text-gray-600">Preparing invite…</div> : null}
        {state.error ? <div className="text-sm text-red-600">Error: {state.error}</div> : null}

        {state.link ? (
          <>
            <div className="text-xs text-gray-600">Invite link</div>
            <div className="flex items-center gap-2">
              <input readOnly value={state.link} className="flex-1 rounded-xl border px-3 py-2 text-xs" />
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs hover:bg-gray-50 whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </>
        ) : null}

        <div className="border-t pt-2">
          {state.canSend ? (
            <div className="flex items-center justify-between">
              <div className="text-[11px] text-gray-500">
                From: <b>{state.fromLabel}</b>
              </div>
              <button
                onClick={send}
                disabled={!state.link || state.sending}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:opacity-50 whitespace-nowrap"
              >
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

/* ----------------------- Date & time helpers ----------------------- */

function parseUserTimeTo24h(input) {
  // Accept "1", "1pm", "1:30", "1:30pm", "01:30 AM", "1330" etc. Returns "HH:mm" or null.
  if (!input) return null;
  let s = String(input).trim().toLowerCase();
  s = s.replace(/\s+/g, "");
  const ampm = s.endsWith("am") ? "am" : s.endsWith("pm") ? "pm" : "";
  if (ampm) s = s.slice(0, -2);

  // "1330"
  if (/^\d{3,4}$/.test(s)) {
    const hh = s.length === 3 ? "0" + s[0] : s.slice(0, 2);
    const mm = s.slice(-2);
    let H = parseInt(hh, 10);
    const M = parseInt(mm, 10);
    if (isNaN(H) || isNaN(M) || H > 23 || M > 59) return null;
    return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
  }

  // "1" or "1:30"
  const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  let H = parseInt(m[1], 10);
  let M = m[2] ? parseInt(m[2], 10) : 0;
  if (isNaN(H) || isNaN(M) || M > 59) return null;

  if (ampm === "am") {
    if (H === 12) H = 0;
  } else if (ampm === "pm") {
    if (H !== 12) H = H + 12;
  }

  if (H > 23) return null;
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
}

function DateInput({ value, onChange, buttonLabel }) {
  const [open, setOpen] = React.useState(false);
  const d = value ? (typeof value === "string" ? parseISO(value) : value) : null;
  const label = d && isValidDate(d) ? format(d, "EEE, MMM d, yyyy") : "Choose date";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
      >
        {buttonLabel || label}
      </button>
      {open ? (
        <div className="absolute z-10 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <CalendarGrid
            initialDate={d || new Date()}
            onPick={(picked) => {
              setOpen(false);
              onChange(picked);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function CalendarGrid({ initialDate, onPick }) {
  // Minimal monthly grid with prev/next
  const [base, setBase] = React.useState(new Date(initialDate));
  const monthLabel = format(base, "MMMM yyyy");
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const firstDay = start.getDay(); // 0..6
  const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(base.getFullYear(), base.getMonth(), d));

  return (
    <div className="text-sm">
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          className="rounded-lg px-2 py-1 hover:bg-gray-50"
          onClick={() => setBase((b) => new Date(b.getFullYear(), b.getMonth() - 1, 1))}
        >
          ‹
        </button>
        <div className="font-semibold">{monthLabel}</div>
        <button
          className="rounded-lg px-2 py-1 hover:bg-gray-50"
          onClick={() => setBase((b) => new Date(b.getFullYear(), b.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] text-gray-500">
            {w}
          </div>
        ))}
        {cells.map((c, idx) =>
          c ? (
            <button
              key={idx}
              onClick={() => onPick(c)}
              className="rounded-lg px-0.5 py-1.5 text-center hover:bg-gray-50"
            >
              {c.getDate()}
            </button>
          ) : (
            <div key={idx} />
          )
        )}
      </div>
    </div>
  );
}

/* ----------------------- Users View ----------------------- */

function UsersView({ plannerEmail, onManage }) {
  const [users, setUsers] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [inviteUser, setInviteUser] = React.useState("");

  React.useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerEmail]);

  async function loadUsers() {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ plannerEmail });
      let r = await fetch(`/api/users?` + qs.toString());
      if (r.status === 404) r = await fetch(`/api/users/list?` + qs.toString());
      const j = await r.json().catch(() => ({}));
      const arr = Array.isArray(j) ? j : j.users || [];
      setUsers(arr);
    } catch {
      toast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }

  const filtered = users.filter((u) => {
    if (!q) return true;
    const hay = `${u.email || ""} ${u.name || ""} ${u.group || ""} ${u.status || ""}`.toLowerCase();
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
            placeholder="Search users (name, email, group, status)"
            className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-64"
          />
          <button
            onClick={() => setInviteUser("__new__")}
            className="rounded-xl bg-cyan-600 px-3 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-cyan-700 whitespace-nowrap"
            title="Invite a new user"
          >
            Invite User
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-gray-600">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Groups</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No users yet.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.email} className="border-t">
                  <td className="px-3 py-2">{u.name || "—"}</td>
                  <td className="px-3 py-2">{u.email}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(u.groups) ? u.groups.join(", ") : u.group || "—"}
                  </td>
                  <td className="px-3 py-2">
                    {u.status === "connected" ? (
                      <span className="rounded-full bg-green-50 px-2 py-1 text-[11px] font-medium text-green-700 border border-green-200">
                        Connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-yellow-50 px-2 py-1 text-[11px] font-medium text-yellow-800 border border-yellow-200">
                        Not connected
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => onManage(u.email)}
                        className="rounded-xl bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
                        title="Go to Manage User"
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

      {inviteUser ? (
        <InviteModal
          plannerEmail={plannerEmail}
          userEmail={inviteUser === "__new__" ? "" : inviteUser}
          onClose={() => setInviteUser("")}
        />
      ) : null}
    </div>
  );
}

/* ----------------------- History View ----------------------- */

function HistoryView({ plannerEmail, currentUserEmail, onPrefill }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plannerEmail, currentUserEmail]);

  async function load() {
    setLoading(true);
    try {
      const body = {
        plannerEmail,
        userEmail: currentUserEmail || undefined,
        status: "active",
      };
      const r = await fetch(`/api/history/list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      setRows(Array.isArray(j.items) ? j.items : []);
    } catch {
      toast("Failed to load history", "error");
    } finally {
      setLoading(false);
    }
  }

  async function archive(id, toArchived = true) {
    try {
      const r = await fetch(`/api/history/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerEmail, historyId: id, archived: toArchived }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Archive failed");
      await load();
      toast(toArchived ? "Archived" : "Unarchived");
    } catch (e) {
      toast(String(e.message || e), "error");
    }
  }

  async function restore(id) {
    try {
      const r = await fetch(`/api/history/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plannerEmail, historyId: id }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || "Restore failed");
      // j.planBlock -> prefill
      onPrefill?.(j.planBlock);
      toast("Restored into Plan");
    } catch (e) {
      toast(String(e.message || e), "error");
    }
  }

  const filtered = rows.filter((r) => {
    if (!q) return true;
    const hay = `${r.title || ""} ${r.mode || ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <Section
      title="History"
      right={
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search history"
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
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
            {loading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Nothing here yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.title}</td>
                  <td className="px-3 py-2">{r.start_date}</td>
                  <td className="px-3 py-2">{r.items_count}</td>
                  <td className="px-3 py-2">{r.mode}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => restore(r.id)}
                        className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => archive(r.id, true)}
                        className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"
                      >
                        Archive
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/* ----------------------- Plan View ----------------------- */

function DayPills({ value, onChange }) {
  const days = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((d, idx) => {
        const on = value.includes(idx);
        return (
          <button
            type="button"
            key={d}
            onClick={() => {
              const set = new Set(value);
              if (on) set.delete(idx);
              else set.add(idx);
              onChange(Array.from(set).sort((a, b) => a - b));
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

function PlanView({ plannerEmail, selectedUserEmail, onPushed, onPrefillExternal }) {
  const [listTitle, setListTitle] = React.useState("");
  const [planDate, setPlanDate] = React.useState(null); // Date object
  const [timezone, setTimezone] = React.useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");

  const [items, setItems] = React.useState([]); // {title, notes, date, time, recur?: {type, weeklyDays[], count?, until?}}
  const [newTitle, setNewTitle] = React.useState("");
  const [newNotes, setNewNotes] = React.useState("");
  const [newDate, setNewDate] = React.useState(null);
  const [newTime, setNewTime] = React.useState("");
  const [recurring, setRecurring] = React.useState({ type: "none", weeklyDays: [], monthlyDay: null, end: "none", count: 5, until: null });

  // Apply prefill from History restore
  React.useEffect(() => {
    if (!onPrefillExternal) return;
  }, [onPrefillExternal]);

  function applyPrefill(block) {
    // block: { title, start_date, timezone, items: [{title, notes, due}] }
    if (!block) return;
    setListTitle(block.title || "");
    setPlanDate(block.start_date ? parseISO(block.start_date) : null);
    setTimezone(block.timezone || timezone);
    const mapped = (block.items || []).map((it) => ({
      title: it.title || "",
      notes: it.notes || "",
      date: it.due ? parseISO(it.due) : null,
      time: it.due ? format(parseISO(it.due), "HH:mm") : "",
    }));
    setItems(mapped);
  }

  // expose for parent
  React.useEffect(() => {
    onPrefillExternal && onPrefillExternal(applyPrefill);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addItem() {
    if (!newTitle.trim()) {
      toast("Add a task title", "error");
      return;
    }
    // generate one or many items depending on recurrence
    const batch = [];
    const baseDate = newDate || planDate || new Date();
    const time24 = parseUserTimeTo24h(newTime); // may be null
    function combine(d) {
      if (!d) return null;
      if (!time24) return d;
      const [hh, mm] = time24.split(":").map((n) => parseInt(n, 10));
      const dt = new Date(d);
      dt.setHours(hh, mm, 0, 0);
      return dt;
    }

    if (recurring.type === "none") {
      batch.push({ title: newTitle.trim(), notes: newNotes.trim(), date: combine(baseDate), time: time24 || "" });
    } else if (recurring.type === "daily") {
      const n = recurring.end === "count" ? Math.max(1, Number(recurring.count || 1)) : 10;
      let cur = new Date(baseDate);
      for (let i = 0; i < n; i++) {
        batch.push({ title: newTitle.trim(), notes: newNotes.trim(), date: combine(cur), time: time24 || "" });
        cur = addDays(cur, 1);
      }
    } else if (recurring.type === "weekly") {
      if (!recurring.weeklyDays.length) {
        toast("Pick days of week", "error");
        return;
      }
      const n = recurring.end === "count" ? Math.max(1, Number(recurring.count || 1)) : 10;
      let cur = new Date(baseDate);
      let added = 0;
      while (added < n) {
        if (recurring.weeklyDays.includes(cur.getDay())) {
          batch.push({ title: newTitle.trim(), notes: newNotes.trim(), date: combine(cur), time: time24 || "" });
          added++;
        }
        cur = addDays(cur, 1);
      }
    } else if (recurring.type === "monthly") {
      const n = recurring.end === "count" ? Math.max(1, Number(recurring.count || 1)) : 6;
      const start = new Date(baseDate);
      const day = recurring.monthlyDay || start.getDate();
      for (let i = 0; i < n; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, Math.min(day, 28)); // safe-ish
        batch.push({ title: newTitle.trim(), notes: newNotes.trim(), date: combine(d), time: time24 || "" });
      }
    }

    setItems((prev) => [...prev, ...batch]);
    setNewTitle("");
    setNewNotes("");
    setNewTime("");
    setRecurring({ type: "none", weeklyDays: [], monthlyDay: null, end: "none", count: 5, until: null });
  }

  function removeItem(idx) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function pushToGoogle() {
    if (!selectedUserEmail) {
      toast("Select a user first", "error");
      return;
    }
    if (!listTitle.trim()) {
      toast("List title is required", "error");
      return;
    }
    if (items.length === 0) {
      toast("No tasks to push", "error");
      return;
    }
    const startISO = planDate ? format(planDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

    const planBlock = {
      title: listTitle.trim(),
      start_date: startISO,
      timezone,
      items: items.map((it) => {
        const due = it.date ? format(it.date, "yyyy-MM-dd") + (it.time ? `T${it.time}:00.000Z` : "") : null;
        return { title: it.title, notes: it.notes, due };
      }),
    };

    try {
      const r = await fetch(`/api/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plannerEmail,
          userEmail: selectedUserEmail,
          planBlock,
          mode: "append",
        }),
      });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || "Push failed");
      toast("Pushed to Google Tasks");
      onPushed?.();
      // clear the composer
      setItems([]);
    } catch (e) {
      toast(String(e.message || e), "error");
    }
  }

  const hasPreview = items.length > 0;

  return (
    <div className="space-y-4">
      <Section
        title="Plan"
        right={
          <div className="flex items-center gap-2 text-xs text-gray-600">
            <span className="hidden sm:inline">Timezone</span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-48 rounded-xl border border-gray-300 px-2 py-1 text-xs"
            />
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium">Task list title</div>
            <input
              value={listTitle}
              onChange={(e) => setListTitle(e.target.value)}
              placeholder="e.g., Onboarding – Week 1"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="block">
            <div className="mb-1 text-xs font-medium">Choose Plan Start Date</div>
            <DateInput
              value={planDate}
              onChange={(d) => setPlanDate(d)}
              buttonLabel={planDate ? format(planDate, "EEE, MMM d, yyyy") : "Pick date"}
            />
          </div>
        </div>

        {/* Composer */}
        <div className="mt-2 grid gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 sm:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-xs font-medium">Task title</div>
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-medium">Notes (optional)</div>
            <input
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Any extra details"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="block">
            <div className="mb-1 text-xs font-medium">Task date</div>
            <DateInput
              value={newDate}
              onChange={(d) => setNewDate(d)}
              buttonLabel={newDate ? format(newDate, "EEE, MMM d, yyyy") : "Pick date"}
            />
          </div>

          <label className="block">
            <div className="mb-1 text-xs font-medium">Time (optional)</div>
            <input
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              placeholder="e.g., 1:30pm"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="mt-1 text-[11px] text-gray-500">Formats: “1pm”, “1:30pm”, “13:30”, “1330”</div>
          </label>

          {/* Recurrence */}
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-medium">Recurrence</div>
            <div className="flex flex-wrap gap-2">
              {["none", "daily", "weekly", "monthly"].map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    setRecurring((r) => ({ ...r, type: t }))
                  }
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
                  type="number"
                  min={1}
                  max={31}
                  value={recurring.monthlyDay || ""}
                  onChange={(e) =>
                    setRecurring((r) => ({ ...r, monthlyDay: Number(e.target.value || 1) }))
                  }
                  className="w-24 rounded-xl border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            ) : null}

            {recurring.type !== "none" ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="rec-end"
                    checked={recurring.end === "none"}
                    onChange={() => setRecurring((r) => ({ ...r, end: "none" }))}
                  />
                  <span>Indefinite (limited preview)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="rec-end"
                    checked={recurring.end === "count"}
                    onChange={() => setRecurring((r) => ({ ...r, end: "count" }))}
                  />
                  <span>
                    Generate <input
                      type="number"
                      min={1}
                      value={recurring.count}
                      onChange={(e) => setRecurring((r) => ({ ...r, count: Number(e.target.value || 1) }))}
                      className="mx-1 w-16 rounded-lg border px-2 py-1 text-sm"
                    /> items
                  </span>
                </label>
              </div>
            ) : null}
          </div>

          <div className="col-span-full">
            <button
              onClick={addItem}
              className="rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              Add task
            </button>
          </div>
        </div>
      </Section>

      {/* Preview & Deliver (hidden until there is at least one item) */}
      {hasPreview ? (
        <Section
          title="Preview & Deliver"
          right={
            <button
              onClick={pushToGoogle}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-700"
              title="Push to Google Tasks"
            >
              <Send size={16} />
              Push to Google Tasks
            </button>
          }
        >
          <div className="space-y-2">
            <div className="text-sm text-gray-600">
              Delivering to: <b>{selectedUserEmail || "—"}</b>
            </div>
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
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">{it.title}</td>
                      <td className="px-3 py-2">{it.date ? format(it.date, "yyyy-MM-dd") : "—"}</td>
                      <td className="px-3 py-2">{it.time || "—"}</td>
                      <td className="px-3 py-2">{it.notes || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => removeItem(idx)}
                          className="rounded-xl border px-2.5 py-1.5 text-xs hover:bg-gray-50"
                        >
                          Delete
                        </button>
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
  const [tab, setTab] = React.useState("users"); // default to Users
  const [selectedUserEmail, setSelectedUserEmail] = React.useState("");

  // history -> plan prefill function
  const planPrefillRef = React.useRef(null);

  React.useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const email = data?.user?.email || "";
        setSessionEmail(email);
      } catch {
        // if not logged in via supabase, leave blank (your app likely shows auth elsewhere)
      }
    })();
  }, []);

  function onManageUser(email) {
    setSelectedUserEmail(email);
    setTab("plan");
  }

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/brand/logo-dark.svg" alt="Plan2Tasks" className="h-6" />
          <div className="hidden text-sm text-gray-600 sm:block">Assign Google Tasks like a pro</div>
        </div>
        <div className="text-xs text-gray-600">{sessionEmail ? `Signed in: ${sessionEmail}` : "Not signed in"}</div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => setTab("users")}
          className={clsx(
            "inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm",
            tab === "users" ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-50"
          )}
        >
          <UsersIcon size={16} />
          Users
        </button>
        <button
          onClick={() => setTab("plan")}
          className={clsx(
            "inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm",
            tab === "plan" ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-50"
          )}
        >
          <Calendar size={16} />
          Plan
        </button>
        <button
          onClick={() => setTab("history")}
          className={clsx(
            "inline-flex items-center gap-1 rounded-xl border px-3 py-1.5 text-sm",
            tab === "history" ? "bg-gray-900 text-white border-gray-900" : "hover:bg-gray-50"
          )}
        >
          <HistoryIcon size={16} />
          History
        </button>
      </div>

      {/* Views */}
      {tab === "users" ? (
        <UsersView plannerEmail={sessionEmail} onManage={onManageUser} />
      ) : tab === "plan" ? (
        <PlanView
          plannerEmail={sessionEmail}
          selectedUserEmail={selectedUserEmail}
          onPushed={() => setTab("history")}
          onPrefillExternal={(fn) => (planPrefillRef.current = fn)}
        />
      ) : (
        <HistoryView
          plannerEmail={sessionEmail}
          currentUserEmail={selectedUserEmail}
          onPrefill={(block) => planPrefillRef.current && planPrefillRef.current(block)}
        />
      )}
    </div>
  );
}

/* ----------------------- Mount ----------------------- */

export default function Plan2TasksApp() {
  return <AppShell />;
}
