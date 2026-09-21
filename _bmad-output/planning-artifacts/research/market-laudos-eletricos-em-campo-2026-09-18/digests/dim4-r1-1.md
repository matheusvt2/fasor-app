# Digest — Dimensão 4 (Panorama competitivo) — Rodada 1, agente 1

**Dimensão:** 4 — Panorama competitivo (quem compete pelo orçamento de laudos de manutenção preventiva de subestações/cabines MT, incluindo substitutos e "não fazer nada").
**Perguntas cobertas:** (1) Mesh Engenharia / app de campo com IA de placa; (2) GroundPRO / Elétrica Academy; (3) softwares de dados de ensaio de fabricantes (OMICRON PTM coberto; Megger PowerDB e Doble NÃO verificados); (4) apps genéricos de checklist/OS (Checklist Fácil, Produttivo, SafetyCulture/Mitti, GoCanvas cobertos; Auvo, Field Control, Kizeo sem preço); (5) outros específicos BR (busca inicial).
**Data de acesso de todas as fontes:** 2026-09-18.
**Método/observação:** Mesh Labs e GroundPRO são SPAs (React) sem texto no HTML; as evidências foram extraídas dos bundles JavaScript públicos servidos pelos próprios sites (strings de interface). Isso prova que a funcionalidade existe no código em produção em 2026-09-18, mas NÃO prova uso/tração nem que esteja liberada para todos os usuários (há feature flags). Tratar como "alegação/artefato do fornecedor".

## Claims

### Mesh Engenharia — Mesh Labs / módulo "Ensaia" (concorrente mais direto)
- Mesh Engenharia opera a plataforma web "Mesh Labs — Plataforma de Engenharia Elétrica" em labs.meshengenharia.com | https://labs.meshengenharia.com/ | Mesh Engenharia | sem data | accessed 2026-09-18 | high | positioning
- O catálogo de ferramentas do Mesh Labs (no bundle) lista: Elettra (curto-circuito IEC 60909, ativo), Estudos de Proteção (teaser), SPDA (teaser), Relé virtual (injeção secundária/curvas, ativo), Trip (teste de relés por funções ANSI, teaser), **Ensaia** ("Montagem de ensaios por equipamento, checklist técnico e publicação de formulários de campo", ativo), Biblioteca (ativo), Desafio dos Testes (inativo), **Laboratório de Testes** ("Bancada virtual de instrumentos elétricos: megôhmetro, TTR e micro-ohmímetro, com transformador, disjuntor, seccionadora, TC e TP", ativo) | https://labs.meshengenharia.com/ (bundle /assets/*.js) | Mesh Engenharia | sem data | accessed 2026-09-18 | high | competitor-feature
- O nome do "app" de campo é, pelo código, o módulo **"Ensaia"** + um **"app Mesh" para celular** (texto: "Use o app Mesh no celular para preencher placas e ensaios.") | idem | Mesh Engenharia | sem data | accessed 2026-09-18 | medium | competitor-feature
- Funcionalidade "Ler Placa com IA" (foto da placa → leitura automática dos dados), e "Salvar placa e sugerir ensaios": "Disjuntores, TCs, TPs, chaves e transformadores entram uma vez e valem para toda atividade do projeto — a placa deles é o que gera os ensaios de praxe." | idem | Mesh Engenharia | sem data | accessed 2026-09-18 | high | competitor-feature
- Modelo de dados: Cliente → Projeto (planta) → Atividades ("um curto-circuito, um teste de relés, uma inspeção, um laudo") → Laudos/Anexos; inventário de equipamentos por projeto com TAG; papéis de equipe (executor "Ensaio: preenche placa e ensaio", member "Edição", owner, admin) | idem | Mesh Engenharia | sem data | accessed 2026-09-18 | high | competitor-feature
- Laudo com placar "Aprovados / Reprovados / Não ensaiados … de N pontos planejados", veredito e conclusão editáveis; export/import de planilha ("Modelo em branco" e "Dados já lançados … para editar e importar de volta") | idem | Mesh Engenharia | sem data | accessed 2026-09-18 | medium | competitor-feature
- Inspeções parecem controladas por feature flag (`MESH_INSPECTIONS_ENABLED`) — possivelmente ainda em liberação gradual | idem | Mesh Engenharia | sem data | accessed 2026-09-18 | low | traction
- Mesh Engenharia: fundada por pai e filho engenheiros eletricistas, "mais de 40 anos de experiência somada" em subestações, "mais de 2.200 alunos" (alegação do fornecedor, via snippet de busca) | https://br.linkedin.com/company/mesh-engenharia ; https://meshengenharia.com/ | Mesh Engenharia | sem data | accessed 2026-09-18 | low (1 fonte, autodeclarado, lido apenas via snippet) | traction
- Mesh vende treinamentos de ensaios em subestações (Hotmart; turmas presenciais "Testes em SE's") — o app é canal/upsell de uma base de alunos técnicos de ensaio | https://hotmart.com/pt-br/marketplace/produtos/hagsxd-teste-presencial-9x5oi/M86715357M ; https://turmasabertas.com.br/cxpr_inscricoes/ | Hotmart / Turmas Abertas | sem data | accessed 2026-09-18 | medium | positioning
- Preço do Mesh Labs / app Mesh: NÃO encontrado (nenhuma string de preço no bundle; app não localizado na busca da Google Play por "mesh engenharia") | — | — | — | accessed 2026-09-18 | — | pricing

### GroundPRO (Elétrica Academy)
- GroundPRO se descreve como "Software profissional de engenharia de aterramento e SPDA, focado para projetos avançados e personalizados" (web app) | https://ground.eletricaacademy.com.br | GroundPRO | sem data | accessed 2026-09-18 | high | positioning
- Módulos no código: Aterramento de Subestação (NBR 15751 / IEEE 80), Estratificação do Solo (NBR 7117), Análise de Risco (NBR 5419-2:2026), DPS (NBR 5419-4 / IEC 62305-4), Distância de Segurança (NBR 5419-3:2026), Simulação de Métodos, Diagnóstico 2015→2026, Aterramento de Usina FV (IEEE 2778 / IEC TS 62738), **Laudo de Continuidade (SPDA)** — "Inspeção em campo: medições de continuidade com fotos, veredito por ponto e laudo" | idem (bundle) | GroundPRO | sem data | accessed 2026-09-18 | high | competitor-feature
- Texto de roadmap no painel: "Em breve: Checklists Online • Alerta de Raios (SATE, NBR 16785)" | idem (bundle) | GroundPRO | sem data | accessed 2026-09-18 | high | competitor-feature
- Um módulo aparece marcado "Módulo novo — lançado em agosto de 2026" (contexto: usina FV) — produto em evolução ativa | idem (bundle) | GroundPRO | 2026-08 | accessed 2026-09-18 | medium | traction
- Estrutura de planos no código: limites por plano (máx. usuários, armazenamento MB, análises/mês, relatórios PDF/DOCX/mês, exportações/mês, marca d'água); plano "Gratuito" com 1 usuário, 50 MB, 5 análises, 5 relatórios/mês, 5 exportações/mês, marca d'água; trial com "escada" de restrições (níveis 3–4 bloqueiam Laudo de Continuidade, Usina FV, Simulação) | idem (bundle) | GroundPRO | sem data | accessed 2026-09-18 | medium | pricing
- Venda consultiva via WhatsApp (+55 92…), rotas /checkout/:slug, /trial/:slug, /turma/:slug e "condição vitalícia"/"condição exclusiva para alunos do Webinar" — monetização atrelada a cursos/webinars; preço em R$ NÃO público | idem (bundle) | GroundPRO | sem data | accessed 2026-09-18 | medium | pricing
- Interface em PT/ES/EN (strings trilíngues) | idem | GroundPRO | sem data | accessed 2026-09-18 | medium | positioning

### OMICRON Primary Test Manager (PTM)
- PTM: "diagnostic testing, condition assessment and data management of medium and high-voltage assets" (disjuntores, máquinas rotativas, aterramento, transformadores de potência e de instrumento, buchas, OLTC); gera planos de ensaio por ativo conforme IEEE/IEC, avalia automaticamente, gera relatórios com comentários e imagens; controla o instrumento conectado a partir do laptop | https://www.omicronenergy.com/en/products/primary-test-manager-ptm/ | OMICRON | sem data | accessed 2026-09-18 | high | competitor-feature
- PTM aceita "data import of third party test results, for example, of DGA results" e entrada manual de ativos; banco central com sincronização; app complementar **PTMate** gratuito (iOS/Android) para fotos, diagramas, compartilhar jobs/relatórios | idem | OMICRON | sem data | accessed 2026-09-18 | high | competitor-feature
- Preço/licença do PTM: não publicado na página | idem | OMICRON | sem data | accessed 2026-09-18 | high | pricing

### Apps genéricos de checklist / OS
- Checklist Fácil: planos Basic, Standard, Professional, Enterprise — todos "Fale conosco"/demonstração, sem preço público; uso offline; recursos de IA ("Resposta Inteligente", "Importação de checklists com IA" de planilhas/PDF/imagens, resposta por voz); teste grátis | https://checklistfacil.com/planos/ | Checklist Fácil | sem data | accessed 2026-09-18 | high | pricing
- Produttivo: página de planos sem preço em R$ no HTML; avaliação gratuita de 15 dias; relatórios automáticos em PDF, personalização de relatório com logo (planos superiores); segmenta PMOC, manutenção, OS | https://www.produttivo.com.br/planos/ | Produttivo | sem data | accessed 2026-09-18 | high | pricing
- Produttivo publica conteúdo/modelo de "Laudo NR10" preenchido no app e exportado em PDF/Excel — já disputa a busca orgânica de laudos elétricos | https://www.produttivo.com.br/blog/laudo-nr10/ | Produttivo | sem data | accessed 2026-09-18 | medium | positioning
- SafetyCulture: safetyculture.com/pricing redireciona para "Pricing | Mitti (by SafetyCulture)" (rebrand/produto novo — verificar); Free US$0 para até 10 usuários (inclui até 300 créditos de IA); Premium US$24/assento/mês anual ou US$29 mensal | https://mitti.com/pricing (via https://safetyculture.com/pricing/) | SafetyCulture/Mitti | sem data | accessed 2026-09-18 | high | pricing
- GoCanvas: Essentials US$29, Pro US$39, Max US$49 por usuário/mês, mínimo 3 usuários, cobrança anual | https://www.gocanvas.com/products/packages (via /pricing) | GoCanvas | sem data | accessed 2026-09-18 | high | pricing

### Outros / substitutos
- A busca "software laudo SPDA NR-10 aplicativo" retorna quase só prestadores de serviço de laudo (Engetrainer, Alta Tensão, ABC Para-raios, Soluind, Ayres etc.), não softwares — sinal de que não há software BR dominante nesse termo; o único software na SERP foi Produttivo | https://www.engetrainer.com.br/laudos-e-projetos/laudos-de-spda-nr-10-e-nr-13 ; https://www.altatensaose.com.br/laudos-tecnicos-nr-10 ; https://soluind.com.br/-NR10-Laudo-Tecnico-de-SPDA-Para-Raios-SP-Sao-Paulo | vários | sem data | accessed 2026-09-18 | medium | positioning
- "Não fazer nada" (papel + Excel + Word): sem evidência externa coletada nesta rodada — crença não verificada de que é o status quo das pequenas prestadoras.

## Tabela resumo

| Concorrente | Tipo | Plataforma | Preço | Foco | Fraqueza visível |
|---|---|---|---|---|---|
| Mesh Labs / "Ensaia" + app Mesh (Mesh Engenharia) | Direto (vertical BR, ensaios SE) | Web + app celular (lojas não localizadas) | Não público | Estudos elétricos + ensaios de equipamentos MT/AT com IA de placa, laboratório virtual, laudos | Preço/tração opacos; inspeções atrás de feature flag; vários módulos "teaser"; canal é base de alunos (escola) — foco em comissionamento/estudos mais que checklist preventivo de cabine |
| GroundPRO (Elétrica Academy) | Adjacente (SPDA/aterramento) | Web (SPA) | Não público (Gratuito limitado: 1 usuário, 5 relatórios/mês, marca d'água); venda por WhatsApp | Cálculo aterramento/SPDA NBR 5419:2026 + Laudo de Continuidade em campo; "Checklists Online" em breve | Não cobre ensaios de equipamentos MT (isolação/contato/TTR); venda atrelada a curso |
| OMICRON PTM (+PTMate) | Incumbente fabricante | Desktop Windows + app móvel gratuito | Não público | Ensaios diagnósticos MT/AT, planos IEEE/IEC, controle do instrumento | Pensado para ecossistema OMICRON; importação de terceiros citada só para DGA; custo/complexidade presumidos altos (não verificado) |
| Megger PowerDB | Incumbente fabricante | (não verificado — site 403) | Não verificado | Gestão de dados de ensaio | Não verificado nesta rodada |
| Doble | Incumbente fabricante | Não pesquisado | — | — | — |
| Checklist Fácil | Genérico BR | Web + mobile, offline | Só sob consulta (4 planos) | Checklists/auditorias multissegmento com IA | Sem templates de ensaio elétrico com grandezas por fase/instrumento (não verificado) |
| Produttivo | Genérico BR (manutenção/OS) | Web + mobile | Não público; trial 15 dias | OS, PMOC, relatórios PDF; conteúdo de Laudo NR10 | Genérico; relatório personalizado só em plano superior |
| SafetyCulture → Mitti | Genérico global | Web + mobile | Free (≤10 usuários); US$24–29/assento/mês | Inspeções/segurança | Dólar; sem vertical elétrica BR (ART, RBC) |
| GoCanvas | Genérico global | Web + mobile | US$29/39/49 usuário/mês, mín. 3, anual | Formulários de campo | Dólar, mínimo 3 usuários, sem vertical BR |
| Auvo / Field Control / Kizeo | Genérico (OS/forms) | — | Não obtido (URLs 404/403) | OS de campo | — |
| Papel + Excel + Word | Substituto | — | ~R$0 marginal | Status quo | Sem evidência coletada |

## Leads (rodada 2)
1. **Mesh "app Mesh"/Ensaia:** localizar o app nas lojas (buscar "Mesh" com desenvolvedor Mesh Engenharia na Play/App Store; checar links em meshengenharia.com e descrições de vídeos recentes do YouTube @MeshEngenharia), preço/assinatura, data de lançamento, nº de downloads e reviews; confirmar se o Ensaia cobre checklist de cabine primária (Conforme/NC/NA) ou só ensaios. É o concorrente mais próximo da proposta.
2. **GroundPRO:** obter preço real (checkout /checkout/:slug, página de vendas/webinar da Elétrica Academy, Instagram/YouTube) e prazo do "Checklists Online"; verificar se o "Laudo de Continuidade" já é usado (depoimentos). Risco de expansão para laudos de campo de SPDA.
3. **Incumbentes e genéricos pendentes:** Megger PowerDB (PowerDB Lite gratuito? — via megger.com/pt ou PDF/brochure; checar se aceita entrada manual para instrumentos Instrum/Minipa/Megabras), Doble; preços de Auvo, Field Control, Kizeo Forms (URLs corretas); reviews 1–3★ nas lojas de Checklist Fácil/Produttivo.
4. SafetyCulture → "Mitti": confirmar o que é o rebrand/produto (notícia oficial) e se o iAuditor continua.
5. Buscar "app relatório manutenção subestação", "software manutenção cabine primária", "laudo termografia app" para achar verticais BR menores.

## Procurado e não encontrado
- Preço público de Mesh Labs/app Mesh, GroundPRO, OMICRON PTM, Checklist Fácil, Produttivo.
- App da Mesh na busca da Google Play por "mesh engenharia" (só apps não relacionados).
- Página do Megger PowerDB (HTTP 403 via curl e WebFetch) — nenhuma afirmação sobre PowerDB é feita aqui (qualquer conhecimento prévio, ex. existência de "PowerDB Lite" gratuito, é crença não verificada).
- Doble: não pesquisado (orçamento).
- Preços de Auvo (auvo.com/precos e auvo.com.br/planos → 404), Field Control (/precos e /planos → 404), Kizeo Forms (403).
- Evidência de tração (downloads, nº clientes, vagas) de Mesh e GroundPRO com 2 fontes independentes — nenhuma tração está "verificada".
- Software BR específico de laudo de SPDA/NR-10/subestação além de GroundPRO e Mesh: a SERP trouxe apenas prestadores de serviço.
