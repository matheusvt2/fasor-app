# Epic 20 Context: Conforme, and the field feedback of 2026-11-03

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. Compiled inline by the coordinator on 2026-11-03 from the investigation of main cf468e3d (three read-only passes: the product name, the five feedback items, the epics conventions). -->

## Goal

Name the product Conforme, and act on five field feedback items Matheus relayed on 2026-11-03. Two of them are on screen: a Home search, and relinking a point of attention. Three are about the document: the order of sections 8 and 9, tables that split across pages, and where photos sit in a ficha.

## Stories

- Story 20.1: The product is called Conforme: the one constant, the page title and the boot splash
- Story 20.2: Search Home by client and obra
- Story 20.3: Pontos de atenção after the ensaios: the tests section prints before the points section on every new relatório
- Story 20.4: Change the equipment or local of a point of attention
- Story 20.5: The nameplate and verification tables never start on one page and end on the next
- Story 20.6: Each equipment on its own page with all its photos at its end

Waves: one wave A in two stacks. The web lane is 20.1, then 20.2, then 20.4; those stories share `copy/pt-br.ts` and the e2e shell specs. The document lane is 20.3, then 20.5, then 20.6; those stories share `docx.ts`, `sections/section-9.ts`, `print/section-9.ts` and the layout golden.

## Requirements & Constraints

- The name lives in `packages/domain/src/product.ts` (`PRODUTO`, value `Conforme`). These strings bypass the constant today and must follow it:
  - `apps/web/index.html` lines 6 and 44;
  - `copy/pt-br.ts` line 1604.

  These identifiers are not the product name and stay as they are:
  - `releng-{user_id}` (Dexie, `db/schema.ts` line 321);
  - the `releng.*` localStorage keys (`db/prefs.ts`, `state/last-session.ts`);
  - the service-worker caches `releng-shell-*` and `releng-hold` (`public/sw.js`);
  - the better-auth cookie prefix `releng` (`apps/api/src/auth/auth.ts` line 49);
  - every `fasor-*` AWS name, and the domain.
- Tests that assert the literal `'PRODUTO'` and change with Story 20.1:
  - unit: `domain.test.ts:6`, `app-shell.test.tsx:111-117`, `login-surface.test.tsx:152`, `shell-version.test.ts:63`, `docx.test.ts:407,425`;
  - e2e: `shell.spec.ts:5`, `auth.spec.ts:52,86,100`, `ui-hygiene.spec.ts:192,194`, `durability.spec.ts:159`, `cadastros.spec.ts:733`, plus the title in `loading-states.spec.ts`.

  `boot-splash.test.ts` already checks `index.html` against the constant. The goldens do not carry the name.
- The kernel computes every selection, match, order, number and text. The web renders what the kernel returns and keeps only screen state (the query, the pressed tile, the picked link before save).
- Home search:
  - In the kernel: a normalized key per `HomeCard` (client and obra through `normalizeRegistryName`), a `query` option on `homeList` applied after the tile filter and before the page cut, and a no-match text in the kernel.
  - The telemetry target `home.search` records use, never text (AD-28).
- Point relink:
  - `writePoint` puts `equipment_id` and `location_id` as one batch.
  - `PointField` (`relatorio/ops.ts` line 46) gains `location_id`. The op path (`ops/path.ts` lines 70 to 77) already allows both, so there is no contract bump.
  - The picker is built on `photoEquipmentGroups` (`photos/gallery.ts` lines 309 to 345).
- Section order: `instantiateTemplate` (`relatorio/instantiate.ts` line 229) gives new relatórios ENSAIOS at 8 and PONTOS at 9.
  - The fallback `seedSectionNumbers` (`relatorio/sumario.ts` lines 198 to 202) and every existing relatório keep their order.
  - Printed numbers are positions (`print/layout.ts` line 222).
  - The points section needs its own page break (`docx.ts` line 343 breaks only before the sheets section).
- Tables: `sections/section-9.ts` `drawRow` (lines 112 to 129) sets `cantSplit` on every row and `keepNext` only on header, band and group rows. The fallback wrapper is section 10's one-row `cantSplit` table (`sections/section-10.ts` lines 18 to 40). Prove the result on the PDF, not only on the XML (`docx.ts` lines 340 to 342).
- Photos: `print/section-9.ts` `sheetOf` (lines 830 to 865) and the Não ensaiada branch (line 846) print one photo part, last, after CONCLUSÃO; `localPartsOf` (lines 432 to 440) does the same for a local.
  - The numbering order of `documentPhotoOrder` (`print/photo-order.ts` lines 78 to 116) is unchanged.
  - A page break precedes each equipment's first heading, never doubled after the section heading.
- PDF page proof: `e2e/support/pdf-text.ts` has no page numbers today. Story 20.5 adds a per-page read, and Story 20.6 uses it.
- No seed bump and no contract bump are planned. Everything runs in containers through compose. The story gate is lint, static, test:unit, test:api and the touched Playwright specs.

## Open readings (coordinator's, to be corrected by Matheus)

- 20.2: with no tile pressed and a query typed, the search covers every status, Emitido included.
- 20.6: the photo block sits after CONCLUSÃO, which reads his "após os dados do ensaio … entre um equipamento e outro". A local's block also starts on a new page.

## Technical Decisions

- Mocks are the source of class names. A mock that changes gets a dated comment, and EXPERIENCE.md and MOCK-GUIDE get a dated note. `tokens.css` and `components.css` stay byte-identical, so their "PRODUTO (fasor)" header comments stay too.
- The layout golden `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` is rewritten with `GOLDEN_UPDATE=1`, and every diff is explained in the PR. The kernel goldens under `packages/domain/fixtures/porto-seguro/` pin data, not layout, and should not move.
