/**
 * @file postMessage consumer for the transcription parent frame.
 *
 * The parent never auto-pushes to this tool. The user clicks the
 * "Request token" / "Request context" buttons, which send
 * `REQUEST_TPEN_ID_TOKEN` / `REQUEST_TPEN_CONTEXT` upstream. The parent
 * replies with `TPEN_ID_TOKEN` / `TPEN_CONTEXT`; those replies are the
 * only inbound types this handler acts on.
 *
 * @author thehabes
 */

import { CONFIG } from './config.js'
import { trailingId } from './iiif-ids.js'

// Accept messages only from known TPEN3 origins and the current origin (for
// same-origin dev harnesses). Anything else could inject auth tokens or drive
// the tool's state, so drop silently.
const ALLOWED_ORIGINS = new Set([
    CONFIG.TPEN3URL,
    location.origin
])

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
        /** Origin of the first trusted inbound message; used as targetOrigin for replies. */
        this.parentOrigin = null
        window.addEventListener('message', (event) => this.handle(event))
    }

    /**
     * Route an incoming postMessage. Origin-gated; unknown types are ignored.
     * @param {MessageEvent} event
     */
    handle(event) {
        if (!ALLOWED_ORIGINS.has(event.origin)) return
        this.parentOrigin ??= event.origin
        const data = event.data
        if (!data?.type) return
        switch (data.type) {
            case 'TPEN_ID_TOKEN':
                Promise.resolve(this.app.acceptAuth({
                    token: data.idToken ?? null
                })).catch(err => console.error('acceptAuth failed', err))
                break
            case 'TPEN_CONTEXT':
                Promise.resolve(this.app.acceptContext({
                    projectID: data.projectId ?? null,
                    projectLabel: data.projectLabel ?? null,
                    pageID: data.pageId ? trailingId(data.pageId) : null,
                    pageLabel: data.pageLabel ?? null,
                    canvasId: data.canvasId ?? null,
                    canvasWidth: data.canvasWidth ?? null,
                    canvasHeight: data.canvasHeight ?? null,
                    imageUrl: data.imageUrl ?? null,
                    manifestUri: data.manifestUri ?? null,
                    columns: Array.isArray(data.columns) ? data.columns : []
                })).catch(err => console.error('acceptContext failed', err))
                break
            default:
                break
        }
    }

    /**
     * Post a message to the parent frame. Replies target the origin of the
     * first trusted inbound message; before any inbound arrives we fall back
     * to `CONFIG.TPEN3URL` (the expected production parent). No-op when the
     * parent is the page itself.
     * @param {object} message
     * @returns {boolean} true when a parent frame exists and the post was dispatched.
     */
    #postToParent(message) {
        if (window.parent === window) return false
        const targetOrigin = this.parentOrigin ?? CONFIG.TPEN3URL
        window.parent.postMessage(message, targetOrigin)
        return true
    }

    /** Ask the parent frame to send `TPEN_ID_TOKEN`. */
    requestAuthToken() { return this.#postToParent({ type: 'REQUEST_TPEN_ID_TOKEN' }) }

    /** Ask the parent frame to send `TPEN_CONTEXT`. */
    requestContext() { return this.#postToParent({ type: 'REQUEST_TPEN_CONTEXT' }) }
}
