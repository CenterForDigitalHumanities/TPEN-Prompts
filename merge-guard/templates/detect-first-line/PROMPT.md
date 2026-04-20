# Task: detect the first text line on a TPEN3 page and create a line annotation

You are an agentic assistant with HTTP and image-analysis capabilities. Perform the task below end to end and stop only when the line has been persisted via TPEN Services.

## Context

- Project: {{projectID}}
- Page: {{pageID}}
- Canvas: {{canvasId}}
- Declared Canvas Dimensions (verify against info.json): {{dims}}
- Image: {{imageUrl}}
- User Agent URI: {{userAgentURI}}

## Precondition

You must be able to load the page image as raw bytes and measure pixel coordinates on it; a fetch that returns only a text/prose description (e.g., a text-only-model URL fetcher) does not count — treat that as no vision capability. If you cannot see the image (no vision, fetch blocked, format unreadable), **abort immediately** — do not guess or hallucinate coordinates, and do not POST. Report: that you are aborting, the reason (e.g., "no image-analysis capability", "fetch returned 403", "unsupported format"), and the URL you attempted.

## Abort if the page already has lines

Before doing any image work, confirm the page is empty. GET the page:

```
GET {{pageEndpoint}}
Accept: application/json
Authorization: Bearer {{token}}
```

Inspect the response for existing line annotations. A TPEN page is a IIIF AnnotationPage; lines appear under `items`. If the page already has one or more line annotations, **abort immediately**. This tool only seeds the first line on an empty page.

Report: that you are aborting, the reason (`page already has line(s)`). Only proceed to step 1 below if the page contains zero line annotations. If the GET itself fails (401/403/404/5xx), abort and report the status rather than guessing the page is empty.

## Environment limits

Use only tools already present. Do not `sudo`, install packages (apt/pip/npm/brew/etc.), bootstrap package managers, modify PATH, or create venvs. A missing tool means use the step 4 fallback and flag verification DEGRADED; if no capability at all, abort per Precondition.

## Steps

1. Fetch the page image and resolve its coordinate space.

   a. Derive the IIIF Image API **service base** from the Image URL above. The URL given is likely already a specific derivative in the form `{service-base}/{region}/{size}/{rotation}/{quality}.{format}` (e.g. `.../full/max/0/default.jpg`). Strip that trailing `/{region}/{size}/{rotation}/{quality}.{format}` so you are left with just `{service-base}` (which ends in the image identifier). GET `{service-base}/info.json`. The `width`/`height` there are the image's **native pixel dimensions**, and they may or may not match the declared canvas dimensions above — do not assume they do. If `info.json` 404s or the URL does not follow this pattern, treat the image as a plain (non-IIIF) file and skip to 1b using the Image URL as given.

   b. Request a usable size via the Image API (e.g. `{service-base}/full/1000,/0/default.jpg`). Note the actual pixel dimensions of what you downloaded — this is your **derivative**. Depending on the service it may equal native, equal canvas, or be smaller than both.

   c. Measure the bounding box on the derivative you actually downloaded. Then convert to canvas coordinates with a single scale per axis:

   ```
   x_canvas = x_derivative * (canvas_width  / derivative_width)
   y_canvas = y_derivative * (canvas_height / derivative_height)
   w_canvas = w_derivative * (canvas_width  / derivative_width)
   h_canvas = h_derivative * (canvas_height / derivative_height)
   ```

   This ratio absorbs both stages (canvas↔native and native↔derivative) in one step, so you do not need to compute an intermediate native-pixel box. Final `x, y, w, h` emitted in the annotation MUST be in canvas coordinates.

2. Identify the bounding box of the FIRST visible text line on the page — the topmost line of the primary text block, reading order aware (top-to-bottom, left-to-right unless the script dictates otherwise). Ignore marginalia, running heads, decorations, and rubrics unless the first line *is* one of those. Fallback: on a page without discernable text bodies treat the first substantial inked line as the first line. This is a **seed line** — the human will adjust it in the TPEN UI, so a slightly generous box is preferable to one that clips ascenders or descenders.

3. Express the box as `x, y, w, h` in canvas coordinates. Clamp to the canvas: enforce `x >= 0`, `y >= 0`, `x + w <= canvas width`, `y + h <= canvas height`. If your initial measurement violates these, clamp rather than discard. Round to integers after clamping.

4. Verify the box before committing. Fetch a crop covering your exact `x, y, w, h` and load the bytes as an image (a prose summary does not count). IIIF region syntax expects **native** pixels, so if native ≠ canvas convert back first:

   ```
   x_native = x_canvas * (native_width  / canvas_width)
   y_native = y_canvas * (native_height / canvas_height)
   w_native = w_canvas * (native_width  / canvas_width)
   h_native = h_canvas * (native_height / canvas_height)
   ```

   Then GET `{service-base}/{x_native},{y_native},{w_native},{h_native}/max/0/default.jpg` and inspect it. The crop must clearly contain the first text line and little else. If it shows decoration, whitespace, the wrong line, or clips ascenders/descenders, re-measure from step 2 — do not nudge numbers. Do not POST an unverified box.

   For non-IIIF sources, use a local crop tool (ImageMagick/PIL/sips/ffmpeg) for the same region check. If no crop tool is available, re-examine the region on the highest-resolution derivative you can fetch and flag verification DEGRADED.

5. Construct a W3C Web Annotation with this exact shape:

```json
{
  "@context": "http://iiif.io/api/presentation/3/context.json",
  "type": "Annotation",
  "motivation": "transcribing",
  "target": {
    "source": "{{canvasId}}",
    "type": "SpecificResource",
    "selector": {
      "type": "FragmentSelector",
      "conformsTo": "http://www.w3.org/TR/media-frags/",
      "value": "xywh=pixel:<x>,<y>,<w>,<h>"
    }
  },
  "body": [],
  "creator": "{{userAgentURI}}"
}
```

`body` stays empty (no transcription here); omit `id`, `_createdAt`, `_modifiedAt` — TPEN assigns them on create.

6. POST it to TPEN Services. Send the annotation JSON from step 5 as the request body (raw JSON, not form-encoded, not wrapped):

```
POST {{lineEndpoint}}
Content-Type: application/json
Accept: application/json
Authorization: Bearer {{token}}

Body: <the exact JSON object from step 5>
```

Response handling: on `201 Created`, capture the returned Line JSON. On any non-2xx (`401` bad token, `403` forbidden, `409` outdated page version, `502` upstream error, or anything else), stop and report — do not retry silently and do not try a different endpoint.

## Output

Return, in this order:
- One short sentence justifying the chosen box (e.g., "topmost dark ink band at y≈420, spans the writing block").
- A one-line verification note describing how you confirmed the box in step 4: `verified via IIIF region crop`, `verified via local crop tool (<tool name>)`, or `verification DEGRADED: non-IIIF source with no crop tool; re-examined on full-resolution derivative`.
- The final annotation JSON you sent.
- The HTTP status and response body from TPEN Services.

No other narration.