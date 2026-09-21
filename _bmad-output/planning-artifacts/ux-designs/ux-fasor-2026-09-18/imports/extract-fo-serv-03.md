# Extração estrutural — FO.SERV-03 Laudo Técnico de Cabine Primária

**Fonte:** `docs/context/FO.SERV-03 Laudo Técnico de Cabine Primária.docx` (5,3 MB, 124 páginas, Word 16)
**Método:** pandoc (texto/tabelas do corpo) + unzip do `.docx` (cabeçalho, rodapé, metadados) + parsing binário dos 94 EMFs da seção 9 (registros `EMR_EXTTEXTOUTW`) + renderização dos EMFs em PNG via Inkscape para leitura visual de cada modelo de ficha.
**Data da extração:** 2026-09-18

> **Achado estrutural mais importante:** o documento é híbrido. As seções 1–8, 10 e 11 são texto Word. Toda a seção 9 ("Relatórios dos Ensaios", 94 páginas, ~75% do documento) são **imagens EMF coladas de planilhas Excel** — as fichas de ensaio não existem como tabelas Word, são "prints" de uma planilha-mestra. Consequência: nada ali é pesquisável, somável ou comparável com a manutenção anterior sem redigitar. É exatamente esse bloco que mais ganha com a digitalização.

---

## 1. Identificação do documento

| Atributo | Valor |
|---|---|
| Título (cabeçalho) | **LAUDO TÉCNICO DE CABINE PRIMÁRIA** |
| Código | **FO.SERV-03** |
| Revisão | **00** |
| Empresa emitente | **Fasor Engenharia** (razão social nos certificados: FASOR ENGENHARIA E CONSULTORIA LTDA, CNPJ 27.103.868/0001-73) |
| Cabeçalho (todas as páginas) | Logo Fasor Engenharia (triângulo laranja + wordmark) à esquerda; à direita: "LAUDO TÉCNICO DE CABINE PRIMÁRIA \| Código: FO.SERV-03 \| Revisão 00" |
| Rodapé (todas as páginas) | "FASOR ENGENHARIA — Rua Mazel, 60, SL 12 – Parque São George, Cotia, SP, 06708-235 — Fone: +55 (11) 4117-8397 — contato@fasorengenharia.com.br — www.fasorengenharia.com.br — Página X de Y" (campo de página automático) |
| Página | A4 retrato (11906 × 16838 twips), margens 1,27 cm esq/dir, 1,27 cm sup/inf |
| Metadados | Criado 2026-09-17 18:49, modificado 2026-09-17 19:22 por "Fasor Engenharia", revisão 5, 3.663 palavras (só texto Word; as fichas EMF não contam) |
| Instância analisada | Cliente Porto Seguro Companhia de Seguros Gerais, São Paulo/SP, serviço em 06/07/08 de setembro de 2026, responsável Rafael Lamonde |
| Estilos usados | Título1 (seções numeradas), Título2 (9.x), Sumário1/2, Parágrafo da Lista, Corpo de texto |
| Campos de formulário Word | Nenhum (`ffData` = 0; 1 `sdt` = o índice automático). Todo preenchimento é digitação livre sobre o texto do modelo. |

---

## 2. Árvore completa de seções e campos

Legenda de tipos: `[texto]` texto livre · `[num:unidade]` numérico com unidade · `[data]` · `[chk]` checkbox · `[C/NC/NA]` tríade Conforme / Não Conforme / Não Aplicável · `[tabela]` · `[foto]` área de foto · `[assin]` assinatura · `[fixo]` texto padrão do modelo · `[auto]` gerado automaticamente

### 0. Capa (página 1)

**Tabela "DADOS DO CLIENTE"** (2 colunas × 4 linhas, célula título mesclada)

| Campo | Tipo | Valor na instância |
|---|---|---|
| Cliente | `[texto]` | Porto Seguro Companhia de Seguros Gerais |
| Cidade/local | `[texto]` | São Paulo/SP |
| Data da execução do serviço | `[data]` (intervalo, por extenso) | 06, 07 e 08 de setembro de 2026 |
| Informações adicionais | `[texto]` | Manutenção Preventiva nas Cabines Primárias |
| Responsável | `[texto]` (nome) | Rafael Lamonde |

- Foto de capa `[foto]` — 1 imagem grande (fachada do prédio do cliente, 805×828 px).

### Índice (página 2)
- Título "ÍNDICE" em tabela de 1 célula; sumário automático do Word `[auto]` com 11 seções + 11 subseções 9.1–9.11 e números de página.

### 1. OBJETIVO `[fixo + 3 variáveis]`
Parágrafo padrão com trechos que mudam por cliente: *empresa executora* (Fasor Engenharia), *escopo* ("manutenção preventiva e à execução de ensaios dielétricos nas Cabines Primárias de Proteção, Distribuição e Transformação"), *local* ("das Torres A e B da Porto Seguro"). Transcrição na seção 4 deste relatório.

### 2. DEFINIÇÕES `[fixo]`
Glossário com 5 verbetes (Manutenção; Manutenção Preventiva; Resistência Ôhmica dos Contatos; Relação de Transformação; Resistência de Isolação; Resistência Ôhmica de Aterramento) + Obs + frase em negrito sobre NR-10/PIE. 100% fixo.

### 3. LIMITE DE ESCOPO `[fixo com lista editável]`
Parágrafo de escopo + lista "Exclusões" com 3 itens (quadros terminais; painéis/trafos de rede estabilizada/nobreak; geradores e periféricos). A lista de exclusões varia por contrato.

### 4. REQUISITOS BÁSICOS PARA EXECUÇÃO DE MANUTENÇÃO PREVENTIVA EM CABINES PRIMÁRIAS `[fixo]`
Cinco listas de checagem (sem checkbox — só bullets):
- **Documentação** (5): ART preenchida e recolhida; manuais dos fabricantes; folha de registro da manutenção anterior; formulário de registro dos ensaios ("conforme Anexo deste documento"); procedimento de trabalho NR-10.
- **EPC's** (7): fita de sinalização; placa/bandeirola; sistema de bloqueio; detector de tensão; conjunto de aterramento temporário; bastão isolante; cones.
- **EPI's** (7): calçado; luva de borracha classe; óculos; luva de vaqueta; capacete; cinto (>2 m); uniforme.
- **Equipamentos de Ensaio** (6): megôhmetro; microhmímetro; TTR; alicate amperímetro; fasímetro; mala de calibração de relés.
- **Ferramentas e Materiais** (4): gerador/extensões/iluminação; materiais de limpeza; mala de ferramentas; escada isolada.

### 5. RECOMENDAÇÕES GERAIS TÉCNICAS E DE SEGURANÇA `[fixo]`
5 bullets + citação literal da NR-10 item 10.5.1 (alíneas a–f) + 3 parágrafos + lista de 9 itens de verificação antes da reenergização. 100% fixo.

### 6. VERIFICAÇÕES E ENSAIOS APLICÁVEIS `[fixo]`
Procedimento por tipo de equipamento (8 blocos): Cabos de Alimentação (2 itens); Para-Raios (4); Chaves Seccionadoras (7); TP e TC (3); Disjuntor de MT (5); Relé de Proteção (3); Transformador de Força a seco (6); Cubículos/QGBT's/Quadros de Distribuição (5). É a "receita" que as fichas da seção 9 materializam.

### 7. REGISTRO FOTOGRÁFICO MANUTENÇÃO PREVENTIVA `[foto × N]`
- Grade de **2 fotos por linha**, cada foto ~8 × 6 cm (3,15 × 2,36 in), legenda em negrito "**Imagem NN:** descrição".
- Nesta instância: **41 pares = 82 fotos** (imagens 2 a 82 do pacote). Numeração manual — há erro de numeração no final (sequência ... 75, 76, 75, 76, 75, 76 repetida três vezes nas fotos do QGBT).
- Cada slot = `[foto]` + `[texto]` legenda. As legendas seguem um padrão altamente repetitivo: "Detalhe d{o/a} {atividade} realizad{o/a}(s) n{o/a} {equipamento} d{o/a} {local}".
- Atividades que aparecem nas legendas: equipe da concessionária no desligamento/religamento; verificação de ausência de tensão; instalação de aterramento temporário; bloqueio LOTO; ensaio de resistência de isolação; ensaio de relação de transformação; ensaio de resistência de contato; limpeza e reaperto; verificações e limpeza no QGBT; "serviços e ensaios" genérico.
- Locais que aparecem: cobertura lado A, cobertura lado B, Oxigênio, Enel (cubículo de entrada/saída), subsolo (cubículos MT, transformadores, cabos), cubículos de geração, QGBT.

### 8. PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES `[texto — lista de bullets]`
Lista livre de recomendações, 5 bullets nesta instância (transcritos na seção 4). Dois deles são recorrentes de modelo (plaquetas de identificação; diagrama unifilar emoldurado/PIE); três são específicos desta visita (isolação < 400 MΩ sob chuva; ensaios não realizados por impossibilidade de desligamento; QGBT não reapertado por orientação do cliente).

### 9. RELATÓRIOS DOS ENSAIOS — 94 fichas (imagens EMF)

Subseções (Título2) e quantidade de fichas por subseção:

| Subseção | Fichas | Conteúdo |
|---|---|---|
| 9.1 Cubículo Enel | 9 | Cabos de entrada (com cabeçalho SE), Para-raio de entrada, Seccionadora de entrada, Seccionadora de saída, TP proteção, TC proteção, Disjuntor MT, Para-raio de saída, Cabos de saída |
| 9.2 Seccionadoras dos Cubículos de MT do 1° Subsolo | 13 | 1 ficha de seccionadora por coluna do PTMT/IM |
| 9.3 Disjuntores dos Cubículos de MT do 1° Subsolo | 14 | 1 ficha de disjuntor por coluna |
| 9.4 TP's e TC's dos Cubículos de MT do 1° Subsolo | 12 | 6 pares (TP + TC) |
| 9.5 Transformadores e Cabos de Alimentação do 1° Subsolo | 10 | 5 pares (Cabos de alimentação TRn + Transformador de força TRn), TR1..TR5 |
| 9.6 Oxigênio | 5 | Cabos de entrada (com SE), Seccionadora, Para-raio de saída, Cabos de saída, Transformador de força |
| 9.7 Cobertura Lado A | 6 | Cabos de entrada (com SE), Para-raio (entrada), Seccionadora, Disjuntor, Cabos de saída, Transformador de força |
| 9.8 Cobertura Lado B | 6 | idem 9.7 |
| 9.9 Seccionadoras dos Cubículos de MT dos Geradores | 7 | 1 por coluna do PTMG |
| 9.10 Disjuntores dos Cubículos de MT dos Geradores | 4 | 1 por gerador |
| 9.11 TP's e TC's dos Cubículos de MT dos Geradores | 8 | 4 pares (TP + TC) |

Todas as 94 fichas derivam de **8 modelos** (templates de planilha). Cada modelo é composto por blocos empilhados na ordem abaixo. Os blocos comuns são descritos uma vez; os específicos, por modelo.

#### Blocos comuns a todos os modelos

**Bloco A — Cabeçalho da ficha** `[fixo]`: barra cinza com o nome do equipamento (ex.: "CHAVE SECCIONADORA DE ENTRADA", "TRANSFORMADOR DE FORÇA TR1").

**Bloco B — VERIFICAÇÕES GERAIS** `[tabela]`: colunas **ÍTEM | C | NC | NA | OBSERVAÇÕES**. Cada linha = 1 item numerado, 3 checkboxes mutuamente exclusivos `[C/NC/NA]` e 1 célula de observação `[texto]`. A lista de itens depende do modelo (ver abaixo). Há um "%" residual visível em cada linha (célula com formato percentual vazio — artefato da planilha).

**Bloco C — ENSAIO DE ISOLAÇÃO**
- Cabeçalho do instrumento (6 campos): INSTRUM./FABRIC. `[texto]` · TIPO `[texto]` · Nº SÉRIE `[texto]` · RBC `[texto — nº do certificado de calibração]` · TENSÃO ENSAIO `[num:kV]` · ACEITÁVEL `[num com operador: ">400 MΩ"]`.
  - Valores nesta instância: MEGÔHMETRO DIGITAL/INSTRUMENT · DMG10Ki · IN919021-25945 · 37428/26 · 10 kV · >400 MΩ (em alguns modelos aparece truncado ">40" por largura de célula — é o mesmo ">400").
- Tabela de medições, cabeçalho de 2 níveis:
  - Grupo **PONTO DE ENSAIO/CONEXÃO**: LINHA | TERRA | GUARD
  - Grupo **VALORES (MΩ)** ou **(GΩ)**: 30 SEGUNDOS | 1 MINUTO | ESTAB./10MIN
  - Grupo **QUALIDADE ISOLAÇÃO**: ABSORÇÃO | POLARIZAÇÃO (índices calculados a partir de 30s/1min/10min; nesta instância todos "-", só 1 MINUTO é preenchido)
  - Linhas variam por modelo (ver abaixo).

**Bloco D — OBSERVAÇÕES** `[texto multilinha]`: caixa livre (vazia na maioria; usada nas fichas de cabos de entrada e para-raio da Enel).

**Bloco E — CONCLUSÃO** `[chk × 4]`: **APROVADO** ☐ · **REPROVADO** ☐ · **SEM RESTRIÇÕES** ☐ · **COM RESTRIÇÕES (ver observações)** ☐. Dois pares mutuamente exclusivos (aprovado/reprovado; sem/com restrições). "Com restrições" implica observação preenchida.
> Atenção: nas 8 fichas de **Transformador de Força** (modelo 8) o bloco CONCLUSÃO **não existe** — a imagem colada foi recortada após a tabela de TTR. Nenhuma ficha de trafo deste laudo tem conclusão registrada.

#### Modelo 1 — CABOS DE ENTRADA (com características da SE)
Usado em: 9.1 (Enel), 9.6, 9.7, 9.8 → 4 fichas. É sempre a **primeira ficha de cada cabine** e carrega dois blocos extras que valem para a cabine inteira:

**Bloco CARACTERÍSTICAS DA SE**
| Campo | Tipo |
|---|---|
| TIPO DE SE | `[chk × 3, exclusivo]` SIMPLIFICADA - POSTE / ALVENARIA - CONVENCIONAL / BLINDADA |
| TENSÃO PRIMÁRIA | `[num:kV]` |
| TENSÃO SECUNDÁRIA | `[num:V]` (ex.: 380/220 V; "-" no cubículo Enel) |
| POTÊNCIA INSTALADA | `[num:kVA]` |

**Bloco AMBIENTE DE ENSAIO**
| Campo | Tipo |
|---|---|
| ALTITUDE | `[num:mts]` (ex.: "<1000") |
| TEMPERATURA | `[num:°C]` |
| UMIDADE RELATIVA DO AR | `[num:%]` |

Depois: Bloco A "CABOS DE ENTRADA" → Bloco B com 5 itens: **1. LIMPEZA · 2. MUFLA · 3. CONEXÕES · 4. ATERRAMENTO CORDOALHAS · 5. FIXAÇÃO** → Bloco C com 4 linhas (**FASE A / FASE B / FASE C / FASE RESERVA**, TERRA = MASSA/BLIND., GUARD = "___"), valores em MΩ → D → E.

#### Modelo 2 — PARA-RAIO (entrada ou saída)
Usado em: 9.1 (×2), 9.6, 9.7, 9.8 → 5 fichas. Títulos vistos: "PARA RAIO DE ENTRADA", "PARA RAIO DE SAÍDA", "PARA-RAIO (ENTRADA)" (grafia inconsistente entre cabines).

**DADOS DO EQUIPAMENTO**: FABRICAÇÃO `[texto]` · FABRICAÇÃO (2º campo, provável "DATA DE FABRICAÇÃO", rótulo duplicado por truncamento) `[texto]` · Nº SÉRIE `[texto]` · TIPO `[texto]` (POLIMÉRICO) · TENSÃO NOMINAL `[num:kV]` · CORRENTE NOMINAL `[num:kA]`.
Bloco B, 5 itens: **1. LIMPEZA · 2. ISOLADOR · 3. CONTADOR DE OPERAÇÃO · 4. ATERRAMENTO · 5. CONEXÕES**.
Bloco C: 4 linhas (FASE A/B/C/RESERVA × MASSA), MΩ. → D → E.

#### Modelo 3 — CHAVE SECCIONADORA
Usado em: 9.1 (×2), 9.2 (×13), 9.6, 9.7, 9.8, 9.9 (×7) → 25 fichas. Título do cabeçalho é sempre "CHAVE SECCIONADORA DE ENTRADA" mesmo quando é de saída (só na Enel foi trocado para "DE SAÍDA") — o campo IDENTIFICAÇÃO é que distingue.

**DADOS DO EQUIPAMENTO** (9 campos): IDENTIFICAÇÃO `[texto]` · FABRICAÇÃO (fabricante) `[texto]` · Nº SÉRIE `[texto]` · TIPO `[texto]` (MANUAL) · MEIO DE EXTINÇÃO `[texto]` (AR) · TENSÃO DE PLACA `[num:kV]` · CORRENTE NOMINAL `[num:A]` · ACIONAMENTO `[texto]` (MANUAL/PUNHO) · DATA DE FABRICAÇÃO `[texto mm/aaaa]`.
Bloco B, **14 itens**: 1. ABERTURA E FECHAMENTO MANUAL · 2. ABERTURA E FECHAMENTO ELÉTRICO · 3. MECANISMO DE ACIONAMENTO · 4. INTERTRAVAMENTO ELÉTRICO · 5. INTERTRAVAMENTO MECÂNICO · 6. ISOLADORES · 7. CONEXÕES · 8. CONTATOS · 9. MOTOR · 10. FUSÍVEIS · 11. ATERRAMENTO · 12. SIMULTANEIDADE · 13. PINTURA, CORROSÃO · 14. LIMPEZA E LUBRIFICAÇÃO.
Bloco C (isolação) em **duas tabelas lado a lado**:
- **SECCIONADORA CONTATO ABERTO**: LINHA | TERRA | GUARD | VALORES (GΩ) — 3 linhas: T1/T2/MASSA · T3/T4/MASSA · T5/T6/MASSA
- **SECCIONADORA CONTATO FECHADO**: LINHA | TERRA | GUARD | VALORES (GΩ) — 3 linhas: FASE A/MASSA/___ · FASE B/MASSA/___ · FASE C/MASSA/___
**Bloco C2 — ENSAIO DE RESISTÊNCIA ÔHMICA DE CONTATO**: INSTRUM./FABRIC. `[texto]` (MICRO-OHMMETER/HI-TECH) · TIPO (HTMO-10) · Nº SÉRIE (G282926) · RBC (37276/26) · CORRENTE `[num:A]` (10 A) · ACEITÁVEL `[num com operador: "<250 µΩ"]`. Tabela: LINHA | TERRA | GUARD | VALORES (µΩ) — 3 linhas: T1-T2/FASE A/MASSA · T3-T4/FASE B/MASSA · T5-T6/FASE C/MASSA. (À direita há uma grade 4×4 de "%" vazia — resíduo da planilha.)
→ D → E.

#### Modelo 4 — DISJUNTOR MT
Usado em: 9.1, 9.3 (×14), 9.7, 9.8, 9.10 (×4) → 21 fichas.

**DADOS DO EQUIPAMENTO** (12 campos): IDENTIFICAÇÃO · FABRICAÇÃO (fabricante) · Nº SÉRIE · TIPO (SF1) · MEIO DE EXTINÇÃO (SF6) · VOL. ÓLEO `[num:L]` · CORRENTE NOMINAL `[num:A]` · CAPACIDADE INTERRUPTORA `[num:kA]` · DATA DE FABRICAÇÃO · TENSÃO NOMINAL `[num:kV]` · AJ. BOBINA `[num:VCA]` · AJ. RELÉ 50/51 `[texto]`.
Bloco B, **15 itens**: 1. LIMPEZA E LUBRIFICAÇÃO · 2. ABERTURA E FECHAMENTO ELÉTRICO/REMOTO · 3. ABERTURA E FECHAMENTO MECÂNICO · 4. BOBINAS · 5. CARREGAMENTO MANUAL DE MOLAS · 6. INDICADOR DE POSIÇÃO · 7. CÂMARA DE EXTINÇÃO · 8. CONTATOS MÓVEL E FIXO · 9. ISOLADORES · 10. CABOS DE CONTROLE · 11. LÂMPADAS DE SINALIZAÇÃO · 12. CONTATOS AUXILIARES · 13. CONDIÇÃO GERAL DOS MECANISMOS · 14. RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM. · 15. ÓLEO ISOLANTE/INDICADOR DE NÍVEL.
Bloco C: **DISJUNTOR CONTATO ABERTO** (T1/T2, T3/T4, T5/T6 × MASSA, GΩ) e **DISJUNTOR CONTATO FECHADO** (FASE A/B/C × MASSA, GΩ), idêntico ao modelo 3.
Bloco C2 (resistência de contato) idêntico ao modelo 3.
→ D → E.

#### Modelo 5 — TRANSFORMADORES DE POTENCIAL - PROTEÇÃO (TP)
Usado em: 9.1, 9.4 (×6), 9.11 (×4) → 11 fichas.

**DADOS DO EQUIPAMENTO** (12 campos): IDENTIFICAÇÃO · FABRICAÇÃO · Nº SÉRIE · TIPO (IPSB) · TIPO DE ISOLAÇÃO (EPÓXI) · VOL. ÓLEO · POTÊNCIA NOMINAL `[num:VA]` · TAP ATUAL · DATA FABRICAÇÃO · TENSÃO NOMINAL AT `[num:kV]` · TENSÃO NOMINAL BT `[num:V]` · LIGAÇÃO SECUNDÁRIA.
Bloco B, **15 itens** (mesma lista do transformador de força — a maioria marcada NA em TP/TC): 1. LIMPEZA · 2. VÁLVULA DE ALÍVIO · 3. ELEMENTO SECANTE · 4. JUNTAS, VEDAÇÕES E VAZAMENTOS · 5. INDICADOR NÍVEL DE ÓLEO · 6. VENTILADORES · 7. REGISTROS, RADIADORES · 8. RELÉ DE GÁS, FUNCIONAMENTO · 9. CORROSÃO, PINTURA, VIBRAÇÕES · 10. ATERRAMENTO · 11. BUCHAS PRIMÁRIA/SECUNDÁRIAS · 12. TERMÔMETRO · 13. ÓLEO ISOLANTE/INDICADOR DE NÍVEL · 14. CONEXÕES · 15. RELÉ DE TEMPERATURA EXTERNO.
Bloco C: 3 linhas **FASE R / FASE S / FASE T** × MASSA, VALORES (GΩ), 30s/1min/10min + absorção/polarização.
**Bloco C3 — ENSAIO DE RELAÇÃO DE TRANSFORMAÇÃO**: INSTRUM./FABRIC. (TRANSFORMER RATIOMETER) · TIPO (HTRT-8K) · Nº SÉRIE (F277226) · RBC (37274/26) · ACEITÁVEL `[num:%]` (0,5%). Tabela com 3 grupos de cabeçalho:
- **CÁLCULO TEÓRICO**: TP's | V PRIMÁRIO `[num:V]` | V SECUNDÁRIO `[num:V]` | VAL CALCULADO `[num, auto = Vp/Vs]`
- **LIGAÇÕES DOS TERM. DOS TP's SOB ENSAIO**: H1-H2 / X1-X2 `[num — valor medido]`
- **CONDIÇÕES**: `[texto/enum]` SATISFATÓRIO (derivável: |medido − calculado|/calculado ≤ aceitável)
- 3 linhas: FASE R, FASE S, FASE T.
→ D → E.

#### Modelo 6 — TRANSFORMADOR DE CORRENTE - PROTEÇÃO (TC)
Usado em: 9.1, 9.4 (×6), 9.11 (×4) → 11 fichas. Igual ao modelo 5 com estas diferenças:
- DADOS DO EQUIPAMENTO: no lugar de TENSÃO NOMINAL AT/BT entram **RELAÇÃO** `[texto "500/5"]` e **EXATIDÃO** `[texto "10P20"]`; TIPO = ICSG.
- Relação de transformação: CÁLCULO TEÓRICO = **TPS | A PRIMÁRIO `[num:A]` | A SECUNDÁRIO `[num:A]` | VAL CALCULADO**; ligações **P1-P2 / S1-S2**; CONDIÇÕES. (O rótulo "TPS"/"DOS TPS SOB ENSAIO" é erro de cópia do modelo de TP — deveria ser TC.)

#### Modelo 7 — CABOS DE SAÍDA / CABOS DE ALIMENTAÇÃO TRn
Usado em: 9.1, 9.5 (×5, "CABOS DE ALIMENTAÇÃO TR1..TR5"), 9.6, 9.7, 9.8 → 9 fichas. É o modelo 1 **sem** os blocos Características da SE e Ambiente de Ensaio: Bloco A → B (5 itens: LIMPEZA, MUFLA, CONEXÕES, ATERRAMENTO CORDOALHAS, FIXAÇÃO) → C (FASE A/B/C/RESERVA × MASSA/BLIND., GΩ) → D → E.

#### Modelo 8 — TRANSFORMADOR DE FORÇA
Usado em: 9.5 (×5, "TR1..TR5"), 9.6, 9.7, 9.8 → 8 fichas.

**DADOS DO EQUIPAMENTO** (12 campos): IDENTIFICAÇÃO · FABRICAÇÃO · Nº SÉRIE · TIPO (TRICAST) · TIPO DE ISOLAÇÃO (Á SECO) · VOL. ÓLEO · POTÊNCIA NOMINAL `[num:kVA]` · TAP ATUAL `[num:kV]` · DATA FABRICAÇÃO · TENSÃO NOMINAL AT `[num:kV]` · TENSÃO NOMINAL BT `[num:V]` (380/220) · LIGAÇÃO SECUNDÁRIA (DYN1).
Bloco B, 15 itens (mesma lista do modelo 5).
Bloco C: 3 linhas com combinações **LINHA/TERRA/GUARD**: PRIMÁRIO/MASSA/SECUNDÁRIO · PRIMÁRIO/SECUNDÁRIO/MASSA · SECUNDÁRIO/MASSA/PRIMÁRIO — VALORES (GΩ) (valores como "2T" = 2 TΩ aparecem; a unidade da célula não comporta).
Bloco C3 — Relação de transformação: **TAP Nº** `[texto "2 e 3"]` | V PRIMÁRIO `[num:kV]` | V SECUNDÁRIO `[num:V]` | VAL CALCULADO | **H1-H3 / X1-X0** | **H2-H1 / X2-X0** | **H3-H2 / X3-X0** | CONDIÇÕES — **1 linha** (um TAP ensaiado).
→ **sem bloco D e E** nesta instância (imagem recortada).

#### Inventário das 94 fichas (campo IDENTIFICAÇÃO por página)

**9.1 Cubículo Enel** (SE tipo BLINDADA, 13,8 kV, 10 kVA[sic], 19 °C, 67 %): Cabos de entrada · Para-raio de entrada · Seccionadora de entrada (Celtta, 15 kV, 400 A, 07/2012) · Seccionadora de saída · TP (Zilmer IPSB, 500 VA, 13,8 kV/220 V, 2012) · TC (Zilmer ICSG, 500/5, 10P20, 2017) · Disjuntor MT (Schneider SF1, SF6, 630 A, 20 kA, 17,5 kV) · Para-raio de saída · Cabos de saída.

**9.2 Seccionadoras 1° Subsolo** (13): COLUNA 2 - PTMT/TP's DE BARRA · COLUNA 5 - PTMT/ALIMENTADOR TRAFO A1 - 750KVA (QGBT-A) · COLUNA 6 - PTMT/ALIMENTADOR MÓDULO - IM (QGBT-B1) · COLUNA 7 - PTMT/ALIMENTADOR TRAFO B2B - 1000KVA (COBERTURA TORRE B - LADO B) · COLUNA 8 - PTMT/ALIMENTADOR TRAFO T (TEATRO) · COLUNA 10 - PTMT/ALIMENTADOR CAG - 750KVA (CAG TORRE A) · COLUNA 11 - PTMT/ALIMENTADOR TRAFO B2A - 1000KVA (COBERTURA TORRE B - LADO A) · COLUNA 12 - PTMT/ALIMENTADOR TRAFO B1A - 1500KVA (QGBT-B1) · COLUNA 13 - PTMT/ALIMENTADOR TRAFO A2 - 750KVA (QGBT-A) · COLUNA 17 - PTMT/TP's DE BARRA · COLUNA 1 - ENTRADA/MÓDULO IM · COLUNA 2 - IM/ALIMENTADOR TRAFO CENTRO CULTURAL - 300KVA · COLUNA 3 - IM/ALIMENTADOR TRAFO B1B - 1500KVA.

**9.3 Disjuntores 1° Subsolo** (14): COLUNA 3 - PTMT/DISJUNTOR DE ACOPLAMENTO - REDE 1 (REDE) · COLUNA 4 - PTMT/ENTRADA ACOPLAMENTO - REDE 1 (GERADOR) · COLUNA 5 · 6 · 7 · 8 · 10 · 11 · 12 · 13 (mesmas descrições de 9.2) · COLUNA 14 - PTMT/ENTRADA ACOPLAMENTO - GERADOR 2/3/4 (GERADOR) · COLUNA 16 - PTMT/DISJUNTOR DE ACOPLAMENTO REDE 2 (REDE) · COLUNA 2 - IM/… CENTRO CULTURAL · COLUNA 3 - IM/… B1B.

**9.4 TP/TC 1° Subsolo** (6 pares): COLUNA 3 (REDE 1) · COLUNA 4 (REDE 1 GERADOR) · COLUNA 14 (GERADOR 2/3/4) · COLUNA 16 (REDE 2) · COLUNA 2 - IM (CENTRO CULTURAL) · COLUNA 3 - IM (B1B).

**9.5 Trafos 1° Subsolo** (5 pares): TR1 (Schneider Tricast 1000 kVA, 13,8 kV/380-220 V, Dyn1, 04/2014) … TR5 — identificação "SUBSTAÇÃO" [sic] em todos; as fichas não dizem qual trafo (A1, A2, B1A, B1B, CAG, T?) é TR1..TR5.

**9.6 Oxigênio** (SE ALVENARIA - CONVENCIONAL, 13,8 kV, 380/220 V, 300 kVA): cabos entrada · seccionadora · para-raio saída · cabos saída · trafo (Blutrafos).

**9.7 Cobertura A** / **9.8 Cobertura B** (SE ALVENARIA, 1000 kVA): cabos entrada · para-raio (entrada) · seccionadora (COLUNA 2 - PMT-B2A / PMT-B2B) · disjuntor · cabos saída · trafo.

**9.9 Seccionadoras Geradores** (7): COLUNA 1 - PTMG/ENTRADA GERADOR 4/13,2KV - 630A - 20KA · COLUNA 2 - …GERADOR 3 · COLUNA 3 - …GERADOR 2 · COLUNA 4 - PTMG/ALIMENTADOR PTMT (LADO A) · COLUNA 5 - PTMG/ALIMENTADOR PTMT (LADO B) · COLUNA 6 - …GERADOR 1 · COLUNA 7 - PTMG/TP's DE BARRA.

**9.10 Disjuntores Geradores** (4): COLUNAS 1, 2, 3, 6 (geradores 4, 3, 2, 1).

**9.11 TP/TC Geradores** (4 pares): COLUNAS 1, 2, 3, 6.

### 10. CONCLUSÃO E OBSERVAÇÕES TÉCNICAS `[fixo]` + bloco de assinatura
3 bullets padrão (transcritos na seção 4). Depois:
- Tabela de assinatura (1 coluna): `[assin]` imagem da assinatura (127×214 px, PNG com fundo transparente) + **Nome** `[texto]` "Rafael Lamonde Mendes" + *Engenheiro Eletricista* `[texto]` + "CREA SP Nº: 5063583141" `[texto]`.
- Linha final: "Este laudo tem validade apenas acompanhada da ART_2620262602583" `[fixo + num ART]`.

### 11. CERTIFICADOS `[foto × 6]`
6 páginas JPEG (920×1301, 150 dpi) = 3 certificados de calibração × 2 páginas, emitidos por Gama Instruments (Cotia/SP):
- Nº 37276/26 — Microhmímetro Digital HI-TECH HTMO-10, série G282926, calibrado 20/08/2026.
- Nº 37428/26 — Megômetro Digital INSTRUM DMG-10Ki, série 919021-25945, patrimônio 71, calibrado 28/08/2026, recalibração sugerida 28/08/2027.
- Nº 37274/26 — Medidor de Relação HI-TECH HTRT-8K, série F277226, calibrado 20/08/2026.
Os números RBC referenciados em todas as 94 fichas apontam para estes três certificados.

---

## 3. Tabelas: cabeçalhos e número de linhas

| # | Onde | Cabeçalho / colunas | Linhas | Instâncias |
|---|---|---|---|---|
| T1 | Capa | DADOS DO CLIENTE (título) · Cliente / Cidade/local · Data da execução / Informações adicionais · Responsável | 4 (1 título + 3) | 1 |
| T2 | Seção 7 | [foto] · [foto] / **Imagem NN:** legenda · **Imagem NN:** legenda | 2 por par | 41 pares |
| T3 | Ficha — Características da SE | TIPO DE SE (3 chk) · TENSÃO PRIMÁRIA · TENSÃO SECUNDÁRIA · POTÊNCIA INSTALADA | 2 | 4 |
| T4 | Ficha — Ambiente de ensaio | ALTITUDE · TEMPERATURA · UMIDADE RELATIVA DO AR | 1 | 4 |
| T5 | Ficha — Dados do equipamento | 3 colunas de pares rótulo/valor (6, 9 ou 12 campos conforme modelo) | 2–4 | 80 |
| T6 | Ficha — Verificações gerais | ÍTEM · C · NC · NA · OBSERVAÇÕES | 5 (cabos, para-raio) / 14 (seccionadora) / 15 (disjuntor, TP, TC, trafo) | 94 |
| T7 | Ficha — Ensaio de isolação (formato longo) | PONTO DE ENSAIO/CONEXÃO {LINHA, TERRA, GUARD} · VALORES (MΩ/GΩ) {30 SEGUNDOS, 1 MINUTO, ESTAB./10MIN} · QUALIDADE ISOLAÇÃO {ABSORÇÃO, POLARIZAÇÃO} | 4 (cabos, para-raio) / 3 (TP, TC, trafo) | 48 |
| T8 | Ficha — Ensaio de isolação (contato aberto / fechado) | 2 tabelas lado a lado: {LINHA, TERRA, GUARD, VALORES GΩ} | 3 + 3 | 46 (seccionadoras + disjuntores) |
| T9 | Ficha — Resistência ôhmica de contato | LINHA · TERRA · GUARD · VALORES (µΩ) | 3 | 46 |
| T10 | Ficha — Relação de transformação TP | TP's · V PRIMÁRIO · V SECUNDÁRIO · VAL CALCULADO · H1-H2 / X1-X2 · CONDIÇÕES | 3 (R, S, T) | 11 |
| T11 | Ficha — Relação de transformação TC | TPS[sic] · A PRIMÁRIO · A SECUNDÁRIO · VAL CALCULADO · P1-P2 / S1-S2 · CONDIÇÕES | 3 | 11 |
| T12 | Ficha — Relação de transformação trafo | TAP Nº · V PRIMÁRIO · V SECUNDÁRIO · VAL CALCULADO · H1-H3 / X1-X0 · H2-H1 / X2-X0 · H3-H2 / X3-X0 · CONDIÇÕES | 1 | 8 |
| T13 | Ficha — Conclusão | APROVADO · REPROVADO · SEM RESTRIÇÕES · COM RESTRIÇÕES (ver observações) | 1 | 86 (ausente nos 8 trafos) |
| T14 | Seção 10 | [assinatura] / Nome / Cargo / CREA | 3 | 1 |
| T15 | Títulos de seção | Cada título de seção 1–11 é uma tabela de 1 célula com o texto do título (artifício de formatação) | 1 | 11 |

Contagem total de campos preenchíveis na seção 9 (aprox.): 94 fichas × (média 13 itens × 4 células) + medições (~10–20 por ficha) + dados de equipamento (~10) + instrumento (~6) + conclusão (4) ≈ **7.000 células**, das quais ~90% são repetição de instrumento/valores-padrão.

---

## 4. Blocos de texto padrão (transcrição)

### 1. OBJETIVO
> O presente relatório tem por objetivo apresentar, de forma clara e objetiva, as atividades realizadas pela Fasor Engenharia, referentes à manutenção preventiva e à execução de ensaios dielétricos nas Cabines Primárias de Proteção, Distribuição e Transformação das Torres A e B da Porto Seguro.
>
> O documento contempla o registro dos serviços executados, dos ensaios e das verificações realizados durante a intervenção, visando documentar as condições operacionais dos equipamentos e atividades realizadas.

### 2. DEFINIÇÕES
> A manutenção caracteriza-se como todo serviço de controle, conservação e restauração de um equipamento ou instalação, com o principal objetivo de mantê-lo em condições ótimas de uso e prevenir anomalias que possam torná-los indisponíveis.
>
> **Manutenção Preventiva** é um procedimento programado que tem como objetivo manter um equipamento ou instalação em condições satisfatórias de uso, protegendo-os contra ocorrências que possam aumentar sua indisponibilidade.
>
> **Resistência Ôhmica dos Contatos**: Medir a resistência de contato das fases com o objetivo de visualizar as condições do seu fechamento nos polos.
>
> **Relação de Transformação:** Determinar a relação de transformação comparando-a com a obtida no cálculo teórico/valores de placa e ensaios de campo.
>
> **Resistência de Isolação:** Medir e verificar a resistência de isolação dos principais equipamentos como transformadores, disjuntores, seccionadoras, cabos e isoladores com o intuito de verificar a qualidade e a vida útil da isolação.
>
> **Resistência Ôhmica de Aterramento:** Medir os valores de resistência de aterramento para verificar se demonstram valores dentro da margem de tolerância exigida pela norma NBR 5419.
>
> Obs: Em todas as manutenções deve ser elaborado relatório técnico contendo os resultados dos ensaios e análises dos equipamentos e instalações, com o objetivo de comparar os resultados de relatórios anteriores, detectando possíveis falhas eminentes.
>
> **Conforme determinação da NR-10, este relatório deve fazer parte do prontuário da instalação (PIE).**

### 3. LIMITE DE ESCOPO
> Os serviços executados limitam-se à execução de ensaios elétricos e inspeções técnicas nos equipamentos integrantes do sistema de Média Tensão, incluindo o relé de proteção.
>
> Exclusões:
> - Quadros elétricos terminais, localizados nos respectivos setores;
> - Painéis e transformadores de rede estabilizada (nobreak);
> - Geradores e seus periféricos.

### 4. REQUISITOS BÁSICOS … (listas)
> **Documentação:** ART preenchida e recolhida por profissional legalmente habilitado; Manual de fabricantes dos equipamentos constantes na SE; Folha de registro do relatório da manutenção anterior; Formulário para registro dos ensaios e verificações dos equipamentos (conforme Anexo deste documento); Procedimento de trabalho padronizado conforme NR-10.
> **EPC's:** Fita de sinalização padronizada; Placa de sinalização ou bandeirola; Sistema de bloqueio padronizado; Detector de tensão; Conjunto de Aterramento Temporário; Bastão isolante para fixação do aterramento temporário; Cones de sinalização.
> **EPI's:** Calçado de segurança para trabalho com eletricidade; Luva de borracha com classe de tensão apropriada; Óculos de segurança; Luva de Vaqueta; Capacete para trabalhos em eletricidade; Cinto de segurança (caso haja trabalho acima de dois metros); Uniforme adequado.
> **Equipamentos de Ensaio:** Megôhmetro; Microhmímetro; Medidor de relação de espiras TTR; Alicate Amperímetro; Fasímetro; Mala de Calibração de Relés.
> **Ferramentas e Materiais:** Gerador, extensões e iluminação; Materiais de limpeza: solventes, pano para limpeza, sacos para recolhimento de lixo, etc; Mala de ferramentas completa; Escada isolada para eletricista.

### 5. RECOMENDAÇÕES GERAIS TÉCNICAS E DE SEGURANÇA
> - Para execução de trabalhos de manutenção em subestações os profissionais envolvidos devem ser qualificados e autorizados para a tarefa, bem como dispor dos equipamentos de proteção coletiva (EPC) e equipamentos de proteção individual (EPI) necessários.
> - É vedado o uso de adornos pessoais nos trabalhos com instalações elétricas ou em suas proximidades como relógios, anéis, pulseiras etc.
> - Para a realização da manutenção, a subestação deve estar desobstruída de peças, ferramentas, materiais e equipamentos alheios ao serviço, devendo também ser verificado os seguintes itens: disponibilidade dos EPI's e EPC's; portas de emergência e de acesso devem estar livres, os extintores de incêndio devem estar carregados e dentro do período de validade.
> - Para realização de quaisquer trabalhos de manutenção em subestações de energia, recomenda-se que ela seja totalmente desenergizada.
> - Conforme NR-10, capítulo 5.1, item 10.5.1:
>
> "Somente serão consideradas desenergizadas as instalações elétricas liberadas para trabalho, mediante os procedimentos apropriados, obedecida a sequência abaixo:
> a-) Seccionamento; b-) Impedimento de reenergização; c-) Constatação da ausência de tensão; d-) Instalação de aterramento temporário, com equipotencialização dos condutores do circuito; e-) Proteção dos elementos energizados existentes na zona controlada; f-) Instalação da sinalização de impedimento de reenergização"
>
> Após recebimento da conclusão da manobra de desligamento pelo operador da SE (conforme procedimentos acima), o responsável pela manutenção deve conferir tal situação com todos os colaboradores envolvidos, verificando se realmente os equipamentos estão isolados, sinalizados e bloqueados elétrica e mecanicamente antes do início das atividades.
>
> Antes da execução dos trabalhos de manutenção é necessário a criação de um planejamento pelo responsável da obra, definindo um plano ou roteiro das diversas etapas, para se ter esclarecimento do que fazer, porque fazer, como fazer, quando fazer e quem fazer.
>
> O estado da instalação desenergizada deve ser mantido até autorização de nova energização, respeitando-se os seguintes itens antes de fazê-lo:
> - Se todos os pontos desconectados foram conectados; Retirada do aterramento temporário; Retirada de ferramentas; Retirada de instrumentos de ensaios; Limpeza geral foi feita; Retirada de materiais e de peças; Grades de proteções e tampas dos painéis/cubículos foram devidamente fixadas; Retirada das pessoas não envolvidas no religamento; Manobra de religamento feita de forma inversa ao desligamento (itens "a" à "f").

### 6. VERIFICAÇÕES E ENSAIOS APLICÁVEIS
> **Cabos de Alimentação:** Inspecionar os cabos quanto a indícios de aquecimento, derretimento, condições de isolação e condição das terminações (muflas); Ensaio de isolação.
> **Para-Raios:** Limpeza do corpo do para-raios; Verificar condições dos isoladores, se não existem trincas ou rachaduras; Reaperto dos conectores de fase e terra; Ensaio de isolação.
> **Chaves Seccionadoras:** Verificar simultaneidade da abertura e do fechamento das fases; Verificar o estado dos contatos fixos e móveis, que devem ser limpos, reapertados e lubrificados; Reaperto, limpeza e lubrificação das articulações, punhos de manobra, varão e partes rotativas; Verificar condições dos isoladores, se não existem trincas ou rachaduras; Verificar funcionamento de chaves de fim de curso (se houver); Ensaio de isolação; Ensaio de resistência de contato.
> **Transformador de Potencial e Transformador de Corrente:** Limpeza, reaperto das conexões e fixações do equipamento à sua base; Verificação dos fusíveis de proteção e bases dos transformadores de potencial; Ensaio de isolação.
> **Disjuntor de MT:** Limpeza geral e reaperto das conexões de potência e comando; Verificar estado geral de isoladores, molas, motor, travas, engrenagens, bobinas, indicador de posição, contador de operações, bloco de terminais e estado da fiação. Deverão ser limpos, reapertados e lubrificados (se for o caso); Ensaiar abertura e fechamento mecânico, elétrico, local e remoto do disjuntor; Ensaio de isolação; Ensaio de resistência de contato.
> **Relé de Proteção:** Limpeza e reaperto de todas as conexões; Conferir, comparar via ensaios (corrente e tensão) e anotar os valores de parametrização encontrados; Testar as funcionalidades da IHM.
> **Transformador de Força (à seco):** Limpeza geral; Verificar se não existem trincas nos isoladores (buchas primárias); Inspecionar se os cabos ou barras estão firmemente conectados aos terminais do transformador; Ensaio de isolação; Ensaio de relação de transformação; Ensaio no sistema de monitoramento de temperatura dos enrolamentos.
> **Cubículos, QGBT's e Quadros de Distribuição:** Limpeza geral; Reaperto de todas as conexões mecânicas e elétricas; Verificar estado dos isoladores quanto à trinca ou rachaduras; Verificar estado dos barramentos (indícios de aquecimento, corrosão, trinca e rachaduras, desgaste da pintura, conexão com os isoladores, distâncias para laterais e portas de painel); Verificar cabos internos e de saída quanto a indícios de aquecimento, derretimento e isolação.

### 8. PONTOS DE ATENÇÃO (instância — 2 recorrentes + 3 específicos)
> - As duas cabines (Primária e Transformação) deverão passar por processo de identificação via plaquetas de segurança: Função da Cabine, Tensão, Potência, Função dos Transformadores, etc.;
> - Emoldurar e pendurar nas cabines primária e de transformação diagrama unifilar atualizado (faz parte do PIE);
> - Recomenda-se o acompanhamento nas próximas manutenções preventivas os resultados dos ensaios de resistência de isolação dos cabos de alimentação e dos para-raios, uma vez que ambos apresentaram valores inferiores ao valor de referência de 400 MΩ. Ressalta-se que os ensaios foram realizados em condições climáticas de chuva e elevada umidade, fatores que podem influenciar negativamente os resultados dos ensaios de resistência de isolamento;
> - Não foi possível realizar os ensaios elétricos em algumas seccionadoras específicas e no disjuntor TIE, responsável pela interligação dos barramentos de média tensão, devido à impossibilidade de realizar a desenergização completa da edificação, em razão da necessidade de continuidade operacional das instalações, conforme solicitação do cliente. Recomenda-se que os ensaios pendentes sejam programados e realizados na próxima intervenção;
> - Conforme orientação do cliente, não foram realizados os serviços de reaperto das conexões e limpeza interna nos QGBT's das Torres A e B, em razão da impossibilidade de desenergização dos equipamentos e da necessidade de continuidade operacional da edificação. Ressalta-se que, conforme informado pelo cliente, os QGBT's foram submetidos previamente à inspeção termográfica por empresa terceira, não tendo sido identificados pontos de anomalia térmica.

### Observação padrão dentro das fichas (cabos de entrada e para-raio da Enel)
> Recomenda-se acompanhar, nas próximas manutenções preventivas, os resultados dos ensaios de resistência de isolamento, a fim de verificar a evolução dos valores obtidos e identificar possíveis anomalias no trecho de alimentação geral da edificação. Ressalta-se que, na data dos ensaios, foram observadas condições climáticas de elevada umidade e ocorrência de chuva, fatores que podem influenciar os resultados das medições.

### 10. CONCLUSÃO E OBSERVAÇÕES TÉCNICAS
> - Foram realizados os ensaios elétricos e mecânicos (acionamentos) nos equipamentos pertinentes às Subestações de Proteção (Primária), Distribuição e de Transformação;
> - Todos os resultados dos testes aplicados nos equipamentos das subestações e as observações e particularidades pertinentes a cada equipamento objeto desta manutenção preventiva encontram-se nos itens 8 e 9 deste relatório;
> - Apesar dos resultados dos testes serem positivos para a continuidade de operação das SE's, sugerimos que as observações dos relatórios e dos pontos críticos constantes nos itens 8 e 9 deste sejam atendidas.
>
> [assinatura] **Rafael Lamonde Mendes** — *Engenheiro Eletricista* — CREA SP Nº: 5063583141
>
> Este laudo tem validade apenas acompanhada da ART_2620262602583

---

## 5. Assinaturas, responsáveis, ART, CREA e normas

| Item | Onde aparece | Detalhe |
|---|---|---|
| Responsável (capa) | Tabela DADOS DO CLIENTE | "Rafael Lamonde" (nome curto; na assinatura aparece completo "Rafael Lamonde Mendes") |
| Assinatura | Seção 10 | Imagem PNG da assinatura manuscrita + nome + "Engenheiro Eletricista" + CREA SP Nº 5063583141 |
| ART | Seção 10 (frase final) e Seção 4 (requisito "ART preenchida e recolhida") | ART_2620262602583; a ART em si **não** está anexada |
| Certificados de calibração (RBC) | Seção 11 + campo "RBC:" em cada bloco de ensaio das 94 fichas | 37276/26 (microhmímetro), 37428/26 (megôhmetro), 37274/26 (TTR); emissor Gama Instruments |
| Sem assinatura do cliente | — | Não há campo de ciência/aceite do cliente em lugar nenhum |
| Sem assinatura por ficha | — | As fichas de ensaio não têm executante/data/hora individuais — só o responsável global |

Normas citadas:
- **NR-10** — Seção 2 (relatório deve compor o PIE); Seção 4 (procedimento padronizado); Seção 5 (citação literal do item 10.5.1, alíneas a–f).
- **NBR 5419** — Seção 2, definição de Resistência Ôhmica de Aterramento (embora nenhuma ficha de aterramento exista na seção 9).
- **PIE** (Prontuário das Instalações Elétricas) — Seções 2 e 8.
- **NBR 14039 / NBR 5410** — **não são citadas** no documento.
- Critérios de aceitação implícitos nas fichas: isolação ≥ 400 MΩ (10 kV), contato ≤ 250 µΩ (10 A), relação de transformação ± 0,5 %.

---

## 6. Observações de UX para a versão digital

### 6.1 O que é template versus instância
- **Fixo (gerado, nunca digitado):** seções 2, 4, 5, 6, os 3 bullets da seção 10, os 2 primeiros bullets da seção 8, cabeçalho/rodapé, a frase da ART (só o número muda), todos os rótulos das fichas.
- **Variável por contrato/visita (preenchido no escritório):** seção 1 (empresa cliente, escopo, local), exclusões da seção 3, dados do cliente da capa, foto de capa, número da ART, responsável/CREA, seleção de quais certificados anexar.
- **Variável por equipamento (preenchido em campo):** 94 fichas — checklists C/NC/NA, medições, observações, conclusão; e as 82 fotos com legendas.

### 6.2 Repetições que viram cadastro/template
1. **Instrumentos**: os 6 campos de instrumento (nome/fabricante, tipo, série, RBC, tensão/corrente, aceitável) são idênticos em todas as 94 fichas (3 instrumentos). Devem ser um **cadastro de instrumentos** com certificado anexado e data de validade; a ficha só referencia. Ganho: elimina ~560 campos redigitados e permite alerta de calibração vencida.
2. **Equipamentos por cliente**: identificação, fabricante, série, tipo, tensões, correntes, data de fabricação, relação etc. são dados de placa que não mudam entre manutenções. Devem ser um **cadastro de ativos por cabine/coluna**, importado da manutenção anterior. O campo IDENTIFICAÇÃO hoje é texto livre e inconsistente ("CUBÍCULO ENEL", "SUBSTAÇÃO"[sic], "COLUNA 2 - PMT-B2A", "OXIGÊNIO"); precisa virar hierarquia **Site → Cabine → Coluna/Cubículo → Equipamento**.
3. **Ambiente de ensaio** (altitude, temperatura, umidade) e **Características da SE** aparecem só na primeira ficha de cada cabine — deveriam ser atributos da **cabine/visita**, herdados por todas as fichas dela.
4. **Os 8 modelos de ficha** mapeiam para 8 tipos de equipamento, com 3 listas de checklist (5 itens cabos/para-raio; 14 seccionadora; 15 disjuntor; 15 trafo/TP/TC) e 4 layouts de medição (isolação longa; aberto/fechado + contato; isolação + TTR trifásico; isolação 3 combinações + TTR por TAP).
5. **Legendas de foto**: padrão "Detalhe d{atividade} realizad{o} n{equipamento} d{local}" — pode ser gerada a partir de 3 seletores (atividade, equipamento, local) e a foto ser anexada diretamente à ficha do equipamento, gerando a seção 7 automaticamente e sem erro de numeração.
6. **Observação padrão de umidade/chuva**: mesma frase copiada em várias fichas e reescrita na seção 8 — candidata a "observação rápida" selecionável, ligada a um flag de condição climática da visita.

### 6.3 Dependências entre campos (regras que o formulário pode impor)
- `COM RESTRIÇÕES` marcado ⇒ OBSERVAÇÕES obrigatória; `SEM RESTRIÇÕES` ⇒ nenhuma linha NC.
- Qualquer item **NC** ⇒ observação daquela linha obrigatória e (idealmente) foto obrigatória.
- `APROVADO` / `REPROVADO` são exclusivos; `SEM` / `COM RESTRIÇÕES` são exclusivos.
- **VAL CALCULADO** = Vprimário / Vsecundário (ou Ip/Is) — calcular. **CONDIÇÕES** = SATISFATÓRIO se |medido − calculado| / calculado ≤ ACEITÁVEL — calcular.
- **ABSORÇÃO** = R(1 min)/R(30 s); **POLARIZAÇÃO** = R(10 min)/R(1 min) — calcular quando os três valores existem; hoje sempre "-".
- Valor de isolação < ACEITÁVEL ⇒ destacar em vermelho e sugerir "COM RESTRIÇÕES" (caso real: cabos Enel 330/3700/230/220 MΩ com aceitável > 400 MΩ).
- Valor de contato > ACEITÁVEL ⇒ idem.
- Itens **NA** dependem do tipo de equipamento (ex.: em TP/TC a seco, 9 dos 15 itens são sempre NA; em seccionadora manual, MOTOR e FUSÍVEIS são NA). O template por subtipo (a seco / a óleo; manual / motorizada) pode pré-marcar NA.
- **TAP Nº** do ensaio de TTR deve ser consistente com **TAP ATUAL** dos dados do equipamento.
- Fichas de **cabos de alimentação TRn** e **transformador TRn** andam em par; o mesmo para **TP + TC** por coluna e **seccionadora + disjuntor (+TP/TC)** por coluna — o formulário deveria navegar **por coluna/cubículo**, não por tipo de equipamento (hoje a seção 9 está organizada por tipo, o que obriga o técnico a passar 3–4 vezes na mesma coluna).
- Fichas não realizadas (seccionadoras e disjuntor TIE não ensaiados) hoje simplesmente **não existem** no laudo e só são mencionadas em prosa na seção 8 — precisa de um estado "**não ensaiado + motivo**" por equipamento.

### 6.4 Campo versus escritório
| Preenchido em campo (tablet/celular, mãos com luva, luz ruim) | Preenchido no escritório |
|---|---|
| Checklists C/NC/NA (5–15 toques por ficha) | Capa, seção 1, seção 3 (exclusões) |
| Leituras de medição (números com unidade — 3 a 9 por ficha) | Número da ART, seleção de certificados |
| Temperatura/umidade/altitude da visita | Seção 8 (pontos de atenção) — redigida a partir das observações de campo |
| Observações curtas por equipamento | Conclusão e assinatura |
| Fotos (82) e sua associação a equipamento/atividade | Revisão/numeração das fotos (hoje manual e com erro) |
| Conclusão por ficha (4 checkboxes) | Montagem do PDF final e paginação |

### 6.5 Defeitos do formulário atual que a versão digital deve corrigir
- Fichas de **transformador de força sem bloco CONCLUSÃO** (imagem recortada) — 8 fichas sem veredito.
- Rótulos truncados pela largura de célula do Excel ("TENSÃO SECUNDÁ", "AJ. RELÉ 50,", "CAPACIDADE INTERRU", "FASE RESER") e "%" residuais em toda ficha.
- Rótulo "TPS / LIGAÇÕES DOS TERM. DOS TPS" na ficha de **TC** (copiado do TP); "FABRICAÇÃO" duplicado no para-raio; "SUBSTAÇÃO" [sic]; "Á SECO".
- Aceitável ">400 MΩ" aparece como ">40" em várias fichas por truncamento — ambiguidade de critério.
- Unidade da coluna VALORES varia entre MΩ e GΩ conforme o modelo, e valores como "2T" (TΩ) são digitados dentro de coluna GΩ — a versão digital deve ter unidade por célula ou auto-escala.
- Título "CHAVE SECCIONADORA DE ENTRADA" usado para seccionadoras que não são de entrada.
- TR1..TR5 sem vínculo com a coluna/alimentador que os alimenta; "CUBÍCULO ENEL" como identificação de TP, TC, disjuntor e duas seccionadoras (ambíguo).
- Seção 7 com numeração de imagens duplicada (75/76 ×3).
- Nenhuma data/hora/executante por ficha; nenhuma comparação com a manutenção anterior (apesar da seção 2 exigir isso).
- Potência instalada "10 KVA" no cubículo Enel de 13,8 kV — provável erro de digitação, sem validação.

### 6.6 Sugestão de modelo de dados mínimo (derivado do inventário)
```
Cliente → Site (endereço, foto capa)
  → Visita (datas, responsável/CREA, ART, condições ambientais, instrumentos usados)
    → Cabine/SE (nome, tipo [poste/alvenaria/blindada], V primária, V secundária, potência)
      → Coluna/Cubículo (nº, função/alimentador)
        → Equipamento (tipo ∈ {cabo_entrada, cabo_saida, para_raio, seccionadora, disjuntor, tp, tc, trafo}, dados de placa)
          → Ficha de ensaio (checklist[], medições[], observações, conclusão, estado: ensaiado/não ensaiado+motivo)
            → Fotos (atividade, legenda gerada)
Instrumento (nome, fabricante, modelo, série, certificado RBC, validade) — referenciado pela ficha
```

---

## Anexo — arquivos de trabalho gerados durante a extração
- Markdown bruto do pandoc, texto extraído dos EMFs e PNGs renderizados das 94 fichas ficaram no scratchpad da sessão (`/tmp/claude-1000/-home-matheus-Documentos-fasor/33527063-b6d5-4f97-acc3-74bb179e2746/scratchpad/`: `fo-serv-03.md`, `emf_text.txt`, `png/image83..176.png`). Se quiser preservar as fichas renderizadas como referência visual para o design, copie a pasta `png/` para `imports/fichas-fo-serv-03/`.
