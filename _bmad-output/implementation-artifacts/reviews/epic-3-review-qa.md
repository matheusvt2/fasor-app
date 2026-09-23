# Epic 3 review: code and hands-on QA (input for the retrospective)

Date: 2026-09-23. Build: `main` at c6d1db7 (PRs #18-#21, Stories 3.1-3.7). Reviewer: Amelia (dev agent) with two independent code-review subagents (opus): one over the kernel side (`git diff 945e8d4 c6d1db7 -- packages/ scripts/ apps/api/`), one over the web side (`-- apps/web e2e`).
Browser pass: Playwright 1.63 from the `tools` container on an isolated compose project (`fasor-qa3`, ports 48xxx, fresh database, `seed-users.ts --test`), driving one persistent Chromium over CDP step by step, like a person: mouse, keyboard (Tab, Alt+arrows, Backspace, Ctrl+Z), clipboard, press-and-hold. Desktop 1280, tablet 768, phone 390, light and dark. The Playwright MCP browser was held by another session's server, so the pass ran in the container instead (setup friction, see "What went badly").
Evidence: `reviews/qa-epic-3/01..20-*.png`.

## Summary

1. The seed is faithful. Nameplate counts 0/5/10/13/12/14/0/12, checklists 5/5/14/15/15, the four table grammars, the boilerplate of sections 1-6 and 10 (119 strings compared with the docx) and the standard template totals (25/21/11/11/8/4/9/5 = 94) all hold. The seed is validated, deep-frozen and hash-pinned at module load.
2. The worst defect is in the fixture, not in the seed. The Porto Seguro fixture orders its locations alphabetically (Cobertura A first, Coluna 1, 10, 11, ...), and the golden snapshot froze that order (K1). Section 8 points and photo captions have similar shape defects (K2, K3). The goldens were generated from the generator itself and then used as proof, so nothing compared them with the delivered document.
3. The composer works well by hand. Stepper, press-and-hold, typed values with clamping, Alt+arrow and Position box reorders with the exact announcements, cabine with blocks and no column, subtype NA counts, the atomic variable chip and plain-text paste all pass in the browser.
4. Keyboard focus is dropped to `<body>` after archive, restore, undo and every removal (W1). The section editor's Ctrl+Z corrupts rather than undoes (W2), and repeated spaces collapse on reopen (W3).
5. Three findings need a human decision and seed v2, not a patch: `{obra}` means two things (section 1 cannot reproduce the delivered sentence), the subtype NA defaults are smaller than the fixture's real pattern, and the R-009 source review required by Story 3.1 is not recorded, although v1 is already hash-frozen.

## Results per AC (browser)

| AC | Result | Notes |
|---|---|---|
| 3.1 Seed counts, labels, grammars, subtypes, NA defaults | pass (code) | Verified by the kernel reviewer against addendum §9 with probes. The R-009 review record is missing (D-1). |
| 3.2 Standard template: skeleton, quantities, flags, seed v1 | pass | List row reads "Semente v1 · 9 seções · 6 cabines · 17 colunas · 94 blocos de equipamento" (`02`). Agrupar on for 1° Subsolo and Geradores only; seccionadora subtype MANUAL; IA/IP off. |
| 3.2 Empty state and seeding action | pass | Empresa B: "Nenhum template. Crie um a partir do relatório padrão FO.SERV-03." and "Criar template padrão" creates it (`20`). |
| 3.3 List, Duplicar "⟨nome⟩ — cópia" | pass, with W5 | A second duplicate of the same template gets the identical name "X — cópia"; two rows cannot be told apart (`04`). |
| 3.3 Arquivar, archived group, Restaurar | pass, with W1 | Focus falls to `<body>` after Arquivar and Restaurar. |
| 3.3 Remover with Confirm and undo | pass, with W1 | Focus starts on Cancelar; "Desfazer" restores the row, then focus falls to `<body>`. |
| 3.3 Archived leaves the creation picker | not reachable | The picker is Epic 4; kernel `pickableTemplates` only. |
| 3.4 Add cabine and columns, rename | pass | Blank rename closes the dialog silently with no change (low). No announcement after "Adicionar cabine". |
| 3.4 Reorder: Alt+↑/↓, Position box, drag, announcements | pass | "Coluna 5 movida para a posição 3 de 17" exactly; position 40 clamps to 17 ("posição 17 de 17"). |
| 3.4 Palette headed by the current column, groups Seções/Equipamentos | pass | "Coluna 9" heads the palette; on phone the palette is a sheet headed "Coluna 2" (`17`, `18`). |
| 3.4 Quantity stepper: −/+, typeable, "—" at zero, hold repeats, announcement | pass | "Seccionadoras, 25" in the live region; 1000 clamps to 99; "abc" and "-3" become "—"; a 1.5 s hold reaches 13. |
| 3.4 Header per-type totals | pass, with K6 | Totals update live. Summaries print "1 cabos de entrada · 1 cabos de saída" (`08`). At 768 "para-raios" wraps as "para-" / "raios". |
| 3.4 Cabine holds blocks with no column | pass | A new cabine with 1 trafo and 1 cabo de saída, then a column added beside them. |
| 3.4 Section cards: number, Overflow, Confirm + undo | pass, with a note | The overflow offers Adicionar abaixo · Descer · Duplicar · Editar texto · Remover. The card shows the position box and the section number side by side ("7 | 8 Pontos de atenção"), which reads as two numbers. |
| 3.4 Agrupar por tipo stored on the cabine | pass, with W8 | Tapping the label does not toggle. |
| 3.4 Only `template/{id}/*` ops | pass, with a design note | Every outbox op is `template/{id}/name`, `/skeleton` or `/blocks`. Each stepper press re-puts the whole `blocks` array, so concurrent edits on two devices are last-writer-wins on the array. |
| 3.5 Sub-block Toggle rows with state word; "Sempre" rows not controls | partial (W4) | Toggles work. "Verificações gerais" and "Conclusão" are `role="switch" aria-readonly tabindex=0`, a Tab stop announced as a switch; the mock uses `aria-disabled` and "…, sempre ativado". The mock's `.toggle-sub` lines (rows, voltage, criterion) are missing. |
| 3.5 Subtype sets NA defaults, "2 itens…" / "8 itens…" | pass | Seccionadora MANUAL gives "2 itens marcados NA por padrão"; TP Á SECO gives "8 itens marcados NA por padrão" (`12`, `13`). |
| 3.5 Disabled sub-block omitted from progress/print | not reachable | Kernel helper only; renderer is Epic 4+ (already in deferred-work). |
| 3.6 Plain-text editor, chip row, atomic chip, autosave | pass | Backspace removes a whole chip; a pasted "{cliente}" becomes a chip; pasted HTML is ignored; "{foo}" stays raw with no warning (K7). Text persists on reopen. "Editar texto" is reachable only from the Overflow; the card does not open it. |
| 3.6 Restaurar texto padrão with undo | pass | Closes the dialog and toasts "Texto padrão restaurado" with Desfazer. |
| 3.6 Ctrl+Z | fail (W2) | After inserting a chip and removing it with Backspace, Ctrl+Z removes the earlier typed " fim" instead of restoring the chip. |
| 3.6 Whitespace | fail (W3) | Stored "A    B" displays as "A B" (`white-space: normal` on `.rt-area`). |
| 3.7 Fixture: 6 cabines, 94 blocks, deterministic, loads through applyOp | pass, with K1-K4 | Order, section 8 points, captions and the `not_tested.reason` value are wrong in shape (below). |
| Layout 390/768/1280, dark | pass, with W7 | No horizontal overflow at any width. At 390 the cabine card's "Agrupar por tipo" row sits flush against the card border (`16-composer-390`, `19`). |

## Defects

Kernel and fixture (fix PR `fix/epic-3-kernel-fixture`):

- **K1 (high): the fixture orders locations alphabetically.** `fixtures/porto-seguro/op-log.ts:222,232` uses the skeleton ref as `order_key`. The snapshot reads Cobertura A · Cobertura B · Cubículo Enel · Geradores · Oxigênio · 1° Subsolo, Coluna 1 · 10 · 11 · ... · 2. The delivered document opens with Cubículo Enel. `snapshot.golden.json` froze the wrong order and no test checks order.
- **K2 (medium): section 8 points print not-tested entries first** (`nt*` sorts before `p*`), and `data.ts:166-171` changes the source's trailing `;` to `.` while claiming to be verbatim.
- **K3 (medium): photo captions include "Imagem NN:"** (`op-log.ts:519`), so a renderer that renumbers would print "Imagem 77: Imagem 75: …".
- **K4 (medium): `not_tested.reason` stores the pt-BR label** `'Solicitação do cliente'` instead of a seed key; `notTestedSchema.reason` is `z.string()`. Bullet 4's wording is the `impossibilidade_desligamento` justification, so the chosen reason itself is doubtful (decision for Matheus).
- **K5 (low): the row schema does not enforce the UI's rules**: `quantity: 5000`, duplicate `na_defaults`, empty node names all parse.
- **K6 (low): plurals** "1 cabos de entrada", "1 cabos de saída" in composer summaries (seen in the browser).
- **K7 (low): unknown brace tokens print raw with no report** (`resolveSectionText('{clente}')`).
- **K8 (low): client data outside the fixture folder**: 'Torres A e B' in `section-text.test.ts`, 'Porto Seguro' in `list.test.ts`, the full legal name in `home-store.test.ts` (already open in deferred-work).
- **K9 (ledger): two deferred-work entries still say "Epic 3 still backlog"**; the path-segment validation against `getDefinition` is still open and now due before Epic 4 writes sheet values.
- **K10 (low): a determinism test replays one in-memory array twice** and proves nothing beyond the golden comparison.

Web (fix PR `fix/epic-3-web`):

- **W1 (medium): focus falls to `<body>`** after Arquivar, Restaurar, Desfazer and every Remove through the Confirm dialog (list and composer). Seen in the browser.
- **W2 (medium): Ctrl+Z in the section editor** is not handled, and the editor's own DOM edits are invisible to browser history.
- **W3 (low-medium): repeated spaces collapse visually** but stay in the stored text that feeds the document.
- **W4 (low): "Sempre" rows are exposed as switches**, unlike the mock.
- **W5 (low): duplicate names collide** ("X — cópia" twice).
- **W6 (low): a list toast follows the user into a composer**, where its Desfazer acts on another template (`08`).
- **W7 (low, visual): the cabine card's second row has no left padding at 390.**
- **W8 (low): tapping a toggle's label does not toggle** (EXPERIENCE.md).
- **W9 (gate): the axe test over the 94-block composer times out at 15 s under load** (`template-composer.test.tsx:119`), which makes `pnpm verify` flaky.
- **W10 (low): keyboard auto-repeat on the stepper writes one op per repeat.**

Decisions for Matheus (no code change in this pass):

- **D-1: the R-009 source review of Story 3.1 is not recorded**, yet Story 3.1 is `done` and v1 is hash-frozen. Findings D-2 and D-3 now cost a seed v2 or a deliberate un-freeze before the first relatório exists.
- **D-2: `{obra}` is both the site phrase of section 1 and the cover's Cidade/local.** With the fixture inputs section 1 resolves to "…Transformação de São Paulo/SP da Porto Seguro…"; the docx reads "…Transformação das Torres A e B da Porto Seguro." The article "da" is hard-coded too.
- **D-3: subtype NA defaults are smaller than the reference job's pattern.** Seccionadora: the fixture marks 4 items NA (the seed's manual subtype marks 2). TP, TC and transformer: 10 (the seed's dry type marks 8; `ventiladores` and `rele_de_temperatura_externo` are missing). The standard template sets no subtype on TP, TC and transformers although the job's are EPÓXI/Á SECO. Rebuilding this job costs about 350 extra NA taps.
- **D-4: `template.version` is immutable**, so every relatório will record `template_version = 1`.
- **D-5: the two contact-insulation tables share one test key**, separated by a row-offset convention only the fixture defines; define it in the kernel before Epic 5's renderer reads it.
- **D-6: roles are inconsistent in the standard template** (only the Enel cables and seccionadoras carry roles), and the PTMT/IM panels and the Geradores' PTMG columns are flattened.
- **D-7: concurrent template edits are last-writer-wins on the whole `blocks`/`skeleton` array**, and an undo re-puts the old array over pulled edits. Acceptable for an office-only surface; decide before templates are edited on two devices.

## Fix status (2026-09-23)

- **Merged: PR #22** (`743ce40`, kernel and fixture). K1-K10 fixed, each with a test. K4 stores `solicitacao_cliente`; whether bullet 4 is really `impossibilidade_desligamento` stays with Matheus. Left open: section 8 still carries three per-block not-tested points where the delivered document prints one bullet 4, and more test files outside K8's list still use "Porto Seguro"/"Torres A e B".
- **Merged: PR #23** (`e0b4159`, web). W1-W3 and W6-W10 fixed. W4 was partial: the locked toggle now matches the mock, with "Sempre na ficha". The per-row `.toggle-sub` lines need new kernel text and stay open. The coordinator added W5 (`ef27e49`, "— cópia 2").
- **Verify.** Green on both PRs. On #23 the first `pnpm verify` run failed `@p0 3.6-E2E-001` because the Templates list rendered no row within 30 s after sign-in (load average about 5); the rerun passed 36/36. A timeout on the first run of #22 was also load-related. The gate is load-sensitive.
- **Re-checked in the browser after the merge (`21`).** Numbered copies, focus on Restaurar after Arquivar, no list toast inside the composer, "1 cabo de entrada", Ctrl+Z no longer corrupts, "A    B" kept on reopen, locked switch `aria-disabled` with "…, sempre ativado".
- **Not fixed; decisions for the retrospective:** D-1 to D-7.
- **Side effect.** The kernel fix agent's first compose command ran against the default `fasor` project, before its `.env` existed, and recreated `fasor-install-1`/`fasor-api-1` from the worktree. The agent restored them from the main checkout. `fasor-api-1` is healthy and mounts the main checkout.

## What went well

- The seed tests compare against hand-written golden lists from addendum §9, not values read back from the seed, so a transcription slip fails. The seed is zod-validated, criterion-bound, deep-frozen and hash-pinned at load.
- The composer is pleasant by hand: the stepper clamps and announces, the hold repeats, reorders announce the exact AC sentence, and the palette follows the selected column on desktop and in the phone sheet.
- The composer's single edit queue builds every edit from the freshest row, and a two-device convergence test (3.4-E2E-005) exists.
- `tokens.css` and `components.css` are byte-identical to the mocks, every `.frame-*` translation cites its mock rule, and derived text (`moveAnnouncement`, `quantityLabel`, `naDefaultsCountText`, `totalsText`) lives in the kernel.
- The plain-text editor is careful: paste is text-only, drop and formatting are blocked, IME Enter is respected, and the chip is atomic.
- Every story has at least one `@p0` test (the Epic 2 improvement held).

## What went badly

- **The freeze came before the review.** v1 was hash-frozen at merge while the R-009 review was pending, and Story 3.1 was marked `done` without it (D-1).
- **Goldens generated by the code under test were used as proof.** Nothing compared fixture order, point order or resolved section text with the delivered document (K1-K3, D-2). When the 3.7 spec disagreed with the docx, the developer followed the docx but loosened the tests (`arrayContaining`, no order checks) instead of pinning the document.
- **Batching continued against AGENTS.md.** Two stories per PR (#19, #21), and the 3.5+3.6 spec carries `warnings: ['multiple-goals', 'oversized']`. The dev model on 3.5/3.6 was raised to opus·high without a note in `epics.md`.
- **ACs still close in jsdom or at `@p1`.** Restaurar with undo, touch hold and drag, the drawer and sheet are not in the gate. The contenteditable editor was exercised only on desktop Chromium, although the tablet is the primary target.
- **Focus after destructive actions was never asserted**, although Epic 1 and 2 already set that bar for dialogs.
- **Rules lived in UI helpers**, not in the kernel schema (quantity max, reason keys, node names), against the ownership rule.
- **The deferred-work ledger was not re-checked** when its blocking story shipped.
- **The unit suite is load-sensitive** (jsdom created 66 times; one axe test over 15 s), so the merge gate depends on machine load.
- **Setup friction:** the Playwright MCP browser profile was locked by another session's long-lived server, and `fasor-api-1` in the default compose project was unhealthy, which blocks `docker compose run tools` without `--no-deps`. A new developer would hit both.
- **Emoji in PR bodies:** PRs #18-#21 end with the default attribution line, which carries an emoji that AGENTS.md forbids everywhere.

## Improvements for Epic 4 onward

1. A seed or fixture freeze requires the human review record first; `done` on a story with a human gate requires the dated record in `epics.md`.
2. Golden files are checked once against the source document (order, text, numbering) by an explicit assertion, not only generated.
3. Every destructive action (archive, remove, undo) has an e2e assertion on the focused element.
4. Every contenteditable or touch interaction runs at least once on `durability-android-chrome` or WebKit before the story closes.
5. Schema rules that the UI enforces are also in the kernel row schema.
6. One story per PR, as AGENTS.md says; a batch needs a recorded exception.
7. The `@p0` set includes every AC's primary path, not just one test per story.
