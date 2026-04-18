const DEFAULT_INSTRUCTIONS = [
  "You are assisting with historical manuscript transcription.",
  "Load the page image and detect all text lines.",
  "Transcribe each line faithfully.",
  "Return line bounds as Canvas-dimension coordinates when possible, and omit the unit for those coordinates.",
  "Use \"pct\" only if percentage bounds are absolutely necessary, and avoid that unless required.",
  "Use decimals when needed for precision.",
  "Keep uncertain letters in square brackets like [a?].",
  "Do not normalize spelling unless instructed."
]

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

  return [
    ...DEFAULT_INSTRUCTIONS,
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
