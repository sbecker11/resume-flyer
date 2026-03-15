# Resume Upload, Parse & Load — Proposed Design

## Goals

1. User can upload a local **resume.docx** or **resume.pdf**, run the existing Python parser, and re-initialize resume-flock with the new jobs/skills.
2. Previously parsed resumes are **stored** (original file + output `jobs.mjs` / `skills.mjs`) and can be **selected** to load and re-initialize at any time.
3. A **modal dialog** provides: file picker + Parse, error reporting, list of saved resumes, and Load.

---

## 1. Data model & storage

### 1.1 Where to store parsed resumes

- **Directory**: `parsed_resumes/` at project root (or under `static_content/parsed_resumes/` if you prefer).
- **Per-resume folder**: `parsed_resumes/<id>/` where `id` is a stable slug (e.g. UUID or `resume_<timestamp>_<sanitized-filename>`).

### 1.2 Contents of each `parsed_resumes/<id>/`

| Item | Description |
|------|-------------|
| `resume.pdf` or `resume.docx` | Original uploaded file (keep for “load this resume” and re-parse if needed). |
| `jobs.mjs` | Output from parser at folder root (same format as `static_content/jobs/jobs.mjs`). |
| `skills.mjs` | Output from parser at folder root (same format as `static_content/skills/skills.mjs`). |
| `meta.json` | `{ id, displayName, createdAt, fileName, jobCount, skillCount }` for list UI and current-resume state. |

### 1.3 “Default” vs “current parsed resume”

- **Default**: Existing behavior — jobs/skills come from `static_content/jobs/jobs.mjs` and `static_content/skills/skills.mjs` (and `enrichedJobs.mjs`).
- **Current parsed resume**: When user has chosen a saved resume, app state records `currentResumeId` (or `null`). Jobs/skills are then loaded from `parsed_resumes/<currentResumeId>/` (via API), not from static content.

---

## 2. Backend (Node/Express in resume-flock)

### 2.1 Parser invocation

- **Python path**: Configurable (e.g. env `RESUME_PARSER_PATH=/Users/sbecker11/workspace-resume/resume-parser` or default relative to project).
- **Invocation**: From Node, run the parser as a subprocess, e.g.:
  - `python resume_to_flock.py <uploadedFilePath> -o <parsed_resumes/<id>>`
- **Environment**: Use the parser’s own venv (e.g. `path.join(RESUME_PARSER_PATH, '.venv', 'bin', 'python')` on macOS/Linux) so LLM and deps are available.
- **Timeouts**: Set a generous timeout (e.g. 120s) and stream or capture stderr for error reporting.

### 2.2 API endpoints

| Method | Path | Purpose |
|--------|------|--------|
| **POST** | `/api/resumes/parse` | Upload file (multipart), run parser, save to `parsed_resumes/<newId>/`, return `{ id, displayName, jobCount, skillCount, error? }`. |
| **GET** | `/api/resumes` | List saved resumes: array of `{ id, displayName, createdAt, fileName, jobCount, skillCount }` from each `meta.json`. |
| **GET** | `/api/resumes/:id/data` | Return `{ jobs, skills }` for resume `id` (read `jobs.mjs` / `skills.mjs`, evaluate or parse to JSON). |
| **DELETE** | `/api/resumes/:id` (optional) | Delete `parsed_resumes/<id>/` and return 204. |

- **POST /api/resumes/parse** flow:
  1. Accept multipart file (single file; validate `.docx` / `.pdf`).
  2. Generate new `id`; create `parsed_resumes/<id>/`.
  3. Save uploaded file as `resume.pdf` or `resume.docx` there.
  4. Run parser with `-o parsed_resumes/<id>` (parser writes `jobs.mjs`, `skills.mjs` at folder root).
  5. Read job/skill counts from generated files; write `meta.json`.
  6. On success: respond with `{ id, displayName, jobCount, skillCount }`.
  7. On parser error: respond 4xx/5xx with `{ error: string }` (and optionally keep or remove the folder).

### 2.3 Serving jobs/skills for a parsed resume

- **GET /api/resumes/:id/data**: Read `parsed_resumes/<id>/jobs.mjs` and `parsed_resumes/<id>/skills.mjs`. Either:
  - **Option A**: Parse the `.mjs` as JSON (strip `const jobs = ` / `const skills = ` and trailing `;`, then `JSON.parse`), and return `{ jobs, skills }`.
  - **Option B**: If parser output is strict enough, require it to also write `.json` and serve those.

Option A keeps compatibility with existing parser output.

---

## 3. App state: current resume

- **State**: Add to persisted app state (e.g. under `user-settings` or a top-level key):
  - `currentResumeId: string | null` — when non-null, jobs/skills are loaded from the API for this id instead of from static content.
- **Persistence**: Save/load with existing state so that after refresh the same parsed resume is active (or “default” when `currentResumeId === null`). Application state is stored in `app_state.json`; see [LOCAL-FILES-AND-SECRETS.md](LOCAL-FILES-AND-SECRETS.md) for local files.

---

## 4. Frontend: jobs/skills loading and re-init

### 4.1 Two sources of truth

- **Default**: `useJobsDependency.loadJobs()` continues to use `enrichedJobs.mjs` (static import of `static_content/jobs` and `static_content/skills`). No change when `currentResumeId` is null.
- **Parsed resume**: When `currentResumeId` is set:
  - Add a `loadJobsFromResumeId(id)` (or extend `loadJobs`) that:
    - Calls `GET /api/resumes/:id/data`.
    - Receives `{ jobs, skills }`.
    - Runs the same enrichment as `enrichedJobs.mjs` (e.g. in a small `enrichJobsWithSkills(jobs, skills)` helper used by both static and API path).
    - Sets jobs state with this enriched array and notifies dependent controllers (same as current `loadJobs` flow).

### 4.2 Re-initialization

- **After “Load” (select a saved resume) or after “Parse” (and auto-load new resume)**:
  1. Set `currentResumeId` in app state (and persist).
  2. Call `loadJobsFromResumeId(currentResumeId)` (or equivalent).
  3. **Re-run resume-system init**: clear existing rDivs/cDivs/timeline, then run the same initialization that runs on first load (create rDivs from new jobs, create cDivs and skill cards, timeline, etc.). This implies:
     - Resetting or re-creating the “jobs state” in `useJobsDependency` and re-notifying controllers, **or**
     - Exposing a single “reinitializeResumeSystem(jobsData)” that tears down and rebuilds list + scene + timeline from the new `jobsData`.

- **Back to “default” resume**: If you add a “Use default resume” action, set `currentResumeId = null`, reload from static (e.g. force `loadJobs()` to re-import static content), and re-initialize again.

---

## 5. Modal dialog UI

### 5.1 Layout (single modal)

- **Title**: e.g. “Resume: Upload & load”.
- **Section 1 — Upload & parse**
  - File input (accept `.docx`, `.pdf`).
  - Button “Parse” (disabled until a file is chosen). On click: upload to `POST /api/resumes/parse`, show loading state.
  - **Error area**: If parse fails, show server-returned `error` (and optional stderr if you surface it).
  - On success: show short success message (e.g. “Parsed N jobs, M skills”) and optionally auto-load this resume (see below).
- **Section 2 — Saved resumes**
  - List of previously parsed resumes (from `GET /api/resumes`): display name, date, job/skill counts.
  - Each row: “Load” button. On click: set `currentResumeId`, fetch data, re-initialize resume-flock, close modal (or leave open).
- **Footer**: “Close” (and optionally “Use default resume” to clear `currentResumeId` and re-init from static).

### 5.2 Flow after successful parse

- **Option A (recommended)**: After successful parse, automatically “Load” the new resume (set `currentResumeId`, load its data, re-initialize). Then show success + “Resume loaded. You can switch to another saved resume below or close.”
- **Option B**: Only add it to the list; user must click “Load” for that resume.

### 5.3 Where to open the modal

- A top-level control: e.g. “Resume” or “Upload resume” in the header or resume panel that opens this modal. One entry point is enough.

---

## 6. Implementation order (suggested)

1. **Backend**
   - Create `parsed_resumes/` and implement POST `/api/resumes/parse` (upload, run Python parser, write meta.json).
   - Implement GET `/api/resumes` (list from meta.json files).
   - Implement GET `/api/resumes/:id/data` (read jobs.mjs/skills.mjs, return JSON).
2. **App state**
   - Add `currentResumeId` to state and persistence.
3. **Jobs loading**
   - Add `loadJobsFromResumeId(id)` (or equivalent) that uses `/api/resumes/:id/data` and enriches like `enrichedJobs.mjs`; ensure controllers are notified with new data.
4. **Re-initialization**
   - Implement “re-init resume system” (teardown + rebuild from current jobs data) and call it after loading a parsed resume (or default).
5. **Modal**
   - Add modal component: file input, Parse button, error area, list of saved resumes, Load buttons, Close.
   - Wire Parse → POST parse → on success set currentResumeId and re-init (and optionally auto-load).
   - Wire Load → set currentResumeId, load data, re-init.
6. **Entry point**
   - Add “Resume” / “Upload resume” button that opens the modal.

---

## 7. Edge cases & notes

- **Parser not installed or failing**: If `RESUME_PARSER_PATH` is missing or Python fails, return a clear error from POST parse (e.g. “Parser not configured or failed: …”).
- **Large files**: Consider a max upload size (e.g. 10 MB) in Express.
- **Concurrent parse**: Only one parse at a time (e.g. mutex or queue) to avoid overwriting or conflicting writes.
- **Existing static content**: Leaving `static_content/jobs` and `static_content/skills` unchanged; they remain the “default” when no parsed resume is selected.
- **Enrichment**: The `enrichJobFromDescription` logic in `enrichedJobs.mjs` should be reused when loading from API so that job references and job-skills are identical for static vs parsed resumes.

---

## 8. Summary

| Component | Responsibility |
|-----------|----------------|
| **Backend** | Upload handling, run parser into `parsed_resumes/<id>/`, list resumes, serve jobs+skills as JSON for a given id. |
| **State** | `currentResumeId` (persisted); when set, jobs/skills come from API. |
| **Jobs loading** | `loadJobsFromResumeId(id)` + shared enrichment; re-use same controller notification flow. |
| **Re-init** | Single “reinitializeResumeSystem(jobsData)” (or equivalent) to rebuild list, scene, timeline from new data. |
| **Modal** | Upload + Parse, errors, list of saved resumes, Load, Close; optional “Use default resume”. |
| **Parser** | Unchanged; invoked with `-o parsed_resumes/<id>`, writes `jobs.mjs`, `skills.mjs` at folder root. |

This design keeps the existing parser and static default, adds a clear “parsed resume” path, and gives users one place to upload, parse, save, and load any stored resume.
