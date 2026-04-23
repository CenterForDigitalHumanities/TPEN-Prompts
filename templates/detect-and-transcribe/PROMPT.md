# Task: detect and transcribe every text line on a TPEN3 page end-to-end

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as a fallback JSON payload for the user to paste.

## Context

- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Preconditions

All required inputs (`canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions) are provided above. You must have:

1. Ability to fetch the image bytes (or a derivative) and identify line bounds and text from them. Precise pixel measurement is preferred when available; visual estimation and on-sight transcription from the fetched image are acceptable otherwise.
2. Either HTTP PUT capability with `Content-Type: application/json`, or the ability to emit the payload as a fallback JSON code block in your report. If HTTP PUT is not available, skip straight to the Fallback section — do not retry.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}`, then GET `{base}/info.json` for the dimensions. For the page-overview pass, fetch a small derivative `{base}/full/1500,/0/default.jpg` and scale measured coordinates back via `source = derivative * info.width / 1500`. If you have precise pixel tooling and want tighter bounds or a clearer crop for transcription, request a region server-side as `{base}/x,y,w,h/max/0/default.jpg` and add the crop's `x,y` origin back before applying the canvas conversion below. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes.
2. Detect text lines across the whole page in reading order. This task does not create TPEN columns.
3. For every line, measure a bounding box in image-pixel space and convert to integer canvas coordinates using:
   - `canvas_x = round(pixel_x * {{canvasWidth}} / img_w)`
   - `canvas_y = round(pixel_y * {{canvasHeight}} / img_h)`
   - `canvas_w = round(pixel_w * {{canvasWidth}} / img_w)`
   - `canvas_h = round(pixel_h * {{canvasHeight}} / img_h)`
   Then clamp to the canvas (`0 ≤ x`, `x + w ≤ {{canvasWidth}}`, `0 ≤ y`, `y + h ≤ {{canvasHeight}}`).
4. Run handwriting text recognition on each line's crop. Apply the recognition rules below.
5. If HTTP PUT is available, build the full payload under **TPEN API** — one Annotation per line with the recognized text and `xywh=x,y,w,h` selector — and send the request once. On any non-2xx response, do not retry — fall back.
6. If HTTP PUT is unavailable (or step 5 fell back), emit the condensed payload under **Fallback** as the final code block.
7. Report counts (lines saved/in payload, non-empty text, uncertain) and which path was used (direct PUT or fallback).
8. Report notable ambiguities (e.g., illegible lines transcribed as empty or flagged).

## Rules

### Detection (IMAGE_ANALYSIS)

- Bounds MUST be saved as integer coordinates in canvas space. No percent, no `pixel:` prefix on the selector value.
- Preserve reading order across the whole page.
- Prefer tight bounds when you can measure them; best-effort bounds are acceptable. When uncertain whether a tall run is one line or several, prefer splitting over merging.
- Do not include decorative borders, frame rules, ornaments, or illustrations as part of a line.
- Completion beats refusal: approximate bounds on most lines are more useful than nothing — this data will be reviewed and corrected downstream.
- Zero lines detected is an unprocessable outcome. Stop and report — do not PUT, do not emit a fallback payload. An empty `items` array would erase every existing annotation on the page.

### Recognition (HANDWRITING_TEXT_RECOGNITION)

- Prioritize diplomatic transcription over normalization.
- Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Keep line segmentation stable even when text is partially uncertain.
- If a crop is fully illegible, save the annotation with an empty text body and flag the line id in the report — do not fabricate text.

## TPEN API

Save every detected line with its transcription in a single PUT. The `items` array must contain one annotation per detected line; replace `x,y,w,h` with the integer canvas coordinates computed in step 3, and `<recognized line text>` with the recognized text (empty string for fully illegible lines).

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
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

When the direct PUT is impossible or returns non-2xx, emit the condensed payload below as the final code block of your report. The TPEN splitscreen tool expands each item into a full W3C Annotation before PUTting it — do not inline the canvas source, selector boilerplate, or motivation. It must be valid JSON (no comments, no placeholders — substitute the real coordinates and recognized text).

```
{
  "items": [
    { "text": "<recognized line text>", "target": "xywh=x,y,w,h" }
  ]
}
```

One item per detected line, in reading order. `target` is the bare selector value (no `#`, no `pixel:` prefix). `text` is an empty string for fully illegible lines — do not drop the item.

## Completion

Direct PUT path, report:

- operation: `PUT page`
- target: {{pageEndpoint}}
- counts: lines saved, lines with non-empty text, lines flagged uncertain
- notable ambiguities worth a human review

Fallback path, report:

- path: `fallback`
- counts: lines in payload, lines with non-empty text, lines flagged uncertain
- HTTP status and error body if a PUT was attempted first
- notable ambiguities worth a human review
- final code block: the condensed `{ "items": [...] }` JSON for the user to paste
