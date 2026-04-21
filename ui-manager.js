/**
 * @file DOM rendering for TPEN-Prompts. No frameworks, no shadow DOM, one
 * global stylesheet — same bones as tpen-page-viewer/ui-manager.js.
 *
 * All dynamic content is set via `textContent` / property assignment (never
 * `innerHTML`) to keep user- and API-provided strings out of the HTML parser.
 *
 * @author thehabes
 */

import { listTemplates, renderTemplate } from './prompt-generator.js'
import { pageEndpoint, projectEndpoint } from './tpen-service.js'
import { trailingId } from './iiif-ids.js'

/**
 * Build a DOM element. Recognizes a few special prop keys:
 * - `class` → `className`
 * - `text` → `textContent`
 * - `attrs` → an object of `setAttribute` pairs
 *
 * Anything else is assigned as a direct property (e.g. `value`, `disabled`).
 * Null/undefined children and props are skipped.
 * @param {string} tag
 * @param {Record<string, any>} [props]
 * @param {Node|Array<Node|null|undefined>} [children]
 * @returns {HTMLElement}
 */
const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag)
    for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined) continue
        if (k === 'class') node.className = v
        else if (k === 'text') node.textContent = v
        else if (k === 'attrs') {
            for (const [an, av] of Object.entries(v)) node.setAttribute(an, av)
        }
        else node[k] = v
    }
    for (const c of Array.isArray(children) ? children : [children]) {
        if (c === null || c === undefined) continue
        node.append(c)
    }
    return node
}

const OPTIONAL_ID_FIELDS = [
    { name: 'pageID',   label: 'Page ID (optional)' },
    { name: 'layerID',  label: 'Layer ID (optional)' },
    { name: 'columnID', label: 'Column ID (optional)' },
    { name: 'lineID',   label: 'Line ID (optional)' }
]

/**
 * Renders the three UI states (status, id form, workspace) into a single
 * root node and owns state while a workspace is displayed. The workspace
 * state is re-used by `#onGenerate` / `#onCopy` so generated prompts stay in
 * sync with whatever context was last loaded.
 */
export class UIManager {
    /** Full (untruncated) prompt from the last Generate, used by Copy. */
    #fullPrompt = null
    /** Token-consent button in the workspace header; removed once a token arrives. */
    #authButton = null
    /** "Line" meta row value node; updated when the parent sends UPDATE_CURRENT_LINE. */
    #lineMetaValue = null
    /** Generate button; disabled until a token is held (prompts bake the token in). */
    #generateBtn = null
    /** Everything outside the header — hidden until a good token is held. */
    #workspaceBody = null
    /** Pending timer for clearing the Copy feedback message. */
    #feedbackTimer = null

    /**
     * @param {string} [rootId='app'] id of the element to render into.
     */
    constructor(rootId = 'app') {
        this.root = document.getElementById(rootId)
        this.state = {
            project: null, page: null, canvas: null,
            layer: null, column: null, line: null,
            projectID: null, pageID: null, layerID: null, columnID: null, lineID: null,
            token: null
        }
    }

    /** Replace the root's children with a single node. */
    #replace(node) { this.root.replaceChildren(node) }

    /**
     * Show a one-line status (loading, awaiting auth, error, etc.).
     * @param {string} message
     * @param {'info'|'error'} [level='info']
     */
    setStatus(message, level = 'info') {
        this.#replace(el('div', {
            class: `status ${level}`,
            text: message,
            attrs: { role: 'status', 'aria-live': 'polite' }
        }))
    }

    /**
     * First-paint screen shown when iframed before the parent has pushed a
     * `TPEN_CONTEXT` payload. Carries the token-consent button so the user
     * can authorize AI token usage up front; the workspace takes over as soon
     * as `TPEN_CONTEXT` arrives.
     * @param {{ message: string,
     *           showAuthButton?: boolean,
     *           onRequestAuth?: () => void }} params
     */
    renderAwaitingParent({ message, showAuthButton = false, onRequestAuth }) {
        const children = [
            el('div', { class: 'status info', text: message, attrs: { role: 'status', 'aria-live': 'polite' } })
        ]
        if (showAuthButton && onRequestAuth) {
            const b = el('button', { type: 'button', text: 'Allow AI To Use My TPEN Token' })
            b.addEventListener('click', onRequestAuth)
            children.push(el('div', { class: 'controls' }, [b]))
            children.push(el('p', { class: 'hint', text: 'This will allow agentic AI to work on your behalf.  This work will be attributed to your user.  You are accountable for what occurs.'}))
        }
        this.#replace(el('section', { class: 'card' }, children))
    }

    /**
     * Render the standalone id-entry form (shown when no `projectID` URL
     * param is present).
     * @param {{ initial?: Record<string, string>, onSubmit: (args: Record<string, string>) => void }} params
     */
    renderIdForm({ initial = {}, onSubmit }) {
        const inputs = {}
        inputs.projectID = el('input', { type: 'text', name: 'projectID', value: initial.projectID ?? '', required: true, autocomplete: 'off' })
        const rows = [el('label', {}, [el('span', { text: 'Project ID' }), inputs.projectID])]
        for (const f of OPTIONAL_ID_FIELDS) {
            inputs[f.name] = el('input', { type: 'text', name: f.name, value: initial[f.name] ?? '', autocomplete: 'off' })
            rows.push(el('label', {}, [el('span', { text: f.label }), inputs[f.name]]))
        }
        const form = el('form', { class: 'form' }, [...rows, el('button', { type: 'submit', text: 'Load' })])
        form.addEventListener('submit', (e) => {
            e.preventDefault()
            const out = { projectID: inputs.projectID.value.trim() }
            for (const f of OPTIONAL_ID_FIELDS) out[f.name] = inputs[f.name].value.trim()
            onSubmit(out)
        })
        this.#replace(el('section', { class: 'card' }, [
            el('h1', { text: 'TPEN-Prompts' }),
            el('p', { text: 'Project ID is required. Page / layer / column / line IDs are optional — provide the ones your chosen prompt template needs.' }),
            form
        ]))
    }

    /**
     * Render the main workspace: project metadata, template picker, and
     * generate/copy controls. Stores `context` on `this.state` so generate/copy
     * handlers can read from it later.
     * @param {object} context
     * @param {() => void} [context.onRequestAuth] invoked when the user clicks
     *   the in-workspace token-consent button. The button is only shown when
     *   `context.token` is falsy.
     */
    renderWorkspace(context) {
        this.state = { ...this.state, ...context }
        const { project, page, layer, column, line,
                projectID, pageID, layerID, columnID, lineID, token, onRequestAuth } = this.state

        const metaRows = [
            ['Project', project?.label ?? project?.title ?? projectID]
        ]
        if (pageID)   metaRows.push(['Page',   labelOf(page,   pageID)])
        if (layerID)  metaRows.push(['Layer',  labelOf(layer,  layerID)])
        if (columnID) metaRows.push(['Column', labelOf(column, columnID)])
        // Always include the Line row so UPDATE_CURRENT_LINE has a target to
        // mutate without a full re-render.
        const lineValue = lineID ? labelOf(line, lineID) : '(none selected)'
        metaRows.push(['Line', lineValue])

        const meta = el('dl', { class: 'meta' })
        this.#lineMetaValue = null
        for (const [k, v] of metaRows) {
            const dd = el('dd', { text: String(v) })
            meta.append(el('dt', { text: k }), dd)
            if (k === 'Line') this.#lineMetaValue = dd
        }

        const warning = el('div', { class: 'warning', attrs: { role: 'note' } }, [
            el('strong', { text: 'Security: ' }),
            el('span', { text: `The generated prompt carries your TPEN session token so an agentic LLM can manipulate your TPEN data on your behalf. Clicking 'Copy' writes the full token to your clipboard. Only paste it into LLM environments you trust.` })
        ])

        this.#authButton = null
        const headerChildren = [
            el('h1', { text: 'TPEN AI Prompt Builder', class: 'tool-header' }),
            el('hr'),
            meta,
            warning
        ]
        if (!token && onRequestAuth) {
            const b = el('button', { type: 'button', class: 'auth-btn', text: 'Allow AI To Use My TPEN Token' })
            b.addEventListener('click', onRequestAuth)
            this.#authButton = b
            headerChildren.push(b)
        }
        const header = el('header', { class: 'workspace-header' }, headerChildren)

        const select = el('select', { id: 'template-select' })
        for (const t of listTemplates()) {
            select.append(el('option', { value: t.id, text: t.label }))
        }

        // Prompts embed the auth token; generating before consent yields an
        // unusable prompt (templates render "(unable to resolve agent IRI…)").
        // Gate Generate on token presence and nudge the user toward the consent
        // button in the header.
        const generateBtn = el('button', {
            type: 'button', id: 'generate-btn', text: 'Generate prompt',
            disabled: !token
        })
        this.#generateBtn = generateBtn
        const output = el('textarea', {
            id: 'output', readOnly: true, rows: 20, spellcheck: false, autocomplete: 'off',
            placeholder: 'Click “Generate prompt” to compose.'
        })
        const copyBtn = el('button', { type: 'button', id: 'copy-btn', text: 'Copy', disabled: true })
        const feedback = el('span', { class: 'feedback', attrs: { 'aria-live': 'polite' } })

        generateBtn.addEventListener('click', () => this.#onGenerate(select, output, copyBtn))
        copyBtn.addEventListener('click', () => this.#onCopy(output, feedback))

        const generateControls = [
            el('label', {}, [el('span', { text: 'Prompt Options' }), select]),
            generateBtn
        ]

        const body = el('div', { class: 'workspace-body', hidden: !token }, [
            el('div', { class: 'controls' }, generateControls),
            el('label', { class: 'output-label', htmlFor: 'output', text: 'Generated prompt' }),
            output,
            el('div', { class: 'controls' }, [copyBtn, feedback])
        ])
        this.#workspaceBody = body

        this.#replace(el('section', { class: 'card' }, [header, body]))
    }

    /**
     * Update the stored token and remove the in-workspace consent button if
     * it's on screen. Called from `PromptsApp.acceptAuth` when the parent
     * sends `TPEN_ID_TOKEN`. A no-op when the workspace hasn't been rendered
     * yet — the next `renderWorkspace` call will read the new token from
     * `context.token`.
     * @param {string|null} token
     */
    updateToken(token) {
        this.state.token = token ?? null
        if (!token) {
            // If the workspace is already on screen without a consent button,
            // re-render so the user has a visible path back to authorizing —
            // otherwise they're stranded with the body hidden and no way back.
            if (this.#generateBtn && !this.#authButton) {
                this.renderWorkspace(this.state)
                return
            }
            if (this.#generateBtn) this.#generateBtn.disabled = true
            if (this.#workspaceBody) this.#workspaceBody.hidden = true
            return
        }
        if (this.#authButton) {
            this.#authButton.remove()
            this.#authButton = null
        }
        if (this.#generateBtn) this.#generateBtn.disabled = false
        if (this.#workspaceBody) this.#workspaceBody.hidden = false
    }

    /**
     * Update the current line id without re-rendering the workspace. Mutates
     * `state.lineID` so the next Generate picks it up, and refreshes the
     * "Line" meta row if present. Also resolves `state.line` against
     * `page.items` when available so templates that expect a line object see
     * the full annotation.
     * @param {string} lineID short id or ''; full IRIs should be trimmed by
     *   the caller.
     */
    updateCurrentLine(lineID) {
        this.state.lineID = lineID ?? ''
        this.state.line = lineID && this.state.page?.items
            ? (this.state.page.items.find(it => trailingId(it) === lineID) ?? null)
            : null
        if (this.#lineMetaValue) {
            this.#lineMetaValue.textContent = this.state.lineID
                ? labelOf(this.state.line, this.state.lineID)
                : '(none selected)'
        }
    }

    /**
     * Render the selected template against the current state, store the full
     * result for Copy, and display a token-truncated version in the textarea.
     * @param {HTMLSelectElement} select
     * @param {HTMLTextAreaElement} output
     * @param {HTMLButtonElement} copyBtn
     */
    #onGenerate(select, output, copyBtn) {
        const s = this.state
        try {
            const full = renderTemplate(select.value, {
                project: s.project, page: s.page, canvas: s.canvas,
                layer: s.layer, column: s.column, line: s.line,
                projectID: s.projectID, pageID: s.pageID,
                layerID: s.layerID, columnID: s.columnID, lineID: s.lineID,
                token: s.token,
                projectEndpoint: s.projectID ? projectEndpoint(s.projectID) : null,
                pageEndpoint: (s.projectID && s.pageID) ? pageEndpoint(s.projectID, s.pageID) : null
            })
            this.#fullPrompt = full
            output.value = s.token ? full.replaceAll(s.token, truncateToken(s.token)) : full
            copyBtn.disabled = false
        } catch (err) {
            this.#fullPrompt = null
            output.value = `Error: ${err.message}`
            copyBtn.disabled = true
        }
    }

    /**
     * Copy the full (untruncated) prompt to the clipboard. Falls back to
     * `execCommand('copy')` via the textarea when the async clipboard API
     * is unavailable or denied.
     * @param {HTMLTextAreaElement} output
     * @param {HTMLElement} feedback
     */
    async #onCopy(output, feedback) {
        const toCopy = this.#fullPrompt ?? output.value
        try {
            await navigator.clipboard.writeText(toCopy)
            feedback.textContent = 'Copied (full token).'
        } catch {
            // execCommand('copy') can only read from the textarea. Swap the
            // full prompt in temporarily, select, copy, restore — use finally
            // so a throw during copy can't leave the raw token on screen.
            const previous = output.value
            try {
                output.value = toCopy
                output.select()
                const ok = document.execCommand('copy')
                feedback.textContent = ok
                    ? 'Copied (fallback, full token).'
                    : 'Copy failed — select the text manually.'
            } finally {
                output.value = previous
            }
        }
        if (this.#feedbackTimer) clearTimeout(this.#feedbackTimer)
        this.#feedbackTimer = setTimeout(() => {
            feedback.textContent = ''
            this.#feedbackTimer = null
        }, 2000)
    }
}

/**
 * Resolve a human label from a TPEN object. Accepts plain strings, IIIF-style
 * language maps (`{ none: [...] }`, `{ en: [...] }`, etc.), and falls back to
 * the supplied id when nothing usable is present.
 * @param {{ label?: any }|null|undefined} obj
 * @param {string} fallback
 * @returns {string}
 */
function labelOf(obj, fallback) {
    const lbl = obj?.label
    if (!lbl) return fallback
    if (typeof lbl === 'string') return lbl
    if (Array.isArray(lbl.none) && lbl.none.length) return lbl.none[0]
    const firstArray = Object.values(lbl).find(v => Array.isArray(v) && v.length)
    return firstArray?.[0] ?? fallback
}

/**
 * Return a shortened token for display (`first10…last10`). Tokens of 24 chars
 * or fewer are returned unchanged.
 * @param {string} token
 * @returns {string}
 */
function truncateToken(token) {
    if (typeof token !== 'string' || token.length <= 24) return token
    return `${token.slice(0, 10)}…${token.slice(-10)}`
}

