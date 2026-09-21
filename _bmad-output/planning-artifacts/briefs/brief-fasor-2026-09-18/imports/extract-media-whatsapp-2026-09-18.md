# Extração de mídia — áudios e vídeos de WhatsApp (docs/media)

**Fonte:** `docs/media/` — 2 áudios PTT (.ogg) e 2 vídeos (.mp4), todos de 2026-09-18, 17h14–17h15
**Data da análise:** 2026-09-18
**Método:** transcrição com faster-whisper (modelo `medium`, pt-BR, CPU); frames extraídos a cada 3 s com ffmpeg; leitura visual dos frames. Transcrições brutas em `docs/media/transcricoes/`; folhas de contato e recortes em `docs/concorrentes/frames-reference-tool/`.

> **Aviso:** os dois vídeos são gravações de tela **sem áudio** (nível medido −91 dB), portanto só os dois PTTs têm fala. O conteúdo dos vídeos foi lido visualmente. O laudo mostrado no segundo vídeo contém dados reais de terceiros (razões sociais, CNPJs, nomes e registros profissionais); estão citados aqui só no que é necessário para a análise e não devem ser propagados a documentos públicos.

---

## 1. Áudio — `WhatsApp Ptt 2026-09-18 at 17.14.53.ogg` (25,7 s)

**Quem fala:** [ASSUNÇÃO] Bruno Matsui (Fasor Engenharia) para Matheus ("Piru" parece apelido do destinatário). Não há identificação explícita no áudio.

**Transcrição (limpa):**

> Fala Piru, tudo bem? Boa tarde. Olha aí, esse aí é um cara que tem um grupo aqui de engenheiros e tal, e esse cara tá desenvolvendo um softwarezinho desse aí que [igualzinho ao que] a gente falou, e tá vendendo pra galera dos grupos aqui. Olha aí como é que é mais ou menos, aqui ele passa bem rápido a estrutura, né? Vou te mandar o que gera depois aqui, ele mandou também o relatório pronto, como é que fica. Dá uma olhada aí, basicamente isso aí. **Só que a gente quer fazer um negócio mais top, né?**

Trecho incerto: "que golzinho a gente falou" no reconhecimento automático; leitura mais provável: "igualzinho ao que a gente falou".

## 2. Áudio — `WhatsApp Ptt 2026-09-18 at 17.15.42.ogg` (17,1 s)

**Transcrição (limpa):**

> Aí, pelo que eu vi, já tem uma meia dúzia de gente que veio do grupo que já tava fazendo com ele, usando esse software dele, né? Tanto que esse daí é um cara que mandou também falando que funciona, não sei o quê, e a galera já fica interessada, né? Porque, cara, isso [facilita] muito o processo em campo e também o pós, né?

Trecho incerto: o reconhecimento deu "fragiliza muito o processo em campo e também oposa"; pelo contexto (elogio ao software), a leitura mais provável é "**facilita** muito o processo em campo e também o **pós**" (o trabalho de escritório depois da visita). Registrar como incerto.

**O que os dois áudios dizem, em resumo:**

- Existe um **desenvolvedor-engenheiro dentro dos grupos de WhatsApp de engenheiros** que Bruno frequenta, vendendo um software de geração de laudo "igual ao que a gente falou".
- **Já há cerca de meia dúzia de usuários pagantes vindos do grupo**; um deles postou depoimento de que funciona, e isso gera interesse dos demais.
- O canal de venda é **boca a boca nos grupos de engenheiros**, com prova social de pares.
- Bruno reconhece o valor ("facilita muito o processo em campo e o pós") mas quer **"fazer um negócio mais top"** — o software visto é a régua mínima, não o alvo.

---

## 3. Vídeo — `WhatsApp Video 2026-09-18 at 17.14.28.mp4` (33,7 s, 796×874, sem áudio)

**Categoria:** tela de software concorrente/referência — gravação de tela (desktop, cursor de mouse visível) do app web **"Estudo de Carga e Demanda"**, rolando rapidamente pela estrutura do editor. Exemplo carregado com marca **RAAD Engenharia** (responsável "Eng. Eletricista Mohamed Salim, CREA 23.623/D-DF", data 05/09/2026, revisão 00) — provavelmente a empresa do próprio desenvolvedor.

**O que a tela mostra (na ordem da rolagem):**

1. **Barra superior:** título do produto; dois módulos: **"Memórias de Massa"** (ativo) e **"Recarga Veicular"** (estudo de carga para carregadores de veículo elétrico); botões **Logo · Fundo capa · Marca d'água · Salvar projeto · Salvar HTML** (há uma segunda linha de botões cortada).
2. **Editor de capa:** logo da empresa, título "ESTUDO DE CARGA E DEMANDA — RELATÓRIO TÉCNICO", três campos livres, Nº relatório, Revisão, Data, Responsável, Registro (CREA), e-mail de contato; imagem de fundo de subestação.
3. **Editor de seções numeradas** (ex.: 4 …, 5 GENERALIDADES, 6 METODOLOGIA): cada seção tem título editável, barra de texto rico (fonte, tamanho, B/I/U/S, alinhamento, listas, recuo, cor, marca-texto, desfazer/refazer, limpar formatação) e botões **+ Adicionar abaixo · Subir · Descer · Excluir**. Vêm com **texto padrão pré-escrito** (boilerplate de metodologia, generalidades, instrumentos). Dica na tela: a formatação "fica salva no projeto/HTML".
4. **Etapa "1 Identificação da memória de massa":** título/identificação, sequência no relatório, corrente nominal/proteção do disjuntor (A), cliente/contratante, instalação/empreendimento, local da medição. Cabeçalho de cada memória, ex.: "12.4. CONDOMÍNIO 1600 REG 90% · 1.023 registros · 201 colunas", com **Duplicar configuração** e **Excluir**; status "Memória configurada e gráficos gerados"; sub-etapas "1. Conferir dados · 2. Escolher grandezas".
5. **"Período total identificado na memória de massa":** início 21/08/2026 13:29:29, fim 28/08/2026 15:19:29, duração 7,08 dias; "critério aplicado: a memória completa é usada automaticamente".
6. **Etapa "3 Seleção das grandezas, fases e faixas PRODIST":** botões **Padrão automático V F-N + I · Selecionar todas · Limpar seleção · Agrupar automaticamente · Detectar tensões PRODIST**; tensões de referência fase-neutro 220 V / fase-fase 380 V com "Aplicar 220/380"; **Gerar gráficos desta memória / em todas as memórias**; chips de fase A B C N Geral; opções "Unir Ia, Ib, Ic e In em um único gráfico" e o mesmo para tensões; **tabela de mapeamento de colunas** do arquivo do analisador de energia (USAR · coluna original · nome exibido · fase · unidade · grupo de gráfico · PRODIST · nível BT<1k · TR 220) — linhas como DATA, HORA, Ua/Ub/Uc, Va, Va mín, Va máx, Vb…
7. **Etapa "4 Gráficos selecionados":** tabela de **faixas PRODIST** por fase (Adequada / Precária / Crítica, com contagem e %) e nota citando o Módulo 8 do PRODIST; gráfico de **corrente** Ia/Ib/Ic/In no período (1.023 registros) com anotações de mín/máx por fase e botão "PNG completo"; tabela de estatísticas (mínimo, data/hora do mínimo, médio, máximo, data/hora do máximo, amostras); gráficos de potência (Pt Con máx kW, Pc, Qa).
8. **Bloco de análise de disjuntor:** cartão visual "Disjuntor GERAL / Proteção 3.200 Ampères" com **três medidores de fase (R/S/T)** mostrando % da capacidade e corrente máxima, faixa "Dentro da capacidade considerada", "Máxima registrada 761,06 Ampères" e período. Abaixo, **"Configuração do disjuntor"**: identificação, corrente nominal/proteção (A), fator de segurança/reserva (%), limite técnico máximo (%), critério do período, coluna de corrente por fase, botão **Recalcular**. Depois, **cartões de KPI**: fase mais carregada, carregamento da capacidade considerada (%), carga máxima atingida, corrente nominal, fator de segurança (= A reservados), capacidade considerada, carga sobrando, limite técnico, registros no período, período analisado; e uma **linha com a fórmula explícita** ("Capacidade considerada: 600 A × (1 − 20%) = 480 A. Carregamento: 70,72 ÷ 480 = 14,73%. Saldo: 409,28 A"). Em seguida **"Observação técnica / preenchimento manual"** com um parágrafo técnico já **gerado automaticamente a partir dos números** (ex.: "O disjuntor possui corrente nominal de estrutura de 800 A, com unidade de proteção regulada para 600 A…"), campo "Índice / item (Ex.: 5.1 ou Nota 01)" e botão "+ Adicionar segundo disjuntor opcional".

**Condições do contexto:** ferramenta de escritório, desktop, mouse; nenhuma evidência de uso em tablet, de captura em campo ou de modo offline. "Salvar projeto / Salvar HTML" sugere **arquivo local único** (projeto embutido em HTML), sem nuvem.

## 4. Vídeo — `WhatsApp Video 2026-09-18 at 17.15.27.mp4` (33,7 s, 1280×608, sem áudio)

**Categoria:** o **laudo gerado** pelo mesmo software, aberto num visualizador de PDF em grade de 3 páginas por linha, rolando do início ao fim (numeração vista até ~p. 79). Cliente do exemplo: **Mega Instalações Elétricas Ltda** (Brasília-DF); contratante uma concessionária/SPE; responsável um técnico em eletrotécnica com CRT e TRT (não CREA/ART) — ou seja, o software também serve **técnicos**, não só engenheiros.

**Estrutura do laudo, como vista nas páginas:**

- **Página 1:** caixa destacada "DIRETRIZ TÉCNICA CENTRAL"; bloco do responsável técnico (nome, função, CRT, registro, TRT, cidade, data, revisão); tabela **"CONTROLE DO DOCUMENTO"** (documento, revisão, data, contratante + CNPJ, contratada + CNPJ, responsável, TRT, período do serviço).
- **Corpo, seções numeradas com texto corrido:** 2 Objetivo · 3 Resumo executivo e parecer preliminar (com **caixa vermelha "PARECER PRELIMINAR — AUMENTO DE CARGA NÃO LIBERADO"**) · 4 Escopo, abrangência e limitações · 5 Referências normativas (NR-10, NBR 5410, NBR 14039, PRODIST, NBR 17019) · 6 Metodologia · 7 Diagnóstico das instalações existentes (caixa amarela "CONDIÇÃO NECESSÁRIA") · 8 (monitoramento) · 9 Análise individual das proteções (9.1 QGBT novo — disjuntor 3.200 A; 9.2 Geral; 9.3 Geral 1.600 A; 9.4 Condomínio…), cada uma com parágrafo gerado a partir dos números (registros, máxima e fase, capacidade considerada, carregamento %, saldo teórico, ressalva "capacidade a jusante deve ser confirmada no As Built") · 11 Adequação à NR-10 e NBR 5410 (**tabela Tema / Requisito / Referência / Ação**) · 12 Estudos, inspeções e ensaios complementares · 13 **Plano de ação recomendado** (tabela **Prioridade P0 Imediato … P4 Final / Prazo / Ação recomendada**) · 14 Condições para aumento de carga · 15 Conclusão geral (15.1 síntese com **tabela-resumo por ponto**: ponto, ajuste, capacidade a 80%, máxima registrada, carregamento, saldo teórico; **matriz de risco** Categoria / Risco / Consequência potencial — térmico, limite a montante, proteção, curto-circuito, desequilíbrio, regulatório, operacional, contratual, segurança; 15.6 pontos identificados; 15.7 recomendações consolidadas) · **parecer final** em caixa destacada + assinatura.
- **Anexos:** tabelas de medição por ponto (tensão/corrente por fase); **certificados de calibração rastreável (RBC)** dos analisadores, colados como imagem; gráficos por ponto (Va/Vb/Vc, Ia/Ib/Ic, Pc, Qa…) com os cartões de disjuntor (três medidores) reproduzidos no PDF; "observação técnica" por ponto; **registro fotográfico**: cada foto vem com carimbo "Câmera | 21/08/2026, 13:12:23 | GPS: −15.79…, −47.88…" e uma **mini-tabela por foto** (Item / Valor / Un. / Status / Obs. — ex.: "Geral 1 · N/A · Conforme · PSS 147A"); páginas "Foto 5", "Foto 6" com fotos de quadros e analisadores instalados.
- **Identidade visual do cliente em todas as páginas:** logo, cabeçalho/rodapé com endereço, serviços e slogan, moldura decorativa; paginação.

---

## 5. Análise para o Brief

> **Correção do usuário (2026-09-18):** este software é uma **referência para o projeto**, não um concorrente. A leitura abaixo foi escrita antes dessa correção; onde diz "concorrente de categoria", leia "referência de produto". O brief e o addendum já refletem a correção.

### 5.1 O que é e o que não é

- **Não é** um concorrente direto do laudo de cabine primária: o produto visto faz **estudo de carga e demanda em baixa tensão** a partir de **memórias de massa** de analisadores de energia (arquivos TXT/CSV), com classificação PRODIST e análise de carregamento de disjuntores. Domínio diferente do MVP do Releng.
- **É** um concorrente de **categoria** ("gerador de laudo técnico com a marca da própria empresa, vendido a engenheiros de campo por um par"), e o exemplo mais próximo, até agora, do que o Releng quer entregar: dados → seções padrão → texto técnico gerado → gráficos/tabelas → fotos → plano de ação → parecer → PDF no layout da empresa.
- **Nenhum sinal** de tablet, captura em campo, offline, fichas por equipamento, checklist C/NC/NA, instrumentos com calibração cadastrada ou histórico por TAG. É uma ferramenta de **escritório**, alimentada por arquivo. O terreno "campo" continua livre.

### 5.2 Novidades para o Brief

1. **Nova categoria competitiva: o "dev do grupo".** Além de Mesh Labs, Minipa Link, GroundPRO e Inspekio, há desenvolvedores-engenheiros vendendo ferramentas de laudo **dentro dos grupos de WhatsApp de engenheiros**, com ~6 clientes já vindos de um só grupo e prova social por depoimento. Barreira de entrada baixa; adoção por confiança entre pares.
2. **Canal.** O Brief lista "Channel" como risco ("Releng has no audience of its own"). Os áudios mostram que **Bruno tem acesso a esses grupos** e que eles convertem por boca a boca. Isso é um canal candidato concreto (e barato), a registrar.
3. **Régua mínima elevada, na visão do parceiro.** "A gente quer fazer um negócio mais top": o parceiro de design já viu o que um desenvolvedor solo entrega (seções editáveis, texto gerado, gráficos, marca própria, PDF) e considera isso o piso.
4. **Padrões de produto que valem copiar/superar** (candidatos a addendum/PRD/UX, não ao Brief):
   - **Seções numeradas editáveis com texto padrão**, reordenáveis (Adicionar abaixo / Subir / Descer / Excluir) e texto rico — coincide com o *template composer* já previsto na UX.
   - **Texto técnico gerado a partir dos dados** (parágrafos de conclusão por disjuntor), editável; fórmulas mostradas explicitamente para auditoria.
   - **Identidade visual por empresa**: logo, fundo de capa, marca d'água, cabeçalho/rodapé.
   - **Fotos com carimbo de data/hora e GPS** e mini-tabela de status por foto.
   - **Tabela "Controle do documento"** (contratante/contratada com CNPJ, responsável, ART/TRT, período do serviço, revisão).
   - **Plano de ação com prioridade P0–P4 e prazo**, **matriz de risco** e **parecer em caixa destacada** — reforça o item "pontos de atenção com ação, prazo, prioridade e responsável" já no escopo.
   - **Certificados de calibração como anexo** (o Brief já prevê instrumentos com calibração; aqui é só imagem colada).
   - **Suporte a técnicos com CRT/TRT**, além de engenheiros com CREA/ART: o campo de registro profissional não pode assumir "CREA".
   - **Arquivo de projeto local (HTML)** como forma de portabilidade sem nuvem.
5. **Candidato à Vision:** "Estudo de carga e demanda" (e "recarga veicular") como **tipos de laudo futuros** no catálogo, se a Fasor fizer esse serviço [PERGUNTA EM ABERTO: a Fasor faz estudos de carga com analisador? Bruno tem esse tipo de trabalho?].

### 5.3 Riscos e cuidados

- **Evidência indireta:** 34 s de rolagem rápida de tela, sem áudio; nome do produto, preço, licenciamento e modelo de venda **não aparecem**. Não confirmado se é web hospedado ou HTML local. Pedir a Bruno: nome do software, preço, quem é o desenvolvedor, link.
- **Dados de terceiros:** o laudo tem CNPJs, nomes e registros reais; manter esta extração fora de material público.
- **Diferenciação a proteger:** captura em campo no tablet, offline, fichas por equipamento com o mínimo de digitação e IA de captura — nada disso aparece no concorrente. Mas a **saída** (PDF/DOCX com marca própria, texto gerado, plano de ação) precisa ficar no mínimo no nível visto, ou o "mais top" de Bruno não se sustenta.

### 5.4 Sugestões de alteração no Brief (para o PM decidir)

- **What Makes This Different / Table stakes:** acrescentar "ferramentas de laudo feitas por desenvolvedores solo e vendidas em grupos de engenheiros (ex.: 'Estudo de Carga e Demanda', ~6 usuários de um grupo em set/2026)" à lista de referências; reforçar que **seções editáveis, texto gerado, gráficos e marca própria no PDF são piso**, não diferencial.
- **Open Questions and Risks → Channel:** registrar os grupos de WhatsApp de engenheiros de Bruno como canal candidato, com prova social por depoimento de pares como mecanismo observado.
- **Pending Inputs:** nome, preço e desenvolvedor do software visto; se a Fasor faz estudos de carga/demanda (candidato a tipo de laudo futuro).
- **Addendum → Competitive landscape:** nova subseção com a descrição do produto (seções 3 e 4 acima) e a lista de padrões de 5.2.4; **Revalidation dates:** pedir o material ao desenvolvedor / revisitar o grupo.
- **Vision:** citar "estudo de carga e demanda" entre os tipos de laudo candidatos, condicionado à resposta da pergunta aberta.
