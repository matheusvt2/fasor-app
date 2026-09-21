---
title: 'Pesquisa competitiva: software de campo e laudos de cabine primária no Brasil'
type: 'competitive'
topic: 'Análise competitiva de software para captura em campo e laudos de manutenção elétrica de cabine primária de média tensão, aterramento/SPDA e painéis no Brasil'
decision: 'Posicionamento e diferenciação do MVP do fasor: captura em tablet, offline, com fotos e cadastro de instrumentos, gerando em um dia o laudo completo no padrão da própria prestadora, pronto para assinatura'
source: 'native run'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-09-18'
updated: '2026-09-18'
claims_verified: 5
claims_unverified: 23
claims_disputed: 2
claims_overturned: 2
---

# Pesquisa competitiva: software de campo e laudos de cabine primária no Brasil

**Decisão que esta pesquisa apoia:** como posicionar o fasor e o que diferencia o MVP. As perguntas são quatro:

1. Algum concorrente já entrega o laudo completo com a marca da prestadora?
2. Que lacunas o fasor pode ocupar?
3. Que referências de preço existem?
4. Com que velocidade anda a principal ameaça?

**Convenções:**

- "fasor" é o produto; "Fasor" é a Fasor Engenharia, parceira de design.
- **Níveis de confiança:**
  - **alta:** fonte primária relida, ou fontes independentes que concordam;
  - **média:** fonte única confiável, ou código de interface público;
  - **baixa:** fonte antiga, fraca ou em disputa.
- Quase tudo sobre recursos de produto vem das páginas e do código público dos próprios fornecedores. **Nenhum produto foi testado com login.**

## Sumário executivo

**Respostas curtas às quatro perguntas:**

1. **Laudo completo com a marca da prestadora?** Ninguém entrega hoje o laudo inteiro da cabine no layout da própria prestadora. A Mesh Labs, porém, chegou bem mais perto do que se supunha: já monta um laudo consolidado com a marca da executante.
2. **Lacunas:**
   - o layout próprio da prestadora, com sumário;
   - inspeção visual C/NC/NA (conforme, não conforme, não aplicável) e o escopo da cabine inteira;
   - pontos de atenção que viram plano de ação com prazo;
   - registro de calibração dos instrumentos;
   - tablet e iPad.
3. **Preço:** a Mesh cobra R$ 1.397 por ano pela suíte inteira, cerca de R$ 116 por mês. A Minipa Link vai de R$ 60 a R$ 180 por mês. Esses são os valores de referência da categoria.
4. **Velocidade da ameaça:** a Mesh lançou há duas semanas (versão 1.0.0). Ainda não há uso comprovado, mas o roteiro é amplo e o preço sobe a cada ferramenta nova.

**Próximo passo:** assinar a Mesh Labs e reproduzir nela um laudo real da Fasor (R1). A ação é da equipe; esta pesquisa não criou contas.

**O que sustenta essas respostas:**

1. **O laudo da Mesh já é consolidado e leva a marca da executante.** *Confiança média: código público, sem teste de uso.*
   - É montado no navegador, **por atividade**. Reúne vários equipamentos num só documento, com fichas por equipamento e ensaio, ocorrências e registro fotográfico [7][8].
   - A capa traz o nome e o logotipo da executante. O laudo aceita cor, cabeçalho e rodapé, exporta **PDF e DOCX** e emite revisões congeladas [7].
   - Uma lista de pendências antes da emissão inclui a **ART** [7]. Nos exemplos, os itens não bloqueiam a emissão.
   - **Limites visíveis no mesmo código:**
     - o sumário ainda "chega quando o modelo tiver seção de sumário";
     - não aparecem NR-10, plano de ação com prazo, checklist C/NC/NA nem termografia;
     - a calibração "não é registrada no sistema" [7];
     - só **6 tipos de equipamento** [2];
     - app **somente para Android** [1][19].
2. **O preço da Mesh é público e baixo.** *Confiança alta: fonte primária.*
   - R$ 1.397 por ano no pré-lançamento, ou 12 × R$ 144,48 pela Hotmart [3][4].
   - O preço "sobe a cada ferramenta lançada" [3], e os termos permitem limitar o número de laudos por plano [5].
   - *Inferência:* com cerca de R$ 116 por mês por organização, sobra pouco espaço de preço para um SaaS vertical voltado a pequenas prestadoras.
3. **A ameaça é recente e ainda não tem uso comprovado.**
   - 1 mil+ downloads e 13 avaliações 5,0, concentradas logo após o evento de lançamento [1][9].
   - O módulo de relatórios depende de uma chave de liberação no servidor [9].
   - O roteiro declarado inclui aterramento (Aterra), gestão de instrumentos e calibração (Equipa) e seletividade (SELetiva) [3][11][12].
   - *Inferência:* a Equipa fecharia a lacuna de calibração.

**Surpresas desta rodada:**

- **Minipa Link:** app horizontal lançado em jul/2026 por um fabricante de instrumentos [61]. Tem página de **Subestações**, app para iPad, preço de **R$ 60 a R$ 180 por mês** e a promessa de "relatório final pronto no mesmo dia" [57][58][60][62]. A tração é quase nula [61][62].
- **GroundPRO:** já tem um **Laudo de Continuidade** de SPDA e aterramento que funciona offline, com certificado de calibração e cronograma de adequação [28].
- **Nenhum vertical dedicado além da Mesh.** Três buscas independentes na Play, na App Store e no Google não acharam software brasileiro dedicado a laudo de cabine primária [67][68][69]. A Minipa Link, com sua página de Subestações, é contraexemplo parcial [60].

**Maior ressalva:** a comparação de recursos da Mesh vem de código público e páginas de venda, não de uso real. Por isso R1 é o próximo passo.

## 1. Mesh Labs (Mesh Engenharia): análise detalhada

### Quem é

- **Empresa:** MESH TREINAMENTOS LTDA, de Belo Horizonte/MG, com CNPJ aberto em 2019 e CNAE principal de treinamento [6][18]. Na Google Play, o app é publicado como "BruLabs" [1][5].
- **Tamanho:** o LinkedIn indica **2 a 10 funcionários** e cerca de 32 mil seguidores [17].
- **Fundadores:** o site institucional cita Hilton Rocha [14]. As páginas do produto atribuem o "motor" técnico a "Eng. Hilton e Eng. Rocha" [2].
- **Números de autoridade divergentes entre páginas da própria Mesh:**
  - "4.900+ engenheiros formados", "1.392 subestações mantidas" e "1.295 ARTs" [2];
  - "+2.800 alunos" e "+3.500 assinantes" [14];
  - "+3.500 alunos" e "+8.400 profissionais impactados", numa página ainda com "Lorem Ipsum" [15].
  - O número "2.200+ alunos", citado antes, não foi reencontrado. *Confiança baixa para qualquer um desses números.*

### Oferta e recursos de campo

- **Suíte web por assinatura:** "Uma assinatura. 8 ferramentas." [3]
  - Ativas: **Ensaia** (campo e laudo), **Elettra** (curto-circuito), **Trip** (ensaio de relés), **Simula** e **Laboratório Virtual**.
  - Em breve: **Aterra**, **Equipa** e **SELetiva** [3][11][12].
- **O app não é vendido à parte:** "não faz nada sem uma conta criada na web" [6].
- **Fluxo da Ensaia:** preparar no navegador, registrar no Android e revisar o laudo na web. "O laudo sai depois, no navegador" [2].
- **Escopo:** "Hoje são seis" tipos de equipamento: chave seccionadora, disjuntor, TC, TP, transformador de potência e cabo [2].
  - Para-raios, malha, SPDA de manutenção, termografia e painéis não estão na Ensaia.
  - O ensaio de relés fica em outra ferramenta, a Trip [13].
- **Captura:**
  - offline-first: "cada medição… cada foto… é gravado na hora, no próprio aparelho", com sincronização depois [2];
  - leitura de placa por IA, que precisa de internet [2] e usa Google Gemini com OpenAI de reserva [6];
  - anotação por voz, fotos e áudios anexados ao equipamento ou ao ensaio;
  - correção por temperatura "referida a 20 °C";
  - histórico por equipamento e veredito normativo no campo [1][2].
- **Instrumentos:**
  - Cada medição registra o instrumento usado, com número de série [7].
  - A Mesh anuncia uma "Integração oficial, autorizada pela Megabras" por Bluetooth, com 14 modelos "**no lançamento**" [2]. A política de privacidade restringe o Bluetooth ao "megôhmetro" [6]. **Em disputa:** não se sabe quais modelos funcionam hoje.
  - O site da Megabras não menciona a Mesh [24].
  - Instrumentos de outras marcas entram por digitação [1].

### O laudo: o que existe no código público

*Confiança média nesta subseção inteira: o código da interface é público e foi relido por um verificador independente [7][8].*

- **Um documento por atividade.**
  - O laudo nasce da atividade (`origin: insp`), no formato `mesh-complete-report` e no modelo `ensaia-activity` [7][8].
  - O usuário escolhe quais equipamentos, ensaios, fotos e seções entram [7].
  - Exemplo embutido: "Relatório de inspeção e ensaios — Subestação Oeste", manutenção preventiva anual em 13,8 kV. Ele reúne transformador (TR-01) e disjuntor (DJ-04) num só documento [7].
- **Seções:** Identificação; Relação de equipamentos e dados de placa; Fichas por equipamento e ensaio; Ocorrências identificadas; Registro fotográfico; Referências e critérios; Anexos; Objetivo; Condições; Análise técnica; Conclusão e recomendações [7].
- **Marca e saída:**
  - capa com o nome da executante e, se houver, o logotipo ("Sem ele, a capa sai só com o nome da executante") [7];
  - logotipo do cliente, cor de destaque, cabeçalho e rodapé [7];
  - "Exportar PDF", "Exportar DOCX" e "Baixar pacote (ZIP)", este com os originais de ART e certificado [7];
  - revisões emitidas e congeladas no histórico [7].
- **Lista de pendências antes da emissão:**
  - "ART do responsável técnico";
  - ensaios não realizados ("Ausência de reprovação não é aprovação");
  - **"Calibração dos instrumentos não é registrada no sistema — Anexe o certificado ao pacote"** [7].
  - Nos exemplos, os itens não bloqueiam a emissão [7].
- **O que não aparece:**
  - sumário: "chega quando o modelo tiver seção de sumário" [7];
  - NR-10, "pontos de atenção", plano de ação com prazo, checklist C/NC/NA e termografia [7];
  - o mais próximo é "Ocorrências identificadas" com "Conclusão e recomendações";
  - ausência em código minificado não prova ausência no produto. *Confiança média.*
- **Chave de liberação:** o módulo de relatórios depende de `reports_enabled` no servidor [9]. Não dá para saber se está ligado para todos os assinantes.
- **Correção de rota:** duas hipóteses anteriores caíram.
  - A de laudo só por equipamento, sugerida por uma captura de tela oficial intitulada "TR-01" [10].
  - A de que não haveria marca da executante nem ART.

### Preço e modelo de venda

- **Preço:** "PREÇO DE PRÉ-LANÇAMENTO R$ 1.397 /ano… O preço sobe a cada ferramenta lançada… Alunos Mesh têm 50% de desconto" [3].
  - O checkout da Hotmart confirma R$ 1.397 à vista ou "12 x de R$ 144,48", com acréscimo [4].
  - Não foram encontrados plano gratuito, teste grátis nem plano mensal [3][4]. Os termos preveem arrependimento em 7 dias [5].
  - Nenhuma fonte independente confirma o preço. *Confiança alta mesmo assim, por ser fonte primária.*
- **Termos:** a empresa é titular da assinatura e "administra as equipes". A cobrança passa por Asaas ou Hotmart, e "Cada plano pode ter limite de quantidade de uso (por exemplo, número de laudos…)" [5].
- **Responsabilidade técnica:** "A decisão final, a assinatura, a ART e a responsabilidade técnica… são do profissional ou da empresa… não somos os autores dos seus laudos" [5].
- **Ligação com a escola:**
  - o produtor na Hotmart é a MESH TREINAMENTOS LTDA [4], cujo CNAE é de treinamento [18];
  - o desconto é exclusivo para alunos Mesh [3];
  - os cursos dão um ano de "Plataforma Mesh de Estudos", com renovação entre R$ 997 e R$ 1.197 [20]. *Confiança baixa: termo de 2023.*

### Público e posicionamento

- **Público declarado:** "quem executa inspeções e ensaios em instalações elétricas: subestações, cabines primárias, painéis e pátios industriais" [1].
- **Discurso:** ataca a planilha ("244 campos por transformador · 99 só para indicar unidades") e o erro que só aparece "na análise no escritório", depois da janela de desligamento [2]. A autoridade técnica vem dos fundadores e da escola [2][16].
- **Conflito de canal (inferência):** a Mesh também vende serviços de engenharia, como estudos, projetos de cabine e comissionamento [14], e declara "1.392 subestações mantidas" [2]. Em parte, concorre com as prestadoras que quer ter como clientes.

### Trajetória

- **Ritmo recente:**
  - termos e política de privacidade de 30/08/2026 [5][6];
  - evento "Desafio dos Testes Elétricos", com aulas de 08 a 10/09 [9];
  - app na versão 1.0.0, atualizado em 09/09/2026, com o pico de avaliações logo depois, em 10 a 12/09 [1].
- **YouTube:** o canal @MeshEngenharia tem 43,7 mil inscritos. Voltou a publicar em ago/set 2026, com vídeos sobre megôhmetro que não citam o app [16].
- **Roteiro declarado:**
  - QR code e NFC, "ainda não disponível" [2];
  - Aterra, com Wenner/Schlumberger e memorial em PDF/Word [11];
  - Equipa, com calibração e controle de saída e devolução de maletas [12];
  - SELetiva;
  - SPDA e Estudos de Proteção aparecem como prévia no código [9].
- **Vagas:** nenhuma encontrada.
- **Velocidade:** ainda não dá para medir a cadência de versões, que tem duas semanas de histórico. O que se vê é escopo amplo e anúncio agressivo.

### Voz do cliente

- Há só 13 avaliações, todas 5★, sem nenhuma crítica e sem resposta do desenvolvedor.
- Uma delas diz "IREI GANHAR O INSTRUMENTO DE ENSAIO, TENHO FÉ", o que sugere um sorteio no evento [1].
- É sinal de audiência do lançamento, não de uso.
- Não foi achado perfil da Mesh no Reclame Aqui [72].

## 2. Novos entrantes adjacentes

**Minipa Link** (Elecore LLC, marca Minipa, fabricante de instrumentos):

- **Oferta:** app horizontal de serviço de campo [57]:
  - fotos e medições por Bluetooth de instrumentos Minipa;
  - checklists com "biblioteca NBR";
  - "Relatórios com IA" e sincronização offline;
  - promessa: "envie o relatório final pronto no mesmo dia".
- **Subestações:** o menu "Pra quem serve" inclui **Subestações** [57]. A página mostra um "Laudo de inspeção SE industrial — bay TR-01" com instrumentos, ensaios (relação de transformação, tan δ, resistência de contato, malha), fotos e assinatura com CREA [60].
- **O relatório:**
  - um por projeto ou ordem de serviço, montado num editor de blocos (capa, tabelas, fotos, checklists, assinaturas) [59];
  - **só em PDF** [58][59];
  - logo da empresa na capa [74];
  - os ensaios são checklists com "Exigir medição", e não fichas estruturadas por equipamento de MT [60];
  - nenhuma menção a ART nem a calibração [73];
  - para NBR e NR-10, os modelos são "pensados para inspeção elétrica; você os adapta ao seu procedimento" [73];
  - Bluetooth só para multímetros, alicates e termômetros Minipa [73][75].
- **Preço público** [58]:
  - Grátis, com 5 relatórios por mês;
  - Básico, R$ 60 por mês, ainda com a marca d'água Minipa;
  - Intermediário, R$ 120 por mês, 3 usuários, sem marca d'água;
  - Máster, R$ 180 por mês, 200 relatórios.
- **Plataformas e tração:** Android desde 21/07/2026, com 10+ downloads [61]; iOS desde 07/09/2026, compatível com iPad e sem avaliações [62]. *Confiança alta de que a tração é quase nula.*

**Inspekio** (GoStart Lab):

- Está em pré-lançamento, "gratuito para um grupo fechado", com 10+ downloads [64].
- Discurso quase idêntico ao do fasor: "Funciona offline de verdade" e "laudo técnico profissional — sem planilha solta, sem Word", em PDF ao fechar a OS [64].
- É horizontal.

**Gautica GNR10:** inspeção de segurança NR-10 em painéis, subestações e transformadores, com classificação de risco e "relatórios com sua marca" [63]. É ferramenta de segurança do trabalho, não laudo de ensaios.

**Substitutos baratos:**

- Pacotes de modelos Word/Excel com 6 laudos elétricos, incluindo manutenção de subestação, por **R$ 49,90** [70].
- Laudos de cabine usados como modelo circulam no Scribd [71].
- *Inferência:* o status quo é o modelo de Word.

## 3. GroundPRO (Elétrica Academy)

- **Oferta:** SaaS web de cálculo e memorial [25]:
  - SPDA (NBR 5419:2026);
  - aterramento de subestação;
  - estratificação do solo;
  - DPS;
  - diagnóstico de migração da norma.
- **Memoriais:** exportam Word e PDF. A personalização se limita a cor, nome, empresa e CREA, e o sistema não gera ART [25].
- **Módulo novo, ausente da central de ajuda de 14/04/2026: "Laudo de Continuidade e Aterramento do SPDA"** [28]. *Confiança média: código público relido.*
  - offline-first: "As fotos ficam no aparelho e sobem quando houver sinal", com GPS;
  - instrumento, **certificado de calibração**, temperatura e umidade;
  - ensaios de continuidade, resistência de aterramento, MPS e inspeção visual;
  - **"Resumo das não conformidades e cronograma de adequação"**, com prazos imediato, 30, 90 e 180 dias e responsável;
  - Word e PDF;
  - limite de 300 fotos por laudo;
  - **sem campo de logo no editor do laudo** [28].
  - Data de lançamento não apurada.
- **Preço:** a página /precos mostra só o plano Gratuito [26]:
  - 1 usuário, 5 análises por mês e 50 MB;
  - marca d'água;
  - só SPDA e aterramento.
  - "Branding personalizado" é recurso de plano pago [26]; no código, ele é definido como "Logo da empresa nos relatórios" [77].
  - Os valores dos planos pagos não são públicos, e todos têm teste de 14 dias [26].
- **Venda:** atrelada a turma e webinar, com mensagens como "condição exclusiva para alunos do Webinar Prático" [27].
  - Referência de preço no mesmo ecossistema: o curso de SPDA custa R$ 1.497 [29].
  - O curso inclui "Licença Vitalícia" de outra ferramenta e um "Modelo de Laudo de SPDA" em Word [29].
- **Trajetória:** "Em breve: Checklists Online — verificações normativas de campo" continua no painel de 18/09/2026 [25][27].
- **Leitura:** não cobre ensaios de equipamentos de MT. Mas já faz no SPDA o que o fasor promete para a cabine: campo offline, calibração e plano de adequação com prazo.

## 4. Fabricantes de instrumentos e incumbentes

**Megabras:**

- **BlueLogg:** gratuito, para Android e iOS, e funciona "somente" com instrumentos Megabras (MD10KVx, TM25R, EM4058) [21][22].
  - Tem 3,9★ em 30 avaliações e 10 mil+ downloads [21].
  - Um usuário reclama que "só gera duas páginas de relatório", numa avaliação antiga, de 2021 [21].
  - As atualizações de 2026 só corrigem erros [21][22].
- **MegaLogg 3:** o software de PC só transfere dados [23].
- Nas fontes da Megabras não aparecem leitura de placa por IA, "Teste rápido" nem menção à Mesh [23][24].
- **Leitura:** o fabricante não faz o laudo. A parceria com a Mesh só aparece nas páginas da Mesh.

**OMICRON PTM e PTMate:**

- Faz gestão de ativos e de ensaios de MT/AT, inclusive "grounding systems".
- Os relatórios são adaptáveis, com comentários e imagens [30].
- De outras marcas, só cita a importação de resultados de DGA (análise de gases dissolvidos) [30].
- O PTMate é gratuito. O PTM DataSync web é SaaS com assinatura anual [30][31].
- O preço da licença não é publicado.
- Tem escritório e centro de treinamento em Sorocaba, com cursos em português [32]. *Confiança média: trecho de resultado de busca.*

**Megger PowerDB:** é o incumbente mais parecido com um gerador de pacote de laudo [33][34].

- 370+ formulários e editor de formulários, com logo, cabeçalho e rodapé;
- relatório com capa, sumário e resumo de deficiências;
- tabela de instrumentos com data de calibração;
- importa dados da Doble e de outros fabricantes, mas a OMICRON não aparece na lista.
- **Limites:**
  - só Windows [34], em inglês;
  - preço sob cotação [33][35];
  - datasheet de 2016 [34];
  - nenhuma presença no Brasil encontrada, e o PNCP (portal de compras públicas) não retornou resultados [37].

**Doble DTA:** atende só instrumentos Doble e Vanguard [36]. O preço não é publicado, e a ativação exige contrato de manutenção ativo [76]. *Confiança média.*

**Termografia:** é ferramenta à parte, grátis ou barata, com modelos de relatório.

- FLIR Thermal Studio: grátis, US$ 215,99 ou US$ 431,99 por ano [38];
- Fluke SmartView e Testo IRSoft: gratuitos, com modelos [39][40].

## 5. Apps genéricos de campo

| App | Preço | Laudo elétrico | Relatório | Sentimento recente (desde set/2025) |
|---|---|---|---|---|
| **Produttivo** | 4 planos sem preço público [41] | Modelo de "Laudo NR10" pronto [42] | PDF; logo e cores só a partir do 2º plano [41]. Em 2022, um cliente pediu exportação para Word porque o laudo final é feito no Word [45] | Play: 4,0★ geral e média de 3,53 nas recentes, com "travamentos" [43]. iOS: 2,5★, com "sincronização… não funciona" e uma foto por vez [44] |
| **Checklist Fácil** | Sem preço público; demonstração obrigatória [50] | Não encontrado | Checklists e auditorias | 4,8★ geral, mas média de 3,65 nas 106 recentes: "sincronização… péssima", "dados não são enviados" [49] |
| **Auvo 2.0** | Sem preço público; os R$ 25–44,90 citados antes são de **2018** [47] | Não (PMOC, OS) [46] | Relatório de visita com assinatura [46] | Média de 3,81 nas recentes: "travando na hora de inserir fotos", "não funciona sem internet" [46]. Queixas de sincronização já em 2023 [48] |
| **Field Control** | R$ 525/mês com 4 licenças [51][52]; o Capterra diz R$ 295/usuário/mês [53] (**em disputa**) | Página "Instalações elétricas" genérica [54] | OS com formulários e fotos [54] | Não levantado |
| **SafetyCulture/Mitti** | US$ 24–29 por assento/mês; grátis até 10 usuários [55] | Modelos NR-10 na biblioteca; nada de cabine ou SPDA [56] | Formulário genérico | Não levantado |
| **Online OS** | Advantage R$ 899,99/mês; marca própria só no plano personalizado [66] | Não; apps de laudo sob encomenda | "100% online" [66] | Não levantado |
| **Tecniko** | Grátis; pagos a partir de R$ 59,90/mês [65] | Não | Relatório de serviço com IA [65] | Não levantado |

Nenhum genérico mostrou ART, cadastro de instrumentos com calibração, ficha por equipamento de MT ou layout de documento técnico longo [41][42][54][55][66]. A queixa que se repete em três fornecedores independentes é **sincronização e fotos** [43][44][46][49]. *Confiança alta para o padrão.*

## 6. Matriz comparativa com o fasor

A coluna do fasor mostra a **intenção** do brief, não evidência. "—" significa não encontrado, o que não prova inexistência.

| Capacidade | fasor (intenção) | Mesh Labs | Minipa Link | GroundPRO (Laudo de Continuidade) | Produttivo e genéricos | Megger PowerDB |
|---|---|---|---|---|---|---|
| Tablet / iPad | Sim (foco) | — (Android, celular) [1][2] | iPad [62] | Web a partir de 768 px [25] | Sim [42] | Tablet Windows [34] |
| Captura offline confiável | Sim | Sim [2] | Sim [57] | Sim [28] | Queixas de sincronização [44][49] | Banco local de campo [34] |
| Foto ligada ao equipamento | Sim | Sim [2][7] | Fotos por projeto [59] | Por ponto, com GPS [28] | Fotos com data e GPS [42] | Anexos [34] |
| Instrumento e nº de série por medição | Sim | Sim [7] | — | Sim [28] | — | Sim [34] |
| Certificado de calibração registrado | Sim | **Não** (só anexo) [7]; Equipa em breve [12] | — [73] | Sim, por laudo [28] | — | Sim [34] |
| Fichas de ensaio por equipamento de MT | Sim (6 tipos) | Sim (6 tipos) [2] | Checklist com medição [60] | Não se aplica (SPDA) | Formulário genérico | 370+ formulários [33] |
| Inspeção visual C/NC/NA | Sim | — (veredito por ensaio) [7] | Checklists [59] | Conforme/não conforme por ponto [28] | Checklists | — |
| Laudo único da cabine inteira | Sim | **Sim, por atividade** [7][8] | Por projeto/OS [59] | Sim, para SPDA [28] | Por OS | Pacote por serviço [34] |
| Layout da própria prestadora (modelo FO.SERV-03 da Fasor) | Sim | Modelo Mesh com logo [7] | Editor de blocos [59] | Modelo fixo [28] | Logo e cores [41] | Editor de formulários [34] |
| Capa | Sim | Sim [7] | Sim [59] | — | — | Sim [34] |
| Sumário | Sim | **Pendente** [7] | — | — | — | Sim [34] |
| DOCX editável | Sim | Sim [7] | **Só PDF** [58][59] | Sim [28] | — [45] | — |
| Pontos de atenção → ação corretiva com prazo | Sim | Ocorrências + recomendações, **sem prazo** [7] | — | **Sim: imediato, 30, 90 e 180 dias** [28] | — | Resumo de deficiências, sem prazo [34] |
| NR-10 no laudo | Previsto | — [7] | Checklist adaptável [73] | Cita o item 10.2.4 [28] | Modelo NR10 [42] | — |
| ART | Fora do MVP | Pendência + anexo [7] | — [73] | Seção de texto [28] | — | — |
| Leitura de placa por IA | Fora do MVP | Sim [2][6] | — | — | — | — |
| Bluetooth com instrumento | Fora do MVP | Megabras (em disputa) [2][6] | Minipa [73][75] | — | — | Megger e importação [34] |
| Independência de marca de instrumento | Sim | Parcial (manual + Megabras) [1] | Parcial (manual + Minipa) [73] | Sim [28] | Sim | Parcial [34] |
| Preço público | A definir | **R$ 1.397/ano** [3] | **R$ 60–180/mês** [58] | Só o plano grátis [26] | Não [41][50] | Não [33] |

## 7. Referências de preço

| Referência | Valor | Unidade | Fonte |
|---|---|---|---|
| Modelos de laudo Word/Excel | R$ 49,90 | pacote, pagamento único | [70] |
| Minipa Link | R$ 60 / 120 / 180 | por mês (1 a 3 usuários) | [58] |
| Tecniko | a partir de R$ 59,90 | por mês | [65] |
| **Mesh Labs** | **R$ 1.397 (≈ R$ 116/mês)** | por ano, suíte, pré-lançamento | [3][4] |
| Field Control | R$ 525 (≈ R$ 131/técnico) + R$ 899 de implantação; o Capterra diz R$ 295/usuário (**em disputa**) | por mês, 4 licenças | [51][52][53] |
| Online OS Advantage | R$ 899,99 | por mês | [66] |
| SafetyCulture Premium | US$ 24–29 | por assento/mês | [55] |
| FLIR Thermal Studio | US$ 0 / 215,99 / 431,99 | por ano | [38] |
| Curso de SPDA + licença vitalícia (Elétrica Academy) | R$ 1.497 | pagamento único | [29] |
| OMICRON PTM, Megger PowerDB Pro, Doble DTA | não publicado | licença | [30][33][76] |

*Inferência:* a Mesh cobra R$ 1.397 por ano pela suíte inteira, e a Minipa começa em R$ 60 por mês. Juntas, elas ancoram o teto da categoria para pequenas prestadoras em algo como R$ 100 a R$ 300 por mês por empresa. Cobrar mais exigirá provar horas economizadas por laudo.

## 8. O que só a comparação revela

1. **A disputa saiu da coleta e foi para o documento.**
   - Mesh, GroundPRO e Minipa já fazem captura offline com fotos [2][28][57], e a Mesh e a Minipa leem instrumentos por Bluetooth [2][73].
   - O que resta diferenciado é o documento final (ver a seção 9, lacunas 1 a 4).
   - A Mesh deixa parte desses pontos como pendências no próprio código [7].
2. **O plano de ação com prazo falta na cabine e já existe no SPDA.**
   - O GroundPRO estrutura as não conformidades com prazo e responsável [28]. A Mesh para em "ocorrências e recomendações" [7].
   - *Inferência:* o diferencial é implementável e a Mesh ainda não o tem.
3. **Fabricantes de instrumento estão virando canal de software.**
   - A Megabras chega pela Mesh [2]. A Minipa tem app próprio [57]. OMICRON e Megger têm software próprio [30][33].
   - *Inferência:* a neutralidade de marca é argumento real para a prestadora com instrumentos de várias marcas. Mas todos já aceitam entrada manual, então sozinha ela não diferencia.
4. **A escola é o canal de distribuição dos verticais.**
   - Mesh e Elétrica Academy vendem software com desconto ou condição para alunos [3][27].
   - O fasor não tem essa audiência.
   - *Inferência:* disputar clientes exige outro canal, como indicação entre prestadoras ou parceria com escolas regionais. Alcance no YouTube não é o jogo do fasor.
5. **A confiabilidade da sincronização é critério de eliminação, não diferencial de venda.**
   - A queixa aparece nos genéricos [44][46][49].
   - Os verticais novos já prometem offline de verdade [2][28][64].

## 9. Lacunas e ameaças

**Lacunas que o fasor pode ocupar**, em ordem de defensabilidade:

1. **O laudo no layout real da prestadora (FO.SERV-03), com sumário, fichas e registro fotográfico.**
   - A Mesh impõe o modelo dela e o sumário ainda está pendente [7].
   - A Minipa só gera PDF montado em blocos [58][59].
   - *Janela curta:* a Mesh já anuncia o sumário como próximo passo [7].
2. **Pontos de atenção com foto → ação corretiva → prazo e responsável.**
   - Nenhum dos concorrentes analisados mostra plano de ação com prazo na cabine. Essa conclusão se baseia na ausência em código e páginas públicas [7][34][59].
   - *Premissa não verificada nesta rodada:* a NR-10 revisada exigiria um relatório de inspeção com plano de ação e cronograma. A pesquisa de mercado anterior trata disso; este documento não re-verificou o texto da norma.
3. **Inspeção visual C/NC/NA por equipamento e escopo da cabine inteira.** Inclui o que fica fora dos 6 tipos da Mesh [2]: para-raios, barramentos, painéis, aterramento e sinalização.
4. **Registro do certificado e da validade de calibração do instrumento.**
   - A Mesh registra instrumento e número de série, mas declara que não registra calibração [7].
   - *Janela:* até o lançamento da Equipa [12].
5. **Tablet e iPad como plataforma principal.** A Mesh é Android e celular [1][2]; a Minipa já tem iPad [62].
6. **Não concorrer com o cliente.** A Mesh também presta serviço de engenharia [2][14]. *Inferência a validar em entrevistas.*

**Ameaças:**

- **Mesh Labs (alta):**
  - já cobre boa parte da promessa: laudo consolidado com logo, DOCX, ART, offline e IA;
  - tem preço baixo e público, audiência própria e roteiro declarado [2][3][7][11][12];
  - o preço sobe a cada ferramenta lançada [3].
- **Minipa Link (média):** preço de entrada baixo, iPad e página de Subestações [58][60][62]. Um fabricante com canal de distribuição pode ganhar escala rápido. Hoje a tração é quase nula [61][62].
- **GroundPRO (média, no SPDA):** já tem laudo de campo offline com plano de adequação e anuncia "Checklists Online" [27][28].
- **Status quo (alta):** o modelo de Word a R$ 49,90 [70]. O fasor precisa economizar tempo de forma visível, e não só organizar melhor.

## 10. Recomendações

| # | Recomendação | Confiança | Alimenta |
|---|---|---|---|
| R1 | **Assinar a Mesh Labs (R$ 1.397) e reproduzir nela um laudo real da Fasor antes de fechar o escopo do MVP.** Medir o que falta em relação ao FO.SERV-03. | Alta para o preço [3]; média para o escopo [7] | Brief (alternativas), PRD |
| R2 | **Posicionar o fasor como "o seu laudo, no seu modelo, pronto para assinar"**, e não como "coleta offline". | Média [7][59] | Posicionamento, PRD |
| R3 | **Promover ao MVP os pontos de atenção estruturados** (foto, ação corretiva, prazo, responsável) e o sumário. | Média [7][28] | PRD (modelo de dados) |
| R4 | **Manter no MVP o cadastro de instrumentos com certificado de calibração**, lacuna declarada da Mesh. Acompanhar a Equipa. | Média [7][12] | PRD |
| R5 | **Não investir em IA de placa nem em Bluetooth no MVP.** A Mesh já tem os dois, e nenhum decide a qualidade do documento. | Média [2][6] | PRD (fora do escopo) |
| R6 | **Referência de preço para um futuro SaaS:** faixa de R$ 100 a R$ 300 por mês por empresa. Mesh e Minipa ancoram o teto da categoria [3][58]. | Baixa (inferência) | Estratégia de preço |
| R7 | **Acompanhar todo mês:** preço da Mesh; lançamento de Equipa e Aterra; sumário no laudo da Mesh; "Checklists Online" do GroundPRO; tração do Minipa Link; lançamento do Inspekio. | — | Revalidação |

## 11. Questões em aberto

| Questão | Como responder |
|---|---|
| O laudo da Mesh está liberado para todos os assinantes? Como fica o PDF real? | Assinar e gerar um laudo (R1) |
| Quais instrumentos Megabras funcionam hoje por Bluetooth na Mesh? | Testar no app, ou ver a lista de drivers no APK |
| A Mesh vende por usuário ou por empresa? Qual é o limite de laudos? | Ler a conta assinada |
| Qual é o preço dos planos pagos do GroundPRO e quando saiu o Laudo de Continuidade? | Página de novidades interna, ou turmas e webinars |
| A Minipa Link gera fichas por equipamento de MT? | Teste grátis de 14 dias |
| O Inspekio vai atender MT? A que preço? | Acompanhar o lançamento |
| As prestadoras valorizam layout próprio mais do que preço? | Entrevistas com 5 a 10 prestadoras de MT |
| A NR-10 revisada exige plano de ação com cronograma? | Ler o texto oficial da portaria (fora do escopo desta pesquisa competitiva) |

## Apêndice de fontes

Datas de acesso: todas em 2026-09-18. "s.d." significa sem data publicada; nesses casos, a data de acesso vale como referência.

| # | Afirmação que sustenta | Publicador | Pub. | Acesso | Confiança |
|---|---|---|---|---|---|
| [1] | Mesh Labs Mobile: Android, 1 mil+ downloads, 13 avaliações 5,0, v1.0.0, conta criada na web, Bluetooth Megabras | [Google Play](https://play.google.com/store/apps/details?id=com.meshengenharia.labs&hl=pt_BR) | 2026-09 | 2026-09-18 | alta |
| [2] | Ensaia: 6 equipamentos, offline, IA, 20 °C, fluxo do laudo, Bluetooth "no lançamento", números de autoridade | [Mesh Labs /sobre/ensaia](https://labs.meshengenharia.com/sobre/ensaia) | 2026-09 | 2026-09-18 | alta |
| [3] | Preço de R$ 1.397/ano, suíte de 8 ferramentas, 50% para alunos Mesh | [Mesh Labs /sobre](https://labs.meshengenharia.com/sobre) | 2026-09 | 2026-09-18 | alta |
| [4] | Checkout: R$ 1.397 ou 12 × R$ 144,48; produtor MESH TREINAMENTOS | [Hotmart](https://pay.hotmart.com/K107463597N) | 2026-09 | 2026-09-18 | alta |
| [5] | Termos: limite de laudos por plano, Asaas/Hotmart, empresa titular, responsabilidade, arrependimento | [Mesh Labs termos de uso](https://labs.meshengenharia.com/docs/termos-de-uso) | 2026-08 | 2026-09-18 | alta |
| [6] | Privacidade: Gemini/OpenAI, Bluetooth só com megôhmetro, app exige conta, CNPJ | [Mesh Labs privacidade](https://labs.meshengenharia.com/docs/privacidade) | 2026-08 | 2026-09-18 | alta |
| [7] | Modelo do laudo, exemplo Subestação Oeste, capa, logo, PDF/DOCX/ZIP, pendências de ART e calibração, sumário pendente, nº de série | [Mesh Labs (JS público)](https://labs.meshengenharia.com/assets/client-DKw4UM1p.js) | 2026-09 | 2026-09-18 | média |
| [8] | Laudo por atividade (InspectionReportWorkspace) | [Mesh Labs (JS público)](https://labs.meshengenharia.com/assets/ReportWorkspace-4byL_0H9.js) | 2026-09 | 2026-09-18 | média |
| [9] | Chave `reports_enabled`, SPDA e Proteção como prévia, evento "Desafio dos Testes" | [Mesh Labs (JS público)](https://labs.meshengenharia.com/assets/index-CKaNZx-I.js) | 2026-09 | 2026-09-18 | média |
| [10] | Captura de tela do editor ("TR-01", DOCX/PDF) | [Mesh Labs (imagem)](https://labs.meshengenharia.com/sobre/assets/img/product/laudo-editor.png) | 2026-09 | 2026-09-18 | média |
| [11] | Aterra (em breve) | [Mesh Labs /sobre/aterra](https://labs.meshengenharia.com/sobre/aterra) | 2026-09 | 2026-09-18 | alta |
| [12] | Equipa (em breve): calibração e frota de instrumentos | [Mesh Labs /sobre/equipa](https://labs.meshengenharia.com/sobre/equipa) | 2026-09 | 2026-09-18 | alta |
| [13] | Trip: ensaio de relés, relatório rápido | [Mesh Labs /sobre/trip](https://labs.meshengenharia.com/sobre/trip) | 2026-09 | 2026-09-18 | alta |
| [14] | Site institucional: serviços de engenharia, fundador, "+2.800 alunos" | [Mesh Engenharia](https://meshengenharia.com) | 2026-09 | 2026-09-18 | média |
| [15] | Página de destino nova com números divergentes e "Lorem Ipsum" | [Mesh Engenharia](https://meshengenharia.com/landing-page-nova/) | 2026-09 | 2026-09-18 | média |
| [16] | 43,7 mil inscritos; vídeos de ago/set 2026 | [YouTube @MeshEngenharia](https://www.youtube.com/@MeshEngenharia/videos) | 2026-09 | 2026-09-18 | alta |
| [17] | 2 a 10 funcionários, cerca de 32 mil seguidores | [LinkedIn](https://br.linkedin.com/company/mesh-engenharia) | s.d. | 2026-09-18 | média |
| [18] | CNPJ aberto em 2019, CNAE de treinamento | [cnpj.biz](https://cnpj.biz/35289692000114) | s.d. | 2026-09-18 | média |
| [19] | Nenhum app iOS da Mesh ou da BruLabs | [App Store (iTunes Search API)](https://itunes.apple.com/search?term=mesh%20labs&country=br&entity=software) | 2026-09 | 2026-09-18 | alta |
| [20] | Cursos dão 1 ano de plataforma; renovação de R$ 997 a R$ 1.197 | [Mesh Engenharia (termo)](https://meshengenharia.com/termo-de-obrigacoes-das-partes/) | 2023-09 | 2026-09-18 | baixa |
| [21] | BlueLogg: só Megabras, 3,9★/30, relatório de 2 páginas | [Google Play](https://play.google.com/store/apps/details?id=com.megabras.bluelogg&hl=pt_BR) | 2026-03 | 2026-09-18 | alta |
| [22] | BlueLogg iOS: versões só com correção de erros | [App Store](https://apps.apple.com/us/app/bluelogg/id6752670070?l=pt-BR) | 2026 | 2026-09-18 | média |
| [23] | MegaLogg 3: só transferência de dados | [Megabras downloads](https://www.megabras.com/en/download/) | s.d. | 2026-09-18 | alta |
| [24] | Site da Megabras sem menção à Mesh | [Megabras](https://www.megabras.com.br/) | s.d. | 2026-09-18 | baixa |
| [25] | GroundPRO: módulos, normas, relatórios, sem ART, "Checklists Online" em breve, 768 px | [Central de Ajuda GroundPRO](https://tools.eletricaacademy.com.br/groundpro-help/) | 2026-04 | 2026-09-18 | alta |
| [26] | Plano grátis; "Branding personalizado" pago; 14 dias de teste | [GroundPRO /precos](https://ground.eletricaacademy.com.br/precos) | 2026-09 | 2026-09-18 | alta |
| [27] | Venda por turma e webinar; "Checklists Online" no painel | [GroundPRO (JS público)](https://ground.eletricaacademy.com.br/assets/index.BTz4xaRk.js) | 2026-09 | 2026-09-18 | média |
| [28] | Laudo de Continuidade: offline, calibração, cronograma, Word/PDF, sem logo | [GroundPRO (JS público)](https://ground.eletricaacademy.com.br/assets/LaudoContinuidadeEditor.DgFwJpi-.js) | 2026-09 | 2026-09-18 | média |
| [29] | Curso de SPDA R$ 1.497, com licença vitalícia e modelo Word | [Eng. Pablo Guimarães](https://lp.engpabloguimaraes.com.br/listadeesperaspda) | 2026-04 | 2026-09-18 | média |
| [30] | PTM: relatórios adaptáveis, PTMate grátis, importação de DGA | [OMICRON](https://www.omicronenergy.com/en/products/primary-test-manager-ptm/) | s.d. | 2026-09-18 | alta |
| [31] | PTM DataSync web: SaaS anual | [OMICRON](https://www.omicronenergy.com/en/products/ptm-datasync/) | s.d. | 2026-09-18 | alta |
| [32] | OMICRON em Sorocaba, com treinamento em português | [OMICRON](https://www.omicronenergy.com/en/training/location/sorocaba/) | s.d. | 2026-09-18 | média |
| [33] | PowerDB Pro: 370+ formulários, pacote em um passo, cotação | [Megger](https://www.megger.com/en-us/products/powerdbtm-pro-asset-and-test-data-management-software) | s.d. | 2026-09-18 | alta |
| [34] | PowerDB: logo, cabeçalho, capa, sumário, resumo de deficiências, calibração, importação, só Windows | [Megger (datasheet)](https://cdn.prod.website-files.com/64b83dffc8d1e2e27ca8ee91/65385cb3172590ed4921c331_Megger_PowerDB_DS_en_V13.pdf) | 2016-11 | 2026-09-18 | média |
| [35] | Licença PowerDB por softkey ou dongle | [PowerDB](https://www2.powerdb.com/index.php?option=com_content&view=article&id=34&Itemid=161) | s.d. | 2026-09-18 | alta |
| [36] | Doble DTA: instrumentos Doble e Vanguard | [Doble](https://www.doble.com/product/dta-software/) | s.d. | 2026-09-18 | alta |
| [37] | PNCP: 0 resultados para PowerDB e PTM | [PNCP](https://pncp.gov.br/api/search/?q=powerdb&tipos_documento=edital) | 2026-09 | 2026-09-18 | média |
| [38] | FLIR Thermal Studio: grátis, US$ 215,99 ou US$ 431,99 por ano | [Teledyne FLIR](https://www.flir.com/instruments/thermal-studio-upgrade/thermal-studio-upgrade/) | s.d. | 2026-09-18 | média |
| [39] | Fluke SmartView: modelos de relatório | [Fluke (datasheet)](https://download.fluke.com/Fluke/fc/2680044i-en-SmartView-datasheet-w.pdf) | 2017-05 | 2026-09-18 | média |
| [40] | Testo IRSoft: gratuito, com assistente de relatório | [Testo](https://www.testo.com/en-US/products/thermography-irsoft) | s.d. | 2026-09-18 | média |
| [41] | Produttivo: 4 planos sem preço; logo a partir do 2º plano | [Produttivo](https://www.produttivo.com.br/planos/) | s.d. | 2026-09-18 | alta |
| [42] | Modelo de "Laudo NR10"; fotos com data e GPS; assinatura na tela | [Produttivo (blog)](https://www.produttivo.com.br/blog/laudo-nr10/) | 2023-12 | 2026-09-18 | alta |
| [43] | Produttivo Play: 4,0★ geral, média de 3,53 nas recentes | [Google Play](https://play.google.com/store/apps/details?id=br.com.agivis.formapp_android&hl=pt_BR) | 2026-08 | 2026-09-18 | alta |
| [44] | Produttivo iOS 2,5★: sincronização, uma foto por vez | [App Store (RSS)](https://itunes.apple.com/br/rss/customerreviews/id=690303347/sortBy=mostRecent/json) | 2026-05 | 2026-09-18 | alta |
| [45] | "Use the app to support reports made in Word" | [Capterra](https://www.capterra.com/p/216772/Produttivo/) | 2022-11 | 2026-09-18 | média |
| [46] | Auvo 2.0: média de 3,81 nas recentes, fotos e offline | [Google Play](https://play.google.com/store/apps/details?id=br.app.auvo&hl=pt_BR) | 2026-09 | 2026-09-18 | alta |
| [47] | Auvo R$ 25–44,90: matéria de 2018 | [Mobile Time](https://www.mobiletime.com.br/noticias/11/09/2018/auvo-startup-brasileira-cresce-com-app-de-gestao-de-equipes-de-campo/) | 2018-09 | 2026-09-18 | média |
| [48] | Auvo: queixas de sincronização em 2023 | [Capterra](https://www.capterra.com/p/201778/Auvo/) | 2023-05 | 2026-09-18 | média |
| [49] | Checklist Fácil: 4,8★ geral, média de 3,65 nas recentes | [Google Play](https://play.google.com/store/apps/details?id=br.com.rz2.checklistfacil&hl=pt_BR) | 2026-09 | 2026-09-18 | alta |
| [50] | Checklist Fácil: planos sem preço | [Checklist Fácil](https://checklistfacil.com/planos/) | s.d. | 2026-09-18 | alta |
| [51] | Field Control: R$ 525/4 licenças, R$ 89 por licença extra, R$ 899 de implantação | [Omie Store](https://store.omie.com.br/apps/field-control) | s.d. | 2026-09-18 | média |
| [52] | Field Control "From R$ 525/month (4 licences)" | [Infraspeak](https://infraspeak.com/en/compare/field-control-alternative) | 2026-06 | 2026-09-18 | média |
| [53] | Field Control R$ 295/usuário/mês | [Capterra](https://www.capterra.com/p/207608/Field-Control/) | s.d. | 2026-09-18 | média |
| [54] | Página "Instalações elétricas" genérica | [Field Control](https://fieldcontrol.com.br/segmentos/instalacoes-eletricas.html) | s.d. | 2026-09-18 | alta |
| [55] | SafetyCulture: grátis, ou US$ 24–29 por assento/mês | [SafetyCulture](https://safetyculture.com/pricing) | s.d. | 2026-09-18 | alta |
| [56] | Modelos NR-10 na biblioteca Mitti | [Mitti (SafetyCulture)](https://mitti.com/library/energy-and-utilities/relatorio-de-conformidade-nr-10-iv5ejsragdri22es) | s.d. | 2026-09-18 | média |
| [57] | Minipa Link: promessa "no mesmo dia", Bluetooth, IA, Subestações no menu | [Minipa Link](https://www.minipalink.com.br/pt) | 2026 | 2026-09-18 | alta |
| [58] | Minipa Link: R$ 0/60/120/180, marca d'água até o Básico, exportação em PDF | [Minipa Link (preços)](https://www.minipalink.com.br/pt/pricing) | 2026 | 2026-09-18 | alta |
| [59] | Laudo por projeto/OS, editor de blocos, "Gerar PDF", capa | [Minipa Link (suporte)](https://www.minipalink.com.br/pt/support/reports/generate-a-report) | 2026-09 | 2026-09-18 | alta |
| [60] | Página Subestações: laudo de SE com ensaios e CREA; ensaios como checklist | [Minipa Link](https://www.minipalink.com.br/pt/para-quem-servimos/subestacoes) | s.d. | 2026-09-18 | alta (mockup de marketing) |
| [61] | Minipa Link Play: lançado em 21/07/2026, 10+ downloads | [Google Play](https://play.google.com/store/apps/details?id=br.com.elecore.minipalink&hl=pt_BR) | 2026-09 | 2026-09-18 | alta |
| [62] | Minipa Link iOS: 07/09/2026, iPad, 0 avaliações | [App Store (lookup)](https://itunes.apple.com/lookup?id=6794450045&country=br) | 2026-09 | 2026-09-18 | alta |
| [63] | Gautica GNR10: inspeção NR-10 de subestações com marca própria | [Gautica](https://gautica.com/) | 2026-09 | 2026-09-18 | alta |
| [64] | Inspekio: offline, laudo "sem Word", pré-lançamento | [Google Play](https://play.google.com/store/apps/details?id=com.inspekio.app&hl=pt_BR) | 2026-09 | 2026-09-18 | alta |
| [65] | Tecniko: grátis e a partir de R$ 59,90/mês, relatório com IA | [Tecniko (blog)](https://tecniko.app/blog/alternativa-ao-auvo) | 2026-07 | 2026-09-18 | média |
| [66] | Online OS: R$ 899,99/mês, marca própria no plano personalizado, 100% online | [Online OS](https://onlineos.com.br/planos/) | s.d. | 2026-09-18 | alta |
| [67] | e-Laudo é app de agronomia, não de elétrica | [Google Play](https://play.google.com/store/apps/details?id=br.com.okds.elaudo&hl=pt_BR) | 2025-12 | 2026-09-18 | alta |
| [68] | Busca "cabine primária" na Play sem app vertical | [Google Play (busca)](https://play.google.com/store/search?q=cabine%20prim%C3%A1ria&c=apps&hl=pt_BR) | 2026-09 | 2026-09-18 | alta |
| [69] | Busca "SPDA" na App Store sem app vertical de laudo | [App Store (iTunes Search API)](https://itunes.apple.com/search?term=SPDA&country=br&entity=software) | 2026-09 | 2026-09-18 | média |
| [70] | 6 modelos Word/Excel de laudos elétricos por R$ 49,90 | [Engenharia na Web](https://engenharianaweb.com/laudoseletrica/) | s.d. | 2026-09-18 | média |
| [71] | Laudos de cabine primária usados como modelo | [Scribd](https://www.scribd.com/doc/123932217/Laudo-e-Planilhas-Cabine-Primaria-Sansuy) | s.d. | 2026-09-18 | baixa |
| [72] | Reclame Aqui sem perfil da Mesh | [Reclame Aqui (busca)](https://www.reclameaqui.com.br/busca/?q=mesh%20engenharia) | 2026-09 | 2026-09-18 | média |
| [73] | FAQ Minipa Link: modelos adaptáveis a NBR/NR-10; Bluetooth com multímetros, alicates e termômetros; sem ART nem calibração | [Minipa Link (suporte)](https://www.minipalink.com.br/pt/support) | s.d. | 2026-09-18 | alta |
| [74] | Minipa Link: logo da empresa nas capas de laudo | [Minipa Link (conta)](https://www.minipalink.com.br/pt/support/account-workspace) | s.d. | 2026-09-18 | alta |
| [75] | Minipa Link: pareamento só de instrumento Minipa, só no app | [Minipa Link (Bluetooth)](https://www.minipalink.com.br/pt/support/bluetooth-instruments/pair-a-minipa-instrument) | 2026-09 | 2026-09-18 | alta |
| [76] | Doble DTA: chave de ativação só para contrato de manutenção ativo | [Doble (downloads)](https://www.doble.com/support/downloads/m-series-downloads/) | s.d. | 2026-09-18 | média (trecho de busca) |
| [77] | GroundPRO: "Branding personalizado" definido como "Logo da empresa nos relatórios" | [GroundPRO (JS público)](https://ground.eletricaacademy.com.br/assets/plans.BIOaeHRL.js) | 2026-09 | 2026-09-18 | média |

## Mapa de validade

As janelas de revalidação seguem o pacote competitivo:

- recursos e preço: 3 meses;
- trajetória, tração e posicionamento: 6 meses;
- sentimento de clientes: 12 meses.

Para fontes sem data, vale a data de acesso (set/2026).

**Já vencidas: 4 afirmações.** Foram lidas agora, mas a publicação é antiga:

- datasheet do PowerDB, de 2016 [34];
- ficha do BlueLogg, de mar/2026 [21];
- curso da Elétrica Academy, de abr/2026 [29];
- preço da Field Control, confirmado em jun/2026 [51].

Use-as com cautela.

**Próximas revalidações:**

- 01/10/2026: "Checklists Online" do GroundPRO [25];
- 01/11/2026: termos de uso e Bluetooth da Mesh;
- **01/12/2026:** preço e recursos da Mesh, da Minipa Link e do GroundPRO. Essa data define a pauta da próxima revalidação (fluxo Refresh).

| Revalidar em | Classe | Ref. | Afirmação | Vencida? |
|---|---|---|---|---|
| 2017-02-01 | recurso | [34] | Megger PowerDB: logo/cabeçalho/rodapé em formulários, pacote documental em um passo, importa Doble DTA e outros (não OMICRON), só Windows | sim |
| 2026-06-01 | recurso | [21] | Megabras BlueLogg: grátis, só instrumentos Megabras, 3,9★/30 avaliações, relatório curto (avaliação de 2021) | sim |
| 2026-07-01 | preço | [29] | Elétrica Academy: curso Expert em SPDA e Aterramento R$ 1.497 com licença vitalícia PROTEC-SPDA e modelo de laudo Word | sim |
| 2026-09-01 | preço | [51] | Field Control: R$ 525/mês com 4 licenças de campo | sim |
| 2026-10-01 | trajetória | [25] | GroundPRO: "Checklists Online — verificações normativas de campo" em breve | não |
| 2026-11-01 | preço | [5] | Mesh: termos (30/08/2026) permitem limitar número de laudos por plano; cobrança Asaas/Hotmart; app não vendido separado | não |
| 2026-11-01 | recurso | [6] | Mesh: Bluetooth Megabras anunciado para 14 modelos 'no lançamento' vs política de privacidade que restringe Bluetooth ao megôhmetro | não |
| 2026-12-01 | preço | [3] | Mesh Labs: preço de pré-lançamento R$ 1.397/ano (12x R$ 144,48 na Hotmart), alunos Mesh 50% de desconto, "sobe a cada ferramenta lançada" | não |
| 2026-12-01 | recurso | [7] | Mesh: laudo tem capa (nome/logo da executante) mas sumário ainda pendente; sem NR-10, plano de ação com prazos, checklist C/NC/NA ou… | não |
| 2026-12-01 | recurso | [2] | Mesh Ensaia: 6 tipos de equipamento; offline-first; IA de placa; correção a 20 °C; laudo montado depois no navegador | não |
| 2026-12-01 | recurso | [28] | GroundPRO Laudo de Continuidade (SPDA/aterramento): offline-first (IndexedDB), instrumento + certificado de calibração… | não |
| 2026-12-01 | preço | [26] | GroundPRO: plano grátis 1 usuário, 5 análises/mês, 50 MB, marca d'água; pagos sem preço público; "Branding personalizado" em plano pago… | não |
| 2026-12-01 | preço | [58] | Minipa Link: Grátis R$0 (5 relatórios), Básico R$60 (30 relatórios, ainda com marca d'água Minipa), Intermediário R$120 (3 usuários)… | não |
| 2026-12-01 | recurso | [59] | Minipa Link: relatório por projeto/OS em editor de blocos, só PDF, logo na capa, assinaturas; sem ART, calibração ou fichas estruturadas… | não |
| 2026-12-01 | preço | [53] | Field Control: Capterra lista R$ 295/usuário/mês, divergente do pacote R$ 525/4 licenças | não |
| 2026-12-01 | preço | [55] | SafetyCulture Premium US$ 24 (anual) a 29 (mensal) por assento/mês; grátis até 10 usuários | não |
| 2026-12-01 | recurso | [30] | OMICRON PTM: relatórios adaptáveis com imagens; PTMate grátis; DataSync web SaaS anual; preço de licença não publicado | não |
| 2026-12-01 | preço | [38] | FLIR Thermal Studio: Starter grátis, Standard US$ 215,99/ano, Professional US$ 431,99/ano | não |
| 2026-12-01 | preço | [70] | Pacote de 6 modelos Word/Excel de laudos elétricos (inclui subestação) a R$ 49,90 | não |
| 2026-12-01 | recurso | [19] | Mesh Labs Mobile somente Android: Play diz 'Aplicativo somente para Android' e busca na App Store BR não traz app da Mesh/BruLabs | não |
| 2026-12-01 | recurso | [8] | Mesh: InspectionReportWorkspace cria um relatório por atividade (origin insp/sourceId da atividade), com seleção de equipamentos… | não |
| 2027-03-01 | tração | [1] | Mesh Labs Mobile: 1 mil+ downloads, 13 avaliações 5,0 concentradas em 10–12/09/2026 (evento de lançamento), versão 1.0.0 | não |
| 2027-03-01 | trajetória | [9] | Mesh: módulo de relatórios atrás de chave de liberação reports_enabled; SPDA e Estudos de Proteção como prévia; Aterra/Equipa/SELetiva… | não |
| 2027-03-01 | tração | [17] | Mesh Engenharia: 2–10 funcionários e ~32 mil seguidores no LinkedIn; CNPJ com CNAE de treinamento | não |
| 2027-03-01 | tração | [61] | Minipa Link: lançado 21/07/2026 na Play (10+ downloads) e 07/09/2026 no iOS (0 avaliações) | não |
| 2027-03-01 | posicionamento | [68] | Nenhum software brasileiro dedicado a laudo de cabine primária além da Mesh (3 passagens independentes); confirmado com ressalva: Minipa… | não |
| 2027-03-01 | posicionamento | [32] | OMICRON tem escritório e centro de treinamento em Sorocaba com cursos em português | não |
| 2027-03-01 | posicionamento | [64] | Inspekio (pré-lançamento): "funciona offline de verdade", laudo técnico em PDF ao fechar a OS "sem Word" | não |
| 2027-03-01 | trajetória | [16] | YouTube @MeshEngenharia 43,7 mil inscritos; uploads retomados em ago–set/2026 com vídeos de megôhmetro, sem citar o app | não |
| 2027-08-01 | sentimento | [49] | Avaliações recentes (desde 2025-09) de Checklist Fácil (média 3,65), Auvo (3,81) e Produttivo (3,53 Play; 2,5★ iOS) concentram queixas… | não |

