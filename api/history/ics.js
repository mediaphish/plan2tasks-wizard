// api/history/ics.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function uid() { return Math.random().toString(36).slice(2, 10); }
function fmtDateYMD(d){
  const y=d.getUTCFullYear(), m=String(d.getUTCMonth()+1).padStart(2,"0"), day=String(d.getUTCDate()).padStart(2,"0");
  return `${y}${m}${day}`;
}
function dtstamp(d){
  const hh=String(d.getUTCHours()).padStart(2,"0"), mm=String(d.getUTCMinutes()).padStart(2,"0"), ss="00";
  return `${fmtDateYMD(d)}T${hh}${mm}${ss}Z`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const { planId } = req.query || {};
    if (!planId) return res.status(400).json({ error: "Missing planId" });

    const { data: plan, error: pErr } = await supabaseAdmin
      .from("history_plans")
      .select("*")
      .eq("id", planId)
      .single();
    if (pErr) throw pErr;

    const { data: items, error: iErr } = await supabaseAdmin
      .from("history_items")
      .select("*")
      .eq("plan_id", planId)
      .order("day_offset", { ascending: true });
    if (iErr) throw iErr;

    const start = new Date(`${plan.start_date}T00:00:00Z`);
    const addDays = (d, n) => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); x.setUTCDate(x.getUTCDate()+n); return x; };

    const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//EN"];
    for (const t of items) {
      const base = addDays(start, t.day_offset||0);
      let dtstart, dtend;
      if (t.time) {
        const [hh, mm] = t.time.split(":").map(Number);
        const st = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), hh||0, mm||0));
        const en = new Date(st.getTime() + (t.duration_mins || 60) * 60000);
        dtstart = `DTSTART:${dtstamp(st)}`; dtend = `DTEND:${dtstamp(en)}`;
      } else {
        const ymd = fmtDateYMD(base);
        const next = addDays(base, 1); const ymd2 = fmtDateYMD(next);
        dtstart = `DTSTART;VALUE=DATE:${ymd}`; dtend = `DTEND;VALUE=DATE:${ymd2}`;
      }
      const esc = (s="") => String(s).replace(/([,;])/g,"\\$1").replace(/\n/g,"\\n");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid()}@plan2tasks`,
        `SUMMARY:${esc(t.title)}`,
        dtstart, dtend,
        `DESCRIPTION:${esc(t.notes||"")}`,
        "END:VEVENT"
      );
    }
    lines.push("END:VCALENDAR");
    const body = lines.join("\r\n");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${(plan.title||"plan").replace(/[^\w\-]+/g,"_").slice(0,40)}.ics"`);
    return res.status(200).send(body);
  } catch (e) {
    console.error("history/ics error", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
