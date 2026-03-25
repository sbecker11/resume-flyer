# Local files and secrets

These files are in `.gitignore` and are **never committed or pushed**. They are either secrets or private per-user data.

| File | Purpose | Treat as | Example / init |
|------|---------|----------|----------------|
| **`.env`** | API keys and environment config (e.g. `EXPRESS_PORT`, `VITE_DEV_PORT`, API keys). | **Secrets** | Copy from `.env.example` to create `.env`. See [REPLICATE-PORTS-CONFIG.md](REPLICATE-PORTS-CONFIG.md). |
| **`app_state.json`** | Persisted application state (layout, theme, selection, `currentResumeId`, etc.). Written when a persistent attribute is updated; read at startup / hard-refresh. | Per-user, not shared | **Remedy when missing:** the server initializes it from **`public/app_state.default.json`** (see below). |

---

## Local vs GitHub Pages

For **CI steps, palette URL verification, `VITE_BASE`, and post-deploy checks**, see **[DEPLOYMENT.md](DEPLOYMENT.md)**.

How **app state** and **.env** behave in each environment:

### App state

| | **Local (with server)** | **GitHub Pages (static)** |
|--|--------------------------|---------------------------|
| **Persisted file** | `app_state.json` in project root (gitignored). Created by server from default if missing. | No `app_state.json` — there is no server or filesystem. |
| **How client gets state** | GET `/api/state` from Express. Server reads `app_state.json` (or creates it from `public/app_state.default.json`). | No API. Client fetches **`app_state.default.json`** from the built site (same URL as the app, e.g. `/{base}/app_state.default.json`). That file is in **`public/`** so Vite copies it into `dist/` and it is always served. |
| **Saving state** | Client POSTs to `/api/state`; server writes `app_state.json`. | No server. State is kept in **localStorage** only (per browser). |
| **Default file** | **`public/app_state.default.json`** — committed. Server uses it to create `app_state.json` when missing. Refresh script: `scripts/refresh-app-state-default.mjs` writes to `public/app_state.default.json`. | Same file, served as a static asset from the build. Client uses it when no saved state exists (e.g. first visit). |

### .env

| | **Local (with server)** | **GitHub Pages (static)** |
|--|--------------------------|---------------------------|
| **File** | **`.env`** in project root (gitignored). Copy from `.env.example`. Used by the Node server and by Vite (dev/build) for ports, proxy, and any `VITE_*` vars. | **No `.env` file.** The static site is pre-built; no server runs on GitHub Pages. |
| **Where config comes from** | `.env` (and `.env.example` as template). See [REPLICATE-PORTS-CONFIG.md](REPLICATE-PORTS-CONFIG.md). | **GitHub Actions workflow** (e.g. `.github/workflows/deploy-github-pages.yml`). Any value the *build* needs (e.g. `VITE_BASE` for the site’s base path) is set in the workflow’s `env:` for the build step. |
| **Example file** | **`.env.example`** in project root — committed. Lists vars and defaults; never put secrets in it. | Not used. Do **not** put `.env.example` in `public/` — it would be served to the browser and is not needed for static hosting. |

Summary: **Local** uses `.env` and `app_state.json` (with `public/app_state.default.json` as fallback for state). **GitHub Pages** uses only what’s in the build: `app_state.default.json` from `public/` for initial state, and workflow `env` for build-time config (e.g. `VITE_BASE`).

When `user-settings.currentResumeId` points to a resume that is not present in the current environment (for example, a local-only resume id while running on GitHub Pages), startup falls back to the first available resume from `parsed_resumes/index.json` and persists that fallback id when save succeeds.

On GitHub Pages (static hosting), the UI disables backend-only actions:
uploads/parse and permanent resume delete/save are not available. The app can only display already-parsed resumes from `parsed_resumes/*` (and can download JSON patch files for manual offline application in the resume editor).

---

## Remedy when `app_state.json` is missing (local)

**`public/app_state.default.json`** is committed and synced with remote. It has the full application state structure with **safe defaults and no actual user data** (all private attributes are `null` or default values). Vite copies it into the build output so it is available on static hosts (e.g. GitHub Pages). When `app_state.json` cannot be located locally:

1. The server copies `public/app_state.default.json` to `app_state.json`.
2. The server then reads and returns that state (GET /api/state), so the client gets a valid state without a 404.

If `public/app_state.default.json` is also missing (e.g. corrupt repo), GET /api/state returns 404 and the client falls back to fetching the default from the built site or fails (fast-fail if required settings missing).

## Summary

- **Secrets:** `.env` — never commit; treat as sensitive.
- **Example/template files (committed):** `.env.example` (root only), **`public/app_state.default.json`** — safe defaults, no user data; used to initialize or mirror local setup. The default state lives in `public/` so it is part of the Vite build and available on GitHub Pages when no server exists.
- **Persisted state:** `app_state.json` — written by the app when running with the server; per-user, not committed. When missing, initialized from `public/app_state.default.json`.
