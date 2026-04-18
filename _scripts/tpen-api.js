const DEFAULT_API_BASE = "https://api.t-pen.org"
const ANNO_CONTEXT = "http://www.w3.org/ns/anno.jsonld"
const SELECTOR_CONFORMS_TO = "http://www.w3.org/TR/media-frags/"

const toError = async (response) => {
  const text = await response.text()
  return new Error(`TPEN API ${ response.status }: ${ text }`)
}

const genId = () => `${ Date.now() }-${ Math.random().toString(36).slice(2) }`

const asString = (value, fieldName) => {
  const str = `${ value ?? "" }`.trim()
  if (!str) {
    throw new Error(`Missing required ${ fieldName }`)
  }

  return str
}

const normalizeCoord = (value, fieldName) => {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for ${ fieldName }`)
  }

  if (value < 0) {
    throw new Error(`Value must be non-negative for ${ fieldName }`)
  }

  return Math.round(value * 1000) / 1000
}

const buildSelectorValue = (bounds) => {
  const { x, y, w, h, unit } = bounds
  const prefix = unit === "pct" ? "pct:" : ""
  return `xywh=${ prefix }${ x },${ y },${ w },${ h }`
}

const normalizeLineCandidate = (candidate, index) => {
  if (!candidate || typeof candidate !== "object") {
    throw new Error(`Line ${ index + 1 }: candidate is not an object`)
  }

  const text = `${ candidate.text ?? candidate.content ?? "" }`.trim()
  if (!text) {
    throw new Error(`Line ${ index + 1 }: missing text or content`)
  }

  const bounds = candidate.bounds ?? candidate.bbox
  if (!bounds || typeof bounds !== "object") {
    throw new Error(`Line ${ index + 1 }: missing bounds object`)
  }

  const x = normalizeCoord(bounds.x, "x")
  const y = normalizeCoord(bounds.y, "y")
  const w = normalizeCoord(bounds.w ?? bounds.width, "w")
  const h = normalizeCoord(bounds.h ?? bounds.height, "h")

  if (w <= 0 || h <= 0) {
    throw new Error(`Line ${ index + 1 }: width and height must be positive`)
  }

  const rawUnit = `${ bounds.unit ?? "" }`.trim().toLowerCase()
  const unit = rawUnit === "percent" || rawUnit === "pct"
    ? "pct"
    : null

  if (rawUnit && rawUnit !== "percent" && rawUnit !== "pct") {
    throw new Error(`Line ${ index + 1 }: bounds.unit must be omitted for Canvas-dimension coordinates or set to ''pct'' for percentages`)
  }

  if (unit === "pct" && (x > 100 || y > 100 || x + w > 100 || y + h > 100)) {
    throw new Error(`Line ${ index + 1 }: percent bounds exceed canvas [0,100]`)
  }

  return {
    id: `${ candidate.id ?? genId() }`.trim(),
    text,
    bounds: { x, y, w, h, unit }
  }
}

const buildAnnotation = ({ candidate, canvasId, creatorAgent, index }) => {
  const normalized = normalizeLineCandidate(candidate, index)

  return {
    id: normalized.id,
    type: "Annotation",
    "@context": ANNO_CONTEXT,
    body: [{
      type: "TextualBody",
      value: normalized.text,
      format: "text/plain"
    }],
    target: {
      source: canvasId,
      type: "SpecificResource",
      selector: {
        type: "FragmentSelector",
        conformsTo: SELECTOR_CONFORMS_TO,
        value: buildSelectorValue(normalized.bounds)
      }
    },
    creator: creatorAgent,
    motivation: "transcribing"
  }
}

export const getPageContext = (context = {}) => {
  const projectId = asString(context.projectId, "projectId")
  const pageId = asString(context.pageId, "pageId")
  const canvasId = asString(context.canvasId, "canvasId")
  const manifestUri = context.manifestUri || null
  const imageUrl = context.imageUrl || ""
  const creatorAgent = context.creatorAgent || context.creator || ""
  const idToken = context.idToken || null
  const canvasWidth = Number.isFinite(context.canvasWidth) ? context.canvasWidth : null
  const canvasHeight = Number.isFinite(context.canvasHeight) ? context.canvasHeight : null

  return {
    projectId,
    pageId,
    canvasId,
    manifestUri,
    canvasWidth,
    canvasHeight,
    imageUrl,
    creatorAgent,
    idToken
  }
}

export const validateCandidates = (candidates = []) => {
  if (!Array.isArray(candidates)) {
    throw new Error("Candidates must be an array")
  }

  if (candidates.length === 0) {
    throw new Error("No candidates to validate")
  }

  const ids = new Set()
  const validated = candidates.map((candidate, index) => {
    const norm = normalizeLineCandidate(candidate, index)
    if (ids.has(norm.id)) {
      throw new Error(`Duplicate line id at index ${ index }: ${ norm.id }`)
    }

    ids.add(norm.id)
    return norm
  })

  return validated
}

export const buildPagePayload = ({
  candidates,
  canvasId,
  creatorAgent
}) => {
  const validated = validateCandidates(candidates)
  return {
    items: validated.map((candidate, index) =>
      buildAnnotation({ candidate, canvasId, creatorAgent, index })
    )
  }
}

export const savePageWithCandidates = async ({
  token,
  projectId,
  pageId,
  canvasId,
  candidates,
  creatorAgent,
  apiBase = DEFAULT_API_BASE
}) => {
  const safeProjectId = asString(projectId, "projectId")
  const safePageId = asString(pageId, "pageId")

  const payload = buildPagePayload({
    candidates,
    canvasId,
    creatorAgent
  })

  const headers = {
    "Content-Type": "application/json"
  }

  if (token) {
    headers.Authorization = `Bearer ${ token }`
  }

  const response = await fetch(`${ apiBase }/project/${ safeProjectId }/page/${ safePageId }`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
    credentials: "include"
  })

  if (!response.ok) {
    throw await toError(response)
  }

  return response.json()
}
