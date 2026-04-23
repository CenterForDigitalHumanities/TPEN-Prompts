# Task: detect every text line on a TPEN3 page and save them to the page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as a fallback JSON payload for the user to paste.

## Context

- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Preconditions

All required inputs (`canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions) are provided above. You must have:

1. Ability to fetch the image bytes (or a derivative) and identify line bounds from them. Precise pixel measurement is preferred when available; visual estimation from the fetched image is acceptable otherwise.
2. Either HTTP PUT capability with `Content-Type: application/json`, or the ability to emit the payload as a fallback JSON code block in your report. If HTTP PUT is not available, skip straight to the Fallback section — do not retry.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, fetch a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. If you have precise pixel tooling and want tighter bounds on a region, request it server-side as `{base}/x,y,w,h/max/0/default.jpg` and add the crop's `x,y` origin back before applying the canvas conversion below. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes.
2. Detect text lines across the whole page in reading order. This task does not create TPEN columns.
3. For every line, measure a bounding box in image-pixel space and convert to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
4. Build the `{ "items": [...] }` payload described under TPEN API. Leave `body` empty — no text yet.
5. If HTTP PUT is available, send the request once. On any non-2xx response, do not retry — fall back. If HTTP PUT is unavailable from the start, go directly to the fallback.
6. Report count and which path was used (direct PUT or fallback).

## Rules

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Preserve reading order across the whole page.
- Prefer tight bounds when you can measure them; best-effort bounds are acceptable. When uncertain whether a tall run is one line or several, prefer splitting over merging.
- Do not include decorative borders, frame rules, ornaments, or illustrations as part of a line.
- Completion beats refusal: approximate bounds on most lines are more useful than nothing — this data will be reviewed and corrected downstream.

## TPEN API

Save all detected lines via a single PUT. The `items` array must contain one annotation per detected line; replace `x,y,w,h` with the integer canvas coordinates computed in step 3.

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

## Fallback

When the direct PUT is impossible or returns non-2xx, emit the `{ "items": [...] }` body from TPEN API as the final code block of your report. It must be valid JSON (no comments, no placeholders — substitute the real coordinates). The user will paste it into the TPEN splitscreen tool, which submits it with their authorized token.

## Completion

Direct PUT path, report:

- operation: `PUT page`
- target: {{pageEndpoint}}
- count: number of line annotations saved

Fallback path, report:

- path: `fallback`
- count: number of line annotations in the payload
- HTTP status and error body if a PUT was attempted first
- final code block: the full `{ "items": [...] }` JSON for the user to paste
