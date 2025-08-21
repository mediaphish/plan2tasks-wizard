import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Calendar, Check, ChevronLeft, ChevronRight, ClipboardCopy, Download, ListChecks, Plus, Sparkles, Wand2 } from "lucide-react";
import { format } from "date-fns";

function cn(...classes) { return classes.filter(Boolean).join(" "); }

const THEME = { brand:"#111827", accent:"#22d3ee", accentStrong:"#06b6d4", soft:"#f3f4f6", text:"#111827", ring:"#22d3ee" };

const STEPS = [
  { key: "basics", title: "Plan basics", icon: Calendar, subtitle: "Name your plan, choose dates & timezone." },
  { key: "blocks", title: "Recurring blocks", icon: ListChecks, subtitle: "Gym time, meetings, and fixed commitments." },
  { key: "tasks", title: "Add tasks", icon: Plus, subtitle: "Quickly capture what needs doing by day." },
  { key: "review", title: "Review & generate", icon: Sparkles, subtitle: "Preview, copy, export, invite or push." },
];

const TIMEZONES = ["America/Chicago","America/New_York","America/Denver","America/Los_Angeles","UTC"];

function uid(){ return Math.random().toString(36).slice(2,10); }

function toICS({ title, startDate, tasks, timezone }) {
  const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss");
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Plan2Tasks//Wizard//EN"];
  tasks.forEach((t) => {
    const dt = new Date(startDate); dt.setDate(dt.getDate() + t.dayOffset);
    let DTSTART = "", DTEND = "";
    if (t.time) {
      const [h,m] = t.time.split(":").map(Number);
      dt.setHours(h, m||0, 0, 0);
      const end = new Date(dt.getTime() + (t.durationMins||60)*60000);
      DTSTART = `DTSTART;TZID=${timezone}:${format(dt,"yyyyMMdd'T'HHmm")}`;
      DTEND   = `DTEND;TZID=${timezone}:${format(end,"yyyyMMdd'T'HHmm")}`;
    } else {
      const end = new Date(dt); end.setDate(end.getDate()+1);
      DTSTART = `DTSTART;VALUE=DATE:${format(dt,"yyyyMMdd")}`;
      DTEND   = `DTEND;VALUE=DATE:${format(end,"yyyyMMdd")}`;
    }
    const u = uid();
    lines.push("BEGIN:VEVENT",`UID:${u}@plan2tasks`,`DTSTAMP:${dtstamp}Z`,`SUMMARY:${escapeICS(t.title)}`,`DESCRIPTION:${escapeICS(t.notes||"")}`,DTSTART,DTEND,"END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  return URL.createObjectURL(blob);
}
function escapeICS(t){return String(t).replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}

function Stepper({ current, onJump }) {
  return (
    <ol className="grid grid-cols-4 gap-2 mb-6">
      {STEPS.map((s, idx) => {
        const active = idx===current, done = idx<current; const Icon=s.icon;
        return (
          <li key={s.key}>
            <button onClick={() => (done?onJump(idx):null)}
              className={cn("w-full flex items-center gap-3 rounded-2xl p-3 border",
                active?"border-transparent bg-cyan-50 ring-2 ring-offset-2":done?"border-gray-200 bg-white":"border-dashed border-gray-300 bg-gray-50",
              )}
              style={active?{boxShadow:`0 0 0 2px ${THEME.ring}`} : undefined}
            >
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-xl",
                done?"bg-emerald-500 text-white":active?"bg-cyan-500 text-white":"bg-gray-200 text-gray-700")}>
                {done?<Check className="h-5 w-5" />:<Icon className="h-5 w-5" />}
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
function Field({label,hint,children,required}){return(<label className="block"><div className="mb-1 text-sm font-medium text-gray-800">{label} {required&&<span className="text-red-500">*</span>}</div>{children}{hint&&<p className="mt-1 text-xs text-gray-500">{hint}</p>}</label>);}
function Chip({children,onRemove}){return(<span className="inline-flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2 py-1 text-xs">{children}{onRemove&&<button className="ml-1 text-gray-400 hover:text-gray-600" onClick={onRemove} aria-label="Remove">×</button>}</span>);}
function SectionCard({title,description,children,footer}){return(<div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="mb-3"><h3 className="text-lg font-semibold text-gray-900">{title}</h3>{description&&<p className="mt-1 text-sm text-gray-500">{description}</p>}</div><div>{children}</div>{footer&&<div className="mt-4 border-t pt-4">{footer}</div>}</div>);}
function ActionBar({canBack,canNext,onBack,onNext,nextLabel="Next"}){return(<div className="mt-6 flex items-center justify-between"><button onClick={onBack} disabled={!canBack} className={cn("inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium",canBack?"border-gray-300 bg-white text-gray-700 hover:bg-gray-50":"border-gray-200 bg-gray-100 text-gray-400")}><ChevronLeft className="h-4 w-4" /> Back</button><button onClick={onNext} disabled={!canNext} className={cn("inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm",canNext?"bg-cyan-600 hover:bg-cyan-700":"bg-gray-300")}>{nextLabel} <ChevronRight className="h-4 w-4" /></button></div>);}

export default function Plan2TasksWizard(){
  const [mode,setMode]=useState("wizard");
  const [step,setStep]=useState(0);
  const [plan,setPlan]=useState({ title:"Weekly Plan", startDate:format(new Date(),"yyyy-MM-dd"), timezone:"America/Chicago" });
  const [blocks,setBlocks]=useState([{ id:uid(), label:"Gym", days:[1,2,3,4,5], time:"12:00", durationMins:60 }]);
  const [tasks,setTasks]=useState([
    { id:uid(), title:"Finish Accidental CEO Ch. 11", dayOffset:0, time:"09:00", durationMins:120, notes:"Narrative pass first." },
    { id:uid(), title:"Polish Starter Kit PDF", dayOffset:2, time:"09:00", durationMins:120, notes:"Visual polish + export." },
    { id:uid(), title:"Weekly Review", dayOffset:4, time:"15:30", durationMins:45, notes:"Wins, shipped, blockers." },
  ]);
  const [taskListName,setTaskListName]=useState(plan.title);
  useEffect(()=>{ setTaskListName(plan.title); },[plan.title]);

  const previewItems=useMemo(()=>{ const out=[...tasks.map(t=>({...t,type:"task"}))];
    blocks.forEach(b=>{ for(let d=0; d<7; d++){ const date=new Date(plan.startDate); date.setDate(date.getDate()+d); const dow=date.getDay(); if(b.days.includes(dow)){ out.push({ id:uid(), type:"block", title:b.label, dayOffset:d, time:b.time, durationMins:b.durationMins, notes:"Recurring block" }); } } });
    return out.sort((a,b)=>a.dayOffset-b.dayOffset || (a.time||"").localeCompare(b.time||""));
  },[blocks,tasks,plan.startDate]);

  const canNext=useMemo(()=>{ if(mode==="single") return true; if(step===0) return Boolean(plan.title&&plan.startDate&&plan.timezone); if(step===1) return true; if(step===2) return tasks.length>0; return true;},[step,plan,tasks,mode]);
  const next=()=>setStep(s=>Math.min(s+1,STEPS.length-1)); const back=()=>setStep(s=>Math.max(s-1,0)); const jump=(i)=>setStep(i);

  const copyPlanBlock=async()=>{ const block=renderPlanBlock({plan,blocks,tasks}); await navigator.clipboard.writeText(block); alert("Plan2Tasks block copied to clipboard."); };
  const downloadICS=()=>{ const url=toICS({title:plan.title,startDate:plan.startDate,tasks:previewItems,timezone:plan.timezone}); const a=document.createElement("a"); a.href=url; a.download=`${plan.title.replace(/\s+/g,"_")}.ics`; a.click(); URL.revokeObjectURL(url); };

  // ========== Planner Tools helpers ==========
  function buildPlanBlock(){ return renderPlanBlock({plan,blocks,tasks}); }

  async function safeJson(resp){
    const text=await resp.text(); let data;
    try{ data=JSON.parse(text); } catch{ throw new Error(text.slice(0,200)); }
    if(!resp.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function createInvite(){
    try{
      const emailEl=document.getElementById("invite-email");
      const out=document.getElementById("invite-result");
      out.textContent="Working...";
      const resp=await fetch("https://plan2tasks-wizard.vercel.app/api/invite",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ plannerEmail:"planner@yourdomain.com", userEmail:(emailEl?.value||"").trim() })
      });
      const data=await safeJson(resp);
      // Big, obvious panel with copy
      out.innerHTML = `
        <div style="padding:12px;border:1px solid #06b6d4;border-radius:12px;background:#ecfeff">
          <div style="font-weight:600;margin-bottom:6px;color:#0e7490">Invite link</div>
          <div style="word-break:break-all;margin-bottom:8px;"><a href="${data.inviteLink}" target="_blank" rel="noreferrer">${data.inviteLink}</a></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="copy-invite" style="padding:6px 10px;border-radius:10px;background:#06b6d4;color:white;border:none;">Copy link</button>
            <a href="${data.inviteLink}" target="_blank" rel="noreferrer" style="padding:6px 10px;border-radius:10px;border:1px solid #0ea5e9;text-decoration:none;">Open link</a>
            <a href="mailto:?subject=Connect to Plan2Tasks&body=${encodeURIComponent(data.inviteLink)}" style="padding:6px 10px;border-radius:10px;border:1px solid #0ea5e9;text-decoration:none;">Email link</a>
          </div>
        </div>`;
      // Auto-copy once
      try{ await navigator.clipboard.writeText(data.inviteLink); }catch{}
      const copyBtn=document.getElementById("copy-invite");
      copyBtn?.addEventListener("click", async()=>{ try{ await navigator.clipboard.writeText(data.inviteLink); copyBtn.textContent="Copied!"; setTimeout(()=>copyBtn.textContent="Copy link",1000);}catch{} });
    }catch(e){
      const out=document.getElementById("invite-result"); if(out) out.textContent="Error: "+e.message;
    }
  }

  async function pushCurrentPlanToUser(){
    try{
      const emailEl=document.getElementById("push-email");
      const listEl=document.getElementById("tasklist-name");
      const out=document.getElementById("push-result");
      if(out) out.textContent="Pushing...";
      const planBlock=buildPlanBlock();
      const resp=await fetch("https://plan2tasks-wizard.vercel.app/api/push",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ userEmail:(emailEl?.value||"").trim(), planBlock, taskListName:(listEl?.value||"").trim() })
      });
      const data=await safeJson(resp);
      if(out) out.textContent=`Success — created ${data.created} tasks.`;
    }catch(e){
      const out=document.getElementById("push-result"); if(out) out.textContent="Error: "+e.message;
    }
  }

  // One-click: if user not connected, create + show invite; else push.
  async function connectOrPush(){
    const emailEl=document.getElementById("push-email");
    const listEl=document.getElementById("tasklist-name");
    const out=document.getElementById("push-result");
    const planBlock=buildPlanBlock();
    try{
      if(out) out.textContent="Checking connection...";
      const resp=await fetch("https://plan2tasks-wizard.vercel.app/api/push",{
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ userEmail:(emailEl?.value||"").trim(), planBlock, taskListName:(listEl?.value||"").trim() })
      });
      const data=await safeJson(resp);
      if(out) out.textContent=`Success — created ${data.created} tasks.`;
    }catch(err){
      // If not connected, generate invite visibly
      if(String(err.message).toLowerCase().includes("user not connected")){
        const inviteOut=document.getElementById("invite-result");
        const resp=await fetch("https://plan2tasks-wizard.vercel.app/api/invite",{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ plannerEmail:"planner@yourdomain.com", userEmail:(emailEl?.value||"").trim() })
        });
        const data=await safeJson(resp);
        // show + copy
        if(inviteOut){
          inviteOut.innerHTML = `
            <div style="padding:12px;border:1px solid #06b6d4;border-radius:12px;background:#ecfeff">
              <div style="font-weight:600;margin-bottom:6px;color:#0e7490">Invite this user to connect</div>
              <div style="word-break:break-all;margin-bottom:8px;"><a href="${data.inviteLink}" target="_blank" rel="noreferrer">${data.inviteLink}</a></div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <button id="copy-invite" style="padding:6px 10px;border-radius:10px;background:#06b6d4;color:white;border:none;">Copy link</button>
                <a href="${data.inviteLink}" target="_blank" rel="noreferrer" style="padding:6px 10px;border-radius:10px;border:1px solid #0ea5e9;text-decoration:none;">Open link</a>
                <a href="mailto:?subject=Connect to Plan2Tasks&body=${encodeURIComponent(data.inviteLink)}" style="padding:6px 10px;border-radius:10px;border:1px solid #0ea5e9;text-decoration:none;">Email link</a>
              </div>
            </div>`;
          try{ await navigator.clipboard.writeText(data.inviteLink); }catch{}
          const copyBtn=document.getElementById("copy-invite");
          copyBtn?.addEventListener("click", async()=>{ try{ await navigator.clipboard.writeText(data.inviteLink); copyBtn.textContent="Copied!"; setTimeout(()=>copyBtn.textContent="Copy link",1000);}catch{} });
        }
        if(out) out.textContent="User not connected yet — invite created (copied). Ask them to click Allow, then press Connect or Push again.";
      } else {
        const out=document.getElementById("push-result"); if(out) out.textContent="Error: "+err.message;
      }
    }
  }
  // ========== end Planner Tools helpers ==========

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{color:THEME.text}}>Plan2Tasks – Wizard</h1>
            <p className="text-sm text-gray-500">Create a weekly plan, export, invite, and push to Google Tasks.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm">
            <Wand2 className="h-4 w-4 text-cyan-600" />
            <span>Wizard mode</span>
            <input type="checkbox" className="peer sr-only" checked={mode==="wizard"} onChange={e=>setMode(e.target.checked?"wizard":"single")} />
            <span className="ml-1 inline-flex h-5 w-9 items-center rounded-full bg-gray-200 p-0.5 peer-checked:bg-cyan-600">
              <span className="h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </span>
          </label>
        </header>

        {mode==="wizard" ? (
          <div>
            <Stepper current={step} onJump={jump} />
            <AnimatePresence mode="wait">
              {step===0 && (
                <motion.div key="s1" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}}>
                  <SectionCard title="Plan basics" description="These drive dates, timezones, and default list name.">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Field label="Plan title" required>
                        <input value={plan.title} onChange={(e)=>setPlan({...plan,title:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" placeholder="e.g., Week of Aug 25" />
                      </Field>
                      <Field label="Start date" hint="Your Monday or Day 1" required>
                        <input type="date" value={plan.startDate} onChange={(e)=>setPlan({...plan,startDate:e.target.value})} className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                      </Field>
                      <Field label="Timezone" required>
                        <select value={plan.timezone} onChange={(e)=>setPlan({...plan,timezone:e.target.value})} className="w
