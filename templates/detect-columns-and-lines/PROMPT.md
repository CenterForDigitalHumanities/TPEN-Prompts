# Task: detect columns AND lines on a TPEN3 page and save both to the page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Manifest: {{manifestUri}}
- User Agent URI: {{userAgentURI}}
- Page endpoint: {{pageEndpoint}}

## Existing columns on this page

{{existingColumns}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it.
3. Authorization: `{{token}}` is present and trusted — it will be used to persist the result on your behalf.

If any precondition fails, stop and return a concise failure report. Missing HTTP-write capability is not a failure; it triggers the fallback below.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image. Detect column regions in reading order first, then detect the lines inside each column (reading order preserved within each column).
3. For every line, measure a bounding box and convert to integer canvas coordinates. Clamp to the canvas and round.
4. Mint a stable local id for each line (for example, `line-1`, `line-2`, …) so you can reference them in column `annotations` arrays before the PUT assigns real ids. After the PUT, use the server-assigned ids when creating columns. Main-path only — in fallback there is no server-id round-trip, so columns are dropped (see Fallback).
5. PUT every detected line to the page endpoint (see TPEN API below). Capture the server-assigned annotation ids from the response.
6. For each column, POST `{ label, annotations }` where `annotations` is the server-assigned line ids that belong to that column. Labels must be unique and must not clash with anything in "Existing columns on this page".
7. Report counts: lines saved, columns created, and any failures.

## Rules

- Preserve reading order across columns and within each column.
- Prefer high recall: include borderline columns/lines and flag them, rather than silently dropping them.
- Keep line boxes tight enough for line-level recognition but generous enough not to clip ascenders/descenders.
- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Each line annotation belongs to at most one column.

## TPEN API

Save all lines via a single PUT:

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
      "type": "Annotation",
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "body": [],
      "target": {
        "source": "{{canvasId}}",
        "type": "SpecificResource",
        "selector": {
          "type": "FragmentSelector",
          "conformsTo": "http://www.w3.org/TR/media-frags/",
          "value": "xywh=x,y,w,h"
        }
      },
      "motivation": "transcribing"
    }
  ]
}
```

Then POST each column:

```
POST {{pageEndpoint}}/column
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<server-line-id-1>", "<server-line-id-2>"]
}
```

Error handling (both calls):

```javascript
if (!response.ok) {
    throw new Error(`TPEN API ${response.status}: ${await response.text()}`)
}
```

## Completion

On success, report:

- operations: `PUT page`, `POST column` (×N)
- target: `{{pageEndpoint}}` and `{{pageEndpoint}}/column`
- counts: lines saved, columns created

On failure, report:

- the failing stage (image fetch, detection, PUT, or a specific POST)
- HTTP status and error body
- whether lines were saved even if column creation failed (partial success is acceptable — describe what persists)

## Fallback

If you cannot issue the PUT yourself: skip column segmentation entirely (columns require a server-id round-trip not available in the paste flow) and detect lines in global page reading order. Emit the full `{ "items": [ … ] }` body above as a single JSON code block — a human will submit it via the host tool. Do not fabricate geometry when vision or context is missing; that still stops the task.
