/**
 * @file Thin wrapper over the TPEN Services REST API. All requests carry the
 * user's Bearer token. Endpoints verified against tpen3-services:
 * project/index.js, page/index.js, line/index.js.
 *
 * @author thehabes
 */

import { CONFIG } from './config.js'

/**
 * Call a services endpoint with the user's Bearer token and a 15s timeout.
 * On non-2xx responses throws an Error whose `.status` matches the response.
 * @param {string} path path beginning with `/`, relative to `CONFIG.servicesURL`.
 * @param {string} method HTTP verb (`GET`, `PUT`, `POST`, `PATCH`).
 * @param {any} [body] JSON-serializable body; omitted for GET.
 * @param {string} token JWT.
 * @returns {Promise<any>} parsed JSON body.
 */
async function tpenServiceRequest(path, method, body, token) {
    if (!token) throw new Error(`Missing auth token for ${path}`)
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        signal: AbortSignal.timeout(15000)
    }
    if (body !== undefined) options.body = JSON.stringify(body)
    const res = await fetch(`${CONFIG.servicesURL}${path}`, options)
    if (!res.ok) {
        // TPEN services always emit JSON errors (see tpen3-services
        // utilities/shared.js#respondWithError and utilities/routeErrorHandler.js).
        const detail = await res.json().catch(() => ({}))
        const msg = detail.message ?? detail.error ?? res.statusText
        // Prefix with the status so callers that surface `err.message` raw
        // (e.g., main.js#loadContext) still show it; the numeric status is
        // also preserved on `err.status` for programmatic handling.
        const err = new Error(`${res.status} ${path}: ${msg}`)
        err.status = res.status
        throw err
    }
    return res.json()
}

/**
 * GET a services endpoint with the user's Bearer token.
 * @param {string} path path beginning with `/`, relative to `CONFIG.servicesURL`.
 * @param {string} token JWT.
 * @returns {Promise<any>} parsed JSON body.
 */
function authedGet(path, token) {
    return tpenServiceRequest(path, 'GET', undefined, token)
}

/**
 * Fetch a project record.
 * @param {string} projectID short id (not a full IRI).
 * @param {string} token
 * @returns {Promise<any>}
 */
export function fetchProject(projectID, token) {
    return authedGet(`/project/${encodeURIComponent(projectID)}`, token)
}

/**
 * Fetch a TPEN Page with its line annotations hydrated server-side. The
 * `/resolved` variant returns each entry in `items[]` as a full Annotation
 * (with `target.selector.value`) rather than an id/type stub.
 * @param {string} projectID
 * @param {string} pageID short id or full IRI; only the trailing segment is used server-side.
 * @param {string} token
 * @returns {Promise<any>}
 */
export function fetchPageResolved(projectID, pageID, token) {
    return authedGet(`/project/${encodeURIComponent(projectID)}/page/${encodeURIComponent(pageID)}/resolved`, token)
}

/**
 * PUT a page body (`{ items: [...] }`). Used by the fallback JSON-paste flow
 * when the user's LLM cannot issue writes itself. Items may be new (no `id`,
 * or a non-http local id) or updates (item `id` is the line's full IRI).
 *
 * Note: items whose `body` is omitted get `body=[]` on the server — the Line
 * class sets `body: this.body ?? []` before saving, which spreads over the existing
 * RERUM document. Echo each existing item's body back to preserve its
 * transcription.
 * @param {string} projectID
 * @param {string} pageID
 * @param {{ items: Array<any> }} body
 * @param {string} token
 * @returns {Promise<any>}
 */
export function putPage(projectID, pageID, body, token) {
    return tpenServiceRequest(
        `/project/${encodeURIComponent(projectID)}/page/${encodeURIComponent(pageID)}`,
        'PUT', body, token
    )
}

/**
 * Build the page endpoint URL (page/index.js). Templates use this for PUT/PATCH
 * operations that target the page or its sub-resources (lines, columns).
 * @param {string} projectID
 * @param {string} pageID
 * @returns {string} absolute URL.
 */
export function pageEndpoint(projectID, pageID) {
    return `${CONFIG.servicesURL}/project/${encodeURIComponent(projectID)}/page/${encodeURIComponent(pageID)}`
}
