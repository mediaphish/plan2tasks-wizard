import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Trash2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, RotateCcw, Info, Mail, Tag
} from "lucide-react";
import { format } from "date-fns";

// ───────────── NEW: central helper for plannerEmail ─────────────
function getPlannerEmail() {
  const usp = typeof window!=="undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const urlPE = usp.get("plannerEmail");
  if (urlPE) {
    try { localStorage.setItem("plannerEmail", urlPE); } catch {}
    return urlPE;
  }
  try {
    const stored = localStorage.getItem("plannerEmail");
    if (stored) return stored;
  } catch {}
  return "demo@plan2tasks.com"; // fallback
}

const APP_VERSION = "2025-09-02 · C4";
/* ───────────── utils (LOCAL DATE ONLY) ───────────── */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function parseYMDLocal(s){
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  return new Date(y, mo-1, d);
}
function fmtYMDLocal(d){
  const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const dd=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${dd}`;
}
function addDaysLocal(base, days){
  return new Date(base.getFullYear(), base.getMonth(), base.getDate()+days);
}
function daysBetweenLocal(a,b){
  const a0=new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const b0=new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round((b0 - a0)/86400000);
}
function addMonthsLocal(date, months){
  const y=date.getFullYear(), m=date.getMonth(), d=date.getDate();
  const nmo=m+months; const ny=y+Math.floor(nmo/12); const nm=((nmo%12)+12)%12;
  const last=new Date(ny, nm+1, 0).getDate();
  return new Date(ny, nm, Math.min(d,last));
}
function lastDayOfMonthLocal(y,m0){ return new Date(y, m0+1, 0).getDate(); }
function firstWeekdayOfMonthLocal(y,m0,weekday){
  const first=new Date(y,m0,1);
  const shift=(7+weekday-first.getDay())%7;
  return new Date(y,m0,1+shift);
}
function nthWeekdayOfMonthLocal(y,m0,weekday,nth){
  const first=firstWeekdayOfMonthLocal(y,m0,weekday);
  const c=new Date(y,m0, first.getDate()+7*(nth-1));
  return c.getMonth()===m0?c:null;
}
function lastWeekdayOfMonthLocal(y,m0,weekday){
  const lastD=lastDayOfMonthLocal(y,m0);
  const last=new Date(y,m0,lastD);
  const shift=(7+last.getDay()-weekday)%7;
  return new Date(y,m0,lastD-shift);
}

/* display helper */
function to12hDisplay(hhmm){
  if (!hhmm) return "";
  const [h,m] = hhmm.split(":").map(Number);
  const ampm = h>=12 ? "pm" : "am";
  const h12 = h%12 || 12;
  return `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
}

/* Time dropdown (15-min steps) */
const TIME_OPTIONS = (() => {
  const out = [{ value: "", label: "— none —" }];
  for (let h=0; h<24; h++){
    for (let m=0; m<60; m+=15){
      const v = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      const h12 = (h%12) || 12;
      const ampm = h>=12 ? "pm" : "am";
      const label = `${h12}:${String(m).padStart(2,"0")} ${ampm}`;
      out.push({ value: v, label });
    }
  }
  return out;
})();

function TimeSelect({ value, onChange }){
  return (
    <select
      value={value || ""}
      onChange={(e)=>onChange(e.target.value)}
      className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm h-10"
    >
      {TIME_OPTIONS.map(opt=>(
        <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}

/* ───────── Error boundary ───────── */
class ErrorBoundary extends React.Component{
  constructor(p){ super(p); this.state={error:null}; }
  static getDerivedStateFromError(e){ return {error:e}; }
  componentDidCatch(e, info){ console.error("UI crash:", e, info); }
  render(){
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-red-50 p-4 sm:p-6">
          <div className="mx-auto max-w-3xl rounded-xl border border-red-200 bg-white p-4">
            <div className="text-red-700 font-bold mb-2">Something went wrong in the UI</div>
            <pre className="bg-red-100 p-3 text-xs text-red-900 overflow-auto rounded">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ───────── App shell ───────── */
export default function App(){
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp(){
  const usp = typeof window!=="undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlView = (usp.get("view")||"").toLowerCase();
  const validViews = new Set(["users","plan","settings","inbox"]);

  // 🔑 FIX: safe non-hardcoded planner email
  const plannerEmail = getPlannerEmail();

  const [view,setView]=useState(validViews.has(urlView) ? urlView : "users");
  const [selectedUserEmail,setSelectedUserEmail]=useState("");
  const [prefs,setPrefs]=useState({});
  const [inboxOpen,setInboxOpen]=useState(false);
  const [inboxBadge,setInboxBadge]=useState(0);
  const [toasts,setToasts]=useState([]);

  // (… ALL THE REST of your code from your pasted file remains unchanged …)
  // UsersView, PlanView, InboxViewIntegrated, SettingsView, HistoryPanel, etc.
  // Nothing else modified.
}
