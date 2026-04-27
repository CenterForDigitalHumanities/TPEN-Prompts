# Task: detect columns AND lines on a TPEN3 page and save both to the page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as a fallback JSON payload for the user to paste.

## Context

- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing columns on this page

{{existingColumns}}

## Preconditions

All required inputs (`canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions) are provided above. This template only creates new lines: `lineCount` = `{{lineCount}}`. If `lineCount` is not `0`, stop immediately and report — existing line data must not be modified.

You must have:

1. Ability to fetch the image bytes (or a derivative) and identify line and column bounds from them. Precise pixel measurement is preferred when available; visual estimation from the fetched image is acceptable otherwise.
2. Either HTTP PUT and POST capability with `Content-Type: application/json`, or the ability to emit the lines-only payload as a fallback JSON code block in your report. If either verb is unavailable, skip straight to the Fallback section — do not retry. Column creation has no fallback; it is dropped when the fallback path is taken.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, fetch a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. If you have precise pixel tooling and want tighter bounds on a region, request it server-side as `{base}/x,y,w,h/max/0/default.jpg` and add the crop's `x,y` origin back before applying the canvas conversion below. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes.
2. Detect main text column regions in reading order first, then detect the lines inside each column (reading order preserved within each column). If the page visibly has a single text block, create one column containing every detected line — do not subdivide. Track each line's column index (an integer, 0-based) as you detect it. Then flatten into a single global reading-order sequence across columns (column-major: every line in the first column, then the second, etc., adjusted for script tradition).
3. For every line, measure a bounding box in image-pixel space and convert to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp `x,y,w,h` so that `0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`.
4. If HTTP PUT and POST are available, build the full payload under **TPEN API** and PUT the items once in the global reading-order sequence from step 2. If the PUT returns non-2xx, stop and fall back — lines are not persisted yet. If the PUT succeeds, for each column POST `{ label, annotations }` where `annotations` is the contiguous slice of that column's lines from the PUT response. The PUT response's `items` array is guaranteed to be in the same order as the submitted items, so use each line's column index from step 2 to slice the returned ids. Labels must be unique and must not clash with anything in "Existing columns on this page". If a column POST returns non-2xx, stop and report the partial state — do not emit a fallback payload; lines are already saved.
5. If the PUT in step 4 failed, emit the condensed payload under **Fallback** as the final code block. Column creation is out of scope for the fallback path.
6. Report counts (lines saved/in payload, columns created/in payload) and which path was used (direct or fallback).

## Rules

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Each line annotation belongs to at most one column.
- Preserve reading order across columns and within each column.
- Line geometry is the primary accuracy target. Column grouping is secondary — for a single-column page, one column containing every line is correct.
- Prefer tight bounds when you can measure them; best-effort bounds are acceptable. When uncertain whether a tall run is one line or several, prefer splitting over merging.
- Do not include decorative borders, frame rules, ornaments, or illustrations as part of a line.
- Do not POST a column with an empty `annotations` array — the server rejects it. Skip any detected column that ends up with zero assigned lines.
- Completion beats refusal: approximate bounds on most lines are more useful than nothing — this data will be reviewed and corrected downstream.
- Zero lines detected is an unprocessable outcome. Stop and report — do not PUT, do not POST a column, do not emit a fallback payload. An empty `items` array would erase every existing annotation on the page.

## TPEN API

Save all detected lines via a single PUT. The `items` array must contain one annotation per detected line, in the global reading-order sequence from step 2; replace `x,y,w,h` with the integer canvas coordinates computed in step 3.

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
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
  "annotations": ["<server-line-uri-1>", "<server-line-uri-2>"]
}
```

## Fallback

When the direct path is unavailable or returns non-2xx, emit the condensed payload below as the final code block of your report, in the global reading-order sequence from step 2. The TPEN splitscreen tool expands each item into a full W3C Annotation before PUTting it — do not inline the canvas source, selector boilerplate, or motivation. It must be valid JSON. Column creation is out of scope for this fallback.

```
{
  "items": [
    { "target": "xywh=x,y,w,h" }
  ]
}
```

One item per detected line, in the global reading-order sequence. `target` is the bare selector value (no `#`, no `pixel:` prefix). `body` is omitted because no text is produced by this task.

## Completion

Direct path, report:

- operations: `PUT page`, `POST column` (×N)
- target: {{pageEndpoint}} (page) and {{pageEndpoint}}/column
- counts: lines saved, columns created
- whether lines were saved even if a column POST failed (partial success is acceptable — describe what persists)

Fallback path, report:

- path: `fallback`
- counts: lines in payload
- HTTP status and error body if a PUT was attempted first
- final code block: the condensed `{ "items": [...] }` JSON for the user to paste
