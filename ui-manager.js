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
import { pageEndpoint, putPage } from './tpen-service.js'
import { getIRI, parseXywh, trailingId } from './iiif-ids.js'

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
 * Build a W3C `SpecificResource` target from a canvas IRI and an `xywh=…`
 * selector value.
 * @param {string} canvasId
 * @param {string} xywh the bare selector value (e.g. `xywh=10,20,300,40`).
 * @returns {{source: string, type: string, selector: {type: string, conformsTo: string, value: string}}}
 */
function buildSpecificResourceTarget(canvasId, xywh) {
    return {
        source: canvasId,
        type: 'SpecificResource',
        selector: {
            type: 'FragmentSelector',
            conformsTo: 'http://www.w3.org/TR/media-frags/',
            value: xywh
        }
    }
}

/**
 * Pull the bare `xywh=…` selector value out of whatever target shape the
 * fallback item carries. Delegates all target-shape handling to `parseXywh`
 * in iiif-ids.js so both `SpecificResource` objects and legacy bare
 * `"<canvas>#xywh=…"` strings round-trip correctly.
 *
 * Known-line updates (item `id` matches an existing line) ignore any
 * `target` the LLM included and re-use the existing line's selector — the
 * fallback flow is documented as text-only in `transcribe-known-lines`, so
 * trusting an LLM-supplied target would silently clobber bounds when the
 * model echoes a stale or wrong selector.
 *
 * Returns `null` when no selector can be resolved; the caller leaves `target`
 * off and the services API rejects the item with `Line data is malformed`.
 * @param {any} item
 * @param {Map<string, any>} existingItemsById
 * @returns {string|null}
 */
function resolveXywh(item, existingItemsById) {
    if (typeof item?.id === 'string' && existingItemsById.has(item.id)) {
        return parseXywh(existingItemsById.get(item.id)?.target)
    }
    return parseXywh(item?.target)
}

/**
 * Expand a condensed fallback item into a full W3C Annotation. Every output
 * target is rebuilt fresh with `canvasId` as `source` — we don't trust any
 * source that rode in on a pasted item or an echoed existing target, so the
 * rebuilt annotation always points at the canvas the UI is showing.
 *
 * The condensed per-item shapes are (by prompt):
 *
 * - `{ target: "xywh=…" }` — detection only.
 * - `{ target: "xywh=…", text }` — detection + transcription.
 * - `{ id, text }` — known-line update; xywh is looked up from the hydrated
 *   page.
 *
 * Legacy full-shape pastes pass through in all other respects — only
 * `target.source` gets normalized and `motivation` is filled when missing.
 * @param {any} item raw parsed item from the fallback textarea.
 * @param {string|null} canvasId the canvas IRI used as the annotation's target source.
 * @param {Map<string, any>} existingItemsById lookup from annotation id → resolved page item.
 * @returns {object} a W3C Annotation ready for PUT.
 */
function expandFallbackItem(item, canvasId, existingItemsById) {
    const out = { ...item }
    const xywh = resolveXywh(item, existingItemsById)
    if (xywh) out.target = buildSpecificResourceTarget(canvasId, xywh)
    if (typeof item.text === 'string') {
        out.body = item.text === ''
            ? []
            : [{ type: 'TextualBody', value: item.text, format: 'text/plain' }]
        delete out.text
    }
    if (!('motivation' in out)) out.motivation = 'transcribing'
    return out
}

/**
 * Validate a pre-expansion `items` array, returning a user-facing error string
 * or `null`. Catches two erasure traps:
 *
 * 1. An empty array — the services PUT handler's top-level copy loop writes
 *    `page.items = []` even when `itemsProvided` is false, erasing every line
 *    reference on the page and leaving columns pointing at stale ids. Prompts
 *    should stop and report "no lines" rather than emit an empty payload.
 * 2. A known-line update (string `id`) without usable transcription content
 *    would be PUT with `body` absent or empty, causing the services API to
 *    overwrite the existing body with `[]` on save
 *    (Line.js#saveLineToRerum: `body: this.body ?? []`). `'body' in item` is
 *    not enough — `body: null`, `body: ""`, `body: {}` all collapse to `[]`
 *    via the `??` fallback. Require either a `text` string or a non-empty
 *    `body` array; reject any other `body` shape outright so a buggy paste
 *    can't slip through and silently truncate a line.
 * @param {Array<any>} items
 * @returns {string|null}
 */
function validateItems(items) {
    if (items.length === 0) {
        return '`items` is empty — submitting would erase every line on the page. Regenerate the prompt response with at least one detected line or stop.'
    }
    for (const item of items) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
            return 'Each item in `items` must be an annotation object.'
        }
        const hasId = typeof item.id === 'string'
        const hasTargetField = 'target' in item && item.target != null
        // Without an id we can't look up an existing target; without a target we
        // can't build one. Either path resolves a selector — neither makes the
        // server throw "Line data is malformed" with a generic 500.
        if (!hasId && !hasTargetField) {
            return 'Each item must include `target` (xywh selector) or an `id` matching an existing line.'
        }
        if (hasTargetField) {
            const t = item.target
            const ok = typeof t === 'string' || (typeof t === 'object' && !Array.isArray(t))
            if (!ok) return 'Each item `target` must be an `xywh=…` string or a full target object.'
        }
        if ('text' in item && typeof item.text !== 'string') {
            return 'Each item `text` must be a string.'
        }
        if ('body' in item && item.body !== undefined && !Array.isArray(item.body)) {
            return 'Each item `body` must be an array of body entries.'
        }
        if (hasId) {
            const hasText = typeof item.text === 'string'
            const hasBody = Array.isArray(item.body) && item.body.length > 0
            if (!hasText && !hasBody) {
                return `Item for ${item.id} is missing transcription content (\`text\` string or non-empty \`body\` array) — would erase the existing transcription.`
            }
        }
    }
    return null
}

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
    /** Fallback-panel submit button; toggled by `updateToken`. */
    #fallbackSubmit = null

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

        // Prompts embed the auth token in `{{token}}` and the page endpoint
        // in `{{pageEndpoint}}`. Generating without either yields a prompt
        // whose Authorization header is `Bearer ` (no token) or whose target
        // URL is `(unknown page endpoint)`. Gate Generate on both, and nudge
        // the user toward whatever's missing.
        const canGenerate = Boolean(token && pageID)
        const generateBtn = el('button', {
            type: 'button', id: 'generate-btn', text: 'Generate prompt',
            disabled: !canGenerate
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

        const bodyChildren = [
            el('div', { class: 'controls' }, generateControls)
        ]
        if (!pageID) {
            bodyChildren.push(el('p', { class: 'hint', text: 'Needs a page context before a prompt can be generated.' }))
        }
        bodyChildren.push(
            el('label', { class: 'output-label', htmlFor: 'output', text: 'Generated prompt' }),
            output,
            el('div', { class: 'controls' }, [copyBtn, feedback]),
            this.#buildFallbackPanel()
        )
        const body = el('div', { class: 'workspace-body', hidden: !token }, bodyChildren)
        this.#workspaceBody = body

        this.#replace(el('section', { class: 'card' }, [header, body]))
    }

    /**
     * Build the paste-JSON fallback panel. Submit requires `projectID`,
     * `pageID`, AND `token`. The workspace body is hidden when no token is
     * held (`renderWorkspace` sets `hidden: !token`), so the disabled state
     * below is belt-and-suspenders against a stale reference being clicked
     * programmatically. `updateToken` still flips it when the token arrives
     * after the panel was built so the pageID gate remains authoritative.
     *
     * The auto-clear timer for the feedback span lives in this closure, not
     * on the instance — `renderWorkspace` rebuilds the panel on every render,
     * and an instance-level timer reference would let an old panel's pending
     * timer null out a new panel's timer slot.
     * @returns {HTMLElement}
     */
    #buildFallbackPanel() {
        const { projectID, pageID, token } = this.state
        const hasPage = Boolean(projectID && pageID)
        const ready = hasPage && Boolean(token)
        const textarea = el('textarea', {
            rows: 10, spellcheck: false, autocomplete: 'off',
            placeholder: '{ "items": [ { "target": "xywh=10,20,400,30" } ] }',
            attrs: { 'aria-label': 'JSON payload to submit to TPEN' }
        })
        const submit = el('button', {
            type: 'button',
            text: 'Submit to TPEN',
            disabled: !ready
        })
        this.#fallbackSubmit = submit
        const feedback = el('span', { class: 'feedback', attrs: { 'aria-live': 'polite' } })
        let feedbackTimer = null
        submit.addEventListener('click', () => this.#onFallbackSubmit({
            textarea, button: submit, feedback,
            getTimer: () => feedbackTimer,
            setTimer: (t) => { feedbackTimer = t }
        }))
        const children = [
            el('summary', { text: `Couldn't Use the API? Paste JSON from LLM here` }),
            el('p', { class: 'hint', text: 'Use this when your chat LLM produced the JSON payload but could not call the TPEN API itself. This tool will submit it using the token you authorized.' })
        ]
        if (!hasPage) children.push(el('p', { class: 'hint', text: 'Needs a page context before submission is possible.' }))
        children.push(textarea, el('div', { class: 'controls' }, [submit, feedback]))
        return el('details', { class: 'fallback' }, children)
    }

    /**
     * Parse the pasted JSON and submit it as a page PUT. Only one shape is
     * accepted: `{ items: [...] }` — the shape every prompt fallback emits.
     * @param {{textarea: HTMLTextAreaElement, button: HTMLButtonElement, feedback: HTMLElement, getTimer: () => any, setTimer: (t: any) => void}} ctx
     */
    async #onFallbackSubmit({ textarea, button, feedback, getTimer, setTimer }) {
        const { projectID, pageID, token } = this.state
        const raw = textarea.value.trim()
        // `renderWorkspace` can re-run mid-submit (e.g., token changes via
        // `updateToken` during an await), detaching the nodes this handler
        // closed over. Guard each UI write so a detached panel doesn't get
        // silent stale mutations.
        const alive = () => textarea.isConnected
        const writeTextarea = (val) => { if (alive()) textarea.value = val }
        const setFeedback = (msg, autoClear = false) => {
            if (!alive()) return
            feedback.textContent = msg
            const existing = getTimer()
            if (existing) {
                clearTimeout(existing)
                setTimer(null)
            }
            if (autoClear) {
                const t = setTimeout(() => {
                    if (getTimer() !== t) return
                    feedback.textContent = ''
                    setTimer(null)
                }, 3000)
                setTimer(t)
            }
        }
        if (!projectID || !pageID || !token) {
            setFeedback('Missing project, page, or token — cannot submit.')
            return
        }
        if (!raw) {
            setFeedback('Paste a JSON payload first.')
            return
        }
        let payload
        try { payload = JSON.parse(raw) }
        catch { setFeedback('Payload must be valid JSON.'); return }

        button.disabled = true
        setFeedback('Submitting…')
        const opts = { projectID, pageID, token, setFeedback, writeTextarea }
        try {
            if (payload && typeof payload === 'object' && !Array.isArray(payload) && Array.isArray(payload.items)) {
                await this.#submitItems(payload.items, opts)
                return
            }
            setFeedback('Unrecognized payload shape — expected `{ "items": [...] }`.')
        } catch (err) {
            setFeedback(err?.message ?? 'Submission failed.')
        } finally {
            if (button.isConnected) {
                button.disabled = !(this.state.projectID && this.state.pageID && this.state.token)
            }
        }
    }

    /**
     * Validate, expand, and PUT an `items` payload. Narrows the PUT body to
     * just `{ items }` — top-level keys beyond `items` would otherwise be
     * applied to the page record by the server's property-copy loop.
     * @param {Array<any>} items
     * @param {{projectID:string,pageID:string,token:string,setFeedback:Function,writeTextarea:Function}} opts
     */
    async #submitItems(items, { projectID, pageID, token, setFeedback, writeTextarea }) {
        const validationError = validateItems(items)
        if (validationError) { setFeedback(validationError); return }
        const canvasId = getIRI(this.state.canvas)
        if (!canvasId) {
            setFeedback('Canvas context missing — reload the workspace and retry.')
            return
        }
        // Index the resolved page's items by id so the expander can recover
        // each existing line's xywh for known-line updates (`{id, text}` only).
        // The rebuilt target still uses `canvasId` as `source`; only the xywh
        // selector value is pulled from the hydrated item.
        const existingItemsById = new Map()
        for (const existing of this.state.page?.items ?? []) {
            const eid = getIRI(existing)
            if (eid) existingItemsById.set(eid, existing)
        }
        const expanded = items.map(i => expandFallbackItem(i, canvasId, existingItemsById))
        const result = await putPage(projectID, pageID, { items: expanded }, token)
        // Drop the saved page into local state so the next Generate's
        // "Existing lines" listing reflects what was just persisted.
        this.state.page = result
        writeTextarea(JSON.stringify(result, null, 2))
        const saved = expanded.length
        const noun = `line item${saved === 1 ? '' : 's'}`
        // Mint `<origin>/transcribe?projectID=…&pageID=…` from the parent
        // origin (taken from `document.referrer`, which survives the default
        // `strict-origin-when-cross-origin` policy) and the workspace state,
        // then top-navigate there to refresh the transcription column.
        // Writing `top.location.href` is allowed cross-origin under user
        // activation (the Submit click); when it works the iframe is torn
        // down. When no origin is resolvable (sandboxed iframe with
        // `allow-top-navigation` withheld, or strict `no-referrer` policy),
        // fall back to a manual-refresh hint. The proper postMessage-based
        // fix lives in TPEN-interfaces#528.
        const reloadUrl = mintTranscriptionUrl(projectID, pageID)
        if (reloadUrl) {
            setFeedback(`Saved ${saved} ${noun}. Refreshing the transcription page…`)
            // The PUT already succeeded; if the navigation throws (sandbox
            // without `allow-top-navigation`, or top is cross-origin and
            // the click's user activation has been consumed by the await
            // chain above), don't let it surface as a submission failure.
            try {
                window.top.location.href = reloadUrl
                return
            } catch (err) {
                console.warn('top.location navigation blocked', err)
            }
        }
        setFeedback(`Saved ${saved} ${noun}. Refresh the transcription page to see the new lines in the column.`, true)
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
            if (this.#fallbackSubmit) this.#fallbackSubmit.disabled = true
            if (this.#workspaceBody) this.#workspaceBody.hidden = true
            return
        }
        if (this.#authButton) {
            this.#authButton.remove()
            this.#authButton = null
        }
        const { projectID, pageID } = this.state
        if (this.#generateBtn) this.#generateBtn.disabled = !pageID
        if (this.#fallbackSubmit) {
            this.#fallbackSubmit.disabled = !(projectID && pageID)
        }
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
                token: s.token,
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

/**
 * Fallback reload target when the parent didn't forward `parentUrl` via
 * `TPEN_CONTEXT`. Minted from the parent origin (taken from
 * `document.referrer`, which survives the default cross-origin
 * `strict-origin-when-cross-origin` policy) and the tpen3-interfaces
 * transcription permalink shape (`/transcribe?projectID=…&pageID=…`).
 * @param {string} projectID
 * @param {string} pageID
 * @returns {string|null} the minted URL, or null when no origin is available.
 */
function mintTranscriptionUrl(projectID, pageID) {
    let origin = null
    try { origin = new URL(document.referrer).origin } catch {}
    if (!origin) return null
    return `${origin}/transcribe?projectID=${encodeURIComponent(projectID)}&pageID=${encodeURIComponent(pageID)}`
}

