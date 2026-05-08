/**
 * @file postMessage consumer for the transcription parent frame.
 *
 * The parent pushes a lean `TPEN_CONTEXT` payload (project identity + URIs
 * only) unprompted on iframe load. TPEN-Prompts needs the fully-hydrated
 * project and page for prompt-template rendering, so on boot it sends a
 * `REQUEST_HYDRATED_CONTEXT` reply and the parent answers with
 * `TPEN_HYDRATED_CONTEXT` carrying the hydrated objects.
 *
 * Line navigation arrives as `UPDATE_CURRENT_LINE` deltas. The token is
 * separate and user-gated: clicking the consent button sends
 * `REQUEST_TPEN_ID_TOKEN` upstream, and the parent replies with
 * `TPEN_ID_TOKEN`.
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
                // TPEN_HYDRATED_CONTEXT, so we just request hydration here.
                this.requestHydratedContext()
                break
            case 'TPEN_HYDRATED_CONTEXT':
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

    /** Ask the parent frame to send `TPEN_HYDRATED_CONTEXT`. */
    requestHydratedContext() { return this.#postToParent({ type: 'REQUEST_HYDRATED_CONTEXT' }) }
}
