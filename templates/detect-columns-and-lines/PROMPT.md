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

All required inputs (`projectID`, `pageID`, `canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions) are provided above. You must have:

1. Vision capability: load the page image as raw bytes and measure coordinates programmatically from the full-resolution pixel data. Any image preview rendered back to you is downsampled — never read coordinates off a previewed image by eye.
2. HTTP POST and PUT capability with `Content-Type: application/json`.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities (`pip`, `npm`, `apt`, `brew`, `cargo`, `--break-system-packages`, etc.) — if a required capability is missing, stop and return a failure report naming it rather than installing anything.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, prefer a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. When you need to inspect a specific region at full fidelity, request it server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. If you measured coordinates inside a region crop, add the crop's `x,y` origin back before applying the canvas conversion below.
2. Detect main text column regions in reading order first, then detect the lines inside each column (reading order preserved within each column). If the page visibly has a single text block, create one column containing every detected line — do not subdivide. Track each line's column index (an integer, 0-based) as you detect it.
3. For every line, measure a bounding box in image-pixel space and convert to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
4. PUT every detected line to the page endpoint in a single request (see TPEN API below). The response returns line ids in the same order as the submitted `items` — use positional mapping to recover ids per column index.
5. For each column, POST `{ label, annotations }` where `annotations` is the server-assigned line ids that belong to that column index. Labels must be unique and must not clash with anything in "Existing columns on this page".
6. Report counts: lines saved, columns created, and any failures.

## Rules

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Each line annotation belongs to at most one column.
- Preserve reading order across columns and within each column.
- Prefer high recall: include borderline columns/lines rather than silently dropping them.
- Keep line boxes tight enough for line-level recognition but generous enough not to clip ascenders/descenders.

## TPEN API

Save all lines via a single PUT. The `items` array must contain one annotation per detected line; replace `x,y,w,h` with the integer canvas coordinates computed in step 3.

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
