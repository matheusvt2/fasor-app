---
type: UX Rule
title: Where a pt-BR string goes
description: Three homes for user-visible copy; each string lives in exactly one. Open before adding any text.
tags: [ux, copy, i18n]
timestamp: 2026-09-30T00:00:00Z
sources: [AGENTS.md]
---
# Where a string goes (decided 2026-09-22)

1. **Derived text -> `packages/domain`.** Anything computed from data: status words (`statusLabel`), counts and plurals (`plural`, `relatoriosCount`, `pendingSummaryText`, `rejectedText`), composed rows (`registrationRowText`, `storageLine`, `serverHoldsText`), and rules such as `isAutoPulled`. `apps/web` never writes a singular/plural choice or status word.
2. **Static surface copy -> `apps/web/src/copy/pt-br.ts`.** Headings, labels, notes, button words, fixed sentences of one surface, verbatim from the mocks or marked `// authored:`.
3. **Component chrome -> `apps/web/src/copy/ui.ts`.** Words a shared component owns on every screen ("Ativado", "Cancelar", overflow trigger label template).

The product name comes from one constant (`PRODUTO`, `packages/domain/src/product.ts`). No emoji. UI and generated text say `relatorio`, never `laudo`: [rules](/project/rules.md).
