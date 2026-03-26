## `parsed_resumes/` folder naming (publishable vs local-only)

`resume-flyer` persists parsed resume datasets under the project’s `parsed_resumes/` directory.

### Summary

- **Publishable dataset folders**: folder names that **do not** start with `_local-`
  - Intended to be safe to **commit** and **serve from static hosting** (e.g. GitHub Pages).
  - In this repo we typically commit **JSON-only** artifacts (`jobs.json`, `skills.json`, `categories.json`, `meta.json`, `other-sections.json`).
- **Local-only dataset folders**: folder names that **start with** `_local-`
  - Intended for local experimentation, private resumes, and large binaries.
  - Should remain ignored (not committed) and may be excluded from public indexes/builds.

### Why this exists

GitHub Pages and other static hosts can only serve files that exist in the built artifact. They cannot write back to disk.

So we use `_local-` as a simple contract:

- **Publishable**: safe to include in builds and list in selectors.
- **Local-only**: safe to ignore and keep private.

### Implementation notes in this repo

- **Git ignore**: `.gitignore` is configured to ignore `parsed_resumes/` by default and selectively allow the publishable dataset(s).
- **Indexing**: the static build can generate/ship `parsed_resumes/non-local-resumes.json` to enumerate publishable datasets.
- **Editing**:
  - Local dev with the Node server can persist edits via `/api/resumes/...` back into `parsed_resumes/<id>/*.json`.
  - Static hosting cannot write files; save operations should fall back to a user-visible remedy (e.g. downloading a patch JSON).

