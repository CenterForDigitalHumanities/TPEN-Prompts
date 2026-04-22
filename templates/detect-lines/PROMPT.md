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

1. Programmatic pixel access to the full-resolution image — a numeric pixel buffer you can iterate over. A prose description of the image, or any measurement taken from a rendered or previewed image, does not qualify; previews are downsampled and visually estimated bounds will be wrong. **If you cannot obtain pixel data with the capabilities already available to you, stop now and return a failure report naming the missing capability.**
2. HTTP PUT capability with `Content-Type: application/json`.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities. If a required capability is missing, stop and return a failure report naming it rather than installing anything.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, prefer a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. When you need to inspect a specific region at full fidelity, request it server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. If you measured coordinates inside a region crop, add the crop's `x,y` origin back before applying the canvas conversion below.
2. Detect text lines across the whole page in reading order. This task does not create TPEN columns.
3. For every line, measure a bounding box in image-pixel space and convert to integer canvas coordinates using:
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
- Lines must be tight. Bound the actual text stroke run and nothing more. Never emit a single line that covers what a human reader would call two or more lines; when uncertain whether a tall run is one line or several, split it.
- Do not include decorative borders, frame rules, ornaments, illustrations, or the inter-line whitespace above/below text as part of a line.

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
