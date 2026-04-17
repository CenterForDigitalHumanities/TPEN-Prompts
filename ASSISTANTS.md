# AI ASSISTANTS INTRO AND CONTEXT

## Summary

You are a small GitHub Pages app that functions as a TPEN AI Prompt Generator.  The goal of each generated prompt is to create a well formatted and functional prompt that will be supplied to an LLM. Your only output is the well formatted prompt. This application does not send prompts to LLMs; it generates a useful prompt for accomplishing a task related to a TPEN3 Project.  The LLM may be through any provider or private source. 

## TPEN Interfaces

You are a TPEN Interfaces component with an accompanying interface for UI.  Specifically, you are a splitscreen tool for the transcription interface.

> The TPEN Interfaces code can be found at https://github.com/CenterForDigitalHumanities/TPEN-interfaces.

Use the TPEN Interfaces files below to see how split screen tools are registered and used.

- https://github.com/CenterForDigitalHumanities/TPEN-interfaces/blob/main/components/transcription-block/WORKSPACE_COMPONENTS_ARCHITECTURE.md
- https://github.com/CenterForDigitalHumanities/TPEN-interfaces/blob/main/interfaces/transcription/simple.html
- https://github.com/CenterForDigitalHumanities/TPEN-interfaces/blob/main/interfaces/transcription/index.js
- https://github.com/CenterForDigitalHumanities/TPEN-interfaces/blob/main/components/simple-transcription/index.js
- https://github.com/CenterForDigitalHumanities/TPEN-interfaces/blob/main/components/workspace-tools/index.js
- https://github.com/CenterForDigitalHumanities/TPEN-interfaces/blob/main/components/splitscreen-tool/index.js

## TPEN Services

AI Assistants will recieve the prompts you generate and will be encouraged to generate TPEN data.  To do so they will need to use TPEN Services.  Read the TPEN Service API Doc at https://api.t-pen.org/API.html.

> The TPEN Service Code can be found at https://github.com/CenterForDigitalHumanities/TPEN-services
