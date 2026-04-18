# TPEN-Prompts

An AI assistant prompt generator for TPEN3. It is a split screen tool for the transcription interface.  

## Project Layout

- `_pages/`: GitHub Pages interfaces for split-screen tools.
- `_scripts/`: Runtime JavaScript modules (message bridge, prompt builders, API helpers).
- `_tools/`: Markdown tool docs (API access, data format, and workflow guidance).
- `CONTRIBUTING.md`: Interface contract and contribution guide.

## Example Interface

- Split tool page: `/split-tools/transcription-assist/`
- Source page file: `_pages/transcription-assist.html`
- Source helper modules: `_scripts/message-bridge.js`, `_scripts/prompt-builder.js`, `_scripts/tpen-api.js`

This repository is configured for Jekyll collections so files in `_pages`, `_scripts`, and `_tools` are output by GitHub Pages.
