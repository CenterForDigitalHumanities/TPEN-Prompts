# Common Tasks Entry Point

## Purpose

This is the primary task guide for models assisting TPEN transcription workflows.

Use this file as the top-level execution contract. It defines:

- mandatory preflight gatekeepers
- generic workflow boilerplate
- task-specific execution paths
- required save-and-report completion behavior

Supporting references:

- [TPEN API Guide](TPEN_API.md)
- [Image Analysis Purpose](IMAGE_ANALYSIS.md)
- [Handwriting Text Recognition Purpose](HANDWRITING_TEXT_RECOGNITION.md)

## Fast-Fail Gatekeepers

Run these checks first. If any check fails, stop and return a concise failure report to the user.

1. Critical context exists.

- Required: idToken, projectId, pageId, canvasId, manifestUri
- Required geometry source: canvasWidth/canvasHeight in context, or retrievable from canvasId, or retrievable from manifestUri items by matching canvasId
- If an Image Resource is needed for the task, imageUrl must be present and reachable

1. Tooling capability exists.

- Model can fetch internet resources (Canvas URI, Manifest URI, TPEN API endpoints)
- Model can perform HTTP write operations: PUT, POST, and PATCH
- If PATCH is unavailable but POST with method override is supported, use fallback
- If model can GET resources but cannot perform write operations, switch to browser-submit fallback mode:
  - Return a brief instruction plus a serialized JSON payload for one target operation
  - Tell the user to open the Manual TPEN Update section and choose `Update Page`, `Update Columns`, or `Update Lines`
  - User submits that payload from the browser, which performs the fetch to TPEN

1. Authorization readiness.

- idToken is present and usable for endpoints that require auth
- If auth is missing or rejected, stop and return explicit auth failure

1. Upstream integrity.

- Canvas URI and Manifest URI are reachable
- Canvas width/height can be resolved through the documented fallback chain
- If unresolved, stop and report geometry resolution failure

## Shared Boilerplate

Apply this boilerplate in all successful workflows.

1. Load and validate context.

- Read context values
- Normalize identifiers and URIs
- Resolve Canvas dimensions in this order:
  - use canvasWidth/canvasHeight from context
  - else load canvasId and read width/height
  - else load manifestUri and find matching canvas in items by id and read width/height

1. Perform requested analysis and recognition task.

- Follow the selected workflow below
- Keep outputs structured and deterministic

1. Normalize geometry before save.

- Bounds must be saved as integer coordinates derived from Canvas dimensions
- If intermediate bounds are percent, convert them to Canvas-dimension-based integer coordinates before validation

1. Persist to TPEN.

- Use TPEN API patterns from TPEN_API.md
- For any column verification or status check, GET the Project object, locate the Page in `project.layers`, and inspect `page.columns`
- If Project reading fails, continue with line save operations when the task allows it, and omit column association
- Save Page, Lines, or Columns according to task

1. Report outcome to user.

- On success: what was saved, where, and count summary
- On failure: exact stage and error details, with next corrective action
- In browser-submit fallback mode, report which operation the user must select and the payload they should paste

## Task Workflows

### 1. Text Recognition Within Known Bounds

Use when line regions already exist and only text must be produced or revised.

Steps:

1. Input known bounds and image region references
1. Run handwriting text recognition over provided line regions
1. Produce line text candidates
1. Save text updates by line using PATCH line text endpoint when possible
1. Return success or failure with affected line IDs

Primary references:

- HANDWRITING_TEXT_RECOGNITION.md
- TPEN_API.md

### 2. Column Detection

Use when column regions are missing and need to be inferred.

Steps:

1. Retrieve the Project object and inspect `page.columns` to determine whether columns already exist
1. Analyze page layout and detect column regions in reading order
1. Build line annotation list for each detected column (in reading order)
1. Convert all detected bounds to integer coordinates based on Canvas dimensions
1. For each column, POST to `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column` with `{ label, annotations }`
1. Return success with created column count, or failure with HTTP status and cause

Expected column POST payload format:

```javascript
{
  label: "Column A",        // e.g., "Column 1", "Left Column", or auto-generated identifier
  annotations: [            // Array of annotation IDs (line refs) that belong to this column
    "line-id-1",
    "line-id-2"
  ]
}
```

See [TPEN_API.md](TPEN_API.md) for column POST endpoint details, validation rules, and error responses.

Verification rule:

- Current column state is read from the Project object, not from a separate column GET route
- Locate the page inside `project.layers[*].pages[*]`, then inspect `page.columns`
- If that Project read fails, report that column verification was unavailable and do not block line-only save behavior

Primary references:

- IMAGE_ANALYSIS.md
- TPEN_API.md (column POST operation)

### 3. Line Detection

Use when lines are missing but text recognition is not requested.

Steps:

1. Detect line regions in reading order
1. Convert bounds to integer coordinates based on Canvas dimensions
1. Build valid annotation candidates with placeholder or empty text policy as configured
1. Save to Page via PUT
1. Return success or failure with line count summary

Primary references:

- IMAGE_ANALYSIS.md
- TPEN_API.md

### 4. Column and Line Detection

Use when both structural layers are missing.

Steps:

1. Retrieve the Project object and inspect `page.columns` to determine whether columns already exist or need merge/update handling
1. Detect columns first in reading order
1. Detect lines within each column, preserving reading order
1. Build line annotations with proper bounds in integer coordinates based on Canvas dimensions
1. Resolve Canvas dimensions
1. POST each column via column API with `{ label, annotations }` where annotations are line IDs
1. Collect all line annotations and PUT them to the page via [TPEN_API.md](TPEN_API.md) PUT endpoint
1. Return success or failure with column count, line count, and HTTP status

Execution order:

- Create columns first (POST operations)
- Then create/update all lines on the page (PUT operation)
- Ensure line annotations match column annotation assignments
- If Project reading fails before column verification, skip column association and still save lines through Page PUT

Primary references:

- IMAGE_ANALYSIS.md
- TPEN_API.md (column POST and page PUT operations)

### 5. Bounds Detection Followed by Text Recognition

Use for end-to-end page transcription from image.

Steps:

1. Detect line (or column plus line) bounds
1. Perform handwriting text recognition over detected regions
1. Resolve uncertainty with conservative defaults
1. Convert all bounds to integer coordinates based on Canvas dimensions
1. Build valid annotation candidates with recognized text
1. Save Page via PUT and optionally patch specific line text updates where needed
1. Return end-to-end success or failure with counts and notable ambiguities

Primary references:

- IMAGE_ANALYSIS.md
- HANDWRITING_TEXT_RECOGNITION.md
- TPEN_API.md

## Completion Requirement

Every successful run must end with a TPEN save action and a user-visible result report.

Allowed completion outputs:

- Success: includes operation type, target object, and saved count
- Failure: includes failing stage, HTTP status or validation cause, and recommended next step
