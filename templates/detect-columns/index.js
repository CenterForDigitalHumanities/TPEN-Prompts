/**
 * @file Template: "Detect columns → POST column".
 *
 * Targets workflow #2 from the absorbed cubap `_tools/COMMON_TASKS.md`:
 * Column Detection.
 *
 * @author thehabes
 */

import { buildTemplateContext, formatExistingColumns } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectColumnsTemplate = {
    id: 'detect-columns',
    label: 'Detect Main Text Columns',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: (ctx) => ({
        ...buildTemplateContext(ctx),
        existingColumns: formatExistingColumns(ctx.project, ctx.pageID, ctx.page)
    })
}
