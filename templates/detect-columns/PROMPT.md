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

Each entry is `<annotation-uri>: <xywh selector>` in canvas coordinates. Use the full annotation URI verbatim when assigning lines to columns.

{{existingLines}}

## Preconditions

All required inputs (`projectID`, `pageID`, `canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This template operates on an existing line set: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and report.

You must have:

1. Programmatic pixel access to the full-resolution image — a numeric pixel buffer you can iterate over. A prose description of the image, or any measurement taken from a rendered or previewed image, does not qualify; previews are downsampled and visually estimated bounds will be wrong. **If you cannot obtain pixel data with the capabilities already available to you, stop now and return a failure report naming the missing capability.**
2. HTTP PUT and POST capability with `Content-Type: application/json`.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities. If a required capability is missing, stop and return a failure report naming it rather than installing anything.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, prefer a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. When you need to inspect a specific region at full fidelity, request it server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. If you measured coordinates inside a region crop, add the crop's `x,y` origin back before applying the canvas conversion below.
2. Detect main text column regions in reading order in image-pixel space. If the page visibly has a single text block, create one column containing every existing line id — do not subdivide.
3. Convert every detected column region to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
4. For each detected column, determine which of the existing line ids (from the list above) belong to it. Assign a line to the column whose canvas-space region contains the center point of the line's `xywh`. If a line's center falls outside every detected column, assign it to the nearest column by Euclidean distance from the center point to the column's region (distance `0` when the point is inside). Each line belongs to exactly one column.
5. Build a global reading-order sequence of all existing line ids: columns in reading order; within each column, lines sorted top-to-bottom by the `xywh` y-center. Then PUT the page with `items` in that order so the page's canonical line list matches reading order (see TPEN API below). Each `items` entry re-uses the existing annotation URI verbatim as its `id` — the server preserves ids (and any already-attached body text) rather than minting new ones.
6. For each column, POST `{ label, annotations }` to the column endpoint. `annotations` is the contiguous slice of the reading-order id sequence that belongs to that column. Choose a unique label per column (e.g., `Column A`, `Column B`) that does not clash with any label under "Existing columns on this page".
7. Report the count of created columns and any per-column failures.

## Rules

- Preserve reading order. Columns proceed as the page is read (left→right for Latin-script layouts; adjust for script tradition).
- Prefer high recall: include borderline regions as columns when they contain text rather than silently dropping them.
- Keep column boundaries tight enough that each line clearly belongs to one column, but generous enough to avoid clipping existing line selectors.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Annotations cannot be assigned to more than one column. If a line clearly sits in an existing column, do not reassign it.
- Do not POST a column with an empty `annotations` array — the server rejects it. Skip any detected column that ends up with zero assigned lines.
- The PUT `items` order defines the page's reading order; column `annotations` slices must match that same order.
- The PUT must carry every existing line id exactly once. Do not drop, duplicate, or mint new ids; do not modify `body` or `target`.

## TPEN API

First, reorder the page's line list via a single PUT. The `items` array must contain every existing line — each entry carrying the existing annotation URI verbatim as `id` — in the reading-order sequence from step 5. Reuse each line's original `target` (the `xywh` selector listed under "Existing lines") unchanged.

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
      "id": "<existing-annotation-uri>",
      "type": "Annotation",
      "@context": "http://www.w3.org/ns/anno.jsonld",
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

Then create one POST per detected column. Each `annotations` array is a contiguous slice of the reading-order id sequence, taken verbatim from the "Existing lines" list.

```
POST {{pageEndpoint}}/column
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<annotation-uri-1>", "<annotation-uri-2>", "<annotation-uri-3>"]
}
```

Each `<annotation-uri>` is the full id of a line annotation listed above, used verbatim.

On any non-2xx response, stop the operation in progress and include the HTTP status and response body in the failure report.

## Completion

On success, report:

- operations: `PUT page`, `POST column` (×N)
- target: {{pageEndpoint}} (page) and `{{pageEndpoint}}/column`
- count: number of columns created
- per-column line counts

On failure, report:

- the failing stage (image fetch, detection, PUT, or a specific POST)
- HTTP status and error body
- recommended next step (e.g., choose a different label, reassign lines)
