/**
 * @file Template: "Detect columns + lines + transcribe → PUT page, POST columns".
 *
 * Combines the multi-block reading-order and column creation from
 * detect-columns-and-lines with the text recognition from
 * detect-and-transcribe.
 *
 * @author thehabes
 */

import { buildTemplateContext } from '../inject-context.js'

/** @type {import('../../prompt-generator.js').PromptTemplate} */
export const detectOrderAndTranscribeTemplate = {
    id: 'detect-order-and-transcribe',
    label: 'Line Detection + Column Grouping + Transcription',
    templateUrl: new URL('./PROMPT.md', import.meta.url),
    buildContext: buildTemplateContext
}
