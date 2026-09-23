---
title: 'Epic 2 fixes: retro items E2-A1 to E2-A3'
type: 'bugfix'
created: '2026-09-22'
status: 'in-review'
baseline_commit: '5feb8d7'
route: 'freeform'
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/AGENTS.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-retro-2026-09-22.md'
  - '{project-root}/_bmad-output/implementation-artifacts/reviews/epic-2-review-qa.md'
  - '{project-root}/_bmad-output/planning-artifacts/epics.md'
---

<intent-contract>

## Intent

**Problem:** The Epic 2 retrospective rejected the epic on D-1 to D-8 (`reviews/epic-2-review-qa.md`). The worst is D-1: a server merge of a manufacturer or voltage-class name leaves a ghost row on the device that sent it, and later edits to that ghost are acked and lost. Two acceptance criteria were reachable only in unit tests (D-2, D-3), Story 2.3 had no `@p0` (D-4), and forms and layout diverge from the ACs (D-5 to D-8).

**Approach:** One PR, one fix per defect, each with a test that drives it as a person would.

- **D-1 (E2-A1).** The server rewrites an op before logging it. A create that merges by normalized name, and any op on an id already merged away, is logged on the survivor under the device's own `op_id`. So the log holds what was applied, and every device that pulls it converges. A merge also logs one `system:registry` remove of the merged-away id's `removed_at` with `meta.merged_into`. That op retires the ghost on every device and is the persisted redirect that later requests read, so the per-request `idRedirects` map goes away. On the device, `rematerialize` drops an outbox op the server log already holds, wherever the server applied it, and `applyPulled` rebuilds the rows the device's own ops were written against. Tests: an integration test runs two cycles from the originating device (`sync.integration.test.ts`), a Dexie unit test checks convergence (`sync-store.test.ts`), and an e2e test blocks the pull of cycle 1 so a later edit on the ghost travels in cycle 2 (`2.5-E2E-005`, `@p0`).
- **D-2 (E2-A2).** The instrument form's Fabricante field is `RegistryPickerField`. On desktop it is the Combobox. On tablet and phone it is the chip row, which ends in "Outro…". Its recents come from the kernel (`instrumentManufacturerRecents`, `wordRowByName`). "Criar “…”" creates the Fabricantes entry in the same batch as the instrument field, offline, and is offered only for a name the registry does not hold, compared the way the server merge compares. The Combobox opens on typing even when only "Criar" would match (`allowsEmptyCollection`). AC 2.4-2 is struck through in `epics.md` and moved to Story 4.1, dated 2026-09-22 and decided by Matheus. Test: `2.5-E2E-004` (`@p0`) creates a manufacturer offline from the instrument form.
- **D-3.** An attached certificate offers "Abrir". It opens this device's Blob, or else `GET /api/files/{id}/original` on demand, which is then kept (`ensureLocalBlob`). The tab opens inside the tap. Test: `2.2-E2E-004` opens the certificate on the picking device and on a second browser context.
- **D-4.** `2.3-E2E-001` is promoted to `@p0` and runs on company B, whose Empresa row it alone writes.
- **D-5.** The Empresa form and preview render `empresa ?? defaultEmpresaRow(id)`. Leaving an untouched default writes nothing.
- **D-6.** The voltage-class panel is its own form: one "Valor em kV" measurement field, with no name and no gender or number fields. `parseVoltageClassKv` accepts "15", "17,5", "23" and refuses anything else inline. The row reads "17,5 kV". The schema is unchanged: the value is stored in `name` and gender and number stay null.
- **D-7.** Below 768px the registry edit panel is fixed full-screen and the list leaves the page (`app.css`, authored with the AC and DESIGN.md as source). The mock's `.rr-text` column rule is translated, so body and meta sit on two lines. The expired text already reads "Vencida em dd/mm/aaaa" in the validity slot, as DESIGN.md "Registry row" and the mock place it, so it is unchanged.
- **D-8.** Each item has its own fix and test:
  - An empty registry shows one action under an empty sentence, with no toolbar button.
  - Código stays editable.
  - The hidden dismiss buttons of the popovers read "Fechar" (`relabelDismissButtons`).
  - The Home Cadastros subtitle names all six tabs.
  - `commitFileBatch` no longer stamps `device_id` twice.
  - The registry panels skip a put whose value is unchanged (`sameFieldValue`).
  - Empresa validates its CNPJ with the shared `CnpjField`.
  - The "Sem logo" note hides once a logo exists.
  - The copy reads "nada o referencia hoje".

## Boundaries & Constraints

- Ownership (AD-1 to AD-3): derived text and rules live in `packages/domain` (`parseVoltageClassKv`, the voltage row text, recents, `wordRowByName`, `CADASTROS_SUBLINE`). `apps/web` writes only ops. `applyOp` stays the only reducer, and the server rewrite changes which row an op targets, never how it applies.
- No schema change and no migration. The redirect lives in the one op log.
- Copy goes to its A7 home. New sentences are marked `// authored:`. There is no emoji.
- Mock class names and `components.css`/`tokens.css` stay byte-identical. The phone full-screen rule is in `app.css`.

## Out of scope

- A name `put` that makes two rows collide (merge still runs on the create only, as Story 2.5 specifies).
- Numeric sort of voltage classes, and a schema that drops their unused grammar fields.
- Focus containment for the phone full-screen panel beyond removing the list from the page. The app bar stays reachable under it.

</intent-contract>
