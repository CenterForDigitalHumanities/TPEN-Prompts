import {
  requestTPENContext,
  requestTPENIdToken,
  subscribeToContext,
  subscribeToIdToken
} from "/scripts/message-bridge.js"
import { buildTranscriptionPrompt } from "/scripts/prompt-builder.js"
import { getPageContext, validateCandidates, savePageWithCandidates } from "/scripts/tpen-api.js"

const state = {
  context: {},
  origin: null
}

const API_BASE = "https://api.t-pen.org"

const byId = (id) => document.getElementById(id)

const statusEl = byId("status")
const promptOutputEl = byId("promptOutput")
const manualPageJsonEl = byId("manualPageJson")
const manualColumnsJsonEl = byId("manualColumnsJson")
const manualLinesJsonEl = byId("manualLinesJson")

const setStatus = (message) => {
  statusEl.textContent = message
}

const setMeta = (id, value) => {
  const el = byId(id)
  if (el) {
    el.textContent = value ?? "-"
  }
}

const maskToken = (token) => {
  if (!token) {
    return "Not requested"
  }

  const prefix = token.slice(0, 6)
  return `${ prefix }…`
}

const refreshContextDisplay = () => {
  const ctx = state.context
  setMeta("metaOrigin", state.origin ?? "Unknown")
  setMeta("metaProjectId", ctx.projectId)
  setMeta("metaPageId", ctx.pageId)
  setMeta("metaManifestId", ctx.manifestId)
  setMeta("metaCanvasId", ctx.canvasId)
  setMeta("metaImageUrl", ctx.imageUrl)
  setMeta("metaCurrentLineId", ctx.currentLineId)
  setMeta("metaIdToken", maskToken(ctx.idToken))
}

const ensureCanvasDimensionsInState = async () => {
  const pageCtx = getPageContext(state.context)
  const resolvedDimensions = await resolveCanvasDimensions(pageCtx)

  state.context = {
    ...state.context,
    ...resolvedDimensions
  }

  return resolvedDimensions
}

const generatePrompt = async () => {
  try {
    setStatus("Resolving canvas dimensions for prompt...")
    await ensureCanvasDimensionsInState()
    refreshContextDisplay()
    promptOutputEl.value = buildTranscriptionPrompt(state.context)
    setStatus("Prompt generated. Review and copy into your LLM.")
  } catch (error) {
    setStatus(`Error: ${ error.message }`)
  }
}

const copyPrompt = async () => {
  if (!promptOutputEl.value.trim()) {
    setStatus("Generate a prompt first.")
    return
  }

  await navigator.clipboard.writeText(promptOutputEl.value)
  setStatus("Prompt copied to clipboard.")
}

const requestContext = () => {
  const requested = requestTPENContext()
  if (!requested) {
    setStatus("No parent frame detected. Open this tool from TPEN.")
    return
  }

  setStatus("Context request sent. Waiting for parent response...")
}

const requestIdToken = () => {
  const requested = requestTPENIdToken()
  if (!requested) {
    setStatus("No parent frame detected. Open this tool from TPEN.")
    return
  }

  setStatus("ID token requested. Waiting for parent response...")
}

const parseObjectIfString = (value) => {
  if (!value) {
    return null
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }

  return value
}

const extractCandidates = (parsed) => {
  const argumentsObject = parseObjectIfString(parsed?.arguments)
  const toolCallArguments = parseObjectIfString(parsed?.toolCall?.arguments)

  return (
    parsed?.candidates
    ?? parsed?.lines
    ?? argumentsObject?.candidates
    ?? toolCallArguments?.candidates
    ?? []
  )
}

const canonicalizeUri = (value) => {
  if (!value || typeof value !== "string") {
    return ""
  }

  try {
    const parsed = new URL(value)
    const base = `${ parsed.origin }${ parsed.pathname }`
    return base.replace(/\/+$/, "")
  } catch {
    return value.replace(/[?#].*$/, "").replace(/\/+$/, "")
  }
}

const asPositiveNumberOrNull = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }

  return num
}

const parseCanvasDimensions = (obj) => {
  if (!obj || typeof obj !== "object") {
    return { canvasWidth: null, canvasHeight: null }
  }

  return {
    canvasWidth: asPositiveNumberOrNull(obj.width),
    canvasHeight: asPositiveNumberOrNull(obj.height)
  }
}

const fetchJson = async (uri) => {
  const response = await fetch(uri, {
    method: "GET",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(`Failed to load ${ uri } (${ response.status })`)
  }

  return response.json()
}

const findCanvasInManifest = (manifest, canvasId) => {
  if (!manifest || typeof manifest !== "object") {
    return null
  }

  const queue = [manifest.items]
  const normalizedCanvasId = canonicalizeUri(canvasId)

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) {
      continue
    }

    if (Array.isArray(current)) {
      for (const entry of current) {
        queue.push(entry)
      }
      continue
    }

    if (typeof current !== "object") {
      continue
    }

    const currentId = canonicalizeUri(current.id)
    if (currentId && currentId === normalizedCanvasId) {
      return current
    }

    if (Array.isArray(current.items)) {
      queue.push(current.items)
    }
  }

  return null
}

const resolveCanvasDimensions = async ({ canvasId, manifestUri, canvasWidth, canvasHeight }) => {
  if (Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight)) {
    return { canvasWidth, canvasHeight }
  }

  let loadedCanvas = null
  try {
    loadedCanvas = await fetchJson(canvasId)
  } catch {
    loadedCanvas = null
  }

  const directDimensions = parseCanvasDimensions(loadedCanvas)
  if (Number.isFinite(directDimensions.canvasWidth) && Number.isFinite(directDimensions.canvasHeight)) {
    return directDimensions
  }

  if (!manifestUri) {
    throw new Error("Missing canvas dimensions and manifestUri fallback in context")
  }

  const manifest = await fetchJson(manifestUri)
  const matchingCanvas = findCanvasInManifest(manifest, canvasId)
  const fallbackDimensions = parseCanvasDimensions(matchingCanvas)

  if (!Number.isFinite(fallbackDimensions.canvasWidth) || !Number.isFinite(fallbackDimensions.canvasHeight)) {
    throw new Error("Could not resolve canvas width/height from Canvas URI or Manifest items")
  }

  return fallbackDimensions
}

const normalizeBoundsToCanvasIntegerCoordinates = (candidates, { canvasWidth, canvasHeight }) => {
  const canConvertPercent = Number.isFinite(canvasWidth) && Number.isFinite(canvasHeight)

  return candidates.map((candidate) => {
    const bounds = candidate?.bounds ?? candidate?.bbox
    if (!bounds) {
      return candidate
    }

    const rawUnit = `${ bounds.unit ?? "" }`.trim().toLowerCase()
    const unit = rawUnit === "percent" || rawUnit === "pct"
      ? "pct"
      : null

    const rawX = Number(bounds.x)
    const rawY = Number(bounds.y)
    const rawW = Number(bounds.w ?? bounds.width)
    const rawH = Number(bounds.h ?? bounds.height)

    if (unit === "pct") {
      if (!canConvertPercent) {
        throw new Error("Cannot convert percent bounds without canvas width/height")
      }

      const x = Math.round((rawX / 100) * canvasWidth)
      const y = Math.round((rawY / 100) * canvasHeight)
      const w = Math.round((rawW / 100) * canvasWidth)
      const h = Math.round((rawH / 100) * canvasHeight)

      return {
        ...candidate,
        bounds: {
          ...bounds,
          x,
          y,
          w,
          h,
          unit: null
        }
      }
    }

    const x = Math.round(rawX)
    const y = Math.round(rawY)
    const w = Math.round(rawW)
    const h = Math.round(rawH)

    return {
      ...candidate,
      bounds: {
        ...bounds,
        x,
        y,
        w,
        h,
        unit: null
      }
    }
  })
}

const parseLLMOutput = (jsonString) => {
  try {
    const parsed = JSON.parse(jsonString)
    const candidates = extractCandidates(parsed)
    return Array.isArray(candidates) ? candidates : []
  } catch (e) {
    throw new Error("Invalid JSON output from LLM")
  }
}

const parseJsonTextarea = (element, operationName) => {
  const raw = element?.value?.trim() ?? ""
  if (!raw) {
    throw new Error(`${ operationName }: paste a JSON payload first`)
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`${ operationName }: payload must be valid JSON`)
  }
}

const fetchTpenWithJson = async ({ token, url, method, payload }) => {
  const headers = {
    "Content-Type": "application/json"
  }

  if (token) {
    headers.Authorization = `Bearer ${ token }`
  }

  const response = await fetch(url, {
    method,
    headers,
    body: JSON.stringify(payload),
    credentials: "include"
  })

  if (!response.ok) {
    throw new Error(`TPEN API ${ response.status }: ${ await response.text() }`)
  }

  const text = await response.text()
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const inferColumnMethod = (payload) => {
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.columnLabelsToMerge) && payload.newLabel) {
      return "PUT"
    }

    if (Array.isArray(payload.annotationIdsToAdd) && payload.columnLabel) {
      return "PATCH"
    }
  }

  return "POST"
}

const submitManualPageUpdate = async () => {
  if (!state.context.idToken) {
    setStatus("Request ID token before submitting manual updates.")
    return
  }

  try {
    const pageCtx = getPageContext(state.context)
    const payload = parseJsonTextarea(manualPageJsonEl, "Update Page")
    const url = `${ API_BASE }/project/${ pageCtx.projectId }/page/${ pageCtx.pageId }`

    setStatus("Submitting Update Page...")
    await fetchTpenWithJson({
      token: pageCtx.idToken,
      url,
      method: "PUT",
      payload
    })
    setStatus("Update Page submitted successfully.")
  } catch (error) {
    setStatus(`Error: ${ error.message }`)
  }
}

const submitManualColumnsUpdate = async () => {
  if (!state.context.idToken) {
    setStatus("Request ID token before submitting manual updates.")
    return
  }

  try {
    const pageCtx = getPageContext(state.context)
    const payload = parseJsonTextarea(manualColumnsJsonEl, "Update Columns")
    const method = inferColumnMethod(payload)
    const url = `${ API_BASE }/project/${ pageCtx.projectId }/page/${ pageCtx.pageId }/column`

    setStatus(`Submitting Update Columns (${ method })...`)
    await fetchTpenWithJson({
      token: pageCtx.idToken,
      url,
      method,
      payload
    })
    setStatus(`Update Columns submitted successfully via ${ method }.`)
  } catch (error) {
    setStatus(`Error: ${ error.message }`)
  }
}

const submitManualLinesUpdate = async () => {
  if (!state.context.idToken) {
    setStatus("Request ID token before submitting manual updates.")
    return
  }

  try {
    const pageCtx = getPageContext(state.context)
    const payload = parseJsonTextarea(manualLinesJsonEl, "Update Lines")
    const lineId = `${ payload.lineId ?? payload.id ?? "" }`.trim()
    const textValue = `${ payload.text ?? payload.value ?? "" }`

    if (!lineId) {
      throw new Error("Update Lines: payload must include lineId")
    }

    const headers = {
      "Content-Type": "text/plain",
      Authorization: `Bearer ${ pageCtx.idToken }`
    }

    const url = `${ API_BASE }/project/${ pageCtx.projectId }/page/${ pageCtx.pageId }/line/${ lineId }/text`
    setStatus("Submitting Update Lines (PATCH)...")

    const response = await fetch(url, {
      method: "PATCH",
      headers,
      body: textValue,
      credentials: "include"
    })

    if (!response.ok) {
      throw new Error(`TPEN API ${ response.status }: ${ await response.text() }`)
    }

    setStatus("Update Lines submitted successfully.")
  } catch (error) {
    setStatus(`Error: ${ error.message }`)
  }
}

const saveLLMCandidates = async () => {
  const promptText = promptOutputEl.value
  if (!promptText.trim()) {
    setStatus("Generate a prompt and run it in your LLM first.")
    return
  }

  if (!state.context.idToken) {
    setStatus("Request ID token before saving annotations.")
    return
  }

  try {
    const pageCtx = getPageContext(state.context)
    setStatus("Resolving canvas dimensions...")
    const resolvedDimensions = await ensureCanvasDimensionsInState()
    setStatus("Validating candidates...")
    
    const userOutput = prompt("Paste the LLM JSON output here:")
    if (!userOutput) {
      setStatus("Cancelled.")
      return
    }
    
    const candidates = parseLLMOutput(userOutput)
    const normalizedBounds = normalizeBoundsToCanvasIntegerCoordinates(candidates, resolvedDimensions)
    const validated = validateCandidates(normalizedBounds)
    
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
byId("requestContextBtn")?.addEventListener("click", requestContext)
byId("requestIdTokenBtn")?.addEventListener("click", requestIdToken)
byId("submitManualPageBtn")?.addEventListener("click", submitManualPageUpdate)
byId("submitManualColumnsBtn")?.addEventListener("click", submitManualColumnsUpdate)
byId("submitManualLinesBtn")?.addEventListener("click", submitManualLinesUpdate)

subscribeToContext((context, origin) => {
  state.context = {
    ...context,
    idToken: null
  }
  state.origin = origin
  promptOutputEl.value = ""
  refreshContextDisplay()
  setStatus("Context received. Click Generate Prompt when ready.")
})

subscribeToIdToken((idToken, origin) => {
  state.context = {
    ...state.context,
    idToken
  }
  state.origin = origin
  refreshContextDisplay()
  setStatus("ID token received and stored for API use.")
})

refreshContextDisplay()
setStatus("Waiting for context from parent frame...")
