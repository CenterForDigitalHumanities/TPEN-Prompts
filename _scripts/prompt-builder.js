const DEFAULT_INSTRUCTIONS = [
  "You are assisting with TPEN manuscript transcription.",
  "Use the instruction files below as the authoritative contract for task flow, geometry rules, API behavior, and fallback handling.",
  "Do not restate or override those instruction files.",
  "Return exactly one JSON object matching the required tool-call schema."
]

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

  return [
    ...DEFAULT_INSTRUCTIONS,
    "",
    "Instruction Files (authoritative):",
    "- _tools/COMMON_TASKS.md",
    "- _tools/IMAGE_ANALYSIS.md",
    "- _tools/HANDWRITING_TEXT_RECOGNITION.md",
    "- _tools/TPEN_API.md",
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
    "",
    "Image URL:",
    imageUrl ?? "unknown",
    "",
    "Existing or expected lines:",
    lineHints,
    "",
    "Return ONLY JSON in this tool-call format:",
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
    "Do not include markdown, prose, or explanations outside the JSON object."
  ].join("\n")
}
