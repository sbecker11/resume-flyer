# Resume Details Editor

Modal UI for editing resume metadata, other-sections (summary, title, contact, certifications, websites, other sections), and categories. Designed as a **modular, removable** feature.

## Usage in app

```vue
<ResumeDetailsEditor
  :resume-id="currentResumeId"
  :is-open="isDetailsEditorOpen"
  @close="isDetailsEditorOpen = false"
  @saved="..."
/>
```

Only enable when `currentResumeId && currentResumeId !== 'default'`.

## Removal

1. Delete `modules/resume-details-editor/`
2. Remove import and `<ResumeDetailsEditor>` from `ResumeContainer.vue`
3. Remove the "Resume details" launch button
4. Server routes (`GET/PATCH meta`, `PATCH other-sections`, `PATCH categories`) can stay or be removed

## Standalone

To run as a separate editing tool:

1. Copy this module into a minimal Vue app
2. Set `window.__RESUME_DETAILS_EDITOR_API_BASE__ = 'http://your-api-origin'` before mount
3. Ensure the backend exposes the same API paths
