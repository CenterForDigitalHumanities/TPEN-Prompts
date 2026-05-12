# TPEN-Prompts

A small GitHub Pages web app that composes copy-ready prompts for TPEN manuscript transcription workflows (line detection, column detection, transcription, etc.). The tool adds TPEN project context into a chosen prompt template and emits prompt text. Every generated prompt carries the TPEN context to the LLM for processing.  LLMs are given two paths:

- Direct TPEN API instructions if HTTP capabilities are available in the LLM environment
- TPEN payload construction to give to the user to take back into the tool where HTTP capabilities are available

> This way the same prompt works whether the LLM you hand it to can make HTTP calls or not. It is common for LLM containers to restrict HTTP capabilities.

## Add the TPEN Prompts tool to a TPEN Project

On the project management page at https://app.t-pen.org/project/manage?projectID={id_here} you will see a panel with the 'Tools' heading.

<img width="488" height="428" alt="TPEN project management page showing the Tools panel" src="https://github.com/user-attachments/assets/27ae376d-a033-4b0b-b97e-9b669873615b" />

---

Click the 'Add Iframe Tool' button which will show an area for you to enter a new tool.

<img width="567" height="275" alt="Add Iframe Tool form with fields for tool label and URL" src="https://github.com/user-attachments/assets/74546832-5b25-4502-930d-99e7c41cd437" />

---

Enter a tool label such as 'TPEN Prompts'.  Then enter the URL for this repository's GitHub Pages deployment.  You can test it to make sure it will work, otherwise click 'Add' and the TPEN Prompts tool will be active in your project.

## How to generate and use a prompt

> Make sure you have already added the tool to the project you use.

Navigate to the transcription interface at https://app.t-pen.org/transcribe?projectID={id_here}.  You will see a dropdown menu of splitscreen tools, where you will see the TPEN Prompts tool with the label you provided earlier.  In the screenshot below we have not identified any lines or provided any transcription yet, so we will generate a prompt to do all that work.

<img width="1919" height="1041" alt="TPEN transcription interface with the splitscreen tool dropdown open" src="https://github.com/user-attachments/assets/5c950448-489f-4f07-ba9a-4db31ec7d798" />

---

Select it, and the tool becomes active on the right side where you will see the tool appear.

Click to allow your token to be used in the prompts. Then select a prompt and click 'Generate prompt' to see it populate.  Click the copy button so it is on your clipboard ready to paste.

> Click 'Copy' instead of highlighting the text and copying it yourself.  You can paste it elsewhere and edit it if desired.  Know that these prompts were tested as-is but LLMs are always evolving and changing how they process prompts and respond to users.

<img width="944" height="909" alt="TPEN Prompts tool with a generated prompt and Copy button visible" src="https://github.com/user-attachments/assets/de65f051-e1f8-4024-9315-214d401dbb40" />

---

Now give the prompt to your favorite LLM by whatever means you prefer.  The AI will guide you on progress or next steps from there.

<img width="1302" height="600" alt="LLM chat session processing the pasted TPEN prompt" src="https://github.com/user-attachments/assets/bdb9e569-3457-4bc2-a8ef-5f0fd7a6262a" />

---

In the end a report will be delivered telling you what happened.

<img width="1299" height="618" alt="LLM final report summarizing the work performed against TPEN" src="https://github.com/user-attachments/assets/8e64c9cb-215a-4f25-a357-6be40c1db0b9" />

---

The new data will appear when you refresh the page in TPEN.

<img width="1914" height="972" alt="TPEN transcription interface refreshed showing the new lines and transcription" src="https://github.com/user-attachments/assets/87f2d2c8-9368-4262-a51a-ad5990be0041" />

> Accuracy and speed of results vary greatly across the LLMs!

## Notes on usage

### CLI or agent LLM (e.g. Claude Code, Codex, OpenCode)

The LLM tends to have HTTP capabilities in CLI environment and will generate the data through TPEN.  You will only have to provide it the prompt and can watch it do the work for you.  You will need to refresh the page in TPEN once it is finished.

### Chat LLM (e.g. chatgpt.com, claude.ai, t3.chat)

The LLM tends to be restricted in Web Chat environments. Expect that the LLM will follow the prompt's fallback instruction and return payload JSON for you to copy. You will take that back to the tool in TPEN and paste it into the *Couldn't Use the API? Paste JSON from LLM here* panel. It will create the TPEN data for you there and refresh the page when it is finished.

> These methods are deliberately interchangeable per prompt template, so a contributor can swap LLMs without changing how the prompt is built.

## Contribute new LLM prompts
See [CONTRIBUTING.md](./CONTRIBUTING.md) - How to run the tool locally, add or edit `PROMPT.md` prompt templates, test, and open a PR.

## Prompt Templates

The prompt templates are in the [`templates/`](./templates/) directory.  There is one directory per prompt; each contains a `PROMPT.md` and an `index.js` registry entry.
