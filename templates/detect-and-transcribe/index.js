/**
 * @file Template: "Detect lines + transcribe → PUT page".
 *
 * Targets workflow #5 from the absorbed cubap `_tools/COMMON_TASKS.md`:
 * Bounds Detection Followed by Text Recognition.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectAndTranscribeTemplate = {
    id: 'detect-and-transcribe',
    label: 'Line Detection + Transcription',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
