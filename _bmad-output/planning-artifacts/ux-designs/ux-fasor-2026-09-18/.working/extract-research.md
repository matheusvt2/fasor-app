# Extração de insights de UX — pesquisas do fasor (2026-09-18)

Fontes: **[Mercado]** = market-laudos-eletricos-em-campo; **[Domínio]** = domain-manutencao-preventiva-e-laudo-de-cabine; **[Competitiva]** = competitive-laudos-cabine-primaria. Só entrou o que afeta UX/design. Onde os documentos não trazem informação, isso está dito.

## A. Quem usa

**Papéis (derivados de norma, não de observação):**

- **PLH responsável**: engenheiro eletricista com CREA + ART; possivelmente técnico com CRT + TRT (atribuição *contestada* CONFEA × CFT). Assina, define critérios, justifica conclusões e periodicidade. O sistema aceita ART ou TRT sem decidir quem pode assinar [Domínio §3, R8].
- **Executores autorizados**, separados do responsável (NR-10 nova 10.12.9); manobras com no mínimo duas pessoas, uma BA5; supervisor em trabalho de equipe [Domínio §1.1, §4].
- **Escritório**: revisa e emite. Na Mesh: "preparar no navegador, registrar no Android, revisar na web"; a empresa é titular da conta e "administra as equipes" [Competitiva §1].
- **Quem recebe**: dono da cabine (indústria, comércio, instituições) [Mercado §2]; compradores públicos com termos de referência detalhados [Domínio §4]; fiscalização, via PIE [Domínio §1.1].

**Contexto físico:** janela de desligamento programado (CPFL ≥15 dias, EDP ≥5 dias úteis), muitas vezes fim de semana; termografia com a instalação energizada antes do desligamento; zonas de risco em 13,8 kV de 0,38 m e 1,38 m [Domínio §4, §5]. A Mesh descreve a dor como planilha com "244 campos por transformador · 99 só para indicar unidades" e erro que só aparece "na análise no escritório", depois da janela [Competitiva §1].

**Não está nos documentos:** EPI, luz, conectividade no local, tamanho da equipe e duração do desligamento ("não encontrados" [Domínio §4]); nenhum relato de usuário real [Mercado §3]. **Dispositivo**: tablet/iPad é intenção do brief, sem evidência [Competitiva §6]; Mesh roda em celular Android; Minipa Link tem iPad [Competitiva §1, §2].

## B. Fluxo real de trabalho hoje

Sequência consolidada [Domínio §4]: ART antes do início → pedido de desligamento e rompimento de lacre [Domínio §1.3] → PT/análise de risco por turno, arquivada com rastreabilidade → avaliação prévia na chegada (com anomalia, "não deve ser iniciada") → termografia energizada → desenergização (6 passos até 31/05/2027; 7 a partir de 01/06/2027 [Domínio §1.1]) → ensaios **as-found** antes da limpeza, contador de operações antes/depois → limpeza, reaperto, inspeção visual, ensaios por fase/polo, coleta de óleo, fotos → ensaio geral de funcionamento e abertura do disjuntor por cada relé → religação → **laboratório (óleo, DGA) chega depois** e precisa ser anexado [Domínio §2.7] → laudo + ART → aceite provisório/definitivo no setor público.

**Onde dói (sinais, não relatos):**

- Papel → Excel → Word, redigitação, atraso de entrega e faturamento: **hipóteses a validar** [Mercado §3].
- Fotos e dados perdidos na sincronização, travamento ao inserir foto, lentidão: padrão em Produttivo, Checklist Fácil e Auvo [Mercado §3; Competitiva §5]. "Critério de eliminação, não diferencial" [Competitiva §8].
- Relatório curto ou vazio: BlueLogg "só gera duas páginas"; calculadora SPDA "relatório não sai preenchido" [Mercado §3].
- Laudo final ainda feito no Word (cliente da Produttivo pediu exportação Word) [Competitiva §5]; na Mesh "o laudo sai depois, no navegador" [Competitiva §1]; Minipa promete "pronto no mesmo dia" [Competitiva §2].

## C. Requisitos de conteúdo/estrutura do laudo

- **Duas NR-10 na janela do produto**: escolher a versão pela **data de execução** (10.2.4 g → 10.7.11; AT → MT; 10.5.1 → 10.13.1). O FO.SERV-03 da Fasor cita o 10.5.1 e vence em jun/2027 [Domínio §1.1, R1].
- **Plano de ação com cronograma** obrigatório: achado, foto, ação, prioridade, **prazo, responsável**, como dados [Domínio R5; Mercado §3].
- **Bloco de aterramento obrigatório** (10.15.3): método, geometria, pontos da curva, patamar, condição do solo, limite e **fonte do limite**; também continuidade [Domínio §2.8, R7].
- **Critério de aceitação como dado citável**: fonte + edição + tabela, tipo (absoluto, entre polos, vs. anterior, vs. placa, passa/falha, fabricante), limite, unidade; conclusão por fase/polo **editável e justificada pelo PLH**; não gravar "400 MΩ" [Domínio R2].
- **Contexto obrigatório da medição**: tensão, corrente, tempo (30 s/1 min/10 min), temperatura e tipo de isolamento (correção a 20 °C), umidade, condição do solo [Domínio R3].
- **Fichas**: cabo, chave, disjuntor, relé 50/51, TP/TC, transformador, aterramento [Domínio §2.10]; novas: para-raios, muflas, termografia, óleo de laboratório, ensaio geral [Domínio R6]. As-found/as-left por polo/fase [Domínio §2.5].
- **Histórico por TAG** desde o MVP (critérios "vs. anterior") [Domínio R4]; NETA pede data para tendência, placa, condições ambientais [Mercado §3].
- **C/NC/NA**: convenção **sem fonte normativa** [Domínio §5]; NBR 14039 8.2.2 já é esqueleto de checklist [Domínio §1.2].
- **Periodicidade declarada**: "próxima intervenção recomendada + justificativa", não "anual" fixo [Domínio sumário].
- **Signatário**: nome, título, conselho, registro, ART/TRT; laudo em português, digital aceito (10.15.1) [Domínio §1.1, R8].
- **Instrumentos**: certificado, data, laboratório, intervalo do dono; **alerta sem bloqueio** [Domínio R9].
- **Saída**: PDF com hash e versão, preparado para ICP-Brasil; DOCX; guarda ≥10 anos [Domínio R10, §3].
- **Editais pedem**: valores, anomalias, ações com prazo, melhorias, inventário com placa, fotos com termografia, ART; CESAN pede histórico gráfico e declaração de risco [Domínio §4].
- **Parâmetros por concessionária** configuráveis, começando pela CPFL [Domínio R12].

## D. Padrões dos concorrentes

**Mesh Labs (Ensaia)** [Competitiva §1]. Bem: offline-first ("gravado na hora"); foto, áudio e voz anexados ao equipamento/ensaio; instrumento + nº de série por medição; correção a 20 °C e veredito em campo; histórico por equipamento; laudo consolidado por atividade com escolha de equipamentos, fotos e seções; capa com logo, cor, cabeçalho, rodapé; PDF, DOCX, ZIP; revisões congeladas; **lista de pendências pré-emissão** (ART, ensaios não feitos, calibração), não bloqueante. Mal: só Android celular; laudo montado depois no navegador; sumário pendente; sem plano de ação com prazo, C/NC/NA, termografia ou NR-10; calibração não registrada; 6 tipos de equipamento; IA de placa exige internet; modelo de laudo imposto.

**Minipa Link** [Competitiva §2]: iPad; editor de blocos; logo na capa; assinatura com CREA; **só PDF**; ensaios como checklist, não fichas de MT; marca d'água no plano Básico; sem ART/calibração.

**GroundPRO** [Competitiva §3]: offline ("fotos sobem quando houver sinal") com GPS; certificado de calibração, temperatura/umidade; C/NC por ponto; **não conformidades com prazo (imediato/30/90/180 dias) e responsável**; Word/PDF; 300 fotos por laudo; sem logo; web ≥768 px.

**Genéricos** [Competitiva §5]: fotos com data/GPS e assinatura na tela (Produttivo); mas sincronização que "não funciona", uma foto por vez (Produttivo iOS), "não funciona sem internet" (Auvo), travamentos.

**Megger PowerDB** [Competitiva §4]: capa, sumário, resumo de deficiências, tabela de instrumentos com calibração; só Windows, inglês. **BlueLogg**: 2 páginas [Mercado §3]. **Status quo**: Word/Excel a R$ 49,90 [Competitiva §2].

## E. Restrições e concerns de UX

- **Offline**: pré-requisito; gravação local imediata e sync de fotos à prova de falha [Mercado R3; Competitiva §8]. IA dependente de internet fica indisponível em campo [Competitiva §1].
- **Fotos**: ligadas a equipamento, ponto de inspeção e item do plano de ação; termogramas; ZIP com originais [Competitiva §1, §3; Domínio R5].
- **Densidade**: muitos campos por fase/polo com unidades ("244 campos") [Competitiva §1] mais contexto obrigatório [Domínio R3]. Entrada manual primeiro; Bluetooth e IA fora do MVP [Mercado R5; Competitiva R5]; voz/áudio existe na Mesh.
- **Assinatura**: ICP-Brasil é o caminho defensável para laudo que compõe PIE (NR-01 1.6.2); assinatura na tela não equivale; o PDF nasce preparado mesmo se a assinatura ficar fora do MVP [Domínio §3, R10].
- **Auditoria**: revisões congeladas; hash/versão; PT rastreável; critério com fonte/edição; edição de conclusão só com justificativa; guarda ≥10 anos [Competitiva §1; Domínio §4, R2, R10].
- **Exportação**: PDF + DOCX, layout FO.SERV-03, sumário, capa [Competitiva §9]. Laboratório chega depois: laudo precisa de estados/revisão [Domínio §2.7].
- **Notificações**: só alerta de calibração sem bloqueio [Domínio R9] e pendências pré-emissão [Competitiva §1]; nada sobre push.
- **Papéis**: PLH ≠ executor; empresa administra equipes [Domínio R8; Competitiva §1].
- **Regras por data e concessionária** [Domínio R1, R12].
- **i18n**: laudo em português [Domínio §1.1]; glossário EN é proposta, sem requisito de UI multilíngue [Domínio §5]. **Acessibilidade**: não abordada em nenhum documento.
- **Plataforma**: tablet/iPad como diferencial; GroundPRO ≥768 px; PowerDB só Windows [Competitiva §6].

## F. Números citáveis

- NR-10 nova em **01/06/2027**; PIE para todo dono de cabine [Mercado sumário; Domínio §1.1].
- Desenergização **6 → 7 passos** [Domínio §1.1].
- Desligamento: CPFL **≥15 dias**, EDP **≥5 dias úteis** [Domínio §1.3].
- Isolamento 15 kV: NETA **5.000 MΩ** vs. CPFL **>30 MΩ**; sem fonte para "400 MΩ" [Domínio §2.1].
- Terra CPFL **10 Ω úmido / 25 Ω seco**; nenhuma ABNT fixa [Domínio §2.8].
- Enrolamento **≤2% vs. anterior**; TTR **≤0,5%**; contato **>50% do menor polo**; fusíveis **15%** [Domínio §2].
- "244 campos por transformador · 99 de unidades" [Competitiva §1].
- Mesh: **6 tipos**; **R$ 1.397/ano**; 1 mil+ downloads, 13 avaliações [Competitiva §1]. Minipa **R$ 60–180/mês**, 10+ downloads [Competitiva §2].
- GroundPRO: **imediato/30/90/180 dias**; **300 fotos** [Competitiva §3].
- Avaliações recentes: Produttivo **3,53** (iOS **2,5★**), Checklist Fácil **3,65**, Auvo **3,81** [Competitiva §5].
- Guarda **≥10 anos**; ART múltipla até o último dia útil do mês seguinte [Domínio §3].
- Serviço: **R$ 10–120 mil** para duas subestações (fonte única, 2020) [Domínio §4]; modelo Word **R$ 49,90** [Competitiva §2].
- Teto: ~202 mil UCs Grupo A, até ~200 mil laudos/ano (não verificado) [Mercado §1].

## G. Contradições e pontos abertos

1. **Mesh**: [Mercado §4] não achou laudo com marca, ART nem preço; [Competitiva §1] corrige: laudo com logo, ART como pendência, DOCX, R$ 1.397. Prevalece a Competitiva.
2. **ART no MVP**: "fora do MVP" na matriz [Competitiva §6] vs. campo do laudo em [Domínio R8; Mercado §3]. Escopo em aberto.
3. **Plano de ação**: "premissa não verificada" em [Competitiva §9]; verificada (10.7.11) em [Domínio §1.1; Mercado §3].
4. **Calibração**: hipótese em [Mercado R4]; modelo definido, sem bloqueio, em [Domínio R9]; diferencial em [Competitiva R4].
5. **Tablet/iPad**: intenção do brief, sem evidência de preferência dos usuários [Competitiva §6].
6. **Técnico assinar**: contestado [Domínio §3].
7. **Critérios vencidos**: NBR 10576 água 25 vs 40 ppm; DGA sem limites; NETA 2019 vs 2023 [Domínio §2.7, mapa de validade]. Reforça critério editável.
8. **"Anual"**: prática, não norma; a UI não deve assumir 12 meses [Domínio §1.5].
9. **C/NC/NA**: lacuna recomendada [Competitiva §9] sem fonte normativa [Domínio §5].
10. **Dores reais**: nenhum relato em nenhum documento; entrevistas com a Fasor e 5–10 prestadoras são pré-requisito [Mercado R6; Domínio questões abertas].
