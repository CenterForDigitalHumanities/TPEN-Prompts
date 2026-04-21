# Task: detect columns AND lines on a TPEN3 page and save both to the page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing columns on this page

{{existingColumns}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `token`. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it.
3. Authorization: the token shown in the PUT example below must be usable for both POST (column) and PUT (page) against the page endpoints.
4. HTTP POST and PUT capability with `Content-Type: application/json`.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve canvas dimensions. {{canvasDimsResolution}}
2. Fetch the page image. Detect main text column regions in reading order first, then detect the lines inside each column (reading order preserved within each column). If the page visibly has a single text block, create one column containing every detected line — do not subdivide.
3. For every line, measure a bounding box and convert to integer canvas coordinates. Clamp to the canvas and round. Track each line's column index (an integer, 0-based) as you detect it.
4. PUT every detected line to the page endpoint in a single request (see TPEN API below). The response returns line ids in the same order as the submitted `items` — use positional mapping to recover ids per column index.
5. For each column, POST `{ label, annotations }` where `annotations` is the server-assigned line ids that belong to that column index. Labels must be unique and must not clash with anything in "Existing columns on this page".
6. Report counts: lines saved, columns created, and any failures.

## Rules

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Each line annotation belongs to at most one column.
- Preserve reading order across columns and within each column.
- Prefer high recall: include borderline columns/lines and flag them, rather than silently dropping them.
- Keep line boxes tight enough for line-level recognition but generous enough not to clip ascenders/descenders.

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

Then POST each column (reuse the same Bearer token as the PUT above):

```
POST {{pageEndpoint}}/column
Authorization: Bearer <same token as above>
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<server-line-id-1>", "<server-line-id-2>"]
}
```

On any non-2xx response, stop the operation in progress and include the HTTP status and response body in the failure report.

## Completion

On success, report:

- operations: `PUT page`, `POST column` (×N)
- target: {{pageEndpoint}} (page) and {{pageEndpoint}}/column
- counts: lines saved, columns created

On failure, report:

- the failing stage (image fetch, detection, PUT, or a specific POST)
- HTTP status and error body
- whether lines were saved even if column creation failed (partial success is acceptable — describe what persists)
