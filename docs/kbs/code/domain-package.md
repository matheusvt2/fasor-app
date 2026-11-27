---
type: Code Map
title: packages/domain/src folders
description: What each kernel subfolder owns, so new pure logic lands in the right place.
tags: [code, domain, kernel]
timestamp: 2026-09-30T00:00:00Z
sources: [packages/domain/src]
---
# packages/domain/src

- `ops/` op type, `path.ts` (OpPath families), `apply.ts` (applyOp), `materialize`, `replay`, `outbox`, `order-key`.
- `schemas/` entity, block, file, snapshot zod schemas. `contract/` typed API routes, errors, `ocr.ts`, `reading.ts`, `generate.ts`, `sync.ts`, `version.ts` (CONTRACT_VERSION).
- `relatorio/` sheet and relatório logic: `ficha`, `cabine`, `conclusion`, `parecer`, `progress`, `pre-issue`, `integrity`, `instantiate`, `move`, `readings`, `reading-evaluation`, `nameplate-copy`, `resume`, suggestion builders.
- `status/` status table, `edited-since`. `merge/` policy, rules, conflicts (multi-device). `sync/` counts, status, streams.
- `seed/` versioned definitions (`v1`..`v3`, `criteria`, `sections-v1`, `template*`). `templates/`, `registry/`, `registration.ts`.
  *(2026-10-13: `seed/` holds `v1`..`v5` and `measurement.ts` (the measurement-table grammar, Story 14.5); `relatorio/measurement-evaluation.ts` evaluates it; `ops/path.ts` gains the family `sheet/test/value`; `CONTRACT_VERSION` is 19. See [measurement-table](/architecture/measurement-table.md).)*
  *(2026-11-07, Story 14.6, batch e22t: `types/` holds the company equipment types: `definition.ts` (the strict definition and the loose draft schemas), `validate.ts` (`validateTypeDraft`, its pt-BR issues), `block-definition.ts` (`asBlockDefinition`), `duplicate.ts` ("Duplicar" and the status words); `seed/definitions.ts` gains the resolver context (`DefinitionContext`, `findDefinitionIn`, `offeredTypes`); `ops/path.ts` gains the families `equipment_type`, `equipment_type/field` and `equipment_type_version`; `CONTRACT_VERSION` is 33.)*
- `permissions/` *(2026-11-21, Story 26.2, AD-29)*: `keys.ts`, `roles.ts`, `can.ts` (`can`, `isAdminRole`), `map.ts` (`permissionForPath`, `permissionForRoute`), `user.ts` (`activeUser`), `last-admin.ts`, and *(Story 26.5)* `refusal.ts` (`permissionRefusalText` per key, `SCREEN_UNAVAILABLE_TEXT`, `READ_ONLY_BANNER_TEXT`) and `screens.ts` (`permissionForScreen`, the one map from a web route to its key); see [roles-and-permissions](/architecture/roles-and-permissions.md).
- `permissions/user-list.ts` *(2026-11-22, Story 26.9)*: the Usuários screen's words and rules: `userStatusPillLabel` ("Convite pendente" beside the kernel's "Convidado"), `USER_STATUS_FILTERS`, `filterUserList`, `userListCountText`, `userRowActions`, `userActionDoneText` (when a change takes effect), `userRowDetailText`, `roleModulesText`, `userDirectoryRoles`, `userDirectory` (device rows overlaid by the route's views), `userChangeLeavesNoAdmin`, `lastAdminText`.
- `email/` *(2026-11-21, Story 26.6)*: `links.ts` (`SET_PASSWORD_PATH`, `INVITATION_LINK_HOURS` 72, `RESET_LINK_HOURS` 1, `PASSWORD_MIN_LENGTH` 8, `PASSWORD_MAX_LENGTH` 128, `setPasswordLink`, `tokenFromFragment`, `passwordLengthIssue`) and `messages.ts` (`invitationEmail`, `passwordResetEmail`, `EMAIL_SENDER_NAME`, the HTML escaped and the subject on one line); `permissions/user.ts` gains `passwordLinkAllowed`; `permissions/map.ts` the route name `admin.users`; `contract/admin-users.ts` *(Story 26.8)* the Admin's routes, schemas, actions and `AdminUserEvent`; `contract/errors.ts` gains `user_email_taken`, `last_admin`, `role_not_found`, `user_state_invalid`.
- `ai-answers/` *(2026-11-27, Stories 32.1 and 32.2)*: what an AI answer record is (`schema.ts`: `AI_ANSWER_USES`, `AI_ANSWER_OUTCOMES`, `AI_ANSWER_ACTIONS`, `AiAnswerDraft`), the records of each AI use (`build.ts`: `readingAnswers`, `audioAnswers`, `aiWriteAnswers`, `auditAnswers`, `auditFindingWatch`), how applied ops settle them (`settle.ts`: `settleAiAnswers`, `refusedByDevice`), value comparison (`values.ts`) and the rubric's measures and report (`rubric.ts`: `fieldReadError`, `wordChangeShare`, `guardRefusalKinds`, `aiQualityReport`, `aiAnswerSeverity`); `contract/ai-answers.ts` the device's report route of a proposal it did not write. Nothing on a screen reads it.
- `print/` `group-for-print`, `section-7..11`, `document-control`, `layout`, `revisions`, `last-nameplate`, `sm-c1`.
- `parse/` and `format/` pt-BR numbers, dates, units (the only place). `text/` plural and composed texts (derived pt-BR lives here, see [copy-homes](/ux/copy-homes.md)). `home/`, `points/`, `photos/`, `files/`, `drafts/`, `device/`, `prefs/`, `reading/`, `checks/`.
- `ids.ts` UUIDv7, `clock.ts`, `product.ts` (the `PRODUTO` constant; *2026-11-03, Story 20.1: value `Conforme`*).

Rule: no I/O, no framework, zod only. Exported through `src/index.ts`. Decision context: [kernel-and-seed](/architecture/kernel-and-seed.md).
