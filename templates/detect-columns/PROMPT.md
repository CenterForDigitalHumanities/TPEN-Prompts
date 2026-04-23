# Task: detect column regions on a TPEN3 page and assign existing lines to them

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as fallback JSON payloads for the user to paste.

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

1. Programmatic pixel access to the full-resolution image — a numeric pixel buffer you can iterate over. A prose description of the image, or any measurement taken from a rendered or previewed image, does not qualify; previews are downsampled and visually estimated bounds will be wrong. **If you cannot obtain pixel data with the capabilities already available to you, stop now and return a failure report naming the missing capability.** This precondition is hard — fallback does not rescue missing vision.
2. Either HTTP PUT and POST capability with `Content-Type: application/json`, or the ability to emit the payloads as fallback JSON code blocks in your report. If either verb is unavailable, skip straight to the Fallback section — do not retry.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

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
5. Build a global reading-order sequence of all existing line ids: columns in reading order; within each column, lines sorted top-to-bottom by the `xywh` y-center.
6. Build the `{ "items": [...] }` payload described under TPEN API from that sequence. Each `items` entry re-uses the existing annotation URI verbatim as its `id` — the server preserves ids (and any already-attached body text) rather than minting new ones.
7. Build the column payload `[{ label, annotations }, ...]` where each `annotations` array is the contiguous slice of the reading-order id sequence that belongs to that column. Choose a unique label per column (e.g., `Column A`, `Column B`) that does not clash with any label under "Existing columns on this page". Both the direct and fallback paths use the same ids — the existing annotation URIs listed above — so the same column payload works in either path.
8. If HTTP PUT and POST are available: PUT the page once, then POST each column once. On any non-2xx, stop and fall back for whatever has not yet persisted. Otherwise go directly to the Fallback.
9. Report counts (columns created or in payload) and which path was used.

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

## Fallback

When the direct path is unavailable or returns non-2xx, emit two final code blocks in your report, in order:

1. The `{ "items": [...] }` body from TPEN API — the reading-order reorder of existing lines.
2. The `[{ "label": "…", "annotations": [ "<annotation-uri>", … ] }, …]` column array — one entry per detected column, annotations drawn verbatim from "Existing lines".

Both must be valid JSON. The user pastes each block into the TPEN splitscreen tool; the tool PUTs the first block with their authorized token, then POSTs each column from the second block in one paste.

## Completion

Direct path, report:

- operations: `PUT page`, `POST column` (×N)
- target: {{pageEndpoint}} (page) and `{{pageEndpoint}}/column`
- count: number of columns created
- per-column line counts

Fallback path, report:

- path: `fallback`
- counts: columns in payload, per-column line counts
- HTTP status and error body if a request was attempted first
- final code blocks (in order): the `{ "items": [...] }` JSON, then the `[{label, annotations}, ...]` column JSON, for the user to paste
