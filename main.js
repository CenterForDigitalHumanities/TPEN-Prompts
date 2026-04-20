/**
 * @file TPEN-Prompts orchestrator.
 *
 * On load: resolve auth, read URL params, fetch project (+ optionally page),
 * resolve layer/column/line from the project graph, hand off to the UI.
 * Same bootstrap shape as tpen-page-viewer/viewer.js.
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
        /**
         * Context received from the parent before a token was held; applied
         * once the user authorizes. Stores the full `TPEN_CONTEXT` payload as
         * received from `acceptContext`.
         * @type {Parameters<PromptsApp['acceptContext']>[0] | null}
         */
        this.pendingContext = null
    }

    /**
     * Bootstrap the app. Pulls URL params and either renders the id form
     * (standalone with a token) or waits on parent auth (iframed / no token).
     * @returns {Promise<void>}
     */
    async init() {
        await initTemplates()
        const iframed = window.parent !== window

        // Iframed mode requires fresh consent on every page load — clear any
        // cached token before resolving so the user always re-clicks "Request
        // TPEN token from parent". Standalone mode keeps the cached token.
        if (iframed) {
            clearStoredToken()
            this.token = null
        } else {
            this.token = resolveToken()
        }

        // Never initiate login. Auth arrives via parent postMessage (iframed)
        // or ?idToken= on the URL (standalone). If neither is available, stay
        // in the awaiting state — the user clicks the token button to consent.
        if (iframed || !this.token) {
            this.ui.renderAwaitingParent({
                message: 'Awaiting TPEN session — request a token to authorize this tool.',
                showAuthButton: iframed,
                showContextButton: false,
                onRequestAuth: () => this.messages.requestAuthToken(),
                onRequestContext: () => this.messages.requestContext()
            })
            // Context can be fetched without consent, so kick that off now and
            // cache it. The user still has to click for the token.
            if (iframed) this.messages.requestContext()
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
     * Accept an auth payload from the parent frame. If a context payload
     * arrived before the token was authorized, render the workspace from it;
     * otherwise re-request context.
     * @param {{ token: string|null }} payload
     */
    acceptAuth({ token }) {
        const stored = persistToken(token)
        if (stored) this.token = stored
        if (!this.token) {
            this.ui.setStatus('Parent sent no valid token; reload the parent to re-authenticate.', 'error')
            return
        }
        // Apply context that arrived before the token was authorized.
        if (this.pendingContext?.projectID) {
            const ctx = this.pendingContext
            this.pendingContext = null
            this.#applyContextFromPayload(ctx)
            return
        }
        // No context yet — re-request it. Surface the manual button in case
        // the initial auto-request was dropped (parentOrigin wasn't set when
        // init fired).
        this.ui.renderAwaitingParent({
            message: 'Token received — fetching project context…',
            showContextButton: true,
            onRequestContext: () => this.messages.requestContext()
        })
        this.messages.requestContext()
    }

    /**
     * Accept a `TPEN_CONTEXT` payload from the parent. If a token is already
     * held, render the workspace immediately from the payload — no service
     * fetches. Otherwise cache the payload and wait for the user to authorize
     * the token.
     * @param {{ projectID: string|null, projectLabel: string|null,
     *           pageID: string|null, pageLabel?: string|null,
     *           canvasId: string|null, canvasWidth: number|null, canvasHeight: number|null,
     *           imageUrl: string|null, manifestUri: string|null, columns: Array }} payload
     * @returns {Promise<void>}
     */
    async acceptContext(payload) {
        if (!payload?.projectID) {
            this.ui.setStatus('Parent returned no projectID.', 'error')
            return
        }
        if (!this.token) {
            this.pendingContext = payload
            this.ui.renderAwaitingParent({
                message: 'TPEN context received — permit token usage to continue.',
                showAuthButton: true,
                showContextButton: false,
                onRequestAuth: () => this.messages.requestAuthToken(),
                onRequestContext: () => this.messages.requestContext()
            })
            return
        }
        this.#applyContextFromPayload(payload)
    }

    /**
     * Render the workspace from a TPEN_CONTEXT payload. Builds minimal
     * `project` / `canvas` stubs from the payload; fetches the full page when
     * a pageID and token are available so `page.items` (line annotations) are
     * populated for template helpers like `formatExistingLines`. Falls back to
     * a page stub if the fetch fails.
     * @param {{ projectID: string, projectLabel?: string|null,
     *           pageID?: string|null, pageLabel?: string|null,
     *           canvasId?: string|null, canvasWidth?: number|null, canvasHeight?: number|null,
     *           imageUrl?: string|null, manifestUri?: string|null, columns?: Array }} payload
     */
    async #applyContextFromPayload(payload) {
        const project = { id: payload.projectID, label: payload.projectLabel ?? payload.projectID }
        let page = null
        if (payload.pageID) {
            if (this.token) {
                try {
                    page = await fetchPageResolved(payload.projectID, payload.pageID, this.token)
                } catch (err) {
                    console.warn('fetchPageResolved failed; falling back to stub', err)
                }
            }
            page ??= { id: payload.pageID, label: payload.pageLabel ?? null, columns: payload.columns ?? [] }
        }
        const canvas = payload.canvasId ? {
            id: payload.canvasId,
            width: payload.canvasWidth ?? null,
            height: payload.canvasHeight ?? null,
            partOf: payload.manifestUri ?? null,
            items: payload.imageUrl
                ? [{ items: [{ body: { id: payload.imageUrl } }] }]
                : []
        } : null

        this.ui.renderWorkspace({
            projectID: payload.projectID,
            pageID: payload.pageID ?? '',
            layerID: '', columnID: '', lineID: '',
            project, page, canvas,
            layer: null, column: null, line: null,
            token: this.token
        })
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
