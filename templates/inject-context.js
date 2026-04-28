/**
 * @file Shared `buildContext` helper for prompt templates.
 *
 * Every template consumes a superset of flat `{{name}}` variables produced by
 * `buildTemplateContext`. Individual templates only reference the subset they
 * need in their PROMPT.md body — unused keys simply don't render. Templates
 * that need richer context (e.g. an `existingLines` listing) spread this
 * result and layer their own keys on top.
 *
 * @author thehabes
 */

import { getIRI, parseXywh } from '../iiif-ids.js'

/**
 * Pull the first image body URL off a IIIF canvas, or null if none is present.
 * @param {any} canvas
 * @returns {string|null}
 */
function extractImageUrl(canvas) {
    let body = canvas?.items?.[0]?.items?.[0]?.body
    if (Array.isArray(body)) body = body[0]
    return getIRI(body)
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
 * Produce the `{{name}}` → value map consumed by every template's PROMPT.md.
 * @param {object} ctx workspace context from `ui-manager.js#onGenerate`.
 * @returns {Record<string, string>}
 */
export function buildTemplateContext(ctx) {
    const { canvas, page, pageEndpoint, token } = ctx
    const canvasId = getIRI(canvas) ?? '(unknown canvas id)'
    const imageUrl = extractImageUrl(canvas) ?? '(no image body found on canvas)'
    const { width, height } = canvasDimensions(canvas)
    const canvasWidth = width != null ? String(width) : '(unknown)'
    const canvasHeight = height != null ? String(height) : '(unknown)'
    const lineCount = Array.isArray(page?.items) ? page.items.length : 0
    return {
        canvasId,
        imageUrl,
        canvasWidth,
        canvasHeight,
        lineCount: String(lineCount),
        pageEndpoint: pageEndpoint ?? '(unknown page endpoint)',
        token: token ?? ''
    }
}

/**
 * Summarize a line's body for the "Existing lines" listing.
 *
 * Three forms, chosen to keep the listing compact while still letting PUT
 * consumers reconstruct an existing body verbatim (the services API replaces
 * `body` with `[]` when a PUT item omits it):
 *
 * - `body=[]` — empty body; echo as `[]`.
 * - `text="…"` — single plain-text `TextualBody`; echo as
 *   `[{ "type": "TextualBody", "value": <that text>, "format": "text/plain" }]`.
 *   The common case, so it's worth the shorter display.
 * - `body=<JSON>` — anything else; echo the JSON verbatim.
 *
 * Existing TPEN line bodies are expected to always carry `type`, `value`, and
 * `format`. The `text=` round-trip reconstruction sets `format: "text/plain"`,
 * so `only.format === 'text/plain'` is a strict match — any other shape (no
 * format, different format, multiple bodies, non-`TextualBody`) drops to
 * `body=<JSON>` to preserve fidelity on the PUT echo.
 * @param {any} body an annotation `body` value.
 * @returns {string}
 */
function formatBody(body) {
    if (!Array.isArray(body) || body.length === 0) return 'body=[]'
    if (body.length === 1) {
        const only = body[0]
        // Require EXACTLY {type, value, format} with the expected values so the
        // `text=` → `[{type, value, format}]` round-trip is lossless. Any extra
        // field (e.g. `language`, `creator`, `id`) would be silently dropped on
        // the PUT echo and trigger a needless RERUM re-version.
        const keys = only && typeof only === 'object' ? Object.keys(only) : []
        const isPlainTextual =
            keys.length === 3
            && keys.every(k => k === 'type' || k === 'value' || k === 'format')
            && only.type === 'TextualBody'
            && typeof only.value === 'string'
            && only.format === 'text/plain'
        if (isPlainTextual) return `text=${JSON.stringify(only.value)}`
    }
    return `body=${JSON.stringify(body)}`
}

/**
 * Render the current line annotations on a page as a markdown bullet list
 * carrying the fields needed to echo each line back in a page PUT without
 * losing data. Pre-resolving this list in the parent saves the LLM a GET +
 * parse round trip. Column POSTs require the full URI to match
 * `page.items[].id` server-side; PATCH-line-text consumers can split the
 * URI's trailing segment themselves.
 *
 * Each entry exposes the body as one of three forms — `body=[]`, `text="…"`,
 * or `body=<JSON>` — consumed by the `detect-columns` and
 * `transcribe-known-lines` prompts, which document how to reconstruct each.
 * @param {any} fetchedPage the page object returned by `fetchPageResolved`.
 * @returns {string}
 */
export function formatExistingLines(fetchedPage) {
    const items = fetchedPage?.items ?? []
    if (!Array.isArray(items) || items.length === 0) {
        return '- (No existing lines on this page.)'
    }
    return items.map(item => {
        const lineUri = getIRI(item) ?? '(unknown)'
        const xywh = parseXywh(item?.target) ?? '(no xywh selector)'
        return `- ${lineUri} | ${xywh} | ${formatBody(item?.body)}`
    }).join('\n')
}
