/**
 * @file postMessage consumer for the transcription parent frame.
 *
 * Parent posts `MANIFEST_CANVAS_ANNOTATIONPAGE_ANNOTATION`, `CANVASES`, and
 * `CURRENT_LINE_INDEX` on iframe load, and `SELECT_ANNOTATION` on line
 * changes. URL params still drive the initial load; these messages handle
 * parent→child updates afterward. `AUTH_TOKEN` is also accepted here and
 * handed to the app, since the tool never initiates login itself.
 *
 * @author thehabes
 */

import { CONFIG } from './config.js'

// Accept messages only from known TPEN3 origins and the current origin (for
// same-origin dev harnesses). Anything else could inject auth tokens or drive
// the tool's state, so drop silently.
const ALLOWED_ORIGINS = new Set([
    CONFIG.TPEN3URL,
    location.origin
])

/**
 * Return the trailing id segment of an IRI (string or object with `id`/`@id`).
 * @param {string|{id?: string, '@id'?: string}|null|undefined} iri
 * @returns {string|null}
 */
function trailingId(iri) {
    if (!iri) return null
    const s = typeof iri === 'string' ? iri : (iri.id ?? iri['@id'] ?? '')
    return s ? String(s).split('/').pop() : null
}

/**
 * Listens on `window` for postMessage traffic from the TPEN3 parent and routes
 * recognized message types to the `PromptsApp`.
 */
export class MessageHandler {
    /**
     * @param {import('./main.js').PromptsApp} app the orchestrator receiving auth and context updates.
     */
    constructor(app) {
        this.app = app
        window.addEventListener('message', (event) => this.handle(event))
    }

    /**
     * Route an incoming postMessage. Origin-gated; unknown types are ignored.
     * @param {MessageEvent} event
     */
    handle(event) {
        if (!ALLOWED_ORIGINS.has(event.origin)) return
        const data = event.data
        if (!data?.type) return
        switch (data.type) {
            case 'AUTH_TOKEN':
                Promise.resolve(this.app.acceptAuth?.({
                    token: data.token ?? null,
                    projectID: data.projectID ?? null,
                    pageID: data.pageID ?? null
                })).catch(err => console.error('acceptAuth failed', err))
                break
            case 'MANIFEST_CANVAS_ANNOTATIONPAGE_ANNOTATION':
                this.#onPageContext(data)
                break
            case 'SELECT_ANNOTATION':
            case 'CURRENT_LINE_INDEX':
                this.app.lineID = data.lineId ?? this.app.lineID ?? null
                break
            default:
                break
        }
    }

    /**
     * Handle a page/context change from the parent: if the new page differs
     * from what we're showing, reload the workspace for it.
     * @param {{ annotationPage?: string|{id?: string, '@id'?: string} }} data
     */
    #onPageContext(data) {
        if (!this.app.token) return
        const pageID = trailingId(data.annotationPage)
        if (!pageID) return
        if (pageID === this.app.pageID) return
        const projectID = this.app.projectID
        if (!projectID) return
        Promise.resolve(this.app.reloadContext?.({ projectID, pageID }))
            .catch(err => console.error('reloadContext failed', err))
    }
}
