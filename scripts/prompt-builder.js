const DEFAULT_INSTRUCTIONS = [
  "You are assisting with TPEN manuscript transcription.",
  "Use the instruction files below as the authoritative contract for task flow, geometry rules, API behavior, and fallback handling.",
  "Do not restate or override those instruction files.",
  "Do not invent transcription lines or bounds when required evidence is unavailable.",
  "Only produce the save JSON payload when explicitly asked to provide save-ready output."
]

const buildToolsBaseUrl = () => {
  if (typeof window === "undefined" || !window.location) {
    return "/tools"
  }

  const { origin, pathname } = window.location
  const splitToolsMarker = "/split-tools/"
  const markerIndex = pathname.indexOf(splitToolsMarker)

  if (markerIndex >= 0) {
    const basePrefix = pathname.slice(0, markerIndex)
    return `${ origin }${ basePrefix }/tools`
  }

  const trimmedPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname
  const parentPath = trimmedPath.slice(0, Math.max(0, trimmedPath.lastIndexOf("/")))
  return `${ origin }${ parentPath }/tools`
}

const buildInstructionFileUrls = () => {
  const base = buildToolsBaseUrl()
  return [
    `${ base }/COMMON_TASKS.md`,
    `${ base }/IMAGE_ANALYSIS.md`,
    `${ base }/HANDWRITING_TEXT_RECOGNITION.md`,
    `${ base }/TPEN_API.md`
  ]
}

const chooseDefaultTask = (context = {}) => {
  const hasLineArray = Array.isArray(context.lines) && context.lines.length > 0
  const hasCurrentLine = `${ context.currentLineId ?? "" }`.trim().length > 0
  const hasLineHints = hasLineArray || hasCurrentLine

  const columnCount = Number(context.columns)
  const hasColumns = Array.isArray(context.columnData)
    ? context.columnData.length > 0
    : Number.isFinite(columnCount) && columnCount > 0

  if (hasLineHints) {
    return "Text Recognition Within Known Bounds"
  }

  if (hasColumns) {
    return "Line Detection"
  }

  return "Bounds Detection Followed by Text Recognition"
}

export const buildTranscriptionPrompt = (context = {}) => {
  const {
    projectId,
    pageId,
    manifestId,
    manifestUri,
    canvasId,
    canvasWidth,
    canvasHeight,
    idToken,
    imageUrl,
    lines
  } = context

  const lineHints = Array.isArray(lines) && lines.length > 0
    ? lines.map((line, index) => {
      const id = line?.id ?? `line-${index + 1}`
      const boundary = line?.xywh ?? "position unknown"
      return `- ${id}: ${boundary}`
    }).join("\n")
    : "- (No existing lines; detect new lines from the image.)"

  const defaultTask = chooseDefaultTask(context)
  const instructionFileUrls = buildInstructionFileUrls()

  return [
    ...DEFAULT_INSTRUCTIONS,
    "",
    "Instruction Files (authoritative):",
    ...instructionFileUrls.map((url) => `- ${ url }`),
    "",
    `Default task when not otherwise specified: COMMON_TASKS.md -> '${ defaultTask }'.`,
    "",
    "Context:",
    `Project ID: ${projectId ?? "unknown"}`,
    `Page ID: ${pageId ?? "unknown"}`,
    `Manifest ID: ${manifestId ?? "unknown"}`,
    `Manifest URI: ${manifestUri ?? "unknown"}`,
    `Canvas ID: ${canvasId ?? "unknown"}`,
    `Canvas Width: ${canvasWidth ?? "unknown"}`,
    `Canvas Height: ${canvasHeight ?? "unknown"}`,
    `ID Token: ${idToken ?? "unknown"}`,
    "",
    "Image URL:",
    imageUrl ?? "unknown",
    "",
    "Existing or expected lines:",
    lineHints,
    "",
    "When explicitly asked for save-ready output, return JSON in this tool-call format:",
    "{",
    '  "tool": "save_tpen_annotations",',
    '  "arguments": {',
    '    "candidates": [',
    '      {',
    '        "text": "example transcription",',
    '        "bounds": { "x": 120, "y": 340, "w": 560, "h": 42 }',
    '      }',
    '    ]',
    '  }',
    "}",
    "",
    "If you are not explicitly asked for save-ready output yet, provide normal analysis/explanation instead of JSON.",
    "If required resources are inaccessible, state what is missing and do not fabricate candidates."
  ].join("\n")
}
