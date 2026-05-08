/**
 * @file postMessage consumer for the transcription parent frame.
 *
 * Routes inbound messages from the TPEN parent into the `PromptsApp`
 * orchestrator. The parent's lean `TPEN_CONTEXT` boot payload triggers a
 * follow-up request for the populated project + page pair (which the
 * prompt templates need); other messages are straight pass-through.
 *
 * Replies are aimed at `parentOrigin`, captured from the first inbound
 * message; before any inbound arrives, `CONFIG.interfacesURL` is used
 * as the default target.
 *
 * @author thehabes
 */

import { CONFIG } from './config.js'

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
        /** Origin of the first inbound message; used as targetOrigin for replies. */
        this.parentOrigin = null
        /**
         * Accumulator for the two-part populated reply bundle. Filled by the
         * `TPEN_POPULATED_PROJECT` and `TPEN_POPULATED_PAGE` cases; once
         * both halves are present we hand the bundle to `acceptContext` and
         * clear it. Re-fills overwrite the previous value (the parent is
         * authoritative on each new request).
         */
        this.populated = { project: null, page: null, canvas: null, currentLineId: null, hasProject: false, hasPage: false }
        window.addEventListener('message', (event) => this.handle(event))
    }

    /**
     * Route an incoming postMessage. Unknown types are ignored.
     * @param {MessageEvent} event
     */
    handle(event) {
        this.parentOrigin ??= event.origin
        const data = event.data
        if (!data?.type) return
        switch (data.type) {
            case 'TPEN_ID_TOKEN':
                this.app.acceptAuth({ token: data.idToken ?? null })
                break
            case 'TPEN_CONTEXT':
                // Lean payload (project identity + URIs). Templates wait for
                // the populated reply pair, so we just request both here.
                this.requestPopulatedContext()
                break
            case 'TPEN_POPULATED_PROJECT':
                this.populated.project = data.project ?? null
                this.populated.hasProject = true
                this.#flushPopulatedIfReady()
                break
            case 'TPEN_POPULATED_PAGE':
                this.populated.page = data.page ?? null
                this.populated.canvas = data.canvas ?? null
                this.populated.currentLineId = data.currentLineId ?? null
                this.populated.hasPage = true
                this.#flushPopulatedIfReady()
                break
            case 'UPDATE_CURRENT_LINE':
                this.app.updateCurrentLine(data.currentLineId ?? null)
                break
            default:
                break
        }
    }

    /**
     * Hand the accumulated populated bundle to `acceptContext` once both the
     * project and page replies have arrived. Fully resets the accumulator so
     * a subsequent re-request can't surface a stale field if the gate is ever
     * loosened.
     */
    #flushPopulatedIfReady() {
        if (!this.populated.hasProject || !this.populated.hasPage) return
        const { project, page, canvas, currentLineId } = this.populated
        this.populated = { project: null, page: null, canvas: null, currentLineId: null, hasProject: false, hasPage: false }
        this.app.acceptContext({ project, page, canvas, currentLineId })
            .catch(err => console.error('acceptContext failed', err))
    }

    /**
     * Post a message to the parent frame. Replies target the origin of the
     * first inbound message; before any inbound arrives we fall back to
     * `CONFIG.interfacesURL` (the expected production parent). No-op when
     * the parent is the page itself.
     * @param {object} message
     * @returns {boolean} true when a parent frame exists and the post was dispatched.
     */
    #postToParent(message) {
        if (window.parent === window) return false
        const targetOrigin = this.parentOrigin ?? CONFIG.interfacesURL
        window.parent.postMessage(message, targetOrigin)
        return true
    }

    /** Ask the parent frame to send `TPEN_ID_TOKEN`. */
    requestAuthToken() { return this.#postToParent({ type: 'REQUEST_TPEN_ID_TOKEN' }) }

    /**
     * Ask the parent frame to send the populated project + page pair. The
     * project carries the full graph (layers/pages/columns/members); the
     * page carries items hydrated to full Annotations plus the canvas.
     */
    requestPopulatedContext() {
        this.#postToParent({ type: 'REQUEST_POPULATED_PROJECT' })
        this.#postToParent({ type: 'REQUEST_POPULATED_PAGE' })
    }
}
