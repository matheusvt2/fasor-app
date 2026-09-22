# Epic 2 review: code and hands-on QA (input for the retrospective)

Date: 2026-09-22. Build: `main` at ad0f353. Reviewer: Amelia (dev agent) with one independent code-review subagent (sonnet) over `git diff 7bb4fbf ad0f353`.
Browser pass: Playwright MCP on an isolated compose project (`fasor-qa2`, ports 48xxx, fresh database, `seed-users.ts --test`), tablet 768 and phone 390, online and offline. Torn down with `down -v` afterwards.
Evidence: `reviews/qa-epic-2/01..05-*.png`.

## Summary

1. The data layer is solid. Upload idempotency, `409 file_row_missing`, the sha256 and 25 MB checks, `calibrationCheck` (UTC calendar months), `compareCriterion` unit scaling and the ownership rules (every derived text in `packages/domain`, criterion numbers only in the seed) all hold under code reading and in the browser.
2. The worst defect is a client/server divergence from the manufacturer/voltage-class merge (D-1). The server merges "SCHNEIDER" into "Schneider", but the device that created it keeps a ghost row, and edits to that ghost are accepted and then lost without an error.
3. Two acceptance criteria exist only in unit tests. No human can reach them in the app (D-2, D-3).
4. The Empresa tab has no `@p0` e2e test, so the merge gate never exercises Story 2.3 (D-4).
5. Several UX gaps against the ACs and the mocks: the phone form is not full-screen, the Empresa defaults are invisible on the first visit, the voltage-class form is a copy of the manufacturer form, and the empty state is duplicated.

## Results per AC (browser)

| AC | Result | Notes |
|---|---|---|
| 2.1 Registries tabs, Instrumentos default, selection remembered | pass | The remembered tab survives Sync status and back. At 768 the tabs wrap onto 2 rows with a tall gap (`01`). |
| 2.1 Row text, expired first, "Vencida" amber | partial | The sort order and the amber color are right. The AC asks for a "Vencida" prefix, but the text sits at the end of the meta line. Body and meta run together with no gap ("MI 5500Megabras ·", `05`). |
| 2.1 Empty state "Cadastrar instrumento" | partial | Two primary buttons do the same thing ("Novo instrumento" and "Cadastrar instrumento") and there is no empty sentence (`01`). |
| 2.1 Form, derived validity, autosave per field | pass | One op per field, committed on blur (the date does not produce keystroke ops). Validity is derived and read-only. |
| 2.1 Form dialog on desktop, full-screen on phone | fail | At 390 the form is an inline panel under the list, with a page height of about 1840 px (`05`). |
| 2.1 Remove unreferenced with Confirm + undo toast | pass | Focus starts on Cancelar. "Desfazer" restores the row. The copy "nada referencia ele hoje" should read "nada o referencia hoje". |
| 2.1 Offline create, row at once, pushed next cycle | pass | The push runs about 1 s after the `online` event (the Epic 1 D-3 fix holds). |
| 2.2 Certificate pick, >25 MB refused, wrong type refused | pass | "Arquivo acima de 25 MB. Escolha um menor." and "Formato não aceito…". The tile moves from "Envio pendente" to "Enviado". |
| 2.2 PUT idempotent, original on demand | pass (API) | A second PUT with the same sha256 returns 200 with the same `uploaded_at`. |
| 2.2 "Office opens the certificate from the row" | fail | See D-3: the UI has no open action. |
| 2.2 logo/cover variants | pass | `thumb` and `print` are emitted after upload. |
| 2.3 Fields, autosave, defaults | partial | See D-5. The CNPJ is not validated here (13 digits accepted), although Clientes validates it. The e-mail is not validated either. |
| 2.3 Brand preview | partial | It re-renders live from the values (`03`). "Pré-visualização do documento" appears twice (card heading and inner label). The note "Sem logo, a capa e o cabeçalho mostram só a razão social." stays visible when a logo exists. "Página X de Y" wraps. At 768 the "miniature" pages fill about 1,000 px. |
| 2.4 Client, CNPJ 14 digits, sites, contact | pass | An invalid CNPJ shows an inline error and is not committed. The site input's accessible name is "Obras 1". A second blur emits a duplicate `put cnpj` with the same value. |
| 2.4 Client Combobox "Criar “…”" | not reachable | See D-2. |
| 2.5 Tabs, autosave | partial | See D-6: the voltage-class form accepts "abc" and has no kV. |
| 2.5 Chip row, "Outro…", inline create offline | not reachable | See D-2. |
| 2.5 Server merge by normalized name | fail on the originating device | See D-1. |
| 2.6 Criteria table read-only | pass | 3 rows, header cells, no buttons or inputs, no horizontal scroll at 390 (`04`). |

## Defects

- **D-1 (high): the manufacturer and voltage-class merge leaves a ghost row, and edits to it are lost without an error.**
  Reproduce: create "Schneider" and then "SCHNEIDER " on one device, then choose Sincronizar agora. The server holds 1 row and the device shows 2. Set Gênero = Feminino on the SCHNEIDER row and sync again. The badge reads "Sincronizado" and the server row's gender stays null.
  Cause: `apps/api/src/sync/apply.ts:206-248`. The redirect lives only in the per-request `idRedirects` map. No op tells the client that its id was merged away. Later puts on that id apply to no entity and are acked.
  Fix: emit a `system` op that removes the merged-away id (or points it at the surviving id) and persist the redirect. A later put against a merged id is then redirected, or at least rejected visibly.
  Why the tests missed it: `sync.integration.test.ts` checks the server state only. No test runs a second cycle on the originating device.
- **D-2 (high, coverage): `RegistryPickerField` is not mounted on any screen.**
  The chip row, "Outro…" and "Criar “Celtta”" offline (AC 2.5-2 and 2.5-3), and the client Combobox with "Criar" (AC 2.4-2), exist only in `components/registry-picker-field.test.tsx`. No e2e test covers them.
  The instrument's "Fabricante" field is free text and does not pick from the Fabricantes registry, although the Fabricantes tab copy says it feeds "o campo de fabricante do instrumento".
  Either wire the picker into the instrument form now, or record in `epics.md` that these ACs close in Epic 4/5, with an e2e test there.
- **D-3 (medium): a certificate cannot be opened from the UI.**
  `fetchFile` is used only by the Empresa preview (`empresa-tab.tsx:241`). The certificate tile offers only "Substituir". AC 2.2-3 ("the office opens the certificate from the row") is met only at the API level.
- **D-4 (medium): Story 2.3 has no `@p0` e2e test.** `e2e/cadastros.spec.ts:551,603,636` are `@p1` or `@p2`, so `pnpm verify` never runs the Empresa tab. Promote 2.3-E2E-001 to `@p0`. This finding comes from the code review.
- **D-5 (medium): the Empresa form defaults are invisible on the first visit.**
  Before the first field is committed, Título, Código and Revisão do formulário are empty, with no placeholder, while the preview already prints the defaults. After the first commit the fields show them (`02` vs `03`). Show the defaults from the first render.
- **D-6 (medium): the voltage-class form is the manufacturer form.**
  It shows "Nome" and "Gênero/Número gramatical", accepts "abc" and has no kV unit. AC 2.5 asks for a value in kV (e.g. "15", "17,5").
- **D-7 (medium): the phone layout does not follow AC 2.1.** The form is not full-screen, and the row body and meta have no separator.
- **D-8 (low):**
  - The empty state has duplicate CTAs and no sentence.
  - The Código becomes read-only after creation, so a typo cannot be fixed.
  - The phone tab menu's dismiss buttons are named "Descartar" (read by screen readers). "Fechar" fits better.
  - The Home "Cadastros" tile subtitle leaves out Empresa and Critérios.
  - `commitFileBatch` stamps `device_id` twice (`db/commit.ts:192-194`).
  - A second blur re-emits an unchanged value.

## What went well

- The upload pipeline (2.2) is rigorous: an idempotency race it reasons about explicitly, a concurrency of 2, per-file failure isolation, a triple 25 MB check, and cross-tenant lookups that look the same as "not yet applied".
- Ownership discipline held across six stories: derived text, sort and comparisons live in `packages/domain`, and criterion numbers exist only in `seed/criteria.ts`.
- `compareCriterion` throws on incompatible units instead of guessing, which is the right choice for a pass/fail verdict.
- The offline experience is good: the row appears at once, the op is committed per field on blur, and the push runs about 1 s after reconnecting.
- The deferred-work entries cite file:line and the review date, which made this review fast.

## What went badly

- Batching stories (2.2+2.3, 2.4+2.5+2.6) into one PR each hid ACs that were only half delivered. A component was built and unit-tested, the AC was ticked, and no screen used it (D-2). The batch also produced two `PreIssueRow` shapes that already need reconciling (in deferred-work).
- The `@p0` tags were chosen per test and not per story, so one story has no gate coverage (D-4).
- The server-merge test proved the server state but not convergence on the device that sent the ops (D-1). The real-browser pass during the stories did not try a second sync cycle.
- Forms reuse components too literally. The voltage class inherited the manufacturer's grammar fields (D-6).

## Improvements for Epic 3 onward

1. In the DoD, every AC maps to a test that drives it through a mounted screen. If none can exist yet, the AC is explicitly moved in `epics.md` with a date (no "unit-test-only" closure of a user-facing AC).
2. Add a merge checklist line: "every story has at least one `@p0`".
3. Server-side rewrites of client ops (merges, redirects) always emit a system op back to the client, with a two-cycle convergence test.
4. The human-style pass includes phone 390 for each form (full-screen check) and one "second device or second cycle" scenario.
5. Before closing a registry, check its form fields against the AC wording (units, validation), not only against the sibling registry.
