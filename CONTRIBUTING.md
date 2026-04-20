# Contributing to TPEN-Prompts

Thank you for contributing split-tool interfaces that help researchers transcribe manuscripts using LLM assistance.

## Goals

1. Receive context from a parent TPEN frame using postMessage.
2. Generate copy-ready prompts for a user-chosen LLM.
3. Accept LLM candidate output (text + canvas-relative bounds).
4. Validate candidates and deterministically build TPEN annotation envelopes.
5. PUT the full Page object with updated items to `/project/:projectId/page/:pageId`.

## Repository Layout

- `_pages/`: Split-tool page templates and UI.
- `_scripts/`: Runtime JavaScript modules.
- `_tools/`: Markdown docs for API access, data formats, and workflow guidance.

## Minimal Message Contract

The parent frame sends a `TPEN_CONTEXT` message with required fields:

```json
{
  "type": "TPEN_CONTEXT",
  "projectId": "69e28b7ac3ca82132fd140c3",
  "pageId": "69e28b7ac3ca82132fd140c6",
  "canvasId": "https://t-pen.org/TPEN/canvas/13252824",
  "imageUrl": "https://t-pen.org/TPEN/pageImage?folio=13252824"
}
```

Optional fields:

```json
{
  "currentLineId": "https://store.rerum.io/v1/id/69e291337a53a991d10ddbff",
  "columns": 1,
  "manifestUri": "https://t-pen.org/TPEN/manifest/7306?version=3",
  "canvasWidth": 2200,
  "canvasHeight": 3400
}
```

`TPEN_ID_TOKEN` is requested separately and should not be bundled into `TPEN_CONTEXT`.

## Candidate Format

Preferred LLM output is tool-call style JSON:

```json
{
  "tool": "save_tpen_annotations",
  "arguments": {
    "candidates": [
      {
        "text": "example transcription",
        "bounds": {
          "x": 12.34,
          "y": 45.67,
          "w": 8.9,
          "h": 2.1,
          "unit": "percent"
        }
      }
    ]
  }
}
```

Notes:

- Percent bounds are preferred for model portability across image sizes.
- When Canvas dimensions are available, convert percent bounds to integer coordinates derived from Canvas dimensions before save.

## Save Flow

1. Parse and extract candidates from model JSON.
2. Normalize bounds and convert percent values to integer coordinates derived from Canvas dimensions where possible.
3. Validate candidates in `_scripts/tpen-api.js`.
4. Build annotations envelope in `_scripts/tpen-api.js`.
5. Save with PUT to `/project/:projectId/page/:pageId`.

## Runtime Modules

- `_scripts/message-bridge.js`
  - Origin allow-list validation
  - Context subscription
  - Separate ID token request/subscribe flow
- `_scripts/prompt-builder.js`
  - Prompt generation with concise, tool-call-oriented schema
- `_scripts/tpen-api.js`
  - Candidate normalization and validation
  - Envelope building and API save helper
- `_scripts/transcription-assist.js`
  - UI orchestration, parsing, status updates, save action

## Security Requirements

1. Validate event origins in `_scripts/message-bridge.js`.
2. Treat `idToken` as sensitive.
3. Do not log full tokens.
4. Display token only in obscured form in UI summary.
5. Require explicit user action before save.
6. Validate all model output before API calls.

## Local Development

1. Run Jekyll locally:
   - `bundle exec jekyll serve`
2. Open the tool:
   - `http://localhost:4000/split-tools/transcription-assist/`
3. Ensure parent origin is allow-listed in `_scripts/message-bridge.js`.

## Pull Request Expectations

1. Document expected model output schema.
2. Include sample input prompt and sample model output.
3. Show how `_scripts/tpen-api.js` validators/builders are used.
4. Confirm TPEN context parsing and ID token flow.
5. Keep generated `_site` files out of source edits.

Questions? Open an issue or contact the TPEN team.
