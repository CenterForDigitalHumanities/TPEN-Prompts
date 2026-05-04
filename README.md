# TPEN-Prompts

A small GitHub Pages web app that composes well-formatted prompts for TPEN manuscript transcription workflows.

**What it does:** Generate copy-ready prompts for LLMs working on TPEN tasks (line detection, column detection, transcription, etc.). The app carries project context and emits prompt text only—it does not call any LLM or make saves on your behalf.

## Quick Start

- **Try it online:** [TPEN-Prompts](https://centerfordigitalhumanities.github.io/TPEN-Prompts/)
- **Add a template:** See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to create or modify prompts
- **Report an issue:** Open a GitHub issue with template name and expected vs. actual output

## Key Resources

| Resource | Purpose |
|----------|---------|
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to contribute, add templates, test locally |
| [LICENSE](./LICENSE.md) | MIT License |
| [`templates/`](./templates/) | Prompt template modules (one folder per task) |
| [`tools/`](./tools/) | Generic markdown guidance (API, data formats, workflows) |

## How It Works

1. Select a **template** from the dropdown (e.g., "Line Detection").
2. The app resolves TPEN project context (canvas, dimensions, endpoint).
3. The app substitutes context into the template's prompt and emits the result.
4. Copy the prompt and send it to your LLM of choice.
5. Parse the LLM's output and paste it into the fallback form if needed.

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- How to run the app locally (Jekyll, Python, or Node)
- How to create or update `PROMPT.md` templates
- Local testing checklist
- PR expectations

## Licensing

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
