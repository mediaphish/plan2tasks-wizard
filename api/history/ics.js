// api/history/ics.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function escapeICS(s=""){ return String(s).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n"); }
function fmtYMD(d){ const y=d.getUTCFullYear(); const m=String(d.getUTCMonth()+1).padStart(2,"0"); const dd=String(d.getUTCDate()).padStart(2,"0"); return `${y}${m}${dd}`; }
function addDays(d, n){ const x=new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate()+n); return x; }

export default async function handler(req, res) {
  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const planId = url.searchParams.get("planId") || "";
    if (!planId) return res.status(400).send("Missing planId");

    const { data: p, error: pErr } = await supabaseAdmin
      .from("plans")
      .select("id, title, start_date, timezone")
      .eq("id", planId).single();
    if (pErr) throw pErr;

    const { data: items, error: iErr } = await supabaseAdmin
      .from("plan_tasks")
      .select("title, day_offset, time, duration_mins, notes")
      .eq("plan_id", planId)
      .order("day_offset", { ascending: true });
    if (iErr) throw iErr;

    const start = new Date(`${p.start_date}T00:00:00Z`);
    const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//EN"];
    for (const t of (items||[])) {
      const dt = addDays(start, t.day_offset || 0);
      const ymd = fmtYMD(dt);
      let dtstart, dtend;
      if (t.time) {
        const [hh,mm] = t.time.split(":").map(Number);
        const st = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate(), hh||0, mm||0));
        const en = new Date(st.getTime() + (t.duration_mins || 60)*60000);
        const fmt = (X)=> `${X.getUTCFullYear()}${String(X.getUTCMonth()+1).padStart(2,"0")}${String(X.getUTCDate()).padStart(2,"0")}T${String(X.getUTCHours()).padStart(2,"0")}${String(X.getUTCMinutes()).padStart(2,"0")}00Z`;
        dtstart = `DTSTART:${fmt(st)}`; dtend = `DTEND:${fmt(en)}`;
      } else {
        dtstart = `DTSTART;VALUE=DATE:${ymd}`;
        const next = addDays(dt, 1); dtend = `DTEND;VALUE=DATE:${fmtYMD(next)}`;
      }
      const id = `${p.id}-${Math.random().toString(36).slice(2,10)}@plan2tasks`;
      lines.push("BEGIN:VEVENT",
        `UID:${id}`,
        `SUMMARY:${escapeICS(t.title)}`,
        dtstart, dtend,
        `DESCRIPTION:${escapeICS(t.notes || "")}`,
        "END:VEVENT");
    }
    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${p.title.replace(/[^\w\-]+/g,"_").slice(0,40)}.ics"`);
    res.status(200).send(lines.join("\r\n"));
  } catch (e) {
    console.error("GET /api/history/ics", e);
    res.status(500).send("Server error");
  }
}
