# TPEN API Usage Guide

This guide provides generic request patterns for TPEN calls that require:

- `idToken` for bearer auth
- `projectId` for project scope
- `pageId` for page scope

Use these patterns when your workflow needs to fetch context, save detected lines, or update line text.

## Common Parameters

- `TPEN.servicesURL`: base API URL (default: `https://api.t-pen.org`)
- `idToken`: bearer token from a separate secure token request
- `projectId`: TPEN project identifier
- `pageId`: TPEN page identifier
- `layerId`: TPEN layer identifier
- `lineId`: TPEN line identifier
- `canvasId`: Canvas URI in context
- `manifestUri`: Manifest URI in context (fallback source for canvas dimensions)

## Context Requirements for Geometry

Before saving annotations, bounds must be integer coordinates derived from the resolved Canvas width/height.

Required context inputs:

- `canvasId` should be present in context.
- `manifestUri` should be present in context.

Resolution order for width/height:

1. Use `canvasWidth`/`canvasHeight` in context when present.
2. Otherwise fetch `canvasId` and read `width`/`height`.
3. If Canvas URI fails or lacks `width`/`height`, fetch `manifestUri`, find the matching Canvas in `items` by `id`, and read `width`/`height` there.
4. If dimensions still cannot be resolved, fail the save operation and report an explicit error.

## Standard Headers

```javascript
const headers = {
  Authorization: `Bearer ${idToken}`
}
```

Add content type per endpoint:

- JSON payloads: `"Content-Type": "application/json"`
- Plain-text patch payload: `"Content-Type": "text/plain"`

Credential policy:

- Use bearer auth for project-scoped routes that require it.
- Only project GET and any PUT, POST requires auth by default in this workflow.
- For Canvas/Manifest fetches and other open routes, do not use a credentials header.
- Avoid `credentials: "include"` on cross-origin endpoints that return wildcard CORS headers.

## Read-Only Model Fallback (Browser Submit)

If a model can GET resources but cannot perform PUT/POST/PATCH calls itself, the model should still produce a save-ready JSON payload and a short instruction.

Fallback contract:

1. Model returns a brief instruction and one serialized JSON payload.
2. User opens the split-tool "Manual TPEN Update" section.
3. User selects one operation and pastes payload:
  - `Update Page` -> PUT `/project/:projectId/page/:pageId`
  - `Update Columns` -> `/project/:projectId/page/:pageId/column` (POST/PUT/PATCH inferred from payload shape)
  - `Update Lines` -> PATCH `/project/:projectId/page/:pageId/line/:lineId/text`
4. Browser fires authenticated fetch to TPEN using the user's token.

## GET: Project and Open Resources

Use authenticated GET for project metadata and open GET for Canvas/Manifest resources.

```javascript
const authHeaders = {
  Authorization: `Bearer ${idToken}`
}

const projectResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}`,
  { method: "GET", headers: authHeaders, credentials: "include" }
)

const pageResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/page/${pageId}`,
  { method: "GET", headers: authHeaders, credentials: "include" }
)

const canvasResponse = await fetch(
  canvasId,
  { method: "GET", headers: { Accept: "application/json" } }
)

const layerResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/layer/${layerId}`,
  { method: "GET", headers: authHeaders }
)

const manifestResponse = await fetch(
  manifestUri,
  { method: "GET", headers: { Accept: "application/json" } }
)
```

Notes:

- Check `response.ok` before parsing.
- Use `credentials: "include"` to preserve browser-session compatibility.

### Verify Current Columns From The Project Object

There is no separate documented GET column endpoint in this workflow.

To inspect current columns on a page, retrieve the Project object, find the matching Page inside `project.layers[].pages`, then read `page.columns`.

```javascript
const projectResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}`,
  {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`
    },
    credentials: "include"
  }
)

if (!projectResponse.ok) {
  throw new Error(`TPEN API ${projectResponse.status}: ${await projectResponse.text()}`)
}

const project = await projectResponse.json()
const page = project.layers
  ?.flatMap(layer => layer.pages ?? [])
  .find(candidate => candidate.id?.split("/").pop() === pageId)

if (!page) {
  throw new Error(`Page ${pageId} not found in project ${projectId}`)
}

const currentColumns = page.columns ?? []
```

Notes:

- Use the Project object when you need to verify whether columns already exist before creating or merging them.
- Column labels are page-scoped and must be unique on that page.
- `page.columns` is the authoritative source for current column membership and labels in this workflow.
- If the Project read fails, treat column verification as unavailable rather than blocking all persistence work.
- When a workflow can still save lines through Page PUT, it is acceptable to save lines without associating them to columns.

## PUT: Save Detected Lines to a Page

Use PUT to save a full updated page envelope with annotation items.

Important geometry rule:

- Save bounds as integer coordinates derived from Canvas dimensions and serialize them in `xywh=x,y,w,h` format.
- If model output is percent, convert using resolved Canvas width/height before validation and PUT.

Endpoint:

- `${TPEN.servicesURL}/project/${projectId}/page/${pageId}`

Request format:

```javascript
const payload = {
  items: [
    {
      type: "Annotation",
      "@context": "http://www.w3.org/ns/anno.jsonld",
      body: [
        {
          type: "TextualBody",
          value: "transcribed line text",
          format: "text/plain"
        }
      ],
      target: {
        source: canvasId,
        type: "SpecificResource",
        selector: {
          type: "FragmentSelector",
          conformsTo: "http://www.w3.org/TR/media-frags/",
          value: "xywh=120,340,560,42"
        }
      },
      motivation: "transcribing"
    }
  ]
}

const putResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/page/${pageId}`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    credentials: "include"
  }
)
```

## PATCH: Update Existing Line Text

Use PATCH when you need to update only a single line text.

Endpoint:

- `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/line/${lineId}/text`

Request format (plain text body):

```javascript
const textValue = "updated transcription text"

const patchResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/line/${lineId}/text`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "text/plain"
    },
    body: textValue,
    credentials: "include"
  }
)
```

## POST/PUT/PATCH: Column Operations

Use these endpoints to manage columns on a page. Columns group line annotations into logical structural units (e.g., physical columns in a multi-column page).

Column association is best-effort when it depends on reading current page state from the Project object. If Project lookup fails, do not treat that failure as blocking for line-only persistence.

### POST: Create a New Column

Endpoint:

- `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column`

Request format:

```javascript
const payload = {
  label: "Column A",  // Human-readable label for the column
  annotations: [      // Array of annotation IDs (lines) belonging to this column
    "annotation-id-1",
    "annotation-id-2",
    "annotation-id-3"
  ]
}

const postResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    credentials: "include"
  }
)

```

Response (201 Created):

```javascript
{
  _id: "column-record-id",
  label: "Column A",
  lines: ["annotation-id-1", "annotation-id-2", "annotation-id-3"]
}
```

Validation rules:

- `label` must be a non-empty string and unique on the page (no duplicate labels)
- `annotations` must be a non-empty array of existing annotation IDs on the page
- Annotations can be reassigned between columns (automatically removed from previous column assignments if fully transferred)

### PUT: Merge Multiple Columns

Endpoint:

- `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column`

Request format:

```javascript
const payload = {
  newLabel: "Merged Column",             // Label for the new merged column
  columnLabelsToMerge: ["Column A", "Column B"]  // Labels of columns to merge
}

const putResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    credentials: "include"
  }
)
```

Response (200 OK):

```javascript
{
  _id: "merged-column-record-id",
  label: "Merged Column",
  lines: ["annotation-id-1", "annotation-id-2", "annotation-id-3", "annotation-id-4"]
}
```

Validation rules:

- `newLabel` must be a non-empty string and unique on the page
- `columnLabelsToMerge` must contain at least 2 labels
- All specified columns must exist on the page
- Annotations from the merged columns cannot conflict with other columns

### PATCH: Add Annotations to Existing Column

Endpoint:

- `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column`

Request format:

```javascript
const payload = {
  columnLabel: "Column A",           // Label of the column to update
  annotationIdsToAdd: [              // Annotation IDs to add to this column
    "annotation-id-4",
    "annotation-id-5"
  ]
}

const patchResponse = await fetch(
  `${TPEN.servicesURL}/project/${projectId}/page/${pageId}/column`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    credentials: "include"
  }
)
```

Response (200 OK):

```javascript
{
  message: "Column updated successfully."
}
```

Validation rules:

- `columnLabel` must match an existing column on the page
- `annotationIdsToAdd` must be a non-empty array of existing annotation IDs on the page
- Annotations cannot already be assigned to other columns (prevents duplicate assignments across columns)

## Error Handling Pattern

```javascript
const toError = async (response) => {
  const text = await response.text()
  throw new Error(`TPEN API ${response.status}: ${text}`)
}

if (!response.ok) {
  await toError(response)
}
```

## Workflow Summary

1. Resolve `idToken` securely and keep it out of logs.
2. Resolve `projectId` and `pageId` from current context.
3. Optionally GET project/page/layer objects for canonical state.
4. Build valid payloads and submit via PUT (annotations), PATCH (line text), or POST/PUT/PATCH (column operations).
5. Check status, parse response, and report success/failure.
