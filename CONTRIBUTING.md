# Contributing to TPEN-Prompts

Thanks for helping improve TPEN prompt tooling.

## What This Repository Does

This project is a small web app that composes copy-ready prompts for TPEN workflows.
It does not call LLMs directly.

## Source of Truth

Make your edits in source files at the repository root, especially:

- `templates/`: Prompt template modules and their `PROMPT.md` content
- `main.js`, `prompt-generator.js`, `ui-manager.js`, `message-handler.js`: runtime app behavior
- `tools/`: published generic markdown assistance docs

Important:

- `tools/` is for generic markdown guidance and reference docs.
- Avoid broad edits to generated site output unless your change is specifically for published docs/pages.

## Contributing PROMPT.md Changes

Most contributions will be updates to template prompts.

1. Pick a template folder in `templates/`.
2. Edit that folder's `PROMPT.md`.
3. Keep placeholders consistent with context keys, for example `{{canvasId}}` and `{{pageEndpoint}}`.
4. Keep output contracts explicit (JSON shapes, required fields, ordering rules, save behavior).
5. Keep instructions deterministic and testable.

### Add a New Prompt Template

1. Create `templates/<new-template>/PROMPT.md`.
2. Create `templates/<new-template>/index.js` exporting a template object.
3. Register the template in `prompt-generator.js`.
4. Confirm the new template appears in the UI template selector.

Pattern to follow:

- Existing template folders in `templates/`
- Existing registry entries in `prompt-generator.js`

## Local Testing

This project is hosted on GitHub Pages, so Jekyll is the primary way to build and serve it locally.

### Option A: Jekyll (matches GitHub Pages)

```bash
jekyll s
```

Then open:

- `http://localhost:4000/`

If you prefer a simpler backup server for quick checks, use one of the options below.

To test within a split-screen TPEN environment, ensure your local server can be added as a custom tool in TPEN and use the correct `{{pageEndpoint}}` placeholder value for your local server URL.

### Option B: Python (backup)

```bash
python -m http.server 4000
```

Then open:

- `http://localhost:4000/`

### Option C: Node (backup)

```bash
npx serve .
```

Then open the URL printed by the command.

## Manual Test Checklist

1. Load the app and confirm it renders without console errors.
2. Select your edited template from the dropdown.
3. Generate a prompt and verify placeholders are resolved as expected.
4. Confirm formatting is copy-ready and schema instructions are valid JSON.
5. If your template affects TPEN save flows, verify endpoint/token placeholders and constraints are still correct.

## Pull Request Expectations

Include the following in your PR description:

1. What changed and why.
2. Which `PROMPT.md` files were changed.
3. Before/after snippet for key instruction changes.
4. Local test steps you ran and outcomes.
5. Any follow-up work needed.

## Style Notes

- Keep prompt instructions concise and unambiguous.
- Prefer explicit field names and constraints over prose-only guidance.
- Preserve stable placeholder names unless there is a strong reason to change them.
