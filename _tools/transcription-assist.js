import { subscribeToContext } from "/tools/message-bridge.js"
import { buildTranscriptionPrompt } from "/tools/prompt-builder.js"
import { getPageContext, validateCandidates, savePageWithCandidates } from "/tools/tpen-api.js"

const state = {
  context: {},
  origin: null
}

const byId = (id) => document.getElementById(id)

const statusEl = byId("status")
const promptOutputEl = byId("promptOutput")

const setStatus = (message) => {
  statusEl.textContent = message
}

const setMeta = (id, value) => {
  const el = byId(id)
  if (el) {
    el.textContent = value ?? "-"
  }
}

const refreshContextDisplay = () => {
  const ctx = state.context
  setMeta("metaOrigin", state.origin ?? "Unknown")
  setMeta("metaProjectId", ctx.projectId)
  setMeta("metaPageId", ctx.pageId)
  setMeta("metaCanvasId", ctx.canvasId)
  setMeta("metaImageUrl", ctx.imageUrl)
  setMeta("metaCurrentLineId", ctx.currentLineId)
}

const generatePrompt = () => {
  promptOutputEl.value = buildTranscriptionPrompt(state.context)
  setStatus("Prompt generated. Review and copy into your LLM.")
}

const copyPrompt = async () => {
  if (!promptOutputEl.value.trim()) {
    setStatus("Generate a prompt first.")
    return
  }

  await navigator.clipboard.writeText(promptOutputEl.value)
  setStatus("Prompt copied to clipboard.")
}

const parseLLMOutput = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString)
    const candidates = parsed.candidates ?? parsed.lines ?? []
    return Array.isArray(candidates) ? candidates : []
  } catch (e) {
    throw new Error("Invalid JSON output from LLM")
  }
}

const saveLLMCandidates = async () => {
  const promptText = promptOutputEl.value
  if (!promptText.trim()) {
    setStatus("Generate a prompt and run it in your LLM first.")
    return
  }

  try {
    const pageCtx = getPageContext(state.context)
    setStatus("Validating candidates...")
    
    const userOutput = prompt("Paste the LLM JSON output here:")
    if (!userOutput) {
      setStatus("Cancelled.")
      return
    }
    
    const candidates = parseLLMOutput(userOutput)
    const validated = validateCandidates(candidates)
    
    setStatus("Saving to TPEN...")
    await savePageWithCandidates({
      token: pageCtx.idToken,
      projectId: pageCtx.projectId,
      pageId: pageCtx.pageId,
      canvasId: pageCtx.canvasId,
      candidates: validated,
      creatorAgent: pageCtx.creatorAgent
    })
    
    setStatus(`Saved ${ validated.length } line(s) to TPEN. Page updated successfully.`)
    promptOutputEl.value = ""
  } catch (error) {
    setStatus(`Error: ${ error.message }`)
  }
}

byId("generatePromptBtn")?.addEventListener("click", generatePrompt)
byId("copyPromptBtn")?.addEventListener("click", copyPrompt)
byId("saveAnnotationsBtn")?.addEventListener("click", saveLLMCandidates)

subscribeToContext((context, origin) => {
  state.context = context
  state.origin = origin
  refreshContextDisplay()
  generatePrompt()
  setStatus("Context received. Ready to transcribe.")
})

refreshContextDisplay()
setStatus("Waiting for context from parent frame...")
