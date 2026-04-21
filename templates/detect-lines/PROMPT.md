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

1. Required context present: `projectID`, `pageID`, `canvasId`, `token`. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it.
3. Authorization: the token shown in the PUT example below must be usable for PUT against the page endpoint.
4. HTTP PUT capability with `Content-Type: application/json`.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve canvas dimensions. {{canvasDimsResolution}}
2. Fetch the page image and detect every text line in reading order.
3. For each detected line, measure a bounding box and convert to integer canvas coordinates. Clamp to the canvas and round.
4. PUT every detected line to the page endpoint in a single request (see TPEN API below). Leave `body` empty — no text yet.
5. Report count and any failure cause.

## Rules

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Preserve reading order across the whole page.
- Keep each line box tight enough for line-level recognition — do not merge adjacent lines — but generous enough not to clip ascenders/descenders.
- Prefer high recall: include borderline lines and flag them, rather than silently dropping them.

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
