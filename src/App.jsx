// src/App.jsx
// Plan2Tasks — Issue B fixes only (Plan view)
// - "Plan Name" label
// - User selector top-right; auto-select via ?userEmail=...
// - Date pickers are buttons with calendar; selected date shows on the button
// - Time input is a friendly text field (e.g., "3:30 pm")
// - Recurrence: daily / weekly / monthly + weekly day pills
// - Preview & Deliver is hidden until at least one task exists
// - Keep Export .ics and single/recurring tasks intact
//
// No external libs. No unapproved UX changes. Minimal neutral styling.
// Other tabs (Users, History, Settings) remain link placeholders so we don't remove them.

import { useEffect, useMemo, useRef, useState } from "react";

// ---- Small utilities (no deps) ----
const fmtShort = (d) =>
  d ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "Pick date";

const pad2 = (n) => String(n).padStart(2, "0");
const yyyymmdd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function parseTimeInput(s) {
  if (!s) return { hours: 9, minutes: 0 }; // default 9:00
  const v = s.trim().toLowerCase();
  if (v === "noon") return { hours: 12, minutes: 0 };
  if (v === "midnight") return { hours: 0, minutes: 0 };
  // Accept "3", "3pm", "3 pm", "03:00", "3:30", "3:30pm"
  const re = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i;
  const m = v.match(re);
  if (!m) return { hours: 9, minutes: 0 };
  let h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const mer = m[3];
  if (mer) {
    if (mer.toLowerCase() === "pm" && h < 12) h += 12;
    if (mer.toLowerCase() === "am" && h === 12) h = 0;
  }
  if (!mer && h <= 24 && m[2] == null && h >= 7 && h <= 20) {
    // "7" likely 07:00; "15" could be 15:00; allow as-is
  }
  return { hours: Math.max(0, Math.min(23, h)), minutes: Math.max(0, Math.min(59, min)) };
}

function toICSDateTimeLocal(d, time) {
  const dt = new Date(d);
  const { hours, minutes } = time || { hours: 9, minutes: 0 };
  dt.setHours(hours, minutes, 0, 0);
  const YYYY = dt.getFullYear();
  const MM = pad2(dt.getMonth() + 1);
  const DD = pad2(dt.getDate());
  const HH = pad2(dt.getHours());
  const MIN = pad2(dt.getMinutes());
  const SS = "00";
  return `${YYYY}${MM}${DD}T${HH}${MIN}${SS}`;
}

function downloadFile(filename, text) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function useQueryParams() {
  const [q, setQ] = useState(() => new URLSearchParams(window.location.search));
  useEffect(() => {
    const onPop = () => setQ(new URLSearchParams(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return q;
}

// ---- Tiny Calendar button/popover ----
function CalendarButton({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const [viewMonth, setViewMonth] = useState(() => {
    const d = value || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    const close = (e) => {
      if (!open) return;
      if (btnRef.current && !btnRef.current.contains(e.target)) {
        const pop = document.getElementById("cal-popover");
        if (pop && pop.contains(e.target)) return;
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const days = useMemo(() => {
    const start = new Date(viewMonth);
    const firstDow = (start.getDay() + 7) % 7; // 0=Sun
    const grid = [];
    let cursor = new Date(start);
    cursor.setDate(1 - firstDow);
    for (let i = 0; i < 42; i++) {
      grid.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return grid;
  }, [viewMonth]);

  const selectDate = (d) => {
    onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
    setOpen(false);
  };

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={btnRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn"
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #ccc",
          background: "#fff",
          cursor: "pointer",
          minWidth: 160,
        }}
        title={label || "Pick a date"}
      >
        {fmtShort(value)}
      </button>
      {open && (
        <div
          id="cal-popover"
          role="dialog"
          aria-label="Calendar"
          style={{
            position: "absolute",
            zIndex: 20,
            top: "calc(100% + 6px)",
            right: 0,
            width: 280,
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 12,
            boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            padding: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 18 }}
              aria-label="Previous month"
            >
              ‹
            </button>
            <div style={{ fontWeight: 700 }}>
              {viewMonth.toLocaleString(undefined, { month: "long", year: "numeric" })}
            </div>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              style={{ border: 0, background: "transparent", cursor: "pointer", fontSize: 18 }}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 4,
              fontSize: 12,
              color: "#666",
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d}>{d}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
            {days.map((d, i) => {
              const isOther = d.getMonth() !== viewMonth.getMonth();
              const isSel =
                value &&
                d.getFullYear() === value.getFullYear() &&
                d.getMonth() === value.getMonth() &&
                d.getDate() === value.getDate();
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectDate(d)}
                  style={{
                    padding: "8px 0",
                    borderRadius: 8,
                    border: "1px solid " + (isSel ? "#555" : "#eee"),
                    background: isSel ? "#eef6ff" : "#fff",
                    color: isOther ? "#aaa" : "#222",
                    cursor: "pointer",
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Recurrence controls ----
function Recurrence({ value, onChange }) {
  const { mode, weekly, monthlyDay } = value;
  const setMode = (m) => onChange({ ...value, mode: m });
  const toggleDow = (i) => {
    if (mode !== "weekly") return;
    const set = new Set(weekly);
    if (set.has(i)) set.delete(i);
    else set.add(i);
    onChange({ ...value, weekly: Array.from(set).sort((a, b) => a - b) });
  };
  const setMonthlyDay = (d) => onChange({ ...value, monthlyDay: d });

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          ["once", "One-time"],
          ["daily", "Daily"],
          ["weekly", "Weekly"],
          ["monthly", "Monthly"],
        ].map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              border: "1px solid " + (mode === k ? "#444" : "#ccc"),
              background: mode === k ? "#f1f5ff" : "#fff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "weekly" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
            const picked = weekly.includes(i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => toggleDow(i)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 999,
                  border: "1px solid " + (picked ? "#444" : "#ccc"),
                  background: picked ? "#e8f5e9" : "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
                title={["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i]}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}

      {mode === "monthly" && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontWeight: 600 }}>Day of month:</span>
          <input
            type="number"
            min={1}
            max={31}
            value={monthlyDay}
            onChange={(e) => setMonthlyDay(Math.max(1, Math.min(31, Number(e.target.value || 1))))}
            style={{ width: 80, padding: 8, borderRadius: 8, border: "1px solid #ccc" }}
          />
        </div>
      )}
    </div>
  );
}

// ---- Plan view ----
export default function App() {
  const q = useQueryParams();

  // Planner & selected user
  const defaultPlanner = q.get("plannerEmail") || "bartpaden@gmail.com";
  const [plannerEmail, setPlannerEmail] = useState(defaultPlanner);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(q.get("userEmail") || "");

  // Plan name
  const [planName, setPlanName] = useState("");

  // One task at a time UI; you can add multiple
  const [items, setItems] = useState([]);

  // Composer state for adding a new task
  const [composeTitle, setComposeTitle] = useState("");
  const [composeDate, setComposeDate] = useState(new Date());
  const [composeTime, setComposeTime] = useState("9:00 am");
  const [composeNotes, setComposeNotes] = useState("");
  const [recurrence, setRecurrence] = useState({
    mode: "once", // once | daily | weekly | monthly
    weekly: [],   // array of 0..6 when weekly
    monthlyDay: new Date().getDate(),
  });

  // Fetch users for dropdown (top-right)
  useEffect(() => {
    if (!plannerEmail) return;
    const controller = new AbortController();
    fetch(`/api/users?plannerEmail=${encodeURIComponent(plannerEmail)}&_=${Date.now()}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.users) setUsers(json.users);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [plannerEmail]);

  // Auto-select from URL (?userEmail=...)
  useEffect(() => {
    const urlUser = q.get("userEmail");
    if (urlUser) setSelectedUser(urlUser.toLowerCase());
  }, [q]);

  // --- Build preview lines for each item (human-readable) ---
  const preview = useMemo(() => {
    return items.map((it, idx) => {
      const t = parseTimeInput(it.timeText);
      const when = `${fmtShort(it.date)} @ ${pad2(t.hours % 12 || 12)}:${pad2(t.minutes)} ${t.hours >= 12 ? "PM" : "AM"}`;
      let rec = "";
      if (it.recurrence?.mode === "daily") rec = " • Daily";
      if (it.recurrence?.mode === "weekly") {
        const map = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const picked = (it.recurrence.weekly || []).map((i) => map[i]).join(",");
        rec = ` • Weekly (${picked || "none"})`;
      }
      if (it.recurrence?.mode === "monthly") rec = ` • Monthly (day ${it.recurrence.monthlyDay})`;
      return `${idx + 1}. ${it.title} — ${when}${rec}`;
    });
  }, [items]);

  // --- Add task to list ---
  const addTask = () => {
    if (!composeTitle.trim()) {
      alert("Please enter a task title.");
      return;
    }
    if (!selectedUser) {
      alert("Please choose a user (top-right).");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        title: composeTitle.trim(),
        date: composeDate,
        timeText: composeTime.trim(),
        notes: composeNotes.trim(),
        recurrence: { ...recurrence },
      },
    ]);
    // reset title/notes only (keep date/time convenience)
    setComposeTitle("");
    setComposeNotes("");
  };

  const removeTask = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Build payload for /api/push ---
  function buildPushPayload() {
    const itemsPayload = items.map((it) => {
      const t = parseTimeInput(it.timeText);
      // Basic normalized shape; backend can expand recurrence as needed
      return {
        title: it.title,
        date: yyyymmdd(it.date),
        time: `${pad2(t.hours)}:${pad2(t.minutes)}`,
        notes: it.notes || "",
        recurrence: it.recurrence, // { mode, weekly[], monthlyDay }
      };
    });
    return {
      plannerEmail,
      userEmail: selectedUser,
      listTitle: planName || "Plan",
      items: itemsPayload,
    };
  }

  // --- Export .ics ---
  const exportICS = () => {
    if (items.length === 0) return;

    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Plan2Tasks//EN",
    ];

    items.forEach((it, idx) => {
      const t = parseTimeInput(it.timeText);
      const dtLocal = toICSDateTimeLocal(it.date, t);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${crypto.randomUUID?.() || Date.now() + "-" + idx}@plan2tasks`);
      lines.push(`DTSTAMP:${toICSDateTimeLocal(new Date(), { hours: 0, minutes: 0 })}`);
      lines.push(`SUMMARY:${escapeICS(it.title)}`);
      if (it.notes) lines.push(`DESCRIPTION:${escapeICS(it.notes)}`);
      lines.push(`DTSTART:${dtLocal}`);

      // Simple RRULE mapping
      if (it.recurrence?.mode === "daily") {
        lines.push("RRULE:FREQ=DAILY");
      } else if (it.recurrence?.mode === "weekly" && (it.recurrence.weekly || []).length) {
        const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
        const byday = it.recurrence.weekly.map((i) => map[i]).join(",");
        lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${byday}`);
      } else if (it.recurrence?.mode === "monthly") {
        const day = Math.max(1, Math.min(31, it.recurrence.monthlyDay || 1));
        lines.push(`RRULE:FREQ=MONTHLY;BYMONTHDAY=${day}`);
      }

      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    downloadFile(`${(planName || "plan").replace(/\s+/g, "-").toLowerCase()}.ics`, lines.join("\r\n"));
  };

  const escapeICS = (s) =>
    (s || "")
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/,/g, "\\,")
      .replace(/;/g, "\\;");

  // --- Push to Google Tasks via backend ---
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  const pushToGoogle = async () => {
    if (!plannerEmail || !selectedUser) {
      alert("Planner email and user are required.");
      return;
    }
    if (items.length === 0) {
      alert("Add at least one task.");
      return;
    }
    setPushing(true);
    setPushResult(null);
    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPushPayload()),
      });
      const json = await res.json().catch(() => ({}));
      setPushResult(json);
      if (json?.ok) {
        // Optionally: clear composer; append to History handled server-side per your snapshot
      } else {
        alert(json?.error || "Push failed.");
      }
    } catch (e) {
      alert("Network error while pushing.");
    } finally {
      setPushing(false);
    }
  };

  // ---- Layout (minimal, mobile-first) ----
  return (
    <div style={{ padding: 12, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <TopNav />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22 }}>Plan</h1>

        {/* User selector (top-right) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ fontWeight: 600 }}>User</label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
            style={{ padding: 8, borderRadius: 8, border: "1px solid #ccc", minWidth: 220 }}
          >
            <option value="">Select user…</option>
            {users.map((u) => (
              <option key={u.userEmail} value={u.userEmail}>
                {u.userEmail} {u.status ? `(${u.status})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Planner is hidden config but can be overridden via ?plannerEmail */}
      <input
        type="hidden"
        value={plannerEmail}
        onChange={() => {}}
        aria-hidden="true"
      />

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          display: "grid",
          gap: 14,
        }}
      >
        {/* Plan Name */}
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 700 }}>Plan Name</label>
          <input
            placeholder="e.g., September Reset"
            value={planName}
            onChange={(e) => setPlanName(e.target.value)}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
          />
        </div>

        {/* Task composer */}
        <div
          style={{
            display: "grid",
            gap: 12,
            border: "1px dashed #ddd",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 700 }}>Task Title</label>
            <input
              placeholder='e.g., "Workout" or "Read 20 pages"'
              value={composeTitle}
              onChange={(e) => setComposeTitle(e.target.value)}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              {/* Date button */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontWeight: 700 }}>Date</label>
                <CalendarButton value={composeDate} onChange={setComposeDate} label="Choose date" />
              </div>

              {/* Time input as friendly text */}
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ fontWeight: 700 }}>Time</label>
                <input
                  placeholder='e.g., "3:30 pm"'
                  value={composeTime}
                  onChange={(e) => setComposeTime(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc", minWidth: 140 }}
                />
              </div>
            </div>
          </div>

          {/* Recurrence controls */}
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ fontWeight: 700 }}>Recurrence</label>
            <Recurrence value={recurrence} onChange={setRecurrence} />
          </div>

          {/* Notes */}
          <div style={{ display: "grid", gap: 6 }}>
            <label style={{ fontWeight: 700 }}>Notes (optional)</label>
            <textarea
              value={composeNotes}
              onChange={(e) => setComposeNotes(e.target.value)}
              rows={3}
              placeholder="Any extra details…"
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={addTask}
              style={{
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              + Add Task
            </button>
          </div>
        </div>

        {/* Current items list (editable remove) */}
        {items.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontWeight: 700 }}>Tasks in this Plan</div>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {items.map((it, i) => (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 12px",
                    border: "1px solid #eee",
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.title}</div>
                    <div style={{ fontSize: 13, color: "#555" }}>
                      {preview[i]}
                      {it.notes ? ` • ${it.notes}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => removeTask(i)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      border: "1px solid #eee",
                      background: "#fff",
                      cursor: "pointer",
                    }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Preview & Deliver — hidden until at least one task exists */}
      {items.length > 0 && (
        <section
          style={{
            marginTop: 14,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Preview &amp; Deliver</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={exportICS}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
                title="Export as .ics"
              >
                Export .ics
              </button>
              <button
                type="button"
                onClick={pushToGoogle}
                disabled={pushing}
                style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #0ea5e9",
                  background: pushing ? "#e0f2fe" : "#f0f9ff",
                  color: "#0369a1",
                  cursor: pushing ? "default" : "pointer",
                  fontWeight: 800,
                }}
                title="Push to Google Tasks"
              >
                {pushing ? "Pushing…" : "Push to Google Tasks"}
              </button>
            </div>
          </div>

          <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, background: "#f8fafc", padding: 10, borderRadius: 8 }}>
            {preview.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>

          {pushResult && (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                borderRadius: 10,
                background: pushResult.ok ? "#ecfdf5" : "#fef2f2",
                color: pushResult.ok ? "#065f46" : "#991b1b",
                border: "1px solid " + (pushResult.ok ? "#a7f3d0" : "#fecaca"),
              }}
            >
              <strong>{pushResult.ok ? "Success" : "Error"}:</strong>{" "}
              <span>{pushResult.ok ? "Tasks pushed." : String(pushResult.error || "Unable to push")}</span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// Simple top navigation (placeholders to avoid removing/moving site nav)
function TopNav() {
  const linkStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    textDecoration: "none",
    color: "#111",
    border: "1px solid #eee",
    background: "#fff",
    fontWeight: 600,
  };
  return (
    <nav style={{ display: "flex", gap: 8 }}>
      <a href="/" style={linkStyle}>Users</a>
      <a href="/?tab=plan" style={linkStyle}>Plan</a>
      <a href="/?tab=history" style={linkStyle}>History</a>
      <a href="/?tab=settings" style={linkStyle}>Settings</a>
    </nav>
  );
}
