# Task: detect every text line on a TPEN3 page and save them to the page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Preconditions

All required inputs (`projectID`, `pageID`, `canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions) are provided above. You must have:

1. Vision capability: load the page image as raw bytes and measure pixel coordinates on it.
2. HTTP PUT capability with `Content-Type: application/json`.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Fetch the page image. Read its actual pixel dimensions (`img_w`, `img_h`) — the IIIF server may return a scaled rendering, not the canvas-native resolution.
2. Detect every text line in reading order and measure each line's bounding box in image-pixel space.
3. Convert every bounding box to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
4. PUT every detected line to the page endpoint in a single request (see TPEN API below). Leave `body` empty — no text yet.
5. Report count and any failure cause.

## Rules

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Preserve reading order across the whole page.
- Keep each line box tight enough for line-level recognition — do not merge adjacent lines — but generous enough not to clip ascenders/descenders.
- Prefer high recall: include borderline lines rather than silently dropping them.

## TPEN API

Save all detected lines via a single PUT. The `items` array must contain one annotation per detected line; replace `x,y,w,h` with the integer canvas coordinates computed in step 3.

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

On any non-2xx response, stop and include the HTTP status and response body in the failure report.

## Completion

On success, report:

- operation: `PUT page`
- target: {{pageEndpoint}}
- count: number of line annotations saved

On failure, report:

- the failing stage (image fetch, detection, PUT)
- HTTP status and error body
- recommended next step
