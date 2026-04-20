const TRUSTED_ORIGINS = new Set([
  "https://app.t-pen.org",
  "http://localhost:4000"
])

const CONTEXT_MESSAGE_TYPE = "TPEN_CONTEXT"
const REQUEST_CONTEXT_MESSAGE_TYPE = "REQUEST_TPEN_CONTEXT"
const ID_TOKEN_MESSAGE_TYPE = "TPEN_ID_TOKEN"
const REQUEST_ID_TOKEN_MESSAGE_TYPE = "REQUEST_ID_TOKEN"

export const isTrustedOrigin = (origin) => TRUSTED_ORIGINS.has(origin)

const getParentOrigin = () => {
  if (!document.referrer) {
    return "*"
  }

  try {
    return new URL(document.referrer).origin
  } catch {
    return "*"
  }
}

const postToParent = (message) => {
  if (window.parent === window) {
    return false
  }

  window.parent.postMessage(message, getParentOrigin())
  return true
}

export const requestTPENContext = () => postToParent({ type: REQUEST_CONTEXT_MESSAGE_TYPE })

export const requestTPENIdToken = () => postToParent({ type: REQUEST_ID_TOKEN_MESSAGE_TYPE })

const trimToHexId = (value) => {
  if (!value || typeof value !== "string") {
    return value ?? null
  }

  const match = value.match(/[a-f0-9]{24}$/i)
  return match ? match[0] : value
}

const asPositiveNumberOrNull = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) {
    return null
  }

  return num
}

const validateTPENContext = (payload) => {
  const errors = []
  if (!payload.projectId) errors.push("Missing projectId")
  if (!payload.pageId) errors.push("Missing pageId")
  if (!payload.canvasId) errors.push("Missing canvasId")
  if (!payload.imageUrl) errors.push("Missing imageUrl")
  
  if (errors.length > 0) {
    throw new Error(`Invalid TPEN_CONTEXT: ${ errors.join(", ") }`)
  }

  const manifestUri = payload.manifestId ?? payload.manifestUri ?? payload.canvasManifestUri ?? payload.manifest ?? null
  const manifestId = manifestUri
  
  return {
    projectId: trimToHexId(payload.projectId),
    pageId: trimToHexId(payload.pageId),
    manifestId,
    manifestUri,
    canvasId: payload.canvasId,
    canvasWidth: asPositiveNumberOrNull(payload.canvasWidth ?? payload.width),
    canvasHeight: asPositiveNumberOrNull(payload.canvasHeight ?? payload.height),
    imageUrl: payload.imageUrl,
    currentLineId: payload.currentLineId || null,
    columns: payload.columns || 1,
    idToken: null
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

export const subscribeToIdToken = (onIdToken) => {
  const handler = (event) => {
    if (!isTrustedOrigin(event.origin)) {
      return
    }

    const payload = event.data
    if (payload?.type !== ID_TOKEN_MESSAGE_TYPE) {
      return
    }

    const idToken = typeof payload.idToken === "string" ? payload.idToken.trim() : ""
    if (!idToken) {
      console.error("TPEN_ID_TOKEN validation error: Missing idToken")
      return
    }

    onIdToken(idToken, event.origin)
  }

  window.addEventListener("message", handler)
  return () => window.removeEventListener("message", handler)
}
