---
title: 'Extrato das três pesquisas (mercado, domínio, competitiva) para o PRD do fasor'
created: '2026-09-19'
sources:
  - M = market-laudos-eletricos-em-campo-2026-09-18/research.md
  - D = domain-manutencao-preventiva-e-laudo-de-cabine-2026-09-18/research.md
  - C = competitive-laudos-cabine-primaria-2026-09-18/research.md
note: 'Citações no formato M[n], D[n], C[n] remetem ao apêndice de fontes do relatório correspondente. Qualificadores de confiança preservados do original.'
---

# Extrato de pesquisa para o PRD do fasor

**Como ler as citações:** `M[9]` = fonte [9] da pesquisa de mercado; `D[21]` = fonte [21] da pesquisa de domínio; `C[7]` = fonte [7] da pesquisa competitiva. Cada relatório numera suas fontes de forma independente.

**Placar de verificação dos originais:**
- Mercado: 15 afirmações-chave — 2 verificadas, 11 não verificadas, 2 contestadas.
- Domínio: 34 afirmações — 15 verificadas, 17 não verificadas, 2 contestadas.
- Competitiva: 5 verificadas, 23 não verificadas, 2 contestadas, 2 derrubadas. **Nenhum produto concorrente foi testado com login**; quase tudo vem de páginas públicas e de código de interface (JS) dos fornecedores.

---

## 1. Requisitos regulatórios e normativos

### 1.1 NR-10: dois textos dentro da janela do produto (confiança ALTA, fonte primária gov.br)

A Portaria MTE nº 737, de 29/05/2026 (DOU 01/06/2026), reescreve a NR-10. **Vigência do texto novo: 01/06/2027** M[1][2][3][4], D[1][3][5].
- Até **31/05/2027** vale o texto de 2004/2019 D[6] (lido em espelho Guia Trabalhista porque o PDF do gov.br já traz só o texto novo — *não verificado, confiança média-alta*).
- Única regra de transição além do prazo de 1 ano: DR (10.6.4 "e") em instalações existentes só a partir de **01/06/2028**. **Nada preserva PIEs ou laudos anteriores** D[1].

| Tema | Texto vigente até 31/05/2027 D[6] | Texto a partir de 01/06/2027 D[1][2] | O que impõe ao produto |
|---|---|---|---|
| Relatório de inspeção | **10.2.4 g**: "relatório técnico das inspeções atualizadas com recomendações, cronogramas de adequações, contemplando as alíneas de a a f" (**dentro do PIE**) | **10.7.11**: "relatório com indicação de medidas de prevenção a serem adotadas com respectivo plano de ação e cronograma de adequação" (**fora da lista de conteúdo do PIE**), exigido de **toda organização**, sem periodicidade definida | Plano de ação e cronograma como **dados estruturados**, não texto livre; a **base legal citada muda conforme a data de execução** |
| PIE | Só para "carga instalada superior a 75 kW" (10.2.4) | **10.15.6**: quem integra o SEP **ou** "realize[m] atividades em instalações elétricas com média e alta tensão", sob responsabilidade de PLH. **Fim do corte de 75 kW** | A partir de jun/2027 **todo dono de cabine** precisa de PIE → o laudo tem de ser exportável como peça do prontuário |
| Aterramento | 10.2.4 b: documentação das inspeções e medições de **SPDA e aterramentos** | **10.15.3**: documentação das inspeções e **medições dos sistemas de aterramentos elétricos** para toda organização (não cita SPDA) | **Bloco de medição de aterramento obrigatório em todo laudo de cabine** |
| Sistemas de proteção | 10.4.4: "inspecionados e controlados periodicamente" | **10.12.7**: "inspecionados, **testados** e controlados periodicamente", conforme as parametrizações de projeto | Base legal da **ficha de ensaio de relé** (50/51) |
| Ensaios de campo | Sem item específico | **10.12.9**: ensaios e testes de campo "sob responsabilidade de PLH e serem realizados por profissional autorizado" | **Separar responsável (PLH) de executor (autorizado)** no modelo de usuários e na assinatura |
| Instrumentos | Sem item específico | **10.12.6.1 c**: instrumentos "aferidos, calibrados e parametrizados, quando aplicável" | Cadastro de instrumento com dados de calibração |
| Desenergização | **10.5.1** — 6 passos: seccionamento → impedimento → constatação → aterramento → proteção → sinalização | **10.13.1 a–g** — 7 passos: seccionamento → constatação → impedimento → constatação + aterramento temporário → proteção dos energizados **e contra arco elétrico** → sinalização → **delimitação da área** | A seção de segurança/recomendações do laudo **depende da versão da norma**. O modelo atual FO.SERV-03 cita o 10.5.1 e **fica desatualizado em jun/2027** |
| Religação | 10.5.2 | 10.13.2 | Checklist de religação versionado |
| Classe de tensão | "AT" = tudo acima de 1.000 V CA (a cabine de 13,8–34,5 kV é "AT") | Cria **MT** (>1 kV até 36,2 kV); AT passa a ser >36,2 kV | O **rótulo da classe de tensão no laudo depende da data** |
| SEP/SEC | — | A cabine do consumidor está **depois da medição** → é **SEC**, não SEP | Treinamento aplicável é "Complementar de Média e Alta Tensão – SEC" (16 h) + Básico (40 h), reciclagem bienal (10.9.10). O curso "NR-10 SEP" que prestadores anunciam **não é o aplicável** D[2] |
| Autor dos documentos | 10.2.7: "profissional legalmente habilitado" | **10.15.7**: "elaborados por PLH"; PLH = formação oficial "e com registro no competente conselho de classe" (10.8.2) | Signatário = PLH, com conselho e registro |
| Formato | Sem item específico | **10.15.1**: documentação em **meio digital**, conforme a NR-1, **em português** | PDF e armazenamento digital são válidos |

Periodicidades que a NR-10 nova fixa (e que **não** são da instalação): ensaio dielétrico de ferramental, EPI e EPC **anual** quando não houver outra previsão (10.14.4.1); treinamento **bienal**, mínimo 16 h (10.9.10) D[2].

Outros itens do texto novo com efeito operacional D[2]:
- Procedimento de trabalho aprovado por PLH (rotina) **ou** análise de risco + **permissão de trabalho** (não rotina), com lista de envolvidos e autorizações, data e condições impeditivas; a PT **vale por turno** e é arquivada "de forma a permitir sua rastreabilidade".
- **Avaliação prévia no local**: havendo anomalia, "a operação não deve ser iniciada".
- Serviço em MT energizada **não pode ser individual**; supervisor designado para trabalho em equipe.
- Zonas: ZR/ZC/ZL — em 13,8 kV, Rr 0,38 m e Rc 1,38 m.
- SPDA sai da lista documental e fica como **medida de proteção coletiva (10.6.8)** M[1], D[4].

**Afirmação DERRUBADA — não usar como argumento:** o item **10.15.4 "d" do PIE trata de ensaios de isolação de ferramental, EPI e EPC**, e **não** de transformadores e disjuntores. A afirmação contrária caiu na verificação M[1]. Os itens corretos para o argumento de venda são **10.7.11** e **10.15.3**.

**Firmeza:** vigência, texto do 10.7.11 e os 7 passos do 10.13.1 estão **verificados** por fonte independente D[3][4][5]. A leitura do **texto antigo** (10.2.4, 10.5.1) vem de espelho — *não verificada, confiança média-alta* D[6].

### 1.2 ABNT NBR 14039:2021 (MT, 1,0 a 36,2 kV) — lida em cópia licenciada não oficial D[7]

- **8.2.1 Periodicidade:** "A periodicidade da manutenção deve adequar-se a cada tipo de instalação, considerando-se, entre outras, a sua complexidade e importância, as influências externas e a vida útil dos componentes." **Não há número.** *Verificado* por comentário técnico independente D[8].
  - "A NBR 14039 exige manutenção anual" é **falso** D[7][8]. Anual é prática de mercado D[17], M[19].
- **8.2.2 Escopo da preventiva** (esqueleto de checklist): cabos e acessórios ("sinais de aquecimento excessivo, rachaduras, ressecamento, fixação, identificação e limpeza"); estrutura e aterramento do conjunto de manobra; partes móveis ("estado dos contatos e das câmaras de arco… ajustes e aferições"); conexões flexíveis; e **8.2.2.4 "ensaio geral de funcionamento"** (simula comando, seccionamento, proteção e sinalização e confere ajustes de relés conforme o projeto).
- **8.1 Condições gerais:** instrumentos calibrados "conforme orientação do fabricante"; manobras com autorização de **BA5** e feitas por **no mínimo duas pessoas, uma delas BA5** (8.1.6); anomalias — sobretudo disparo de proteção sem causa conhecida — comunicadas a um BA5 (8.2.3.3).
- **7.1.5 Laudo:** a norma só exige laudo explícito na **verificação final** de instalação nova, ampliada ou alterada, feito "por profissional devidamente habilitado e/ou credenciado". **Não há formato normativo de laudo de preventiva.**
- **7.3.1 Ensaios mínimos:** continuidade (fonte 4–24 V, corrente ≥0,2 A); resistência de isolamento **sem limiar em MΩ** (remete ao componente ou ao fabricante); tensão aplicada; resistência de aterramento; ensaios recomendados pelo fabricante (óleo, fator de potência, cromatografia, tempos de operação de disjuntor, resistência de contato); ensaios de funcionamento.
- **Revisão em curso** alinhada à IEC 61936-1, com ensaio VLF de cabos, publicação anunciada para 2026; até 18/09/2026 nenhuma nova edição encontrada, mas **o catálogo ABNT não foi consultado**. *Não verificado* D[9][51].

### 1.3 PRODIST / ANEEL — **lacuna de pesquisa**

Nenhum dos três relatórios analisou o PRODIST. A **REN ANEEL 1.000/2021** (responsabilidade e inspeção das instalações do consumidor) consta explicitamente como **questão em aberto** no relatório de domínio. Não há, portanto, nenhuma exigência do PRODIST sustentada por evidência nesta base. Não inventar requisito a partir disso.

### 1.4 Concessionárias (três lidas; Enel, Light e Neoenergia **não** foram lidas) D[10][11][12]

| Concessionária | Exigências com efeito no laudo/fluxo |
|---|---|
| **EDP (2023)** D[10] | Laudos com documento de responsabilidade técnica **na ligação/vistoria**: continuidade, isolamento, tensão aplicada, aterramento, ensaios de rotina do transformador, intertravamento e ajustes de relés. **Lacra os relés**; proíbe alterar a graduação "sem prévia autorização". Aviso de desligamento programado com **≥5 dias úteis**. Manutenção "frequente", sem intervalo |
| **Cemig ND-5.3** D[11] | O RT ajusta o relé e a Cemig pode exigir **verificação em campo**. Religação após >6 meses desligada exige **laudo de óleo com menos de 6 meses**. Subestação sem relé secundário deve ser convertida quando o disjuntor de MT passar por manutenção ou troca |
| **CPFL GED-2855 (v35, 12/06/2026)** D[12] | Terra **≤10 Ω em solo úmido / 25 Ω em solo seco** (6.6.1.3). Desligamento programado com **≥15 dias**. **Lacres** nos compartimentos de energia não medida, rompimento solicitado à CPFL. **O consumidor declara a "periodicidade de revisão dos estudos de proteção… em conformidade com os itens 10.4.4 da NR-10 e 8.2 da NBR-14039"**. Ajustes de relé informados por **laudo técnico com ART**. Para energizar: isolamento **>30 MΩ (15 kV)** e **>50 MΩ (25 e 34,5 kV)** |

**Achado verificado (3 distribuidoras):** as concessionárias exigem ensaios e laudos **na ligação**, **não** um relatório periódico de manutenção enviado à distribuidora D[10][11][12].

### 1.5 ART, CREA/CFT e quem assina

- **Res. CONFEA 1.137/2023** (revogou a 1.025/2009) D[31][32], M[6]:
  - Todo contrato, escrito ou verbal, exige ART (art. 3º), **registrada antes do início** da atividade (art. 27).
  - Contrato global com ordens de serviço: **uma ART inicial + uma ART vinculada por OS** (art. 27 §2º).
  - **ART múltipla é facultativa**: cobre "contrato cuja prestação do serviço seja caracterizada como periódica", lista as atividades do mês e é registrada **até o último dia útil do mês subsequente** (arts. 33–37).
  - Art. 6º parágrafo único: "Serão reputadas como válidas **assinaturas eletrônicas, bem como documentos digitais, na forma da lei**".
  - **A resolução NÃO diz o que o laudo deve conter.** Número da ART/CREA impressos no laudo são **convenção de mercado**, não exigência textual.
  - *Verificado* quanto à revogação, ART múltipla periódica e prazo.
- **Res. CONFEA 345/1990** D[41] (*não verificado — espelho do IBAPE; site do CONFEA não respondeu; a Res. 1.073/2016 não foi obtida*): "VISTORIA é a constatação de um fato… sem a indagação das causas"; "PERÍCIA… apuração das causas"; "**LAUDO é a peça na qual o perito, profissional habilitado, relata o que observou e dá as suas conclusões**". Atividades privativas de engenheiro, exigindo ART "**para sua plena validade**" (arts. 2º a 4º).
- **Técnico em eletrotécnica — CONTESTADO:** Res. CFT 074/2019, alterada pela 094/2020, dá ao técnico "Emitir laudos técnicos… de equipamentos de manobra ou proteção", manutenção de "subestações particulares" e ensaio de relés, com limite de "**até 800 kVA, independentemente do nível de tensão**" para "projetar e dirigir"; responsabilidade registrada por **TRT** D[42][43][44]. O Decreto 90.922/1985 dá ao técnico execução e coordenação da manutenção, mas só "**assistência**" em vistoria e perícia D[45]. O **CONFEA contesta** a resolução do CFT D[49]. → O produto deve **aceitar ART ou TRT** e o conselho (CREA/CRT) **sem decidir quem pode assinar**.
- **Prática em edital:** ART "no início dos serviços", já paga, atividade "**Manutenção – Subestação abrigada de energia elétrica**", **uma ART para duas subestações** D[47].

### 1.6 Assinatura eletrônica D[33][34][35][38]

- **Lei 14.063/2020** só torna obrigatória a assinatura **qualificada (ICP-Brasil)** nos casos que lista; **laudos de engenharia não estão entre eles**.
- **MP 2.200-2** dá **presunção de veracidade** só à ICP-Brasil; outras assinaturas valem se "admitido pelas partes".
- **NR-01, item 1.6.2**: documentos das NR em meio digital "**com certificado digital… ICP-Brasil**", preservando autenticidade, integridade e rastreabilidade (1.6.4).
- CREA-RS aceita assinatura **avançada gov.br** para documentos enviados a ele — isso **não** é regra sobre laudos.
- **Inferência do relatório:** para laudo que compõe o **PIE do cliente** (documento de NR), **ICP-Brasil é o caminho mais defensável**.

### 1.7 Guarda / retenção D[2][39][40]

- **Nenhuma norma de SST ou do CONFEA fixa prazo.** A NR-10 pede documentação "**atualizada e sempre disponível**".
- Prescrição geral **10 anos** (CC art. 205); reparação civil **3 anos** (206 §3º V); CDC **5 anos** a partir do conhecimento do dano (art. 27).
- **Inferência do relatório:** guardar **laudo e dados brutos por ≥10 anos**.

### 1.8 Calibração de instrumentos D[36][37][2][7] — regra firme e contraintuitiva

- INMETRO: "**A periodicidade dos serviços de calibração é definida pelo proprietário do instrumento**". **Não existe "validade" regulatória do certificado de calibração.** *Verificado.*
- NR-10 nova (10.12.6.1 c): instrumentos "aferidos, calibrados e parametrizados" conforme regulamento, fabricante **ou critério do PLH**.
- NBR 14039 (8.1): "conforme orientação do fabricante".
- **Nenhuma fonte exige laboratório RBC** (acreditado INMETRO/Cgcre); os dois editais lidos também não exigem D[46][47].
- **Consequência declarada:** o app registra certificado, data, laboratório e a **política de intervalo do dono**; **alerta de vencimento sim, bloqueio não**.

### 1.9 SPDA e NBR 5419:2026

- Publicada em **10/03/2026**, transição de **180 dias** M[14][15] (*confiança alta*).
- Atribuído à nova edição, **por blogs de prestadoras, sem confirmação independente** (*confiança média-baixa, não verificado*) M[16], D[13]: inspeção **anual** para áreas classificadas e serviços essenciais e **a cada 3 anos** para as demais estruturas; **continuidade** substitui a medição de resistência de aterramento na verificação do SPDA.
- A NBR 5419:2015 **já retirou** os 10 Ω, que eram só "recomendação" em 2005 D[14][15]. *Verificado.*
- SPDA saiu da lista documental da NR-10 (fica em 10.6.8) M[1], D[4]. A NR-10 continua falando em "medições" de aterramento → **o laudo deve permitir os dois tipos: continuidade e resistência**.

### 1.10 Bombeiros e seguradoras — não usar como obrigação

- **CONTESTADO:** "o Corpo de Bombeiros de SP exige laudo de SPDA autônomo". A **IT 41/2025 (CBPMESP)** trata da inspeção de instalações de **baixa tensão** e inclui a conformidade do SPDA como **item de checagem**, com ART M[17][18]. A exigência para o AVCB é **indireta**.
- **Seguradoras:** a exigência de laudo elétrico/termografia aparece **só em páginas de prestadores**; nenhum documento de seguradora encontrado D[18]. **Não usar como argumento de venda sem apólice real em mãos.**

### 1.11 Obrigatório × prática de mercado (tabela de fechamento) D, seção 1.5

| Item | Situação | Fonte |
|---|---|---|
| Relatório de inspeção com plano de ação e cronograma | **Obrigatório** (10.2.4 g hoje; 10.7.11 a partir de jun/2027) | D[6][1] |
| Documentação de inspeção e **medição de aterramento** | **Obrigatório** | D[6][2] |
| Teste periódico dos **sistemas de proteção** | **Obrigatório**, sem intervalo definido | D[6][2] |
| PIE para dono de cabine | Hoje só >75 kW; **obrigatório para todo dono de cabine** a partir de jun/2027 | D[6][2] |
| Laudo por profissional habilitado, com ART | **Obrigatório** na verificação final (NBR 14039 7.1.5); documentos do PIE por PLH; ART em todo serviço contratado e "para sua plena validade" | D[7][2][31][41] |
| Periodicidade **anual** (e termografia/DGA semestrais que alguns prestadores publicam) | **Prática de mercado** | D[17][16][7] |
| Laudo exigido por **seguradora** | **Alegação de mercado, sem prova** | D[18] |
| Relatório periódico enviado à **concessionária** | **Não encontrado** nas três distribuidoras lidas | D[10][11][12] |
| Formato/estrutura do laudo de preventiva | **Não existe formato definido em norma** | D, sumário executivo |
| Prazo de guarda | **Nenhum prazo normativo**; inferência ≥10 anos | D[2][39][40] |
| Calibração RBC | **Não exigida por nenhuma fonte** | D[36][46][47] |

---

## 2. Conteúdo técnico do domínio (substância de engenharia do laudo)

### 2.1 Princípio dos critérios de aceitação (pilar do modelo de dados)

- A norma brasileira de instalação (**NBR 14039**) **não traz limiares numéricos** para isolamento nem para contato D[7].
- A referência mais completa encontrada é a **ANSI/NETA MTS-2019**, lida em **espelho não autorizado** D[21] (*alta confiança no texto*). **Existe a MTS-2023, não conferida** → citações NETA marcadas como possivelmente desatualizadas.
- Os limites são: valor do fabricante, tabela "representativa", ou comparação com **ensaio anterior**/**polos semelhantes**.
- A diferença entre critérios chega a **duas ordens de grandeza** (NETA 5.000 MΩ × CPFL 30 MΩ) D[21][12]. **Não se achou nenhuma fonte para o critério fixo de "400 MΩ"** que circula no mercado.

### 2.2 Resistência de isolamento (megôhmetro) D[21][20][12]

| Equipamento | Tensão mínima de ensaio | Mínimo recomendado a 20 °C | Fonte |
|---|---|---|---|
| Aparelhos/sistemas classe 15 kV (disjuntor, chave, cabo) | 2,5 kV CC | **5.000 MΩ** | NETA MTS-2019 Tab. 100.1 |
| Classe 25 kV | 5 kV CC | **10.000 MΩ** | idem |
| Classe 34,5 kV | 5 kV CC | **100.000 MΩ** | idem |
| Transformador, enrolamento >5 kV | 5 kV CC | **5.000 MΩ (óleo) / 25.000 MΩ (seco)** | NETA Tab. 100.5 |
| TC, secundário e fiação | 1 kV CC, 1 min | Tab. 100.5 | NETA §7.10.1 |
| Fiação de controle do disjuntor | 500 V ou 1.000 V CC | **≥2 MΩ** | NETA §7.6.3 |
| Energização (CPFL) | não especificada | **>30 MΩ (15 kV); >50 MΩ (25/34,5 kV)** | GED-2855 D[12] |

- **A edição importa:** a NETA **ATS-2007** traz 20.000 MΩ para 25 kV e 15 kV CC para 34,5 kV D[22]. A MTS-2019 confirma a tabela acima. *Verificado para a MTS-2019, com nota de edição.*
- Para **cabos**, a NETA avisa que os valores são "típicos" e que o critério definitivo depende de fabricante, comprimento e temperatura.
- **Índices** D[23] (Megger, 2006 — *janela vencida*): **PI** (10 min/1 min): <1 perigoso, 1–2 questionável, 2–4 bom, >4 excelente. **DAR** (60 s/30 s): 1,0–1,25 questionável, 1,4–1,6 bom, >1,6 excelente (a faixa 1,25–1,4 não tem classificação; a Megger chama os valores de "tentativos"). NETA pede para transformadores **PI ≥1,0**, comparado ao histórico D[21].
- **Correção de temperatura para 20 °C** (NETA Tab. 100.14, derivada da Megger) — *verificado*: isolamento em **óleo**: 25 °C = 1,40; 30 °C = 1,98; 40 °C = 3,95; 50 °C = 7,85. Isolamento **sólido**: 30 °C = 1,58; 40 °C = 2,50.
- **Regras de mercado derrubadas/qualificadas:** "1 MΩ/kV + 1" é o mínimo da **IEEE 43 para máquinas rotativas**, não para cabos, disjuntores ou transformadores D[23][24]; a própria Megger chama "um megohm por kV" de "**arbitrária**". "A tensão de ensaio de 15 kV é 5 ou 10 kV" — a NETA pede **no mínimo 2,5 kV CC**, e um edital da CESAN lista instrumentos de 1; 2,5; 5 e 10 kV D[30] → **a tensão aplicada é uma escolha a registrar**.

### 2.3 Resistência de contato (micro-ohmímetro)

- **Método (IEC 62271-1, ed. 2007; a de 2017 não foi conferida):** medir em CC "entre 50 A e a corrente nominal"; no ensaio de rotina o limite é **≤1,2 × Ru** (Ru = referência medida antes do ensaio de tipo) D[28]. *Não verificado.*
- **Critério de campo (NETA, disjuntor de MT a vácuo e chaves de MT):** não pode passar do topo da faixa normal do fabricante; sem dado do fabricante, "**investigate values that deviate from adjacent poles or similar breakers by more than 50 percent of the lowest value**" D[21] (mesma redação na MTS-2001 para BT D[50]).
- **Chaves com fusível:** investigar resistência de fusíveis que difiram entre si **mais de 15%** D[21].
- **Nenhuma norma fixa µΩ.** As referências aceitáveis são ensaio de fábrica, histórico e comparação entre polos e unidades D[27]. *Verificado.* O valor "50–200 µΩ" apareceu só em resumo de buscador e **foi descartado**.

### 2.4 Transformador D[21][27][30]

- **Relação de transformação (TTR):** desvio **≤0,5%** em relação à relação calculada ou às bobinas adjacentes (NETA). A **NBR 5356** dá **±0,5% ou 1/10 da impedância de curto-circuito, "a menor"**, em **todas as derivações (taps)**. *Verificado.*
- **Resistência de enrolamento:** corrigida pela temperatura, até **2% do resultado anterior** → **critério depende de histórico**.
- **Corrente de excitação (núcleo trifásico):** padrão esperado "**two similar current readings and one lower**".
- **Isolamento do núcleo:** **≥1 MΩ a 500 V CC**.
- **Buchas:** investigar FP com desvio **>50%** ou capacitância com desvio **>5%** em relação à placa (raro em 13,8–34,5 kV).
- **Visual/mecânico:** alarmes e trips de temperatura e nível, válvula de alívio de pressão, relé de gás (Buchholz).

### 2.5 TP e TC D[21][46]

- **TC:** IR a **1 kV CC por 1 min**; polaridade conforme marcação; erro de relação dentro da **IEEE C57.13**; curva de excitação conforme fabricante; **um único ponto de aterramento** do secundário.
- **TP:** erro de relação **≤1,2% e ±17,5 mrad** para uso geral; **≤0,1% e ±0,9 mrad** para faturamento.
- Classes de exatidão da **NBR 6855/6856: não obtidas**.
- Prática em edital: resistência ôhmica dos enrolamentos e isolação em TP/TC, mais **inspeção dos fusíveis do TP**.

### 2.6 Disjuntor de MT (NETA §7.6.3, vácuo) D[21]

- IR **por polo, fechado e aberto**; resistência de contato; **abertura do disjuntor por cada um dos relés de proteção**; verificação de **trip-free e antipump**; **integridade da ampola de vácuo** "in strict accordance with manufacturer's published data"; **tempo de contato**; leitura do **contador de operações antes e depois (as-found/as-left)**, que deve avançar um dígito por ciclo.
- Ensaio de tensão suportável é **opcional**; para classe 15 kV, Tab. 100.19 dá no máximo **20,4 kV CA / 28,8 kV CC** em campo.
- **Critérios de SF6 não foram obtidos.** Para PVO, ver óleo (2.8).

### 2.7 Relé de proteção secundário 50/51 D[21][29][30][47]

- **Função 50:** pickup e dropout. **Função 51:** pickup mínimo e tempo em **dois pontos da curva**.
- **Tolerâncias: as do fabricante do relé**, não um percentual genérico (confirmado por mala de teste brasileira CONPROVE — *verificado*).
- **Ajustes finais (as-left) iguais ao estudo de coordenação mais recente.**
- **Relés microprocessados:** baixar eventos e ajustes antes de testar; conferir **data e hora**.
- Prática em edital: "Testes e ensaios das funções 50/51 do relé" com teste da bobina de abertura; na CESAN, as funções **50/51/51G/27/46** terminam com "**simular desligamento do disjuntor em posição de teste**".

### 2.8 Óleo isolante D[25][21][26][30][46][47]

| Ensaio (Grupo 1, NBR 10576) | Método | Limite em serviço ≤72,5 kV, **ed. 2006** | NETA ≤69 kV |
|---|---|---|---|
| Rigidez dielétrica | NBR IEC 60156 (calota) | ≥40 kV | ≥40 kV (D1816, 2 mm) |
| Teor de água | NBR 10710 | ≤25 ppm (corrigido a 20 °C) — **CONTESTADO: 40 ppm na ed. 2017 segundo D[26]** | ≤35 ppm (a 60 °C) |
| Tensão interfacial | NBR 6234 | ≥22 mN/m | ≥25 mN/m |
| Índice de neutralização | NBR 14248 | ≤0,15 mg KOH/g | ≤0,20 mg KOH/g |
| Fator de perdas | NBR 12133 | ≤0,5% a 25 °C | 0,5% a 25 °C |
| Cor e aparência | NBR 14483 / visual | "Claro, isento de materiais em suspensão" | ≤3,5 |

- Outros equipamentos: **disjuntor PVO ≥30 kV (calota) ou ≥20 kV (disco)**; **transformador de instrumento ≥60 kV e ≤15 ppm** D[25].
- Contratação: CESAN (2019) exige os **seis ensaios do "Grupo 1" pela NBR 10576:2017** e **DGA com amostragem pela NBR 7070**; editais pedem "análise físico-química completa – NBR 10576" e "cromatografia gasosa – NBR 7070/7274" com **O₂, H₂, N₂, CO, CO₂, CH₄, C₂H₆, C₂H₂ e C₂H₄**. O resultado precisa dizer se o óleo "está aceitável ou se há indicação de falhas do tipo **arco elétrico, descargas parciais e sobreaquecimento**".
- **Consequência de fluxo:** o óleo é **resultado de laboratório que chega DEPOIS** do serviço de campo e precisa ser **anexado ou importado ao laudo**.
- **Em aberto:** limites de **DGA (IEEE C57.104-2019 / NBR 7274) não obtidos**; a tabela de 2017 da NBR 10576 **precisa ser conferida antes de virar critério no app**.

### 2.9 Aterramento D[27][12][14][13]

- **Método:** queda de potencial (**NBR 15749**). É preciso levantar a **curva**, não um número só: **posições das hastes, pontos da curva e valor no patamar**; a **regra dos 62%** é alternativa. *Não verificado; fonte secundária da norma.*
- **Limite:** nenhuma norma ABNT consultada tem valor **obrigatório** em ohms. A NBR 14039 "não define" e só "recomenda" 10 Ω segundo D[52] (*baixa confiança*). A NBR 5419 retirou o valor em 2015. **Onde existe, vem da concessionária** (CPFL: 10 Ω solo úmido / 25 Ω solo seco) **ou do projeto**.
- Modelo precisa de **condição do solo** e **referência do limite**; e aceitar **continuidade** (SPDA) além de resistência.

### 2.10 Cabos de MT D[21]

- **IR por fase, com as demais aterradas** (Tab. 100.1) e **continuidade da blindagem**: investigar acima de **10 Ω por 1.000 pés ≈ 32,8 Ω/km** (conversão do pesquisador).
- Ensaios de tensão suportável (CC, VLF ou 50/60 Hz) e diagnósticos (tan δ, descargas parciais) **escolhidos com o dono do cabo**.
- Tensões CC máximas de manutenção: 15 kV → **11 kV (nível 100%) ou 14 kV (133%)** (Tab. 100.6.1). *Confiança média: tabela truncada na extração.*

### 2.11 Resumo por ficha (mapa direto para o modelo de dados) D, 2.10

| Ficha | Medições com campos próprios | Tipo de critério |
|---|---|---|
| **Cabo de MT** | IR por fase (kV aplicado, MΩ, temperatura, MΩ corrigido), continuidade da blindagem | Tabela NETA ou fabricante; Ω/km |
| **Chave seccionadora** | Resistência de contato por polo e porta-fusível (µΩ, corrente em A), IR por polo, resistência dos fusíveis | Fabricante ou desvio >50% do menor; fusíveis com diferença ≤15% |
| **Disjuntor de MT** | IR por polo (aberto e fechado), contato por polo, fiação de controle, ampola (kV, duração, passa/falha), abertura por relé, trip-free/antipump, contador antes/depois, tempos (ms) | Fabricante, desvio entre polos, ≥2 MΩ, passa/falha |
| **Relé 50/51** | Ajustes encontrados/deixados, pickup e dropout, tempo medido vs. teórico em 2 pontos, tolerância do fabricante, abertura do disjuntor | Tolerância do fabricante; estudo de coordenação |
| **TP/TC** | IR, polaridade, relação/erro, excitação, ponto de aterramento | IEEE C57.13, fabricante |
| **Transformador** | IR entre AT, BT e terra (Tab. 100.5) + PI, TTR em todos os taps, resistência de enrolamento com temperatura, excitação, óleo (link para laudo de laboratório) | Absoluto (tabela), ≤0,5%, ≤2% vs. anterior, NBR 10576 |
| **Aterramento** | Método, distâncias, pontos da curva, valor no patamar, condição do solo, continuidade | Limite da concessionária ou do projeto |

**Fichas/blocos adicionais recomendados** (recomendação R6 do domínio): **relé 50/51** (NR-10 10.12.7, NBR 14039 8.2.2.4, editais — confiança alta), **para-raios**, **muflas/terminações**, **termografia** (feita **energizada, antes do desligamento**), **resultado de laboratório de óleo** (físico-química + DGA, anexado depois) e **ensaio geral de funcionamento** (confiança média para os demais).

### 2.12 Periodicidade da manutenção — consolidado

- **Nenhuma norma fixa periodicidade da preventiva** (NBR 14039 8.2.1 "adequar-se"; NR-10 "periodicamente" nos dois textos) D[7][2][6].
- **CPFL exige que o próprio consumidor declare** a periodicidade de revisão do estudo de proteção D[12].
- **Anual é prática de mercado** D[17], M[19]; há prestador publicando **termografia e DGA semestrais** D[16] (*baixa confiança, mercado*).
- Contratos institucionais podem ser mais frequentes: anexo de edital da **Unifesp** prevê manutenção **de 3 em 3 e de 6 em 6 meses** M[43] (*baixa confiança: só o trecho exibido na busca*).
- **NFPA 70B-2023 (EUA)** virou norma com intervalos ligados à condição do equipamento (ex.: **12 a 60 meses**) D[19] (*baixa confiança, só trechos*) — modelo de periodicidade baseada em condição, **não exigência no Brasil**.
- **Conclusão do relatório:** o laudo deve trazer a **próxima intervenção recomendada com justificativa do PLH**, não um "anual" fixo.

### 2.13 Fluxo de campo e papéis (etapa → registro) D, seção 4

| Etapa | O que acontece | Registro |
|---|---|---|
| Contratação | ART registrada **antes do início** (ou ART vinculada à OS) | ART nº, OS |
| Planejamento | Desligamento à concessionária (**CPFL ≥15 dias; EDP ≥5 dias úteis**); fim de semana; a contratada trata com a concessionária | Protocolo de desligamento |
| Planejamento de segurança | Procedimento aprovado por PLH (rotina) ou AR + **PT** (não rotina), com envolvidos, autorizações, data e condições impeditivas; PT **vale por turno**, arquivada com rastreabilidade | PT/AR (físico ou digital) |
| Chegada | Avaliação prévia; com anomalia "a operação não deve ser iniciada" | Registro da avaliação |
| Com energia | **Termografia antes do desligamento** | Termogramas |
| Desligamento | 10.5.1 hoje / 10.13.1 a partir de jun/2027; lacre rompido pela concessionária quando aplicável | Checklist de desenergização |
| Estado encontrado | **Ensaios as-found antes da limpeza**; contador de operações antes e depois | Valores as-found |
| Execução | Limpeza, reaperto, inspeção visual por equipamento, ensaios elétricos, coleta de óleo | Fichas por equipamento, fotos |
| Fechamento técnico | **Ensaio geral de funcionamento**; abertura do disjuntor por cada relé | Registro funcional |
| Religação | 10.5.2 hoje / 10.13.2 a partir de jun/2027 | Checklist de religação |
| Pós-campo | Resultados de laboratório (físico-química e DGA) chegam depois | Laudo do laboratório |
| Entrega | Laudo final com valores, anomalias, **ações corretivas com prazo**, melhorias, **inventário de equipamentos de MT**, fotos (com termografia), **ART**; histórico gráfico e declaração de risco (CESAN) | Laudo + ART |
| Aceite | Recebimento provisório e depois definitivo (setor público) | Termos |

- **Equipe:** mínimo duas pessoas nas manobras, uma **BA5**; supervisor designado; serviço em MT energizada não pode ser individual.
- **Não encontrados nas fontes:** tamanho típico da equipe e **duração do desligamento** (nem nos editais).

---

## 3. Estrutura do laudo (o que a pesquisa diz sobre as seções canônicas)

- **Não existe estrutura definida em norma brasileira** para laudo de preventiva de cabine. A NBR 14039 só exige laudo na verificação final (7.1.5) D[7]; a Res. CONFEA 1.137/2023 **não diz o que o laudo deve conter** D[31].
- **Modelo de referência interno:** **FO.SERV-03**, o formulário de laudo da própria Fasor (o brief o define como alvo de fidelidade). Ponto conhecido: sua **seção 5 cita o 10.5.1** e ficará desatualizada em jun/2027 D, R1.
- **Requisitos de relatório de ensaio — NETA Test Report Guide** M[7] (*confiança alta*): valores **as-found/as-left**, **valores de referência**, **condições ambientais**, **dados de placa**, **data "para tendência histórica"**, **análise** e **recomendações**.
- **Seções observadas no laudo do concorrente Mesh** (código público, *confiança média*) C[7]: Identificação; Relação de equipamentos e dados de placa; Fichas por equipamento e ensaio; Ocorrências identificadas; Registro fotográfico; Referências e critérios; Anexos; Objetivo; Condições; Análise técnica; Conclusão e recomendações. **Sumário ainda pendente** no produto deles.
- **Entregáveis convergentes em dois editais públicos independentes** D[46][47] (*confiança alta*): ensaios por equipamento; **ações corretivas com prazo**; fotos **com termografia**; **inventário** de equipamentos; **ART**. A CESAN acrescenta **gráfico histórico** e **declaração de risco** D[30].
- **Convenção C/NC/NA** (conforme / não conforme / não aplicável): usada em checklist de campo, **sem fonte normativa encontrada** D, glossário.
- **Nomenclatura legal a respeitar** (Res. CONFEA 345/1990) D[41]: *vistoria* = constatação de fato sem indagar causas; *perícia* = apuração de causas; *laudo* = peça em que o profissional habilitado relata o observado e dá conclusões.

---

## 4. Mercado

- **Recomendação central da pesquisa de mercado:** construir a **ferramenta interna agora**, focada em **laudo de manutenção preventiva de cabine primária de MT**, e **adiar o investimento em SaaS** até ter (a) a medição do tempo economizado na Fasor, (b) preço e escopo reais do Mesh Labs, (c) conversas com 5 a 10 empresas semelhantes.
- **Tamanho do mercado alcançável NÃO foi quantificado.** Os números são **tetos**:
  - **~202 mil UCs do Grupo A** (MT/AT), com **48 mil+ no mercado livre** em 2024 — **fonte única ABRACEEL com dados ANEEL, não verificado, já vencido** (rechecar previsto para 2026-01) M[8][9]. Das 31.430 que comunicaram intenção de migrar até jul/2024, **95% com demanda abaixo de 500 kW** M[10] → base formada por consumidores **pequenos e médios** de MT.
  - **CNAE 4321-5/00** (instalação e manutenção elétrica): **325.942 empresas ativas**; **CNAE 7112-0/00** (serviços de engenharia): **155.543**; **SP ≈ 28%** nos dois. Sem corte por porte; provavelmente muitas MEI. *Não verificado* M[11][12].
  - **Engenheiros eletricistas: 116.185** (CONFEA, ~2021) — **CONTESTADO**; circulam 128.576 e ~180 mil sem fonte aberta; **claim já vencido** M[13].
  - **Estimativa derivada, não verificada:** se toda UC do Grupo A tivesse cabine com preventiva anual, seriam **até ~200 mil laudos/ano** — teto, não demanda.
- **Quem produz o laudo:** empresas prestadoras de preventiva que entregam "laudo técnico final com plano de ação" M[41][42]; engenheiros eletricistas com CREA que assinam com ART M[6].
- **Quem demanda:** donos de cabine (indústria, prédios comerciais, instituições).
- **Por quê:** NR-10, sobretudo a partir de jun/2027; concessionária e seguradora (*baixa confiança*); AVCB de forma **indireta**.
- **Segmento inicial mais promissor:** **PMEs de engenharia que fazem preventiva de MT em clientes corporativos** — o perfil da própria Fasor (dor recorrente, valor alto por serviço, laudo longo e padronizado). Menos promissores: engenheiro autônomo (volume), equipes internas de indústria (público provável de fornecedores estabelecidos como a OMICRON), quem só precisa de checklist (apps genéricos).
- **Disposição a pagar / referências de preço:**
  - **Nenhum concorrente vertical ou de campo brasileiro publica preço** (Mesh à época do relatório de mercado, GroundPRO, OMICRON, Checklist Fácil, Produttivo, Auvo) M[21][23][24][30][31][45] — **corrigido pela pesquisa competitiva**: a **Mesh publica R$ 1.397/ano** e a **Minipa Link publica R$ 60–180/mês** C[3][58].
  - **AltoQi Builder** (projeto): assinatura anual **R$ 2.964 a R$ 8.244 por membro**; módulo SPDA só a partir de **R$ 5.484/ano** M[35] → engenheiros brasileiros já pagam assinatura por software técnico.
  - Apps globais de formulário: **US$ 24–49 por usuário/mês** M[33][34].
  - **Faixa-âncora inferida para a categoria (baixa confiança):** **R$ 100 a R$ 300 por mês por empresa**; cobrar mais exige **provar horas economizadas por laudo** C, R6.
  - Sinais de resistência à assinatura (revenda de "licença vitalícia", reclamações) — só os **títulos** das páginas foram vistos M[36]. *Baixa confiança.*
- **Canal de venda:** os verticais vendem **pela própria escola** — Mesh (43,7 mil inscritos no YouTube; "mais de 2.200 alunos" autodeclarado) e GroundPRO/Elétrica Academy (turmas e webinars) M[22][23][39][40]. Não se achou exemplo de pacote curso + SaaS fora desses dois. **O fasor não tem essa audiência** C, insight 4.
- **Benchmarks de SaaS PME no Brasil** (fonte única, agregador sem metodologia): **CAC R$ 3–12 mil; churn mensal 3–7%** M[37]. *Baixa confiança — o próprio relatório diz "não usar para planejar".*
- **Barreiras de adoção:** status quo Word/Excel a custo adicional quase zero (pacote de 6 modelos por **R$ 49,90** C[70]); ausência de canal; preço-âncora baixo dos verticais; falta de prova de economia de tempo.

---

## 5. Concorrentes

### 5.1 Mesh Labs / Mesh Engenharia — **a ameaça principal (alta)**

- **Quem é:** MESH TREINAMENTOS LTDA, Belo Horizonte/MG, CNPJ aberto em 2019, **CNAE principal de treinamento** C[6][18]. App publicado na Google Play pela conta "**BruLabs**" (id `com.meshengenharia.labs`) C[1][5], M[20]. LinkedIn indica **2 a 10 funcionários** e ~32 mil seguidores C[17]. Fundador citado: Hilton Rocha C[14].
- **Números de autoridade divergentes entre as próprias páginas** (*confiança baixa para qualquer um*): "4.900+ engenheiros formados", "1.392 subestações mantidas", "1.295 ARTs" C[2]; "+2.800 alunos", "+3.500 assinantes" C[14]; "+3.500 alunos", "+8.400 profissionais impactados" numa página ainda com "Lorem Ipsum" C[15]. O "2.200+ alunos" citado antes **não foi reencontrado**.
- **Plataforma:** suíte **web por assinatura** — "Uma assinatura. 8 ferramentas." C[3]. Ativas: **Ensaia** (campo e laudo), **Elettra** (curto-circuito), **Trip** (ensaio de relés), **Simula**, **Laboratório Virtual**. Em breve: **Aterra** (Wenner/Schlumberger + memorial PDF/Word), **Equipa** (calibração e frota de instrumentos, saída/devolução de maletas), **SELetiva** C[3][11][12]. **App só Android**, de celular; **nenhum app iOS** da Mesh/BruLabs C[1][19]. O app "não faz nada sem uma conta criada na web" C[6].
- **Fluxo Ensaia:** preparar no navegador → registrar no Android → **"o laudo sai depois, no navegador"** C[2].
- **Escopo de equipamentos: "Hoje são seis"** — chave seccionadora, disjuntor, TC, TP, transformador de potência e cabo C[2]. **Fora da Ensaia:** para-raios, malha, SPDA de manutenção, termografia, painéis; **ensaio de relés fica em outra ferramenta (Trip)** C[13].
- **Captura:** offline-first ("cada medição… cada foto… é gravado na hora, no próprio aparelho"); **leitura de placa por IA** (exige internet; usa Google Gemini com OpenAI de reserva) C[2][6]; anotação por voz; fotos e áudios anexados ao equipamento ou ao ensaio; **correção por temperatura referida a 20 °C**; histórico por equipamento; veredito normativo no campo C[1][2].
- **Instrumentos:** cada medição registra o instrumento com **número de série** C[7]. Anuncia "Integração oficial, autorizada pela Megabras" por Bluetooth com **14 modelos "no lançamento"**, mas a política de privacidade restringe o Bluetooth ao "**megôhmetro**" — **EM DISPUTA**, não se sabe o que funciona hoje C[2][6]; **o site da Megabras não menciona a Mesh** C[24]. Outras marcas entram por digitação C[1].
- **O laudo (código público, *confiança média em toda esta subseção*, sem teste de uso)** C[7][8]:
  - **Um documento por atividade** (`origin: insp`, formato `mesh-complete-report`, modelo `ensaia-activity`), reunindo vários equipamentos; exemplo embutido: "Relatório de inspeção e ensaios — Subestação Oeste", preventiva anual em 13,8 kV, com TR-01 e DJ-04 no mesmo documento.
  - **Seções:** Identificação; Relação de equipamentos e dados de placa; Fichas por equipamento e ensaio; Ocorrências identificadas; Registro fotográfico; Referências e critérios; Anexos; Objetivo; Condições; Análise técnica; Conclusão e recomendações.
  - **Marca:** capa com nome e logotipo da **executante** ("Sem ele, a capa sai só com o nome da executante"); logotipo do cliente, cor de destaque, cabeçalho e rodapé.
  - **Saída:** "Exportar PDF", "Exportar **DOCX**" e "Baixar pacote (ZIP)" com os originais de ART e certificado; **revisões emitidas e congeladas** no histórico.
  - **Lista de pendências antes da emissão:** "ART do responsável técnico"; ensaios não realizados ("Ausência de reprovação não é aprovação"); **"Calibração dos instrumentos não é registrada no sistema — Anexe o certificado ao pacote"**. Nos exemplos, **os itens não bloqueiam a emissão**.
  - **Não aparece:** **sumário** ("chega quando o modelo tiver seção de sumário"); **NR-10**; "pontos de atenção"; **plano de ação com prazo**; **checklist C/NC/NA**; **termografia**. O mais próximo é "Ocorrências identificadas" + "Conclusão e recomendações". *Ausência em código minificado não prova ausência no produto.*
  - **Chave de liberação:** o módulo de relatórios depende de `reports_enabled` no servidor C[9] — não se sabe se está ligado para todos os assinantes.
  - **Duas hipóteses anteriores caíram (correção de rota):** a de laudo só por equipamento e a de que não haveria marca da executante nem ART.
- **Preço (fonte primária, confiança alta):** **R$ 1.397/ano de pré-lançamento** (≈ **R$ 116/mês**), ou **12 × R$ 144,48** na Hotmart, com acréscimo C[3][4]. **Alunos Mesh têm 50% de desconto.** "**O preço sobe a cada ferramenta lançada.**" **Sem plano gratuito, sem teste grátis, sem plano mensal**; arrependimento em 7 dias C[5]. Termos: a **empresa é titular** da assinatura e "administra as equipes"; cobrança por Asaas ou Hotmart; "**Cada plano pode ter limite de quantidade de uso (por exemplo, número de laudos…)**" C[5]. Responsabilidade técnica: "A decisão final, a assinatura, a ART e a responsabilidade técnica… são do profissional ou da empresa… **não somos os autores dos seus laudos**".
- **Canal:** a própria escola — produtor Hotmart é a MESH TREINAMENTOS; cursos dão 1 ano de "Plataforma Mesh de Estudos", renovação R$ 997–1.197 C[20] (*baixa confiança, termo de 2023*). YouTube @MeshEngenharia com **43,7 mil inscritos**, voltou a publicar em ago/set 2026 com vídeos de megôhmetro **que não citam o app** C[16].
- **Trajetória/timing:** termos e privacidade de **30/08/2026**; evento "Desafio dos Testes Elétricos" com aulas de **08 a 10/09/2026**; app **versão 1.0.0**, atualizado em **09/09/2026**. **Lançou há duas semanas** em relação à pesquisa (18/09/2026). Roteiro: QR code e NFC "ainda não disponível"; Aterra; Equipa; SELetiva; **SPDA e Estudos de Proteção aparecem como prévia no código** C[9]. Nenhuma vaga encontrada. Cadência de versões **não mensurável** (duas semanas de histórico).
- **Tração:** **1 mil+ downloads, 13 avaliações 5,0**, concentradas em **10–12/09/2026**, logo após o evento; sem nenhuma crítica e sem resposta do desenvolvedor; uma avaliação diz "IREI GANHAR O INSTRUMENTO DE ENSAIO, TENHO FÉ" (sugere sorteio no evento). **É sinal de audiência de lançamento, não de uso** C[1][9]. **Sem perfil no Reclame Aqui** C[72].
- **Pontos fortes:** laudo consolidado por atividade com marca da executante, PDF+DOCX+ZIP, revisões congeladas, offline-first, IA de placa, histórico por equipamento, preço baixo e público, audiência própria, roteiro amplo.
- **Lacunas:** sumário pendente; sem plano de ação com prazo; sem C/NC/NA; sem NR-10 explícita; sem termografia; **calibração não registrada**; só 6 tipos de equipamento; **só Android/celular**; relés em ferramenta separada; **conflito de canal** — a Mesh também vende serviços de engenharia (estudos, projetos de cabine, comissionamento) e declara "1.392 subestações mantidas", concorrendo em parte com as prestadoras que quer como clientes C[2][14] (*inferência*).

### 5.2 Minipa Link (Elecore LLC, marca Minipa — fabricante de instrumentos) — ameaça média

- **Oferta:** app horizontal de serviço de campo C[57]: fotos e medições por **Bluetooth de instrumentos Minipa**; checklists com "**biblioteca NBR**"; "**Relatórios com IA**"; sincronização offline; promessa "**envie o relatório final pronto no mesmo dia**".
- **Subestações:** o menu "Pra quem serve" inclui **Subestações**; a página mostra um "Laudo de inspeção SE industrial — bay TR-01" com instrumentos, ensaios (relação de transformação, tan δ, resistência de contato, malha), fotos e **assinatura com CREA** C[60] (*alta confiança, mas é mockup de marketing*).
- **Relatório:** um por **projeto ou ordem de serviço**, montado em **editor de blocos** (capa, tabelas, fotos, checklists, assinaturas); **só PDF**; logo da empresa na capa; os ensaios são **checklists com "Exigir medição"**, e **não fichas estruturadas por equipamento de MT**; **nenhuma menção a ART nem a calibração**; para NBR e NR-10 os modelos são "pensados para inspeção elétrica; **você os adapta ao seu procedimento**"; Bluetooth só para multímetros, alicates e termômetros Minipa C[58][59][73][74][75].
- **Preço público** C[58]: **Grátis** (5 relatórios/mês); **Básico R$ 60/mês** (30 relatórios, ainda com **marca d'água Minipa**); **Intermediário R$ 120/mês** (3 usuários, sem marca d'água); **Máster R$ 180/mês** (200 relatórios).
- **Plataforma e tração:** Android desde **21/07/2026** com **10+ downloads**; iOS desde **07/09/2026**, **compatível com iPad**, **0 avaliações**. *Confiança alta de que a tração é quase nula* C[61][62].
- **Por que importa:** fabricante com canal de distribuição pode ganhar escala rápido; **já tem iPad**, que o fasor quer como plataforma principal.

### 5.3 Inspekio (GoStart Lab) — entrante, timing incerto

- **Pré-lançamento, "gratuito para um grupo fechado", 10+ downloads** C[64].
- **Discurso quase idêntico ao do fasor:** "**Funciona offline de verdade**" e "**laudo técnico profissional — sem planilha solta, sem Word**", em PDF ao fechar a OS.
- **É horizontal** (não vertical de MT). Preço e escopo de MT desconhecidos — questão em aberto.

### 5.4 GroundPRO (Elétrica Academy) — ameaça média, no SPDA

- **Oferta:** SaaS web de cálculo e memorial: SPDA (NBR 5419:2026), aterramento de subestação, estratificação do solo, DPS, diagnóstico de migração da norma. Memoriais exportam **Word e PDF**; personalização limitada a cor, nome, empresa e CREA; **não gera ART**; interface web a partir de 768 px C[25].
- **Módulo novo — "Laudo de Continuidade e Aterramento do SPDA"**, ausente da central de ajuda de 14/04/2026, identificado em código público (*confiança média*) C[28]: **offline-first** ("As fotos ficam no aparelho e sobem quando houver sinal") com **GPS**; **instrumento + certificado de calibração**, temperatura e umidade; ensaios de continuidade, resistência de aterramento, MPS e inspeção visual; **"Resumo das não conformidades e cronograma de adequação" com prazos imediato, 30, 90 e 180 dias e responsável**; Word e PDF; limite de **300 fotos por laudo**; **sem campo de logo no editor**; cita o item **10.2.4** da NR-10. **Data de lançamento não apurada.**
- **Preço:** só o **plano Gratuito** é público (1 usuário, 5 análises/mês, 50 MB, marca d'água, só SPDA e aterramento); "Branding personalizado" (= "Logo da empresa nos relatórios") é recurso pago; planos pagos **sem preço público**, todos com **teste de 14 dias** C[26][77].
- **Canal:** turma e webinar ("condição exclusiva para alunos do Webinar Prático"); curso de SPDA a **R$ 1.497** incluindo "Licença Vitalícia" de outra ferramenta e um **modelo de Laudo de SPDA em Word** C[27][29].
- **Roteiro:** "Em breve: **Checklists Online** — verificações normativas de campo", ainda no painel em 18/09/2026, **sem data** C[25][27], M[23].
- **Leitura:** não cobre ensaios de equipamentos de MT, **mas já faz no SPDA exatamente o que o fasor promete para a cabine**: campo offline, calibração e plano de adequação com prazo.

### 5.5 Gautica GNR10

Inspeção de **segurança NR-10** em painéis, subestações e transformadores, com classificação de risco e "relatórios com sua marca" C[63]. **É ferramenta de segurança do trabalho, não laudo de ensaios.**

### 5.6 Fabricantes de instrumentos e incumbentes

- **Megabras BlueLogg:** gratuito, **Android e iOS**, funciona "somente" com instrumentos Megabras (MD10KVx, TM25R, EM4058); **3,9★ em 30 avaliações**, 10 mil+ downloads; reclamação de 2021: "**só gera duas páginas de relatório**" e pedido de suporte a TTR; atualizações de 2026 só corrigem erros C[21][22], M[25]. **MegaLogg 3** (PC) só transfere dados C[23]. **O fabricante não faz o laudo**; a parceria com a Mesh só aparece nas páginas da Mesh C[24].
- **OMICRON PTM + PTMate:** gestão de ativos e ensaios de MT/AT, inclusive "grounding systems", com planos IEEE/IEC e controle do instrumento; relatórios adaptáveis com comentários e imagens; de outras marcas **só importa resultados de DGA**; **PTMate gratuito**; **PTM DataSync web é SaaS anual**; **preço da licença não publicado**; escritório e centro de treinamento em **Sorocaba** com cursos em português (*confiança média*) C[30][31][32], M[24]. **Centrado nos próprios instrumentos.**
- **Megger PowerDB** — o incumbente mais parecido com um gerador de pacote de laudo C[33][34]: **370+ formulários** e editor de formulários com logo, cabeçalho e rodapé; relatório com **capa, sumário e resumo de deficiências**; **tabela de instrumentos com data de calibração**; importa dados da Doble e de outros (não da OMICRON). **Limites:** **só Windows**, em inglês; **preço sob cotação**; **datasheet de 2016** (*claim vencido*); **nenhuma presença no Brasil encontrada** e **PNCP retornou 0 resultados** C[37]. Na pesquisa de mercado o site estava bloqueado M, seção 4.
- **Doble DTA:** só instrumentos Doble e Vanguard; preço não publicado; **ativação exige contrato de manutenção ativo** (*confiança média*) C[36][76]. Não foi possível obter orçamento M, seção 4.
- **Termografia (ferramenta à parte, grátis ou barata, com modelos):** FLIR Thermal Studio grátis / **US$ 215,99** / **US$ 431,99** por ano; Fluke SmartView e Testo IRSoft gratuitos C[38][39][40].

### 5.7 Apps genéricos de campo

| App | Preço | Laudo elétrico | Relatório | Sentimento recente (desde set/2025) |
|---|---|---|---|---|
| **Produttivo** | 4 planos **sem preço público**; teste grátis de 15 dias | Modelo de "**Laudo NR10**" pronto; já publica conteúdo para buscas | PDF; logo e cores só a partir do 2º plano. Em 2022 um cliente pediu exportação para Word **porque o laudo final é feito no Word** | Play **4,0★ geral, 3,53 nas recentes**, "travamentos"; iOS **2,5★**, "sincronização… não funciona", uma foto por vez; 100 mil+ downloads C[41][42][43][44][45], M[28][31][32] |
| **Checklist Fácil** | Sem preço público; demonstração obrigatória | Não encontrado | Checklists e auditorias | **4,8★ geral, 3,65 nas 106 recentes**: "sincronização… péssima", "dados não são enviados"; 500 mil+ downloads C[49][50], M[27][30] |
| **Auvo 2.0** | Sem preço público (os R$ 25–44,90 citados são de **2018**) | Não (PMOC, OS) | Relatório de visita com assinatura | **3,81 nas recentes**: "travando na hora de inserir fotos", "não funciona sem internet"; queixas desde 2023; 10 mil+ downloads C[46][47][48], M[29][45] |
| **Field Control** | **R$ 525/mês com 4 licenças** + R$ 89 por licença extra + R$ 899 de implantação; Capterra diz **R$ 295/usuário/mês** (**em disputa**) | Página "Instalações elétricas" genérica | OS com formulários e fotos | Não levantado C[51][52][53][54] |
| **SafetyCulture / Mitti** | Grátis até 10 usuários; **US$ 24–29/assento/mês** | Modelos NR-10 na biblioteca; **nada de cabine ou SPDA** | Formulário genérico | Não levantado C[55][56], M[33] |
| **GoCanvas** | **US$ 29/39/49 por usuário/mês**, mínimo 3 | Genérico | Formulários | — M[34] |
| **Online OS** | **R$ 899,99/mês** (Advantage); marca própria só no plano personalizado | Não; apps de laudo sob encomenda | "100% online" | Não levantado C[66] |
| **Tecniko** | Grátis; pagos a partir de **R$ 59,90/mês** | Não | Relatório de serviço com IA | Não levantado C[65] |

**Nenhum genérico** mostrou ART, cadastro de instrumentos com calibração, ficha por equipamento de MT ou layout de documento técnico longo. **A queixa que se repete em três fornecedores independentes é sincronização e fotos** — *confiança alta para o padrão* C[43][44][46][49].

### 5.8 Substitutos e status quo

- **Pacote de 6 modelos Word/Excel de laudos elétricos** (inclui manutenção de subestação) por **R$ 49,90**, pagamento único C[70].
- Laudos de cabine circulando como modelo no **Scribd** C[71] (*baixa confiança*).
- **Papel + Excel + Word:** custo adicional quase zero, **sem evidência externa coletada** M, seção 4. *Inferência: o status quo é o modelo de Word.*
- **Análogo no exterior:** no Reino Unido há mercado maduro de software de certificação e relatório de ensaio para eletricistas (EasyCert, NAPIT, iCertifi, Sparkify) M[38]. *Confiança baixa a média* — sinal de que existe quem pague por essa dor.

### 5.9 Lacunas que NENHUM concorrente cobre (em ordem de defensabilidade) C, seção 9

1. **O laudo no layout real da prestadora (FO.SERV-03), com sumário, fichas e registro fotográfico.** A Mesh impõe o modelo dela e **o sumário está pendente**; a Minipa só gera PDF montado em blocos. **Janela curta:** a Mesh já anuncia o sumário como próximo passo C[7][58][59].
2. **Pontos de atenção com foto → ação corretiva → prazo e responsável.** Nenhum concorrente analisado mostra plano de ação com prazo **na cabine** (o GroundPRO já tem, mas **no SPDA**). Conclusão baseada em **ausência** em código e páginas públicas C[7][34][59]. *Premissa não re-verificada nesta rodada competitiva: que a NR-10 revisada exija relatório com plano de ação e cronograma — isso está verificado na pesquisa de mercado e na de domínio (10.7.11).*
3. **Inspeção visual C/NC/NA por equipamento e escopo da cabine inteira**, incluindo o que fica fora dos 6 tipos da Mesh: **para-raios, barramentos, painéis, aterramento e sinalização** C[2].
4. **Registro do certificado e da validade de calibração do instrumento.** A Mesh registra instrumento e nº de série, mas **declara que não registra calibração**. **Janela: até o lançamento da Equipa** C[7][12].
5. **Tablet e iPad como plataforma principal.** A Mesh é Android/celular; a Minipa **já tem iPad** C[1][2][62].
6. **Não concorrer com o cliente.** A Mesh também presta serviço de engenharia C[2][14]. *Inferência a validar em entrevistas.*

**Deslocamento da disputa (insight da comparação):** Mesh, GroundPRO e Minipa **já fazem captura offline com fotos**, e Mesh e Minipa leem instrumentos por Bluetooth. **A confiabilidade de sincronização virou critério de eliminação, não diferencial de venda.** O que resta diferenciado é **o documento final**. Neutralidade de marca de instrumento é argumento real para quem tem instrumentos de várias marcas, **mas todos já aceitam entrada manual, então sozinha ela não diferencia**.

---

## 6. Voz do usuário — evidência real (honestamente, escassa)

**O que NÃO existe:**
- **Nenhum relato real de profissional brasileiro** sobre o processo de laudo foi obtido. Reddit, fórum Mike Holt e Electricians Forums **bloquearam o acesso** M, seção 3.
- As dores do brief do projeto (papel → Excel → Word, redigitação, atraso na entrega e no faturamento) **continuam hipóteses a validar em entrevista** M.
- **Não há entrevista com a equipe da Fasor** nem com prestadoras — é a primeira ação recomendada (5 a 10 empresas) M R6, C R7.
- Tamanho típico de equipe e duração do desligamento: **não encontrados em nenhuma fonte, nem nos editais** D, seção 4.

**O que existe, e é indireto (lojas de app):**
- **Padrão de dor mais sólido da pesquisa** (*confiança média-alta; padrão em 3 fornecedores independentes, com poucas avaliações*): **sincronização instável e fotos perdidas**. Produttivo — "terei de voltar aos locais", lentidão para preencher, iOS 2,5★ "sincronização… não funciona", uma foto por vez; Checklist Fácil — sincronização lenta, "dados não são enviados"; Auvo — "travando na hora de inserir fotos", "não funciona sem internet" M[27][28][29], C[43][44][46][49].
- **O relatório é o ponto fraco recorrente:** no app oficial da Megabras um usuário reclama que "**só gera duas páginas de relatório**" e pede suporte a TTR (avaliação de 2021) M[25], C[21]; numa calculadora de SPDA a reclamação mais votada é que "**o relatório não sai preenchido**" M[26].
- **Pedido explícito de Word:** cliente do Produttivo pediu exportação para Word em 2022 **porque o laudo final é feito no Word** C[45].
- **Mesh:** 13 avaliações, todas 5★, sem críticas, concentradas no evento de lançamento, uma delas sugerindo sorteio — **audiência, não uso** C[1].
- **Voz de comprador institucional (forte e verificada, embora não seja voz de usuário final):** dois editais independentes (**Câmara de Indaiatuba** e **TRT-12**) e o anexo da **CESAN** descrevem as mesmas peças de laudo — ensaios por equipamento, ações corretivas com prazo, fotos com termografia, inventário e ART D[46][47][30]. **É convergência externa, não o gosto de um cliente só.**

---

## 7. Implicações para requisitos

Cada item: achado → requisito concreto.

1. **NR-10 tem dois textos na janela do produto (10.5.1 → 10.13.1; 10.2.4 g → 10.7.11; AT → MT; PIE sem corte de 75 kW), com virada em 01/06/2027.**
   → O sistema deve manter uma entidade **"referência normativa" (norma, edição, item, texto)** e **resolver automaticamente a versão da NR-10 pela data de execução do serviço**. A seção de segurança do laudo, o rótulo de classe de tensão (AT/MT) e a base legal citada do plano de ação são **gerados**, não fixos. A seção 5 do FO.SERV-03 (que hoje cita o 10.5.1) não pode ser texto estático. Deve haver **teste de regressão com data simulada antes e depois de 01/06/2027**.
2. **10.7.11 exige relatório com medidas de prevenção, plano de ação e cronograma de adequação.**
   → **Plano de ação como dado estruturado, não texto livre:** cada item com `achado`, `foto(s) vinculada(s)`, `equipamento/TAG`, `ação corretiva`, `prioridade/risco`, `prazo (data ou faixa imediato/30/90/180 dias)` e `responsável`. Deve gerar uma **seção de cronograma** no laudo e ser exportável/listável entre laudos. **É a lacuna nº 2 e o principal diferencial defensável** — nenhum concorrente a tem na cabine.
3. **10.15.3 exige documentação das medições de aterramento de toda organização; os limites vêm da concessionária ou do projeto; o método é a curva de queda de potencial (NBR 15749); o SPDA pode migrar para continuidade.**
   → **Bloco de aterramento obrigatório em todo laudo de cabine**, com campos: método (queda de potencial / 62% / continuidade), geometria e distâncias das hastes, **pontos da curva** (não só um número), valor no patamar, **condição do solo (úmido/seco)**, limite aplicado **e a fonte do limite** (concessionária X / projeto / recomendação), resultado de continuidade. Impedir o registro de "um valor só" como medição de malha.
4. **Nenhuma norma brasileira fixa limiar; os critérios vêm da NETA (edição importa), do fabricante ou do histórico; a diferença chega a duas ordens de grandeza (5.000 MΩ × 30 MΩ); "400 MΩ" não tem fonte.**
   → **Critério de aceitação é dado citável, nunca constante no código nem no formulário.** Para cada ensaio guardar: `referência` (fonte + **edição** + tabela/item), `tipo` (mínimo absoluto / desvio entre polos / desvio vs. ensaio anterior / desvio vs. placa ou valor calculado / passa-falha / fabricante), `limite`, `unidade`. **Conclusão calculada por fase e por polo, editável e com justificativa do PLH quando divergir do cálculo.** O laudo imprime o critério com a fonte ao lado do valor. Catálogo de critérios versionado (NETA MTS-2019 vs. 2023; NBR 10576 2006 vs. 2017) — **nenhum critério sem edição declarada**.
5. **Vários critérios são relativos ao histórico (resistência de enrolamento ≤2% vs. anterior; PI vs. histórico; contador de operações; tendência exigida pela NETA).**
   → **Identidade estável do equipamento (TAG) entre visitas desde o MVP**, com histórico por TAG, mesmo sem tela de comparação na v1. O laudo precisa poder exibir valor anterior, delta e a data do ensaio anterior. Sem isso, metade dos critérios não é calculável.
6. **Campos de contexto determinam a validade da medição (tensão de ensaio, corrente, tempo, temperatura, tipo de isolamento, umidade, condição do solo).**
   → **Campos obrigatórios por medição:** tensão de ensaio aplicada (kV), corrente de ensaio (A, para contato), duração (30 s / 1 min / 10 min), temperatura, **tipo de isolamento (óleo/sólido)** para aplicar o fator de correção a 20 °C (tabela NETA 100.14 embutida e citada), umidade, condição do solo. O sistema **calcula e mostra o valor corrigido a 20 °C** e guarda **bruto e corrigido**.
7. **10.12.6.1 c exige instrumentos calibrados; o INMETRO diz que não existe validade regulatória do certificado e que o intervalo é do dono; nenhuma fonte exige RBC; a Mesh declara explicitamente que não registra calibração.**
   → **Cadastro de instrumento com: fabricante, modelo, nº de série, nº do certificado de calibração, data da calibração, laboratório, acreditação RBC (opcional), e o intervalo de calibração definido pela empresa.** **Cada medição referencia o instrumento usado, e o laudo imprime a tabela de instrumentos com certificado e data.** **Alerta de vencimento pela política do dono; nunca bloqueio.** Não exigir RBC. **É lacuna declarada do concorrente líder — janela até o lançamento do módulo Equipa da Mesh.**
8. **10.12.9 separa responsabilidade (PLH) de execução (profissional autorizado); a disputa CONFEA × CFT sobre quem assina está aberta.**
   → **Modelo de usuários com papéis distintos:** PLH responsável (nome, título, **conselho CREA ou CRT**, nº de registro, **ART ou TRT**) e executores autorizados (lista, por atividade). **Aceitar ART ou TRT sem validar quem pode assinar** — o produto não arbitra a disputa. Registrar quem executou cada ensaio.
9. **ART: registro antes do início; ART vinculada por OS; ART múltipla mensal para serviço periódico, registrada até o último dia útil do mês subsequente; a resolução não define o conteúdo do laudo.**
   → **Campo de número de ART/TRT no laudo** (convenção, não exigência textual — documentar isso). Vincular ART ↔ OS ↔ laudo. **Funcionalidade candidata (hipótese, não requisito validado): relatório mensal de atividades que ajuda a preencher a ART múltipla.** Anexar o PDF da ART ao pacote do laudo.
10. **NR-10 10.15.1 aceita meio digital em português; a NR-01 1.6.2 pede ICP-Brasil para documentos de NR; a Res. 1.137 aceita assinatura eletrônica "na forma da lei"; não há prazo normativo de guarda, mas a prescrição vai a 10 anos.**
    → **Saída em PDF íntegro e rastreável, com versão e hash, preparado para assinatura ICP-Brasil** (a assinatura em si pode ficar fora do MVP, mas o formato não pode impedi-la). **Política de retenção ≥10 anos** para o laudo **e para os dados brutos** (medições, fotos originais). **Revisões congeladas e numeradas** — o concorrente já faz isso.
11. **A entrega é "laudo no padrão da prestadora"; nenhum concorrente entrega o layout próprio completo e o sumário da Mesh está pendente.**
    → **Fidelidade ao FO.SERV-03 é requisito de produto, não de estética:** capa com marca da executante, **sumário**, seções na ordem do formulário, fichas por equipamento, registro fotográfico, referências e critérios, anexos. **Exportar PDF e DOCX editável** (o mercado edita o laudo final no Word — evidência C[45], C[70]). **Janela curta: a Mesh já anunciou o sumário.**
12. **Escopo de equipamentos do concorrente é 6 tipos; a cabine tem mais.**
    → Fichas do MVP no mínimo: **cabo de MT, chave seccionadora, disjuntor de MT, TP, TC, transformador, relé 50/51, aterramento**; e blocos para **para-raios, muflas/terminações, barramentos, painéis, sinalização**, além de **termografia** e **resultado de laboratório de óleo**. Cada ficha com os campos listados na seção 2.11 deste extrato.
13. **Óleo e DGA chegam depois do campo; a religação após 6 meses (Cemig) exige laudo de óleo recente.**
    → O laudo precisa de **estado "aguardando resultado de laboratório"** e de **anexar/importar o laudo do laboratório depois**, **reabrindo e reemitindo o documento como nova revisão** sem perder o histórico. Não travar a emissão do laudo de campo esperando o óleo.
14. **Termografia é feita energizada, antes do desligamento, e aparece em todos os editais.**
    → Bloco de termografia com **termogramas + imagem visível**, ponto/TAG, temperatura medida e de referência, delta, critério e ação. Deve ficar **antes** do bloco de desenergização na narrativa do laudo.
15. **Ensaio geral de funcionamento (NBR 14039 8.2.2.4) e abertura do disjuntor por cada relé (NETA) fecham o serviço.**
    → Ficha de **ensaio funcional/comissionamento de fechamento**: comando, seccionamento, proteção, sinalização, intertravamento, **abertura por cada relé**, conferência dos ajustes contra o estudo de coordenação.
16. **Concessionárias impõem parâmetros diferentes (limite de terra, antecedência de desligamento, o que é lacrado, limite de energização).**
    → **Cadastro configurável de concessionária** com: limite de resistência de aterramento (e a condição de solo associada), antecedência mínima para desligamento programado, o que é lacrado (relé/compartimento), limite de isolamento para energização. **Começar pela CPFL** (dados completos). Esses valores alimentam critérios e o planejamento.
17. **Periodicidade não é constante em nenhuma norma; a CPFL faz o consumidor declarar; o PLH decide.**
    → **Não embutir "anual" em lugar nenhum.** O laudo tem campo **"próxima intervenção recomendada" com data e justificativa do PLH**, que alimenta o cronograma do 10.7.11. Periodicidade por contrato/cliente é configurável.
18. **Fluxo de campo tem etapas com registro obrigatório (PT por turno com rastreabilidade, avaliação prévia, as-found antes da limpeza, contador antes/depois, desenergização/religação).**
    → Modelar **as-found e as-left como campos distintos da mesma medição**, não como dois ensaios soltos. Checklists de desenergização e religação **versionados pela NR-10 aplicável**. Registro de PT/AR anexável com rastreabilidade (data, turno, envolvidos, autorizações, condições impeditivas).
19. **Sincronização e perda de foto são o padrão de reclamação em 3 fornecedores independentes; os verticais novos já prometem offline de verdade.**
    → **Requisito não funcional eliminatório:** captura **offline-first** com gravação local imediata de cada medição e cada foto, sincronização idempotente e **zero perda de foto**, com estado de sincronização visível por item e reenvio automático. **Isso não é diferencial de venda — é critério de eliminação.** Definir **teste de aceitação** explícito (ex.: encerrar o app, perder rede no meio do upload, encher o armazenamento) e um limite de fotos por laudo dimensionado acima do concorrente (GroundPRO limita a 300).
20. **O concorrente não bloqueia a emissão com pendências, mas as lista.**
    → **Lista de pendências antes da emissão** (ART ausente, ensaios não realizados — "ausência de reprovação não é aprovação", instrumento com calibração vencida, foto obrigatória faltando, critério sem fonte). **Avisar, não bloquear** — é o comportamento observado no mercado e o coerente com "o PLH decide".
21. **Plataforma: a Mesh é só Android de celular; a Minipa já tem iPad; o trabalho é em cabine, com luvas, muitas vezes sem sinal.**
    → **Tablet/iPad como plataforma principal** é lacuna real; confirmar se a web responsiva atende ou se exige app nativo. Considerar que a **leitura do laudo e a montagem final acontecem no escritório** (todos os concorrentes fazem o documento no navegador).
22. **IA de placa e Bluetooth: a Mesh já tem os dois e nenhum decide a qualidade do documento; a integração dela é restrita à Megabras e está em disputa.**
    → **Fora do MVP:** IA de leitura de placa e integração Bluetooth. **Entrada manual primeiro**; integração só se um usuário real pedir. **Neutralidade de marca de instrumento** é posicionamento, mas não diferencia sozinha (todos aceitam digitação).
23. **Preço-âncora da categoria é baixo (Mesh R$ 1.397/ano ≈ R$ 116/mês pela suíte; Minipa a partir de R$ 60/mês; modelos Word a R$ 49,90) e a decisão de SaaS depende de dados que não existem.**
    → Tratar o PRD como **ferramenta interna primeiro**. **Instrumentar o produto para medir horas por laudo** (tempo de campo, tempo de escritório, retrabalho) desde a v1 — é o dado que decide o SaaS e o único argumento para cobrar acima da faixa **R$ 100–300/mês por empresa**.
24. **Nomenclatura legal (Res. 345/1990) distingue laudo, vistoria e perícia.**
    → Usar **"laudo"** só onde há conclusões de profissional habilitado; o documento de campo bruto é **relatório de inspeção/ensaio**. Refletir isso nos títulos gerados e na UI.
25. **Argumentos de venda que se sustentam e os que não** D R11.
    → **Usar:** "laudo pronto para o PIE que a NR-10 exige de todo dono de cabine a partir de 01/06/2027"; "plano de ação com cronograma, conforme o 10.7.11"; "critérios rastreáveis por norma e edição"; "atende aos itens de edital público". **Não usar:** "exigido pela seguradora"; "a NBR 14039 exige manutenção anual"; qualquer referência ao 10.15.4 "d" como se tratasse de ensaio de transformador/disjuntor.

---

## 8. Riscos e ameaças

**Competitivos**
- **Mesh Labs (alto).** Já cobre boa parte da promessa — laudo consolidado com logo da executante, DOCX, ART como pendência, offline, IA — com **preço baixo e público (R$ 1.397/ano)**, **audiência própria (43,7 mil inscritos, base de alunos)** e **roteiro declarado** (Aterra, **Equipa = calibração**, SELetiva, SPDA e Estudos de Proteção em prévia). **O preço sobe a cada ferramenta lançada.** Duas das lacunas do fasor (calibração, e possivelmente sumário) **têm janela explicitamente curta** C[3][7][12].
- **Minipa Link (médio).** Fabricante de instrumentos com canal de distribuição, **preço de entrada R$ 60/mês**, **iPad** e **página de Subestações**. Tração quase nula hoje (10+ downloads Android, 0 avaliações iOS) C[58][60][62].
- **GroundPRO (médio, no SPDA).** Já entrega laudo de campo offline **com calibração e cronograma de adequação com prazos (imediato/30/90/180)** e anuncia "Checklists Online" sem data. Se estender à cabine, ocupa a lacuna nº 2 C[27][28].
- **Inspekio (incerto).** Pré-lançamento com **discurso quase idêntico ao do fasor** ("offline de verdade", "sem Word") C[64].
- **Status quo (alto).** Modelo de Word a **R$ 49,90** e Excel a custo zero. **O fasor precisa economizar tempo de forma visível, não só organizar melhor** C[70].
- **Conflito de canal dos verticais** é uma faca de dois gumes: a Mesh concorre com as prestadoras que quer como clientes (*inferência a validar*), mas o fasor **não tem audiência própria** e precisa de outro canal (indicação entre prestadoras, parceria com escolas regionais).

**Regulatórios**
- **Edições de norma vencendo por baixo do produto.** Dez afirmações do relatório de domínio **já estão vencidas pelo critério de janela, quase todas por edição**: **NETA MTS-2019 → MTS-2023 (não conferida)**; **NBR 10576 2006 → 2017 (limite de água 25 ou 40 ppm — contestado)**; **IEC 62271-1 2007 → 2017**; **NBR 14039 em revisão com publicação anunciada para 2026**. **Conferir as edições vigentes antes de gravar critérios no app.**
- **Limites de DGA não obtidos** (IEEE C57.104-2019 / NBR 7274) — lacuna no escopo de óleo.
- **Texto da NBR 5419:2026 não lido** (periodicidade 1/3 anos e continuidade vêm de blogs, *não verificado*).
- **PRODIST / REN ANEEL 1.000/2021 não pesquisados** — risco de requisito desconhecido do lado da concessionária.
- **Disputa CONFEA × CFT** sobre o técnico assinar laudo de cabine segue aberta: **não modelar uma resposta**.
- **Risco de a virada de 01/06/2027 escorregar ou ser alterada** — o próprio mapa de validade manda rechecar a NR-10 antes da vigência.
- **Textos ABNT lidos por cópias não oficiais ou fontes secundárias** — risco de citação errada num documento que vai a auditoria.

**De timing**
- **Janela curta entre o lançamento da Mesh (set/2026) e a vigência da NR-10 (jun/2027).** Quem tiver o relatório com **plano de ação e cronograma (10.7.11)** pronto antes de 2027 fala a língua da fiscalização; nas fontes da Mesh o foco é o resultado do ensaio (aprovado/reprovado), não o plano de ação (*inferência*).
- **Datas de revalidação da pesquisa: 01/10/2026** (Checklists Online do GroundPRO), **01/11/2026** (termos e Bluetooth da Mesh), **01/12/2026** (preço e recursos de Mesh, Minipa e GroundPRO — pauta principal do próximo Refresh).
- **R1 pendente e bloqueante para o escopo:** assinar a Mesh (R$ 1.397) e reproduzir nela um laudo real da Fasor **antes de fechar o escopo do MVP**.

**De adoção**
- **Nenhum relato real de usuário foi obtido**; toda a dor do brief é hipótese. Entrevistas com 5 a 10 prestadoras de MT são pré-requisito para qualquer decisão de SaaS.
- **Tamanho do mercado alcançável não quantificado**; os números disponíveis são tetos e dois já estavam vencidos quando a pesquisa foi feita.
- **Confiabilidade de sincronização é barreira de entrada, não vantagem:** falhar nela elimina o produto; acertar não vende.
- **Preço-âncora baixo** limita o espaço de um SaaS vertical para pequenas prestadoras.
- **O laudo final é editado no Word** pelo mercado (pedido explícito a um concorrente): um produto que só gera PDF fechado pode ser rejeitado.
- **Benchmarks de CAC (R$ 3–12 mil) e churn (3–7%/mês)** vêm de fonte única sem metodologia — *baixa confiança, o relatório diz para não planejar com eles*.
