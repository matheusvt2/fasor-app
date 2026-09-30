---
type: Architecture Rule
title: Suggestions and the reading pipeline
description: AD-12 and AD-14. Open for any camera assist, OCR, LLM call, Suggestion confirm flow, or the fake/anthropic/bedrock/textract providers.
tags: [architecture, suggestions, ocr, llm, ad-12, ad-14]
timestamp: 2026-09-30T00:00:00Z
sources: [ARCHITECTURE-SPINE.md#ad-12, ARCHITECTURE-SPINE.md#ad-14]
---
# Suggestions and reading

**Suggestion (AD-12)**: entity `{id, relatorio_id, target_path, value, trust suggested|verify, mode fill|replace, source {photo_id, bbox normalized, ocr_token_ids, reading_run_id}, status pending|confirmed|discarded, prompt_version}`. The reading job emits only `pending` creates. Every sheet cell is `{value, source_suggestion_id|null, op_id}`; any later plain `put` clears the source. "Confirmar" is one batch: `suggestion/{id}/status = confirmed` plus the target value with `meta.source_suggestion_id`. "Confirmar todos" skips `verify`. On applying a suggestion whose target cell is non-empty, the device runs `compareSuggestion`: equal -> auto-confirm batch with `meta.auto = true`; different -> stays pending as `replace`. Pending is the stored status, never inferred; progress, pre-issue, counts and renderer ignore anything not confirmed. A value is `suggested` only if it passes digit coverage over the OCR tokens the model cited, else `verify`; checked on the server. Derived suggestions (conclusion, parecer, deadline) are kernel computations, not rows.

**Reading pipeline (AD-14)**: a photo carries `reading_kind` (plate, display, caption, panel, nc_obs) and `reading_target`, set on the device at capture; `reading_status` is written by `system:reading` ops. File receipt enqueues one pg-boss `reading` job, singleton `(photo_id, reading_kind)`, three attempts then `failed`; `POST /api/photos/{id}/reread` re-enqueues. Two steps behind two interfaces in `domain/src/contract/ocr`: `OcrProvider.read(image)` returns tokens with bboxes, then the LLM structuring step. **The LLM never emits coordinates**; every bbox comes from OCR, the model only cites `ocr_token_ids`. Each run stores a `reading_run` row (provider, model, prompt_version, usage, duration).

Providers by environment: `LLM_PROVIDER` in fake, anthropic, bedrock; `OCR_PROVIDER` in fake, textract, ocr-svc. Both default to `fake`, which replays fixtures from `apps/api/src/jobs/reading/fixtures` so dev, tests and compose need no cloud or key. The backend never uses a personal Claude subscription. Real providers are post-MVP and behind a flag (Story 11.8, AI features off in production until the Bedrock quota).

Code: `apps/api/src/jobs/reading/` (job, kinds, providers), `packages/domain/src/reading/`, `services/ocr/`, web `apps/web/src/db/suggestion-store.ts`.
