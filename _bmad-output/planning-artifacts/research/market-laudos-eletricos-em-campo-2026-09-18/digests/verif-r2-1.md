# Digest de verificação — rodada 2, lote 1 (acesso 2026-09-18)

Método: leitura do PDF oficial da Portaria MTE nº 737/2026 (texto extraído localmente com pdftotext a partir do arquivo baixado do gov.br) + fontes secundárias independentes. Foram feitas cerca de 20 chamadas de ferramenta e lidas cerca de 13 fontes.

## Verificações

### 1. Portaria MTE nº 737/2026 revisa a NR-10; vigência a partir de 01/06/2027
- **Status:** VERIFIED
- **Fonte original:** gov.br/MTE
- **Fonte primária relida:** PDF oficial "Portaria MTE nº 737 (Nova NR-10)" — https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2026-1/portaria-mte-no-737-nova-nr-10.pdf (MTE, 2026). O cabeçalho diz "PORTARIA MTE Nº 737, DE 29 de MAIO DE 2026 (DOU de 01/06/26 - Seção 1)"; o Art. 5º diz "Esta Portaria entra em vigor 1 (um) ano após a sua publicação".
- **Fontes independentes:**
  - RS Data, "Nova NR-10: análise técnica…" — https://www.rsdata.com.br/nova-nr-10-analise-tecnica-mudancas-pie-treinamentos-fiscalizacao/ (pub. 2026-06-01). Fala em "vacância geral de 1 ano" e na regra específica da alínea "e" do 10.6.4.
  - SOC, blog de SST — https://www.soc.com.br/blog-de-sst/nr-10-foi-atualizada-entenda-o-que-muda-para-as-empresas-com-a-portaria-mte-no-737-2026/ (pub. 2026-06-02). Informa transição de 12 meses e vigência em junho/2027.
  - Top Elétrica — https://www.topeletrica.com.br/2026/09/04/prontuario-instalacoes-eletricas-pie-nr10-2027/ (pub. 2026-09-04). Diz que o texto atual vale "até 31/05/2027" e o novo "a partir de 01/06/2027".
- **Nota (disposições transitórias):**
  - Art. 3º: a alínea "e" do 10.6.4 (DR de alta sensibilidade em áreas molhadas de edificações não residenciais) entra em vigor 1 ano após a vigência da Portaria para instalações existentes, ou seja, cerca de 01/06/2028.
  - Art. 4º: revoga a Portaria MTE 598/2004 e a MTPS 508/2016.
  - Retificação publicada no DOU de 24/06/26, Seção 1, sobre o item 10.8.4 (módulos de treinamento). A publicação original está no DOU de 01/06/2026, págs. 167/173.

### 2. No texto novo, o PIE é exigido de quem integra o SEP ou atua em MT/AT, e o limiar de 75 kW some
- **Status:** VERIFIED (a contradição está resolvida, com ressalvas)
- **Fonte original:** gov.br/MTE
- **Fonte primária:** o mesmo PDF oficial, item 10.15.6: "A documentação descrita nos itens 10.15.4 e 10.15.5 deve ser organizada na forma de Prontuário das Instalações Elétricas (PIE), sob responsabilidade de PLH, para as organizações que: a) integram o SEP; ou b) realizem atividades em instalações elétricas com média e alta tensão." A string "75 kW" e a expressão "carga instalada" não aparecem em nenhum lugar do texto novo (busca no texto integral).
- **Fontes independentes:**
  - RS Data (pub. 2026-06-01): "o antigo critério linear de 75 kW foi extinto".
  - Top Elétrica (pub. 2026-09-04): o item 10.2.4 atual exige PIE de "estabelecimentos com carga instalada superior a 75 kW", e o texto novo "deixa de usar o limite de 75 kW".
- **Nota (como a contradição se resolve):** as duas regras valem, mas em períodos diferentes.
  - Até 31/05/2027 vale o texto antigo: item 10.2.4, carga instalada acima de 75 kW.
  - A partir de 01/06/2027 vale o texto novo: item 10.15.6, SEP ou MT/AT.
- **Ressalvas:**
  - A alínea (b) usa a expressão "realizem atividades em instalações elétricas com média e alta tensão". Ela não diz de forma literal "possuam instalação de MT". Por isso, não está claro se o dono de uma cabine primária que terceiriza toda a manutenção fica obrigado a ter o PIE. É uma questão de interpretação, e não foi achado parecer oficial sobre isso.
  - O conteúdo do PIE passa a ser o dos itens 10.15.4 (trabalhadores autorizados) e 10.15.5 (áreas classificadas), mais os procedimentos de emergência do 10.15.6.1.
  - Empresas só de BT com carga acima de 75 kW deixam de ser obrigadas a ter o PIE.

### 3. O PIE novo inclui relatórios de testes de isolação, medições de aterramento e relatório de inspeção com plano de ação/cronograma; meio eletrônico é aceito
- **Status:** DISPUTED (verdadeiro só em parte; a numeração e o enquadramento estão errados)
- **Fonte original:** gov.br/MTE
- **Fonte primária:** o mesmo PDF oficial. O que o texto diz, item por item:
  - **Testes de isolação — confirmado, mas o objeto é outro.** O 10.15.4 "d" fala em "relatórios dos testes de isolação elétrica realizados em equipamentos, ferramentas, dispositivos, equipamentos de proteção individual e coletivo". Isso se refere aos ensaios dielétricos de ferramental, EPI e EPC do 10.14.4. Não são ensaios de transformador, cabo ou disjuntor da instalação. O item faz parte do PIE via 10.15.6.
  - **Aterramento — está no texto, mas fora do PIE.** O 10.15.3 diz "Toda a organização deve dispor de projeto elétrico [...] e documentação das inspeções e medições dos sistemas de aterramentos elétricos". É obrigação de TODA organização, mas não aparece na lista do PIE. Pelo 10.15.6 e pelo glossário ("Documentos técnicos do PIE"), o PIE é formado só pelos itens 10.15.4, 10.15.5 e 10.15.6.1.
  - **Relatório de inspeção com plano de ação e cronograma — está no texto, mas fora do PIE.** O 10.7.11 diz "A organização deve inspecionar as instalações elétricas, elaborando e mantendo relatório com indicação de medidas de prevenção a serem adotadas com respectivo plano de ação e cronograma de adequação". O item está no capítulo de medidas administrativas, vale para todas as organizações, não fixa periodicidade e não está listado no PIE.
  - **Meio eletrônico — confirmado.** O 10.15.1 diz que a documentação "pode ser emitida e armazenada em meio digital, conforme a NR-1". O glossário define o PIE "em meio físico ou eletrônico". O 10.15.7 exige que os documentos técnicos do PIE sejam elaborados por PLH.
- **Fonte independente:** RS Data (pub. 2026-06-01) e Top Elétrica (pub. 2026-09-04) confirmam que projeto elétrico e documentação de inspeções e medições de aterramento valem para "toda organização".
- **Nota para o produto:** o laudo de inspeção com plano de ação e cronograma (10.7.11) e o registro de medições de aterramento (10.15.3) passam a ser exigências universais. Isso amplia o público-alvo além de quem precisa de PIE e é favorável ao app. O argumento, porém, deve citar os itens 10.7.11 e 10.15.3, e não "conteúdo do PIE".

### 4. O texto novo da NR-10 não cita mais SPDA entre os documentos do prontuário
- **Status:** VERIFIED
- **Fonte original:** rodada 1 (confiança baixa)
- **Fonte primária:** o mesmo PDF oficial.
  - O capítulo 10.15 não contém "SPDA" nem "descargas atmosféricas".
  - O 10.15.3 fala apenas em "sistemas de aterramentos elétricos".
  - O SPDA continua no texto novo apenas como medida de proteção coletiva, no 10.6.8 ("proteção contra descargas atmosféricas conforme definido em projeto"), e nos conteúdos de treinamento dos anexos.
- **Fonte independente:** Top Elétrica (pub. 2026-09-04) transcreve o texto antigo ("documentação das inspeções e medições do sistema de proteção contra descargas atmosféricas e dos aterramentos elétricos") e o novo ("dos sistemas de aterramento"). O artigo não comenta a remoção de forma explícita, mas a comparação textual mostra que ela aconteceu.
- **Nota:** a obrigação documental de SPDA deixa de ter base na NR-10 a partir de 01/06/2027. Passa a depender da NBR 5419, dos Corpos de Bombeiros e de seguradoras.

### 5. NBR 5419 revisada em 2026, com inspeção anual ou trienal e aterramento verificado por continuidade
- **Status:** PARCIALMENTE VERIFIED
- **O que foi verificado:** a revisão e a publicação.
- **O que continua UNVERIFIED de forma independente:** periodicidade e método de verificação do aterramento.
- **Fonte original:** prestadores de serviço.
- **Fontes independentes:**
  - O Setor Elétrico, "A nova NBR 5419 chegou!" — https://www.osetoreletrico.com.br/a-nova-nbr-5419-chegou/. Autor: José Barbosa, relator do GT da comissão ABNT. Informa que a norma foi publicada em 10/03/2026 e traz frequência de danos (1 parada/ano para equipamentos não críticos, 0,1 para críticos) e revisão do Ng.
  - O Setor Elétrico, "Versão corrigida da nova NBR 5419:2026…" — https://www.osetoreletrico.com.br/versao-corrigida-da-nova-nbr-54192026-em-alguns-casos-permite-manter-a-versao-de-2015/ (pub. 2026-05-21). Traz a regra de transição: projetos protocolados antes da publicação ou em até 180 dias depois seguem a NBR 5419:2015.
- **Nota:**
  - Os dois artigos do O Setor Elétrico não tratam de periodicidade de inspeção nem de continuidade versus resistência.
  - Esses dois pontos (1 ano para áreas classificadas, serviços essenciais e corrosão severa; 3 anos para as demais estruturas; eficácia do aterramento verificada por continuidade, sem medição de resistência) aparecem só em sites de prestadores. Exemplos: Token Engenharia, Engehall e HazOp (resultados de busca, sem data confirmada).
  - Crença não verificada: a periodicidade de 1 e 3 anos já existia na edição de 2015. Se for verdade, não é novidade de 2026.
  - O catálogo ABNT não foi consultado por falta de orçamento.

### 6. O Corpo de Bombeiros de SP exige laudo de SPDA com ART para o AVCB
- **Status:** DISPUTED (é preciso reformular)
- **Fonte original:** rodada 1
- **Fontes independentes:**
  - Guia SegCI, transcrição da IT 41/2025 do CBPMESP — https://guiasegci.com.br/legislacoes/it-41-2025-inspecao-em-instalacoes/:
    - Norma instituída pela Portaria CCB-003/800/25 (DOE-SP de 20/03/2025) e atualizada pela CCB-003/970/2026.
    - Trata de inspeção visual de instalações elétricas de BAIXA tensão.
    - O item 5.1.9 diz "o SPDA deve estar em conformidade com a NBR 5419".
    - O item 5.9 exige documento de responsabilidade técnica (ART) do profissional que faz a inspeção.
  - Guia SegCI, IT 01/2025 — https://guiasegci.com.br/legislacoes/it-01-2025-procedimentos-administrativos/:
    - Norma instituída pela Portaria CCB-002/800/25, em vigor desde 20/02/2025.
    - O item 6.2 exige comprovante de responsabilidade técnica pela instalação e/ou manutenção das medidas de segurança contra incêndio.
- **Nota:**
  - O mais correto é dizer que, em SP, a conformidade do SPDA com a NBR 5419 é item de checagem do atestado da IT 41. Esse atestado é de BT e exige ART.
  - Quando o SPDA é uma medida de segurança exigida para a edificação, entra no comprovante de responsabilidade técnica do item 6.2 da IT 01.
  - Não se achou uma IT de SP que exija um "laudo de SPDA" autônomo.
  - A informação de mercado de que a ART de SPDA deve ser assinada por engenheiro eletricista vem de despachante (avcbsp.com), não de norma.
  - O Decreto SP 69.118/2024 (regulamento de segurança contra incêndio) não foi lido.

### 7. Cerca de 202 mil UCs do Grupo A no Brasil
- **Status:** UNVERIFIED
- **Fonte original:** ABRACEEL citando a ANEEL
- **Fonte independente:** nenhuma.
  - A busca devolveu de novo o comunicado da ABRACEEL — https://abraceel.com.br/press-releases/2024/07/previsao-de-novos-consumidores-no-mercado-livre-de-energia-supera-27-mil-ate-2025/ (2024-07). Ele diz que o Grupo A tem cerca de 202 mil UCs, das quais mais de 48 mil já migraram para o mercado livre.
  - A Nota Técnica ANEEL 44/2026 encontrada trata só da COPEL e não traz total nacional.
  - Não se obteve dado ANEEL primário (SAMP ou dados abertos) nem a divisão por subgrupo.

### 8. Norma com periodicidade de manutenção preventiva de cabine primária
- **Status:** VERIFIED COMO AUSÊNCIA (por fonte secundária; o texto da NBR 14039 não foi lido)
- **Fonte independente:** Manau Engenharia — https://manauengenharia.com.br/manutencao-de-subestacao-frequencia-nbr-14039/ (sem data). Diz: "Embora a norma [NBR 14039] não estabeleça prazos fixos, recomenda-se, como referência, a realização de manutenção preventiva a cada 12 meses". A periodicidade deve considerar ambiente, carga, histórico de falhas e recomendação do fabricante.
- **Nota:**
  - O PDF comentado da NBR 14039 (Target) não abriu (erro de DNS).
  - Na NR-10 nova, o 10.7.11 exige relatório de inspeção, mas não fixa periodicidade.
  - O único "anualmente" padrão da NR-10 nova está no 10.14.4.1, e vale para ensaios dielétricos de ferramentas, EPI e EPC, não para a instalação.
  - Não há periodicidade legal ou normativa explícita para a preventiva de cabine primária. Os 12 meses são prática de mercado.

## Novos claims

| claim | source | publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|
| A NR-10 nova (10.7.11) obriga TODA organização a inspecionar as instalações elétricas e manter relatório com medidas de prevenção, plano de ação e cronograma de adequação, sem periodicidade definida | PDF oficial da Portaria 737 | MTE | 2026-06-01 (DOU) | 2026-09-18 | alta | regulatório/primário |
| A NR-10 nova (10.15.3) obriga TODA organização a ter projeto elétrico e documentação das inspeções e medições dos aterramentos | PDF oficial da Portaria 737 | MTE | 2026-06-01 | 2026-09-18 | alta | regulatório/primário |
| Os documentos técnicos do PIE devem ser elaborados por PLH (10.15.7), e o PIE deve conter procedimentos de resposta a emergências (10.15.6.1) | PDF oficial da Portaria 737 | MTE | 2026-06-01 | 2026-09-18 | alta | regulatório/primário |
| O DR em áreas molhadas de edificações não residenciais (10.6.4 "e") tem mais 1 ano de prazo para instalações existentes, ou seja, cerca de 06/2028 (Art. 3º) | PDF oficial da Portaria 737 | MTE | 2026-06-01 | 2026-09-18 | alta | regulatório/primário |
| A Portaria 737 foi retificada no DOU de 24/06/2026, no item 10.8.4 (módulos de treinamento SEC e compartilhamento de infraestrutura) | PDF oficial da Portaria 737 | MTE | 2026-06-24 | 2026-09-18 | alta | regulatório/primário |
| Os ensaios dielétricos de ferramentas, EPI e EPC isolantes seguem o menor intervalo entre regulamento, fabricante e critério do PLH; na falta de previsão, são anuais (10.14.4.1) | PDF oficial da Portaria 737 | MTE | 2026-06-01 | 2026-09-18 | alta | regulatório/primário |
| O glossário da NR-10 nova define AT como tensão acima de 36,2 kV CA | PDF oficial da Portaria 737 | MTE | 2026-06-01 | 2026-09-18 | alta | regulatório/primário |
| A NBR 5419:2026 foi publicada em 10/03/2026. Projetos protocolados antes da publicação ou em até 180 dias depois podem seguir a NBR 5419:2015 | osetoreletrico.com.br (2 artigos de José Barbosa) | O Setor Elétrico | 2026-05-21 | 2026-09-18 | alta | normativo/secundário especializado |
| A NBR 5419:2026 introduz o critério de frequência de danos (1/ano para equipamentos não críticos, 0,1/ano para críticos) e revisa o Ng por município | osetoreletrico.com.br/a-nova-nbr-5419-chegou/ | O Setor Elétrico | 2026 (data não confirmada) | 2026-09-18 | média-alta | normativo/secundário |
| A IT 41/2025 do CBPMESP (Portaria CCB-003/800/25, atualizada pela CCB-003/970/2026) cobre só BT e inclui a verificação de conformidade do SPDA com a NBR 5419 (item 5.1.9), com ART (item 5.9) | guiasegci.com.br | Guia SegCI | n/d | 2026-09-18 | média | regulatório/secundário |

## Procurado e não encontrado
- Dado primário da ANEEL (SAMP, dados abertos, Relatório de Consumo e Receita) com o total de UCs do Grupo A e a divisão por subgrupo (A4, A3a, A2…). Só há o número da ABRACEEL (2024).
- Texto oficial ou comentado da NBR 14039 com cláusula de manutenção (o PDF da Target estava inacessível).
- Confirmação independente (catálogo ABNT ou revista técnica) da periodicidade de inspeção de SPDA e da verificação por continuidade na NBR 5419:2026.
- IT de SP que exija "laudo de SPDA" autônomo para o AVCB. O Decreto SP 69.118/2024 não foi lido.
- Parecer ou nota técnica do MTE que interprete o 10.15.6 "b" ("realizem atividades em instalações de MT/AT") no caso do dono de cabine primária que terceiriza a manutenção.
- Cobertura do tema em revistas como Proteção ou Revista Cipa (não consultadas por falta de orçamento).
