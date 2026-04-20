/**
 * @file Template registry. Templates declare
 * `{ id, label, templateUrl, buildContext(ctx) }` and are registered here at
 * module-load time. Their markdown bodies are fetched once via
 * `initTemplates()` before the UI renders, so `renderTemplate()` stays
 * synchronous. The UI lists templates by id/label and asks the registry to
 * render the chosen one against a project context.
 *
 * @author thehabes
 */

import { firstLineDetectionTemplate } from './templates/detect-first-line/index.js'
import { firstLineDetectionFastTemplate } from './templates/detect-first-line-fast/index.js'
import { transcribeKnownLinesTemplate } from './templates/transcribe-known-lines/index.js'
import { detectColumnsTemplate } from './templates/detect-columns/index.js'
import { detectLinesTemplate } from './templates/detect-lines/index.js'
import { detectColumnsAndLinesTemplate } from './templates/detect-columns-and-lines/index.js'
import { detectAndTranscribeTemplate } from './templates/detect-and-transcribe/index.js'

/**
 * @typedef {object} PromptTemplate
 * @property {string} id
 * @property {string} label
 * @property {URL|string} templateUrl location of the markdown body.
 * @property {(ctx: object) => Record<string, string>} buildContext
 */

/** @type {Map<string, PromptTemplate>} */
const REGISTRY = new Map()
/** @type {Map<string, string>} cached markdown bodies, keyed by template id. */
const BODIES = new Map()

/**
 * Add a template to the registry, keyed by `template.id`. Later registrations
 * with the same id overwrite earlier ones.
 * @param {PromptTemplate} template
 */
function register(template) {
    REGISTRY.set(template.id, template)
}

register(firstLineDetectionTemplate)
register(firstLineDetectionFastTemplate)
register(transcribeKnownLinesTemplate)
register(detectColumnsTemplate)
register(detectLinesTemplate)
register(detectColumnsAndLinesTemplate)
register(detectAndTranscribeTemplate)

/**
 * Fetch every registered template's markdown body once and cache it. Must be
 * awaited before `renderTemplate()` is called.
 * @returns {Promise<void>}
 */
export async function initTemplates() {
    await Promise.all([...REGISTRY.values()].map(async t => {
        const res = await fetch(t.templateUrl)
        if (!res.ok) throw new Error(`Failed to load template "${t.id}" from ${t.templateUrl}: ${res.status}`)
        BODIES.set(t.id, await res.text())
    }))
}

/**
 * Return every registered template as `{ id, label }` pairs, for populating
 * the template `<select>` in the UI.
 * @returns {Array<{ id: string, label: string }>}
 */
export function listTemplates() {
    return [...REGISTRY.values()].map(t => ({ id: t.id, label: t.label }))
}

/**
 * Render a template by id. Throws if the id is not registered or its body has
 * not been preloaded via `initTemplates()`.
 * @param {string} templateId
 * @param {object} ctx template-specific context (see the template's file for its shape).
 * @returns {string} the composed prompt.
 */
export function renderTemplate(templateId, ctx) {
    const template = REGISTRY.get(templateId)
    if (!template) throw new Error(`Unknown template: ${templateId}`)
    const body = BODIES.get(templateId)
    if (body == null) throw new Error(`Template "${templateId}" not loaded; call initTemplates() first.`)
    const vars = template.buildContext(ctx)
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const v = vars[key]
        return v == null ? '' : String(v)
    })
}
