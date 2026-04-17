const DEFAULT_INSTRUCTIONS = [
  "You are assisting with historical manuscript transcription.",
  "Examine the provided page image and detect text lines.",
  "For each line, provide the transcribed text and its position as xywh bounds.",
  "Bounds must be relative to the Canvas: x and y are position, w and h are dimensions.",
  "Use pixel coordinates (not percent). Bounds values should be integers.",
  "Keep uncertain letters in square brackets like [a?].",
  "Do not normalize spelling unless instructed."
]

export const buildTranscriptionPrompt = (context = {}) => {
  const {
    canvasId,
    imageUrl,
    lines
  } = context

  const lineHints = Array.isArray(lines) && lines.length > 0
    ? lines.map((line, index) => {
      const id = line?.id ?? `line-${index + 1}`
      const boundary = line?.xywh ?? "position unknown"
      return `- ${id}: ${boundary}`
    }).join("\n")
    : "- (No existing lines provided; detect new lines from the image.)"

  return [
    ...DEFAULT_INSTRUCTIONS,
    "",
    "Canvas ID:",
    canvasId ?? "unknown",
    "",
    "Image URL:",
    imageUrl ?? "unknown",
    "",
    "Existing or expected lines:",
    lineHints,
    "",
    "Return ONLY valid JSON:",
    "{ \"candidates\": [{ \"text\": string, \"bounds\": { \"x\": integer, \"y\": integer, \"w\": integer, \"h\": integer } }, ...] }"
  ].join("\n")
}
