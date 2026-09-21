# PRODUTO — protótipo navegável

**Abrir:** `python3 build.py` e depois abra `index.html` no navegador (funciona em `file://`, sem servidor). A barra do topo troca dispositivo (tablet retrato é o padrão), tema e abre o **Mapa de telas**. Rota inicial: `#/login`.

**Arquivos:** `shell-head.html` + `screens/*.html` (ordem alfabética) + `shell-foot.html` → `index.html` (gerado, não edite). `proto.js` = roteador por hash e comportamentos `data-*`. `proto.css` = só a moldura do protótipo. O visual vem de `../tokens.css` e `../components.css` — reuse, não copie.

## Adicionar uma tela (fragmento em `screens/NN-slug.html`)
```html
<style data-screen="slug">/* CSS só desta tela; TODO seletor começa com [data-route="/rota"] (ou .frame-phone [data-route="/rota"] …) */</style>
<section class="screen" data-route="/rota" data-title="Título na App bar" data-shell="app|bare" data-rail="true|false">
  …conteúdo copiado do mock estático (o <main class="screen"> do mock vira esta <section>)…
  <div class="dialog-scrim" id="slug-dlg-x" hidden>…diálogo/paleta/folha…</div>   <!-- overlays vivem dentro da tela, fechados -->
</section>
```
- Sem `<html>/<head>/<body>`, sem `<script>`, sem `onclick`. Um único `<section class="screen">` por arquivo.
- A App bar (voltar · PRODUTO · título · Sync badge · avatar) e o trilho da árvore são do shell: não os repita. `data-shell="bare"` esconde a App bar (Login). `data-rail="true"` mostra a árvore (`<template id="rail-tree">` em `shell-foot.html`): inline no tablet paisagem/desktop, faixa de 48 px com toggle no tablet retrato, botão na App bar no celular.
- Opcionais na `<section>`: `data-sync="ok|pending|offline|error|conflict"` + `data-sync-label="3 pendentes"` (badge da App bar nesta tela), `data-user="E"` (avatar), `data-examples="CB-ENT,SEC-C05"` (rotas de exemplo no mapa, para rotas dinâmicas).
- Rota dinâmica: `data-route="/ficha/:tag"`; o valor chega em `data-param` na section e em todo `<span data-bind="tag">`; em `data-title` escreva `:tag` para o título. `data-bind="route"` mostra o path.
- Ids devem ser únicos no build inteiro: prefixe com o slug (`home-…`, `acc-…`). Ícones: `<svg class="ico" aria-hidden="true"><use href="#i-nome"/></svg>` com os símbolos do sprite em `shell-head.html` (adicione novos lá).
- Fotos = `.thumb-fake`; nada de rede, webfont ou imagem. Um `<form>` real recarregaria a página: use `<div role="form">` e `<button type="button">`.

## API de atributos (proto.js — telas não escrevem JS)
| Atributo | Efeito |
|---|---|
| `data-go="#/rota"` (ou `<a href="#/rota">`) | navega |
| `data-back` | `history.back()` (ou Início se não há histórico) |
| `data-open="#id"` · `data-close` · `data-close="#id"` | mostra/esconde um elemento `hidden` (`.dialog-scrim`, lista de combobox, seção); `data-close` sem valor fecha o `.dialog-scrim` mais próximo; tocar no scrim ou Esc também fecha |
| `data-toast="texto"` (+ `data-toast-action="Desfazer"`) | Toast por 6 s |
| `role="radio"` dentro de `[role="radiogroup"]`/pai (`.tri-state`, `.conclusion-pair`, `.segmented`, `.option-row`) | rádio: `aria-checked` + classe `is-selected` (ou `data-toggle-class="outra"`) |
| `role="switch"` / `role="checkbox"` / `aria-pressed` | alterna `aria-checked`/`aria-pressed`; `.toggle-word` vira Ativado/Desativado |
| `data-toggle-class="cls"` (sem role) | alterna a classe; em `.seg` age como rádio entre irmãos |
| `data-tab="panelId"` em `.tab` | seleciona a aba; mostra `#panelId`, esconde os irmãos com `data-tab-panel` |
| `data-set-text="#sel\|texto"` | troca o texto do alvo (procura primeiro dentro da tela); vários alvos separados por `\|\|`: `"#a\|texto\|\|#b\|texto"` |
| `data-toggle-class="cls" data-toggle-target="#id"` | alterna a classe no alvo em vez de em si mesmo (ex.: um botão que muda `data-state` visual de outro bloco) |
| `data-listen="#sel\|texto"` (no `.dictation-btn`) | ditado simulado: `aria-pressed="true"` ("Ouvindo…" + ponto pulsante) por 1,5 s, depois insere o texto (semântica do `data-set-text`) e marca o `.suggestion-field` mais próximo do alvo como `data-state="suggested"` |
| `data-cycle="MΩ\|GΩ\|TΩ"` (no `.unit-cycle`) | alterna a unidade a cada toque (texto em `.unit-text`, senão o próprio elemento) |
| `data-count-tap` (num elemento ou na `<section>` inteira) | cada toque em algo acionável dentro dele soma no contador "Toques nesta ficha: N" da barra do protótipo (zera ao trocar de rota) — para demonstrar o orçamento de ≤ 20 toques |
| `.chip-row.chips-recent` › `.chip[aria-pressed]` | chips de valor: um só pressionado por linha (rádio) |
| `data-open="#slot-conflict\|#slot-draft\|#slot-suggestions\|#slot-exported\|#slot-offline"` · `<section data-banner="#slot-a,#slot-b">` | **Slot único de Banner** do shell (abaixo da App bar): só o primeiro visível aparece, os demais viram o chip "+N" (abre `/sync`); `data-banner` na section abre-os ao entrar na rota; todos fecham ao trocar de rota |
| `data-tree-toggle` (chevron da árvore) | alterna `aria-expanded` no `<li>` |
| `data-theme-set="system\|light\|dark"` · `data-device-set` · `data-rail-toggle` | tema, dispositivo, trilho |
Vários atributos no mesmo elemento executam juntos (ex.: `data-close data-go="#/ficha/SEC-C05" data-toast="Bloco adicionado"`). O elemento mais interno com algum atributo ganha; `aria-disabled="true"` bloqueia.

**Shell (v0.6.0 — delta da ferramenta de referência, D1–D8):** sem rota nova; sem mudança em `proto.js`. Ícones novos no sprite: `i-pin`, `i-bold`, `i-italic`, `i-list`, `i-list-num`, `i-braces`. Blocos novos usados pelas telas com os nomes de classe de `components.css` (worker B): `.priority-pill[data-p]`, `.priority-picker` (`/relatorio/…/pontos`), `.doc-control` (`…/exportar`), `.suggestion-field.is-generated` + `.criteria-line` (`…/setup`, `/ficha/:tag`), `.parecer-box[data-verdict]` (`…/setup`), `.brand-preview` (`/cadastros` › Empresa), `.photo-stamp` (`…/fotos`), `.rich-text` (`/templates/porto-seguro`). Enquanto `components.css` não os traz, cada tela carrega uma cópia temporária dentro do seu `<style data-screen>` entre `/* FALLBACK-CSS begin */` e `/* FALLBACK-CSS end */` — apague o bloco quando o CSS compartilhado chegar. Onde a API de atributos não muda um atributo `data-*` (tom do `.parecer-box` pelo parecer escolhido, texto de ajuda do switch de localização, campo e linha da marca d'água pelo switch), a tela usa CSS `:has()` sobre `aria-checked`, como a ficha já fazia; o `data-verdict` do `.parecer-box` fica fixo no HTML. Overlays novos (todos `.dialog-scrim` fechados dentro da tela): `#pontos-dlg-menu`, `#pontos-print` (bloco `data-open`), `#tc-dlg-menu`, `#tc-dlg-rich`, `#setup-parecer-box`/`#setup-parecer-own`, `#ficha-conc-text`/`#ficha-conc-own`, `#exportar-gen-blocked` (emissão bloqueada até "Simular preenchido" ou o parecer em Dados do relatório).

**Shell (v0.5.0):** Sync badge da App bar mostra palavra curta no celular (`.sync-short`: OK · Off · 3 · Erro · Confl., derivada de `data-sync`/`data-sync-label`). Ícones novos no sprite: `i-mic`, `i-sparkles`, `i-crop`, `i-check-all`, `i-section`, `i-repeat`, `i-cycle` (além de `i-camera`, `i-layers`). Classes novas em `components.css`: `.camera-capture-btn`/`.camera-capture-tile`, `.dictation-btn` (+`.listening-word`), `.continue-card`, `.relatorio-card .card-continue`, `.section-stepper .step[data-missing]`, `.bulk-action-bar(.is-compact)`, `.read-display-btn`, `.mt-title-row`, `.suggestion-field[data-state=suggested|verify|confirmed]` (+`.suggested-pill`, `.verify-pill`, `.crop-thumb`, `.confirm-btn`, `.plate-crop`, `.suggestion-block`, `.suggestion-alt`), `.queued-banner`, `.outlier-helper`, `.unit-cycle`, `.chips-recent`, `.banner-slot`/`.banner-more`, `.sync-headline`. `.nameplate-extraction .field.is-suggested` continua a funcionar (alias).

**Rotas:** `/login` · `/home` · `/project/porto-seguro` · `/relatorio/porto-seguro` (rail) · `/relatorio/porto-seguro/setup` · `…/fotos` · `…/legenda` · `…/pontos` · `…/exportar` · `/ficha/:tag` (rail; CB-ENT, SEC-ENT, SEC-C05, DJ-C14, TP-C16) · `/templates` · `/templates/porto-seguro` · `/cadastros` · `/sync` · `/sync/conflito` · `/account`. Rota sem fragmento cai em `screens/00-placeholder.html`. `build.py` lista alvos de `data-go`/`href` ainda sem tela e avisa ids/rotas duplicados.
