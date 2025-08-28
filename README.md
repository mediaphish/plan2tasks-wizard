# Plan2Tasks Wizard (One-Click Deploy Guide )

This folder contains the **Plan2Tasks Wizard** — a small website that helps you create your weekly plan, copy a “Plan2Tasks block”, and export an `.ics` calendar file.

You **do not** paste this into Google Apps Script. It’s a separate, simple website.

---

## Fastest path to publish (no coding)
You will do two things:
1) Upload these files to a new GitHub repository (using the website UI — no command line).
2) Click “Import Project” on Vercel.com to deploy the site.

### Step 1 — Put the code on GitHub (web only)
1. Go to https://github.com and log in (create an account if needed).
2. Click **New** (top-left) → **Repository name**: `plan2tasks-wizard` → click **Create repository**.
3. On the repo page, click **“Add file” → “Upload files”**.
4. Drag this entire folder’s contents into the upload area (including `package.json`, `index.html`, the `src` folder, etc.).
5. Click **Commit changes**.

### Step 2 — Deploy with Vercel (web only)
1. Go to https://vercel.com and sign in with GitHub.
2. Click **“Add New…” → “Project” → “Import Git Repository.”**
3. Choose your `plan2tasks-wizard` repo.
4. Keep defaults (Framework: **Vite**). Click **Deploy**.
5. After 1–2 minutes, you’ll get a live URL like `https://plan2tasks-wizard.vercel.app`.

Done. Share that link with users.

---

## How to use with your Plan2Tasks (Apps Script) sheet
1. Visit your new Wizard website.
2. Fill in **Plan basics**, add **Recurring blocks** (Gym, meetings), and add **Tasks** for the week.
3. In the final step, click **Copy Plan2Tasks block**.
4. Open your Google Sheet → open your Plan2Tasks sidebar → paste the block into the input your script reads → run.
5. (Optional) Click **Export .ics** to add all items to your calendar.

### Important
- You **do not** need to change anything in `code.gs` or `WebApp.html` for this to work.
- The wizard is just a convenient way to compose the weekly block you already use.

---

## Local preview (optional, only if you want)
If you prefer to see the site on your own computer:

1. Install Node.js (https://nodejs.org) once.
2. Open a terminal in this folder and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open the URL it prints (usually `http://localhost:5173`). 

To build a static site locally:
```bash
npm run build
```
The compiled site is in the `dist/` folder.
