import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Trash2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, RotateCcw, Info, Mail, Tag
} from "lucide-react";
import { format } from "date-fns";

// --- NEW: central helper to resolve plannerEmail ---
function getPlannerEmail() {
  // 1) URL param
  const usp = typeof window!=="undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlPE = usp.get("plannerEmail");
  if (urlPE) {
    localStorage.setItem("plannerEmail", urlPE);
    return urlPE;
  }
  // 2) localStorage
  const stored = typeof window!=="undefined" ? localStorage.getItem("plannerEmail") : "";
  if (stored) return stored;
  // 3) fallback (demo / dev only)
  return "demo@plan2tasks.com";
}

const APP_VERSION = "2025-09-02 · C4";
/* ───────────── utils (LOCAL DATE ONLY) ───────────── */
function cn(...a){ return a.filter(Boolean).join(" "); }
function uid(){ return Math.random().toString(36).slice(2,10); }
// (… keep all your utils / components exactly as before …)

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

  // 🔑 FIX: use helper instead of hard-coded email
  const plannerEmail = getPlannerEmail();

  const [view,setView]=useState(validViews.has(urlView) ? urlView : "users");
  // (… rest of your MainApp unchanged …)
}
