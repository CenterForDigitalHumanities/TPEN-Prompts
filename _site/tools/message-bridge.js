const TRUSTED_ORIGINS = new Set([
  "https://app.t-pen.org",
  "http://localhost:4000"
])

const CONTEXT_MESSAGE_TYPE = "TPEN_CONTEXT"

export const isTrustedOrigin = (origin) => TRUSTED_ORIGINS.has(origin)

const validateTPENContext = (payload) => {
  const errors = []
  if (!payload.projectId) errors.push("Missing projectId")
  if (!payload.pageId) errors.push("Missing pageId")
  if (!payload.canvasId) errors.push("Missing canvasId")
  if (!payload.imageUrl) errors.push("Missing imageUrl")
  
  if (errors.length > 0) {
    throw new Error(`Invalid TPEN_CONTEXT: ${ errors.join(", ") }`)
  }
  
  return {
    projectId: payload.projectId,
    pageId: payload.pageId,
    canvasId: payload.canvasId,
    imageUrl: payload.imageUrl,
    currentLineId: payload.currentLineId || null,
    columns: payload.columns || 1,
    idToken: payload.idToken || null
  }
}

export const subscribeToContext = (onContext) => {
  const handler = (event) => {
    if (!isTrustedOrigin(event.origin)) {
      return
    }

    const payload = event.data
    const messageType = payload?.type
    if (messageType !== CONTEXT_MESSAGE_TYPE) {
      return
    }

    try {
      const context = validateTPENContext(payload)
      onContext(context, event.origin)
    } catch (error) {
      console.error("TPEN_CONTEXT validation error:", error.message)
    }
  }

  window.addEventListener("message", handler)
  return () => window.removeEventListener("message", handler)
}
