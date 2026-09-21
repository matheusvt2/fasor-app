# Digest verif-r2-1

Verificador em contexto novo, 2026-09-18. Toda evidência abaixo foi obtida nesta execução (curl dos HTML e dos bundles JS para o scratchpad, WebFetch, WebSearch, Playwright só para leitura, API de busca/lookup do iTunes). Não houve login, cadastro nem envio de formulário.

## Resultado por claim

### C1 — Mesh Labs: R$ 1.397/ano, 12x R$ 144,48 (Hotmart), 50% para alunos
- **Status: confirmado só na fonte**
- **Relido:** https://labs.meshengenharia.com/sobre: "PREÇO DE PRÉ-LANÇAMENTO R$ 1.397 /ano … O preço sobe a cada ferramenta lançada … Alunos Mesh têm 50% de desconto." Diz "Alunos Mesh", não "estudantes": o desconto vale para alunos dos cursos da Mesh, não para estudantes em geral. O CTA aponta para https://pay.hotmart.com/K107463597N. O checkout Hotmart mostra: produto "Mesh Labs - Plataforma de Engenharia Elétrica", produtor "MESH TREINAMENTOS LTDA", R$ 1.397,00 à vista, ou 1 a 12 parcelas até "12 x de R$ 144,48 */ ano", com a observação "*O valor parcelado possui acréscimo".
- **Fonte independente:** nenhuma. A busca "Mesh Labs" + 1.397 trouxe só LinkedIn e Facebook da Mesh, sem o preço. A Hotmart é o checkout configurado pelo próprio vendedor e não conta como independente.
- **Correção de redação:** trocar "students 50% off" por "alunos Mesh 50% off".

### C2 — Mesh Labs Mobile (Google Play): só Android, 1.000+ downloads, 13 avaliações com nota 5,0, atualizado em 9/set/2026
- **Status: verificado** (a ausência de app iOS foi checada de forma independente na App Store; os números vêm só do Play)
- **Relido:** página do Play (hl=pt_BR, gl=BR): título "Mesh Labs Mobile", desenvolvedor "BruLabs", "1 mil+ downloads", "5,0 star 13 avaliações", "Atualizado em 9 de set. de 2026", versão 1.0.0. A descrição diz "Aplicativo somente para Android." e "Sua conta é criada diretamente no site pelo responsável pela sua organização." A página /sobre/ensaia confirma: "Planeje no navegador, execute no Android e revise o laudo na web".
- **Fonte independente:** a busca do iTunes (term=mesh labs, country=br, 38 resultados) não tem nenhum app da Mesh Engenharia nem da BruLabs. As buscas "mesh engenharia" e "brulabs" deram 0 resultados.

### C3 — Laudo web da Mesh Labs: consolidado por atividade, PDF/DOCX/ZIP, logo, checklist antes da emissão (ART, calibração)
- **Status: confirmado só na fonte, com uma correção sobre calibração**
- **Relido:** o bundle atual é /assets/index-CKaNZx-I.js, que carrega os chunks sob demanda /assets/client-DKw4UM1p.js e /assets/ReportWorkspace-4byL_0H9.js. Tudo foi baixado para o scratchpad (verif/).
  - **Documento de exemplo** em `client-DKw4UM1p.js`: o documento consolidado de exemplo tem `title:"Relatório de inspeção e ensaios — Subestação Oeste"`, reportNumber "LT-2026-0031", obra "Subestação Oeste — 13,8 kV" e atividade "Manutenção preventiva anual". Tem as seções "Relação de equipamentos e dados de placa" e "Fichas por equipamento e ensaio", com "TR-01 — Transformador de potência" (resistência de isolamento AT/BT, com megômetro e nº de série) e "DJ-04 — Disjuntor de média tensão" (resistência de contato, com micro-ohmímetro). Isso confirma vários equipamentos num único documento. O snapshot do mesmo exemplo cita "DJ-02 Disjuntor de entrada", uma inconsistência interna dos dados de exemplo. Todos os nomes são dados de teste ("Sintética").
  - **Formato do documento:** `format:"mesh-complete-report"`, `template:{id:"ensaia-activity"}`, `snapshot:{kind:"insp-activity"}`.
  - **Exportação:** "Exportar PDF", "Exportar DOCX", "Baixar pacote (ZIP)". O ZIP é descrito como "ZIP com o documento e os originais de ART e certificado". Depois da emissão, o PDF e o DOCX ficam "congelados no histórico" junto com a revisão.
  - **Logotipos:** há o campo de configuração "Logotipo da executante" (PNG ou JPEG) e também o "Logotipo de {cliente}" e a "Imagem do projeto", cada um com liga/desliga (`showClientLogo`, `showProjectImage`). O código não indica que o logo da executante seja definido por cliente ou por projeto; parece uma configuração única da executante.
  - **Checklist antes da emissão:** itens "ART do responsável técnico", "1 ensaio não realizado nesta atividade" ("Ausência de reprovação não é aprovação") e **"Calibração dos instrumentos não é registrada no sistema"**, com a instrução "Anexe o certificado ao pacote; o documento não afirma calibração que o sistema não guarda." Ou seja, a calibração aparece como pendência de cobertura: o sistema **não registra** calibração e o certificado entra como anexo do pacote. Os itens de exemplo têm `blocking:!1` (não bloqueiam a emissão).
  - **/sobre/ensaia:** "A equipe registra offline e sincroniza quando a conexão voltar. O laudo sai depois, no navegador." A página **não menciona** tablet, iPad nem iOS; só Android e navegador. Também cita "Integração oficial, autorizada pela Megabras" com BLE para megôhmetros, micro-ohmímetros e terrômetros "no lançamento".
- **Fonte independente:** nenhuma. Não achei demo em vídeo do laudo.

### C4 — GroundPRO: Laudo de Continuidade
- **Status: confirmado só na fonte, com uma ressalva sobre o logo**
- **Relido:** index.BTz4xaRk.js, que carrega /assets/LaudoContinuidadeEditor.DgFwJpi-.js (129 KB).
  - **Offline-first:** IndexedDB `groundpro-laudos` com stores `fotos` e `fila`, backoff de reenvio, e listeners `online`/`offline`. O rascunho do emitente fica em localStorage (`gp_emitente_padrao`).
  - **Instrumento e calibração:** campos `instrumento` e `certificadoCalibracao` (rótulo "Certificado de calibração"), mais temperatura e umidade. A norma padrão é "ABNT NBR 5419:2026" e o método é "Medição de resistência ôhmica para continuidade da malha do SPDA e do aterramento…".
  - **Tipos de ensaio:** Continuidade, Resistência de aterramento, Verificação de MPS, Inspeção visual.
  - **Cronograma de adequação:** Imediata (0 dias), Curto prazo (30), Médio prazo (90), Próxima parada (180).
  - **Exportação:** Word (.docx, "Laudo_de_continuidade_…docx") e PDF pela janela de impressão ("Salvar como PDF").
  - **Logo:** o chunk do laudo tem 0 ocorrências de logo, marca ou branding, e não importa o componente `CompanyReportLogo`, que existe no app mas fica em outro chunk. Então **o editor do Laudo de Continuidade não tem campo de logo**, mas o app tem logo de empresa em outros relatórios.
  - **Preços:** o bundle plans.BIOaeHRL.js define `custom_branding` como "Logo da empresa nos relatórios" e `show_watermark` como "Marca d'água nos relatórios". A página /precos, renderizada via Playwright, mostra só o plano **Gratuito**. Itens com ✓: 1 usuário, 5 análises/mês, 50 MB, marca d'água, módulos spda e aterramento. Itens com ✗: Branding personalizado, API, IA, DPS etc. Aviso: "Todos os planos incluem 14 dias de teste gratuito." A página pública não mostra preços dos planos pagos.
- **Fonte independente:** nenhuma. As buscas "GroundPRO" + "Laudo de Continuidade" e GroundPRO + Pablo Guimarães não trazem posts sobre o produto (só o perfil do Instagram, o canal do YouTube e cursos). Não foi possível datar o lançamento.

### C5 — Minipa Link: preços, promessa, Bluetooth, Subestações, Play
- **Status: confirmado só na fonte, com duas correções.** O espelho link.minipa.com.br é do mesmo vendedor e não conta como independente.
- **Relido: /pt/pricing**
  - **Grátis R$0:** 1 usuário, "5 relatórios / mês · sem orçamentos", 5 créditos de IA, 1 GB, "Fotos, medições Bluetooth e sync offline".
  - **Básico R$60/mês:** 1 usuário, 30 relatórios e 30 orçamentos, "Checklists, Document Studio e marca própria".
  - **Intermediário R$120/mês:** 3 usuários, +R$20 por usuário, 60 relatórios, "Sem marca d'água Minipa".
  - **Máster R$180/mês:** 3 usuários, 200 relatórios.
  - **Empresas:** sob consulta, a partir de 20 usuários.
  - **Correção:** na tabela comparativa, a linha "Marca d'água + rodapé Minipa" está como **Sim no Grátis e no Básico** e "Removida" só a partir do Intermediário. O Básico traz "marca própria" (Document Studio, capa), mas **ainda leva a marca d'água e o rodapé da Minipa**.
  - **Exportação:** a tabela só lista "Gerar e exportar relatório (PDF)" e "Exportar registro (PDF/CSV)".
- **Relido: /pt (home)**
  - Frase: "envie o relatório final pronto no mesmo dia". Confere.
  - O menu "Pra quem serve" inclui "Subestações". Confere.
  - "importe medições ao vivo do seu aparelho Minipa". Confere.
- **Relido: Google Play**
  - Desenvolvedor "Elecore LLC", "10+ downloads", "Atualizado em 15 de set. de 2026". Lançamento "21 de jul. de 2026" no payload da página. Confere.
  - **Correção:** o app **também existe para iOS**. A App Store traz id6794450045, "Minipa Link", ELECORE LLC, lançado em 2026-09-07, versão 1.0.6 (15/09/2026), 0 avaliações, compatível com iPad. O FAQ confirma: "App para Android e iOS no campo e um painel web para o escritório."
- **Como é o laudo** (claim central; detalhes na tabela de Claims novos):
  - **Unidade do relatório:** relatório por projeto ou por ordem de serviço, montado a partir de um modelo. O usuário escolhe o modelo, os checklists enviados e as fotos do projeto, e então abre o "Studio".
  - **Editor por blocos:** capa, títulos, texto, grupos de campos, tabelas, grades de fotos, resultados de checklist, assinaturas e quebra de página. Formato A4 ou Carta, com cabeçalho e rodapé.
  - **Só PDF:** "escolha um modelo e exporte em PDF". Nenhum DOCX foi encontrado.
  - **Logo:** "Defina o logo da empresa — Envie o logo da empresa usado nas capas de laudo". Há também uma "capa da equipe".
  - **Página Subestações:** mostra um "Laudo de inspeção SE industrial — bay TR-01" com condições no sítio, efetivo, instrumentos (IRT-103, MCR-1E, ADJ-101), ensaios da visita com status, achados (TTR 0,18%, 1,24 Ω, tan δ 0,32%, contato de disjuntor 48 µΩ, malha 0,09 Ω), fotos e assinaturas ("Eng. … — CREA …").
  - **Fichas de ensaio:** não aparecem fichas estruturadas por tipo de equipamento de MT. Os ensaios são checklists com "Exigir medição" e "Exigir foto" (ex.: "Relação de transformação — Dentro da faixa / Desvio ≤0,5%").
  - **ART e calibração:** nenhuma menção a ART nem a calibração.
  - **Normas:** o FAQ diz "Os checklists e modelos são pensados para inspeção elétrica; você os adapta ao seu procedimento" (em resposta a NBR e NR-10).
  - **Bluetooth:** só instrumentos Minipa. O FAQ diz "Multímetros, alicates e termômetros compatíveis", o exemplo é o alicate ET-3105BT e o pareamento é só no app ("O painel web não tem busca nem pareamento Bluetooth"). Sem instrumento, existe "Registro manual".
  - **Demo:** o link "Ver demo" não aponta para vídeo nem YouTube. Nenhum exemplo de laudo em PDF foi encontrado.

### C6 — Field Control: Básico R$ 525/mês com 4 licenças, licença extra R$ 89/mês, implantação R$ 899
- **Status: verificado em parte; o modelo de preço está em disputa**
- **Relido:** https://store.omie.com.br/apps/field-control: "R$ 525,00/mês" com painel de gestão ilimitado e 4 licenças de campo, licenças adicionais a "R$ 89,00/mês" cada, módulos a R$ 89/mês (o Otimizador Avançado custa R$ 169/mês), implantação de "R$ 899,00" (grátis para clientes Omie) e reajuste anual pelo IGPM.
- **Independente que concorda:** Infraspeak, "Alternativa ao Field Control" (https://infraspeak.com/en/compare/field-control-alternative), "Last updated: June 2026": "From R$ 525/month (4 licences)". Só confirma R$ 525 com 4 licenças.
- **Independente que diverge:** Capterra (https://www.capterra.com/p/207608/Field-Control/): "R$295.00 Per User, Per Month". A própria Infraspeak registra "figures differ".
- **Sem confirmação independente:** a licença extra de R$ 89 e a implantação de R$ 899 aparecem só na loja Omie.

### C7 — Não existe software brasileiro vertical para laudo de cabine primária (fichas por equipamento de MT) além da Mesh Labs
- **Status: em disputa (em parte).** Nenhum software dedicado só a cabine primária apareceu, mas há um contraexemplo parcial.
- **Buscas feitas:**
  1. "software laudo manutenção cabine primária ensaios disjuntor transformador aplicativo"
  2. "sistema relatório manutenção subestação média tensão app ensaios …"
  3. "youtube laudo cabine primária aplicativo celular relatório automático"
  4. "aplicativo gerar laudo subestação cabine primária fichas de ensaio por equipamento software brasileiro 2026"

  Os resultados trazem só prestadores de serviço, cursos, artigos acadêmicos e modelos em Scribd, Studocu ou PDF. Não apareceu nenhum app ou SaaS vertical.
- **Contraexemplo parcial: Minipa Link (Elecore/Minipa).** É uma ferramenta horizontal de field service (9 setores), mas tem a página **"Subestações"** ("Cada ensaio documentado antes de sair do local … laudo de inspeção no mesmo projeto — transformador, bay e aterramento"). Ela mostra um laudo de inspeção de SE com ensaios de TR e disjuntor, instrumentos, achados e assinatura com CREA. Não é vertical: não tem fichas estruturadas por tipo de equipamento, ART nem DOCX. Mesmo assim, disputa a frase "nenhum outro" no posicionamento.
- **Adjacente, não software:** o pacote "Laudos Elétrica" da Engenharia na Web (https://engenharianaweb.com/laudoseletrica/) são **modelos editáveis Word/Excel** a R$ 49,90 (de R$ 129,90), com 6 modelos. Inclui "Laudo de Manutenção de Subestação".

## Claims novos

| # | claim | URL | publisher | pub_date | accessed | confidence | class |
|---|---|---|---|---|---|---|---|
| N1 | Minipa Link: a marca d'água e o rodapé Minipa continuam nos planos Grátis e Básico (R$60) e só somem a partir do Intermediário (R$120) | https://www.minipalink.com.br/pt/pricing | Minipa/Elecore | s.d. | 2026-09-18 | alta | preço/fato do vendedor |
| N2 | Minipa Link exporta relatórios só em PDF ("escolha um modelo e exporte em PDF"); nenhuma menção a DOCX | https://www.minipalink.com.br/pt/support ; /pt/pricing | Minipa/Elecore | s.d. | 2026-09-18 | alta | capacidade |
| N3 | O relatório do Minipa Link é por projeto ou ordem de serviço, montado de modelo + checklists enviados + fotos no "Studio" por blocos (capa, texto, grupos de campos, tabelas, fotos, checklists, assinaturas); A4/Carta, cabeçalho e rodapé | https://www.minipalink.com.br/pt/support/reports/generate-a-report ; /pt/support/reports ; /pt/features/editor-relatorios | Minipa/Elecore | 2026-09-04 (artigo) | 2026-09-18 | alta | capacidade |
| N4 | Minipa Link tem logo da empresa nas capas de laudo e "capa da equipe" separada | https://www.minipalink.com.br/pt/support/account-workspace | Minipa/Elecore | s.d. | 2026-09-18 | alta | capacidade |
| N5 | A página "Subestações" do Minipa Link mostra "Laudo de inspeção SE industrial — bay TR-01" com instrumentos (IRT-103, MCR-1E, ADJ-101), ensaios com status, achados (TTR, resistência de enrolamento, tan δ, contato de disjuntor, malha), fotos e assinaturas com CREA; os ensaios são checklists com "Exigir medição" e não fichas por equipamento | https://www.minipalink.com.br/pt/para-quem-servimos/subestacoes | Minipa/Elecore | s.d. | 2026-09-18 | alta (é mockup de marketing) | posicionamento/capacidade |
| N6 | Bluetooth do Minipa Link: só instrumentos Minipa ("Multímetros, alicates e termômetros compatíveis"), pareamento só no app (não na web); registro manual sem instrumento; comprar instrumento Minipa não é obrigatório | https://www.minipalink.com.br/pt/support ; /pt/support/bluetooth-instruments/pair-a-minipa-instrument | Minipa/Elecore | 2026-09-04 | 2026-09-18 | alta | capacidade |
| N7 | Minipa Link tem app iOS (App Store id6794450045, ELECORE LLC, lançado em 2026-09-07, v1.0.6 de 2026-09-15, 0 avaliações, compatível com iPad) | https://itunes.apple.com/lookup?id=6794450045&country=br | Apple (App Store) | 2026-09-07 | 2026-09-18 | alta | fato de mercado |
| N8 | O FAQ do Minipa Link sobre NBR e NR-10: "Os checklists e modelos são pensados para inspeção elétrica; você os adapta ao seu procedimento." Nenhuma menção a ART nem a calibração | https://www.minipalink.com.br/pt/support | Minipa/Elecore | s.d. | 2026-09-18 | média (ausência) | capacidade |
| N9 | Mesh Labs: o checklist antes da emissão diz explicitamente "Calibração dos instrumentos não é registrada no sistema — Anexe o certificado ao pacote"; o ZIP leva "os originais de ART e certificado"; PDF e DOCX ficam congelados por revisão emitida | https://labs.meshengenharia.com/assets/client-DKw4UM1p.js | Mesh Treinamentos | s.d. | 2026-09-18 | alta | capacidade |
| N10 | A página /sobre/ensaia da Mesh anuncia integração BLE "oficial, autorizada pela Megabras" (megôhmetros, micro-ohmímetros, terrômetros) e não menciona tablet, iPad nem iOS | https://labs.meshengenharia.com/sobre/ensaia | Mesh Treinamentos | s.d. | 2026-09-18 | alta | capacidade |
| N11 | GroundPRO: o Laudo de Continuidade usa "ABNT NBR 5419:2026" como norma padrão; o app tem o componente `CompanyReportLogo` (fora do chunk do laudo); no plano Gratuito, "Branding personalizado" aparece como não incluído e há teste de 14 dias em todos os planos | https://ground.eletricaacademy.com.br/assets/LaudoContinuidadeEditor.DgFwJpi-.js ; /precos | Elétrica Academy | s.d. | 2026-09-18 | alta | capacidade/preço |
| N12 | Capterra lista Field Control a R$295/usuário/mês, divergindo do pacote de R$525 com 4 licenças da loja Omie | https://www.capterra.com/p/207608/Field-Control/ | Capterra (Gartner) | s.d. | 2026-09-18 | média | preço |
| N13 | Infraspeak (concorrente) cita Field Control "From R$ 525/month (4 licences)", atualizado em junho de 2026 | https://infraspeak.com/en/compare/field-control-alternative | Infraspeak | 2026-06 | 2026-09-18 | média | preço |
| N14 | "Laudos Elétrica" (Engenharia na Web) são 6 modelos editáveis Word/Excel a R$ 49,90, incluindo laudo de manutenção de subestação (alternativa em modelo, não software) | https://engenharianaweb.com/laudoseletrica/ | Engenharia na Web | s.d. | 2026-09-18 | média | alternativa/substituto |

## Procurado e não encontrado
- **Mesh Labs:** nenhuma menção independente ao preço de R$ 1.397/ano (Instagram, YouTube, LinkedIn); nenhuma demo em vídeo do laudo web; nenhum app iOS na App Store (BR).
- **GroundPRO:** nenhum post independente anunciando o Laudo de Continuidade, portanto sem data de lançamento; nenhum preço público dos planos pagos (a /precos só mostra o Gratuito).
- **Minipa Link:** nenhum vídeo de demo (o "Ver demo" não leva a vídeo); nenhum exemplo de laudo em PDF para baixar; nenhuma menção a DOCX, ART, calibração ou fichas de ensaio por equipamento; nenhuma lista de modelos Bluetooth além de "multímetros, alicates e termômetros compatíveis"; nenhuma cobertura independente (imprensa ou blogs); link.minipa.com.br é espelho do próprio vendedor.
- **Field Control:** nenhuma página de preços pública no fieldcontrol.com.br vista nas buscas.
- **Cabine primária:** nenhum SaaS ou app brasileiro dedicado a laudo de cabine primária com fichas por equipamento de MT, nem em buscas gerais nem no YouTube.
