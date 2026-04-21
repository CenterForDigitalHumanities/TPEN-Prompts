# Task: transcribe the existing lines on a TPEN3 page

You are assisting with TPEN manuscript transcription. Perform the task end-to-end and stop only when the result has been persisted via TPEN Services.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Canvas Dimensions: {{canvasWidth}} × {{canvasHeight}}
- Image: {{imageUrl}}
- Page endpoint: {{pageEndpoint}}

## Existing lines

Each entry is `<lineId>: <xywh selector>` in canvas coordinates.

{{existingLines}}

## Preconditions

All required inputs (`projectID`, `pageID`, `canvasId`, `token`, `pageEndpoint`, `imageUrl`, canvas dimensions, existing-line list) are provided above. This template only revises existing lines: `lineCount` = `{{lineCount}}`. If `lineCount` is `0`, stop immediately and report.

You must have:

1. Vision capability: load the page image as raw bytes and crop/inspect per-line regions. A fetcher that returns only a prose description of the image does not count.
2. HTTP PATCH capability (with `Content-Type: text/plain`).

If any precondition fails, stop and return a concise failure report naming the missing capability.

## Steps

1. Fetch the page image. Read its actual pixel dimensions (`img_w`, `img_h`) — the IIIF server may return a scaled rendering, not the canvas-native resolution. The `xywh` selectors above are in canvas space; convert each to image-pixel space before cropping using:
   - `pixel_x = round(canvas_x * img_w / {{canvasWidth}})`
   - `pixel_y = round(canvas_y * img_h / {{canvasHeight}})`
   - `pixel_w = round(canvas_w * img_w / {{canvasWidth}})`
   - `pixel_h = round(canvas_h * img_h / {{canvasHeight}})`
   Crop each line region and verify it visibly contains a single line of inked text.
2. Run handwriting text recognition over each crop. Apply the recognition rules below.
3. For each line, PATCH the text to its line-text endpoint — one PATCH per line in the "Existing lines" list.
4. Report a per-line summary: how many succeeded, how many failed, and the HTTP status for any failure.

## Rules

- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Use explicit uncertainty markers for unclear glyphs (for example `[a?]`). Do not force certainty.
- Do not invent expansions. If an abbreviation mark is present, transcribe the mark; do not silently expand.
- Keep line segmentation stable — one transcription string per existing line annotation.
- If a line's crop is illegible, send an empty body or skip the PATCH and report the line id as unresolved — do not fabricate text.

## TPEN API

Update one line's text via PATCH with a plain-text body:

```
PATCH {{pageEndpoint}}/line/<lineId>/text
Authorization: Bearer {{token}}
Content-Type: text/plain

<the transcribed line text>
```

`<lineId>` is the trailing id segment of the annotation's id (the last path segment of the annotation URI).

On any non-2xx response, include the HTTP status and response body in that line's failure report.

## Completion

On success, report:

- operation: `PATCH line text`
- target: {{pageEndpoint}}/line/<lineId>/text per line
- count: number of lines updated

On failure, report:

- the failing stage (image fetch, recognition, PATCH, etc.)
- HTTP status and error body if applicable
- the line id(s) affected and a recommended next step
