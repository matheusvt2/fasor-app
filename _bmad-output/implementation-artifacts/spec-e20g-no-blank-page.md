---
title: 'Batch e20g: Story 20.6 follow-up, no blank page after a ficha whose photos end at the page foot; Caddy edge headers'
type: 'bugfix'
created: '2026-11-04'
status: 'done'
baseline_revision: 'd6e8eea1718e90a2fd2cd14f54bcdbdd4091ffb6'
review_loop_iteration: 0
followup_review_recommended: false
dev_model: 'opus'
dev_effort: 'high'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-20-context.md'
warnings: ['batched', 'multiple-goals']
batched_because: 'A small fix batch from the 2026-11-04 field reproduction: the blank-page defect in section 9 and one cosmetic Caddyfile item from the production pass ride one PR to save a gate.'
deferred:
  - summary: >-
      No automated check sends a request through each production Caddy site block to a live upstream and asserts the edge headers (no Via, no Server, HSTS).
    evidence: |-
      infra/bin/check runs caddy validate and the fallback block's status codes with no upstream (--network none), so a proxied answer never happens; the production smoke asserts no header. The e20g proof is manual: the domain block and the CloudFront fallback block were curled through a throwaway caddy:2.11.4-alpine against the batch api; the IP block (shortlived ACME certificate) was not, its header block being identical. Closing it means a stub upstream on 127.0.0.1:3000 in infra/bin/check and a header assertion per block.
    location: >-
      infra/bin/check
    severity: low
---

<intent-contract>

## Intent

**Problem:** Reproducing Bruno's field case on d6e8eea1 (`test-results/bruno-repro/relatorio-bruno-tr1.pdf`, gitignored, client data: never copy it), page 11 holds TR-2's ficha with its photo rows down to the page foot, page 12 is blank but for "Página 12 de 14", and page 13 starts the next ficha. In the DOCX the photo table is followed by an empty `SheetGap` paragraph and then the next title bar with `pageBreakBefore`: the gap spills onto a new page and the title breaks again. Separately, on the production domain the plain-HTTP redirect sends `Server: Caddy` and every HTTPS answer carries `Via: 1.1 Caddy`.

**Approach:** Section 9 never ends a ficha or a local block with the gap: `partsChildren` pushes the gap after a table or photo part only when another part follows in the same list (Word joins adjacent tables, so the gap between two tables stays). Prove it on the XML and on the PDF LibreOffice makes. In `infra/caddy/Caddyfile` add `-Via` to the three `header` blocks; drop the redirect's `Server` only if it is one or two directives and safe for ACME (see Design Notes), else skip and say why.

## Boundaries & Constraints

**Always:**
- The fix lives in `apps/api/src/jobs/generate/sections/section-9.ts` (drawing only); the kernel (`packages/domain`) is untouched: no part, order or page rule changes there.
- Every new test fails on main (d6e8eea1) and passes with the fix; show the red run on main (revert the fix in the working tree, run, restore) for the unit test and the LibreOffice proof (mutation run, E12-A6).
- Document tests assert from their own sheet title or heading, never from a position another section shifts (E7-A6).
- The LibreOffice proof runs in the api container (`soffice` is there, not in tools): `podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/page-placement.integration.test.ts`; its output goes in the PR body.
- Layout golden `apps/api/src/jobs/generate/golden/porto-seguro-skeleton.json` records headings, tables, header and footer only (no gap paragraphs): regenerate with `GOLDEN_UPDATE=1` only if the golden test goes red, and explain the diff.
- Add a `docs/kbs/log.md` line; update `docs/kbs/architecture/rendering.md` only if it describes the section 9 gap or page breaks (grep it). Caddy: update `docs/kbs/architecture/infra-aws.md` only if it lists the edge headers.
- No emoji; code, comments and docs in English.

**Never:**
- Do not touch `epics.md`, `sprint-status.yaml`, `epic-20-context.md`.
- No contract bump, seed bump or op change. Do not change photo numbering, `pageBreakBefore` rules (`section9Children`), table keep rules (`drawTable`, `drawRow`) or sections 7, 8, 10, 11.
- Do not copy anything from `test-results/bruno-repro/`, `docs/context/`, `docs/media/` into tracked files.
- No AWS action, no deploy, no Terraform apply. Do not change `docker/caddy/Caddyfile` (the local dev edge).
- No Playwright run outside the host lock; no full `@p0`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Last part is photos | ficha whose last part is a photo table, then another ficha | photo table is followed directly by the next title bar (`pageBreakBefore`); no `SheetGap` between | none |
| Last part is a table | ficha ending with a measurement/checklist table | table followed directly by what follows (next title, Heading 2, painel band, next section's Heading 1) | none |
| Two adjacent tables | nameplate then config table in one ficha | one `SheetGap` between them, as today | none |
| Table then paragraph part | table, then an OBSERVAÇÕES-style paragraph part | gap kept (not last) | none |
| Local block | `localParts` ending with VERIFICAÇÕES DO LOCAL or site photos, then the first sheet | no gap between the local's last table and the sheet title | none |
| Photo rows end at page foot (PDF) | a sheet whose photo rows fill its page to the foot, then another sheet | no PDF page holds only header/footer text; the next sheet's title is on the page right after the photos' last page | none |
| Old order (points before tests) | Porto Seguro fixture, section 10 Heading 1 (no break) after the last ficha | renders; only the trailing gap disappears | none |

</intent-contract>

## Code Map

- `apps/api/src/jobs/generate/sections/section-9.ts` -- L204 `gap()`; L224-230 `partsChildren` pushes `gap()` after every table/photo part (the defect); L206-221 `sheetChildren` (title bar with `pageBreakBefore`); L255-272 `section9Children` (subsection Heading 2 / `painelBand` with `pageBreakBefore`, `localParts` via `partsChildren`). L60/L67 `SHEET_GAP` style id `SheetGap`.
- `apps/api/src/jobs/generate/docx.ts` -- L336-356 section loop: Heading 1 with `pageBreakBefore` for the sheets section and the points section when `startsPage`. Checked: section 7 ends with its photo table (no trailing empty paragraph), sections 8/10/11 end with text; only section 9's trailing gap precedes a breaking element. No change expected here; say so in the PR.
- `apps/api/src/jobs/generate/docx.test.ts` -- section 9 suites at L161, L272, L441 (helpers `paragraphXml`, `paragraphText`, render helpers in the file and `page-layout.test-support.ts`). Add the new XML test here.
- `apps/api/src/jobs/generate/page-layout.test-support.ts` -- `sheet`, `tablePart`, `photosPart`, `fillerParts`, `nameplateTable`, `withSheetsSection`, `withNewSectionOrder`.
- `apps/api/src/jobs/generate/page-placement.integration.test.ts` -- LibreOffice proof (`render`, `pdfPages`, `pagesOf`, `onePage`); add the photo-rows-at-foot case. Photos need bytes: pass a small generated PNG/JPEG through `buildDocx` options `images.photos` (see how `render` calls `buildDocx`; extend `render` with an optional photos map). Tune filler so the photo rows' last row ends at the page foot (check on main that the blank page appears: that is the red run).
- `e2e/document-pages.spec.ts` -- L95 `@p0` test downloads the issued PDF (`pdfPageTexts`, L189); add: no page is footer-only (every page holds text besides the header lines, the footer lines and `Página N de M`). Read header/footer lines from the DOCX structure already extracted there (`docx.header`, `docx.footer` of `extractStructure`) or strip `/^Página \d+ de \d+$/` plus the footer/header strings; the cover page counts as content.
- `e2e/support/pdf-text.ts` -- optional home for a `footerOnlyPages(pages, chrome)` helper if reused.
- `infra/caddy/Caddyfile` -- three `header { ... -Server }` blocks (IP, `{$APP_DOMAIN:localhost}`, CloudFront fallback `handle`). The automatic HTTP->HTTPS redirect is Caddy's implicit `:80` route, outside every site block.

## Tasks & Acceptance

**Execution:**
- `apps/api/src/jobs/generate/sections/section-9.ts` -- in `partsChildren`, push `gap()` after a table or photos part only when it is not the last part of the list; update its doc comment and the module comment (Story 20.6 follow-up, 2026-11-04: a trailing empty paragraph spills onto a page of its own before the next ficha's break) -- the defect.
- `apps/api/src/jobs/generate/docx.test.ts` -- new describe "Story 20.6 follow-up: no trailing gap": render a layout (via `withSheetsSection`) with fichas ending in a photo part, in a table, a local block ending in a table, two adjacent tables, and a painel band after a ficha; walk the body's top-level elements in order and assert (a) every `SheetGap` paragraph is followed by a `w:tbl` or a `SheetCaption` paragraph without `pageBreakBefore`, (b) no `SheetGap` sits right before any element with `pageBreakBefore`, a Heading 1/2 or a title bar, (c) two adjacent tables keep one `SheetGap` between them. Also assert on the Porto Seguro fixture render that (a) holds.
- `apps/api/src/jobs/generate/page-placement.integration.test.ts` -- new case: two subsections or two sheets, the first with filler then photo parts whose last row ends at the page foot, the second a short sheet; assert no page's items are only header/footer text (`Página n de m`, the layout's header and footer lines) and that the second sheet's title page is the photos' last page + 1.
- `e2e/document-pages.spec.ts` -- add the footer-only page check to the existing `@p0` test's PDF read.
- `infra/caddy/Caddyfile` -- add `-Via` to the three header blocks with a comment; redirect `Server` per Design Notes. Prove with `caddy adapt` (JSON shows the delete, deferred) and a throwaway `caddy:2.11.4-alpine` container on this batch's compose network (`fasor-e20g_default`) with a copy whose upstream is `api:3000` and `APP_DOMAIN=localhost`: `curl -skI https://localhost/api/health` shows `Strict-Transport-Security`, no `Server`, no `Via`; record the before (current file) and after headers.
- `docs/kbs/log.md` (and a concept file if it describes these) -- one dated line.

**Acceptance Criteria:**
- Given a relatório whose ficha's photo rows end at the page foot followed by another ficha, when it is issued, then the PDF has no page holding only the header and footer, and the next ficha starts on the page right after.
- Given any section 9 layout, when the DOCX is built, then no empty `SheetGap` paragraph ends a ficha or a local block or sits right before a `pageBreakBefore` element, and two adjacent tables are still separated by one.
- Given the production Caddyfile, when an HTTPS answer is proxied from the api, then it carries no `Via` and no `Server` header and still carries HSTS.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- Layers: Edge Case Hunter and Verification Gap Reviewer. Blind Hunter and Intent Alignment skipped (token economy; the integrated epic review covers them).
- verdicts: 8 findings — high 0, medium 0, low 5, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` ECH-1 section-9.ts: with the tests section moved last and sections 10 and 11 removed (reachable: section blocks move and are removed, `layout.test.ts` L284), the body now ends in a table — Word and LibreOffice add their own end paragraph; at worst a blank last page, only on that rare arrangement; a guard in `buildDocx` adds a branch for a state no one prints in everyday use.
  - `[low]` `[patch]` ECH-2 section-9.ts `partsChildren` comment claims a paragraph always follows — comment corrected to name the document's end (applied by the orchestrator).
  - `[low]` `[patch]` ECH-3 e2e/support/pdf-text.ts `footerOnlyPages` reads text only, so an image-only page (a section 11 certificate page after its first) counts as footer-only — the issued relatório of `document-pages.spec.ts` has no certificate image, so no false failure today; doc comment now says so (applied by the orchestrator).
  - `[false]` `[reject]` ECH-4 page-placement case flags image-only pages — its layouts hold no image without a caption (every photo carries "Imagem N: ..."), so no page is image-only.
  - `[false]` `[reject]` ECH-5 page-placement `itemOn(... companyLine).y` TypeErrors on an empty company line — the base layout's company line is "Fasor Engenharia" (fixture, `docx.test.ts` footer assertion); the throw is a loud failure, not a false pass.
  - `[low]` `[reject]` ECH-6 docx.test.ts `bodyElements` loops on an unclosed tag — `document.xml` from `buildDocx` is well-formed; the 60 s test timeout fails it loudly.
  - `[false]` `[reject]` ECH-7 CloudFront adds its own Via on the fallback path — the AC is Caddy's answer; CloudFront's own Via is outside the Caddyfile and noted in the PR.
  - `[low]` `[defer]` VGR-1 no automated check of the edge headers per Caddy block, manual proof on one block — the orchestrator extended the manual proof to the CloudFront fallback block (`.scratch-e20g/probe-fallback.log`: 200, HSTS, no Server, no Via); the IP block cannot be served without its ACME certificate; harness work deferred (frontmatter `deferred`).

## Design Notes

- Why only the last gap: what follows a sheet's or a local's last part is always a paragraph (next title bar, Heading 2, painel band, a Heading 1), so Word never joins that table to a following one; the gap only matters between two tables inside one parts list.
- Redirect `Server`: Caddy sets `Server: Caddy` before any handler, and the redirect is its implicit `:80` route; removing it means explicit `http://{$PUBLIC_IP}` and `http://{$APP_DOMAIN}` site blocks with `header -Server` and `redir https://{host}{uri} permanent`. Those blocks replace Caddy's own redirect on the port that also answers the HTTP-01 challenges for both certificates (the IP's six-day one renews every few days); that cannot be proven without an ACME server. Unless it can be shown clean, skip it and give that reason in the PR (an open item for Matheus, not a deferral of a defect).

## Verification

**Commands:**
- `podman compose --profile tools run --rm --user root tools pnpm --filter @app/api exec vitest run src/jobs/generate/docx.test.ts` (docx.test.ts belongs to the api project, `test:api`) -- expected green; red on main for the new describe.
- `podman compose exec api pnpm --filter @app/api exec vitest run src/jobs/generate/page-placement.integration.test.ts` -- expected all cases green; red on main for the new case.
- Under `lockf -t 20000 /tmp/fasor-verify.lock`: `podman compose --profile tools run --rm --user root tools pnpm exec tsx scripts/e2e.ts e2e/document-pages.spec.ts --project desktop-chrome --project durability-desktop-chrome` -- green.

## Auto Run Result

Status: done (2026-11-04).

- **Change:** `partsChildren` (`apps/api/src/jobs/generate/sections/section-9.ts`) draws the `SheetGap` paragraph only between two parts, never after a ficha's or a local's last part. On the field case, the trailing gap after photo rows that ended at the page foot spilled onto a page of its own, and the next ficha's `pageBreakBefore` broke again. `docx.ts` needed no change: section 7 ends in its table and sections 8, 10 and 11 end in text. `infra/caddy/Caddyfile` adds `-Via` to its three header blocks. The redirect's `Server: Caddy` is skipped (Design Notes; `deferred-work.md`).
- **Files:**
  - `section-9.ts`: the fix and its comments.
  - `docx.test.ts`: new describe "Story 20.6 follow-up: no trailing gap".
  - `page-placement.integration.test.ts`: `render` takes photos; the new photo-rows-at-foot sweep.
  - `e2e/support/pdf-text.ts`: `footerOnlyPages`.
  - `e2e/document-pages.spec.ts`: no footer-only page.
  - `infra/caddy/Caddyfile`: `-Via`.
  - `docs/kbs/architecture/rendering.md` and `docs/kbs/log.md`.
  - `deferred-work.md`: two rows.
- **Review:** 8 findings.
  - 2 patched (comments, low).
  - 1 deferred (VGR-1, low: no automated edge-header check).
  - 5 rejected, with reasons in the triage log.
  - Follow-up review recommended: false (no high, no medium patched).
- **Verification:**
  - **Red on main** (fix reverted): `docx.test.ts` 2 failed. The page-placement case failed with footer-only pages `[28, 31, 34, 37]`.
  - **Gate on 07ed99e7** (lock wait 0 s, load 5.70 at the start and 8.29 at the end, the main stack and this batch's stack up):
    - lint 0, static 0;
    - test:api 826 passed, 4 skipped;
    - page-placement in the api container 4 of 4;
    - touched e2e 76 of 76 (17 specs).
    - test:unit had 5052 of 5060, with 8 timeouts (15 s and 60 s) in 4 web files this batch does not touch. Re-run alone under the lock on 7521c2f5, they pass 69 of 69 (E15-A4).
  - **Head 7521c2f5** (comments only): lint 0, static 0.
  - **Caddy, throwaway `caddy:2.11.4-alpine`:**
    - the domain block: HSTS, no `Server`, no `Via` (before the change: `via: 1.1 Caddy`);
    - the CloudFront fallback block: HSTS, no `Server`, no `Via`.
- **Residual risks:**
  - The page-placement sweep is tuned to this LibreOffice's metrics; its "reaches the foot" guard fails loudly if they drift.
  - A body that ends in section 9's table (the tests section moved last, 10 and 11 removed) relies on Word's own end paragraph (ECH-1, rejected).
