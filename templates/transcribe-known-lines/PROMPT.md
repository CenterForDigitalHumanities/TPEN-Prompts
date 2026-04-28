# Task: transcribe the existing lines on a TPEN3 page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as a fallback JSON payload for the user to paste.

## Context

- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing lines

Each entry is `<annotation-uri> | xywh=<xywh selector> | <body form>` in canvas coordinates. The body form (`body=[]`, `text="<value>"`, or `body=<JSON>`) is the line's current transcription — see "Rules" for when to keep it vs. replace it. The direct PUT and the fallback both re-use each entry's URI verbatim as the item `id`; the direct PUT additionally rebuilds `target` from the entry's `xywh` selector (see "TPEN API" below). The new transcription replaces the prior body in both paths.

{{existingLines}}

## Preconditions

All required inputs (`canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This template only revises existing lines: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and report — this prompt must not create lines.

You must have:

1. Vision capability: fetch each line's region as image bytes (e.g. via a IIIF region URL) and read the inked glyphs directly. A fetcher that returns only a prose description of the image does not qualify, and any preview rendered back into chat is downsampled — do not transcribe from a preview. **If you cannot read image bytes directly with the capabilities already available to you, stop now and return a failure report naming the missing capability.** This precondition is hard — fallback does not rescue missing vision.
2. Either HTTP PUT capability (with `Content-Type: application/json`), or the ability to emit a fallback JSON code block in your report. If HTTP PUT is not available, skip straight to the Fallback section — do not retry.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}` and GET `{base}/info.json` for the dimensions; fetch each line's region server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. The `xywh` selectors above are in canvas space; convert each to image-pixel space (for the IIIF region URL or the local crop) using:
   - `pixel_x = round(canvas_x * img_w / {{canvasWidth}})`
   - `pixel_y = round(canvas_y * img_h / {{canvasHeight}})`
   - `pixel_w = round(canvas_w * img_w / {{canvasWidth}})`
   - `pixel_h = round(canvas_h * img_h / {{canvasHeight}})`
   Crop each line region and verify it visibly contains a single line of inked text.
2. Run text recognition (print or handwriting) over each crop. Apply the recognition rules below.
3. If HTTP PUT is available, build a single page PUT body whose `items` array contains one entry per existing line, in the same order as the "Existing lines" list. Each item is shaped as in "TPEN API" below; set `body` per the confidence ladder in "Rules". Send one PUT to `{{pageEndpoint}}`. On non-2xx, stop and report the status — do not emit a fallback payload; the same token and content would be re-submitted through it.
4. If HTTP PUT is unavailable from the start, emit the condensed payload under **Fallback** as the final code block — do not also attempt PUT.
5. Report counts (lines submitted, lines flagged illegible) and which path was used.

## Rules

- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Confidence ladder per line: confident reading → existing text from "Existing lines" (echo the prior `text=` or `body=` value verbatim) → `body: []` (direct) / `"text": ""` (fallback), only when the line was already empty (`body=[]`). Do not fabricate text. Report any line that fell back to existing text or to empty. Do not drop the item in either path: the direct PUT treats omitted line ids as deletions and updates columns to remove them.

## TPEN API

Update every line in a single page PUT. Each `items` entry re-uses an existing annotation URI verbatim as `id`, rebuilds `target` from that line's `xywh` selector, and sets `body` per the confidence ladder in "Rules":

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
      "id": "<existing-annotation-uri>",
      "body": [{ "type": "TextualBody", "value": "<recognized line text>", "format": "text/plain" }],
      "target": {
        "source": "{{canvasId}}",
        "type": "SpecificResource",
        "selector": {
          "type": "FragmentSelector",
          "conformsTo": "http://www.w3.org/TR/media-frags/",
          "value": "xywh=x,y,w,h"
        }
      }
    }
  ]
}
```

## Fallback

The fallback tool only accepts a condensed payload — re-using URIs but not full targets. When PUT is unavailable from the start, emit the payload below as the final code block of your report. The TPEN splitscreen tool re-uses each line's existing target from the hydrated page context before PUTting it — the item's `id` must match an entry in "Existing lines" above.

```
{
  "items": [
    { "id": "<annotation-uri>", "text": "<recognized line text>" }
  ]
}
```

There must be exactly one item per entry in "Existing lines". Item order must match the order of "Existing lines" — do not reorder. Set each `text` per the confidence ladder in "Rules". It must be valid JSON (no comments, no placeholders).

## Completion

Direct PUT path, report:

- operation: `PUT page`
- target: {{pageEndpoint}}
- counts: lines submitted, lines flagged illegible
- HTTP status of the PUT

Fallback path, report:

- path: `fallback`
- counts: lines in payload, lines flagged illegible
- final code block: the condensed `{ "items": [...] }` JSON for the user to paste
