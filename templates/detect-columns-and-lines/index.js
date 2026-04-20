/**
 * @file Template: "Detect columns + lines → save page".
 *
 * Targets workflow #4 from the absorbed cubap `_tools/COMMON_TASKS.md`:
 * Column and Line Detection.
 *
 * @author thehabes
 */

import { buildTemplateContext, formatExistingColumns } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectColumnsAndLinesTemplate = {
    id: 'detect-columns-and-lines',
    label: 'Detect columns + lines → save page',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: (ctx) => ({
        ...buildTemplateContext(ctx),
        existingColumns: formatExistingColumns(ctx.project, ctx.pageID, ctx.page)
    })
}
