/**
 * @file Template: "Detect first line → create annotation".
 *
 * Declares template metadata and points at this directory's `PROMPT.md` body.
 * The flat variable map consumed by `{{name}}` placeholders is produced by
 * the shared `buildFirstLineContext` helper.
 *
 * @author thehabes
 */

import { buildFirstLineContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const firstLineDetectionTemplate = {
    id: 'detect-first-line',
    label: 'Detect first line → create #xywh annotation',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildFirstLineContext
}
