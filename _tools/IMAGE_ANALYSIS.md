# Image Analysis Purpose

## Scope

Image Analysis identifies transcription-relevant regions in manuscript images and proposes candidate line regions for downstream text recognition.

## Default Objective

Given a manuscript image, find meaning-bearing regions and represent them as structured layout candidates:

- columns (major reading blocks)
- lines (ordered transcription units inside each column)

The goal is not artistic segmentation; it is reliable reading-order segmentation for transcription workflows.

## Default Assumptions

- Material may be historical and visually degraded.
- Common images are page-level color photographs or microfilm scans, but may include folio spreads or cropped details.
- Layout can include multiple columns, marginalia, headers, or irregular spacing.
- Text orientation is usually horizontal but may vary by manuscript tradition.

## Expected Output Shape

Image Analysis should output machine-usable geometric candidates and confidence notes, for example:

- `columns`: list of column regions in reading order
- `lines`: list of line regions in reading order
- bounds can be proposed as percent for model portability

Final persistence rule: bounds must be saved as integer coordinates computed from Canvas dimensions.

Canvas dimension resolution should follow this order:

1. Use `canvasWidth` and `canvasHeight` from context when present.
2. Otherwise load the Canvas object via `canvasId` and read `width`/`height`.
3. If Canvas URI fails or lacks dimensions, load `manifestUri` and find the matching Canvas in `items` by id.

## Quality Priorities

1. Preserve reading order.
2. Prefer high recall for likely text lines over aggressive pruning.
3. Keep region boundaries tight enough for line-level recognition.
4. Flag ambiguous regions rather than silently dropping them.

## Out of Scope

- Definitive textual interpretation
- Editorial normalization
- Historical commentary

Those belong to recognition and editorial stages, not layout detection.
