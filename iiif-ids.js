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
    return iri ? String(iri).split('/').pop() : null
}
