# TPEN-Prompts

A small GitHub Pages web app that composes copy-ready prompts for TPEN manuscript transcription workflows (line detection, column detection, transcription, etc.). The app substitutes TPEN project context into a chosen prompt template and emits prompt text — it does not call any LLM or write to TPEN on your behalf. Every generated prompt carries two paths: a direct `## TPEN API` block and a `## Fallback` block, so the same prompt works whether the LLM you hand it to can make HTTP calls or not.

## Quick start

- **Try it online:** [TPEN-Prompts](https://centerfordigitalhumanities.github.io/TPEN-Prompts/)
- **Contribute or add a prompt template:** see [CONTRIBUTING.md](./CONTRIBUTING.md)
- **Report an issue:** [open a GitHub issue](https://github.com/CenterForDigitalHumanities/TPEN-Prompts/issues/new) with the prompt template name and expected vs. actual output

## Two ways to use a generated prompt

Pick a prompt template in the UI, click **Copy** on the *Generated prompt* output, then hand the prompt to an LLM in one of two ways:

- **CLI or agent LLM with HTTP access** (e.g. Claude Code, an API-calling agent). The LLM follows the prompt's `## TPEN API` section and PUTs the result to TPEN directly. Nothing else to do in the app.
- **Chat LLM** (e.g. ChatGPT, Claude.ai). The LLM follows the prompt's `## Fallback` section and returns JSON. Paste that JSON into the app's *Couldn't Use the API? Paste JSON from LLM here* panel and the app performs the PUT.

The two paths are deliberately interchangeable per prompt template, so a contributor can swap LLMs without changing how the prompt is built.

## Repository map

| Path | Purpose |
|------|---------|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to run the app locally, add or edit `PROMPT.md` prompt templates, test, and open a PR |
| [LICENSE](./LICENSE) | MIT License |
| [`templates/`](./templates/) | One folder per task; each contains a `PROMPT.md` and an `index.js` registry entry |
