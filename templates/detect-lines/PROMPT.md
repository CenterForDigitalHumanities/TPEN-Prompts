# Task: detect every text line on a TPEN3 page and save them to the page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Manifest: {{manifestUri}}
- User Agent URI: {{userAgentURI}}
- Page endpoint: {{pageEndpoint}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it.
3. Authorization: `{{token}}` is present and trusted — it will be used to persist the result on your behalf.

If any precondition fails, stop and return a concise failure report. Missing HTTP-write capability is not a failure; it triggers the fallback below.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image and detect every text line in reading order (top→bottom within a column, columns left→right unless the script tradition dictates otherwise).
3. For each detected line, measure a bounding box on the image and convert it to canvas coordinates. Clamp to the canvas: `x ≥ 0`, `y ≥ 0`, `x + w ≤ canvasWidth`, `y + h ≤ canvasHeight`. Round to integers after clamping.
4. Build one Annotation per line using the shape below, with `body` as an empty array (no text yet) and `value` as `xywh=x,y,w,h` in integer canvas coordinates.
5. PUT the full set of line annotations to the page endpoint.
6. Report count and any failure cause.

## Rules

- Preserve reading order across the whole page.
- Prefer high recall: a marginal or faint line that might carry text should be included and flagged, not silently dropped.
- Keep each line box tight enough for line-level recognition — do not merge adjacent lines — but generous enough not to clip ascenders/descenders.
- Flag ambiguous regions in the report rather than silently merging or dropping.
- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.

## TPEN API

Save all detected lines via a single PUT:

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

Error handling:

```javascript
if (!response.ok) {
    throw new Error(`TPEN API ${response.status}: ${await response.text()}`)
}
```

## Completion

On success, report:

- operation: `PUT page`
- target: `{{pageEndpoint}}`
- count: number of line annotations saved

On failure, report:

- the failing stage (image fetch, detection, PUT)
- HTTP status and error body
- recommended next step

## Fallback

If you cannot issue the PUT yourself, complete detection through payload construction and emit the full `{ "items": [ … ] }` body above as a single JSON code block — a human will submit it via the host tool. Do not fabricate geometry when vision or context is missing; that still stops the task.
