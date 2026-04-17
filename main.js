/**
 * @file TPEN-Prompts orchestrator.
 *
 * On load: resolve auth, read URL params, fetch project (+ optionally page),
 * resolve layer/column/line from the project graph, hand off to the UI.
 * Same bootstrap shape as tpen-page-viewer/viewer.js.
 *
 * @author thehabes
 */

import { resolveToken, persistToken } from './auth.js'
import { fetchProject, fetchPage } from './tpen-service.js'
import { UIManager } from './ui-manager.js'
import { MessageHandler } from './message-handler.js'

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
        /** @type {string|null} */
        this.projectID = null
        /** @type {string|null} */
        this.layerID = null
        /** @type {string|null} */
        this.pageID = null
        /** @type {string|null} */
        this.columnID = null
        /** @type {string|null} */
        this.lineID = null
    }

    /**
     * Bootstrap the app. Pulls URL params and either renders the id form
     * (standalone with a token) or waits on parent auth (iframed / no token).
     * @returns {Promise<void>}
     */
    async init() {
        this.token = resolveToken()
        const iframed = window.parent !== window

        // Never initiate login. Auth arrives via parent postMessage (iframed)
        // or ?idToken= on the URL (standalone). If neither is available, stay
        // in the awaiting state — the MessageHandler will kick off loading if
        // a token shows up later.
        if (iframed || !this.token) {
            this.ui.setStatus('Awaiting TPEN session…')
            return
        }

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
     * Accept an auth payload from the parent frame and load the workspace.
     * @param {{ token: string|null, projectID: string|null, pageID?: string|null }} payload
     * @returns {Promise<void>}
     */
    async acceptAuth({ token, projectID, pageID }) {
        const stored = persistToken(token)
        if (stored) this.token = stored
        if (!this.token) {
            this.ui.setStatus('Parent sent no valid token; reload the parent to re-authenticate.', 'error')
            return
        }
        if (!projectID) {
            this.ui.setStatus('Waiting for parent to send a project context…')
            return
        }
        await this.#loadContext({
            projectID,
            pageID: pageID ?? '',
            layerID: '',
            columnID: '',
            lineID: ''
        })
    }

    /**
     * Re-run `#loadContext` with a patch applied on top of the current ids.
     * Called by the `MessageHandler` when the parent navigates pages.
     * @param {Partial<{ projectID: string, pageID: string, layerID: string, columnID: string, lineID: string }>} args
     * @returns {Promise<void>}
     */
    reloadContext(args) {
        return this.#loadContext({ ...this.#currentArgs(), ...args })
    }

    /**
     * Snapshot the current ids in the arg shape expected by `#loadContext`.
     * @returns {{ projectID: string, pageID: string, layerID: string, columnID: string, lineID: string }}
     */
    #currentArgs() {
        return {
            projectID: this.projectID ?? '',
            pageID: this.pageID ?? '',
            layerID: this.layerID ?? '',
            columnID: this.columnID ?? '',
            lineID: this.lineID ?? ''
        }
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
                args.pageID ? fetchPage(args.projectID, args.pageID, this.token) : null
            ])
            const canvas = page ? await resolveCanvasForPage(page) : null
            const layer = args.layerID ? findByTrailingId(project?.layers, args.layerID) : null
            const column = args.columnID ? findColumn(project, args.columnID) : null
            const line = (args.lineID && page) ? findByTrailingId(page?.items, args.lineID) : null

            this.projectID = args.projectID
            this.layerID = args.layerID || null
            this.pageID = args.pageID || null
            this.columnID = args.columnID || null
            this.lineID = args.lineID || null
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
    const tail = String(idOrIri).split('/').pop()
    return items.find(it => String(it.id ?? it['@id'] ?? '').split('/').pop() === tail) ?? null
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
    const canvasId = typeof target === 'string' ? target : (target.id ?? target['@id'])
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
