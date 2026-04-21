/**
 * @file Template: "Detect columns → POST column".
 *
 * Targets workflow #2 from the absorbed cubap `_tools/COMMON_TASKS.md`:
 * Column Detection.
 *
 * @author thehabes
 */

import { buildTemplateContext, formatExistingColumns, formatExistingLines } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectColumnsTemplate = {
    id: 'detect-columns',
    label: 'Group Lines Into Columns',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: (ctx) => ({
        ...buildTemplateContext(ctx),
        existingColumns: formatExistingColumns(ctx.project, ctx.pageID, ctx.page),
        existingLines: formatExistingLines(ctx.page)
    })
}
