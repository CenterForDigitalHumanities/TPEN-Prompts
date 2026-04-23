# Task: transcribe the existing lines on a TPEN3 page

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

## Existing lines

Each entry is `<lineId>: <xywh selector>` in canvas coordinates. If the list is empty, stop — this template only revises existing lines.

{{existingLines}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`, and a non-empty existing-lines list above. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and crop/inspect per-line regions.
3. Authorization: `{{token}}` is present and trusted — it will be used to persist the result on your behalf.

If any precondition fails, stop and return a concise failure report. Missing HTTP-write capability is not a failure; it triggers the fallback below.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image and a per-line crop using each line's `xywh` from the list above. Verify each crop visibly contains a single line of inked text.
3. Run handwriting text recognition over each crop. Apply the recognition rules below.
4. For each line, PATCH the text to its line-text endpoint.
5. Report a per-line summary: how many succeeded, how many failed, and the HTTP status for any failure.

## Rules

- Identify the script and language from the image before transcribing; apply the paleographic conventions standard to that tradition.
- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Mark uncertain glyphs with an explicit uncertainty convention (for example `[a?]` for Latin scripts, or an equivalent for the detected tradition). Do not force certainty.
- Do not invent expansions. When a suspension, contraction, or ligature marker is present, transcribe the marker itself; do not silently expand.
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

Error handling:

```javascript
if (!response.ok) {
    throw new Error(`TPEN API ${response.status}: ${await response.text()}`)
}
```

## Completion

On success, report:

- operation: `PATCH line text`
- target: `{{pageEndpoint}}/line/<lineId>/text` per line
- count: number of lines updated

On failure, report:

- the failing stage (image fetch, recognition, PATCH, etc.)
- HTTP status and error body if applicable
- the line id(s) affected and a recommended next step

## Fallback

If you cannot issue the PATCHes yourself, emit a single `{ "items": [ … ] }` JSON code block where each item's `id` is the existing line's full IRI and `body` is `[{ "type": "TextualBody", "value": "<recognized text>", "format": "text/plain" }]`. `target`, `motivation`, `type`, and `@context` may be preserved from the existing annotation or omitted; the server routes items with an http `id` as updates, not creations. A human will submit it via the host tool. Do not fabricate transcriptions when vision or context is missing; that still stops the task.
