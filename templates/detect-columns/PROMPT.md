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

All required inputs (`projectID`, `pageID`, `canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This template operates on an existing line set: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and report.

You must have:

1. Vision capability: load the page image as raw bytes and measure pixel coordinates on it.
2. HTTP POST capability with `Content-Type: application/json`.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Fetch the page image. Read its actual pixel dimensions (`img_w`, `img_h`) — the IIIF server may return a scaled rendering, not the canvas-native resolution.
2. Detect main text column regions in reading order in image-pixel space. If the page visibly has a single text block, create one column containing every existing line id — do not subdivide.
3. Convert every detected column region to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
4. For each detected column, determine which of the existing line ids (from the list above) belong to it. Assign a line to the column whose canvas-space region contains the center point of the line's `xywh`. If a line's center falls outside every detected column, assign it to the nearest column by Euclidean distance from the center point to the column's region (distance `0` when the point is inside). Each line belongs to exactly one column.
5. Choose a unique label per column (e.g., `Column A`, `Column B`) that does not clash with any label under "Existing columns on this page", then POST `{ label, annotations }` to the column endpoint. `annotations` is the array of line ids assigned to that column.
6. Report the count of created columns and any per-column failures.

## Rules

- Preserve reading order. Columns proceed as the page is read (left→right for Latin-script layouts; adjust for script tradition).
- Prefer high recall: include borderline regions as columns when they contain text rather than silently dropping them.
- Keep column boundaries tight enough that each line clearly belongs to one column, but generous enough to avoid clipping existing line selectors.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Annotations cannot be assigned to more than one column. If a line clearly sits in an existing column, do not reassign it.

## TPEN API

Create one POST per detected column. Each `annotations` array contains the line ids assigned to that column in step 4, taken verbatim from the "Existing lines" list above (trailing id segment only).

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
