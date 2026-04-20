/**
 * @file Template: "Detect first line → create annotation".
 *
 * Declares template metadata and points at this directory's `PROMPT.md` body.
 * The flat variable map consumed by `{{name}}` placeholders is produced by
 * the shared `buildTemplateContext` helper.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const firstLineDetectionTemplate = {
    id: 'detect-first-line',
    label: 'Detect First Line',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
