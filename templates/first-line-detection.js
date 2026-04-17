/**
 * @file Template: "Detect first line → create annotation".
 *
 * Produces a single prompt string instructing an agentic LLM to analyze the
 * canvas image, compute an IIIF `#xywh=` bounding box for the first visible
 * text line, build a W3C Web Annotation targeting the canvas, and POST it to
 * TPEN Services so the line is actually created in the user's project.
 *
 * @author thehabes
 */

import { getAgentIRIFromToken } from '../auth.js'

/**
 * @typedef {object} FirstLineDetectionContext
 * @property {any} canvas the IIIF canvas for the page (may be a stub `{ id }` if the fetch failed).
 * @property {string} projectID
 * @property {string} pageID
 * @property {string|null} lineEndpoint POST URL for creating a line; null when pageID is missing.
 * @property {string} token JWT to include in the generated prompt's Authorization header.
 */

/**
 * Pull the first image body URL off a IIIF canvas, or null if none is present.
 * @param {any} canvas
 * @returns {string|null}
 */
function extractImageUrl(canvas) {
    if (!canvas) return null
    let body = canvas?.items?.[0]?.items?.[0]?.body
    if (!body) return null
    if (Array.isArray(body)) body = body[0]
    if (!body) return null
    if (typeof body === 'string') return body
    return body.id ?? body['@id'] ?? null
}

/**
 * Read the canvas's declared dimensions, accepting both IIIF v3 and the older
 * `dc:width`/`dc:height` pairs.
 * @param {any} canvas
 * @returns {{ width: number|null, height: number|null }}
 */
function canvasDimensions(canvas) {
    const w = canvas?.width ?? canvas?.['dc:width'] ?? null
    const h = canvas?.height ?? canvas?.['dc:height'] ?? null
    return { width: w, height: h }
}

/** @type {import('../prompt-generator.js').PromptTemplate} */
export const firstLineDetectionTemplate = {
    id: 'first-line-detection',
    label: 'Detect first line → create #xywh annotation',
    /**
     * @param {FirstLineDetectionContext} ctx
     * @returns {string}
     */
    render(ctx) {
        const { canvas, projectID, pageID, lineEndpoint, token } = ctx
        const canvasId = canvas?.id ?? canvas?.['@id'] ?? '(unknown canvas id)'
        const imageUrl = extractImageUrl(canvas) ?? '(no image body found on canvas)'
        const { width, height } = canvasDimensions(canvas)
        const dims = (width && height) ? `${width} × ${height}` : 'unknown (use the IIIF Image API info.json)'
        const userAgentURI = getAgentIRIFromToken(token) ?? '(unable to resolve agent IRI from token)'
        return `# Task: detect the first text line on a TPEN3 page and create a line annotation

You are an agentic assistant with HTTP and image-analysis capabilities. Perform the task below end to end and stop only when the line has been persisted via TPEN Services.

## Context

- Project: ${projectID}
- Page: ${pageID}
- Canvas: ${canvasId}
- Declared Canvas Dimensions (verify against info.json): ${dims}
- Image: ${imageUrl}
- User Agent URI: ${userAgentURI}

## Precondition

Before doing anything else, confirm you can actually see images. If you cannot load and visually analyze the page image (no vision capability, image fetch blocked, format unreadable, etc.), **abort immediately**. Do not guess, estimate, or hallucinate coordinates from the filename, canvas dimensions, or prior knowledge. Report:
- that you are aborting,
- the specific reason (e.g., "no image-analysis capability", "image fetch returned 403", "unsupported format"),
- and the URL you attempted.

What does *not* count as image analysis: a fetch primitive that returns a text summary or prose description of the page (e.g., a URL fetcher backed by a text-only model). You must be able to load the raw bytes as an image and measure pixel coordinates on it. If your only option is to ask another service to describe the image, treat that as "no vision capability" and abort.

Do not POST anything to TPEN Services in this case.

## Steps

1. Fetch the page image and resolve its coordinate space.

   a. Derive the IIIF Image API **service base** from the Image URL above. The URL given is likely already a specific derivative in the form \`{service-base}/{region}/{size}/{rotation}/{quality}.{format}\` (e.g. \`.../full/max/0/default.jpg\`). Strip that trailing \`/{region}/{size}/{rotation}/{quality}.{format}\` so you are left with just \`{service-base}\` (which ends in the image identifier). GET \`{service-base}/info.json\`. The \`width\`/\`height\` there are the image's **native pixel dimensions**, and they may or may not match the declared canvas dimensions above — do not assume they do. If \`info.json\` 404s or the URL does not follow this pattern, treat the image as a plain (non-IIIF) file and skip to 1b using the Image URL as given.

   b. Request a usable size via the Image API (e.g. \`{service-base}/full/1000,/0/default.jpg\`). Note the actual pixel dimensions of what you downloaded — this is your **derivative**. Depending on the service it may equal native, equal canvas, or be smaller than both.

   c. Measure the bounding box on the derivative you actually downloaded. Then convert to canvas coordinates with a single scale per axis:

   \`\`\`
   x_canvas = x_derivative * (canvas_width  / derivative_width)
   y_canvas = y_derivative * (canvas_height / derivative_height)
   w_canvas = w_derivative * (canvas_width  / derivative_width)
   h_canvas = h_derivative * (canvas_height / derivative_height)
   \`\`\`

   This ratio absorbs both stages (canvas↔native and native↔derivative) in one step, so you do not need to compute an intermediate native-pixel box. Final \`x, y, w, h\` emitted in the annotation MUST be in canvas coordinates.

2. Identify the bounding box of the FIRST visible text line on the page — the topmost line of the primary text block, reading order aware (top-to-bottom, left-to-right unless the script dictates otherwise). Ignore marginalia, running heads, decorations, and rubrics unless the first line *is* one of those. Fallback: on a page without discernable text bodies treat the first substantial inked line as the first line.

   This is a **seed line** — the human will adjust it in the TPEN UI, so a slightly generous box is preferable to one that clips ascenders or descenders.

3. Express the box as \`x, y, w, h\` in canvas coordinates. Clamp to the canvas: enforce \`x >= 0\`, \`y >= 0\`, \`x + w <= canvas width\`, \`y + h <= canvas height\`. If your initial measurement violates these, clamp rather than discard. Round to integers after clamping.

4. Construct a W3C Web Annotation with this exact shape:

\`\`\`json
{
  "@context": "http://iiif.io/api/presentation/3/context.json",
  "type": "Annotation",
  "motivation": "transcribing",
  "target": {
    "source": "${canvasId}",
    "type": "SpecificResource",
    "selector": {
      "type": "FragmentSelector",
      "conformsTo": "http://www.w3.org/TR/media-frags/",
      "value": "xywh=pixel:<x>,<y>,<w>,<h>"
    }
  },
  "body": [],
  "creator": "${userAgentURI}"
}
\`\`\`

Leave \`body\` as an empty array — transcription text is not part of this task. Do not include \`id\`, \`_createdAt\`, or \`_modifiedAt\`; TPEN Services assigns those on create.

5. POST it to TPEN Services. Send the annotation JSON from step 4 as the request body (raw JSON, not form-encoded, not wrapped):

\`\`\`
POST ${lineEndpoint}
Content-Type: application/json
Accept: application/json
Authorization: Bearer ${token}

Body: <the exact JSON object from step 4>
\`\`\`

Response handling:
- \`201 Created\` — success. Capture the returned Line JSON for output.
- \`409 Conflict\` — a line already exists for this target. Stop, do not retry, and report the existing line (from the response body if provided).
- \`403 Forbidden\` — the token lacks CREATE permission on LINE for this project. Stop and report; do not attempt a different endpoint.
- Any other non-2xx — report the request (method, URL, body) and the full response (status + body). Do not retry silently.

## Output

Return, in this order:
- One short sentence justifying the chosen box (e.g., "topmost dark ink band at y≈420, spans the writing block").
- The final annotation JSON you sent.
- The HTTP status and response body from TPEN Services.

No other narration.`
    }
}
