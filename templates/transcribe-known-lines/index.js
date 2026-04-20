/**
 * @file Template: "Transcribe existing lines → PATCH line text".
 *
 * Targets workflow #1 from the absorbed cubap `_tools/COMMON_TASKS.md`:
 * Text Recognition Within Known Bounds.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const transcribeKnownLinesTemplate = {
    id: 'transcribe-known-lines',
    label: 'Auto Transcribe Into Existing Lines',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
