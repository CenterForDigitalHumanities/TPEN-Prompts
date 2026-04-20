/**
 * @file Template: "Detect first line (fast) → create annotation".
 *
 * Fast-path sibling of `detect-first-line`: same context shape, trimmed
 * PROMPT.md body tuned for minimal/fast LLMs. Delegates context building to
 * the shared `buildFirstLineContext` helper.
 *
 * @author thehabes
 */

import { buildFirstLineContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const firstLineDetectionFastTemplate = {
    id: 'detect-first-line-fast',
    label: 'Detect first line (fast) → create #xywh annotation',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildFirstLineContext
}
