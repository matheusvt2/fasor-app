# Epic 19 Context: Home at scale (shortcuts first; the active list; Emitido behind its tile)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. Compiled inline by the coordinator on 2026-10-30 (the epic text is short and the coordinator held it; same economy as Epics 17 and 18). -->

## Goal

Keep Home short and useful whatever the company's number of relatórios. Today every relatório adds a card above the Templates and Cadastros shortcuts, the list shows everything the company ever emitted in service-date order, and nothing caps it. The epic puts the two shortcuts one tap from the top (done, Story 19.1), opens the list on the relatórios being worked with the emitted ones behind their Status board tile, orders by most recent and cuts the list at a page size the engineer picks (Story 19.2). Decided by Matheus on 2026-10-30 over the 2026-10-29 Home analysis; Epic 18's usage events measure the Home before and after.

## Stories

- Story 19.1: Templates and Cadastros one tap from the top: the shortcut row above the relatório list (done 2026-10-30)
- Story 19.2: Home opens on the active work: Emitido behind its tile, most recent first, the list cut at 10, 20, 50 or 100

## Requirements & Constraints

- The kernel computes every selection, order, count and text of the list; the web surface renders what the kernel returns and keeps only the pressed tile and the page-size choice as state. No count, plural or sentence is written in the surface.
- The Status board keeps four tiles with counts over every relatório of the company; a pressed tile filters the list, pressing it again clears it. With no tile pressed the list holds the active statuses only (Rascunho, Em campo, Em revisão); the Emitido tile is the one way to the emitted relatórios.
- Order: most recent first, by the server's sequence of the relatório's last change as the company summary carries it, descending; the relatório Em campo on this device stays first; entries with no sequence yet sort by service start after the others. The same order behind every tile.
- Page size: 10 by default, 10 · 20 · 50 · 100 as a group of Filter chips (exactly one pressed, the gallery's rule) beside the note "Mostrando 10 de 37 relatórios"; absent when the selection fits the smallest page; remembered on this device in the local preferences, never sent to the server.
- Empty states say which case it is: nothing on the device at all, nothing in the pressed status, or no active relatório with N emitted behind the Emitido tile.
- pt-BR copy: authored sentences marked `// authored`, product name through the one constant; derived text (counts, plurals, the note) in the kernel.
- A new usage-event target for the page-size chips is appended to the kernel's closed list first, then given to the control through `data-telemetry`; the existing Home targets keep their names so the measure compares before and after.
- No op, no seed, no contract bump: the summary already carries the sequence; the preference is a device-local row.
- Everything runs through compose in containers; the story gate is lint, static, test:unit, test:api and the touched Playwright specs; a unit red only under load is re-run alone and both runs are recorded.

## Technical Decisions

- Home renders only from the device store through live queries and the kernel's `homeCards`; filtering and ordering live in the kernel function, which receives the summary, the rows, the sync states and the filter.
- Device preferences live in the `local_prefs` table through small read and write helpers; the theme, the registry tab and the last sheet follow that pattern.
- Mocks are the source of class names; a mock that changes gets a dated comment, and EXPERIENCE.md and MOCK-GUIDE a dated note; DESIGN.md and EXPERIENCE.md win over a mock on conflict.
- Planning text is never deleted: the old sentence is struck through and the new one added beside it with the date.

## UX & Interaction Patterns

- Home order since Story 19.1: Status board, shortcut row, "Relatórios" head with "Novo relatório", the cards.
- The current card (Em campo on this device) is the hero: first in the list, primary border, "Continuar" one tap.
- Filter chips: a group with exactly one pressed chip, `aria-pressed` on the pressed one, keyboard reachable; the Status board tiles share the rule.
- The list note is a `section-note` under the cards; the mocks drew it with a "Ver todos" text button that the chips replace.
- Phone (below 480 px) stacks the shortcut cards and the chips must stay reachable without horizontal scroll.

## Cross-Story Dependencies

- Story 19.1 is merged on main (`57d3b5cc`); Story 19.2 builds on its order.
- Epic 18: the first monthly digest (2026-11-30) reads `home.shortcut_*`, `home.status_chip` and the new page-size target per session; the target name must exist in the kernel list before the digest.
- Bruno's volume answers (how many relatórios active and per year) are still open; a search and other sort keys wait for them.
