/* src/App.jsx — Plan2Tasks integrated app (React, Vite)
   - No UI/layout changes beyond inline text links for Assigned | Archived
   - Removes hard-coded planner: reads from ?plannerEmail= or localStorage ('p2t_plannerEmail')
   - Auto-refreshes Inbox when returning from review.html and on back/forward/tab focus
   - Stack: plain React/JS; no TS, no Next.js, no iframes
*/

import React, { useEffect, useMemo, useState } from "react";

function getQP(name, urlStr = window.location.href) {
  const u = new URL(urlStr);
  return u.searchParams.get(name);
}
function setQP(name, value) {
  const u = new URL(window.location.href);
  if (value == null) u.searchParams.delete(name);
  else u.searchParams.set(name, value);
  window.history.replaceState({}, "", u.toString());
}
function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export default function App() {
  // ---------- Planner (no hard-code) ----------
  const qpPlanner = getQP("plannerEmail");
  const storedPlanner = safeGetLS("p2t_plannerEmail");
  const plannerEmail = qpPlanner || storedPlanner || "";

  // Persist for future loads if present
  useEffect(() => {
    if (qpPlanner) safeSetLS("p2t_plannerEmail", qpPlanner);
  }, [qpPlanner]);

  // ---------- Routing ----------
  const initialView = getQP("view") || "inbox"; // default inbox
  const [view, setView] = useState(initialView);
  const inboxStatusQP = getQP("inboxStatus") || "assigned";
  const [inboxStatus, setInboxStatus] = useState(inboxStatusQP);

  // Sync state with URL on back/forward
  useEffect(() => {
    const onPop = () => {
      setView(getQP("view") || "inbox");
      setInboxStatus(getQP("inboxStatus") || "assigned");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ---------- Header / Shell (structure preserved) ----------
  return (
    <>
      <header className="w-full border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/index.html?view=inbox" className="font-semibold tracking-tight">
            Plan2Tasks
          </a>
          <nav className="flex items-center gap-4 text-sm">
            <a href="/index.html?view=users" className="hover:underline">
              Users
            </a>
            <a href="/index.html?view=plan" className="hover:underline">
              Plan
            </a>
            <a href="/index.html?view=inbox" className="hover:underline">
              Inbox
            </a>
            <a href="/index.html?view=settings" className="hover:underline">
              Settings
            </a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-4">
        <ViewRouter
          view={view}
          setView={setView}
          inboxStatus={inboxStatus}
          setInboxStatus={setInboxStatus}
          plannerEmail={plannerEmail}
        />
      </main>
    </>
  );
}

// ---------- View Router ----------
function ViewRouter({ view, setView, inboxStatus, setInboxStatus, plannerEmail }) {
  useEffect(() => {
    // Keep URL in sync when internal view changes (clicking Assigned/Archived)
    setQP("view", view);
  }, [view]);

  if (view === "users") return <UsersView plannerEmail={plannerEmail} />;
  if (view === "plan") return <PlanView />;

  if (view === "settings") return <SettingsView />;

  // default: inbox
  return (
    <InboxView
      inboxStatus={inboxStatus}
      setInboxStatus={(next) => {
        setInboxStatus(next);
        setQP("inboxStatus", next);
      }}
      plannerEmail={plannerEmail}
      setView={setView}
    />
  );
}

// ---------- Users View (unchanged behavior) ----------
function UsersView({ plannerEmail }) {
  const url = useMemo(() => {
    // If planner missing, keep the link inert (we won't call the endpoint)
    return plannerEmail
      ? `https://www.plan2tasks.com/api/users?op=list&plannerEmail=${encodeURIComponent(plannerEmail)}&status=all`
      : null;
  }, [plannerEmail]);

  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!url) return;
    let canceled = false;
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        const j = await res.json();
        if (!canceled) setData(j);
      } catch (e) {
        if (!canceled) setErr("Failed to load users.");
      }
    })();
    return () => {
      canceled = true;
    };
  }, [url]);

  return (
    <>
      <h1 className="text-lg font-semibold mb-3">Users</h1>
      {!plannerEmail ? (
        <MissingPlannerHint />
      ) : (
        <>
          <p className="text-sm mb-3">
            <a className="underline" href={url} target="_blank" rel="noopener">
              Open users API
            </a>
          </p>
          {!data && !err && <div className="text-sm text-gray-500">Loading…</div>}
          {err && <div className="text-sm text-red-600">{err}</div>}
          {data && (
            <pre className="text-xs overflow-auto bg-gray-50 p-3 rounded">
              {escapeHTML(JSON.stringify(data, null, 2))}
            </pre>
          )}
        </>
      )}
    </>
  );
}

// ---------- Plan View (no changes) ----------
function PlanView() {
  return (
    <>
      <h1 className="text-lg font-semibold mb-3">Plan</h1>
      <p className="text-sm text-gray-600">
        Use the Planner flow as you do today. (No changes in this step.)
      </p>
    </>
  );
}

// ---------- Settings View (helper links; unchanged) ----------
function SettingsView() {
  const statusUrl =
    "https://www.plan2tasks.com/api/connections/status?userEmail=bart@midwesternbuilt.com";
  const refreshDry =
    "https://www.plan2tasks.com/api/connections/refresh?userEmail=bart@midwesternbuilt.com&dryRun=1";
  const refreshLive =
    "https://www.plan2tasks.com/api/connections/refresh?userEmail=bart@midwesternbuilt.com";
  const whichOauth =
    "https://www.plan2tasks.com/api/google/which-oauth?userEmail=bart@midwesternbuilt.com";
  const debugPush =
    "https://www.plan2tasks.com/api/debug/push-one?userEmail=bart@midwesternbuilt.com&title=Plan2Tasks%20TEST&minutes=15";

  return (
    <>
      <h1 className="text-lg font-semibold mb-3">Settings</h1>
      <ul className="list-disc ml-5 text-sm space-y-1">
        <li>
          <a className="underline" href={statusUrl} target="_blank" rel="noopener">
            Google Status
          </a>
        </li>
        <li>
          <a className="underline" href={refreshDry} target="_blank" rel="noopener">
            Refresh (dry-run)
          </a>
        </li>
        <li>
          <a className="underline" href={refreshLive} target="_blank" rel="noopener">
            Refresh (commit)
          </a>
        </li>
        <li>
          <a className="underline" href={whichOauth} target="_blank" rel="noopener">
            Which OAuth
          </a>
        </li>
        <li>
          <a className="underline" href={debugPush} target="_blank" rel="noopener">
            Debug: Push One
          </a>
        </li>
      </ul>
    </>
  );
}

// ---------- Inbox View (focus of this step) ----------
function InboxView({ inboxStatus, setInboxStatus, plannerEmail }) {
  const [bundles, setBundles] = useState(null);
  const [error, setError] = useState("");
  const apiUrl = useMemo(() => {
    if (!plannerEmail) return null;
    const status = inboxStatus || "assigned";
    return `https://www.plan2tasks.com/api/inbox?status=${encodeURIComponent(
      status
    )}&plannerEmail=${encodeURIComponent(plannerEmail)}`;
  }, [inboxStatus, plannerEmail]);

  async function load() {
    if (!apiUrl) return;
    setError("");
    setBundles(null);
    try {
      const res = await fetch(apiUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBundles((data && data.bundles) || []);
    } catch (e) {
      setError(String(e.message || "Failed to load"));
    }
  }

  // Initial + auto-refresh on return/back/visibility
  useEffect(() => {
    load();
    // pageshow: covers bfcache/back/forward
    const onPageShow = () => load();
    // visibility: tab switch back
    const onVis = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl]);

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-lg font-semibold">Inbox</h1>
      </div>

      <div className="text-sm mb-3" aria-label="Inbox filter">
        <button
          className={`underline-offset-2 hover:underline ${
            (inboxStatus || "assigned") === "assigned" ? "font-semibold" : ""
          }`}
          onClick={() => setInboxStatus("assigned")}
        >
          Assigned
        </button>
        <span aria-hidden="true" className="mx-2">
          |
        </span>
        <button
          className={`underline-offset-2 hover:underline ${
            (inboxStatus || "assigned") === "archived" ? "font-semibold" : ""
          }`}
          onClick={() => setInboxStatus("archived")}
        >
          Archived
        </button>
      </div>

      {!plannerEmail ? (
        <MissingPlannerHint />
      ) : (
        <>
          <div id="inbox-status-note" className="text-xs text-gray-500 mb-2">
            Viewing <span className="font-medium">{inboxStatus || "assigned"}</span>.{" "}
            <a className="underline" href={apiUrl} target="_blank" rel="noopener">
              Open API
            </a>
          </div>

          <div id="inbox-list" className="divide-y border rounded">
            {!bundles && !error && (
              <div className="text-sm text-gray-500 p-3">Loading…</div>
            )}
            {error && (
              <div className="text-sm text-red-600 p-3">Failed to load ({error}).</div>
            )}
            {bundles && bundles.length === 0 && (
              <div className="text-sm text-gray-500 p-3">
                No {inboxStatus || "assigned"} bundles.
              </div>
            )}
            {bundles &&
              bundles.length > 0 &&
              bundles.map((b) => (
                <InboxRow key={b.id} bundle={b} status={inboxStatus || "assigned"} />
              ))}
          </div>
        </>
      )}
    </>
  );
}

function InboxRow({ bundle, status }) {
  const id = bundle.id;
  const title = bundle.title || "(untitled)";
  const date = bundle.start_date || bundle.startDate || "";
  const tz = bundle.timezone || "";
  const assigned = bundle.assigned_user || bundle.assigned_user_email || "";
  const archivedAt = bundle.archived_at || null;
  const reviewHref = `/review.html?inboxId=${encodeURIComponent(id)}`;

  return (
    <div className="p-3 flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-gray-500">
          {date ? date : ""}
          {tz ? ` · ${tz}` : ""}
          {assigned ? ` · ${assigned}` : ""}
          {archivedAt ? ` · archived ${archivedAt}` : ""}
        </div>
      </div>
      <div className="ml-3 shrink-0">
        {status === "assigned" ? (
          <a className="text-sm underline" href={reviewHref}>
            Review
          </a>
        ) : (
          <a className="text-sm underline" href={reviewHref}>
            View
          </a>
        )}
      </div>
    </div>
  );
}

// ---------- Small, non-UI-changing hint when planner is missing ----------
function MissingPlannerHint() {
  // Minimal copy only; no inputs, no layout changes
  // Suggest a URL that includes ?plannerEmail= to keep Zero-Confirm flows intact.
  const example =
    "https://www.plan2tasks.com/index.html?view=inbox&plannerEmail=you%40example.com";
  return (
    <p className="text-sm text-gray-600">
      Planner not set. Open with your email, e.g.{" "}
      <a className="underline" href={example}>
        {example}
      </a>
      . (Your planner is remembered in this browser.)
    </p>
  );
}

// ---------- Safe localStorage helpers ----------
function safeGetLS(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSetLS(key, val) {
  try {
    window.localStorage.setItem(key, val);
  } catch {}
}
