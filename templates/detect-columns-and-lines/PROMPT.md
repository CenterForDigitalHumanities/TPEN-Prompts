# Task: detect columns AND lines on a TPEN3 page and save both to the page

You are assisting with TPEN manuscript transcription.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Manifest: {{manifestUri}}
- User Agent URI: {{userAgentURI}}
- Page endpoint: {{pageEndpoint}}

## Existing columns on this page

{{existingColumns}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it. If not, stop and report.

**Capability check.** Before anything else, decide whether you can issue an authenticated HTTP request with `Authorization: Bearer {{token}}`. If yes, follow `## TPEN API` below. If no, skip straight to `## Fallback` — do not attempt curl/wget substitutes, do not narrate the limitation, do not partially execute the direct path.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image. Detect column regions in reading order first, then detect the lines inside each column (reading order preserved within each column).
3. For every line, measure a bounding box and convert to integer canvas coordinates. Clamp to the canvas and round.
4. Submit the lines per `## TPEN API` below and capture the server-assigned annotation ids from the response.
5. POST each column with `{ label, annotations }` using the server-assigned line ids from step 4.

## Rules

- Preserve reading order across columns and within each column.
- Prefer high recall: include borderline columns/lines and flag them, rather than silently dropping them.
- Keep line boxes tight enough for line-level recognition but generous enough not to clip ascenders/descenders.
- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Each line annotation belongs to at most one column.

## TPEN API

Save all lines via a single PUT:

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

Then POST each column:

```
POST {{pageEndpoint}}/column
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<server-line-id-1>", "<server-line-id-2>"]
}
```

## Fallback

If the capability check failed, include the `PUT page` body shown in `## TPEN API` above in your report as a fenced JSON code block — lines only, no columns. The paste flow cannot round-trip server-assigned line ids, so column segmentation is skipped in fallback; detect lines in global page reading order. Payload only, not the HTTP verb line, not the `Authorization` header. The user copies the JSON out of the code block and pastes it into the splitscreen fallback panel.

## Completion

Report what was persisted and flag anything ambiguous, illegible, or unresolved for human review. In the fallback path, the report must include the full JSON payload (per `## Fallback`) — that is the paste-ready deliverable for the user.
