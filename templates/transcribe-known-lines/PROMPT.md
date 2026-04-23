# Task: transcribe the existing lines on a TPEN3 page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services (direct) or emitted as a fallback JSON payload for the user to paste.

## Context

- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing lines

Each entry is `<annotation-uri> | xywh=<xywh selector> | <body form>` in canvas coordinates. The body form is `body=[]` (empty), `text="<value>"` (single plain-text `TextualBody`), or `body=<JSON>` (anything else) — use it as context for what's already on the line. The fallback payload re-uses the full annotation URI verbatim as the `id` of each item; the splitscreen tool preserves the existing target server-side and updates only the body text.

{{existingLines}}

## Preconditions

All required inputs (`canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This template only revises existing lines: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and report.

You must have:

1. Vision capability: fetch each line's region as image bytes (e.g. via a IIIF region URL) and read the inked glyphs directly. A fetcher that returns only a prose description of the image does not qualify, and any preview rendered back into chat is downsampled — do not transcribe from a preview. **If you cannot read image bytes directly with the capabilities already available to you, stop now and return a failure report naming the missing capability.** This precondition is hard — fallback does not rescue missing vision.
2. Either HTTP PATCH capability (with `Content-Type: text/plain`), or the ability to emit a fallback JSON code block in your report. If HTTP PATCH is not available, skip straight to the Fallback section — do not retry.

Use only tools already available in your environment. Do not install packages, libraries, or system utilities.

## Steps

1. Resolve `img_w`, `img_h`. If `{{imageUrl}}` looks like a IIIF Image API endpoint (path matches `…/{region}/{size}/{rotation}/{quality}.{format}`), strip that suffix to get `{base}` and GET `{base}/info.json` for the dimensions; fetch each line's region server-side as `{base}/x,y,w,h/max/0/default.jpg` rather than downloading the whole page and cropping locally. Otherwise GET `{{imageUrl}}` once and read dimensions from the bytes. The `xywh` selectors above are in canvas space; convert each to image-pixel space (for the IIIF region URL or the local crop) using:
   - `pixel_x = round(canvas_x * img_w / {{canvasWidth}})`
   - `pixel_y = round(canvas_y * img_h / {{canvasHeight}})`
   - `pixel_w = round(canvas_w * img_w / {{canvasWidth}})`
   - `pixel_h = round(canvas_h * img_h / {{canvasHeight}})`
   Crop each line region and verify it visibly contains a single line of inked text.
2. Run handwriting text recognition over each crop. Apply the recognition rules below.
3. If HTTP PATCH is available, PATCH the text to each line's line-text endpoint — one PATCH per line in the "Existing lines" list. On any non-2xx, record the status and continue with the remaining lines. If HTTP PATCH is unavailable from the start, go directly to the fallback.
4. Report counts (lines updated, lines flagged illegible, lines failed) and which path was used.

## Rules

- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Keep line segmentation stable — one transcription string per existing line annotation.
- If a line's crop is illegible, send an empty body (direct) or emit `"text": ""` (fallback) and report the line id as unresolved — do not fabricate text. In the fallback payload, do not drop the item.

## TPEN API

Update one line's text via PATCH with a plain-text body. `<lineId>` is the trailing path segment of the annotation URI listed above (the last `/`-separated segment).

```
PATCH {{pageEndpoint}}/line/<lineId>/text
Authorization: Bearer {{token}}
Content-Type: text/plain

<the transcribed line text>
```

## Fallback

The fallback tool only accepts JSON, so it uses a single page-level PUT instead of per-line PATCH. When PATCH is unavailable or every attempt returned non-2xx, emit the condensed payload below as the final code block of your report. The TPEN splitscreen tool re-uses each line's existing target from the hydrated page context before PUTting it — the item's `id` must match an entry in "Existing lines" above.

```
{
  "items": [
    { "id": "<annotation-uri>", "text": "<recognized line text>" }
  ]
}
```

There must be exactly one item per entry in "Existing lines", each re-using that entry's annotation URI verbatim as its `id`. Item order must match the order of "Existing lines" — do not reorder. `text` is an empty string for fully illegible lines — do not drop the item. It must be valid JSON (no comments, no placeholders).

## Completion

Direct PATCH path, report:

- operation: `PATCH line text`
- target: {{pageEndpoint}}/line/<lineId>/text per line
- counts: lines updated, lines flagged illegible, lines failed (with HTTP status per failure)

Fallback path, report:

- path: `fallback`
- counts: lines in payload, lines flagged illegible
- HTTP status and error body if a PATCH was attempted first
- final code block: the condensed `{ "items": [...] }` JSON for the user to paste
