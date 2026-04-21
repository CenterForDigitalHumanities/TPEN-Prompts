/**
 * @file TPEN-Prompts orchestrator.
 *
 * Iframed mode: the parent pushes one `TPEN_CONTEXT` payload on iframe load
 * carrying the fully-hydrated `project`, `page`, and `canvas` objects. The
 * child renders directly from that payload — no REST round-trips, no request/
 * reply handshake. The `TPEN_ID_TOKEN` flow remains user-gated and separate.
 *
 * Standalone mode: reads URL params, fetches project (+ optionally page) from
 * the TPEN services API, resolves layer/column/line from the project graph.
 *
 * @author thehabes
 */

import { resolveToken, persistToken, clearStoredToken } from './auth.js'
import { fetchProject, fetchPageResolved } from './tpen-service.js'
import { UIManager } from './ui-manager.js'
import { MessageHandler } from './message-handler.js'
import { initTemplates } from './prompt-generator.js'
import { getIRI, trailingId } from './iiif-ids.js'

const PARAM_KEYS = ['projectID', 'pageID', 'layerID', 'columnID', 'lineID']

/**
 * Top-level controller. Owns the auth token and the currently-loaded
 * project/page/line ids, and delegates rendering to `UIManager` and
 * parent-frame messaging to `MessageHandler`.
 */
export class PromptsApp {
    constructor() {
        this.ui = new UIManager('app')
        this.messages = new MessageHandler(this)
        /** @type {string|null} */
        this.token = null
    }

    /**
     * Bootstrap the app. Iframed: show an awaiting screen and wait for the
     * parent to push `TPEN_CONTEXT`. Standalone: render the id-entry form
     * (or load directly when `projectID` is in the URL).
     * @returns {Promise<void>}
     */
    async init() {
        const iframed = window.parent !== window

        // Paint the awaiting screen SYNCHRONOUSLY, before any await. Otherwise
        // a `TPEN_CONTEXT` message that lands during `await initTemplates()`
        // renders the workspace, and then this init() continuation silently
        // overwrites it with the awaiting screen.
        if (iframed) {
            clearStoredToken()
            this.token = null
            this.ui.renderAwaitingParent({
                message: 'Awaiting TPEN session — context will load from the parent.',
                showAuthButton: true,
                onRequestAuth: () => this.messages.requestAuthToken()
            })
        }

        await initTemplates()

        if (iframed) return

        if (!this.token) this.token = resolveToken()

        const params = new URLSearchParams(location.search)
        const args = Object.fromEntries(PARAM_KEYS.map(k => [k, params.get(k) ?? '']))

        if (!args.projectID) {
            this.ui.renderIdForm({
                initial: args,
                onSubmit: (formArgs) => this.#loadContext(formArgs)
            })
            return
        }

        await this.#loadContext(args)
    }

    /**
     * Accept an auth payload from the parent frame. Stores the token and
     * propagates it to any workspace already on screen so the next prompt
     * generation includes it.
     * @param {{ token: string|null }} payload
     */
    acceptAuth({ token }) {
        const stored = persistToken(token)
        if (stored) this.token = stored
        if (!this.token) {
            this.ui.setStatus('Parent sent no valid token; reload the parent to re-authenticate.', 'error')
            return
        }
        this.ui.updateToken(this.token)
    }

    /**
     * Accept a `TPEN_CONTEXT` payload from the parent. The payload is expected
     * to carry hydrated `project`, `page`, and `canvas` objects; anything
     * missing is resolved here as a safety net — REST fetches for project/page
     * (auth required), direct HTTP for the canvas via its IIIF id on
     * `page.target`.
     * @param {{ project: any, page: any, canvas: any, currentLineId: string|null }} payload
     */
    async acceptContext(payload) {
        let project = payload?.project ?? null
        let page = payload?.page ?? null
        let canvas = payload?.canvas ?? null

        let projectID = project?._id ?? project?.id ?? null
        if (!projectID) {
            this.ui.setStatus('Parent sent no project.', 'error')
            return
        }

        // Upgrade a stub project (no layers) when we have a token.
        if (!project.layers && this.token) {
            try { project = await fetchProject(projectID, this.token) } catch (err) { console.warn('fetchProject failed', err) }
        }

        const pageID = page ? (trailingId(page) ?? '') : ''
        // Upgrade a stub page (no items) when we have a token and a pageID.
        if (page && !Array.isArray(page.items) && this.token && pageID) {
            try { page = await fetchPageResolved(projectID, pageID, this.token) ?? page } catch (err) { console.warn('fetchPageResolved failed', err) }
        }

        // Resolve the canvas from page.target (IIIF canvas URI) when the
        // parent didn't hydrate it. No auth needed; canvases are public IIIF.
        if (!canvas && page) {
            canvas = await resolveCanvasForPage(page)
        }
        // Fall back to the project manifest when the canvas lacks partOf, so
        // templates can still render a manifest URI.
        if (canvas && !canvas.partOf) {
            const projectManifest = Array.isArray(project?.manifest) ? project.manifest[0] : project?.manifest
            if (projectManifest) canvas.partOf = projectManifest
        }

        const lineID = payload.currentLineId ? (trailingId(payload.currentLineId) ?? '') : ''

        this.ui.renderWorkspace({
            projectID,
            pageID,
            layerID: '', columnID: '',
            lineID,
            project, page, canvas,
            layer: null, column: null, line: null,
            token: this.token,
            onRequestAuth: () => this.messages.requestAuthToken()
        })
    }

    /**
     * Update the current line id on the rendered workspace. Called when the
     * parent sends `UPDATE_CURRENT_LINE` in response to line navigation.
     * @param {string|null} lineId full line IRI or null.
     */
    updateCurrentLine(lineId) {
        this.ui.updateCurrentLine(lineId ? (trailingId(lineId) ?? '') : '')
    }

    /**
     * Fetch the project (and page, in parallel), resolve layer/column/line
     * from the returned graph, and hand the fully-populated context to the UI.
     * Errors are surfaced via the status line.
     * @param {{ projectID: string, pageID: string, layerID: string, columnID: string, lineID: string }} args
     * @returns {Promise<void>}
     */
    async #loadContext(args) {
        this.ui.setStatus('Loading project…')
        try {
            const [project, page] = await Promise.all([
                fetchProject(args.projectID, this.token),
                args.pageID ? fetchPageResolved(args.projectID, args.pageID, this.token) : null
            ])
            const canvas = page ? await resolveCanvasForPage(page) : null
            const layer = args.layerID ? findByTrailingId(project?.layers, args.layerID) : null
            const column = args.columnID ? findColumn(project, args.columnID) : null
            const line = (args.lineID && page) ? findByTrailingId(page?.items, args.lineID) : null

            this.ui.renderWorkspace({
                ...args,
                project, page, canvas, layer, column, line,
                token: this.token
            })
        } catch (err) {
            this.ui.setStatus(`Failed to load: ${err.message}`, 'error')
        }
    }
}

/**
 * Find an item whose id matches by trailing path segment.
 *
 * Callers may pass a short id or a full IRI — project ids in URL params are
 * short; layer/page/line ids inside project payloads are full IRIs ending in
 * the short id.
 * @param {Array<{ id?: string, '@id'?: string }>|null|undefined} items
 * @param {string|null|undefined} idOrIri
 * @returns {any|null}
 */
function findByTrailingId(items, idOrIri) {
    if (!items || !idOrIri) return null
    const tail = trailingId(idOrIri)
    return items.find(it => trailingId(it) === tail) ?? null
}

/**
 * Search every layer's pages for a column matching `columnID` by trailing id.
 * @param {any} project
 * @param {string} columnID
 * @returns {any|null}
 */
function findColumn(project, columnID) {
    if (!project?.layers) return null
    for (const layer of project.layers) {
        for (const pg of layer.pages ?? []) {
            const col = findByTrailingId(pg.columns, columnID)
            if (col) return col
        }
    }
    return null
}

/**
 * Resolve the canvas referenced by a page's `target`.
 *
 * A TPEN page is an AnnotationPage; its target is the canvas. The target may
 * be an inline object or a plain string id — both forms are handled. On fetch
 * failure returns a stub `{ id }` so the workspace still renders.
 * @param {any} page
 * @returns {Promise<any|null>}
 */
async function resolveCanvasForPage(page) {
    const target = page?.target
    if (!target) return null
    if (typeof target === 'object' && (target.items || target.width)) return target
    const canvasId = getIRI(target)
    if (!canvasId) return null
    if (!isSafeHttpUrl(canvasId)) {
        console.warn('Canvas id rejected (non-http(s))', canvasId)
        return { id: canvasId }
    }
    try {
        const res = await fetch(canvasId, { signal: AbortSignal.timeout(15000) })
        if (!res.ok) {
            console.warn('Canvas fetch failed', canvasId, res.status)
            return { id: canvasId }
        }
        return await res.json()
    } catch (err) {
        console.warn('Canvas fetch threw', canvasId, err)
        return { id: canvasId }
    }
}

/**
 * True when `value` parses as an `http:` or `https:` URL. Guards `fetch`
 * against `javascript:`/`data:`/`file:` strings in upstream payloads.
 * @param {string} value
 * @returns {boolean}
 */
function isSafeHttpUrl(value) {
    try {
        const u = new URL(value, location.href)
        return u.protocol === 'http:' || u.protocol === 'https:'
    } catch { return false }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new PromptsApp()
    app.init().catch(err => {
        console.error('init failed', err)
        app.ui.setStatus(`Startup failed: ${err.message}`, 'error')
    })
})
