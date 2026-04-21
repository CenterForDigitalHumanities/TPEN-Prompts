# Task: detect column regions on a TPEN3 page and assign existing lines to them

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

## Existing lines

Each entry is `<lineId>: <xywh selector>` in canvas coordinates. Use these ids verbatim when assigning lines to columns.

{{existingLines}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `token`, and at least one existing line. `lineCount` = `{{lineCount}}`; if this is `0`, stop immediately — this template operates on an existing line set.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it.
3. Authorization: the token shown in the POST example below must be usable for POST against the page's column endpoint.
4. HTTP POST capability with `Content-Type: application/json`.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve canvas dimensions. {{canvasDimsResolution}}
2. Fetch the page image and detect main text column regions in reading order. If the page visibly has a single text block, create one column containing every existing line id — do not subdivide.
3. For each detected column, determine which of the existing line ids (from the list above) belong to it. Assign a line to the column that contains the center point of its `xywh`. Each line belongs to exactly one column.
4. Choose a unique label per column (e.g., `Column A`, `Column B`) that does not clash with any label under "Existing columns on this page", then POST `{ label, annotations }` to the column endpoint. `annotations` is the array of line ids assigned to that column.
5. Report the count of created columns and any per-column failures.

## Rules

- Preserve reading order. Columns proceed as the page is read (left→right for Latin-script layouts; adjust for script tradition).
- Prefer high recall: include borderline regions as columns when they contain text, rather than silently dropping them.
- Keep column boundaries tight enough that each line clearly belongs to one column, but generous enough to avoid clipping existing line selectors.
- Flag ambiguous regions (e.g., marginalia that may be a column) in the report rather than silently including or excluding them.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Annotations cannot be assigned to more than one column. If a line clearly sits in an existing column, do not reassign it.

## TPEN API

Create one column:

```
POST {{pageEndpoint}}/column
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<line-id-1>", "<line-id-2>", "<line-id-3>"]
}
```

Each `<line-id>` is the trailing id segment of a line annotation listed above.

On any non-2xx response, stop the column in progress and include the HTTP status and response body in the failure report.

## Completion

On success, report:

- operation: `POST column`
- target: `{{pageEndpoint}}/column`
- count: number of columns created
- per-column line counts

On failure, report:

- the failing stage (image fetch, detection, POST)
- HTTP status and error body for any failed POST
- recommended next step (e.g., choose a different label, reassign lines)
