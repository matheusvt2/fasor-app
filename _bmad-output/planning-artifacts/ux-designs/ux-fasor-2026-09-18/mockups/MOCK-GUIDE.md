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
`app-bar` grid: left = back `icon-btn` (or the `wordmark` "PRODUTO" on Home), center = `app-bar-title` (surface name; inside a sheet the TAG, e.g. "SEC-C05"), right = `sync-badge[data-state]` then `avatar-btn` › `avatar` with the initial (B for Bruno, E for Eduardo). Never client or Fasor branding.

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
- **Banner slot** `.banner-slot`: only the first non-hidden `.banner` child renders; the others fold into its `.banner-more` "+N" chip. Phone App bar: the Sync badge shows `.sync-short` (OK · Off · 3 · Erro · Confl.) beside the dot, the full word `.sync-long` on wider frames.

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

66 elementos, em onze grupos, derivados de PRD §7.3 "Waits, in this order":

| Grupo | FR | Onde |
| --- | --- | --- |
| "Ler visor" em toda tabela de medição | FR-36 | `60-ficha.html` (7) |
| Botão de ditado | FR-40 | `60-ficha` (43), `50-relatorio-setup` (2), `72-pontos`, `key-equipment-sheet`, `key-relatorio-setup`. **Exceção desde 2026-09-21: o ditado da legenda entra no MVP** (compositor de legenda em `71-legenda` e o passo "De qual equipamento?" em `70-fotos`), por isso não leva marca ali. |
| Legendas por visão e confirmação em lote | FR-39 | `70-fotos` (galeria); desde a v0.8 a lista de pré-emissão virou uma linha que aponta para o sumário |
| "Fotografar equipamento" na paleta de campo | FR-38 | `40-relatorio-overview` |
| Merge por sub-bloco e conflito | FR-58, FR-59 | `86-sync-conflito` (tela inteira) + rota no mapa |
| Tela de status de sincronização | FR-60 | `85-sync` (tela inteira) + rota no mapa |
| PDF ao lado do DOCX | — | `73-exportar` (2 botões nas revisões) |
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
