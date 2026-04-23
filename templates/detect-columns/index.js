/**
 * @file Template: "Detect columns → clear-columns DELETE, then POST column per
 * detected column, then PUT page to reorder lines (if needed)". Operates on
 * an existing line set; no fallback — fails and reports if image analysis or
 * any of the three HTTP verbs are unavailable.
 *
 * @author thehabes
 */

import { buildTemplateContext, formatExistingColumns, formatExistingLines } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectColumnsTemplate = {
    id: 'detect-columns',
    label: 'Group Existing Lines Into Columns',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: (ctx) => ({
        ...buildTemplateContext(ctx),
        existingColumns: formatExistingColumns(ctx.project, ctx.page),
        existingLines: formatExistingLines(ctx.page)
    })
}
