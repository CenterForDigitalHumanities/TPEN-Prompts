/**
 * @file Shared IIIF/JSON-LD id helpers. Centralizes the two patterns that
 * appear throughout the codebase: reading an IRI off an object that may use
 * either `id` (v3) or `@id` (v2), and extracting the trailing path segment
 * from a full IRI so short-id comparisons work.
 *
 * @author thehabes
 */

/**
 * Return the IRI from a string or from an object's `id` / `@id` property.
 * @param {string|{id?: string, '@id'?: string}|null|undefined} value
 * @returns {string|null}
 */
export function getIRI(value) {
    if (!value) return null
    if (typeof value === 'string') return value
    return value.id ?? value['@id'] ?? null
}

/**
 * Return the trailing path segment of an IRI. Accepts a string or an object
 * carrying the IRI on `id` / `@id`.
 * @param {string|{id?: string, '@id'?: string}|null|undefined} value
 * @returns {string|null}
 */
export function trailingId(value) {
    const iri = getIRI(value)
    if (!iri) return null
    const parts = String(iri).split('/').filter(Boolean)
    return parts.pop() ?? null
}

/**
 * Pull a Media Fragments `xywh=…` selector value out of any of the target
 * shapes that flow through this app:
 *
 * - W3C `SpecificResource` object with `selector.value` (or `selector[0].value`
 *   when the selector is wrapped in an array).
 * - Bare string target like `"<canvasIRI>#xywh=10,20,300,40"` — historical
 *   annotations stored this way still show up in hydrated pages.
 * - Already-bare selector like `"xywh=10,20,300,40"` — the shape prompts emit
 *   in condensed fallback payloads.
 *
 * Returns the full `"xywh=…"` form (suitable for a `FragmentSelector.value`)
 * or `null` if no selector is present. Strips the non-standard `pixel:`
 * prefix that Annotorious produces.
 * @param {any} target a target value: string, `SpecificResource`, or nullish.
 * @returns {string|null}
 */
export function parseXywh(target) {
    if (typeof target === 'string') {
        if (!target.includes('xywh=')) return null
        return target.slice(target.indexOf('xywh=')).replace(/^xywh=pixel:/, 'xywh=')
    }
    if (target && typeof target === 'object') {
        const sel = target.selector
        const value = Array.isArray(sel) ? sel[0]?.value : sel?.value
        if (typeof value === 'string' && value.includes('xywh=')) {
            return value.slice(value.indexOf('xywh=')).replace(/^xywh=pixel:/, 'xywh=')
        }
    }
    return null
}
