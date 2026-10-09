---
type: Glossary
title: Domain vocabulary
description: Compact glossary of the fixed terms (relatório, Project, Template, Block, Ficha, TAG, Suggestion, Parecer, states). Open when a term is ambiguous.
tags: [glossary, domain]
timestamp: 2026-09-30T00:00:00Z
sources: [_bmad-output/specs/spec-fasor/glossary.md]
---
# Vocabulary

Full text: `_bmad-output/specs/spec-fasor/glossary.md` (48 lines, cheap to read whole). Short form:

- **Relatório**: one visit's report, an instance of a Template inside a Project; unit of delivery.
- **Project**: one client and site; owns relatórios and Equipment rows.
- **Template**: reusable composition of Blocks plus location skeleton; editing one never touches existing relatórios. Seeded: "Cabine primária — padrão".
- **Block**: Section block (fixed text with variables) or Equipment block (one sheet, one equipment, one TAG). **Sub-block**: one test, checklist item, nameplate group; switched off means omitted from print.
- **Location**: tree node `Cabine > Coluna`. The Cabine root owns substation characteristics, test environment and `agrupar_por_tipo`. *(2026-10-08: the coluna is optional; ~~on screen the cabine is a "local";~~ a cabine carries its Verificações do local; 2026-10-09: cabine = function (entrada, primária, transformação, distribuição), local = place; from seed v4 the tree is Local › Cabine › Coluna (a local holds one or more cabines, a cabine zero or more colunas) and the Verificações do local sit on the local. Company equipment types ("tipo do escritório") sit beside the seeded eight.)*
- **Ficha**: the equipment sheet, on screen and printed. Eight types: cabos_entrada, para_raio, chave_seccionadora, disjuntor_mt, tp, tc, cabos_saida, transformador_forca.
- **TAG**: stable equipment identity, unique within the Project, suggested from type plus column.
- **Sumário**: the relatório overview as its own table of contents (capa, controle, sections 1-11).
- **Sheet state**: Vazia, Em preenchimento, Concluída, Não ensaiada. **Relatório status**: Rascunho, Em campo, Em revisão, Emitido.
- **C / NC / NA**: conforme, não conforme, não se aplica; NC requires an observation.
- **Suggestion**: a value proposed but not confirmed; never written, counted or printed until confirmed. **Verificar**: lower trust, confirmable only by tapping that field. **Copy/default**: plain value with undo, not a Suggestion.
- **Reading**: one backend pass over a photo: plate, display, caption, panel, nc_obs.
- **Ponto de atenção**: a finding, printed in section 8. **Parecer**: the relatório-level technical opinion; the one blocking pre-issue item.
- **Export revision**: numbered DOCX plus PDF of one generation; **form revision** ("Revisão 01") identifies the form. **Preview** is the same generation with a RASCUNHO watermark.
- Regulation: NR-10 (current text to 2027-05-31, Portaria MTE 737/2026 after), PIE, PLH, ART/TRT.
