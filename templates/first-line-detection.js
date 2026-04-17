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
    const body = canvas?.items?.[0]?.items?.[0]?.body
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
- Canvas Dimensions: ${dims}
- Image: ${imageUrl}
- User Agent URI: ${userAgentURI}

## Steps

1. Fetch the page image. If it is a IIIF Image API service, you may request a sized derivative via \`{image}/full/max/0/default.jpg\` or consult \`{image}/info.json\` for available sizes. Work in canvas coordinates (the dimensions above), not pixel coordinates of a downscaled derivative.

2. Identify the bounding box of the FIRST visible text line on the page — the topmost line of the primary text block, reading order aware (top-to-bottom, left-to-right unless the script dictates otherwise). Ignore marginalia, running heads, decorations, and rubrics unless the first line *is* one of those.

3. Express the box as integers \`x, y, w, h\` in canvas coordinates. Double-check that \`x + w <= canvas width\` and \`y + h <= canvas height\`.

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

5. POST it to TPEN Services:

\`\`\`
POST ${lineEndpoint}
Content-Type: application/json
Authorization: Bearer ${token}

<annotation JSON from step 4>
\`\`\`

A successful response is \`201 Created\` with the new Line as JSON. A \`409\` means the line already exists; a \`403\` means the token lacks CREATE permission on LINE for this project.

## Output

Return two things:
- The final annotation JSON you sent.
- The HTTP status and response body from TPEN Services.

Do not narrate intermediate reasoning; just perform the steps and report the results.`
    }
}
