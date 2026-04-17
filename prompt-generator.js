/**
 * @file Template registry. Templates declare `{ id, label, render(ctx) }` and
 * are registered here at module-load time. The UI lists them by id/label and
 * asks the registry to render the chosen one against a project context.
 *
 * @author thehabes
 */

import { firstLineDetectionTemplate } from './templates/first-line-detection.js'

/**
 * @typedef {object} PromptTemplate
 * @property {string} id
 * @property {string} label
 * @property {(ctx: object) => string} render
 */

/** @type {Map<string, PromptTemplate>} */
const REGISTRY = new Map()

/**
 * Add a template to the registry, keyed by `template.id`. Later registrations
 * with the same id overwrite earlier ones.
 * @param {PromptTemplate} template
 */
function register(template) {
    REGISTRY.set(template.id, template)
}

register(firstLineDetectionTemplate)

/**
 * Return every registered template as `{ id, label }` pairs, for populating
 * the template `<select>` in the UI.
 * @returns {Array<{ id: string, label: string }>}
 */
export function listTemplates() {
    return [...REGISTRY.values()].map(t => ({ id: t.id, label: t.label }))
}

/**
 * Render a template by id. Throws if the id is not registered.
 * @param {string} templateId
 * @param {object} ctx template-specific context (see the template's file for its shape).
 * @returns {string} the composed prompt.
 */
export function renderTemplate(templateId, ctx) {
    const template = REGISTRY.get(templateId)
    if (!template) throw new Error(`Unknown template: ${templateId}`)
    return template.render(ctx)
}
