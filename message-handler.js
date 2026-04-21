/**
 * @file postMessage consumer for the transcription parent frame.
 *
 * The parent pushes `TPEN_CONTEXT` unprompted on iframe load, carrying the
 * hydrated `project`, `page`, and `canvas` objects. Line navigation arrives
 * as `UPDATE_CURRENT_LINE` deltas. The token is separate and user-gated:
 * clicking the consent button sends `REQUEST_TPEN_ID_TOKEN` upstream, and
 * the parent replies with `TPEN_ID_TOKEN`.
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
                this.app.acceptAuth({ token: data.idToken ?? null })
                break
            case 'TPEN_CONTEXT':
                this.app.acceptContext(data).catch(err => console.error('acceptContext failed', err))
                break
            case 'UPDATE_CURRENT_LINE':
                this.app.updateCurrentLine(data.currentLineId ?? null)
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
}
