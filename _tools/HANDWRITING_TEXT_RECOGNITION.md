# Handwriting Text Recognition Purpose

## Scope

Handwriting Text Recognition (HTR) converts line-level manuscript image regions into textual transcription candidates.

## Default Objective

Interpret likely historical scripts and produce faithful line transcriptions suitable for TPEN annotation workflows.

## Context Inputs

HTR should consider any user-provided context when available:

- language
- date or period
- script family
- place or collection conventions
- abbreviation/expansion policy

If context is missing, apply conservative defaults and preserve uncertainty explicitly.

## Default Recognition Rules

1. Prioritize diplomatic transcription over normalization.
2. Preserve orthography and punctuation as observed.
3. Use explicit uncertainty markers for unclear glyphs (for example `[a?]`).
4. Do not invent expansions unless asked.
5. If expansion is requested, keep a traceable form (for example explicit markers or paired diplomatic/expanded output).

## Handling Ambiguity

When confidence is low:

- return best guess with uncertainty notation
- avoid forced certainty
- keep line segmentation stable even if text is partially uncertain

## Expected Output Shape

Per line candidate:

- `text`: transcription candidate
- `bounds`: aligned line geometry from analysis stage

This stage should not call TPEN APIs directly unless explicitly orchestrated by an external tool runner. The preferred role is producing structured candidates for validated save logic.

## Out of Scope

- Final editorial interpretation
- Translation
- Historical argumentation

Those belong to downstream scholarly workflows.
