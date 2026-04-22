/**
 * @file Template: "Detect lines + order + transcribe → PUT page".
 *
 * Combines the multi-block reading-order detection from
 * detect-columns-and-lines with the handwriting recognition from
 * detect-and-transcribe, without creating column annotations.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectOrderAndTranscribeTemplate = {
    id: 'detect-order-and-transcribe',
    label: 'Line Detection + Ordering + Transcription',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
