# Resume Manager UI Feature

A complete resume management system for the resume-flyer application, allowing users to upload, parse, and switch between multiple resumes.

## Overview

The Resume Manager provides:
- **Upload & Parse**: Upload .docx resume files and automatically parse them
- **Resume Library**: Browse all parsed resumes with metadata
- **Quick Switching**: Click any resume to instantly switch the application view
- **Progress Tracking**: Real-time upload and parsing progress indicators
- **Error Handling**: User-friendly error messages and recovery

## GitHub Pages (static hosting)
When running without the backend (GitHub Pages):
- Upload & parsing is disabled (no `/api` endpoints are available).
- Resume editing and permanent delete/save actions are disabled.
- The UI can still browse already-parsed resumes from `parsed_resumes/*` (and `parsed_resumes/index.json`).

## Architecture

### Backend (server.mjs)

#### New API Endpoints

1. **GET /api/resumes** - List all parsed resumes
   - Returns array of resume metadata including:
     - `id`: Resume identifier (e.g., "resume-1234567890")
     - `displayName`: Human-readable name
     - `createdAt`: ISO timestamp
     - `jobCount`: Number of jobs in resume
     - `skillCount`: Number of skills in resume
     - `metadata`: Additional metadata from meta.json

2. **POST /api/resumes/upload** - Upload and parse a .docx resume
   - Accepts multipart/form-data with:
     - `resume`: The .docx file (required)
     - `displayName`: Optional display name (defaults to filename)
   - Returns parsed resume metadata and counts
   - Automatically generates unique resume ID
   - Creates meta.json file for tracking

#### File Processing Flow

```
1. User uploads .docx file
2. Server saves to uploads/ directory
3. Validates file type and size (10MB max)
4. Creates output directory: parsed_resumes/resume-{timestamp}/
5. Calls Python parser: resume_to_flyer.py
6. Parser generates:
   - jobs.mjs (job history)
   - skills.mjs (skills list)
   - categories.mjs (skill categories)
   - other-sections.mjs (additional content)
   - resume.html (formatted output)
7. Server generates meta.json with metadata
8. Returns success response to client
```

### Frontend Components

#### 1. ResumeManager.vue (Modal Component)

**Location**: `modules/components/ResumeManager.vue`

**Props**:
- `isOpen`: Boolean - Controls modal visibility
- `currentResumeId`: String - ID of currently active resume

**Events**:
- `@close`: Emitted when user closes modal
- `@resume-selected`: Emitted when user selects a resume (payload: resumeId)

**Features**:
- Two-section layout: Upload | Library
- Drag-and-drop file selection (coming soon)
- Real-time upload progress bar
- Resume cards with metadata display
- Visual indicator for currently active resume
- Responsive grid layout
- Dark theme consistent with app design

#### 2. API Client (resumeManagerApi.mjs)

**Location**: `modules/api/resumeManagerApi.mjs`

**Functions**:

```javascript
// List all parsed resumes
const resumes = await listResumes()

// Upload a resume with optional display name
const result = await uploadResume(file, displayName, onProgress)

// Get resume data (jobs, skills, categories)
const data = await getResumeData(resumeId)
```

**Features**:
- XMLHttpRequest for upload progress tracking
- Comprehensive error handling
- File type validation
- Progress callbacks (0-100%)

#### 3. AppContent.vue Integration

**Location**: `modules/components/AppContent.vue`

**New Features**:
- Floating toolbar button at top center
- Resume manager modal integration
- Resume switching via `reinitializeResumeSystem()`
- Persistent resume ID in app state

**Event Flow**:
```
1. User clicks "Resume Manager" button
2. Modal opens and loads resume list
3. User uploads new resume OR selects existing
4. On selection:
   a. Update currentResumeId
   b. Persist to app state (app_state.json)
   c. Call reinitializeResumeSystem()
   d. Reload timeline, cards, and resume list
   e. Close modal
```

## Python Parser Requirements

The system expects a Python parser script at one of these locations:
- `{project_root}/resume_to_flyer.py`
- `{project_root}/../resume-parser/resume_to_flyer.py`
- `{project_root}/scripts/resume_to_flyer.py`

### Parser Interface

**Input**:
- Arg 1: Path to .docx file
- Arg 2: Output directory path

**Expected Output Files** (current pipeline uses JSON at folder root):
- `jobs.json` - Array of job objects with structure:
  ```javascript
  {
    index: 0,
    role: "Job Title",
    employer: "Company Name",
    start: "2024-01-01",
    end: "2024-12-31",
    Description: "Bullet points with [skill] tags"
  }
  ```

- `skills.json` - Object mapping skill names to metadata
- `categories.json` - Skill categories for organization
- `other-sections.json` - Additional resume sections
- `resume.html` - Formatted HTML output

### Parser Location

Based on CLAUDE.local.md documentation, the parser is located at:
```
git@github.com:sbecker11/resume-parser
```

Make sure this repository is cloned to `../resume-parser/` relative to the resume-flyer project.

## Usage

### For End Users

1. **Open Resume Manager**:
   - Click the "Resume Manager" button in the top toolbar
   - Keyboard shortcut: (coming soon)

2. **Upload a New Resume**:
   - Click the upload area or drag a .docx file
   - Optionally enter a display name
   - Click "Upload & Parse"
   - Wait for processing (progress bar shows status)
   - Resume automatically loads after successful parse

3. **Switch Between Resumes**:
   - Browse the resume library in the modal
   - Click any resume card to switch to it
   - Active resume is highlighted with green badge
   - Modal closes after successful switch

### For Developers

#### Adding the Feature to a Component

```vue
<script setup>
import { ref } from 'vue'
import ResumeManager from './ResumeManager.vue'
import { reinitializeResumeSystem } from '../resume/resumeReinitializer.mjs'
import { useAppState } from '../composables/useAppState.ts'

const isOpen = ref(false)
const currentResumeId = ref('default')

async function handleResumeSelected(resumeId) {
  const { state, saveAppState } = useAppState()
  state.currentResumeId = resumeId
  await saveAppState()
  await reinitializeResumeSystem(resumeId === 'default' ? null : resumeId)
  isOpen.value = false
}
</script>

<template>
  <button @click="isOpen = true">Open Resume Manager</button>

  <ResumeManager
    :isOpen="isOpen"
    :currentResumeId="currentResumeId"
    @close="isOpen = false"
    @resume-selected="handleResumeSelected"
  />
</template>
```

#### API Usage Examples

```javascript
// List all resumes
import { listResumes } from '@/modules/api/resumeManagerApi.mjs'
const resumes = await listResumes()
console.log(resumes) // [{ id, displayName, createdAt, jobCount, skillCount }]

// Upload with progress tracking
import { uploadResume } from '@/modules/api/resumeManagerApi.mjs'
const file = document.getElementById('fileInput').files[0]
const result = await uploadResume(file, 'My Resume', (progress) => {
  console.log(`Upload progress: ${progress}%`)
})

// Get resume data
import { getResumeData } from '@/modules/api/resumeManagerApi.mjs'
const { jobs, skills, categories } = await getResumeData('resume-123')
```

## File Structure

```
resume-flyer/
├── server.mjs                          # Backend API endpoints (MODIFIED)
├── modules/
│   ├── api/
│   │   └── resumeManagerApi.mjs       # API client (NEW)
│   ├── components/
│   │   ├── AppContent.vue             # Toolbar integration (MODIFIED)
│   │   └── ResumeManager.vue          # Modal component (NEW)
│   └── resume/
│       └── resumeReinitializer.mjs    # Resume switching logic (EXISTING)
├── parsed_resumes/                     # Resume storage
│   ├── index.json                      # List + defaultResumeId (first non-_local- by displayName)
│   └── <id>/                           # e.g. shawn-becker-full-stack-developer-ai-ml-engineer
│       ├── jobs.json
│       ├── skills.json
│       ├── categories.json
│       ├── resume.html
│       └── meta.json
└── uploads/                            # Temporary upload directory

../resume-parser/                       # Python parser (EXTERNAL)
└── resume_to_flyer.py                 # Parser script
```

## Security Considerations

1. **File Upload Validation**:
   - Only .docx files accepted (MIME type + extension check)
   - 10MB file size limit enforced
   - Filename sanitization using `sanitize-filename` package

2. **Path Traversal Prevention**:
   - All file paths resolved using `path.join()` and `path.resolve()`
   - User input sanitized before file operations

3. **Error Handling**:
   - Uploaded files cleaned up on parser failure
   - Graceful degradation for missing parser
   - Client-side file validation before upload

## Testing Checklist

- [ ] Upload a valid .docx resume
- [ ] Verify parsing completes successfully
- [ ] Check meta.json is created correctly
- [ ] View uploaded resume in library
- [ ] Switch to uploaded resume
- [ ] Verify timeline, cards, and resume list update
- [ ] Upload another resume
- [ ] Switch between multiple resumes
- [ ] Test error handling (invalid file, large file)
- [ ] Verify progress bar works during upload
- [ ] Check modal close/open behavior
- [ ] Test responsive layout on mobile

## Future Enhancements

- [ ] Drag-and-drop file upload
- [ ] Resume deletion from library
- [ ] Resume renaming
- [ ] Export resume data
- [ ] Resume comparison view
- [ ] Batch upload support
- [ ] Resume templates
- [ ] Search and filter in library
- [ ] Resume versioning
- [ ] Collaborative resume editing

## Troubleshooting

### "Parser not found" Error

**Problem**: Server can't locate resume_to_flyer.py

**Solutions**:
1. Clone **resume-parser** and install its dependencies:
   ```bash
   cd /Users/sbecker11/workspace-resume/
   git clone git@github.com:sbecker11/resume-parser
   cd resume-parser
   # follow README: pip install -r requirements.txt (or equivalent)
   ```

2. Or create symlink:
   ```bash
   ln -s /path/to/resume-parser/resume_to_flyer.py /path/to/resume-flyer/
   ```

### Upload Fails with "Processing Error"

**Problem**: Python parser crashes or returns non-zero exit code

**Debug Steps**:
1. Check server console for parser stderr output
2. Manually run parser: `python3 resume_to_flyer.py test.docx output/`
3. Verify Python dependencies are installed
4. Check .docx file format validity

### Resume Doesn't Switch After Selection

**Problem**: Click resume card but view doesn't update

**Debug Steps**:
1. Open browser console and check for errors
2. Verify `reinitializeResumeSystem()` is called
3. Check app_state.json for currentResumeId update
4. Ensure resume data files exist in parsed_resumes/{id}/
5. Verify jobs.json and skills.json exist and are valid

## Performance Notes

- Resume list loading: ~50-200ms (depends on number of resumes)
- File upload: Varies by file size and network
- Parser execution: ~2-5 seconds for typical resume
- Resume switching: ~500-1000ms (full app reinitialization)

## API Response Examples

### GET /api/resumes
```json
[
  {
    "id": "resume-1710012345678",
    "displayName": "John Doe - Software Engineer",
    "createdAt": "2024-03-09T18:25:45.678Z",
    "jobCount": 8,
    "skillCount": 42,
    "metadata": {
      "originalFilename": "john_doe_resume.docx",
      "uploadedBy": "user",
      "fileSize": 45678
    }
  }
]
```

### POST /api/resumes/upload (Success)
```json
{
  "success": true,
  "resumeId": "resume-1710012345678",
  "displayName": "John Doe - Software Engineer",
  "jobCount": 8,
  "skillCount": 42,
  "metadata": {
    "id": "resume-1710012345678",
    "displayName": "John Doe - Software Engineer",
    "originalFilename": "john_doe_resume.docx",
    "createdAt": "2024-03-09T18:25:45.678Z",
    "uploadedBy": "user",
    "fileSize": 45678
  }
}
```

### POST /api/resumes/upload (Error)
```json
{
  "error": "Failed to process resume upload",
  "details": "Parser exited with code 1. Error: Invalid .docx format"
}
```

## Branch Information

Feature developed on: `feature/resume-manager-ui`

To merge into master:
```bash
git checkout master
git merge feature/resume-manager-ui
```
