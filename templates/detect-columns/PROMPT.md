# Task: order existing lines on a TPEN3 page into reading order and group them into columns

You are assisting with TPEN manuscript transcription. This task rebuilds the column layout on a page that already has line annotations. It has no fallback: on any precondition failure, image-analysis failure, or non-2xx response from a TPEN API call, stop and return a failure report.

## Context

- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing lines

Each entry is `<annotation-uri> | xywh=<xywh selector> | <body form>` in canvas coordinates, printed in the page's current order. Use the full annotation URI verbatim when assigning lines to columns and when echoing lines in the page PUT. Compare the current order against the reading-order sequence you compute in step 5 to decide whether the PUT in step 8 is necessary.

The body form is one of:

- `body=[]` — echo as `[]`.
- `text="<value>"` — echo as `[{ "type": "TextualBody", "value": <that value>, "format": "text/plain" }]`.
- `body=<JSON>` — echo the JSON verbatim.

{{existingLines}}

## Preconditions

All required inputs (`canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This task operates on an existing line set: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and return a failure report — this task cannot create lines.

You must have:

1. Programmatic pixel access to the full-resolution image — a numeric pixel buffer you can iterate over. A prose description of the image, or any measurement taken from a rendered or previewed image, does not qualify; previews are downsampled and visually estimated bounds will be wrong. **If you cannot obtain pixel data with the capabilities already available to you, stop now and return a failure report naming the missing capability.**
2. HTTP DELETE, POST, and PUT capability with `Content-Type: application/json` (DELETE carries no body). **If any verb is unavailable, stop now and return a failure report naming the missing capability.**

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
6. DELETE every existing column on the page (see TPEN API below). On any non-2xx, stop and report. Do not POST or PUT after a DELETE failure.
7. For each detected column, POST `{ label, annotations }` where `annotations` is the contiguous slice of the reading-order id sequence from step 5 that belongs to that column. Choose a unique label per column (e.g., `Column A`, `Column B`) that does not clash with any other label chosen in this run. On any non-2xx, stop and report — columns POSTed before the failure remain persisted.
8. Compare the step-5 sequence against the "Existing lines" order index-by-index. If they are identical, skip the PUT. Otherwise, PUT the page with `items` in the step-5 order. Each entry re-uses the existing annotation URI verbatim as its `id`, its `body` reconstructed from the entry's body form, and its `target` rebuilt from the entry's `xywh` selector. The server remaps column references when URIs change, but echoing `body` and `target` verbatim avoids minting unnecessary RERUM versions. On any non-2xx, stop and report.
9. Report: columns deleted, columns created, whether the page order was updated, and per-column line counts.

## Rules

- Preserve reading order. Columns proceed as the page is read (left→right for Latin-script layouts; adjust for script tradition).
- Prefer high recall: include borderline regions as columns when they contain text rather than silently dropping them.
- Keep column boundaries tight enough that each line clearly belongs to one column, but generous enough to avoid clipping existing line selectors.
- Column labels must be unique within this run. The DELETE in step 6 clears every existing column, so no pre-existing label can collide.
- Each existing line belongs to exactly one column.
- Do not POST a column with an empty `annotations` array — the server rejects it. If a detected column would end up with zero assigned lines, merge its assignments into the nearest populated column instead.
- Echo each line's existing `body` and `target` unchanged in the PUT. Changing either mints a new RERUM version of the line; the server remaps columns to the new URIs, but echoing verbatim avoids the needless version.

## TPEN API

First, delete all existing columns on the page. Expect `204 No Content` on success (including when the page had no columns):

```
DELETE {{pageEndpoint}}/clear-columns
Authorization: Bearer {{token}}
```

Then POST each new column — one request per column:

```
POST {{pageEndpoint}}/column
Authorization: Bearer <same token as above>
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<annotation-uri-1>", "<annotation-uri-2>", "<annotation-uri-3>"]
}
```

Each `<annotation-uri>` is the full id of an existing line listed above, used verbatim.

Finally, if step 8 determined the reading order changed, PUT the page to rewrite its canonical line order. Each `items` entry carries the existing annotation URI verbatim as `id`, its `body` reconstructed from the entry's body form in "Existing lines", and its `target` rebuilt from the entry's `xywh` selector:

```
PUT {{pageEndpoint}}
Authorization: Bearer <same token as above>
Content-Type: application/json

{
  "items": [
    {
      "id": "<existing-annotation-uri>",
      "body": <echoed body — reconstruct from this line's body form under "Existing lines">,
      "target": {
        "source": "{{canvasId}}",
        "type": "SpecificResource",
        "selector": {
          "type": "FragmentSelector",
          "conformsTo": "http://www.w3.org/TR/media-frags/",
          "value": "xywh=x,y,w,h"
        }
      }
    }
  ]
}
```

## Failure

There is no fallback. If image analysis cannot be performed or any TPEN API call returns non-2xx, stop and report:

- the failing stage (precondition, image analysis, DELETE clear-columns, POST column, or PUT page)
- HTTP status and error body when applicable
- which operations persisted before the failure (e.g., `DELETE succeeded, POST Column A succeeded, POST Column B failed`) so the resulting page state is clear

## Completion

On success, report:

- operations: `DELETE clear-columns`, `POST column` (×N), optionally `PUT page`
- targets: `{{pageEndpoint}}/clear-columns`, `{{pageEndpoint}}/column`, `{{pageEndpoint}}` (page)
- counts: columns deleted, columns created, per-column line counts
- whether the page order was updated
