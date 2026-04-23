# Task: transcribe the existing lines on a TPEN3 page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as a fallback JSON payload for the user to paste.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing lines

Each entry is `<annotation-uri>: <xywh selector>` in canvas coordinates. Use the full annotation URI verbatim as the `id` of each item in the PUT payload; the server preserves these ids and updates only the body text.

{{existingLines}}

## Preconditions

All required inputs (`projectID`, `pageID`, `canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This template only revises existing lines: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and report.

You must have:

1. Vision capability: fetch each line's region as image bytes (e.g. via a IIIF region URL) and read the inked glyphs directly. A fetcher that returns only a prose description of the image does not qualify, and any preview rendered back into chat is downsampled — do not transcribe from a preview. **If you cannot read image bytes directly with the capabilities already available to you, stop now and return a failure report naming the missing capability.** This precondition is hard — fallback does not rescue missing vision.
2. Either HTTP PUT capability with `Content-Type: application/json`, or the ability to emit the payload as a fallback JSON code block in your report. If HTTP PUT is not available, skip straight to the Fallback section — do not retry.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}` and GET `{base}/info.json` for the dimensions; fetch each line's region server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. The `xywh` selectors above are in canvas space; convert each to image-pixel space (for the IIIF region URL or the local crop) using:
   - `pixel_x = round(canvas_x * img_w / {{canvasWidth}})`
   - `pixel_y = round(canvas_y * img_h / {{canvasHeight}})`
   - `pixel_w = round(canvas_w * img_w / {{canvasWidth}})`
   - `pixel_h = round(canvas_h * img_h / {{canvasHeight}})`
   Crop each line region and verify it visibly contains a single line of inked text.
2. Run handwriting text recognition over each crop. Apply the recognition rules below.
3. Build the `{ "items": [...] }` payload described under TPEN API. There is exactly one item per entry in "Existing lines", each item re-using that entry's annotation URI verbatim as its `id`, preserving its `target` (the `xywh` selector shown above) unchanged, and carrying the recognized text as the `TextualBody` value. Item order must match the order of "Existing lines" — do not reorder.
4. If HTTP PUT is available, send the request once. On any non-2xx response, do not retry — fall back. If HTTP PUT is unavailable from the start, go directly to the fallback.
5. Report counts (lines updated/in payload, lines flagged illegible) and which path was used.

## Rules

- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Keep line segmentation stable — one transcription string per existing line annotation.
- If a line's crop is illegible, emit the item with an empty `TextualBody` value and report the line id as unresolved — do not fabricate text, and do not drop the item from `items`.

## TPEN API

Save every transcription in a single PUT. The `items` array re-uses each existing annotation's URI verbatim as `id` so the server updates in place; replace `<annotation-uri>` with the URI, `xywh=x,y,w,h` with the exact selector value shown in "Existing lines" (copied verbatim, not recomputed), and `<recognized line text>` with the transcription (empty string for fully illegible lines).

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
      "id": "<annotation-uri>",
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

When the direct PUT is impossible or returns non-2xx, emit the `{ "items": [...] }` body from TPEN API as the final code block of your report. It must be valid JSON (no comments, no placeholders — substitute the real URIs, xywh selectors, and recognized text). The user will paste it into the TPEN splitscreen tool, which submits it with their authorized token.

## Completion

Direct PUT path, report:

- operation: `PUT page`
- target: {{pageEndpoint}}
- counts: lines updated, lines flagged illegible

Fallback path, report:

- path: `fallback`
- counts: lines in payload, lines flagged illegible
- HTTP status and error body if a PUT was attempted first
- final code block: the full `{ "items": [...] }` JSON for the user to paste
