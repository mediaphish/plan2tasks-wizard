import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  Users, Calendar, Settings as SettingsIcon, Inbox as InboxIcon,
  Search, Trash2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Plus, RotateCcw, Info, Mail, Tag
} from "lucide-react";
import { format } from "date-fns";


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
  const a0=new Date(a
