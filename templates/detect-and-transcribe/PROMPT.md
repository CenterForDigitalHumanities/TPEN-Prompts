# Task: detect and transcribe every text line on a TPEN3 page end-to-end

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
2. Vision capability: you must be able to load the page image as raw bytes, measure pixel coordinates, and crop/inspect per-line regions.
3. Authorization: `{{token}}` is present and trusted — it will be used to persist the result on your behalf.

If any precondition fails, stop and return a concise failure report. Missing HTTP-write capability is not a failure; it triggers the fallback below.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image. Detect every text line in reading order.
3. For each line, measure a bounding box and convert to integer canvas coordinates. Clamp to the canvas and round.
4. Run handwriting text recognition on each line's crop. Apply the recognition rules below.
5. Build one Annotation per line with the recognized text as the `TextualBody` value and `xywh=x,y,w,h` (integer canvas coordinates).
6. PUT the full set of line annotations to the page endpoint in a single request. Text rides in each item's `body: [TextualBody]` — no follow-up PATCH is needed.
7. Report counts (lines saved) and notable ambiguities (e.g., illegible lines transcribed as empty or flagged).

## Rules

### Detection (IMAGE_ANALYSIS)

- Preserve reading order. Prefer high recall for likely text lines over aggressive pruning.
- Keep line boxes tight but do not clip ascenders/descenders.
- Flag ambiguous regions in the report rather than silently dropping them.
- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.

### Recognition (HANDWRITING_TEXT_RECOGNITION)

- Prioritize diplomatic transcription over normalization.
- Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Keep line segmentation stable even when text is partially uncertain.
- If a crop is fully illegible, save the annotation with an empty text body and flag the line id in the report — do not fabricate text.

## TPEN API

Save every detected line with its transcription in a single PUT:

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
      "type": "Annotation",
      "@context": "http://www.w3.org/ns/anno.jsonld",
      "body": [{ "type": "TextualBody", "value": "<recognized line text>", "format": "text/plain" }],
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
- counts: lines saved, lines with non-empty text, lines flagged uncertain
- notable ambiguities worth a human review

On failure, report:

- the failing stage (image fetch, detection, recognition, PUT)
- HTTP status and error body
- recommended next step

## Fallback

If you cannot issue the PUT yourself, complete detection and recognition through payload construction and emit the full `{ "items": [ … ] }` body above as a single JSON code block — a human will submit it via the host tool. Do not fabricate geometry or transcriptions when vision or context is missing; that still stops the task.
