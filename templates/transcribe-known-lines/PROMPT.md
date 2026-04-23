# Task: transcribe the existing lines on a TPEN3 page

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

## Existing lines

Each entry is `<lineId>: <xywh selector>` in canvas coordinates. If the list is empty, stop — this template only revises existing lines.

{{existingLines}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`, and a non-empty existing-lines list above. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and inspect for line-by-line text as a means of textual transcription.

If any precondition fails, stop and return a concise failure report.

**Capability check.** Before anything else, decide whether you can issue an authenticated HTTP request with `Authorization: Bearer {{token}}`. If yes, follow `## TPEN API` below. If no, skip straight to `## Fallback` — do not attempt curl/wget substitutes, do not narrate the limitation, do not partially execute the direct path.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Fetch the page image and a per-line crop using each line's `xywh` from the list above. Verify each crop visibly contains a single line of inked text.
3. Run handwriting text recognition over each crop. Apply the recognition rules below.
4. Submit the recognized text for each line via the path chosen by the Capability check, using the appropriate shape from `## TPEN API` below.

## Rules

- Identify the script and language from the image before transcribing; apply the paleographic conventions standard to that tradition.
- Prioritize diplomatic transcription over normalization. Preserve orthography and punctuation as observed.
- Mark uncertain glyphs with an explicit uncertainty convention (for example `[a?]` for Latin scripts, or an equivalent for the detected tradition). Do not force certainty.
- Do not invent expansions. When a suspension, contraction, or ligature marker is present, transcribe the marker itself; do not silently expand.
- Keep line segmentation stable — one transcription string per existing line annotation.
- If a line's crop is illegible, send an empty body or skip the line and report the id as unresolved — do not fabricate text.

## TPEN API

### Primary: per-line PATCH

Update one line's text via PATCH with a plain-text body:

```
PATCH {{pageEndpoint}}/line/<lineId>/text
Authorization: Bearer {{token}}
Content-Type: text/plain

<the transcribed line text>
```

`<lineId>` is the trailing id segment of the annotation's id (the last path segment of the annotation URI).

### Alternative: batched `PUT page` with IRI-ided items

One PUT can update every line in a single request. Each item's `id` is the existing line's **full IRI**, and `body` carries a `TextualBody`:

```
PUT {{pageEndpoint}}
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "items": [
    {
      "id": "<full line IRI>",
      "body": [{ "type": "TextualBody", "value": "<recognized line text>", "format": "text/plain" }]
    }
  ]
}
```

The server routes `http`-id items as updates, not creations. `target`, `motivation`, `type`, and `@context` may be preserved from the existing annotation or omitted.

## Fallback

If the capability check failed, the concrete payload for the splitscreen panel is the `PUT page` body shown in `## TPEN API` above (the batched alternative, not the primary PATCH form), with one item per line you transcribed.

Emit only the JSON — not the HTTP verb line, not the `Authorization` header.

In the fallback path, your entire final response must be that JSON payload and nothing else — no prose before or after — because the host tool does `JSON.parse` on the pasted text.

## Completion

After the direct-API path, report what was persisted and flag anything ambiguous, illegible, or unresolved for human review. In the fallback path, your entire response is the JSON payload (per `## Fallback`) — no report.
