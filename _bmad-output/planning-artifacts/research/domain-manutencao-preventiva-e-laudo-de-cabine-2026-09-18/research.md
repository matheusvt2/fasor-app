---
title: 'Pesquisa de domínio: manutenção preventiva e laudo técnico de cabine primária (MT) no Brasil'
type: 'domain'
topic: 'Manutenção preventiva e laudo técnico de cabine primária (subestação de consumidor de 13,8 a 34,5 kV) no Brasil'
decision: 'Definir o modelo de dados e o conteúdo do laudo no MVP do fasor (fichas por equipamento, critérios de aceitação, seções do laudo) e apontar quais regras do domínio viram argumento de venda'
source: 'native run'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-09-18'
updated: '2026-09-18'
claims_verified: 15
claims_unverified: 17
claims_disputed: 2
---

# Pesquisa de domínio: manutenção preventiva e laudo técnico de cabine primária (MT) no Brasil

**Decisão que esta pesquisa apoia:** definir o modelo de dados e o conteúdo do laudo no MVP do fasor, o que inclui as fichas de ensaio de cada equipamento, os critérios de aceitação e as seções do laudo. Também queremos saber quais regras do domínio podem virar argumento de venda.

## Sumário executivo

**Resposta curta:** o laudo de cabine primária não tem um formato definido em norma. O que as normas exigem são **quatro coisas**: (1) um relatório de inspeção com **plano de ação e cronograma**, (2) a documentação das **medições de aterramento**, (3) testes periódicos dos **sistemas de proteção** e (4) documentos técnicos feitos por um **PLH** (profissional legalmente habilitado), isto é, alguém com registro no conselho de classe e com ART. Quase nenhum **critério de aceitação** é um número fixo tirado de norma brasileira. Os critérios vêm de tabelas estrangeiras (NETA), do fabricante ou da comparação com o histórico. Por isso, o modelo de dados precisa guardar o **critério como dado citável**: fonte, edição, tabela, tipo de comparação e limite. Um "400 MΩ" gravado no formulário não atende a isso.

Os três achados que mais pesam:

1. **A NR-10 tem dois textos em 2026–2027, e o laudo precisa saber qual vale na data do serviço.** *Confiança alta.*
   - **Até 31/05/2027** vale o texto de 2004/2019 [6]:
     - o PIE (Prontuário das Instalações Elétricas) só é exigido acima de **75 kW** (10.2.4);
     - o relatório técnico de inspeções "com recomendações, cronogramas de adequações" é a **alínea g**;
     - a desenergização segue o **10.5.1** (6 passos);
     - a cabine de 13,8–34,5 kV é classificada como **"AT"**.
   - **A partir de 01/06/2027** vale o texto novo [1][2][3]:
     - o relatório de inspeção com plano de ação e cronograma passa a ser o **10.7.11**;
     - o PIE vale para **toda organização que atua em média tensão**, sob responsabilidade de PLH (10.15.6);
     - a desenergização passa ao **10.13.1**, com 7 passos, incluindo proteção contra arco elétrico e delimitação da área;
     - a mesma cabine passa a ser **"MT"** e, por estar depois da medição, fica no sistema elétrico de consumo (SEC), não no SEP.
   - O modelo FO.SERV-03 cita o 10.5.1 e ficará desatualizado em junho de 2027.
2. **Nenhuma norma fixa a periodicidade da preventiva.** *Confiança alta.*
   - A NBR 14039:2021 manda "adequar" a periodicidade a cada instalação (8.2.1) [7][8].
   - A NR-10, nos dois textos, diz apenas "periodicamente" [2][6].
   - A CPFL exige que o **próprio consumidor declare** a periodicidade de revisão do estudo de proteção, citando NR-10 e NBR 14039 [12].
   - A preventiva "anual" é prática de mercado [17].
   - O laudo deve trazer a **próxima intervenção recomendada, com justificativa do PLH**, e não um "anual" fixo.
3. **Os critérios de aceitação são, na maioria, relativos ou emprestados.** *Confiança média a alta.*
   - Isolamento: a NETA pede **5.000 MΩ a 2,5 kV CC** para a classe 15 kV [21][20]. Já a CPFL libera a energização com **>30 MΩ** [12]. São duas ordens de grandeza de diferença, e não se achou fonte para "400 MΩ".
   - Resistência de contato: o critério é o do fabricante; sem ele, investiga-se desvio **>50% do menor polo** [21][50].
   - Resistência de enrolamento: **≤2% em relação ao ensaio anterior** [21].
   - Relação de transformação (TTR): **≤0,5%** [21][27].
   - Esses critérios pedem **dados por polo/fase, temperatura e histórico** no modelo.

**Maior ressalva:**
- Os **limites de óleo da NBR 10576 estão contestados**. O valor de 25 ppm de água é da edição de 2006, e uma fonte atribui 40 ppm à edição vigente, de 2017 [25][26].
- Os **limites de DGA** (análise de gases dissolvidos) não foram obtidos.
- Os textos ABNT foram lidos por cópias não oficiais ou por fontes secundárias.
- Das 34 afirmações registradas, **15 estão verificadas, 17 não verificadas e 2 contestadas**.

## 1. Marco regulatório e normativo

### 1.1 NR-10: dois textos em vigor na mesma janela do produto

A Portaria MTE nº 737, de 29/05/2026 (DOU 01/06/2026), reescreve a NR-10 e entra em vigor um ano após a publicação, em **01/06/2027** [1][3][5]. A única regra de transição, além desse prazo de um ano, trata do DR (10.6.4 "e") em instalações existentes, que só passa a valer em 01/06/2028. Nada preserva PIEs ou laudos anteriores [1].

| Tema | NR-10 vigente até 31/05/2027 [6] | NR-10 a partir de 01/06/2027 [1][2] | Efeito no fasor |
|---|---|---|---|
| Relatório de inspeção | 10.2.4 g: "relatório técnico das inspeções atualizadas com recomendações, cronogramas de adequações, contemplando as alíneas de a a f" (dentro do PIE) | 10.7.11: "relatório com indicação de medidas de prevenção a serem adotadas com respectivo plano de ação e cronograma de adequação". Não aparece na lista de conteúdo do PIE | Plano de ação e cronograma como **dados estruturados**, com base legal que depende da data |
| Quem precisa de PIE | "carga instalada superior a 75 kW" (10.2.4) | Quem integra o SEP ou "realize[m] atividades em instalações elétricas com média e alta tensão" (10.15.6), sob PLH | A partir de 2027, **todo dono de cabine** precisa de PIE |
| Aterramento | 10.2.4 b: "documentação das inspeções e medições do sistema de proteção contra descargas atmosféricas e aterramentos elétricos" | 10.15.3: "documentação das inspeções e medições dos sistemas de aterramentos elétricos" para **toda organização**, sem citar SPDA | Bloco de aterramento obrigatório em todo laudo |
| Sistemas de proteção | 10.4.4: "inspecionados e controlados periodicamente" | 10.12.7: "inspecionados, testados e controlados periodicamente", de acordo com as parametrizações de projeto | Base legal para a **ficha de ensaio de relé** |
| Ensaios | Não há item específico | 10.12.9: ensaios e testes de campo "sob responsabilidade de PLH e serem realizados por profissional autorizado" | Separar o **responsável (PLH)** de quem **executa (autorizado)** |
| Instrumentos | Não há item específico | 10.12.6.1 c: "aferidos, calibrados e parametrizados, quando aplicável" | Cadastro de instrumento com dados de calibração |
| Desenergização | 10.5.1: seccionamento → impedimento → constatação → aterramento → proteção → sinalização (6 passos) | 10.13.1 a–g: seccionamento → constatação → impedimento → constatação + aterramento temporário → proteção dos energizados **e contra arco** → sinalização → **delimitação da área** (7 passos) | A seção "recomendações de segurança" do laudo depende da versão da norma |
| Classe de tensão | "AT" é tudo acima de 1.000 V CA | Cria a **MT** (>1 kV até 36,2 kV); AT passa a ser >36,2 kV | O rótulo da classe de tensão depende da data |
| Autor dos documentos | 10.2.7: "profissional legalmente habilitado" | 10.15.7: "elaborados por PLH". PLH é quem tem formação oficial "e com registro no competente conselho de classe" (10.8.2) | Signatário = PLH |
| Formato | Não há item específico | 10.15.1: digital, conforme a NR-1, em português | PDF assinado é aceito (ver seção 3) |

- **Periodicidade:** a nova NR-10 só fixa intervalos para coisas que não são a instalação:
  - ensaio dielétrico de ferramentas, EPI e EPC: anual quando não houver outra previsão (10.14.4.1);
  - treinamento: bienal, com mínimo de 16 h (10.9.10) [2].
- **Status das afirmações:**
  - o texto do 10.7.11 e a vigência estão **verificados** por fonte independente [3][5];
  - os 7 passos do 10.13.1 também estão verificados [3][4]. A sequência antiga no 10.5.1 vem do texto vigente [6], de outro publicador;
  - a leitura do texto antigo vem de um espelho (Guia Trabalhista), porque o PDF do gov.br agora traz só o texto novo [6]. Está **não verificada**, com confiança média-alta.

### 1.2 ABNT NBR 14039:2021 (média tensão, 1,0 a 36,2 kV)

A edição vigente é a 3ª, de 03/12/2021. Foi lida em uma cópia licenciada, mas não oficial [7].

- **Periodicidade (8.2.1):** "A periodicidade da manutenção deve adequar-se a cada tipo de instalação, considerando-se, entre outras, a sua complexidade e importância, as influências externas e a vida útil dos componentes." Não há número. **Verificado** por comentário técnico independente, feito sobre a edição de 2005 [8].
  - A afirmação comum de que "a NBR 14039 exige manutenção anual" não tem apoio no texto [7]. Até prestador que adota preventiva anual diz que o intervalo "deve ser definido por avaliação técnica" [17].
- **Escopo da preventiva (8.2.2), que já é um esqueleto de checklist:**
  - cabos e acessórios: "sinais de aquecimento excessivo, rachaduras, ressecamento, fixação, identificação e limpeza";
  - estrutura e aterramento do conjunto de manobra;
  - partes móveis: "estado dos contatos e das câmaras de arco… ajustes e aferições";
  - conexões flexíveis;
  - no fim, **8.2.2.4 "ensaio geral de funcionamento"**, que simula comando, seccionamento, proteção e sinalização e confere os ajustes de relés conforme o projeto [7].
- **Condições gerais (8.1):**
  - instrumentos calibrados "conforme orientação do fabricante";
  - manobras com autorização de pessoa BA5 e feitas por **no mínimo duas pessoas, uma delas BA5**;
  - anomalias, sobretudo um disparo de proteção sem causa conhecida, são comunicadas a um BA5 (8.2.3.3) [7].
- **Laudo:** a norma só exige laudo explícito na **verificação final** de uma instalação nova, ampliada ou alterada. Esse laudo deve ser feito "por profissional devidamente habilitado e/ou credenciado" (7.1.5) [7].
- **Ensaios mínimos (7.3.1):**
  - continuidade (fonte de 4–24 V, corrente ≥0,2 A);
  - resistência de isolamento, **sem limiar em MΩ** (remete à norma do componente ou ao fabricante);
  - tensão aplicada;
  - resistência de aterramento;
  - ensaios recomendados pelo fabricante: óleo, fator de potência, cromatografia, tempos de operação de disjuntor, resistência de contato;
  - ensaios de funcionamento [7].
- **Revisão em curso:** está alinhada à IEC 61936-1 e inclui ensaio VLF de cabos. A publicação foi anunciada para 2026 [9][51]. Até 18/09/2026 não se achou nova edição publicada, mas o catálogo da ABNT não foi consultado. *Não verificado.*

### 1.3 Concessionárias

| Concessionária | O que exige | Fonte |
|---|---|---|
| EDP (2023) | Laudos com documento de responsabilidade técnica **na ligação/vistoria**: continuidade, isolamento, tensão aplicada, aterramento, ensaios de rotina do transformador, intertravamento e ajustes de relés. **Lacra os relés.** Proíbe alterar a graduação "sem prévia autorização". Aviso de desligamento programado com ≥5 dias úteis. Manutenção "frequente", sem intervalo | [10] |
| Cemig ND-5.3 | O RT (responsável técnico) ajusta o relé, e a Cemig pode exigir a verificação em campo. Religação após >6 meses desligada exige laudo de óleo com menos de 6 meses (SE nº 1 e nº 6). Subestação sem relé secundário deve ser convertida quando o disjuntor de MT passar por manutenção ou troca | [11] |
| CPFL GED-2855 (v35, 12/06/2026) | Terra ≤**10 Ω em solo úmido / 25 Ω em solo seco** (6.6.1.3). Desligamento programado pedido com **≥15 dias**. Lacres nos compartimentos de energia não medida, com rompimento solicitado à CPFL. Consumidor declara a **"periodicidade de revisão dos estudos de proteção… em conformidade com os itens 10.4.4 da NR-10 e 8.2 da NBR-14039"**. Ajustes de relé informados por laudo técnico com ART. Para energizar: isolamento >30 MΩ (15 kV) e >50 MΩ (25 e 34,5 kV) | [12] |

- **Achado verificado (três distribuidoras):** EDP, Cemig e CPFL exigem ensaios e laudos na **ligação**, não um relatório periódico de manutenção enviado à distribuidora [10][11][12]. Enel, Light e Neoenergia não foram lidas.
- **Implicações para o fluxo:**
  - Onde o relé é lacrado (EDP, e na Cemig na forma de verificação de ajuste), o ensaio de relé que mexe em ajuste pode exigir contato com a concessionária.
  - A CPFL exige antecedência de 15 dias para o desligamento. Os dois pontos entram no planejamento (seção 4).

### 1.4 SPDA, BT, seguradoras e referências estrangeiras

- **NBR 5419:2026 (SPDA).** A informação vem de blogs de prestadores, não do texto ABNT. *Confiança média-baixa, não verificado.*
  - Inspeção a cada **1 ano** para áreas classificadas e prestadores de serviço essencial (energia, água) e a cada **3 anos** para as demais estruturas.
  - O ensaio de **continuidade** substitui a medição de resistência de aterramento como verificação do SPDA [13].
  - A NBR 5419:2015 já não trazia os 10 Ω, que eram só "recomendação" na edição de 2005 [14][15]. *Verificado.*
  - Consequência: o laudo deve permitir os **dois tipos** de medição (continuidade e resistência). A NR-10 continua falando em "medições" de aterramento [2].
- **NBR 5410, seção 8:** não foi obtida.
- **Seguradoras:** a exigência de laudo elétrico ou termografia aparece **só em páginas de prestadores** [18]. Nenhum documento de seguradora foi encontrado. *Não verificado.* Não use isso como argumento de venda sem uma apólice real em mãos.
- **NFPA 70B-2023 (EUA):** virou norma, com intervalos ligados à condição do equipamento (exemplo: de 12 a 60 meses) [19]. *Baixa confiança: só trechos de resumo.* Serve de modelo para periodicidade baseada em condição, não como exigência no Brasil.

### 1.5 O que é obrigatório e o que é prática de mercado

| Item | Situação | Fonte |
|---|---|---|
| Relatório de inspeção com plano de ação e cronograma | **Obrigatório** (10.2.4 g hoje, 10.7.11 a partir de jun/2027) | [6][1] |
| Documentação de inspeção e medição de aterramento | **Obrigatório** | [6][2] |
| Teste periódico dos sistemas de proteção | **Obrigatório**, sem intervalo definido | [6][2] |
| PIE para dono de cabine | Hoje só acima de 75 kW. **Obrigatório para todo dono de cabine** a partir de jun/2027 | [6][2] |
| Laudo por profissional habilitado, com ART | Laudo **obrigatório** na verificação final (NBR 14039 7.1.5, "profissional devidamente habilitado e/ou credenciado"). Documentos do PIE feitos por PLH. **ART obrigatória** em todo serviço contratado e "para sua plena validade" (seção 3) | [7][2][31][41] |
| Periodicidade anual (há prestador que publica termografia e DGA semestrais) | **Prática de mercado** | [17][16][7] |
| Laudo exigido pela seguradora | **Alegação de mercado**, sem prova | [18] |
| Relatório periódico enviado à concessionária | **Não encontrado** nas três distribuidoras lidas | [10][11][12] |

## 2. Métodos de ensaio e critérios de aceitação

**Princípio:**
- A norma brasileira de instalação (NBR 14039) **não traz limiares numéricos** para isolamento nem para contato [7].
- A referência mais completa encontrada é a **ANSI/NETA MTS-2019**, lida por um espelho não autorizado. Nela, os limites são o valor do fabricante, uma tabela "representativa" ou a comparação com o ensaio anterior ou com polos semelhantes [21].
- Existe a **MTS-2023**, que não foi conferida. Por isso as citações NETA ficam marcadas como possivelmente desatualizadas (ver o mapa de validade).

### 2.1 Resistência de isolamento (megôhmetro)

| Equipamento | Tensão mínima de ensaio | Mínimo recomendado a 20 °C | Fonte |
|---|---|---|---|
| Aparelhos e sistemas classe 15 kV (disjuntor, chave, cabo) | 2,5 kV CC | 5.000 MΩ | NETA MTS-2019 Tab. 100.1 [21][20] |
| Classe 25 kV | 5 kV CC | 10.000 MΩ | idem |
| Classe 34,5 kV | 5 kV CC | 100.000 MΩ | idem |
| Transformador, enrolamento >5 kV | 5 kV CC | 5.000 MΩ (óleo) / 25.000 MΩ (seco) | NETA MTS-2019 Tab. 100.5 [21] |
| TC, secundário e fiação | 1 kV CC, 1 min | Tab. 100.5 | NETA §7.10.1 [21] |
| Fiação de controle do disjuntor | 500 V ou 1.000 V CC | ≥2 MΩ | NETA §7.6.3 [21] |
| Energização (CPFL) | não especificada | >30 MΩ (15 kV); >50 MΩ (25/34,5 kV) | GED-2855 [12] |

- **Edição importa:** a ATS-2007 traz **20.000 MΩ** para 25 kV e **15 kV CC** para 34,5 kV [22]. A MTS-2019 confirma os valores da tabela acima [21]. *Verificado para a MTS-2019, com a nota de edição.*
  - Para cabos, a NETA avisa que os valores são "típicos" e que o critério definitivo depende do fabricante, do comprimento e da temperatura [21].
- **Índices:**
  - **PI** (10 min/1 min), pela Megger: <1 perigoso, 1–2 questionável, 2–4 bom, >4 excelente.
  - **DAR** (60 s/30 s), pela Megger: 1,0–1,25 questionável, 1,4–1,6 bom, >1,6 excelente. A faixa de 1,25 a 1,4 não tem classificação, e a Megger chama os valores de "tentativos" [23].
  - A NETA pede para transformadores **PI ≥1,0**, comparado ao histórico [21].
- **Correção de temperatura para 20 °C (NETA Tab. 100.14, derivada da Megger):**
  - isolamento em óleo: 25 °C = 1,40; 30 °C = 1,98; 40 °C = 3,95; 50 °C = 7,85;
  - isolamento sólido: 30 °C = 1,58; 40 °C = 2,50 [21][23]. *Verificado.*
- **Regras que circulam no mercado:**
  - "1 MΩ/kV + 1" é o mínimo da **IEEE 43 para máquinas rotativas**, não para cabos, disjuntores ou transformadores [23][24]. *Verificado, com ressalva:* é o mínimo de uma das categorias da IEEE 43.
  - A própria Megger chama a regra de "um megohm por kV" de "arbitrária" [23].
  - **Não se achou fonte para um critério fixo de 400 MΩ** (busca da rodada 1).

### 2.2 Resistência de contato (micro-ohmímetro)

- **Método:** a IEC 62271-1 manda medir em corrente contínua "entre 50 A e a corrente nominal". No ensaio de rotina, o limite é **≤1,2 × Ru**, onde Ru é o valor de referência medido antes do ensaio de tipo [28]. *Não verificado; edição 2007, a de 2017 não foi conferida.*
- **Critério de campo (NETA, disjuntor de MT a vácuo e chaves de MT):** não pode passar do topo da faixa normal do fabricante. Sem dado do fabricante, "investigate values that deviate from adjacent poles or similar breakers by more than 50 percent of the lowest value" [21]. A MTS-2001 usa a mesma redação para disjuntores de BT [50].
  - Nas chaves com fusível, investiga-se resistência de fusíveis que difiram entre si **mais de 15%** [21].
- **As normas não fixam µΩ.** As referências aceitáveis são o ensaio de fábrica, o histórico e a comparação entre polos e unidades [27]. *Verificado.*
  - O valor "50–200 µΩ" apareceu só em resumo de buscador e foi descartado.

### 2.3 Transformador: relação, enrolamentos, excitação e buchas

- **Relação de transformação (TTR):** desvio ≤0,5% em relação à relação calculada ou às bobinas adjacentes (NETA). A NBR 5356 dá ±0,5% ou 1/10 da impedância de curto-circuito, "a menor", em todas as derivações [21][27]. *Verificado.*
- **Resistência de enrolamento:** corrigida pela temperatura, até **2% do resultado anterior** [21]. O critério depende de histórico.
- **Corrente de excitação (núcleo trifásico):** o padrão esperado é "two similar current readings and one lower" [21].
- **Isolamento do núcleo:** ≥1 MΩ a 500 V CC [21].
- **Buchas:** investigar FP (fator de potência) com desvio >50% ou capacitância com desvio >5% em relação à placa [21]. Raro em 13,8–34,5 kV.
- **Verificações visuais e mecânicas:** alarmes e trips de temperatura e nível, válvula de alívio de pressão e relé de gás (Buchholz) [21][30].

### 2.4 TP e TC

- **TC:**
  - IR a 1 kV CC por 1 min;
  - polaridade conforme a marcação;
  - erro de relação dentro da IEEE C57.13;
  - curva de excitação conforme o fabricante;
  - **um único ponto de aterramento** do secundário [21].
- **TP:** erro de relação ≤1,2% e ±17,5 mrad para uso geral; ≤0,1% e ±0,9 mrad para faturamento [21].
- **Classes de exatidão da NBR 6855/6856:** não foram obtidas.
- **Prática em edital:** resistência ôhmica dos enrolamentos e isolação em TP/TC, mais inspeção dos fusíveis do TP [46].

### 2.5 Disjuntor de MT

A NETA §7.6.3 (vácuo) pede:

- IR por polo, fechado e aberto;
- resistência de contato;
- **abertura do disjuntor por cada um dos relés de proteção**;
- verificação de trip-free e antipump;
- **integridade da ampola de vácuo** "in strict accordance with manufacturer's published data";
- **tempo de contato**;
- leitura do **contador de operações antes e depois** (as-found/as-left), que deve avançar um dígito por ciclo [21].

O ensaio de tensão suportável é opcional. Para a classe 15 kV, a Tab. 100.19 dá no máximo 20,4 kV CA / 28,8 kV CC em campo [21]. Critérios de **SF6 não foram obtidos**. Para PVO, ver o óleo (2.7).

### 2.6 Relé de proteção (secundário 50/51)

- **Função 50:** pickup e dropout.
- **Função 51:** pickup mínimo e tempo em **dois pontos da curva**.
- **Tolerâncias:** as do **fabricante do relé**, não um percentual genérico.
- **Ajustes finais (as-left):** iguais ao estudo de coordenação mais recente.
- **Relés microprocessados:** baixar eventos e ajustes antes de testar e conferir data e hora [21].
- Uma mala de teste brasileira (CONPROVE) também remete as tolerâncias ao manual do relé [29]. *Verificado.*
- **Prática em edital:** "Testes e ensaios das funções 50 / 51 do relé" com teste da bobina de abertura [47]. Na CESAN, as funções 50/51/51G/27/46 terminam com "simular desligamento do disjuntor em posição de teste" [30].

### 2.7 Óleo isolante

| Ensaio (Grupo 1, NBR 10576) | Método | Limite em serviço ≤72,5 kV, ed. 2006 [25] | NETA ≤69 kV [21] |
|---|---|---|---|
| Rigidez dielétrica | NBR IEC 60156 (calota) | ≥40 kV | ≥40 kV (D1816, 2 mm) |
| Teor de água | NBR 10710 | ≤25 ppm (corrigido a 20 °C) — **contestado**: 40 ppm na ed. 2017 segundo [26] | ≤35 ppm (a 60 °C) |
| Tensão interfacial | NBR 6234 | ≥22 mN/m | ≥25 mN/m |
| Índice de neutralização | NBR 14248 | ≤0,15 mg KOH/g | ≤0,20 mg KOH/g |
| Fator de perdas | NBR 12133 | ≤0,5% a 25 °C | 0,5% a 25 °C |
| Cor e aparência | NBR 14483 / visual | "Claro, isento de materiais em suspensão" | ≤3,5 |

- **Outros equipamentos:**
  - disjuntor PVO: ≥30 kV (calota) ou ≥20 kV (disco);
  - transformador de instrumento: ≥60 kV e ≤15 ppm [25].
- **Prática de contratação:** a CESAN (2019) exige os seis ensaios do "Grupo 1" pela NBR 10576:2017 e DGA com amostragem pela NBR 7070 [30]. Editais pedem "análise físico-química completa – NBR 10576" e "cromatografia gasosa – NBR 7070/7274" com O₂, H₂, N₂, CO, CO₂, CH₄, C₂H₆, C₂H₂ e C₂H₄ [46]. O resultado precisa dizer se o óleo "está aceitável ou se há indicação de falhas do tipo arco elétrico, descargas parciais e sobreaquecimento" [47].
- **Consequência:** o óleo é um **resultado de laboratório que chega depois** do serviço de campo e precisa ser anexado ou importado ao laudo.
- **Em aberto:** os limites de DGA (IEEE C57.104-2019 / NBR 7274) não foram obtidos. A tabela de 2017 da NBR 10576 **precisa ser conferida antes de virar critério no app**.

### 2.8 Aterramento

- **Método:** queda de potencial (NBR 15749). É preciso levantar a **curva** de medição, e não anotar um número só: posições das hastes, pontos da curva e valor no patamar. A regra dos 62% é uma alternativa [27]. *Não verificado; fonte secundária da norma.*
- **Limite:** nenhuma norma ABNT consultada tem valor **obrigatório** em ohms. A NBR 14039 "não define" e só "recomenda" 10 Ω, segundo [52]. A NBR 5419 recomendava ~10 Ω em 2005 e retirou o valor em 2015 [14]. Onde existe, **vem da concessionária** (CPFL: 10 Ω em solo úmido e 25 Ω em solo seco) [12] ou do projeto.
  - O modelo precisa de campo de **condição do solo** e de **referência do limite**.

### 2.9 Cabos de MT

- **Medições:** IR por fase, com as demais aterradas (Tab. 100.1), e **continuidade da blindagem**. Investigar acima de 10 Ω por 1.000 pés, cerca de 32,8 Ω/km (conversão nossa) [21].
- **Ensaios de tensão suportável** (CC, VLF ou 50/60 Hz) e diagnósticos (tan δ, descargas parciais): são escolhidos com o dono do cabo [21].
- **Tensões CC máximas de manutenção:** 15 kV → 11 kV (nível 100%) ou 14 kV (133%) (Tab. 100.6.1). *Confiança média: a tabela saiu truncada na extração* [21].

### 2.10 Resumo por ficha (para o modelo de dados)

| Ficha | Medições com campos próprios | Tipo de critério |
|---|---|---|
| Cabo de MT | IR por fase (kV aplicado, MΩ, temperatura, MΩ corrigido), continuidade da blindagem | Tabela NETA ou fabricante; Ω/km |
| Chave seccionadora | Resistência de contato por polo e porta-fusível (µΩ, corrente em A), IR por polo, resistência dos fusíveis | Fabricante ou desvio >50% do menor; fusíveis com diferença ≤15% |
| Disjuntor de MT | IR por polo (aberto e fechado), contato por polo, fiação de controle, ampola (kV, duração, passa/falha), abertura por relé, trip-free/antipump, contador antes/depois, tempos (ms) | Fabricante, desvio entre polos, ≥2 MΩ, passa/falha |
| Relé 50/51 | Ajustes encontrados/deixados, pickup e dropout, tempo medido vs. teórico em 2 pontos, tolerância do fabricante, abertura do disjuntor | Tolerância do fabricante; estudo de coordenação |
| TP/TC | IR, polaridade, relação/erro, excitação, ponto de aterramento | IEEE C57.13, fabricante |
| Transformador | IR entre AT, BT e terra (Tab. 100.5) + PI, TTR em todos os taps, resistência de enrolamento com temperatura, excitação, óleo (link para laudo de laboratório) | Absoluto (tabela), ≤0,5%, ≤2% vs. anterior, NBR 10576 |
| Aterramento | Método, distâncias, pontos da curva, valor no patamar, condição do solo, continuidade | Limite da concessionária ou do projeto |

## 3. Validade profissional e legal do laudo

- **ART (Res. CONFEA 1.137/2023, que revogou a 1.025/2009)** [31][32]:
  - todo contrato, escrito ou verbal, exige ART (art. 3º), registrada **antes do início** da atividade (art. 27);
  - em contrato global com ordens de serviço, faz-se uma ART inicial e **uma ART vinculada para cada OS** (art. 27 §2º);
  - a **ART múltipla** é facultativa. Pode cobrir "contrato cuja prestação do serviço seja caracterizada como periódica", lista as atividades do mês e é registrada **até o último dia útil do mês subsequente** (arts. 33–37);
  - "Serão reputadas como válidas assinaturas eletrônicas, bem como documentos digitais, na forma da lei" (art. 6º parágrafo único) [31]. *Verificado quanto a revogação, ART múltipla periódica e prazo.*
  - A resolução **não diz o que o laudo deve conter**: número da ART ou do CREA impressos são convenção.
  - Edital público pede ART "no início dos serviços", já paga, com a atividade "Manutenção – Subestação abrigada de energia elétrica" e **uma ART para duas subestações** [47].
- **Definições (Res. CONFEA 345/1990)** [41]:
  - "VISTORIA é a constatação de um fato… sem a indagação das causas que o motivaram";
  - "PERÍCIA é a atividade que envolve a apuração das causas";
  - "LAUDO é a peça na qual o perito, profissional habilitado, relata o que observou e dá as suas conclusões".
  - Essas atividades são privativas de engenheiro e exigem ART "para sua plena validade" (arts. 2º a 4º).
  - *Não verificado (espelho do IBAPE; o site do CONFEA não respondeu).* A Res. 1.073/2016 não foi obtida.
- **Quem assina:**
  - **Engenheiro eletricista com ART** é o caminho sem disputa [41][2].
  - **Técnico em eletrotécnica:** a Res. CFT 074/2019, alterada pela 094/2020, dá a ele "Emitir laudos técnicos… de equipamentos de manobra ou proteção", manutenção de "subestações particulares" e ensaio de relés, e o limite de "até 800 kVA, independentemente do nível de tensão" para "projetar e dirigir". A responsabilidade é registrada por **TRT** [42][43][44].
  - O Decreto 90.922/1985 dá ao técnico a execução e coordenação da manutenção, mas só "assistência" em vistoria e perícia [45]. O CONFEA contesta a resolução do CFT [49].
  - **Contestado.** O modelo deve aceitar **ART ou TRT** e o conselho (CREA/CRT), sem decidir quem pode assinar.
- **Assinatura eletrônica** [33][34][38][35]:
  - A Lei 14.063/2020 só torna obrigatória a assinatura qualificada (ICP-Brasil) nos casos que lista, e laudos de engenharia não estão entre eles.
  - A MP 2.200-2 dá **presunção de veracidade** só à ICP-Brasil. Outras assinaturas valem se "admitido pelas partes".
  - A **NR-01 1.6.2** prevê documentos das NR em meio digital "com certificado digital… ICP-Brasil", preservando autenticidade, integridade e rastreabilidade (1.6.4).
  - O CREA-RS aceita a assinatura avançada gov.br para documentos enviados a ele, mas isso não é uma regra sobre laudos.
  - **Inferência:** para um laudo que vai compor o PIE do cliente, a ICP-Brasil é o caminho mais defensável.
- **Guarda:**
  - Nenhuma norma de SST ou do CONFEA fixa prazo. A NR-10 pede documentação "atualizada e sempre disponível" [2].
  - O prazo prescricional geral é de 10 anos (CC art. 205). Reparação civil prescreve em 3 anos (206 §3º V) [39]. No CDC, 5 anos a partir do conhecimento do dano [40].
  - **Inferência:** guardar laudo e dados brutos por ≥10 anos.
- **Calibração** [36][37][2][7]:
  - "A periodicidade dos serviços de calibração é definida pelo proprietário do instrumento". **Não existe "validade" regulatória** do certificado. *Verificado.*
  - A NR-10 nova exige instrumentos "aferidos, calibrados e parametrizados" conforme regulamento, fabricante ou critério do PLH.
  - A NBR 14039 diz "conforme orientação do fabricante".
  - Nenhuma fonte exige laboratório **RBC** (acreditado pelo INMETRO/Cgcre), e os dois editais lidos também não exigem [46][47].
  - **Consequência:** o app registra certificado, data, laboratório e a **política de intervalo do dono**. Alerta de vencimento sim, bloqueio não.

## 4. Fluxo e papéis de uma preventiva de cabine

| Etapa | O que acontece | Documento/registro | Fonte |
|---|---|---|---|
| Contratação | ART registrada antes do início (ou ART vinculada à OS) | ART nº, OS | [31][47] |
| Planejamento | Pedido de desligamento à concessionária (CPFL ≥15 dias; EDP ≥5 dias úteis); fim de semana; contratada trata com a concessionária | Protocolo de desligamento | [12][10][46] |
| Planejamento de segurança | Procedimento de trabalho aprovado por PLH (rotina) ou análise de risco + permissão de trabalho (não rotina), com lista de envolvidos e autorizações, data e condições impeditivas. A PT vale por turno e é arquivada "de forma a permitir sua rastreabilidade" | PT/AR (físico ou digital) | [2] |
| Chegada | Avaliação prévia no local; com anomalia, "a operação não deve ser iniciada" | Registro da avaliação | [2] |
| Com energia | Termografia antes do desligamento | Termogramas | [48][47] |
| Desligamento | 10.5.1 hoje / 10.13.1 a partir de jun/2027; lacre rompido pela concessionária quando aplicável | Checklist de desenergização | [6][2][12] |
| Estado encontrado | Ensaios "as-found" antes da limpeza [50]; contador de operações antes e depois [21] | Valores as-found | [50][21] |
| Execução | Limpeza, reaperto, inspeção visual por equipamento, ensaios elétricos, coleta de óleo | Fichas por equipamento, fotos | [17][46][7] |
| Fechamento técnico | Ensaio geral de funcionamento; abertura do disjuntor por cada relé | Registro funcional | [7][21] |
| Religação | 10.5.2 hoje / 10.13.2 a partir de jun/2027 | Checklist de religação | [6][2] |
| Pós-campo | Resultados de laboratório (físico-química e DGA) chegam depois | Laudo do laboratório | [46][30] |
| Entrega | Laudo final com valores, anomalias, ações corretivas **com prazo**, melhorias, inventário de equipamentos de MT, fotos (com termografia), ART; histórico gráfico e declaração de risco (CESAN) | Laudo + ART | [46][47][30] |
| Aceite | Recebimento provisório e depois definitivo (setor público) | Termos | [47] |

- **Equipe:**
  - pelo menos duas pessoas nas manobras, uma BA5 (NBR 14039 8.1.6) [7];
  - supervisor designado para trabalho em equipe; serviço em MT energizada não pode ser individual [2];
  - treinamento: "Básico" de 40 h mais "Complementar de Média e Alta Tensão – SEC" de 16 h, com reciclagem bienal [2]. A cabine do consumidor é SEC, e o "NR-10 SEP" que prestadores anunciam não é o curso aplicável no texto novo [2].
- **Tamanho típico da equipe e duração do desligamento:** **não encontrados** nas fontes, nem nos editais.
- **Onde fica o esforço de documentação:**
  - fichas por equipamento com valores por fase e polo;
  - fotos;
  - resultados de laboratório que chegam depois;
  - lista de ações com prazo;
  - inventário com dados de placa [46][47].
- **Referência de preço:** propostas de R$ 10 mil a R$ 120 mil para duas subestações com três transformadores de 500 kVA [47]. *Fonte única, 2020.*

## 5. Glossário PT-BR ↔ EN

A coluna EN é uma **tradução proposta** pelo pesquisador, exceto onde a própria fonte usa o termo em inglês.

| Termo (PT-BR) | Definição curta | EN proposto | Fonte |
|---|---|---|---|
| Laudo técnico | Peça em que o profissional habilitado "relata o que observou e dá as suas conclusões" | Technical report (signed findings and conclusions) | [41] |
| Vistoria | "Constatação de um fato… sem a indagação das causas" | Survey / condition inspection | [41] |
| Perícia | "Apuração das causas que motivaram determinado evento" | Forensic investigation | [41] |
| Parecer técnico | Atividade técnica listada para ART; definição normativa não obtida | Technical opinion | [12] |
| Relatório de inspeção | Relatório exigido pela NR-10 com medidas de prevenção, plano de ação e cronograma | Inspection report | [2] |
| Relatório de ensaio | Valores medidos antes e depois da intervenção, comparados a referências | Test report | [21] |
| As-found / as-left | Condição encontrada / condição deixada | As-found / as-left | [21] |
| ART | "Define, para os efeitos legais, os responsáveis técnicos" (sistema CONFEA/CREA) | Technical responsibility record (engineer) | [31] |
| ART múltipla | ART mensal de serviços de rotina ou periódicos | Monthly multi-job ART | [31] |
| TRT | Equivalente da ART para técnicos industriais (CFT/CRT) | Technical responsibility record (technician) | [44] |
| PIE | "Memória dinâmica de informações pertinentes às instalações e aos trabalhadores" | Electrical installation record/dossier | [2] |
| PLH | Qualificado pelo sistema oficial de ensino "e com registro no competente conselho de classe" | Licensed professional (engineer/technician of record) | [2] |
| Trabalhador qualificado / capacitado / autorizado | Formado em curso da área elétrica / treinado sob PLH / com anuência formal, ASO e treinamento | Qualified / trained / authorized worker | [2] |
| SEP / SEC | SEP: geração, transmissão e distribuição "até a medição, inclusive"; SEC: sistema de consumo depois da medição | Power system (utility side) / consumer system | [2] |
| BT / MT / AT | MT (texto novo): >1 kV até 36,2 kV CA; no texto vigente, AT é >1 kV | LV / MV / HV | [2][6] |
| ZR / ZC / ZL | Zona de risco, controlada e livre (13,8 kV: Rr 0,38 m, Rc 1,38 m) | Restricted / controlled / free zone | [2] |
| Desenergização; impedimento de reenergização | Sequência que libera a instalação para trabalho; garantia de não reenergização | De-energization; lockout (re-energization prevention) | [2][6] |
| Aterramento temporário | Ligação à terra "destinada a garantir a equipotencialidade" durante a intervenção | Temporary protective grounding | [2] |
| Permissão de trabalho (PT); análise de risco (AR); condições impeditivas | Autorização por turno; avaliação dos riscos da tarefa; situações que impedem o serviço | Permit to work; risk assessment; stop-work conditions | [2] |
| BA4 / BA5 | Competência de pessoas: advertidas / qualificadas | Instructed / skilled person | [7] |
| Cabine primária; subestação abrigada | Entrada de MT do consumidor; atividade de ART "Manutenção – Subestação abrigada de energia elétrica" | Indoor consumer MV substation | [47] |
| Cubículo convencional / blindado | Montagem em alvenaria / em invólucro metálico | Open cubicle / metal-clad switchgear | [47] |
| Mufla / terminação | Terminal de cabo de MT | Cable termination | [46] |
| Relé secundário 50/51 | Relé alimentado por TC/TP; funções instantânea (50) e temporizada (51) de sobrecorrente | Secondary protection relay, ANSI 50/51 | [11][21][47] |
| Disjuntor PVO | Disjuntor a pequeno volume de óleo | Minimum-oil circuit breaker | [25] |
| TP / TC | Transformador de potencial / de corrente | VT / CT | [21][46] |
| Megôhmetro; micro-ohmímetro | Instrumentos de resistência de isolamento e de contato | Insulation tester (megger); micro-ohmmeter (DLRO) | [23][27] |
| Relação de transformação (TTR) | Ensaio de relação de espiras | Turns-ratio test | [21][46] |
| PI / DAR | Índice de polarização (10 min/1 min) / de absorção (60 s/30 s) | Polarization index / dielectric absorption ratio | [23] |
| Rigidez dielétrica; TIF; índice de neutralização; teor de água | Ensaios físico-químicos do óleo | Breakdown voltage; interfacial tension; acid number; water content | [25] |
| Cromatografia gasosa | Análise de gases dissolvidos no óleo | DGA | [46] |
| Termografia | Inspeção infravermelha com a instalação energizada | Infrared thermography | [47] |
| Lacre | Selo da concessionária em compartimento ou relé | Utility seal | [12][10] |
| Desligamento programado | Desligamento pedido à concessionária com antecedência | Planned outage | [12] |
| C/NC/NA | Conforme / não conforme / não aplicável. Convenção de checklist **sem fonte normativa encontrada** | Compliant / non-compliant / N/A | — |

## Insights que só a combinação mostra

1. **A virada de 01/06/2027 aumenta o mercado e muda o laudo ao mesmo tempo.**
   - O fim do corte de 75 kW obriga todo dono de cabine a ter PIE sob PLH [6][2].
   - A seção de segurança (10.5.1 → 10.13.1), os rótulos de classe de tensão (AT → MT) e a base legal do plano de ação (10.2.4 g → 10.7.11) mudam na mesma data.
   - Um laudo que **escolhe sozinho a versão da NR-10 pela data de execução** é ao mesmo tempo argumento de venda e necessidade técnica. *Inferência a partir de fontes de alta confiança.*
2. **O critério de aceitação é o ponto fraco do laudo em papel e o ponto forte possível do app.**
   - As normas brasileiras não fixam limites [7].
   - Os limites existentes dependem da edição e da fonte: NETA 2007 vs. 2019, NBR 10576 de 2006 vs. 2017 [22][21][25][26].
   - A diferença entre critérios pode chegar a duas ordens de grandeza (NETA 5.000 MΩ vs. CPFL 30 MΩ) [21][12].
   - Um app que grava **critério + fonte + edição** e compara com o **histórico** (≤2% no enrolamento, desvio entre polos) produz um laudo defensável em auditoria. O papel e o Excel não fazem isso bem. *Inferência.*
3. **Periodicidade como dado declarado, não como constante.**
   - NR-10 ("periodicamente"), NBR 14039 ("adequar-se") e CPFL (o consumidor declara a periodicidade de revisão) apontam na mesma direção: quem decide o intervalo é o PLH, e ele precisa justificar [2][7][12].
   - O laudo pode trazer "próxima intervenção recomendada + justificativa" e alimentar o cronograma do 10.7.11.
4. **Os editais públicos descrevem o laudo que o fasor deveria gerar.**
   - Dois compradores independentes pedem as mesmas peças: ensaios por equipamento, ações corretivas com prazo, fotos com termografia, inventário e ART [46][47].
   - Isso é convergência externa, não só o modelo de um cliente.

## Evidência contrária

A rodada de red team não foi executada (configuração `off`). Mesmo assim, apareceram contradições com crenças comuns:

- **"A NBR 14039 exige manutenção anual":** o texto contradiz [7][8].
- **"A NR-10 exige manutenção anual":** nenhum dos dois textos diz isso [2][6].
- **"Aterramento tem de ser ≤10 Ω por norma":** a NBR 5419:2015 retirou o valor [14]. O limite vem da concessionária [12].
- **"A tensão de ensaio de 15 kV é 5 ou 10 kV":** a NETA pede no mínimo 2,5 kV CC [21]. Um edital de companhia de saneamento (CESAN) lista instrumentos de 1, 2,5, 5 e 10 kV [30], o que indica que a tensão aplicada é uma **escolha a ser registrada**.

## Recomendações

| # | Recomendação | Base de confiança | Alimenta |
|---|---|---|---|
| R1 | **Versionar a base normativa por laudo:** entidade "referência normativa" (norma, edição, item) e resolução automática da NR-10 pela **data de execução** (antes ou depois de 01/06/2027). Trocar a seção 5 fixa do FO.SERV-03 (10.5.1) por texto gerado pela versão aplicável | Alta [1][2][6] | PRD (modelo de dados, geração do laudo) |
| R2 | **Critério de aceitação como dado:** para cada ensaio, guardar `referência` (fonte + edição + tabela), `tipo` (mínimo absoluto, desvio entre polos, desvio vs. anterior, desvio vs. placa ou calculado, passa/falha, fabricante), `limite` e `unidade`. Conclusão calculada por fase e polo, **editável e justificada pelo PLH**. Não fixar 400 MΩ | Alta para NETA [21]; média para ABNT secundária [25][27] | PRD, arquitetura |
| R3 | **Campos de contexto obrigatórios na medição:** tensão de ensaio (kV), corrente de ensaio (A), tempo (30 s / 1 min / 10 min), temperatura e tipo de isolamento para corrigir a 20 °C, umidade, condição do solo (aterramento) | Alta [21][23][28][12] | PRD |
| R4 | **Histórico por equipamento (TAG) desde o MVP**, mesmo sem tela de comparação: vários critérios são "vs. anterior" (≤2% enrolamento, PI vs. histórico) | Alta [21] | Arquitetura (identidade estável do equipamento entre visitas) |
| R5 | **Plano de ação estruturado:** item com achado, foto, ação, prioridade/risco, **prazo** e responsável, alimentando um cronograma. Base: 10.2.4 g hoje e 10.7.11 em 2027 | Alta [1][6][46][47] | PRD; argumento de venda |
| R6 | **Novas fichas ou blocos:** **relé 50/51** (NR-10 10.12.7, NBR 14039 8.2.2.4, editais), **para-raios** e **muflas**, **termografia** (antes do desligamento), **resultado de laboratório de óleo** (físico-química + DGA, anexado depois) e **ensaio geral de funcionamento** | Alta para relé [2][7][21][47]; média para o resto [46][48] | PRD (escopo das fichas) |
| R7 | **Aterramento completo:** método, geometria, pontos da curva, valor no patamar, limite e fonte do limite (concessionária ou projeto), mais continuidade (SPDA) | Média [12][13][27] | PRD |
| R8 | **Papéis separados:** PLH responsável (nome, título, conselho CREA/CRT, registro, **ART/TRT**) diferente dos executores autorizados. Aceitar ART ou TRT sem validar quem pode assinar | Alta para a separação [2]; contestado para técnico [42][49] | PRD, modelo de usuários |
| R9 | **Instrumentos:** certificado, data, laboratório (e acreditação RBC, se houver) e **intervalo definido pelo dono**. Alerta de vencimento, sem bloqueio | Alta [36][37][2] | PRD |
| R10 | **Saída pronta para o PIE:** PDF íntegro e rastreável, com hash e versão, preparado para assinatura **ICP-Brasil** (mesmo que a assinatura fique fora do MVP). Política de guarda ≥10 anos | Média (inferência sobre texto de alta confiança) [38][34][39] | Arquitetura |
| R11 | **Argumentos de venda que se sustentam:** (a) "laudo pronto para o PIE que a NR-10 exige de todo dono de cabine a partir de 01/06/2027"; (b) "plano de ação com cronograma, conforme o 10.7.11"; (c) "critérios rastreáveis por norma e edição"; (d) "atende aos itens de edital público". **Não usar** "exigido pela seguradora" nem "a NBR 14039 exige manutenção anual" | Alta para (a)–(c) [1][2]; alta para (d) [46][47]; baixa para seguradora [18] | Brief, marketing |
| R12 | **Parâmetros por concessionária** (limite de terra, antecedência de desligamento, o que é lacrado) como cadastro configurável, começando pela CPFL | Alta para CPFL [12]; as demais não foram lidas | Arquitetura (cadastros) |

## Questões em aberto

| Questão | O que é preciso para responder |
|---|---|
| Limites em serviço da **NBR 10576:2017** para ≤72,5 kV (água 25 ou 40 ppm?) | Tabela 3 da norma (catálogo ABNT/Target) ou laudo de laboratório de óleo que cite a edição de 2017 |
| **Limites de DGA** (IEEE C57.104-2019, NBR 7274/IEC 60599) e periodicidade de coleta | PDF da C57.104-2019; laudo de laboratório brasileiro |
| Mudanças na **NETA MTS-2023** em relação à 2019 | Comprar ou consultar a MTS-2023 |
| **Revisão da NBR 14039** publicada? A seção 8 mudou? | Catálogo ABNT a partir de out/2026 |
| Enel, Light e Neoenergia: lacre de relé, limite de terra, antecedência de desligamento | Ler as normas de fornecimento em tensão primária |
| Texto ABNT da **NBR 5419:2026** (1 ou 3 anos; continuidade) e da **NBR 5410 seção 8** | Catálogo ABNT |
| **Res. CONFEA 1.073/2016** e situação da disputa CONFEA × CFT (técnico assinar laudo de cabine) | Portal de normativos do CONFEA; jurisprudência |
| Tamanho típico da equipe e duração do desligamento | Entrevista com prestadores (a Fasor, por exemplo); termos de referência (TRs) da UFF e da UFU |
| Classes de exatidão da NBR 6855/6856 e critérios de SF6 | Normas ABNT; manuais de fabricante |
| Exigência real de **seguradoras** | Condições gerais de apólice patrimonial ou guia de prevenção de perdas |
| **ANEEL REN 1.000/2021** sobre responsabilidade e inspeção das instalações do consumidor | Texto da REN no site da ANEEL |

## Apêndice de fontes

| # | Afirmação/achado que sustenta | Publicador | Data de pub. | Acesso | Confiança |
|---|---|---|---|---|---|
| [1] | Portaria 737/2026: vigência, transição, 10.7.11 | [MTE (gov.br)](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2026-1/portaria-mte-no-737-nova-nr-10.pdf) | 2026-06 | 2026-09-18 | alta |
| [2] | Texto da NR-10 a partir de 2027: 10.7, 10.8, 10.12, 10.13, 10.15, glossário, zonas | [MTE (gov.br)](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-10.pdf) | 2026-06 | 2026-09-18 | alta |
| [3] | Verificação: reprodução da Portaria 737 (10.7.11, 10.13.1) | [Normas Legais](https://www.normaslegais.com.br/legislacao/portaria-mte-737-2026.htm) | 2026-06 | 2026-09-18 | alta |
| [4] | Verificação: 10.13.1 "e" com proteção contra arco | [O Setor Elétrico (Bizzo)](https://www.osetoreletrico.com.br/risco-de-arco-eletrico-na-nova-nr-10/) | 2026-09 | 2026-09-18 | alta |
| [5] | Verificação: DOU 01/06/2026, vigência 01/06/2027 | [Grupo BR MED](https://grupobrmed.com.br/blog/nova-nr-10-2026/) | 2026-06 | 2026-09-18 | média |
| [6] | NR-10 vigente (598/2004 + 915/2019): 10.2.4, 10.4.4, 10.5.1, AT | [Guia Trabalhista](https://www.guiatrabalhista.com.br/legislacao/nr/nr10.htm) | 2019-12 | 2026-09-18 | média-alta |
| [7] | NBR 14039:2021 seções 7 e 8 (cópia licenciada não oficial) | [ABNT via FIC](https://faculdadefic.edu.br/downloads/abnt-nbr-14039.pdf) | 2021-12 | 2026-09-18 | alta (texto) / média (canal) |
| [8] | Comentário: periodicidade caso a caso (NBR 14039, 8.2) | [O Setor Elétrico (Possi)](https://www.osetoreletrico.com.br/wp-content/uploads/2011/08/Ed66_fasc_instalacoesMT_cap7.pdf) | 2011-08 | 2026-09-18 | média |
| [9] | Revisão da NBR 14039 prevista para 2026 (IEC 61936-1, VLF) | [O Setor Elétrico](https://www.osetoreletrico.com.br/com-publicacao-prevista-para-2026-revisao-da-abnt-nbr-14039-incorpora-padroes-internacionais-a-norma/) | 2025-10 | 2026-09-18 | média |
| [10] | EDP: laudos na ligação, lacre de relé, aviso de 5 dias úteis | [EDP](https://www.edp.com.br/media/4migwdxn/ptdtpdn00094_v1.pdf) | 2023-12 | 2026-09-18 | alta |
| [11] | Cemig ND-5.3: ajuste de relé pelo RT, óleo na religação, relé secundário | [Cemig](https://www.cemig.com.br/wp-content/uploads/2025/10/nd5_3_000001p.pdf) | 2023-09 | 2026-09-18 | alta |
| [12] | CPFL GED-2855: 10/25 Ω, 15 dias, lacres, periodicidade declarada, 30/50 MΩ | [CPFL](https://sites.cpfl.com.br/documentos-tecnicos/GED-2855.pdf) | 2026-06 | 2026-09-18 | alta |
| [13] | NBR 5419:2026: periodicidade 1/3 anos; continuidade | [Token Engenharia](https://tokenengenharia.com.br/nbr-5419-atualizada-2026/) | 2026-03 | 2026-09-18 | média-baixa |
| [14] | 10 Ω fora da NBR 5419:2015 | [Félix Engenharia](https://www.felixengenharia.com.br/10-ohms-em-qualquer-epoca-do-ano-e-a-nova-nbr5419) | 2016-06 | 2026-09-18 | média |
| [15] | 10 Ω e a nova NBR 5419 | [O Setor Elétrico](https://www.osetoreletrico.com.br/como-ficou-o-jargao-10-ohms-em-qualquer-epoca-do-ano-para-o-caso-de-aterramento-nao-natural-com-a-nova-abnt-nbr-5419/) | 2016 | 2026-09-18 | média |
| [16] | Tabela de periodicidade do mercado (termografia e DGA semestrais) | [MAQ Potência](https://www.maqpotencia.com/periodicidade-de-manutencao-em-cabine-primaria) | n.d. | 2026-09-18 | baixa (mercado) |
| [17] | Escopo, entregáveis e preventiva anual "definida por avaliação técnica" | [Alta Tensão SE](https://www.altatensaose.com.br/manutencao-preventiva-de-cabine-primaria) | n.d. | 2026-09-18 | média (mercado) |
| [18] | Alegação de exigência de laudo por seguradoras | [Godoy Engenharia](https://godoyeng.com.br/laudo-eletrico-para-seguradora) | n.d. | 2026-09-18 | baixa |
| [19] | NFPA 70B-2023: intervalos por condição | [Eaton](https://www.eaton.com/content/dam/eaton/services/eess/eess-documents/eaton-nfpa-70b-white-paper-wp027024Xen.pdf) | 2023 | 2026-09-18 | baixa (trecho) |
| [20] | NETA Tab. 100.1 (reprodução) | [TestGuy](https://forum.testguy.net/content/240-Insulation-Resistance-Test-Values) | ~2019 | 2026-09-18 | média |
| [21] | ANSI/NETA MTS-2019: §7.2.2, 7.3.3, 7.5.1, 7.6.3, 7.9, 7.10; Tab. 100.1, 100.4, 100.5, 100.6.1, 100.14, 100.19 (espelho não autorizado) | [NETA via pdfcoffee](https://pdfcoffee.com/ansi-netamts-2019-pdf-free.html) | 2019 | 2026-09-18 | alta (texto) |
| [22] | NETA ATS-2007 Tab. 100.1 (valores diferentes) | [NETA via Yumpu](https://www.yumpu.com/en/document/view/10973748/neta-2007-acceptance-testing-specifications/213) | 2007 | 2026-09-18 | média |
| [23] | Megger: PI/DAR, correção de temperatura, regra de 1 MΩ/kV, IEEE 43 | [Megger (via Instrumart)](https://www.instrumart.com/assets/Megger-Guide-to-Insulation-Testing.pdf) | 2006 | 2026-09-18 | alta |
| [24] | Verificação: kV+1 como regra da IEEE 43 para motores | [The Pump & Motor Works](https://www.pmwus.com/understanding-ieee-43-and-motor-insulation-resistance-testing-2/) | n.d. | 2026-09-18 | média |
| [25] | NBR 10576:2006: limites do óleo em serviço (Grupo 1), PVO, TI | [SNPTEE/CGTI](https://www.cgti.org.br/publicacoes/wp-content/uploads/2016/03/OS-NOVOS-PARA%CC%82METROS-DE-AVALIAC%CC%A7A%CC%83O-DA-QUALIDADE-DO-O%CC%81LEO-MINERAL-ISOLANTE-EM-SERVIC%CC%A7O-TRAZIDAS-PELA-RECENTE-REVISA%CC%83O-DA-NBR-10576-06-O%CC%81LEO-MINERAL-ISOLANTE-DE-EQUIPAMENTOS-ELE%CC%81TRICOS.pdf) | 2007-10 | 2026-09-18 | média (contestado) |
| [26] | NBR 10576:2017: água ≤40 ppm (≤72,5 kV) | [Treetech](https://sac.treetech.com.br/en/support/solutions/articles/69000795769-standard-h%E2%82%82-and-h%E2%82%82o-alarm-levels) | n.d. | 2026-09-18 | baixa-média |
| [27] | TCC UTFPR: contato sem µΩ normativo, TTR ±0,5% (NBR 5356), queda de potencial | [UTFPR (Assmann)](https://repositorio.utfpr.edu.br/jspui/bitstream/1/30532/1/testesensaiossubestacaomedia.pdf) | 2022 | 2026-09-18 | média |
| [28] | IEC 62271-1: corrente de 50 A até a nominal; ≤1,2 × Ru | [BIS/IEC (archive.org)](https://archive.org/stream/gov.in.is.iec.62271.1.2007/is.iec.62271.1.2007_djvu.txt) | 2007 | 2026-09-18 | alta (ed. 2007) |
| [29] | Tolerância do relé pelo manual do fabricante | [CONPROVE](https://conprove.com/wp-content/uploads/2022/07/Tutorial_Teste_Rele_PEXTRON_URP6000_Direcional_de_Sobrecorrente_CTC.pdf) | 2022-07 | 2026-09-18 | alta |
| [30] | CESAN: Grupo 1 (NBR 10576:2017), DGA, relés 50/51, instrumentos de 1–10 kV, laudo com gráfico histórico e risco | [CESAN](https://www.cesan.com.br/wp-content/uploads/2019/08/ANEXO-VIII.pdf.pdf) | 2019-06 | 2026-09-18 | alta |
| [31] | Res. CONFEA 1.137/2023: ART, ART múltipla, assinatura eletrônica | [CONFEA (via CREA-RS)](https://www.crea-rs.org.br/site/documentos/resolucao_1137.pdf) | 2023-04 | 2026-09-18 | alta |
| [32] | Verificação: revogação da 1.025 e prazo da ART múltipla | [Crea-TO](https://crea-to.org.br/entra-em-vigor-a-nova-resolucao-do-confea-que-dispoe-sobre-art-acervo-tecnico-profissional-e-acervo-operacional/) | 2023-04 | 2026-09-18 | alta |
| [33] | Lei 14.063/2020: classes de assinatura eletrônica | [Planalto](https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm) | 2020-09 | 2026-09-18 | alta |
| [34] | MP 2.200-2/2001, art. 10 | [Planalto](https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm) | 2001-08 | 2026-09-18 | alta |
| [35] | Manual CREA-RS: assinatura gov.br | [CREA-RS](https://www.crea-rs.org.br/site/documentos/Manual_0951601_Manual_Assinaturas_Eletronicas_via_Gov.br__v2_.pdf) | 2022-03 | 2026-09-18 | média |
| [36] | Calibração: periodicidade definida pelo proprietário | [INMETRO](https://www.gov.br/inmetro/pt-br/acesso-a-informacao/perguntas-frequentes/acreditacao/qual-o-prazo-de-validade-dos-certificados-de-calibracao) | 2026-01 | 2026-09-18 | alta |
| [37] | Verificação: validade do certificado de calibração | [PortalISO](https://calibracao-de-equipamentos.portaliso.com/qual-a-validade-de-um-certificado-de-calibracao/) | n.d. | 2026-09-18 | média |
| [38] | NR-01 1.6.2–1.6.5: documentos digitais com ICP-Brasil | [MTE (gov.br)](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/nr-01-atualizada-2025-i-1.pdf) | 2025-05 | 2026-09-18 | alta |
| [39] | Código Civil: arts. 205, 206 e 618 | [Planalto](https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm) | 2002 (compilado) | 2026-09-18 | alta |
| [40] | CDC: arts. 14 e 27 | [Planalto](https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm) | 1990 (compilado) | 2026-09-18 | alta |
| [41] | Res. CONFEA 345/1990: vistoria, perícia, laudo; ART para validade | [CONFEA (via IBAPE)](https://ibape-nacional.com.br/documentos/Resolucao_CONFEA_0345_90.pdf) | 1990-08 | 2026-09-18 | média-alta |
| [42] | Res. CFT 074/2019: atribuições do técnico em eletrotécnica | [Normas Legais](http://www.normaslegais.com.br/legislacao/resolucao-cft-74-2019.htm) | 2019-07 | 2026-09-18 | alta (texto) / contestado |
| [43] | Res. CFT 094/2020: novo art. 5º (800 kVA) | [CRT-01](https://crt01.gov.br/wp-content/uploads/2022/09/Todas-as-Resolucoes-CFT-de-Atribuicoes-Tecnicos.pdf) | 2020-02 | 2026-09-18 | alta |
| [44] | Técnicos: 800 kVA e TRT | [CRT-SP](https://crtsp.gov.br/tecnicos-em-eletrotecnica-instalacoes-de-baixa-media-e-alta-tensao/) | 2021-06 | 2026-09-18 | média |
| [45] | Decreto 90.922/1985, art. 4º | [Planalto](https://www.planalto.gov.br/ccivil_03/decreto/antigos/d90922.htm) | 1985-02 | 2026-09-18 | alta |
| [46] | TR da Câmara de Indaiatuba: ensaios por equipamento, óleo, laudo final com ART, fim de semana com CPFL | [Câmara Municipal de Indaiatuba](https://indaiatuba.sp.leg.br/wp-content/uploads/2025/10/Termo-de-Referencia-Manutencao-Preventiva-da-Cabine-Primaria.pdf) | 2024-04 | 2026-09-18 | alta |
| [47] | Projeto Básico do TRT-12: ART no início, relé 50/51, termografia, relatório com ações e prazo, preços | [TRT-12](https://portal.trt12.jus.br/sites/default/files/2020-10/Projeto_b%C3%A1sico_CD%2010318_20_Rodrigo.pdf) | 2020-10 | 2026-09-18 | alta |
| [48] | Termografia energizada antes do desligamento; laudo com plano de ação | [INSP-THERM](https://insp-therm.com.br/manutencao-em-cabine-primaria-manutencao-preventiva-em-cabine-primaria/) | n.d. | 2026-09-18 | baixa-média (trecho) |
| [49] | Proposta do CONFEA para revogar a Res. CFT 74/2019 (só o título) | [CONFEA](https://www.confea.org.br/midias/2023-05/Proposta%20019%202019%20CCEEE%20-%20Revoga%C3%A7%C3%A3o%20da%20Resolu%C3%A7%C3%A3o%20n%C2%BA%2074%202019%20do%20CFT.pdf) | 2023-05 | 2026-09-18 | baixa |
| [50] | NETA MTS-2001: critério de 50% na resistência de contato | [NETA via HV Service](http://www.hvserviceinc.com/userfiles/file/pdfs/neta-acceptance-7-6-1-2.pdf) | 2001 | 2026-09-18 | alta (texto) |
| [51] | Revisão da NBR 14039 em consulta nacional | [GreenGold Engenharia](https://greengoldengenharia.com.br/blog/2026/05/08/revisao-da-nbr-14039-entra-em-consulta-nacional-em-2026-e-moderniza-instalacoes-eletricas-de-media-tensao-em-projetos-prediais/) | 2026-05 | 2026-09-18 | baixa (trecho) |
| [52] | A NBR 14039 "não define" valor de terra, só "recomenda" 10 Ω | [Canal Solar](https://canalsolar.com.br/projeto-eletrico-e-procedimento-de-conexao-de-usina-solar-em-media-tensao/) | n.d. | 2026-09-18 | baixa (trecho) |

## Mapa de validade

As datas foram calculadas com `recon_kit.py staleness`, usando estas janelas: regulatório 6 meses, legal 12, critério técnico 36, prática de mercado 18, fluxo de trabalho 18. Para textos legais cuja vigência foi conferida nesta execução na fonte oficial, a data-base é 2026-09-18.

| Rechecar em | Situação | Classe | Afirmação |
|---|---|---|---|
| 1991-08-02 | **vencida** | legal | [41] Definições da Res. CONFEA 345/1990 (checar se continua vigente, com a Res. 1.073/2016) |
| 2009-01-01 | **vencida** | critério técnico | [23] Faixas de PI/DAR da Megger (2006) |
| 2010-01-01 | **vencida** | critério técnico | [28] IEC 62271-1:2007 (existe edição 2017) |
| 2010-10-01 | **vencida** | critério técnico | [25] NBR 10576 ed. 2006 (vigente: 2017; contestado) |
| 2021-02-13 | **vencida** | legal | [42] Res. CFT 074/2019 e disputa com o CONFEA |
| 2022-01-01 | **vencida** | critério técnico | [21] NETA MTS-2019 (existe MTS-2023) |
| 2024-04-03 | **vencida** | legal | [31] Res. CONFEA 1.137/2023 (checar alterações) |
| 2024-06-15 | **vencida** | regulatório | [10][11] Normas EDP/Cemig (checar revisões) |
| 2024-12-03 | **vencida** | critério técnico | [7] NBR 14039:2021 (revisão anunciada para 2026) |
| 2025-10-15 | **vencida** | fluxo de trabalho | [46][47] Editais públicos (padrão de 2020–2024) |
| 2026-12-01 | ok | regulatório | [1][2] NR-10 nova (rechecar antes de 01/06/2027) |
| 2026-12-01 | ok | prática de mercado | [17][18] Preventiva anual; alegação sobre seguradoras |
| 2026-12-12 | ok | regulatório | [12] CPFL GED-2855 v35 |
| 2027-03-18 | ok | regulatório | [6] NR-10 vigente (deixa de valer em 01/06/2027); [9] revisão da NBR 14039; [36] calibração; [38] NR-01 |
| 2027-09-18 | ok | legal | [33][34] Assinaturas; [39][40] Código Civil e CDC |
| 2029-03-10 | ok | critério técnico | [13] NBR 5419:2026 |

**Recheque mais urgente:** 10 afirmações já estão vencidas pelo critério de janela, quase todas por **edição de norma**: NETA 2019 → 2023, NBR 10576 2006 → 2017, IEC 62271-1 2007 → 2017, NBR 14039 em revisão. Antes de gravar critérios no app, confira as edições vigentes da NETA MTS, da NBR 10576 e da NBR 14039. A data mais antiga de recheque é 1991-08-02 (Res. 345/1990). Refresh (atualizar a pesquisa) e Deepen (aprofundá-la) cuidam disso.
