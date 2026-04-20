/**
 * @file Shared `buildContext` helper for first-line-detection prompt templates.
 *
 * Both `detect-first-line` and `detect-first-line-fast` (and any future
 * variants) consume the same flat variable map — only the PROMPT.md body
 * differs. Each variant's `index.js` stays a thin wrapper that sets
 * `id`/`label`/`templateUrl` and delegates `buildContext` here.
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

/**
 * Produce the `{{name}}` -> value map for first-line-detection PROMPT.md bodies.
 * @param {FirstLineDetectionContext} ctx
 * @returns {Record<string, string>}
 */
export function buildFirstLineContext(ctx) {
    const { canvas, projectID, pageID, lineEndpoint, token } = ctx
    const canvasId = canvas?.id ?? canvas?.['@id'] ?? '(unknown canvas id)'
    const imageUrl = extractImageUrl(canvas) ?? '(no image body found on canvas)'
    const { width, height } = canvasDimensions(canvas)
    const dims = (width && height) ? `${width} × ${height}` : 'unknown (use the IIIF Image API info.json)'
    const userAgentURI = getAgentIRIFromToken(token) ?? '(unable to resolve agent IRI from token)'
    const pageEndpoint = lineEndpoint ? lineEndpoint.replace(/\/line$/, '') : '(unknown page endpoint)'
    return {
        projectID,
        pageID,
        canvasId,
        imageUrl,
        dims,
        userAgentURI,
        pageEndpoint,
        lineEndpoint: lineEndpoint ?? '(unknown line endpoint)',
        token
    }
}
