# Manual Test Checklist — Resume Details Editor

Use this when testing the resume-details-editor and related features.

## Prerequisites

- `npm run dev` running (frontend + backend)
- At least one **parsed resume** loaded (not the default static content)
- DevTools console open for errors

---

## 1. Entry Points

| # | Action | Expected |
|---|--------|----------|
| 1.1 | Load app with default resume | Details and Render buttons **hidden** |
| 1.2 | Switch to a parsed resume (e.g. from Manage) | Details, Render, Print buttons **visible** |
| 1.3 | Click **Details** | Modal opens with tabs: Meta, Other sections |

---

## 2. Meta Tab

| # | Action | Expected |
|---|--------|----------|
| 2.1 | Open Details, select Meta tab | displayName, fileName editable; id, createdAt read-only |
| 2.2 | Change displayName, click Save | Success; modal closes; list/header reflects new name on reload/refresh |
| 2.3 | Open again, change fileName, Save | meta.json updated (e.g. check via API or file) |

---

## 3. Other Sections Tab

| # | Action | Expected |
|---|--------|----------|
| 3.1 | Edit Summary, Title | Values persist on Save |
| 3.2 | Fill Contact (name, email, phone, etc.) | All fields saved |
| 3.3 | Add certification (name, optional URL, optional description) | Row appears; Save creates/updates other-sections.mjs |
| 3.4 | Add website (label, URL, optional description) | Same |
| 3.5 | Add other section (title, subtitle, description) | Same |
| 3.6 | Remove item (×) | Item removed on Save |
| 3.7 | Save with empty/minimal data | No errors; file created/updated |

---

## 4. Create-If-Missing

| # | Action | Expected |
|---|--------|----------|
| 4.1 | Use resume that has no other-sections.mjs | Other Sections tab loads with empty defaults |
| 4.2 | Add data, Save | other-sections.mjs created in resume folder |

---

## 5. Print

| # | Action | Expected |
|---|--------|----------|
| 5.1 | Edit Other Sections (summary, contact, certifications, websites) | — |
| 5.2 | Click **Print** | New tab opens with HTML resume |
| 5.3 | Verify | Summary, contact, certifications, websites render correctly |
| 5.4 | Verify escaping | Values with `<`, `>`, `&` appear safe, not as HTML |

---

## 6. Render (External Script)

| # | Action | Expected |
|---|--------|----------|
| 6.1 | Do **not** set `RESUME_HTML_RENDERER_SCRIPT` | — |
| 6.2 | Click **Render** | Alert: "External HTML renderer not configured" (or similar) |
| 6.3 | Set `RESUME_HTML_RENDERER_SCRIPT` in .env to a valid Node script | Restart server |
| 6.4 | Script receives folder path, writes rendered.html | — |
| 6.5 | Click **Render** | New tab opens with rendered HTML (from rendered.html) |

---

## 7. Errors & Edge Cases

| # | Action | Expected |
|---|--------|----------|
| 7.1 | Cancel without saving | Modal closes; no changes persisted |
| 7.2 | Network/server error during save | Alert with error; modal stays open |
| 7.3 | Refresh page after save | Data still present in Details |
| 7.4 | Switch resume while Details open | Modal loads new resume data on next open |

---

## Quick Smoke

1. Switch to parsed resume → Details opens
2. Edit Meta displayName → Save → success
3. Edit Other Sections (summary + 1 certification) → Save → success
4. Print → HTML renders
5. Render (without script) → clear 501/not-configured message
