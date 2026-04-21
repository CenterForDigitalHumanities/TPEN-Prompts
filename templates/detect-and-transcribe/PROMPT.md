# Task: detect and transcribe every text line on a TPEN3 page end-to-end

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

1. Vision capability: load the page image as raw bytes, measure pixel coordinates, and crop/inspect per-line regions.
2. HTTP PUT capability with `Content-Type: application/json`.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Fetch the page image. Read its actual pixel dimensions (`img_w`, `img_h`) — the IIIF server may return a scaled rendering, not the canvas-native resolution. Detect every text line in reading order and measure each line's bounding box in image-pixel space.
2. Convert every bounding box to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
3. Run handwriting text recognition on each line's crop. Apply the recognition rules below.
4. Build one Annotation per line with the recognized text as the `TextualBody` value and `xywh=x,y,w,h` (integer canvas coordinates).
5. PUT the full set of line annotations to the page endpoint in a single request.
6. Report counts (lines saved) and notable ambiguities (e.g., illegible lines transcribed as empty or flagged).

## Rules

### Detection (IMAGE_ANALYSIS)

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Preserve reading order. Prefer high recall for likely text lines over aggressive pruning.
- Keep line boxes tight but do not clip ascenders/descenders.
- Include borderline regions rather than silently dropping them.

### Recognition (HANDWRITING_TEXT_RECOGNITION)

- Prioritize diplomatic transcription over normalization.
- Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Keep line segmentation stable even when text is partially uncertain.
- If a crop is fully illegible, save the annotation with an empty text body and flag the line id in the report — do not fabricate text.

## TPEN API

Save every detected line with its transcription in a single PUT. The `items` array must contain one annotation per detected line; replace `x,y,w,h` with the integer canvas coordinates computed in step 2, and `<recognized line text>` with the recognized text (empty string for fully illegible lines).

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

On any non-2xx response, stop the operation in progress and include the HTTP status and response body in the failure report.

## Completion

On success, report:

- operation: `PUT page`
- target: {{pageEndpoint}}
- counts: lines saved, lines with non-empty text, lines flagged uncertain
- notable ambiguities worth a human review

On failure, report:

- the failing stage (image fetch, detection, recognition, PUT)
- HTTP status and error body
- recommended next step
