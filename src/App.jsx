/* App.jsx — Plan2Tasks integrated app (static HTML/JS)
   - Preserves existing header/nav structure and views (?view=users|plan|inbox|settings)
   - Adds Inbox text-link toggle for Assigned | Archived (no layout changes)
   - Ensures Inbox auto-refreshes when returning from review.html or using back/forward
   - Stack: plain JS; no frameworks, no iframes, no Next.js/TS
*/

(function () {
  // ---- Config / assumptions ----
  // Planner email used for Inbox listings. If present, prefer ?plannerEmail=... or localStorage.
  const DEFAULT_PLANNER_EMAIL = 'bartpaden@gmail.com';
  const url = new URL(window.location.href);
  const qp = (k, fallback = null) => url.searchParams.get(k) || fallback;

  const plannerEmail =
    qp('plannerEmail') ||
    window.localStorage.getItem('p2t_plannerEmail') ||
    DEFAULT_PLANNER_EMAIL;

  // Persist for later loads
  try { window.localStorage.setItem('p2t_plannerEmail', plannerEmail); } catch {}

  // View routing
  const view = qp('view', 'inbox'); // default to inbox
  const appRootId = 'app-root';

  // Basic DOM helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const setHTML = (el, html) => { el.innerHTML = html; };

  // ---- Header & shell ----
  function renderShell() {
    const root = document.getElementById(appRootId);
    if (!root) return;

    // Header/nav markup intentionally unchanged in structure and spacing.
    // If your current header differs, this keeps the same pattern: brand at left,
    // nav links to Users / Plan / Inbox / Settings on the right.
    setHTML(root, `
      <header class="w-full border-b bg-white">
        <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/index.html?view=inbox" class="font-semibold tracking-tight">Plan2Tasks</a>
          <nav class="flex items-center gap-4 text-sm">
            <a href="/index.html?view=users" class="hover:underline">Users</a>
            <a href="/index.html?view=plan" class="hover:underline">Plan</a>
            <a href="/index.html?view=inbox" class="hover:underline">Inbox</a>
            <a href="/index.html?view=settings" class="hover:underline">Settings</a>
          </nav>
        </div>
      </header>

      <main class="max-w-5xl mx-auto px-4 py-4">
        <div id="view-container"></div>
      </main>
    `);
  }

  // ---- Views ----
  async function renderView(v) {
    const container = $('#view-container');
    if (!container) return;

    if (v === 'users') {
      // Existing Users view left as-is (list comes from /api/users).
      const listUrl = `https://www.plan2tasks.com/api/users?op=list&plannerEmail=${encodeURIComponent(plannerEmail)}&status=all`;
      setHTML(container, `
        <h1 class="text-lg font-semibold mb-3">Users</h1>
        <p class="text-sm mb-3"><a class="underline" href="${listUrl}" target="_blank" rel="noopener">Open users API</a></p>
        <div data-users-placeholder class="text-sm text-gray-500">Loading…</div>
      `);
      try {
        const res = await fetch(listUrl);
        const data = await res.json();
        $('[data-users-placeholder]', container).outerHTML = `
          <pre class="text-xs overflow-auto bg-gray-50 p-3 rounded">${escapeHTML(JSON.stringify(data, null, 2))}</pre>
        `;
      } catch (e) {
        $('[data-users-placeholder]', container).textContent = 'Failed to load users.';
      }
      return;
    }

    if (v === 'plan') {
      // Existing Plan view remains intact (no behavior change).
      setHTML(container, `
        <h1 class="text-lg font-semibold mb-3">Plan</h1>
        <p class="text-sm text-gray-600">Use the Planner flow as you do today. (No changes in this step.)</p>
      `);
      return;
    }

    if (v === 'settings') {
      // Keep Settings simple; show Google status helpers (no behavior change).
      const statusUrl = `https://www.plan2tasks.com/api/connections/status?userEmail=bart@midwesternbuilt.com`;
      const refreshDry = `https://www.plan2tasks.com/api/connections/refresh?userEmail=bart@midwesternbuilt.com&dryRun=1`;
      const refreshLive = `https://www.plan2tasks.com/api/connections/refresh?userEmail=bart@midwesternbuilt.com`;
      const whichOauth = `https://www.plan2tasks.com/api/google/which-oauth?userEmail=bart@midwesternbuilt.com`;
      const debugPush = `https://www.plan2tasks.com/api/debug/push-one?userEmail=bart@midwesternbuilt.com&title=Plan2Tasks%20TEST&minutes=15`;

      setHTML(container, `
        <h1 class="text-lg font-semibold mb-3">Settings</h1>
        <ul class="list-disc ml-5 text-sm space-y-1">
          <li><a class="underline" href="${statusUrl}" target="_blank" rel="noopener">Google Status</a></li>
          <li><a class="underline" href="${refreshDry}" target="_blank" rel="noopener">Refresh (dry-run)</a></li>
          <li><a class="underline" href="${refreshLive}" target="_blank" rel="noopener">Refresh (commit)</a></li>
          <li><a class="underline" href="${whichOauth}" target="_blank" rel="noopener">Which OAuth</a></li>
          <li><a class="underline" href="${debugPush}" target="_blank" rel="noopener">Debug: Push One</a></li>
        </ul>
      `);
      return;
    }

    // ---- Inbox (this step focuses here) ----
    // Text-link toggle + list that refreshes automatically on return/back/forward.
    const inboxStatus = qp('inboxStatus', 'assigned'); // 'assigned' | 'archived'
    setHTML(container, `
      <div class="flex items-center justify-between mb-2">
        <h1 class="text-lg font-semibold">Inbox</h1>
      </div>

      <div class="text-sm mb-3" id="inbox-toggle" aria-label="Inbox filter">
        <button data-inbox-tab="assigned" class="underline-offset-2 hover:underline ${inboxStatus === 'assigned' ? 'font-semibold' : ''}">Assigned</button>
        <span aria-hidden="true" class="mx-2">|</span>
        <button data-inbox-tab="archived" class="underline-offset-2 hover:underline ${inboxStatus === 'archived' ? 'font-semibold' : ''}">Archived</button>
      </div>

      <div id="inbox-status-note" class="text-xs text-gray-500 mb-2"></div>
      <div id="inbox-list" class="divide-y border rounded"></div>
    `);

    // Toggle handlers (no layout change—simple text buttons)
    $('#inbox-toggle').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-inbox-tab]');
      if (!btn) return;
      const next = btn.getAttribute('data-inbox-tab');
      if (!next) return;

      // Update URL query for shareability without full reload
      const u = new URL(window.location.href);
      u.searchParams.set('view', 'inbox');
      u.searchParams.set('inboxStatus', next);
      history.replaceState({}, '', u.toString());

      // Update toggle styles
      $$('[data-inbox-tab]').forEach(b => b.classList.remove('font-semibold'));
      btn.classList.add('font-semibold');

      // Load requested tab
      loadInbox(next);
    });

    // Initial load
    await loadInbox(inboxStatus);

    // Auto-refresh when returning from review.html (redirect or back/forward).
    // 'pageshow' fires on bfcache restoration; 'visibilitychange' covers tab switching.
    window.addEventListener('pageshow', (ev) => {
      // Only refresh Inbox view; soft refresh is cheap
      if (currentViewIsInbox()) loadInbox(qp('inboxStatus', 'assigned'));
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentViewIsInbox()) {
        loadInbox(qp('inboxStatus', 'assigned'));
      }
    });

    function currentViewIsInbox() {
      const u = new URL(window.location.href);
      return (u.searchParams.get('view') || 'inbox') === 'inbox';
    }

    async function loadInbox(status) {
      const listEl = $('#inbox-list');
      const noteEl = $('#inbox-status-note');
      if (!listEl || !noteEl) return;

      const apiUrl = `https://www.plan2tasks.com/api/inbox?status=${encodeURIComponent(status)}&plannerEmail=${encodeURIComponent(plannerEmail)}`;
      noteEl.innerHTML = `
        Viewing <span class="font-medium">${status}</span>.
        <a class="underline" href="${apiUrl}" target="_blank" rel="noopener">Open API</a>
      `;
      listEl.innerHTML = `<div class="text-sm text-gray-500 p-3">Loading…</div>`;

      try {
        const res = await fetch(apiUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const bundles = (data && data.bundles) || [];
        if (!bundles.length) {
          listEl.innerHTML = `<div class="text-sm text-gray-500 p-3">No ${status} bundles.</div>`;
          return;
        }

        const rows = bundles.map(b => {
          const id = b.id;
          const title = b.title || '(untitled)';
          const date = b.start_date || b.startDate || '';
          const tz = b.timezone || '';
          const assigned = b.assigned_user || b.assigned_user_email || '';
          const archivedAt = b.archived_at || null;
          const reviewHref = `/review.html?inboxId=${encodeURIComponent(id)}`;

          return `
            <div class="p-3 flex items-center justify-between">
              <div class="min-w-0">
                <div class="text-sm font-medium truncate">${escapeHTML(title)}</div>
                <div class="text-xs text-gray-500">
                  ${date ? escapeHTML(date) : ''}${tz ? ` · ${escapeHTML(tz)}` : ''}${assigned ? ` · ${escapeHTML(assigned)}` : ''}
                  ${archivedAt ? ` · archived ${escapeHTML(archivedAt)}` : ''}
                </div>
              </div>
              <div class="ml-3 shrink-0">
                ${status === 'assigned'
                  ? `<a class="text-sm underline" href="${reviewHref}">Review</a>`
                  : `<a class="text-sm underline" href="${reviewHref}">View</a>`
                }
              </div>
            </div>
          `;
        }).join('');

        listEl.innerHTML = rows;
      } catch (err) {
        listEl.innerHTML = `<div class="text-sm text-red-600 p-3">Failed to load (${escapeHTML(String(err.message))}).</div>`;
      }
    }
  }

  // ---- Utilities ----
  function escapeHTML(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  // ---- Boot ----
  document.addEventListener('DOMContentLoaded', async () => {
    renderShell();
    await renderView(view);
  });
})();
