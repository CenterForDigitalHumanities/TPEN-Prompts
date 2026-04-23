# Task: detect and transcribe every text line on a TPEN3 page end-to-end

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

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes, measure pixel coordinates, and inspect for line-by-line text as a means of textual transcription.

If any precondition fails, stop and return a concise failure report.

**Capability check.** Before anything else, decide whether you can issue an authenticated HTTP request with `Authorization: Bearer {{token}}`. If yes, follow `## TPEN API` below. If no, skip straight to `## Fallback` — do not attempt curl/wget substitutes, do not narrate the limitation, do not partially execute the direct path.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image. Detect every text line in reading order.
3. For each line, measure a bounding box and convert to integer canvas coordinates. Clamp to the canvas and round.
4. Run handwriting text recognition on each line's crop. Apply the recognition rules below.
5. Build one Annotation per line using the shape defined in `## TPEN API` below, with the recognized text as the `TextualBody` value and `xywh=x,y,w,h` in integer canvas coordinates.
6. Submit the full set of line annotations via the path chosen by the Capability check.

## Rules

### Detection

- Preserve reading order. Prefer high recall for likely text lines over aggressive pruning.
- Keep line boxes tight but do not clip ascenders/descenders.
- Flag ambiguous regions in the report rather than silently dropping them.
- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.

### Recognition

- Identify the script and language from the image before transcribing; apply the paleographic conventions standard to that tradition.
- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Mark uncertain glyphs with an explicit uncertainty convention (for example `[a?]` for Latin scripts, or an equivalent for the detected tradition). Do not force certainty.
- Do not invent expansions. When a suspension, contraction, or ligature marker is present, transcribe the marker itself; do not silently expand.
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

## Fallback

If the capability check failed, the concrete payload for the splitscreen panel is the request body shown in `## TPEN API` above, with all fields filled in from your analysis.

Emit only the JSON — not the HTTP verb line, not the `Authorization` header.

In the fallback path, your entire final response must be that JSON payload and nothing else — no prose before or after — because the host tool does `JSON.parse` on the pasted text.

## Completion

After the direct-API path, report what was persisted and flag anything ambiguous, illegible, or unresolved for human review. In the fallback path, your entire response is the JSON payload (per `## Fallback`) — no report.
