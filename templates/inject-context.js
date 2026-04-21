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

import { getAgentIRIFromToken } from '../auth.js'
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
    const { canvas, project, page, projectID, pageID, projectEndpoint, pageEndpoint, token } = ctx
    const canvasId = getIRI(canvas) ?? '(unknown canvas id)'
    const imageUrl = extractImageUrl(canvas) ?? '(no image body found on canvas)'
    const { width, height } = canvasDimensions(canvas)
    const canvasWidth = width != null ? String(width) : '(unknown)'
    const canvasHeight = height != null ? String(height) : '(unknown)'
    const dims = (width && height) ? `${width} × ${height}` : 'unknown (use the IIIF Image API info.json)'
    const projectManifest = Array.isArray(project?.manifest) ? project.manifest[0] : project?.manifest
    const manifestUri = getIRI(canvas?.partOf) ?? getIRI(projectManifest) ?? '(unknown manifest URI)'
    const userAgentURI = getAgentIRIFromToken(token) ?? '(unable to resolve agent IRI from token)'
    const canvasDimsResolution = (width && height)
        ? `Canvas dimensions are already resolved as ${width} × ${height} — use these values directly; no fetch required.`
        : `Canvas dimensions unknown. GET \`${canvasId}\` and read \`width\`/\`height\`. If that fails, GET \`${manifestUri}\` and find the matching canvas in \`items\` by id.`
    const lineCount = Array.isArray(page?.items) ? page.items.length : 0
    return {
        projectID: projectID ?? '',
        pageID: pageID ?? '',
        canvasId,
        imageUrl,
        canvasWidth,
        canvasHeight,
        dims,
        canvasDimsResolution,
        manifestUri,
        userAgentURI,
        lineCount: String(lineCount),
        projectEndpoint: projectEndpoint ?? '(unknown project endpoint)',
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
 * keyed by trailing line id and xywh selector. Pre-resolving this list in the
 * parent saves the LLM a GET + parse round trip.
 * @param {any} fetchedPage the page object returned by `fetchPageResolved`.
 * @returns {string}
 */
export function formatExistingLines(fetchedPage) {
    const items = fetchedPage?.items ?? []
    if (!Array.isArray(items) || items.length === 0) {
        return '- (No existing lines on this page.)'
    }
    return items.map(item => {
        const lineId = trailingId(item) ?? '(unknown)'
        const xywh = extractXywh(item) ?? '(no xywh selector)'
        return `- ${lineId}: ${xywh}`
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
