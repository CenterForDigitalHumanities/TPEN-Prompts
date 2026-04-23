/**
 * @file Shared `buildContext` helper for prompt templates.
 *
 * Every template consumes a superset of flat `{{name}}` variables produced by
 * `buildTemplateContext`. Individual templates only reference the subset they
 * need in their PROMPT.md body — unused keys simply don't render. Templates
 * that need richer context (e.g. existing column listings) spread this result
 * and layer their own keys on top.
 *
 * @author thehabes
 */

import { getIRI, trailingId } from '../iiif-ids.js'

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
    const { canvas, page, projectID, pageID, pageEndpoint, token } = ctx
    const canvasId = getIRI(canvas) ?? '(unknown canvas id)'
    const imageUrl = extractImageUrl(canvas) ?? '(no image body found on canvas)'
    const { width, height } = canvasDimensions(canvas)
    const canvasWidth = width != null ? String(width) : '(unknown)'
    const canvasHeight = height != null ? String(height) : '(unknown)'
    const lineCount = Array.isArray(page?.items) ? page.items.length : 0
    return {
        projectID: projectID ?? '',
        pageID: pageID ?? '',
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
 * Extract an `xywh=x,y,w,h` fragment from a line annotation's target, accepting
 * both `target.selector.value` and a plain `"source#xywh=..."` string target.
 * Strips the non-standard `pixel:` prefix introduced by Annotorious — prompts
 * and any annotations produced downstream must use plain integer coordinates.
 * @param {any} item
 * @returns {string|null}
 */
function extractXywh(item) {
    const sel = item?.target?.selector
    const selValue = Array.isArray(sel) ? sel[0]?.value : sel?.value
    let raw = null
    if (typeof selValue === 'string' && selValue.includes('xywh=')) {
        raw = selValue.slice(selValue.indexOf('xywh='))
    } else {
        const target = typeof item?.target === 'string' ? item.target : null
        if (target && target.includes('#xywh=')) raw = target.slice(target.indexOf('xywh='))
    }
    return raw ? raw.replace(/^xywh=pixel:/, 'xywh=') : null
}

/**
 * Render the current line annotations on a page as a markdown bullet list
 * carrying the fields needed to echo each line back in a page PUT without
 * losing data. Pre-resolving this list in the parent saves the LLM a GET +
 * parse round trip. Column POSTs require the full URI to match
 * `page.items[].id` server-side; PATCH-line-text consumers can split the
 * URI's trailing segment themselves.
 *
 * Body is included verbatim (as compact JSON) because the services API
 * replaces `body` with `[]` if the PUT item omits it — echoing the existing
 * body prevents accidental transcription wipes.
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
        const xywh = extractXywh(item) ?? '(no xywh selector)'
        const body = JSON.stringify(item?.body ?? [])
        return `- ${lineUri} | xywh=${xywh} | body=${body}`
    }).join('\n')
}

/**
 * Render the current column state for a given page as a markdown bullet list.
 * Used by templates that must avoid duplicate column labels. The directly
 * fetched `page` is authoritative when supplied, since the project graph may
 * not hydrate `layer.pages[].columns` for every page.
 * @param {any} project the TPEN project object.
 * @param {string|null|undefined} pageID the short page id or full page IRI.
 * @param {any} [fetchedPage] the page object returned by `fetchPageResolved`, preferred when available.
 * @returns {string}
 */
export function formatExistingColumns(project, pageID, fetchedPage = null) {
    const tail = trailingId(pageID)
    const projectPage = (project?.layers ?? [])
        .flatMap(l => l.pages ?? [])
        .find(pg => trailingId(pg) === tail)
    const cols = fetchedPage?.columns ?? projectPage?.columns ?? []
    if (!Array.isArray(cols) || cols.length === 0) {
        return '- (No existing columns on this page — labels must be unique when created.)'
    }
    return cols.map(c => `- ${c.label ?? '(unlabeled)'}: ${(c.lines ?? c.annotations ?? []).length} line(s)`).join('\n')
}
