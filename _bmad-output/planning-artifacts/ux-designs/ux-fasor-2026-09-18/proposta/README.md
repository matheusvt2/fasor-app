# Proposta de experiência — PRODUTO (para Bruno Matsui)

**Entregue:** `../Proposta de experiencia - PRODUTO - 2026-09-19.pdf` (41 páginas, A4 paisagem, 5,0 MB)

Documento de apresentação da solução para o parceiro de design: problema atual, personas,
princípios, modelo mental, cinco jornadas, as 17 telas do protótipo, entrada inteligente,
offline, mapeamento app → FO.SERV-03, identidade visual, decisões, revisões, visão de futuro
e as perguntas a validar.

**Vocabulário (2026-09-19):** o documento gerado é um **relatório**, não um laudo. O FO.SERV-03 recebido tem o cabeçalho "Laudo Técnico" mas se chama *relatório* oito vezes no próprio corpo, e é assim que a NR-10 o nomeia (10.2.4 g hoje, 10.7.11 a partir de 01/06/2027). O título do formulário passou a "Relatório Técnico de Cabine Primária", Revisão 01; o código FO.SERV-03 não mudou. Detalhes no `.memlog.md` e no addendum do brief.

## Regenerar

```bash
cd proposta
python3 build_pdf.py "$PWD/proposta.html" "$PWD/proposta.pdf"        # Chrome headless → PDF
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.7 -dNOPAUSE -dBATCH -dQUIET \
   -dDownsampleColorImages=true -dColorImageDownsampleType=/Bicubic -dColorImageResolution=220 \
   -dDownsampleGrayImages=true -dGrayImageDownsampleType=/Bicubic -dGrayImageResolution=220 \
   -dAutoFilterColorImages=false -dColorImageFilter=/DCTEncode -dJPEGQ=92 \
   -sOutputFile=proposta-web.pdf proposta.pdf                        # 20 MB → 5 MB
```

## Arquivos

- `proposta.html` — o documento inteiro (uma `<section class="page">` por página).
- `proposta.css` — folha de estilo; paleta e papéis tipográficos vêm do `DESIGN.md` / `mockups/tokens.css`.
- `shoot.py` — recaptura as telas do protótipo navegável (Playwright + Chrome). Rode `python3 ../mockups/prototype/build.py` antes, se o protótipo mudou. Ajuste `OUT` para `assets/shots`.
- `build_pdf.py` — renderiza o HTML em PDF A4 paisagem.
- `assets/shots/` — 41 capturas do protótipo (tablet retrato, paisagem, celular, desktop, tema escuro, diálogos).
- `assets/shots/split/` — capturas de página inteira fatiadas em colunas de altura igual.
- `assets/foserv/` — páginas do FO.SERV-03 atual em alta resolução; `assets/foserv-all-pages.png` é a mancha das 125 páginas.

## Fontes do conteúdo

`../DESIGN.md` · `../EXPERIENCE.md` (v0.5.0) · `../.memlog.md` · `../review-adversarial-usability.md` ·
`../../../briefs/brief-fasor-2026-09-18/` · as três pesquisas em `../../../research/` ·
`docs/context/FO.SERV-03 Laudo Técnico de Cabine Primária.docx`.
