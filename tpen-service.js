/**
 * @file Thin wrapper over the TPEN Services REST API. All requests carry the
 * user's Bearer token. Endpoints verified against tpen3-services:
 * project/index.js, page/index.js, line/index.js.
 *
 * @author thehabes
 */

import { CONFIG } from './config.js'

/**
 * GET a services endpoint with the user's Bearer token and a 15s timeout.
 * On non-2xx responses throws an Error whose `.status` matches the response.
 * @param {string} path path beginning with `/`, relative to `CONFIG.servicesURL`.
 * @param {string} token JWT.
 * @returns {Promise<any>} parsed JSON body.
 */
async function authedGet(path, token) {
    if (!token) throw new Error(`Missing auth token for ${path}`)
    const res = await fetch(`${CONFIG.servicesURL}${path}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) {
        const detail = await res.text().catch(() => '')
        const err = new Error(`${res.status} ${res.statusText} — ${path}${detail ? `: ${detail}` : ''}`)
        err.status = res.status
        throw err
    }
    return res.json()
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
 * Build the page endpoint URL (page/index.js). Templates use this for PUT/PATCH
 * operations that target the page or its sub-resources (lines, columns).
 * @param {string} projectID
 * @param {string} pageID
 * @returns {string} absolute URL.
 */
export function pageEndpoint(projectID, pageID) {
    return `${CONFIG.servicesURL}/project/${encodeURIComponent(projectID)}/page/${encodeURIComponent(pageID)}`
}

/**
 * Build the POST URL that creates a line on a page (line/index.js:50).
 * Templates bake this into generated prompts so an agentic LLM knows where
 * to send the annotation it produces.
 * @param {string} projectID
 * @param {string} pageID
 * @returns {string} absolute URL.
 */
export function lineCreateEndpoint(projectID, pageID) {
    return `${pageEndpoint(projectID, pageID)}/line`
}
