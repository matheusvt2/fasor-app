# Extração visual — imagens de WhatsApp (docs/context)

**Fonte:** `/home/matheus/Documentos/fasor/docs/context/` — 12 arquivos JPEG
**Data da análise:** 2026-09-18
**Projeto:** Fasor — sistema para técnicos de manutenção elétrica gerarem laudos técnicos de cabine primária em campo

> **Aviso inicial importante:** nenhuma das 12 imagens é foto de campo. Não há cabine/subestação real, formulário em papel, laudo impresso nem rascunho de tela. O conjunto é composto por **11 capturas de tela de softwares de referência** (o GroundPRO, da Elétrica Academy, e a plataforma Mesh Tool Factory / Megabras vista durante a aula "Desafio dos Testes Elétricos") e **1 comprovante Pix pessoal**, que aparenta ter sido incluído por engano. As observações sobre "condições visíveis do contexto de uso" (iluminação, sujeira, EPI etc.) portanto não se aplicam; em seu lugar, registro as condições do contexto de uso *do software* que a captura revela (dispositivo, conectividade, estado da tela).

---

## 1. WhatsApp Image 2026-09-03 at 12.48.38.jpeg

- **Categoria:** outro (comprovante bancário — não relacionado ao projeto)
- **Descrição:** Comprovante de Pix do Itaú, valor R$ 1.320,00, realizado em 03/09/2026 às 12:48:27, de Matheus Villela Torres (Itaú Unibanco) para uma pessoa física (Banco C6). Contém CPFs parcialmente mascarados, chave Pix, código de autenticação e ID da transação (não transcritos aqui por serem dados pessoais/financeiros), além do rodapé com telefones da central de atendimento.
- **Condições do contexto:** captura de tela de app bancário no celular; sem relação com campo.
- **Insight de UX:** Nenhum para o produto. **Recomendação:** remover este arquivo de `docs/context/` — é dado pessoal e financeiro do autor do projeto, não deve permanecer em um diretório de contexto compartilhado com agentes e outras pessoas. Como lição indireta: o produto lidará com dados de clientes (CNPJ, endereço, responsáveis técnicos, ART) e deve tratar exportação e compartilhamento de laudos com o mesmo cuidado.

---

## 2. WhatsApp Image 2026-09-18 at 09.56.53.jpeg

- **Categoria:** tela de software existente (referência — GroundPRO, `ground.eletricaacademy.com.br/app`)
- **Descrição:** Dashboard inicial do GroundPRO no desktop (Chrome), tema escuro com acento verde. Cabeçalho: "Bom dia, BRUNO", "Última alteração 24/07/2026 00:47". KPIs: **Análises 5 · Em andamento 0 · Finalizadas 5 · Clientes 1**. Botões "Importar .grd" e "+ Nova análise". Seção **ATERRAMENTO — Ferramentas de aterramento** (4 ferramentas · 0 análises): "Aterramento de Subestação — NBR 15751 / IEEE 80 — Malha de pátio, Schwarz+Heppe, seleção seletiva toque/passo IEEE 80"; "Aterramento Simplificado — Método de Sverak (NOVO)"; "Usina Fotovoltaica — IEEE 2778 · IEC TS 62738 (NOVO)"; "Estratificação do Solo — NBR 7117 — Inversão SEV Wenner, Levenberg-Marquardt, Dar Zarrouk, curvas tipo H/K/A/Q". Seção **SPDA — Proteção contra descargas atmosféricas** (6 ferramentas · 5 análises): "Análise de Risco — NBR 5419-2:2026 (3 análises)"; "DPS — NBR 5419-4 · IEC 62305-4"; "Distância de Segurança — NBR 5419-3:2026". Coluna direita: **Atalhos** (Clientes — 1 cadastrado; Meu perfil; Importar .grd; Elétrica Tools), aviso "Em breve: Checklists Online · Alerta de Raios (SATE, NBR 16785)"; **Distribuição** (donut: Aterramento 0, SPDA 5); **Atividade** (Simulação Métodos 24/07/2026; Prédio Domingo de Morais 14/07/2026 · Análise de Risco; Igreja Universal 11/06/2026); **Novidades v1.8.1** ("08/09 — Verificação de F por zona...").
- **Condições do contexto:** desktop, ambiente de escritório; a captura é do próprio usuário Bruno (referência que o cliente usa/conhece).
- **Insight de UX:** O cliente já tem como referência mental um produto em que cada ferramenta é um **card nomeado pela norma técnica** que a rege (NBR 15751, NBR 5419-2, etc.) e o dashboard mostra contagem de análises por status. Para o Fasor, isso sugere: (a) a home deve listar laudos por status (rascunho / em andamento / finalizado) com contagem; (b) o vocabulário normativo (NBR 14039, NR-10, etc.) deve aparecer nos rótulos para dar credibilidade ao técnico; (c) tema escuro com acento verde é uma linguagem visual familiar ao usuário — mas cabe validar se funciona sob luz solar no campo, o que o GroundPRO (desktop) nunca precisou resolver.

---

## 3. WhatsApp Image 2026-09-18 at 09.56.53 (1).jpeg

- **Categoria:** tela de software existente (GroundPRO — menu "Nova análise" aberto)
- **Descrição:** Mesmo dashboard, com o dropdown de "+ Nova análise" expandido listando 10 tipos: **Aterramento de Subestação, Aterramento Simplificado, Usina Fotovoltaica, Estratificação do Solo, Análise de Risco, DPS, Distância de Segurança, Simulação de Métodos, Diagnóstico 2015 → 2026, Laudo de Continuidade**. Cursor sobre o primeiro item.
- **Condições do contexto:** desktop.
- **Insight de UX:** Um único ponto de entrada ("Nova análise") que ramifica em tipos de documento. O item "Laudo de Continuidade" mostra que a mesma plataforma já trata *laudo* como um tipo de análise ao lado de cálculos. Para o Fasor: um botão primário único "Novo laudo" com escolha de tipo (cabine primária hoje; outros tipos amanhã) é o padrão que o usuário espera. O item "Diagnóstico 2015 → 2026" indica que **versionamento de norma** (o que mudou entre revisões) é um valor reconhecido — o laudo de cabine também deve registrar qual revisão normativa foi usada.

---

## 4. WhatsApp Image 2026-09-18 at 09.56.53 (2).jpeg

- **Categoria:** tela de software existente (GroundPRO — modal de início)
- **Descrição:** Modal "Como deseja começar?" (subtítulo SPDA) com 4 opções em cards: **Nova análise** — "Começar do zero, tudo em branco"; **Abrir da nuvem** — "Carregar uma das 3 análise(s) salvas na sua conta"; **Importar do dispositivo** — "Abrir um arquivo .grd do seu computador. Cria uma nova análise — as já existentes não são alteradas"; **Ver um exemplo** — "Abrir um estudo de exemplo já preenchido, para explorar". Rodapé: "Escolha uma opção para continuar. Para sair, feche (×) e volte ao menu." Botão "Cancelar".
- **Condições do contexto:** desktop.
- **Insight de UX:** Quatro caminhos de entrada distintos, com o **"Ver um exemplo" (laudo pré-preenchido)** como recurso de onboarding e o **"Importar do dispositivo" (arquivo local)** como recurso de portabilidade/offline. Para o Fasor, um técnico novo entender a estrutura do laudo vendo um exemplo preenchido vale mais do que documentação; e a existência de arquivo local (.grd) sinaliza que o cliente valoriza não depender de nuvem — alinhado com trabalho em campo sem sinal. Também destaca-se a microcopy explicativa em cada card ("Cria uma nova análise — as já existentes não são alteradas"), que reduz medo de perder trabalho.

---

## 5. WhatsApp Image 2026-09-18 at 09.56.54.jpeg

- **Categoria:** tela de software existente (GroundPRO — formulário "Nova Análise", `/app/analysis/new`)
- **Descrição:** Tela de formulário em etapas. Cabeçalho: "← Ground PRO · Nova Análise", chips vermelhos com resultados ao vivo "**R1=6,83 × 10⁻⁴**" e "**F=3,78 × 10¹**", ícones de tema, botão azul "Exemplo", ícones de importar/exportar, botão verde "Salvar". Abas: **Informações · Zonas · Análises · Relatório · Manual**. Título "Etapas da Análise". **Etapa 1 — Dados do Cliente / Avaliação** (barra verde numerada): campos *Obra / Cliente* ("Selecione ou digite o cliente..."), *Nome da Análise*, *Responsável Técnico*, *Status* ("Selecionar status"), *ART / RT / TRT* ("Nº do documento"), *Endereço Completo* ("Rua, nº, bairro, CEP"), *Latitude* ("Ex: -19.9167"), *Longitude* ("Ex: -43.9345"), checkbox "Informar NG manualmente", *UF* (SP), *Município* ("Selecione..."), card destacado **NG (raios/km²/ano) = 12**, botão "Verificar NG da Norma Anterior". Início da **Etapa 2 — Características da Estrutura** com link "Ver ilustração: Área de exposição equivalente AD" e campos *Comprimento L (m)*, *Largura W (m)*, *Altura H (m)*. Dois toasts no canto inferior direito: "**Rascunho encontrado** — Você tem dados não salvos desta tela. Quer recuperar? [Recuperar]" e "**Sua conexão de Internet está instável.** Veja aqui como...".
- **Condições do contexto:** desktop; **conexão instável no momento da captura** (toast visível).
- **Insight de UX:** Esta é a tela mais rica em lições. (1) **Formulário em etapas numeradas com cabeçalho colorido** — estrutura que espelha as seções de um laudo. (2) **Resultado calculado sempre visível no cabeçalho** (chips R1/F) — no Fasor, o equivalente seria o status de conformidade do laudo ou o número de não-conformidades. (3) **Recuperação de rascunho automática** e **aviso de conexão instável**: mesmo um produto desktop precisou disso; em campo, com celular, isso é requisito de base — autosave local e indicador de sincronização. (4) Campo de cliente com "selecione ou digite" (combobox) e valores derivados automaticamente (NG a partir de UF/Município, com override manual) mostram o padrão "o sistema preenche, o usuário corrige". (5) Placeholders com exemplos reais ("Ex: -19.9167") reduzem erro de formato.

---

## 6. WhatsApp Image 2026-09-18 at 09.56.54 (1).jpeg

- **Categoria:** tela de software existente (GroundPRO — mesmo formulário, cursor sobre "Status")
- **Descrição:** Idêntica à imagem 5, sem o toast de conexão; permanece o toast "Rascunho encontrado / Recuperar". Cursor posicionado sobre o select "Selecionar status". Campos visíveis iguais: Obra/Cliente, Nome da Análise, Responsável Técnico, Status, ART/RT/TRT, Endereço Completo, Latitude, Longitude, Informar NG manualmente, UF=SP, Município, NG=12, "Verificar NG da Norma Anterior"; etapa 2 com Comprimento L, Largura W, Altura H, Altura proeminência Hp (m).
- **Condições do contexto:** desktop.
- **Insight de UX:** A sequência de capturas (5, 6, 8) mostra o cliente explorando os campos de cabeçalho um a um — isso indica que **os dados de identificação (cliente, responsável técnico, ART, endereço, status)** são o que ele considera o "mínimo" de um laudo. O campo *Status* como select explícito sugere que o ciclo de vida do documento (em andamento → finalizado) é controlado pelo usuário, não inferido. O Fasor deve ter esses mesmos campos na primeira etapa, com cliente e responsável técnico vindo de cadastro para não redigitar em cada laudo.

---

## 7. WhatsApp Image 2026-09-18 at 09.56.54 (2).jpeg

- **Categoria:** tela de software existente (GroundPRO — Etapa 2 preenchida com resultados)
- **Descrição:** Formulário rolado até a **Etapa 2 — Características da Estrutura**. Valores: *Comprimento L* = **50** m, *Largura W* = **20** m, *Altura H* = **15** m, *Altura proeminência Hp* = **0** m. Toggle "Estrutura com forma complexa — AD calculado externamente — Conforme NBR 5419-2:2026, A.2.1.3 — método gráfico em CAD" (desligado). Selects com referência à tabela da norma no rótulo: *Localização CD (Tab. A.1)* = "Cercada por objetos de mesma altura ou mai..."; *Nível de Proteção SPDA - PB (Tab. B.2)* = "Estrutura não protegida por SPDA (PB=1)"; *Tipo Estrutura rS (Tab. C.7)* = "Robusta: estrutura metálica ou concreto..."; *Pessoas total (nt)* = **120**; *Tipo de Estrutura - LF (Tab. C.2)* = "Outros (LF=10⁻²)"; *Proteção choque estrutura - PTA (Tab. B.1)* = "Nenhuma medida de proteção (PTA=1)". Bloco **RESULTADOS CALCULADOS** em fonte monoespaçada verde: **AD = 13.662 m² · ND = 8,20 × 10⁻² /ano · AM = 855.398 m² · NM = 1,03 × 10¹ /ano**. Abaixo, início da **Etapa 3 — Linhas Elétricas Conectadas**. Toast "Rascunho encontrado" persiste.
- **Condições do contexto:** desktop.
- **Insight de UX:** (1) **Cada select cita a tabela da norma de origem** ("Tab. A.1", "Tab. B.2") e a opção mostra o valor do coeficiente entre parênteses ("PB=1") — o técnico vê a rastreabilidade normativa da escolha sem sair da tela. No laudo de cabine, medições e critérios de aceitação devem citar o item da NBR/NR correspondente da mesma forma. (2) **Resultados calculados aparecem inline ao fim da etapa**, atualizados em tempo real — o Fasor deve avaliar conformidade (ex.: resistência de isolamento dentro/fora do limite) no momento em que o valor é digitado, não só no PDF final. (3) Unidades fixas ao lado do campo ("m") evitam ambiguidade — importante para medições em kV, MΩ, Ω, °C.

---

## 8. WhatsApp Image 2026-09-18 at 09.56.54 (3).jpeg

- **Categoria:** tela de software existente (GroundPRO — campo "Obra / Cliente" em foco)
- **Descrição:** Mesma tela da imagem 5/6, com o campo combobox *Obra / Cliente* ("Selecione ou digite o cliente...") em estado de foco (fundo verde), cursor sobre ele. Demais campos idênticos; toast "Rascunho encontrado" presente.
- **Condições do contexto:** desktop.
- **Insight de UX:** O estado de foco é **altamente contrastante** (campo inteiro muda de cor), o que no campo, com sol e luvas, é uma boa prática a replicar — o técnico precisa saber sem dúvida qual campo está ativo. O combobox de cliente (selecionar existente *ou* digitar novo) é o padrão adequado para o Fasor: evita obrigar cadastro prévio, mas reaproveita quando existe.

---

## 9. WhatsApp Image 2026-09-18 at 09.56.54 (4).jpeg

- **Categoria:** tela de software existente (referência — aula gravada "Aula 03 - Desafio dos Testes Elétricos", Megabras; protótipo mobile "Teste rápido" + laboratório 3D Mesh Tool Factory)
- **Descrição:** Captura de um vídeo (2:30:20 / 3:23:15) de aula ao vivo da Megabras com o engenheiro **Hilton Rocha** e outro apresentador em picture-in-picture. À esquerda, espelhamento de celular ("Tela do telefone", 22:32, bateria 56%) mostrando o app de protótipo: tela **"Teste rápido" → "Escolha o equipamento"** com lista de cards e contagem de campos de placa: **Autotransformador — 28 campos de placa; Chave seccionadora — 14; Condutor — 9; Disjuntor — 14; TC — 78; TP — 69; Transformador de potência — 59**, cada um com botão "+". Botão inferior "▷ Criar teste rápido" (cinza/desabilitado). À direita, navegador em `localhost:8001` com breadcrumb "Ferramentas / Laboratório de Testes": ambiente 3D de um laboratório com banner "DESAFIO dos Testes Elétricos", instruções "clique pra travar o mouse · WASD/setas anda · mouse olha · a mira abre o menu · Esc sai", bancadas com equipamentos rotulados **MPK-257, MD-10KV, HP-30KV** (maletas de instrumentos de ensaio), armários metálicos, botões "Modo teste" e "Voltar a andar".
- **Condições do contexto:** captura de vídeo/YouTube assistido em desktop; o app de referência roda em **celular**, em ambiente de demonstração (sandbox).
- **Insight de UX:** Referência direta do que o cliente quer: um app **mobile** onde o técnico escolhe o **equipamento** (transformador, disjuntor, TC, TP, seccionadora...) e o sistema já sabe quantos campos de placa aquele equipamento tem. Isso confirma o modelo de dados do Fasor como **laudo = lista de equipamentos da cabine, cada um com sua placa e seus ensaios**. A contagem "78 campos de placa" para TC é um alerta: formulários longos precisam de progressão, agrupamento (obrigatórios vs. opcionais) e captura assistida, senão o técnico abandona. O laboratório 3D é contexto da aula, não requisito.

---

## 10. WhatsApp Image 2026-09-18 at 09.56.55.jpeg

- **Categoria:** tela de software existente (mesma aula — equipamento selecionado)
- **Descrição:** Mesmo frame (2:30:26), com **"Transformador de potência"** selecionado: o card agora mostra um stepper "− 1 +" (quantidade = 1) em vez do "+", e o botão inferior **"Criar teste rápido" ficou vermelho (habilitado)**. Restante da tela igual à imagem 9.
- **Condições do contexto:** celular espelhado; demonstração.
- **Insight de UX:** Dois padrões a copiar: (1) **stepper de quantidade por tipo de equipamento** — uma cabine pode ter 2 transformadores, 3 TCs etc., e o técnico define isso antes de entrar em cada ficha; (2) **CTA que só fica ativo quando há seleção válida**, com mudança de cor evidente (cinza → vermelho). Para o Fasor, a criação do laudo deve começar por "quais equipamentos existem nesta cabine e quantos", gerando as fichas automaticamente.

---

## 11. WhatsApp Image 2026-09-18 at 09.56.55 (1).jpeg

- **Categoria:** tela de software existente (mesma aula — formulário "Dados de placa")
- **Descrição:** Frame 2:30:32. No celular, tela **"Dados de placa"** com campos obrigatórios marcados com asterisco: *Número de série \**, *Tipo \** (Selecionar), *Quantidade de taps (AT) \** (Selecionar), *Quantidade de secundários \** (Selecionar), *Tensão Primária — Fase-Fase \** (unidade "V" dentro do campo), *Tensão Secundária — Fase-Fase \** ("V"), *Ligação primária \** (cortado). Botão fixo no rodapé **"Salvar placa"** (vermelho). Cursor do apresentador sobre a lista. Restante da tela (laboratório 3D) igual.
- **Condições do contexto:** celular; formulário longo com rolagem.
- **Insight de UX:** Formulário de placa de transformador em coluna única, um campo por linha, rótulos completos ("Tensão Primária — Fase-Fase"), unidade dentro do input e **botão de salvar fixo (sticky) no rodapé** — padrão correto para telefone. O Fasor deve manter esse modelo: fichas por equipamento, um campo por linha, unidades explícitas, salvar sempre alcançável com o polegar. Selects para taps/secundários indicam que valores discretos devem ser escolhidos, não digitados.

---

## 12. WhatsApp Image 2026-09-18 at 09.56.55 (2).jpeg

- **Categoria:** tela de software existente (mesma aula — "Dados de placa" com IA + painel Mesh Factory)
- **Descrição:** Frame 2:33:32 (22:35, bateria 55%). No celular, tela **"Dados de placa"** com cabeçalho "Transformador de potência · **TF-001**" e indicador laranja "**● 12 campos obrigatórios faltando**". Campo *TAG \** = "TF-001". Botão destacado com ícone de câmera: **"Usar IA para extrair dados da foto"**. Seção "Campos da placa" → subgrupo **"Obrigatórios"**: *Fabricante \**, *Número de série \**, *Tipo \** (Selecionar). Botão fixo "Salvar placa". À direita, painel web **"Mesh Factory — Sandbox de prototipação"**, menu lateral "Ferramentas": Simulador de Fasores, Curto-Circuito, Relé Virtual, Teste de Relés, Seletiva, Biblioteca, Equipa, Laboratório de Testes, Malha de Terra. Faixa vermelha: "Ambiente sandbox: sem login, sem banco. Tudo aqui é protótipo de cálculo, stateless." Cards descritivos, ex.: "Laboratório de Testes — Laboratório virtual 3D: conecte o micro-ohmímetro pelo método dos 4 fios (Kelvin), espere a leitura estabilizar e diagnostique o equipamento. VT: transformador." e "Equipa — Gestor global da frota de instrumentos de ensaio: identificação, calibração, composição e movimentação."
- **Condições do contexto:** celular; sandbox sem persistência.
- **Insight de UX:** A imagem mais importante do conjunto para o Fasor. Três padrões explícitos: (1) **TAG do equipamento** (TF-001) como identificador de campo — o técnico pensa em TAGs, não em IDs; (2) **contador de campos obrigatórios faltando** no topo da ficha, com cor de alerta — dá senso de progresso e evita laudo incompleto; (3) **"Usar IA para extrair dados da foto"** — fotografar a placa de identificação e preencher automaticamente os campos. Dado que um TC tem 78 campos de placa, a captura por foto deixa de ser "feature bonita" e vira o principal redutor de tempo em campo. Além disso, a ferramenta "Equipa" (frota de instrumentos com calibração) sugere que o laudo deve registrar **qual instrumento (e certificado de calibração) foi usado em cada medição** — exigência típica de laudo técnico.

---

## Síntese (10 linhas)

1. O material recebido **não contém nenhuma foto de campo**: não há cabine, painel, formulário em papel ou laudo impresso — é preciso solicitar ao cliente esse material para validar condições reais (luz, sujeira, luvas, espaço).
2. O que existe são **referências de software que o cliente admira**: o GroundPRO (desktop, cálculos SPDA/aterramento por norma) e o protótipo mobile da Megabras/Mesh Factory (fichas de placa por equipamento).
3. O modelo mental do cliente é claro: **laudo = lista de equipamentos da cabine (transformador, disjuntor, TC, TP, seccionadora, condutores), cada um com TAG, placa e ensaios**, com quantidade definida por stepper antes de abrir as fichas.
4. O volume de campos é grande (TC: 78, TP: 69, transformador: 59), então **progresso visível, agrupamento obrigatório/opcional e captura de placa por foto com IA** são requisitos centrais, não extras.
5. As referências mostram **rastreabilidade normativa embutida nos rótulos** ("Tab. B.2", "PB=1", "NBR 5419-2:2026") e resultados calculados inline — o Fasor deve avaliar conformidade e citar a norma no momento da digitação.
6. Mesmo o GroundPRO desktop precisou de **recuperação de rascunho e aviso de conexão instável**; em campo, autosave local e sincronização com indicador de estado são fundamentais.
7. Padrões de formulário mobile a replicar: coluna única, unidade dentro do input, foco com alto contraste, CTA fixo no rodapé, botão só ativo quando válido.
8. A home esperada é um **painel por status** (rascunho/em andamento/finalizado) com contagem, entrada única "Novo laudo" e opções "abrir exemplo preenchido" e "importar arquivo local".
9. Dados de identificação mínimos do laudo, conforme as referências: cliente/obra (combobox), responsável técnico, ART, endereço, status, data — e, do lado das medições, o instrumento usado e sua calibração.
10. Higiene do repositório: o arquivo `WhatsApp Image 2026-09-03 at 12.48.38.jpeg` é um comprovante Pix pessoal e deve ser **removido de `docs/context/`**.
