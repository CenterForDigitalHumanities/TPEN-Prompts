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

1. Vision capability: load the page image as raw bytes, measure pixel coordinates programmatically from the full-resolution data, and crop/inspect per-line regions. Any image preview rendered back to you is downsampled — never read coordinates off a previewed image by eye.
2. HTTP PUT capability with `Content-Type: application/json`.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities (`pip`, `npm`, `apt`, `brew`, `cargo`, `--break-system-packages`, etc.) — if a required capability is missing, stop and return a failure report naming it rather than installing anything.

If any precondition fails, stop and return a concise failure report.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, prefer a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. When you need to inspect or transcribe a specific region at full fidelity, request it server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. If you measured coordinates inside a region crop, add the crop's `x,y` origin back before applying the canvas conversion below. Detect every text line in reading order and measure each line's bounding box in image-pixel space.
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
