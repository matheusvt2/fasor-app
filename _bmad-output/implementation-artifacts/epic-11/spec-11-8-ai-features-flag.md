---
title: 'Story 11.8: AI features behind a flag (off in production until the Bedrock quota)'
type: 'feature'
created: '2026-09-30'
status: 'ready-for-dev'
baseline_revision: '12924e8'
review_loop_iteration: 0
dev_model: 'opus'
dev_effort: 'medium'
warnings: ['batched']
batched_reason: 'One small Epic 11 follow-up to Story 11.8 (decision of Matheus, 2026-09-30): production goes up with the LLM features off because the AWS account has no Bedrock quota yet; api, web and Terraform change together in one PR.'
---

# Story 11.8 follow-up: `AI_FEATURES` flag

## Intent

Production must never run the `fake` LLM provider (it invents readings) and has no Bedrock quota yet. One api env
flag `AI_FEATURES` (`on` | `off`, default `on`) turns off every reading whose pipeline needs the LLM step. Local
OCR stays on. Default `on` keeps local development and every existing test unchanged.

Which kinds need the LLM (checked in `apps/api/src/jobs/reading/kinds/*.ts`):

| reading kind | pipeline | with `AI_FEATURES=off` |
|---|---|---|
| `plate` ("Ler placa", and "Fotografar equipamento" photo-to-block, Story 9.2) | OCR + structuring | refused |
| `panel` (panel capture, Story 9.x) | OCR + structuring | refused |
| `caption` (vision caption suggestion, Story 9.3) | prose | refused |
| `nc_obs` (NC draft, Story 9.5) | prose | refused |
| `display` ("Ler visor") | OCR only (`display.ts` returns `structuring: null`) | **stays on** (ocr-svc) |

Dictation (Story 9.4, `apps/web/src/speech/`) is the browser Web Speech engine with no server call: it stays.

## Contract

- Kernel (`packages/domain`):
  - `AI_READING_KINDS` / `readingNeedsAi(kind): boolean` next to the reading code (`src/reading/`), true for
    `plate`, `panel`, `caption`, `nc_obs`; false for `display`. The api and web both use it; nothing else decides it.
  - `accountResponseSchema` (`src/contract/index.ts`) becomes `{ user, features: { ai: boolean } }`
    (`features` required; the api always sends it).
  - `errorCodeSchema` (`src/contract/errors.ts`) gains `ai_features_off`.
- Api:
  - `config.ts`: `AI_FEATURES: z.enum(['on','off']).default('on')`; `config.test.ts` covers default and `off`.
  - `GET /api/account` (`http/account.ts`) answers `features: { ai: config.AI_FEATURES === 'on' }`.
  - `jobs/reading/send.ts` `sendReading` (file receipt and push re-target): when off and `readingNeedsAi(kind)`,
    nothing is enqueued, a log line `reading refused: ai features off` is written, and the photo is marked
    `failed` through `writeReadingFailed` (so no device waits forever on `queued`).
  - `POST /api/photos/:id/reread` (`http/reading.ts`): when off and the photo's kind needs AI, `409`
    `{ code: 'ai_features_off', message: 'AI features are off on this server.' }`, no job, no run.
  - `jobs/reading/providers/index.ts` `createReadingProviders`: when off, `structuring` and `prose` are a
    provider that throws a permanent `ProviderError`-family error naming `AI_FEATURES=off` (defence in depth: a job
    queued before the flag flipped fails without calling `fake`). Takes `AI_FEATURES` from the config pick.
  - Wire `AI_FEATURES` through `http/app.ts` / `main.ts` to account, reading routes, files, sync routes, worker.
- Web:
  - `state/last-session.ts`: `readAiFeatures(): boolean | null`, `writeAiFeatures(on)`, cleared by
    `clearLastSession`, key `releng.ai-features` (server fact cached for offline boot like the profile).
  - `api/auth-client.ts` `readSession()` / sign-in returns the features beside the user;
    `state/session.tsx` exposes `aiFeatures: boolean` on `SessionState` (fresh read wins, else the cache, else
    `true`), writes the cache on every successful read.
  - When `aiFeatures` is false, hide (do not render; no disabled look) every AI entry point:
    - "Ler placa" in `surfaces/ficha/nameplate-section.tsx`;
    - "Fotografar equipamento" (the detect / photo-to-block entry, `surfaces/relatorio/` around
      `block-palette-field.tsx` and the `detect` copy in `copy/pt-br.ts` ~677-700);
    - the panel capture entry (`surfaces/relatorio/panel-capture.tsx` and its opener);
    - caption suggestion: no `reading_kind = 'caption'` put in `surfaces/photos/photo-ops.ts` `assignPhotoBatch`,
      nor a caption/nc_obs reading on capture in `surfaces/ficha/use-ficha-photos.ts` and `files/photo-import.ts`;
      the vision line / suggestion chips of a caption or NC draft do not render;
    - the NC draft ("rascunho" of `nc_obs`) entry.
    Trace every other `readingNeedsAi` kind entry with `grep -rn "reading_kind\|reading: {" apps/web/src`.
  - Manual entry of every field, photos without reading, "Ler visor" and dictation keep working.

## Terraform

- `infra/production/variables.tf`: `variable "ai_features"` (string, default `"off"`, validation `on|off`);
  a validation that `ai_features = "on"` needs `llm_provider != "fake"` (fake never runs in production);
  `ocr_provider` validation drops `fake` (production OCR is `ocr-svc` or `textract`).
- `infra/production/ecs.tf` `api_environment`: `AI_FEATURES = var.ai_features`. `llm_provider` stays `fake`,
  unreachable while the flag is off.
- `infra/README.md`: a short paragraph (production section) on the flag, what it hides, and that turning it on
  waits for Story 11.6 (Bedrock quota, `llm_provider = "bedrock"`).
- `terraform fmt`/`validate` run in the existing container helper if one exists (`infra/bin/`); never call AWS.

## Acceptance criteria

1. Given `AI_FEATURES` unset, when the api boots, then it is `on`, `GET /api/account` answers
   `features.ai = true`, and every existing test passes unchanged.
2. Given `AI_FEATURES=off`, when an uploaded photo with kind `plate`, `panel`, `caption` or `nc_obs` arrives (file
   receipt or push re-target), then no job is enqueued and the photo's `reading_status` becomes `failed`; a
   `display` photo is enqueued as before.
3. Given `AI_FEATURES=off`, when `POST /api/photos/:id/reread` names a `plate` photo, then `409 ai_features_off`
   and no run row; a `display` photo still answers `202`.
4. Given `AI_FEATURES=off`, when the reading job runs a `plate` payload, then the structuring provider is never
   called (the attempt fails permanently).
5. Given the account answers `features.ai = false`, when the user opens a ficha with a nameplate, the relatorio
   Sumário and the photos flow, then "Ler placa", "Fotografar equipamento", the panel capture, caption and NC-draft
   suggestions are absent, "Ler visor" and "Ditar" stay, and a manually typed nameplate value commits (outbox op
   asserted), and after a reload offline the entries stay hidden (cached flag).
6. `terraform validate` accepts the defaults (`ai_features = "off"`, `llm_provider = "fake"`) and refuses
   `ai_features = "on"` with `llm_provider = "fake"`.

## Tests

- Kernel unit: `readingNeedsAi` table; `accountResponseSchema` requires `features.ai`.
- Api: `config.test.ts`; integration tests (extend `http/reading.integration.test.ts`,
  `http/files-reading.integration.test.ts` and an account route test) with the app built with `AI_FEATURES: 'off'`;
  a unit test on `createReadingProviders` with `off`.
- Web unit: session exposes the cached flag; one component test that "Ler placa" is absent when off.
- E2E: new `e2e/ai-features-off.spec.ts`, tagged `@p0`, stubs `GET /api/account` with `page.route` adding
  `features.ai = false` to the real response (the way other specs stub server facts), and asserts AC 5.
  Existing specs stay on the default `on`.

## Narrowings

- The dated note under Story 11.8 in `epics.md` is written by the coordinator, not this batch.
- Turning the flag on in production waits for Story 11.6 (Bedrock provider and quota).
- No boot-time guard against `fake` in `NODE_ENV=production`: the local `api-prod` compose profile runs production
  mode on `fake`; the guard lives in Terraform validation instead.
