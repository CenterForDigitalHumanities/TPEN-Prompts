/**
 * @file Template: "Detect first line (fast) → create annotation".
 *
 * Fast-path sibling of `detect-first-line`: same context shape, trimmed
 * PROMPT.md body tuned for minimal/fast LLMs. Delegates context building to
 * the shared `buildTemplateContext` helper.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const firstLineDetectionFastTemplate = {
    id: 'detect-first-line-fast',
    label: 'Detect First Line (fast)',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
