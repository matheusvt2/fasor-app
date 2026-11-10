# MOCK-GUIDE — how to render a PRODUTO key screen

Shared base: `tokens.css` (DESIGN.md frontmatter, light + dark) and `components.css` (one block per DESIGN.md § Components row + the frame system). Reference screen: `key-equipment-sheet.html`. Read it before rendering; copy its structure, do not restyle.

## Files
- One file per surface: `key-<slug>.html` (`key-home.html`, `key-relatorio-overview.html`, `key-export-dialog.html`, `key-sync-status.html`…). Alternate states of the same surface go in the same file as extra frames, not extra files.
- No network, no JS, no webfonts, no images. Photos are the `.thumb-fake` placeholder. Everything renders from `file://`.
- Never use `autofocus` (it scrolls the gallery to the focused element on load); show initial focus with the static class `is-focus-ring` (buttons) or `is-focus` (inputs).
- Add every new file to `index.html` (one card: frames from its `.mock-caption`s, governing spine sections, link) and to the `→ Mock:` line of the spine section it illustrates.

## `<head>` boilerplate
```html
<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>PRODUTO — <Surface></title>
<link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="components.css">
<style>/* Governs: DESIGN.md § <rows used>; EXPERIENCE.md § IA › <surface>, § Component Patterns › <rows>, § State Patterns › <rows>, Flow <n> step <k> */ …page-only layout… </style></head>
<body class="mock-page">
```
Page-specific `<style>` is for layout only (grid of a surface, a one-off width). Component visuals live in `components.css`; if a component is missing there, add its block there (same naming rule) and say so in your report.

## Frame markup
```html
<div class="mock-item">
  <p class="mock-caption"><b>Surface — subject</b><span class="sep">·</span>device, state<span class="sep">·</span>spine sections</p>
  <div class="frame frame-tablet" data-theme="light">          <!-- frame-tablet 768×1024 (primary) · frame-tablet-landscape 1024×768 · frame-phone 390×844 · frame-desktop 1280×800 -->
    <header class="app-bar">…</header>
    <div class="screen-body"><aside class="rail">…</aside><main class="screen">…<div class="sticky-action-bar">…</div></main></div>
  </div>
</div>
```
- Frames grow with content (Figma-style tall frame). Add `frame--crop` to fix the device height and cut the rest (use for "top half" or overlay shots).
- `frame-desktop` needs `<div class="browser-chrome"><span class="lights"><i></i><i></i><i></i></span><span class="url">PRODUTO</span></div>` as its first child.
- Alternate state = a second `.mock-item` in the same `.mock-row` (or a new row); caption says which state. Dark theme = the same markup with `data-theme="dark"` on the `.frame`.
- Overlays (dialogs, capture sheet, palette on phone, toast) sit inside the frame: `.dialog-scrim` › `.export-dialog|.confirm-dialog`; `.toast` is absolutely positioned; bottom sheets go last inside `.screen`.

## App bar (every surface)
`app-bar` grid: left = back `icon-btn` (or the `wordmark` "PRODUTO" on Home), center = `app-bar-title` (surface name; inside a sheet the TAG, e.g. "SEC-C05"), right = `sync-badge[data-state]` then `avatar-btn` › `avatar` with the initial (B for Bruno, E for Eduardo). Never client or Fasor branding. *(2026-10-07, review fixes batch 3, F-16, D7 as amended on 2026-10-07: the app hides the Sumário header's `h2.sheet-title` visually from 1280 px, where the App bar title names the relatório in full; the mocks keep drawing the pair, and below 1280 px, where `.app-bar-title` ellipsizes, the app shows both.)*

## Persistent rail rule (EXPERIENCE.md § Responsive & Platform)
Inside a relatório: tablet landscape and desktop show `.rail` (320px, `relatorio-tree` inside, selected row `is-selected` + `aria-current`). Tablet portrait collapses it to `.rail-collapsed` (48px strip with the toggle and the vertical label "Árvore do relatório"). Phone has no rail — the tree is its own surface. Outside a relatório (Home, Registries, Login) there is no rail.

## Smart-input components (DESIGN.md v0.5.0 — every block is in `components.css`; tokens in `tokens.css` as `--<component>-<key>`)
- **Camera capture button** `.camera-capture-btn` (56px primary square: `.ico` camera + `.cam-word` "Foto"; burst count via `data-count="3"`); tile variant `.camera-capture-tile` ("Fotografar placa", ≥ 96px dashed) inside `.camera-group` with the copy Chips above and `.btn-text` "Digitar" under; `.camera-denied` for the permission reason. In the sheet's Sticky action bar add `has-camera` to `.bar-buttons` and put the button first.
- **Dictation button** `.dictation > .dictation-btn[aria-pressed] + .listening-word` ("Ouvindo…"); listening = `aria-pressed="true"` (focus-fill + pulsing dot, reduced-motion safe). Hidden, not disabled, when unavailable.
- **Section stepper** `.section-stepper > button.step[data-missing="2"][aria-current="step"]` with `.step-name > .long/.short` ("Verificações"/"Verif.") and `.step-count > .n`; `data-missing="0"` draws ✓. First child of the sheet's `.sticky-action-bar`.
- **Bulk action bar** `.bulk-action-bar > .bulk-action > .btn-text` (+ `.btn-reason` when disabled) at the head of the checklist; `.is-compact` inside the Sticky action bar's `.bar-buttons`.
- **Read display button** `.read-display-btn` (camera glyph + "Ler visor", `data-count` in burst) in `.mt-title-row > .mt-actions` with the Dictation button, above each `.measurement-table` / phone `.measurement-cards`; a cell waiting offline gets `td.cell-queued > .queued-banner` ("Foto guardada — leitura quando houver sinal", `i-image` glyph).
- **Suggestion field** `.field.suggestion-field[data-state="suggested|verify|confirmed"]` (also on `.measurement-field` wrappers and `.suggestion-block` drafts): `.crop-thumb` (48px, left of the value) › `.sv` › `.confirm-btn`; pill `.suggested-pill` "Sugerido" or `.verify-pill` "Verificar" (dashed). Group head `.suggestion-group-head` with the secondary "Confirmar 7"; `.plate-crop` (≤ 160px, `.region` outlines) above the fields; `.suggestion-alt` for "Sugerido: 15 kV — Substituir". `.nameplate-extraction .field.is-suggested` is an alias of the suggested state.
- **Measurement field** extras: `.mf-unit.is-control.unit-cycle` (unit text in `.unit-text` + `i-cycle` glyph, no chevron), `.outlier-helper` (amber line, neutral field), `.mf-echo` ("= 3.700 MΩ"), phone `.unit-suffix-row` of three Chips.
- **Relatório card, em andamento neste aparelho** — `div.relatorio-card.is-current`, ordena primeiro na lista e leva `.card-continue` (`.btn-primary` "Continuar: SEC-C05 · 42 de 94" + `.btn-text` "Ver árvore"). **É o herói da Home**: não existe um Continue card separado — ele foi removido em 2026-09-19 porque repetia este card na mesma tela (review-mvp-scope S5).
- **Chips of recent values** `.chip-row.chips-recent` (5 `.chip[aria-pressed]` + `.chip-other` "Outro…"). **Sync headline** `.sync-headline[data-tone] > .sh-state (.dot + word) + .sh-counts + .btn-text.sh-how`.
- **Banner slot** `.banner-slot`: only the first non-hidden `.banner` child renders; the others fold into its `.banner-more` "+N" chip. Phone App bar: the Sync badge shows `.sync-short` (~~OK~~ Sinc. *(2026-10-07, review fixes batch 3, F-29: authored, "OK" means nothing on its own; the mocks and `proto.js` keep "OK")* · Off · 3 · Erro · Confl.) beside the dot, the full word `.sync-long` on wider frames.

## v0.6.0 — reference-tool components ([ASSUMPTION — reference tool 2026-09-18]; blocks in `components.css`, tokens in `tokens.css` as `--<component>-<key>`, plus the theme token `--surface-sunken`)
- **Priority pill** `.priority-pill[data-p="0".."4"]` with the text "P0 · Imediata" · "P1 · Curto prazo" · "P2 · Médio prazo" · "P3 · Longo prazo" · "P4 · Próxima manutenção"; P0 danger tone, P1 amber, P2–P4 neutral on `surface-sunken`. The text carries the level, never the color alone. Used on the Point of attention card (Prioridade cell) and in the printed action-plan table (`.data-table.action-plan`, page-only class).
- **Priority picker** `.priority-picker[role=radiogroup] > button.option-row[role=radio][aria-checked] > .radio + .pr-text (pill) + .pr-hint` ("hoje · 30 dias · 90 dias · 180 dias · 365 dias"). Picking a row fills "Prazo" as a `.field.suggestion-field[data-state="suggested"]` with the `.echo` "06/03/2027 · sugerido por P3 — 180 dias".
- **Segmented "Conselho"** is the existing `.segmented` (CREA · CRT); the chosen segment drives the labels CREA/ART or CRT/TRT and the printed title (Eng. Eletricista · Técnico(a) em Eletrotécnica). Relatório setup › Responsável and Account › Registro profissional.
- **Verdict** `.conclusion-pair.is-verdict` (three segments: `data-value="apto|restricoes|nao-apto"`) in Relatório setup › Conclusão e parecer; the `.conclusion-hint` carries the suggestion from the counts.
- **Generated text** `.field.suggestion-field.is-generated[data-state="suggested|confirmed"] > .generated-text[role=textbox] + .suggested-pill + .criteria-line (.cl-label, .cl-nc) + .generated-actions (.btn-secondary.confirm-action "Confirmar" · .btn-text "Editar" · "Substituir" · .dictation at the right)`. Sheet › Conclusão ("Texto da conclusão") and Relatório setup › Parecer ("Resumo do parecer"). Composed on the device, no AI.
- **Parecer box** `.parecer-box[data-verdict="apto|restricoes|nao-apto"] > .pb-kicker "Parecer" + .pb-verdict + .pb-text` — how section 10 prints; shown under "Como imprime na seção 10".
- **Brand preview** `.brand-preview > .bp-label "Pré-visualização do documento" + .bp-pages > figure.bp-page.bp-cover | .bp-inner` (gray `.bp-box` logo/photo, `.bp-title`, `.bp-header`, `.bp-lines > .bp-line`, `.bp-watermark`, `.bp-footer`, `figcaption.bp-caption`). Registries › Empresa only; no real logo, no image.
- **Document control table** `.doc-control-head (field-label + .btn-text "Editar em Dados do relatório") + table.doc-control (> tr > th[scope=row] + td, .dc-dim, .is-compact)` — rows Documento · Revisão do documento · Data de emissão · Contratante · Contratada · Responsável técnico · ART/TRT · Período do serviço. In the Export dialog above the section-9 option rows.
- **Photo stamp** `.photo-stamp` inside the Photo tile/row meta ("14:32" + `svg.ico.pin` `#i-pin` when GPS present; time only when absent) and `.photo-stamp.is-full` in the Photo viewer ("Imagem 5 · 06/09/2026 14:32 · pin −23,5505, −46,6333"; second line "Item 8 · Contatos · `.stamp-nc` NC" when linked). Add `<symbol id="i-pin">` to the sprite.
- **Rich text editor** `.rich-text(.is-focus) > .rt-toolbar[role=toolbar] > .rt-tool[aria-pressed] (Negrito · Itálico · Lista · Numeração) + .rt-tool.rt-var "Variável"; .rt-area[role=textbox] > p > .var-chip "{executor}"; .rt-foot` (the available variables). Template composer only, inside a section Block card's `.block-expand`.
- **Overflow menu, open** `li.block-card.overflow-anchor > .overflow-trigger[aria-expanded=true] + .overflow-menu.is-open[role=menu] > .menu-item[role=menuitem]` in the order Adicionar abaixo · Subir · Descer · Duplicar · (menu-group) Remover `data-tone="red"`. The only shadow on a Block card.
- **Export pre-check, blocking** `.precheck li > .pc-text > .pc-block` ("Parecer não preenchido", red word) + the primary "Gerar relatório" disabled with its `btn-reason`.
- **Export banner** `73-exportar.html` `.export-state > .banner[role=status] > .banner-text` under the dialog title ("Relatório emitido em 10/09 (revisão 2). Alterações desde então geram a revisão 3 — …"). *(2026-10-26, Story 16.2: built; shown while something was edited since the latest revision, "gerado" unless that revision was marked as sent, and every "Revisões" row then ends with " — anterior às alterações", authored.)*
- No emoji anywhere (mocks, CSS, guide, UI strings): icons only via the inline SVG sprite or a CSS glyph.

## Content rules
- Every visible string is pt-BR in the register of EXPERIENCE.md § Voice and Tone (sentence case, no exclamation marks, no marketing, no lorem). Copy microcopy verbatim from the spine when it exists ("Sem conexão. Tudo fica salvo neste aparelho.", "Rascunho encontrado — Recuperar", "Preenchido por Bruno · 07/09 14:32").
- Job data: client **Porto Seguro Companhia de Seguros Gerais**, site **Torres A e B**, dates **06–08/09/2026**, responsável **Rafael Lamonde**. Cabines: Cubículo Enel · 1° Subsolo (colunas 1–17) · Oxigênio · Cobertura A · Cobertura B · Geradores. TAGs: SEC-C05, DJ-C05, TP-C03, TC-C03, TR1, SEC-ENT, SEC-SAI. Instruments: **2E** megôhmetro DMG10Ki · RBC 37428/26; **3M** microhmímetro HTMO-10 · RBC 37276/26; **1T** TTR HTRT-8K · RBC 37274/26. Users Bruno and Eduardo. Product wordmark is the literal **PRODUTO**.
- Numbers pt-BR (17,5 kV · 3.700 MΩ), dates dd/mm, units in their own slot (`mf-unit`), values `t-value` (tabular). Amber only for suggestions (out of limit, "Sugerido"); red only for what the engineer marked NC / Reprovado / required-missing.
- Semantic state always carries a word or letter; disabled buttons carry a `btn-reason` beside them.
- Log anything the spine does not decide (a layout you had to invent, a missing component) in your report — do not silently add patterns.

## Recorte do MVP (slice de 2026-10-03)

Os mocks desenham o produto inteiro — PRD §7.1 — e continuam assim. **Nada é removido.** Eles são a especificação visual completa e precisam sobreviver ao slice.

O que eles passaram a fazer é **mostrar o que entra no MVP**: tudo que o PRD §7.3 adia leva uma marcação, para que quem constrói não precise consultar o PRD tela a tela.

### Como marcar

```html
<button class="read-display-btn slice-inline"
        data-slice="out" data-slice-note=" · FR-36">Ler visor</button>
```

- `data-slice="out"` — este elemento não entra no slice de duas semanas.
- `data-slice-note=" · FR-36"` — opcional; é concatenado depois de "pós-MVP" na etiqueta. Comece com `" · "`.
- Classes de forma, conforme o que está sendo marcado:
  - *(nenhuma)* — bloco: borda tracejada à esquerda, hachura leve, etiqueta no canto superior direito.
  - `slice-inline` — controle dentro de uma linha (botão, item de menu, linha de lista): contorno tracejado em volta, sem medianiz.
  - `slice-screen` — a tela inteira: só a etiqueta, sem borda, para não competir com o conteúdo.

A marcação é **deliberadamente neutra** (cinza tracejado sobre `surface-sunken`), nunca âmbar — âmbar já significa "Sugerido" no produto e confundir os dois seria pior que não marcar.

No protótipo navegável, o botão **Recorte do MVP** na barra de controles liga e desliga tudo (`body.slice-off`). Vem ligado.

### O que está marcado hoje

~~66 elementos, em onze grupos~~ 64 elementos, em dez grupos (2026-09-30, Story 11.1: os 2 botões PDF das revisões entraram e perderam a marca), derivados de PRD §7.3 "Waits, in this order":

| Grupo | FR | Onde |
| --- | --- | --- |
| "Ler visor" em toda tabela de medição | FR-36 | `60-ficha.html` (7) |
| Botão de ditado | FR-40 | `60-ficha` (43), `50-relatorio-setup` (2), `72-pontos`, `key-equipment-sheet`, `key-relatorio-setup`. **Exceção desde 2026-09-21: o ditado da legenda entra no MVP** (compositor de legenda em `71-legenda` e o passo "De qual equipamento?" em `70-fotos`), por isso não leva marca ali. |
| Legendas por visão e confirmação em lote | FR-39 | `70-fotos` (galeria); desde a v0.8 a lista de pré-emissão virou uma linha que aponta para o sumário |
| "Fotografar equipamento" na paleta de campo | FR-38 | `40-relatorio-overview` |
| Merge por sub-bloco e conflito | FR-58, FR-59 | `86-sync-conflito` (tela inteira) + rota no mapa |
| Tela de status de sincronização | FR-60 | `85-sync` (tela inteira) + rota no mapa |
| ~~PDF ao lado do DOCX~~ | ~~—~~ | ~~`73-exportar` (2 botões nas revisões)~~ Entregue em 2026-09-30 (Story 11.1): marca removida dos 2 botões, desenho mantido |
| Mover bloco entre locais | FR-20 | `60-ficha` (menu overflow) |
| Editor de texto rico | FR-12 | `42-template-composer` |
| Localização nas fotos | FR-8 | `90-account` (seção inteira) |
| Rascunho de observação de NC pela foto | FR-75 | **não marcado** — não tem elemento isolado no mock; a Observation field que o receberia é a mesma que entra no slice |

**Ao editar um mock, mantenha a marcação.** Se um recurso entrar ou sair do slice, mude o `data-slice` aqui e nesta tabela — não apague o desenho.

## v0.8 (2026-09-21) — o que o protótipo tem e os mocks estáticos não

- **`screens/40-relatorio-overview.html` é o Sumário**: a tela do relatório virou o sumário numerado do FO.SERV-03, com o que falta em cada linha, menu de objeto e campo de posição em cada linha, seção 9 abrindo na árvore por local sem subnúmero, e "Pré-visualizar" + "Gerar relatório" no rodapé. O botão "Simular: Em revisão" mostra o comportamento que segue o status. **`key-relatorio-overview.html` é anterior e está superado** nessa tela; vale o protótipo.
- **`screens/73-exportar.html`**: a lista de pré-emissão virou o item que bloqueia + uma linha "7 avisos — estão nas linhas do sumário", e entrou "Pré-visualizar". **`key-export.html` é anterior** nisso.
- **Rail** (`shell-foot.html`): dentro da ficha, só cabines e fichas; o grupo "Seções" saiu.
- **`components.css`**: `.pos-box` (campo de posição).

## Varredura Playwright (2026-09-21)

- **`screens/45-secao.html`** (novo): texto de uma seção (2, 4, 5, 6) — texto simples com chips de dados do relatório, salvamento automático, "Restaurar texto do template". As linhas 1 e 3 do sumário abrem os Dados do relatório (Etapa 2).
- **Tema:** `tokens.css` declara os tokens de componente em `:root, [data-theme]` — obrigatório enquanto o tema for aplicado no `.frame`.
- **Chips e abas quebram linha**, nunca rolam para o lado. **Tabelas** nunca cortam: caixa com rolagem como último recurso; a TTR usa `.is-wide` com colunas fixas. Os ensaios da ficha ficam empilhados em qualquer largura.
- **Miniatura do recorte:** a área de toque vem de `.crop-thumb::before` — não volte a pôr `overflow: hidden` no `.crop-thumb`.

## v0.9 (2026-09-24) — direção visual proposta (journey review)

- `DESIGN.md § v0.9 direction` descreve a nova pele: campo preenchido com régua inferior, labels em caixa baixa na tela, tri-state com o segmento escolhido sólido, stepper com régua de progresso, cabeçalho da ficha com uma frase, `cabine-line`, botão primário com raio 10 px e degradê de 4 %, linhas do Sumário com número em círculo.
- ~~Os tokens e regras ficam em **`tokens-v09.css`** e **`components-v09.css`**, carregados depois de `tokens.css` e `components.css` só pelos mocks `key-*-v09.html`. `tokens.css` e `components.css` **não mudam** até a Story 12.5 fundir os overrides neles e copiá-los para `apps/web/src/styles` no mesmo PR (regra byte-idêntico do AGENTS.md, delta em `source-deltas.md`).~~ *(2026-09-25)* A Story 12.5 promoveu a v0.9: os tokens e regras de `tokens-v09.css` e `components-v09.css` foram fundidos em `tokens.css` e `components.css` (cada regra no bloco do seu componente), os dois arquivos `-v09.css` foram apagados e as cópias em `apps/web/src/styles` continuam byte-idênticas. Os mocks `key-*-v09.html` carregam só `tokens.css` e `components.css`; os mocks que desenham o "antes" (`key-equipment-sheet.html`, o protótipo) agora renderizam com as regras v0.9.
- Mocks: `key-equipment-sheet-v09.html` (ficha, tablet, telefone e escuro~~; o "antes" é `key-equipment-sheet.html`~~) e `key-relatorio-overview-v09.html` (Sumário~~; o "antes" é `prototype/screens/40-relatorio-overview.html`~~). ~~O protótipo navegável continua na v0.8.~~ *(2026-09-25)* O protótipo navegável usa os mesmos arquivos e já renderiza com a v0.9.
- ~~Novos blocos em `components-v09.css`:~~ *(2026-09-25)* Blocos que a v0.9 trouxe para `components.css`: `.cabine-line`, `.sheet-header .sheet-summary`, `.sum-row`/`.sum-pos`/`.sum-open`/`.sum-ctrls` (promovidos do CSS de página do protótipo), `.input.is-readonly`, `.section-stepper .step::after`.
- Capturas do app real e dos mocks lado a lado: `_bmad-output/implementation-artifacts/reviews/journey-review-2026-09-24/` (`A-*` app, `M-*` protótipo).
- *(2026-09-26)* `key-equipment-sheet.html` e `prototype/screens/40-relatorio-overview.html` renderizam com o CSS v0.9 e não mostram mais o "antes"; o "antes" sobrevive só nas capturas da revisão do Epic 12 em `_bmad-output/implementation-artifacts/reviews/qa-epic-12/`.

## Epic 14 (2026-10-09, Story 14.1) — locais, verificações do local e tipos da biblioteca

Fonte: `sprint-change-proposal-2026-10-08.md` § 4.1, § 8, § 9; `source-deltas.md` linhas de 2026-10-08 e 2026-10-09. Todo o CSS novo é de página, com seletores que começam pela rota; `tokens.css` e `components.css` não mudaram.

- **Estrutura Local › Cabine › Coluna** em `screens/42-template-composer.html` (cartões de local com cartões de cabine dentro; "Adicionar local", "Adicionar cabine" com o diálogo de Função `#tc-dlg-cabine`, "Adicionar coluna", e "Adicionar equipamento" na cabine sem coluna), em `screens/40-relatorio-overview.html` (seção 9: linha do local › linha da cabine com a Função › colunas e fichas; linha "Verificações do local · N de 19" em cada local) e no `rail-tree` de `shell-foot.html`. Para manter os 94 blocos, o conteúdo das colunas 7–17 do 1° Subsolo foi redistribuído e a Cabine de transformação ganhou TR1 e TR2: **dado de exemplo inventado**, não do relatório de referência.
- **`screens/61-verificacoes-local.html`** (`/local/:id/verificacoes`, exemplos `1-subsolo`, `cubiculo-enel`): os 19 itens em seis grupos com Checklist rows, Bulk action bar, NC expandido com chips, observação, foto e "Criar ponto de atenção"; aberto pela linha do local na árvore e pela linha "Verificações do local · 12 de 19" sob o bloco "Da cabine" em `60-ficha.html` (CB-ENT abre o Cubículo Enel).
- **`screens/62-ficha-fonte-auxiliar.html`** (`/biblioteca/fap`, FAP-C09) e **`screens/63-ficha-cta.html`** (`/biblioteca/cta`, CTA-GER): fichas dos tipos da biblioteca da Story 14.5. Tabela de medições genérica com "Adicionar bloco", Δ% calculado (fora do critério em âmbar com "investigar"), linha sim/não como segmentado, toggle por ensaio opcional, opções do E5 da CTA como option rows. Na paleta de campo e na do composer, os dois tipos vêm depois dos oito, sob "Outros equipamentos".
- **`key-print-section-9.html`**: três páginas A4 da seção 9 impressa para o Bruno aprovar (local, duas cabines, a tabela VERIFICAÇÕES DO LOCAL uma vez, e o grupo OUTROS EQUIPAMENTOS). Logo é uma caixa cinza; faixas hachuradas marcam trechos omitidos só no mock.
- Fora daqui: as telas do editor de tipos (Story 14.7).
- Candidatos a promover para `components.css` quando a Story 14.5 for construída: os extras da tabela de medições, a option row fora de diálogo e a nota de ensaio desligado.

### Revisão de 2026-10-10 (respostas do Bruno; `sprint-change-proposal-2026-10-08.md` § 10)

Esta nota vence a seção acima onde as duas discordam.

- **A árvore é Local › Painel › Coluna.** Cada cabine é um local: a raiz tem a Função, os dados da SE e as Verificações do local, recebe equipamento direto e zero ou mais painéis. O painel só agrupa colunas e não recebe equipamento. Botões: "Adicionar local" (com o diálogo de Função `#tc-dlg-local`, que substitui o `#tc-dlg-cabine` citado acima), "Adicionar equipamento" e "Adicionar painel" no local, "Adicionar coluna" no painel. Redesenhado em `42-template-composer.html`, `40-relatorio-overview.html` e no `rail-tree`.
- **O no-break não é um tipo.** `62-ficha-fonte-auxiliar.html` foi removida. O no-break de comando é um item do checklist do Disjuntor MT em `60-ficha.html`.
- **Um tipo da biblioteca:** `63-ficha-cta.html` (CTA-GER, no local Geradores). Nas paletas, só a Chave de transferência automática vem depois dos oito.
- **`key-print-section-9.html`:** cada local imprime a sua tabela VERIFICAÇÕES DO LOCAL, com os itens em maiúsculas; o painel é uma faixa de título sobre as colunas; o grupo OUTROS EQUIPAMENTOS mostra a CTA.
- **`61-verificacoes-local.html`:** o cabeçalho nomeia um local só ("Cabine primária · 1° Subsolo").

- *(2026-10-22, Story 15.5, F10)* `42-template-composer.html`: a coluna aberta termina com o botão de texto "Adicionar equipamento" (`.col-body .skeleton-actions`; abaixo de 1024 px ele abre a paleta como gaveta ou folha naquela coluna), e a nova "Coluna 18", vazia e aberta, mostra antes dele a nota `.section-note.col-none` "Nenhum equipamento nesta coluna." (exemplo inventado; a contagem "17 colunas" do painel não foi refeita). Na gaveta e na folha a paleta mantém o cabeçalho "Blocos" com a linha `.pal-target` logo abaixo, rola só a lista com uma sombra de "há mais abaixo" e não quebra nome de tipo; nenhum frame do mock desenha a gaveta.

## Epic 15 (2026-10-22, Story 15.1) — os níveis da árvore

Fonte: `epic-15-context.md` (o padrão da 15.1, tomado pelo Matheus em 2026-10-22 enquanto a resposta 6 do Bruno não chega; *(2026-10-22, tarde)* as respostas 5 e 6 do Bruno chegaram e mudaram o desenho, ver o fim desta seção), o item 1 do "Melhorias produto.docx" do Bruno (a seção 9 do Sumário a 390 px lida como uma sequência plana; referências do Produttivo: faixas de título por grupo e uma palavra por nível) e `test-artifacts/manual/ux-pass-2026-10-22.md` F50, F19, F37, F34. Emendas: `DESIGN.md` › Relatório tree e `EXPERIENCE.md` › Relatório tree, 2026-10-22.

**Um vocabulário para os quatro níveis**, igual no Sumário (`screens/40-relatorio-overview.html`), no trilho (`rail-tree` de `shell-foot.html`, CSS em `screens/60-ficha.html` com seletores `#rail`) e no esqueleto do composer (`screens/42-template-composer.html`):

| Nível | Desenho | Classes (Sumário · trilho · composer) |
| --- | --- | --- |
| Local | faixa de título em `surface-sunken`, hairline acima e abaixo; "Local" (kicker) sobre o nome; Função e dados da SE; ~~a linha "Verificações do local · N de 19" dentro da faixa~~ *(2026-10-22, resposta 5: a faixa não tem botão; as Verificações do local são o primeiro cartão do local)* | `.s9-loc-row` · `.tree-row.level-band` ~~+ `.tree-row.in-band`~~ · `.local-card` |
| Painel | subfaixa em `surface-base`, hairline abaixo, a régua aberta (`sum-open-rule`) à esquerda no Sumário; "Painel" sobre o nome | `.s9-pnl-row` · `.tree-row.level-subband` · `.painel-card` |
| Coluna | cabeçalho de grupo: "Coluna" antes do nome, nome em 600, "N de M" em meta, hairline abaixo | `.s9-coluna > .s9-col` · `.tree-row.level-group` · `.column-row` |
| Equipamento | ~~TAG (600, tabular) sobre o rótulo do tipo (meta), os dois em toda largura (no desktop lado a lado); selo NC quando a ficha tem NC aberta; glifo + palavra de estado~~ *(2026-10-22, resposta 6: um cartão, ver abaixo)* | ~~`.s9-eq-id > .block-tag + .s9-eq-name`, `.nc-badge` · `.tree-id > .tree-tag + .nc-badge`, `.tree-meta` · (o composer não tem linhas de equipamento)~~ *(ver abaixo)* |
| "Adicionar …" | a última linha do seu nível, no recuo do nível | `.s9-add` · — · `.skeleton-actions` |

- **Kicker** `.level-kicker`: `label` (14 px), 600, `ink-secondary`; a mesma classe que o composer já usava desde a Story 14.1. Em ~~linha~~ *(cartão, 2026-10-22)* de equipamento nunca há kicker; "Equipamentos no local" e "Colunas 6 a 17" são cabeçalhos de grupo sem kicker (não são níveis).
- **Selo NC** `.nc-badge`: "1 NC", `nao-conforme` sobre `nao-conforme-fill`, raio cheio. Nenhum token de cor novo; `tokens.css` e `components.css` não mudaram (todo o CSS é de página, com o seletor da rota ou `#rail`, como na Epic 14).
- **Controles mantidos em toda linha**, como o app os desenha (`relatorio-tree-sumario.tsx`): chevron (48×56), alça de arrastar, caixa de posição (`.pos-box.s9-pos`), contador, Overflow; nas ~~linhas~~ *(cartões, 2026-10-22)* de equipamento, alça, caixa de posição e Overflow. No celular as linhas de local, painel e coluna não desenham alça nem caixa de posição (como `app.css` já faz). A linha *(ou o cartão, 2026-10-22)* selecionada continua `focus-fill` + régua `primary` de 4 px.
- **Cabeçalho do Sumário no celular** (F50): os quatro contadores numa grade 2×2 acima da lista. **Linha dos pontos** (F34): o ponto automático contado uma vez, "4 pontos + 1 automático · 1 sem ação" (no app de Bruno, "1 ponto + 1 automático").
- **Selos NC** (F37): "2 NC abertos" no cabeçalho corresponde às duas ~~linhas~~ *(fichas, 2026-10-22: cartões)* com selo (DJ-C05 na Coluna 5, TR1 na Cabine de transformação); o trilho mostra o selo de DJ-C05 e de TR1.
- **Ordem**: "Adicionar equipamento no local" passou para depois dos painéis do local (última linha do nível); "Adicionar bloco em ⟨painel⟩" segue a última coluna do painel.
- **Textos que mudam no kernel** (Story 15.2): a meta do painel perde "Painel ·" (o kicker diz o nível: "17 colunas", no trilho "17 colunas · 39 de 53"); a meta do local no trilho perde "Local ·" ("Primária · 1 painel · 39 de 53 fichas"); a coluna no trilho mostra "N de M" em vez de "N fichas".
- `prototype/index.html` foi regerado concatenando os mesmos arquivos na ordem do `build.py` (saída byte-idêntica à do `build.py` antes da mudança); rode `python3 build.py` para ver os avisos dele.

### Respostas do Bruno de 2026-10-22 (5 e 6, repassadas pelo Matheus)

Esta nota vence o texto acima onde os dois discordam.

- **Resposta 6, equipamento em cartões.** Toda ficha da seção 9, do trilho e do esqueleto do composer é um cartão no visual do Block card de `components.css` (`surface-raised`, `border-strong`, raio md, no mínimo `touch-field` de altura), não uma linha de 56 px. Título: TAG + rótulo do tipo; no cartão, glifo + palavra de estado e o selo NC; Overflow no canto; o corpo do cartão é a área de toque. A coluna continua cabeçalho de grupo sobre os seus cartões; as faixas de local e painel e o kicker continuam.
- **Resposta 5, Verificações do local como as fichas.** As Verificações do local são um cartão do mesmo tipo, **o primeiro cartão do local** (antes de painéis e de equipamento direto), com "N de 19" como progresso e as palavras de estado de uma ficha (Vazia · Em preenchimento · Concluída) e o mesmo visual de selecionado. A faixa do local não tem mais o botão: guarda nome, Função e dados da SE. No trilho, o mesmo cartão primeiro no local. A linha "Do local" de `60-ficha.html` não muda.

| Peça | Sumário (`40`) | Trilho (`shell-foot.html`, CSS em `60`) | Composer (`42`) |
| --- | --- | --- | --- |
| Cartão de ficha | `li.s9-eq.eq-card.block-card` › `.drag-handle`, `.pos-box.s9-pos`, `button.s9-eq-open.eq-card-open` (› `.eq-card-title` = `.s9-eq-id` › `.block-tag` + `.s9-eq-name`; `.eq-card-status` › `.s9-state`, `.nc-badge`, `.sum-here`), `.overflow-trigger` | `.tree-row.level-item.eq-card` › `.tree-body` › `.tree-id` (`.tree-tag` + `.tree-name`), `.eq-card-status` (`.tree-state`, `.nc-badge`) | `.qty-row.eq-card` (tipo + "TAG ao criar", Quantity stepper à direita) |
| Cartão das Verificações | `ul.s9-eqs.s9-site` › `li.s9-site-card.eq-card.block-card` › `button.s9-verif.eq-card-open` (a classe `.s9-verif` do app fica no botão) | `.tree-row.eq-card.site-card` | — (o composer mostra "Verificações do local: 19 itens" na linha do local, como antes) |

- Cartão atual: `.eq-card.is-current` (Sumário) e `.tree-row.eq-card.is-selected` (trilho) levam `focus-fill` + régua `primary` de 4 px.
- `.in-band` e o lado a lado de TAG e tipo só no desktop saíram; o título do cartão põe TAG e tipo na mesma linha e quebra quando falta largura.
- Textos novos (autorais): o progresso do cartão das Verificações "N de 19" com a palavra de estado ao lado ("Concluída" em 19 de 19, "Vazia" em 0, "Em preenchimento" entre os dois).

## 2026-10-30 — Home: the shortcut row above the list (Epic 19, Story 19.1)

Matheus's decision on Sally's option B (`_bmad-output/implementation-artifacts/backlog-2026-10-29-home-nav-and-telemetry.md` § 1): in `prototype/screens/20-home.html` and in the three frames of `key-home.html` the `Atalhos` section now sits between the Status board and the `Relatórios` section, same markup and classes, with a dated comment at the moved block. The capped-list note `Mostrando 4 de 8 relatórios · Ver todos` stays drawn and unbuilt until Story 19.2.

## 2026-10-30 — Home: the active list, most recent first, cut at a page size (Epic 19, Story 19.2)

~~The capped-list note `Mostrando 4 de 8 relatórios · Ver todos` stays drawn and unbuilt until Story 19.2.~~ In `prototype/screens/20-home.html` and the two `key-home.html` frames that drew it, the note is now `.home-list-note`: the `.section-note` "Mostrando 10 de 37 relatórios" with a `.chip-row` of four chips (10 · 20 · 50 · 100, the first pressed) beside it, wrapping under the note on a phone; dated comment at the block. The app renders the chips as the Filter chip group (`role="radiogroup"`). The cards drawn under it are unchanged; the app lists the active statuses with no tile pressed and the emitted ones behind the Emitido tile.


## 2026-11-03 — The product is called Conforme (Epic 20, Story 20.1)

The app shows the name Conforme from the constant `PRODUTO` (`packages/domain/src/product.ts`). The mocks keep drawing the placeholder "PRODUTO": they are drawings, and `tokens.css` and `components.css`, copied byte-identical into the app, keep their "PRODUTO (fasor)" header comments.

## 2026-11-03 — Home: the search by client and obra (Epic 20, Story 20.2)

In `prototype/screens/20-home.html` and in the three frames of `key-home.html` the `.home-head` of "Relatórios" draws a search field between the heading and "Novo relatório", from the Cadastros toolbar pattern (`80-cadastros.html`): a `.field.home-search` with the visually hidden label "Buscar relatório" and an `.input` holding `#i-search` and the placeholder "Cliente ou obra" (`key-home.html` gains the `i-search` symbol). On a phone the field takes its own full row under the heading and the button. Dated comment at each block. The app adds the field's clear button "Limpar busca", shown only while the field holds text.

## 2026-11-03 — Pontos de atenção: "Equipamento ou local" (Epic 20, Story 20.4)

In `prototype/screens/72-pontos.html` the edit-mode card draws, under its order line, a `.field.combobox` labelled "Equipamento ou local" whose `.input` names the current link ("SEC-C12 · Chave seccionadora · 1° Subsolo › Coluna 12") with the `.combobox-chevron`; dated comment at the block. The list is not drawn: the app opens a `.combobox-list` of `.combobox-option` rows grouped as "De qual equipamento?" groups them ("Geral"; each local with its "⟨local⟩ · Verificações do local" and its equipment; the equipment of no local), each group under a heading in the `.capture-group-label` style.

## 2026-11-06 — Tipos de equipamento and the type editor (Epic 22 wave C, Story 14.7 DoR)

Bruno's "cadastrar equipamentos e editar informações padrões" (coordinator's reading under Matheus's "Cadastro e padrões", open to his correction): company equipment types and their defaults. Architecture: the spine's AD-3, AD-15 and AD-21 notes of 2026-11-06. Every string below is authored; `tokens.css` and `components.css` did not change.

- **`prototype/screens/41-templates.html`** gains the section "Tipos de equipamento" under the templates: "Da empresa (3)" with one row per state (Publicado · versão 2 with an open draft of version 3; Rascunho never published, with "Descartar rascunho"; Aposentado · versão 1 with "Reativar"), and "Da biblioteca (10) · somente leitura" with "Duplicar" only (four rows drawn, the six others summed in one row). "Aposentar" opens the Confirm dialog `#tpl-dlg-aposentar`. The Status pill is the existing component; the two type states are page CSS on existing tokens (`publicado` = the conforme color of Emitido, `aposentado` = ink-secondary), always with the word.
- **`prototype/screens/43-tipo-equipamento.html`** (`/templates/tipos/no-break-comando`, title "Tipo de equipamento"): the editor of a company type, office surface. Head (name, Status pill, draft and autosave line), Tabs (Identificação · Placa (8) · Verificações (5) · Ensaios (2) · Critérios (4) · 1 aviso · Pré-visualização), and the Sticky action bar with "Aposentar", "Voltar aos tipos" and "Publicar versão 3" disabled with its reason. Each list is Registry rows with one row open below it (`.registry-row.is-open` + `.def-edit`, page CSS mirroring the Cadastros selected row); NC phrases and select options are Chips with an add-chip in primary; the Critérios tab is the Data table with inputs in its cells and the kernel's message "Informe a fonte do critério." as a red helper; "Adicionar ensaio" opens the Form dialog `#tipo-dlg-gramatica` with Option rows (four seeded formats and "Tabela de medições"); Pré-visualização draws the sheet with the Checklist row, Tri-state and Measurement table of `60-ficha.html` and `63-ficha-cta.html`. The no-break content is **invented example data** for the drawing, not Bruno's (Story 14.8 carries the real case).
- Not drawn: a phone frame of the editor (office surface; its Data tables stack into cards at phone width through page CSS, as in Cadastros) and confirmations for "Reativar" and "Descartar rascunho" (toasts with "Desfazer").
- `prototype/index.html` was rebuilt with `build.py`; the rebuild also picked up `20-home.html` changes an earlier edit had not built.

## 2026-11-08 — The Epic 23 sheet frames (Story 23.1)

Source: `epics.md` § Story 23.1; `epic-23-context.md`; `sprint-change-proposal-2026-11-08.md` § Matheus's decisions (M-4, M-5). Amendments of the same date: `DESIGN.md` › Components › Sheet (seven rows) and `EXPERIENCE.md` › Component Patterns › Sheet (seven rows), State Patterns (two rows), IA › Tipo de equipamento, Capture-to-Document › the insulation print. `tokens.css` and `components.css` did not change and no color token was added: every new look is page CSS on existing tokens, under a dated comment in each screen's `<style>`. All numbers, names and help texts are **invented sample data**, never the test base's values, procedures or recommendations (they reach the app only through Story 23.12's private import, M-1). Check each frame with the prototype bar at Celular 390, Tablet retrato 768 and Desktop 1280, Claro and Escuro.

| Frame | Route or file | What it shows | Built by |
| --- | --- | --- | --- |
| A v13 transformer sheet | `#/ficha/TR1` (`60-ficha.html`, new `data-only-tag="TR1"` blocks; the rail already linked it) | Plate with the v13 fields (Taps, Tap atual, Material do enrolamento, Temperatura do óleo, Impedância, Natureza do líquido, Tipo (ANP); Tipo de isolação "Óleo isolante", M-4) | 23.7, 23.17 |
| Manufacturer's value, set | TR1 › Ensaio de isolação | `.v13-mfr`: "Valor do fabricante" > 5,0 GΩ, the table's > 1,0 GΩ beside it, "Limpar"; the caption's criterion and source follow it | 23.3 |
| Manufacturer's value, empty | TR1 › Relação de transformação | The same field empty, "Opcional. Vazio, vale ±0,5 %, o critério do ensaio." | 23.3 |
| Temperature and corrected column | TR1 › Ensaio de isolação | `.v13-line` "Temperatura 40 °C · do óleo, na placa · …"; calculated column "Corrigido a 20 °C"; phone card line "A 20 °C: …" | 23.5 |
| Restricted reading | TR1 › Ensaio de isolação, row 1 | `.measurement-field[data-state="restricted"]` (3px amber bottom rule, neutral fill) and `.mf-helper[data-tone="restricted"]` "Com restrição: …"; the Conclusão suggestion "Aprovado · Com restrições — 1 leitura com restrição …" | 23.6 |
| Tap rows | TR1 › Relação de transformação | `.ficha-ttr-taps`: five taps in plate order, `.tap-mark` "Extremo" on 1 and 5 and "Atual" on 3; taps 2 and 4 unmarked, "Não medido"; tap 5 still empty (the 3 missing in Ensaios); phone cards "Tap n" | 23.8 |
| Choice result, Coleta de óleo | TR1 › Coleta de óleo | Segmented "Coletado · Não coletado"; "Não coletado" opens the "Motivo" chips (`:has()`), no verdict change | 23.17 |
| Choice result, Polaridade | `#/ficha/TP-C16` › TTR | `.ficha-ttr-pol`: a "Polaridade" column "OK · Invertida" per row (a field in the phone card); "Invertida" turns NC red and opens the red helper row | 23.18 |
| Test not applicable by the nameplate | `#/ficha/SEC-C05` › Resistência dos fusíveis HH | `.v13-na`: pill "Não se aplica", the neutral band with "Não se aplica: TIPO DE SECCIONADORA sem fusíveis." and "Aplicar este ensaio"; applied (`.is-applied`): "Aplicado por você. A placa diz sem fusíveis." with "Seguir a placa" and the table | 23.9 (the test is 23.19's) |
| "Como ensaiar", the dialog | TR1 › each test's head › "Como ensaiar" | `#ficha-dlg-como-iso` (eight headings) and `#ficha-dlg-como-ttr` (five of eight: only headings with text show); Form dialog shell on 768 and 1280, full screen on 390 | 23.10 |
| The editor's fields | `#/templates/tipos/no-break-comando` › Ensaios › the open test (`43-tipo-equipamento.html`) | `.tipo-help` "Como ensaiar" with its eight optional fields, then "Recomendação se reprovado" with its helper | 23.10, 23.11 |
| The printed insulation table of a v13 sheet | `key-print-section-9-v13.html` | v12 as it prints today beside v13 with TEMPERATURA in the header line and the CORRIGIDO column (M-5), the delta outlined (mock only); a table of the TEMPERATURA sources; the fit rule's sizes (8,5 pt today, 7,5 pt on v13) | 23.5 |

Not drawn here (each story drafts its own wording and lists it in its PR): the refused manufacturer's value message (23.3), the tap row that left the plate (23.8), the instrument-limit note under the table (23.4), the winding resistance table (23.15) and the ACEITÁVEL per row and " (fabricante)" print variants (23.2, 23.3). `prototype/index.html` was rebuilt with `build.py` (no warnings).


## 2026-11-10 — The Epic 24 frames (Story 24.1)

Source: `epics.md` § Story 24.1 with its dated notes; `epic-24-context.md` (decisions 1 to 12, fix batch e24h). Amendments of the same date: `DESIGN.md` › Components (Conclusion control, Checklist row, Observation field, Read-only field, Point of attention card, the new row Create point place, the struck polarity helper) and `EXPERIENCE.md` (IA › Tipo de equipamento, Block palette, Points of attention; Component Patterns › Checklist row, Conclusion control, Observation field, Point of attention card and two new rows; State Patterns, three rows; the print spec; nine struck sentences that said a point enters by itself). `tokens.css` and `components.css` did not change and no color token was added: every new look is page CSS on existing tokens, under a dated comment in each screen's `<style>`. The one new visual rule is the **preview state** of the Conclusion control. All numbers, names and recommendation texts are **invented sample data**. Check each frame with the prototype bar at Celular 390, Tablet retrato 768 and Desktop 1280, Claro and Escuro.

Four example sheets were added to `60-ficha.html` (`data-only-tag` blocks; they are in the screen map, not in the rail tree): **DJ-01**, a Disjuntor MT created now on seed v14; **NB-01**, a No-break de comando; **TR-02**, a dry transformer on seed v14; **MA-01**, a Malha de aterramento on seed v14.

| Frame | Route or file | What it shows | Built by |
| --- | --- | --- | --- |
| Conclusão as a preview | `#/ficha/CB-ENT` › Conclusão, and every sheet with a floor (`#ficha-conc`) | The Suggestion field "Prévia da conclusão" with the pill "Prévia" and "Confirmar"; both groups show the floor's pair in the preview state (dashed inner outline, no fill, no check); the line "Prévia: só vale depois de Confirmar ou de Concluir ficha."; a tap on one segment stores that half only; a segment looser than the floor is disabled with its reason line (`#/ficha/TR1`, `#/ficha/SEC-C05`). It replaces the amber banner "Sugestão: … [Aceitar]" | 24.5 |
| Reprovado on seed v14 | `#/ficha/DJ-01` › Observações and Conclusão (`#ficha-conc-dj01`) | "Reprovado?" as a preview, Aprovado disabled, no Restrições group, "A ficha exige no mínimo Reprovado: leitura fora do critério.", OBSERVAÇÕES required with "Obrigatória em ficha reprovada" | 24.3 |
| A reading out of its criterion on seed v14 | `#/ficha/DJ-01` › Resistência ôhmica de contato | The helper "Acima do aceitável (<250 µΩ)" with no "Marcar Com restrições" (the app keeps that action on seed v1 to v13; no mock ever drew it) | 24.3 |
| "Criar ponto de atenção" on a test that fails | `#/ficha/DJ-01` › Resistência ôhmica de contato (`#ficha-dj01-rc-point`) | The secondary Button under the table; after "Concluir" in the editor the place reads "Ponto de atenção 8" | 24.17 |
| The same on a restricted reading | `#/ficha/TR1` › Ensaio de isolação (`#ficha-tr1-iso-point`) | The action under the table of a v13 test with a restricted reading | 24.17 |
| The same on the Conclusão step | `#/ficha/TR-02` › Conclusão (`#ficha-conc-tr02`) | A ficha the technician reproved with nothing out: the stored Reprovado, no Restrições group, the action under the pair | 24.17, 24.3 |
| The point editor from that action | `#ficha-dlg-ponto-editor`, opened by any of the three | Form dialog shell (full screen on 390): on DJ-01 the finding in "Texto" and the test's recommendation in "Ação recomendada" with "Da recomendação do ensaio · editável"; on TR1 (v13) the restricted row and an empty action; on TR-02 the sheet's observation and its tests' recommendations | 24.17 |
| An edited observation kept | `#/ficha/DJ-01` › Verificações, item 2; `#/local/1-subsolo/verificacoes`, item 2 | The row is Conforme, its observation stays open with "Observação mantida: o texto foi editado." and "Apagar observação" | 24.6 |
| The question about a point | `#/ficha/DJ-01` › Verificações, item 3: tap C or NA (`#ficha-dlg-ponto-item`); `#/local/1-subsolo/verificacoes`, item 11 (`#vl-dlg-ponto`) | Confirm dialog "Remover o ponto de atenção deste item?" with "Manter ponto" (focused first) and "Remover ponto"; the row already shows the new result behind it | 24.7 |
| Pontos de atenção, stored points only | `#/relatorio/porto-seguro/pontos` (`72-pontos.html`, redrawn) | Heading "Pontos de atenção (7)", no automatic card, no "Possível duplicado" flag; points 5 to 7 created by a tap from a sheet's NC row, a local's NC item and a failed test | e24h (decision 12) |
| "Origem resolvida" with its action | the same screen, point 7 (`#pontos-7-t`); `#pontos-dlg-remove` | The amber flag with "Remover ponto" beside it, which opens the existing removal confirmation | 24.7 |
| The suggested TAG | `#/ficha/DJ-01` › Dados de placa; the palette of `#/relatorio/porto-seguro` | The TAG field holding "DJ-01" with the helper that asks for the plate's TAG; every palette row suggests PREFIX-NN (SC for the seccionadora) | 24.8 |
| No-break de comando | `#/ficha/NB-01` | The eighteen plate fields, six items with two hints, item 4 NC offering "Criar ponto de atenção", no test and no Ensaios step, Observações and Conclusão | 24.13 |
| The palette with a company copy | `#/relatorio/porto-seguro` › "Adicionar equipamento no local" (`#lo-palette`) | "Transformador de força — base 2026", marked "Tipo da empresa", where the library's transformer stood; the library type is not offered; "No-break de comando" under "Outros equipamentos" | 24.19, 24.13 |
| The "nominal ± %" criterion | `#/templates/tipos/no-break-comando` › Critérios, row "Tensão de saída"; › Pré-visualização | The rule, "Valor nominal" and "Tolerância (%)"; the rules line with the new word; in the preview a reading out of the range reads "Fora do aceitável (125 Vcc ± 5 %)" | 24.18 |
| TAPS helper | `#/ficha/TR-02` › Dados de placa (empty); `#/ficha/TR1` (with its count) | "Na ordem da placa, separados por ;" | 24.9 (F9) |
| "Foto térmica" with its count | `#/ficha/TR-02` › Termografia | "Foto térmica · 2" | 24.9 (F11) |
| "Agrupar por tipo" in the local's dialog | `#/templates/porto-seguro` › "Adicionar local" (`#tc-dlg-local`) | A switch, off on a new local; the app uses the same dialog inside a relatório | 24.9 (F20) |
| Templates that cannot be read | `#/templates` › under the template list | "2 templates não puderam ser lidos neste aparelho." | 24.9 (F1) |
| Oil-only plate fields on a dry unit | `#/ficha/TR-02` › Dados de placa | "Natureza do líquido" and "Temperatura do óleo" read-only and empty with "Não se aplica: TIPO DE ISOLAÇÃO é Á SECO." | 24.11 |
| The oil sampling's "Outro" | `#/ficha/DJ-01` › Coleta de óleo | "Não coletado" with the reason "Outro" and the text "Descreva o motivo" | 24.14 |
| The ground grid's first block | `#/ficha/MA-01` | "Dados da malha", no "Fotografar placa", the three fields and the copy chip | 24.14 |
| The print of a seed v14 sheet | `key-print-section-9-v14.html` | Only the four deltas from the v13 frame: the dated MANUT. ANTERIOR header, the note line under a table (a rise on the contact table, a drop on the insulation table), the CONCLUSÃO row of a Reprovado ficha with both restriction boxes empty, a section 8 row with the test's recommendation under "Ação recomendada" | 24.15, 24.16, 24.3, 24.17 |

Other changes made with them, each under a dated comment:

- **No sentence of the prototype promises an automatic point any more** (decision 12, fix batch e24h): the Pontos screen's note lost "Equipamentos marcados como Não ensaiado entram sozinhos ao final, com o motivo."; the Sumário's points line reads "7 pontos · 1 sem ação" (`40-relatorio-overview.html`); the Não ensaiado band of `#/ficha/DJ-C14` lost "e entra na seção 8 (Pontos de atenção) automaticamente" and shows "Criar ponto de atenção"; the polarity helper of `#/ficha/TP-C16` reads "Polaridade invertida: a ficha fica Reprovado." The older static frames `key-points-of-attention.html` and `key-sheet-states.html` still draw the automatic Não ensaiado entry and are **superseded on it** by `72-pontos.html`.
- The NC rows of the four new sheets draw "Criar ponto de atenção" as the build does (secondary Button with the flag glyph, and the point the row already has named beside it); the older sheets keep the Text button with the plus glyph.
- `43-tipo-equipamento.html` drew the row "Tensão de saída" as "±" over "5 % de 125 Vcc"; it is now the "nominal ± %" row, and "±" stays for the ratio test's deviation only.
- Page CSS only: `.e24-conc`, `.is-floor`, `.e24-preview-line` (the preview), `.e24-point-place`, `.nc-point-ref` (the create place), `.e24-kept`, `.e24-kept-line` (the kept observation), `.e24-outro`, `.row-hint`, `.poa-flag-row`, `.tipo-nominal`. Candidates to promote to `components.css` when the stories are built: the preview state of `.conclusion-pair` and `.nc-point-ref`.

Not drawn here (each story drafts its own wording and lists it in its PR): the type list's line for a library type hidden by a copy (24.19), the publish issue of a "nominal ± %" row with no tolerance (24.18), the applied-test band's single lead (24.9, F11), the criterion fallback sentences and helpers of F16, F17 and F19 (24.9), the new transformer items and their NC phrases (24.11), the v14 TP, TC and QGBT lists (24.10, 24.12), and section 10 (24.4). Found while checking, older than this story and left as they are: at 390 px `#/templates` (the row actions) and `#/relatorio/porto-seguro` (a long equipment name) scroll sideways by 29 px and 16 px; the SEC-C05 sample still proposes "Aprovado · Com restrições" over a reading below its criterion, which Story 22.4 would floor at Reprovado. `prototype/index.html` was rebuilt with `build.py` (no warnings).

### 2026-11-10, after Matheus looked at the frames

- **Approved by Matheus on 2026-11-10** ("o resto tá ok"), with one correction.
- **The correction.** In the cable sheet's insulation table (`#/ficha/CB-ENT`), the row with no reading ("Fase Reserva") drew its value and its unit one slot to the right of the rows above, because those rows show the crop glyph after the unit. A page rule in `60-ficha.html` now keeps that slot empty on a row with no crop, in any measurement table where a confirmed reading shows its glyph. `components.css` did not change. Story 24.9 mirrors the rule in the app.
- **Still to redraw.** The conclusion frames follow the rules as they stood before Bruno's correction of the same day (an observation never forces a restriction, on every seed; fix batch e24h, item H9). No frame draws a ficha forced to "Com restrições" by an observation, so nothing in them is wrong; the EXPERIENCE amendment for it is written with fix batch e24h's records.

