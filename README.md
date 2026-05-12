# TPEN-Prompts

A small GitHub Pages web app that composes copy-ready prompts for TPEN manuscript transcription workflows (line detection, column detection, transcription, etc.). The tool adds TPEN project context into a chosen prompt template and emits prompt text. Every generated prompt carries the TPEN context to the LLM for processing.  LLMs are given two paths:

- Direct TPEN API instructions if HTTP capabilities are available in the LLM environment
- TPEN payload construction to give to the user to take back into the tool where HTTP capabilities are available

> This way the same prompt works whether the LLM you hand it to can make HTTP calls or not. It is common for LLM containers to restrict HTTP capabilities.

## Add the TPEN Prompts tool to a TPEN Project

On the project management page at https://app.t-pen.org/project/manage?projectID={id_here} you will see a panel with the 'Tools' heading.

{SCREENSHOT TODO}

Click the 'Add Iframe Tool' button which will show an area for you to enter a new tool.

{SCREENSHOT TODO}

Enter a tool label such as 'TPEN Prompts'.  Then enter the URL for this repository's GitHub Pages deployment.  You can test it to make sure it will work, otherwise click 'Add' and the TPEN Prompts tool will be active in your project

## How to generate and use a prompt

> Make sure you have already added the tool to the project you use.

Navigate to the transccription interface at https://app.t-pen.org/transcribe?projectID={id_here}.  You will see a dropdown menu of splitscreen tools, where you will see the TPEN Prompts tools with the label you provided earlier.

{Screenshot TODO}

Select it, and the tools becomes active on the right side where you will generate the prompt.

{Screenshot TODO}

Click to allow your token to be used in the prompts. Then select a prompt to see it populate and click the copy button so it is on your clipboard ready to paste.

> Click 'Copy' instead of highlighting the text and copying it yourself.

{Screenshot TODO}

Now give the prompt to your favorite LLM by whatever means you prefer.  The AI will guide you on progress or next steps from there.

{Screenshot TODO}

Pick a prompt template in the UI, generate it, and click the **Copy** button to copy the prompt to your clipboard.

## Notes on usage

### CLI or agent LLM with HTTP access (e.g. Claude Code, Codex, OpenCode)

The LLM tends to have HTTP capabilities in CLI environment and will generate the data through TPEN.  You will only have to provide it the prompt and can watch it do the work for you.  You will need to refresh the page in TPEN once it is finished.

### Chat LLM (e.g. chatgpt.com, claude.ai, t3.chat). 

The LLM tends to be restricted in Web Chat environments. Expect that the LLM will follow the prompt's fallback instruction and return payload JSON for you to copy. You will take that back to the tool in TPEN and paste it into the *Couldn't Use the API? Paste JSON from LLM here* panel. It will create the TPEN data for you there and refresh the page when it is finished.  

> These methods are deliberately interchangeable per prompt template, so a contributor can swap LLMs without changing how the prompt is built.

## Contribute new LLM prompts
See [CONTRIBUTING.md](./CONTRIBUTING.md) - How to run the tool locally, add or edit `PROMPT.md` prompt templates, test, and open a PR.

## Prompt Templates

The prompt templates are in the [`templates/`](./templates/) directory.  There is one directory per prompt; each contains a `PROMPT.md` and an `index.js` registry entry.
