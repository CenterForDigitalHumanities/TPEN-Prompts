# Task: detect column regions on a TPEN3 page and assign existing lines to them

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

## Existing columns on this page

{{existingColumns}}

## Existing lines

Each entry is `<lineId>: <xywh selector>` in canvas coordinates. Use these ids verbatim when assigning lines to columns.

{{existingLines}}

## Preconditions

1. Required context present: `projectID`, `pageID`, `canvasId`, `{{token}}`, and a non-empty existing-lines list above. If any is missing, stop and report.
2. Vision capability: you must be able to load the page image as raw bytes and measure pixel coordinates on it. If not, stop and report.

**Capability check.** Before anything else, decide whether you can issue an authenticated HTTP request with `Authorization: Bearer {{token}}`. If yes, follow `## TPEN API` below. If no, skip straight to `## Fallback` — do not attempt curl/wget substitutes, do not narrate the limitation, do not partially execute the direct path.

## Steps

1. Resolve canvas dimensions. Use `{{canvasWidth}}`/`{{canvasHeight}}` when numeric. Otherwise GET `{{canvasId}}` and read `width`/`height`. If that fails, GET `{{manifestUri}}` and find the matching canvas in `items` by id.
2. Analyze the page image and detect column regions in reading order.
3. For each detected column, determine which of the existing line ids (from the list above) fall within its bounds using each line's `xywh`. A line is assigned to exactly one column.
4. Choose a unique label per column (e.g., `Column A`, `Column B`). The label must not clash with any label listed under "Existing columns on this page".
5. Submit each column via the path chosen by the Capability check, using the body shape defined in `## TPEN API` below.

## Rules

- Preserve reading order. Columns proceed as the page is read (left→right for Latin-script layouts; adjust for script tradition).
- Prefer high recall: include borderline regions as columns when they contain text, rather than silently dropping them.
- Keep column boundaries tight enough that each line clearly belongs to one column, but generous enough to avoid clipping existing line selectors.
- Flag ambiguous regions (e.g., marginalia that may be a column) in the report rather than silently including or excluding them.
- Column labels are page-scoped and must be unique. Do not duplicate an existing column label.
- Annotations cannot be assigned to more than one column. If a line clearly sits in an existing column, do not reassign it.

## TPEN API

Create one column:

```
POST {{pageEndpoint}}/column
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "label": "Column A",
  "annotations": ["<line-id-1>", "<line-id-2>", "<line-id-3>"]
}
```

Each `<line-id>` is the trailing id segment of a line annotation listed above. Submit one column at a time — the server creates one column per POST.

## Fallback

If the capability check failed, include the concrete payload for the splitscreen panel in your report as a fenced JSON code block. The payload is a JSON array of the `{ "label", "annotations" }` objects shown in `## TPEN API` above — **one element per column, even when only one column is detected** — because the host tool iterates the array and POSTs each object in turn. Payload only, not the HTTP verb line, not the `Authorization` header. The user copies the JSON out of the code block and pastes it into the splitscreen fallback panel.

## Completion

Report what was persisted and flag anything ambiguous, illegible, or unresolved for human review. In the fallback path, the report must include the full JSON payload (per `## Fallback`) — that is the paste-ready deliverable for the user.
