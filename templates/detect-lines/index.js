/**
 * @file Template: "Detect lines → PUT page".
 *
 * Targets workflow #3 from the absorbed cubap `_tools/COMMON_TASKS.md`:
 * Line Detection.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectLinesTemplate = {
    id: 'detect-lines',
    label: 'Detect Individual Lines (No Column Grouping)',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
