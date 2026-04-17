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
import { lineCreateEndpoint } from './tpen-service.js'

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
    for (const c of [].concat(children)) {
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
     * Render the main workspace: project metadata, canvas thumbnail, template
     * picker, and generate/copy controls. Stores `context` on `this.state` so
     * generate/copy handlers can read from it later.
     * @param {object} context
     */
    renderWorkspace(context) {
        this.state = { ...this.state, ...context }
        const { project, page, canvas, layer, column, line,
                projectID, pageID, layerID, columnID, lineID } = this.state
        const thumb = extractThumbnail(canvas)

        const metaRows = [
            ['Project', project?.label ?? project?.title ?? projectID]
        ]
        if (pageID)   metaRows.push(['Page',   labelOf(page,   pageID)])
        if (layerID)  metaRows.push(['Layer',  labelOf(layer,  layerID)])
        if (columnID) metaRows.push(['Column', labelOf(column, columnID)])
        if (lineID)   metaRows.push(['Line',   labelOf(line,   lineID)])

        const meta = el('dl', { class: 'meta' })
        for (const [k, v] of metaRows) {
            meta.append(el('dt', { text: k }), el('dd', { text: String(v) }))
        }

        const header = el('header', { class: 'workspace-header' }, [
            el('h1', { text: 'TPEN-Prompts' }),
            meta
        ])

        let preview = null
        if (thumb && isSafeHttpUrl(thumb)) {
            const img = el('img', { alt: 'Page thumbnail' })
            img.src = thumb
            preview = el('figure', { class: 'canvas-preview' }, [img])
        }

        const select = el('select', { id: 'template-select' })
        for (const t of listTemplates()) {
            select.append(el('option', { value: t.id, text: t.label }))
        }

        const generateBtn = el('button', { type: 'button', id: 'generate-btn', text: 'Generate prompt' })
        const output = el('textarea', {
            id: 'output', readOnly: true, rows: 20, spellcheck: false,
            placeholder: 'Click “Generate prompt” to compose.'
        })
        const copyBtn = el('button', { type: 'button', id: 'copy-btn', text: 'Copy', disabled: true })
        const feedback = el('span', { class: 'feedback', attrs: { 'aria-live': 'polite' } })

        generateBtn.addEventListener('click', () => this.#onGenerate(select, output, copyBtn))
        copyBtn.addEventListener('click', () => this.#onCopy(output, feedback))

        const warning = el('div', { class: 'warning', attrs: { role: 'note' } }, [
            el('strong', { text: 'Security: ' }),
            document.createTextNode('the generated prompt carries your TPEN session token so an agentic LLM can POST on your behalf. The token is truncated in the preview below for readability — clicking Copy writes the full token to your clipboard. Only paste it into LLM environments you trust.')
        ])

        this.#replace(el('section', { class: 'card' }, [
            header,
            preview,
            el('div', { class: 'controls' }, [
                el('label', {}, [el('span', { text: 'Template' }), select]),
                generateBtn
            ]),
            warning,
            el('label', { class: 'output-label', htmlFor: 'output', text: 'Generated prompt' }),
            output,
            el('div', { class: 'controls' }, [copyBtn, feedback])
        ]))
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
                lineEndpoint: (s.projectID && s.pageID) ? lineCreateEndpoint(s.projectID, s.pageID) : null
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
        setTimeout(() => { feedback.textContent = '' }, 2000)
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
 * True when `value` parses as an `http:` or `https:` URL. Guards the image
 * `src` against `javascript:`/`data:` strings from upstream payloads.
 * @param {string} value
 * @returns {boolean}
 */
function isSafeHttpUrl(value) {
    try {
        const u = new URL(value, location.href)
        return u.protocol === 'http:' || u.protocol === 'https:'
    } catch { return false }
}

/**
 * Pick the best thumbnail URL from a IIIF canvas. Tries (in order):
 *   1. `canvas.thumbnail[0].id` / `@id`, or `canvas.thumbnail.id`
 *   2. A sized derivative from the first image body's IIIF Image service
 *   3. The raw image body id
 * @param {any} canvas
 * @returns {string|null}
 */
function extractThumbnail(canvas) {
    if (!canvas) return null
    const thumb = canvas?.thumbnail?.[0]?.id ?? canvas?.thumbnail?.[0]?.['@id'] ?? canvas?.thumbnail?.id
    if (thumb) return thumb
    const body = canvas?.items?.[0]?.items?.[0]?.body
    if (!body) return null
    const bodyId = typeof body === 'string' ? body : (body.id ?? body['@id'])
    const service = body?.service?.[0]?.id ?? body?.service?.[0]?.['@id']
    if (service) return `${String(service).replace(/\/$/, '')}/full/!400,400/0/default.jpg`
    return bodyId ?? null
}
