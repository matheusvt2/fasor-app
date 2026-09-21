---
title: 'Pesquisa de mercado: software de campo para laudos de manutenção elétrica no Brasil'
type: 'market'
topic: 'Software de campo para laudos de manutenção elétrica (cabine primária/MT, SPDA, painéis) no Brasil'
decision: '(a) Ferramenta interna para a Fasor Engenharia agora vs. potencial SaaS depois; (b) nicho e público inicial'
source: 'native run'
status: complete
preset: 'standard'
validation: 'normal'
created: '2026-09-18'
updated: '2026-09-18'
claims_verified: 2
claims_unverified: 11
claims_disputed: 2
---

# Pesquisa de mercado: software de campo para laudos de manutenção elétrica no Brasil

**Decisão que esta pesquisa apoia:** construir a ferramenta primeiro para uso interno da Fasor Engenharia, avaliar se e como ela pode virar um SaaS (software vendido por assinatura) e escolher o nicho e o público iniciais.

## Sumário executivo

**Recomendação:** construir a ferramenta interna agora, focada em **laudo de manutenção preventiva de cabine primária de média tensão**, e adiar qualquer investimento em SaaS até ter em mãos três coisas: a medição do tempo economizado na Fasor, o preço e o escopo reais do concorrente Mesh Labs, e conversas com 5 a 10 empresas parecidas com a Fasor.

O que sustenta essa resposta:

1. **Existe um gatilho regulatório com data.** *Confiança alta.* A NR-10 foi reescrita (Portaria MTE 737/2026) e o texto novo entra em vigor em **01/06/2027** [1][2][3][4].
   - Toda organização passa a ter de manter um relatório de inspeção com **medidas de prevenção, plano de ação e cronograma de adequação** (10.7.11), ainda que sem periodicidade definida, e a documentar as medições de aterramento (10.15.3) [1].
   - O corte de 75 kW que definia quem precisava do Prontuário de Instalações Elétricas (PIE) desaparece. O PIE passa a ser exigido de quem "realiza atividades em instalações elétricas com média e alta tensão" [1][2][4].
   - *Inferência:* na prática, o relatório de inspeção exigido pela NR-10 é o laudo que a empresa prestadora entrega. O laudo estruturado deixa de ser só boa prática.
2. **Já existe um concorrente direto, e ele é recente.** *Confiança média.* O app Mesh Labs Mobile é só Android e é voltado a "inspeções e ensaios em subestações, cabines primárias". A plataforma web da Mesh já tem um fluxo de laudo, identificado no código das telas do site, sem teste de uso [20][21]. Não foram encontrados laudo em PDF no padrão da empresa, número de ART nem checklist C/NC/NA (conforme/não conforme/não se aplica). A adoção ainda é pequena: mais de 1 mil downloads e 13 avaliações [20]. Não achar um recurso não prova que ele não existe. Detalhes na seção 4.
3. **Não há concorrente dominante, e o requisito mínimo é não perder foto.**
   - Nenhum concorrente brasileiro específico do setor elétrico (vertical) ou de app de campo genérico publica preço [21][23][30][31][45].
   - Os apps genéricos brasileiros de campo, que têm escala, concentram reclamações de **sincronização instável e fotos perdidas** [27][28][29]. *Confiança média: é um padrão em 3 fornecedores com poucas avaliações.* Isso define o requisito mínimo técnico: um app que perde foto não serve para laudo.

**Maior ressalva:** o **tamanho do mercado alcançável não foi quantificado.** Os números disponíveis são tetos, não o público real:

- cerca de 202 mil unidades consumidoras no Grupo A, em fonte única de 2024 [9];
- cerca de 326 mil empresas no CNAE de instalação e manutenção elétrica [11].

Também não se obteve nenhum relato real de usuário: os fóruns consultados bloquearam o acesso. A tese de SaaS continua sendo hipótese. Das 15 afirmações-chave desta pesquisa, 2 estão verificadas, 11 não verificadas e 2 contestadas.

## 1. Tamanho do mercado alcançável

O mercado útil para um SaaS é o de **empresas de engenharia que fazem manutenção em média tensão**. Nenhuma fonte o mede diretamente. O limite real é a quantidade de empresas prestadoras, e esse mercado é pulverizado em pequenas e médias empresas (PMEs) regionais [41]. Os indicadores disponíveis são tetos:

- **Empresas:**
  - CNAE 4321-5/00 (instalação e manutenção elétrica): 325.942 empresas ativas;
  - CNAE 7112-0/00 (serviços de engenharia, todas as modalidades): 155.543 [11][12];
  - SP concentra cerca de 28% nos dois [11][12].

  Não há corte por porte, e é provável que muitas sejam MEI. *Não verificado.*
- **Unidades consumidoras (UCs) do Grupo A (média e alta tensão):** cerca de 202 mil, das quais mais de 48 mil já estavam no mercado livre em 2024 [8][9]. Das 31.430 que comunicaram intenção de migrar para o mercado livre até jul/2024, 95% têm demanda abaixo de 500 kW [10]. A base, portanto, é formada sobretudo por consumidores pequenos e médios de média tensão. *Não verificado: fonte única (ABRACEEL com dados da ANEEL), sem dado primário da ANEEL nem divisão por subgrupo.*
- **Engenheiros eletricistas registrados:** 116.185 segundo o CONFEA por volta de 2021 [13]. Outras cifras (128.576 e cerca de 180 mil) circulam sem fonte aberta. *Contestado.*
- **Frequência de manutenção:**
  - A NBR 14039 **não fixa prazo** para a preventiva de cabine. Os 12 meses são prática de mercado [19].
  - A NR-10 nova exige o relatório de inspeção, mas também sem periodicidade [1].
  - Contratos institucionais podem ser mais frequentes: um anexo de edital da Unifesp prevê manutenção de 3 em 3 e de 6 em 6 meses [43]. *Baixa confiança: só se leu o trecho exibido na busca, não o edital.*

**Estimativa derivada, não verificada:** se toda UC do Grupo A tivesse uma cabine com preventiva anual, seriam até cerca de 200 mil laudos por ano. Esse é um teto: nem toda UC tem cabine própria, e a preventiva anual é prática de mercado, não obrigação [19].

## 2. Segmentos e comportamento de compra

- **Quem produz o laudo:**
  - empresas prestadoras de manutenção preventiva, que entregam "laudo técnico final com plano de ação" [41][42];
  - engenheiros eletricistas com registro no CREA, que assinam com ART [6].
- **Quem demanda:** donos de cabine (indústria, prédios comerciais, instituições).
- **Por quê:**
  - NR-10, sobretudo a partir de jun/2027 [1];
  - concessionária e seguradora [41] (*baixa confiança*);
  - AVCB, de forma indireta [17][18] (ver seção 3, SPDA).
- **Segmento inicial mais promissor:** **PMEs de engenharia que fazem preventiva de média tensão em clientes corporativos**, o perfil da própria Fasor.
  - Motivos: dor recorrente, valor alto por serviço e laudo longo e padronizado.
  - Menos promissores:
    - engenheiro autônomo: menor volume;
    - equipes internas de indústria: provavelmente o público dos fornecedores já estabelecidos, como a OMICRON, cuja ferramenta é de ensaio diagnóstico ligada aos instrumentos da própria marca [24] (*inferência*);
    - apps genéricos: já cobrem quem precisa só de checklist [27][28].
- **Gasto com software:** engenheiros brasileiros já pagam assinatura anual por software técnico, como o AltoQi Builder [35] (valores na seção 5). Há sinais de resistência ao modelo de assinatura (revenda de "licença vitalícia", reclamações), mas só foram vistos os títulos das páginas, não o conteúdo [36]. *Baixa confiança.*

## 3. Dores, necessidades não atendidas e compliance

### Dores

- **Relatos de usuário:** não se obteve nenhum relato real de profissional. O Reddit, o fórum Mike Holt e o Electricians Forums bloquearam o acesso. As dores levantadas no resumo inicial do projeto (papel → Excel → Word, redigitação, atraso na entrega e no faturamento) continuam **hipóteses a validar em entrevista**.
- **Apps de campo:** as reclamações nas lojas de apps genéricos brasileiros se repetem há anos [27][28][29]:
  - Produttivo: fotos e dados perdidos na sincronização ("terei de voltar aos locais") e lentidão para preencher;
  - Checklist Fácil: sincronização lenta;
  - Auvo: travamento ao inserir foto.

  É o achado de dor mais sólido desta pesquisa. *Confiança média: padrão em 3 fornecedores, com poucas avaliações.*
- **Relatórios de apps existentes:**
  - No app oficial da Megabras, um usuário reclama que "só gera duas páginas de relatório" e pede suporte a TTR [25].
  - Em uma calculadora de SPDA, a reclamação mais votada é que "o relatório não sai preenchido" [26].

  O relatório é o ponto fraco recorrente.
- **Análogo no exterior:** no Reino Unido existe um mercado maduro de software de certificação e relatório de ensaio para eletricistas (EasyCert, NAPIT, iCertifi, Sparkify) [38]. É sinal de que há quem pague para resolver essa dor. *Confiança baixa a média.*

### Compliance: o que o laudo precisa conter

| Requisito | Fonte | Implicação para o produto |
|---|---|---|
| Relatório de inspeção com medidas de prevenção, **plano de ação e cronograma** (NR-10 nova, 10.7.11), para toda organização | [1] | Plano de ação e prazos como estrutura de dados, não texto livre |
| Documentação de inspeções e **medições de aterramento** (10.15.3), para toda organização | [1][4] | Bloco de medição de aterramento em todo laudo de cabine |
| PIE para quem integra o SEP ou realiza atividades em MT/AT (10.15.6), sob responsabilidade de profissional legalmente habilitado; **fim do limite de 75 kW** do texto antigo (10.2.4) | [1][2][4][5] | Laudo exportável como peça do prontuário |
| Documentação em **meio digital** aceita (10.15.1) | [1] | PDF e armazenamento digital são válidos |
| ART obrigatória; **assinaturas eletrônicas e documentos digitais válidos "na forma da lei"**; ART múltipla mensal para serviço periódico | [6] | Campo de número da ART no laudo; relatório mensal que ajuda a preencher a ART múltipla (hipótese de funcionalidade) |
| Relatório de ensaio com valores as-found/as-left, **valores de referência**, condições ambientais, dados de placa, data "para tendência histórica", análise e recomendações | [7] | Referência internacional (NETA) para os campos de cada ficha e para comparação com o laudo anterior |

**Atenção:** o item 10.15.4 "d" do PIE trata de ensaios de isolação de ferramental, EPI e EPC, não de transformadores e disjuntores. A afirmação contrária foi **derrubada** na verificação [1]. O argumento de venda correto cita os itens 10.7.11 e 10.15.3.

### SPDA

- No texto novo, o SPDA sai da lista documental da NR-10 e fica apenas como medida de proteção coletiva (10.6.8) [1][4].
- A NBR 5419:2026 foi publicada em 10/03/2026, com transição de 180 dias [14][15].
- Mudanças atribuídas à nova norma, segundo sites de prestadoras e sem confirmação independente [16]:
  - inspeção anual para áreas classificadas e serviços essenciais e a cada 3 anos para as demais estruturas;
  - aterramento verificado por continuidade em vez de medição de resistência.
- A afirmação de que "o Bombeiro de SP exige laudo de SPDA autônomo" é **contestada**. A Instrução Técnica (IT) 41/2025 do Corpo de Bombeiros trata da inspeção de instalações de baixa tensão e inclui a conformidade do SPDA como item de checagem, com ART [17]. A exigência para o AVCB, portanto, é indireta [18].

## 4. Panorama competitivo

Ordem da tabela: concorrentes verticais brasileiros, apps genéricos brasileiros, apps genéricos globais e o status quo.

| Concorrente | Plataforma | Preço | Foco | Brecha observada |
|---|---|---|---|---|
| **Mesh Labs** (Mesh Engenharia) | Web + Android ("Mesh Labs Mobile") [20][21] | Não público; conta criada pela organização (venda para empresas) [20][21] | Inspeção e ensaios em subestação e cabine primária [20] | Só Android; não se achou laudo em PDF no padrão da empresa, ART nem checklist C/NC/NA [20][21]; adoção inicial (1 mil+ downloads, 13 avaliações) [20] |
| **GroundPRO** (Elétrica Academy) | Web [23] | Plano grátis limitado (cliente fixo, análises por mês, marca d'água); planos pagos com cobrança pelo Stripe, sem preço público; acesso por turma de curso [23] | Cálculo de aterramento e SPDA pela NBR 5419:2026; "Laudo de Continuidade" em campo; **"Em breve: Checklists Online"**, sem data [23] | Não cobre ensaios de equipamentos de MT; venda atrelada a curso |
| **OMICRON PTM + PTMate** | Desktop + app grátis [24] | Não público [24] | Ensaios diagnósticos de MT/AT com planos IEEE/IEC e controle do instrumento [24] | Pensado para os instrumentos OMICRON; importação de dados de instrumentos de outras marcas citada só para DGA [24] |
| **Megabras BlueLogg** | Android [25] | Grátis, vinculado ao instrumento | Coleta dos instrumentos Megabras | Só Megabras; relatório de 2 páginas; 3,7★ [25] |
| **Checklist Fácil** | Android/iOS/Web | Sob consulta [30] | Checklists genéricos; 500 mil+ downloads, 4,8★ [27] | Sincronização lenta; nada específico de ensaio [27] |
| **Produttivo** | Android/iOS/Web | Sob consulta; teste grátis de 15 dias [31] | Ordem de serviço + PDF; já publica conteúdo para aparecer nas buscas por "Laudo NR10" [32]; 100 mil+ downloads [28] | Perda de fotos e dados na sincronização [28] |
| **Auvo** | Android/iOS/Web | Não público [45] | Gestão de equipe de campo; 10 mil+ downloads [29] | Trava ao inserir fotos; suporte fraco [29] |
| **SafetyCulture/Mitti, GoCanvas** | Web + mobile | Mitti: grátis até 10 usuários, US$ 24–29/assento/mês [33]; GoCanvas: US$ 29–49/usuário/mês, mínimo 3 [34] | Formulários e inspeções genéricos | Cobrança em dólar; nada específico do Brasil (ART, Rede Brasileira de Calibração – RBC) |
| **Papel + Excel + Word** | — | Custo adicional quase zero | Status quo | Sem evidência externa coletada |

**Mesh Labs em detalhe.**

- **Quem publica:** o app é publicado na Google Play pela conta de desenvolvedor "BruLabs", ligada à Mesh Engenharia (identificador do app na loja: com.meshengenharia.labs) [20].
- **Datas:** estava na Google Play em set/2026, com última atualização em 09/09/2026; a data de lançamento não foi apurada. As avaliações visíveis estão concentradas em 11/09/2026 [20].
- **Recursos, segundo o fornecedor:** leitura da placa de identificação do equipamento por IA, funcionamento offline, correção por temperatura, histórico por equipamento e integração opcional por Bluetooth só com instrumentos Megabras [20].
- **Laudo na web:** a plataforma web tem placar de aprovados, reprovados e não ensaiados, veredito e conclusão editáveis e exportação de planilha. Esse escopo foi identificado no código das telas do site, sem teste de uso [21].
- **Canal de venda:** a base de alunos, com 43,7 mil inscritos no YouTube e "mais de 2.200 alunos" (autodeclarado) [22][39][40].

**Não cobertos:** Megger PowerDB (site bloqueado) e Doble (não foi possível obter orçamento). Nenhum outro app brasileiro de laudo de cabine ou de ensaios de MT apareceu nas buscas da Google Play [46]. *Confiança média: a busca da loja é imprecisa.*

## 5. GTM e dinâmica de preço

- **Preço escondido é a norma entre os concorrentes verticais e de campo brasileiros.** Mesh, GroundPRO, OMICRON, Checklist Fácil, Produttivo e Auvo não publicam preço [21][23][24][30][31][45]. As referências públicas disponíveis:
  - AltoQi Builder, para projeto: assinatura anual de R$ 2.964 a R$ 8.244 por membro; o módulo SPDA só vem a partir de R$ 5.484 por ano [35];
  - apps globais de formulário: US$ 24–49 por usuário por mês [33][34].
- **Os concorrentes verticais vendem pela própria escola.** Mesh e GroundPRO vendem software para a própria base de alunos de cursos, webinars e turmas [22][23][40]. O Mundo da Elétrica declara mais de 1 milhão de seguidores somando as redes [44] (*alegação própria*). Não se achou exemplo de pacote curso + SaaS fora desses dois.
- **Referências de SaaS para PMEs no Brasil** (fonte única: site agregador que não informa a metodologia) [37]:
  - CAC (custo para conquistar cada cliente): R$ 3–12 mil;
  - churn (cancelamento de clientes) mensal: 3–7%.

  *Baixa confiança: não usar para planejar.*

## Insights que só a combinação mostra

1. **Regulação + concorrência → janela curta.** A NR-10 nova cria uma obrigação com data (jun/2027) no mesmo momento em que a Mesh já tem na loja um app para cabine primária (visto em set/2026) [1][20]. Quem tiver o **relatório com plano de ação e cronograma (10.7.11)** pronto antes de 2027 fala a língua da fiscalização. Nas fontes da Mesh, o foco é o resultado do ensaio (aprovado/reprovado), não o plano de ação [20][21]. *Inferência.*
2. **O laudo é o produto, a coleta é o requisito mínimo.** O app da Megabras coleta bem, mas gera um relatório curto [25]. Na calculadora de SPDA, a reclamação é o relatório que não sai preenchido [26]. Os genéricos fazem PDF, mas têm reclamações de fotos e sincronização [27][28][29]. A Mesh tem um laudo de resultado de ensaio, mas não se achou laudo no padrão da empresa, com ART e plano de ação [21]. O diferencial difícil de copiar é **coleta confiável offline + laudo no padrão da empresa, pronto ao fim do serviço, com comparação ao laudo anterior** [7].
3. **Não depender de marca de instrumento é um posicionamento possível.** A Mesh só se integra, de forma opcional, a instrumentos Megabras. A OMICRON é centrada nos próprios instrumentos, e o BlueLogg só funciona com Megabras [20][24][25]. Uma prestadora com instrumentos de várias marcas não tem hoje uma ferramenta neutra. *Inferência a validar.*
4. **SPDA é terreno instável e disputado.** A norma mudou em 2026, o SPDA saiu da NR-10 e o GroundPRO já ocupa o nicho com a NBR 5419:2026 e checklists anunciados [1][14][23]. Não é o melhor primeiro nicho.

## Recomendações

| # | Recomendação | Base de confiança | Alimenta |
|---|---|---|---|
| R1 | **Construir a ferramenta interna agora**, sem estrutura comercial de SaaS. A necessidade da Fasor existe por si só. Antes de começar, **testar o app e a plataforma web do Mesh Labs**: a web já tem um fluxo de laudo, e o escopo real não foi testado [21]. | Média-baixa: a lacuna do concorrente (laudo no padrão da empresa, ART, plano de ação) foi inferida da ficha da loja e do código das telas do site [20][21] | Product brief (problema, usuários) |
| R2 | **Primeiro nicho: preventiva de cabine primária de MT**, com SPDA depois. | Alta para a regulação [1]; média para a concorrência [20][23] | Product brief (escopo) |
| R3 | **Requisitos mínimos:** offline e **sincronização de fotos à prova de falha**, porque é uma dor recorrente nos apps genéricos. | Média: padrão em 3 fornecedores com poucas avaliações [27][28][29] | PRD (requisitos não funcionais) |
| R4 | **Modelar o laudo pela NR-10 nova e pela NETA:** plano de ação e cronograma como dados (10.7.11); bloco de aterramento (10.15.3); valores de referência e critério de aceitação; condições ambientais; as-found/as-left; histórico para comparar com o laudo anterior. Registrar o instrumento e o certificado de calibração é **hipótese**: a exigência de calibração rastreável não foi pesquisada. | Alta para os itens com fonte primária [1][7]; hipótese para a calibração | PRD (modelo de dados) |
| R5 | **Não depender de marca de instrumento.** Entrada manual primeiro; integração por Bluetooth só se um usuário real pedir. | Baixa: inferência [20][24][25] | Arquitetura |
| R6 | **Antes de qualquer decisão de SaaS:** (a) medir as horas economizadas por laudo na Fasor; (b) pedir proposta ao Mesh Labs para saber o preço real (o teste do app está na R1); (c) entrevistar 5 a 10 empresas prestadoras de MT. | Necessário porque os relatos de usuário e o tamanho do mercado não foram verificados | Decisão de seguir ou não com o SaaS |
| R7 | **Se virar SaaS:** assinatura por usuário ou por empresa, com preço público. Os concorrentes verticais e de campo brasileiros escondem preço, e isso pode ser um diferencial para PMEs. | Baixa: inferência sobre preço escondido [21][23][30][31][45] | Estratégia de preço |

## Questões em aberto

| Questão | O que é preciso para responder |
|---|---|
| Quantas empresas fazem manutenção de MT (o público real)? | Dados abertos de CNPJ da Receita filtrados por porte e CNAE secundário; contagem de UCs do Grupo A por subgrupo na ANEEL (BDGD/SAMP) |
| As dores são reais e quanto tempo o laudo consome? | Entrevistas com a equipe da Fasor e com 5 a 10 empresas prestadoras. A web não trouxe relatos |
| Preço, escopo real e laudo do Mesh Labs? | Testar o app (Android) e a web, pedir proposta, acompanhar o canal da Mesh |
| Quando saem os "Checklists Online" do GroundPRO? | Acompanhar as notas de atualização do GroundPRO |
| O dono de cabine que terceiriza a manutenção precisa de PIE (10.15.6 "b")? | Nota técnica do MTE ou parecer jurídico; revistas de SST (Proteção, Cipa) |
| Periodicidade de inspeção e método de aterramento na NBR 5419:2026? | Texto da norma no catálogo ABNT |
| Megger PowerDB e Doble são alternativa real para PMEs no Brasil? | Distribuidores no Brasil; demonstração |

## Apêndice de fontes

| # | Claim/achado que sustenta | Publicador | Data de pub. | Acesso | Confiança |
|---|---|---|---|---|---|
| [1] | Texto da NR-10 nova (Portaria 737/2026): vigência, 10.7.11, 10.15.x, digital, SPDA fora da lista | [MTE (gov.br)](https://www.gov.br/trabalho-e-emprego/pt-br/assuntos/inspecao-do-trabalho/seguranca-e-saude-no-trabalho/sst-portarias/2026-1/portaria-mte-no-737-nova-nr-10.pdf) | 2026-06 | 2026-09-18 | alta |
| [2] | Vacância de 1 ano; fim do critério de 75 kW | [RS Data](https://www.rsdata.com.br/nova-nr-10-analise-tecnica-mudancas-pie-treinamentos-fiscalizacao/) | 2026-06 | 2026-09-18 | alta |
| [3] | Transição de 12 meses; vigência em jun/2027 | [SOC](https://www.soc.com.br/blog-de-sst/nr-10-foi-atualizada-entenda-o-que-muda-para-as-empresas-com-a-portaria-mte-no-737-2026/) | 2026-06 | 2026-09-18 | alta |
| [4] | Texto atual até 31/05/2027; novo a partir de 01/06/2027; comparação textual do PIE | [Top Elétrica](https://www.topeletrica.com.br/2026/09/04/prontuario-instalacoes-eletricas-pie-nr10-2027/) | 2026-09 | 2026-09-18 | alta |
| [5] | Texto antigo da NR-10 (10.2.4, >75 kW) | [MTE (gov.br)](https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-partitaria-permanente/arquivos/normas-regulamentadoras/nr-10-atualizada-2019-1.pdf) | 2019 | 2026-09-18 | alta |
| [6] | ART obrigatória, assinatura eletrônica, ART múltipla | [CONFEA Res. 1.137/2023 (via CREA-RS)](https://www.crea-rs.org.br/site/documentos/resolucao_1137.pdf) | 2023-03 | 2026-09-18 | alta |
| [7] | Requisitos de relatório de ensaio (as-found/as-left, tendência, recomendações) | [NETA](https://s3.amazonaws.com/NETA-MP/Current-Policies/NETA+-+Test+Report+Guide.pdf) | 2021-09 | 2026-09-18 | alta |
| [8] | ~202 mil UCs no Grupo A (2023) | [ABRACEEL](https://abraceel.com.br/press-releases/2023/12/a-partir-de-janeiro-de-2024-165-mil-empresas-poderao-trocar-de-fornecedor-de-energia-eletrica/) | 2023-12 | 2026-09-18 | média |
| [9] | ~202 mil UCs no Grupo A; 48 mil+ no mercado livre | [ABRACEEL](https://abraceel.com.br/press-releases/2024/07/previsao-de-novos-consumidores-no-mercado-livre-de-energia-supera-27-mil-ate-2025/) | 2024-07 | 2026-09-18 | média (não verificado) |
| [10] | 95% das UCs em migração com demanda abaixo de 500 kW | [ABRACEEL](https://abraceel.com.br/press-releases/2024/08/mais-de-31-mil-consumidores-de-energia-indicam-migracao-para-o-mercado-livre-de-energia-ate-2025/) | 2024-08 | 2026-09-18 | média |
| [11] | 325.942 empresas no CNAE 4321-5/00 | [cnpj.chat (Receita Federal)](https://cnpj.chat/cnae/4321500-instalacao-e-manutencao-eletrica) | 2026-09 | 2026-09-18 | média |
| [12] | 155.543 empresas no CNAE 7112-0/00 | [cnpj.chat (Receita Federal)](https://cnpj.chat/cnae/7112000-servicos-de-engenharia) | 2026-09 | 2026-09-18 | média |
| [13] | 116.185 engenheiros eletricistas (CONFEA) | [Canal Solar](https://canalsolar.com.br/ser-engenheiro-eletricista-significa-garantir-um-futuro-verde/) | 2021-11 | 2026-09-18 | baixa (contestado) |
| [14] | NBR 5419:2026 publicada em 10/03/2026 | [O Setor Elétrico](https://www.osetoreletrico.com.br/a-nova-nbr-5419-chegou/) | 2026 | 2026-09-18 | alta |
| [15] | Transição de 180 dias da NBR 5419:2026 | [O Setor Elétrico](https://www.osetoreletrico.com.br/versao-corrigida-da-nova-nbr-54192026-em-alguns-casos-permite-manter-a-versao-de-2015/) | 2026-05 | 2026-09-18 | alta |
| [16] | Periodicidade de 1 ou 3 anos e continuidade (NBR 5419:2026) | [Token Engenharia](https://tokenengenharia.com.br/nbr-5419-atualizada-2026/) | 2026 | 2026-09-18 | baixa (não verificado) |
| [17] | IT 41/2025 CBPMESP: inspeção de BT, SPDA como item, ART | [Guia SegCI](https://guiasegci.com.br/legislacoes/it-41-2025-inspecao-em-instalacoes/) | 2025-03 | 2026-09-18 | média |
| [18] | IT 01/2025 CBPMESP: responsabilidade técnica das medidas de segurança | [Guia SegCI](https://guiasegci.com.br/legislacoes/it-01-2025-procedimentos-administrativos/) | 2025-02 | 2026-09-18 | média |
| [19] | NBR 14039 sem prazo fixo; 12 meses como prática | [Manau Engenharia](https://manauengenharia.com.br/manutencao-de-subestacao-frequencia-nbr-14039/) | sem data | 2026-09-18 | baixa |
| [20] | Mesh Labs Mobile: escopo, recursos, downloads, avaliações, só Android | [Google Play](https://play.google.com/store/apps/details?id=com.meshengenharia.labs) | 2026-09 | 2026-09-18 | alta (ficha do fornecedor) |
| [21] | Plataforma Mesh Labs, módulo Ensaia, IA de placa, modelo de dados | [Mesh Engenharia](https://labs.meshengenharia.com/) | 2026-09 | 2026-09-18 | média (código de UI) |
| [22] | 43,7 mil inscritos no canal da Mesh | [YouTube](https://www.youtube.com/@MeshEngenharia) | 2026-09 | 2026-09-18 | alta |
| [23] | GroundPRO: módulos, plano grátis, Stripe, turmas, "Checklists Online" | [Elétrica Academy](https://ground.eletricaacademy.com.br/) | 2026-09 | 2026-09-18 | média (código de UI) |
| [24] | OMICRON PTM: escopo, importação de terceiros, PTMate | [OMICRON](https://www.omicronenergy.com/en/products/primary-test-manager-ptm/) | sem data | 2026-09-18 | alta |
| [25] | Megabras BlueLogg: só Megabras, relatório de 2 páginas, 3,7★ | [Google Play](https://play.google.com/store/apps/details?id=com.megabras.bluelogg) | 2026-03 | 2026-09-18 | alta |
| [26] | App de cálculo SPDA: "relatório não sai preenchido" | [Google Play](https://play.google.com/store/apps/details?id=com.SPDACompany.SPDA) | 2025-10 | 2026-09-18 | alta |
| [27] | Checklist Fácil: 500 mil+ downloads; reclamações de sincronização | [Google Play](https://play.google.com/store/apps/details?id=br.com.rz2.checklistfacil) | 2026-09 | 2026-09-18 | média |
| [28] | Produttivo: 100 mil+ downloads; fotos e dados perdidos | [Google Play](https://play.google.com/store/apps/details?id=br.com.agivis.formapp_android) | 2026-08 | 2026-09-18 | média-alta |
| [29] | Auvo: 10 mil+ downloads; trava ao inserir fotos | [Google Play](https://play.google.com/store/apps/details?id=br.app.auvo) | 2026-09 | 2026-09-18 | média |
| [30] | Checklist Fácil sem preço público | [Checklist Fácil](https://checklistfacil.com/planos/) | sem data | 2026-09-18 | alta |
| [31] | Produttivo sem preço público; trial de 15 dias | [Produttivo](https://www.produttivo.com.br/planos/) | sem data | 2026-09-18 | alta |
| [32] | Produttivo com conteúdo de "Laudo NR10" | [Produttivo](https://www.produttivo.com.br/blog/laudo-nr10/) | sem data | 2026-09-18 | média |
| [33] | SafetyCulture/Mitti: grátis até 10 usuários; US$24–29/assento/mês | [Mitti (SafetyCulture)](https://mitti.com/pricing) | 2026-09 | 2026-09-18 | alta |
| [34] | GoCanvas US$29/39/49 por usuário/mês, mínimo 3 | [GoCanvas](https://www.gocanvas.com/products/packages) | 2026-09 | 2026-09-18 | alta |
| [35] | AltoQi Builder: assinatura anual R$2.964–8.244; SPDA a partir do Premium | [AltoQi](https://www.altoqi.com.br/planos/builder) | 2026-09 | 2026-09-18 | alta |
| [36] | Revenda de "licença vitalícia"; reclamação sobre a AltoQi | [Reclame Aqui](https://www.reclameaqui.com.br/altoqi-software-para-engenharia/venda-casada-empresa-corrupta_dB9nhmPNJxQttX55/) | sem data | 2026-09-18 | baixa |
| [37] | Benchmarks de SaaS para PMEs no Brasil (CAC, churn) | [Baita](https://baita.ac/tudo-sobre/benchmarks-saas) | 2026 | 2026-09-18 | baixa |
| [38] | Mercado de software de certificação elétrica no Reino Unido | [Electricians Forums](https://www.electriciansforums.net/threads/best-certification-software.212696/) | sem data | 2026-09-18 | baixa-média |
| [39] | Mesh: "mais de 2.200 alunos" (autodeclarado) | [LinkedIn Mesh Engenharia](https://br.linkedin.com/company/mesh-engenharia) | sem data | 2026-09-18 | baixa |
| [40] | Mesh vende treinamentos de ensaios em subestações | [Hotmart](https://hotmart.com/pt-br/marketplace/produtos/hagsxd-teste-presencial-9x5oi/M86715357M) | sem data | 2026-09-18 | média |
| [41] | Prestadores de cabine entregam laudo com plano de ação; mercado pulverizado | [INSP-THERM](https://insp-therm.com.br/manutencao-cabine-primaria-o-que-e-e-como-funciona/) | sem data | 2026-09-18 | baixa |
| [42] | "Laudo técnico final com plano de ação" | [Engehertz](https://engehertz.com.br/servicos/cabine-primaria/manutencao-preventiva-em-cabine-primaria/) | sem data | 2026-09-18 | baixa |
| [43] | Edital Unifesp: manutenção de cabine a cada 3 e 6 meses | [Unifesp](https://unifesp.br/campus/osa2/images/PDF/Infraestrutura/ANEXO%203.pdf) | sem data | 2026-09-18 | baixa |
| [44] | Mundo da Elétrica: 1 milhão+ de seguidores (autodeclarado) | [Mundo da Elétrica](https://www.mundodaeletrica.com.br/sobre/) | sem data | 2026-09-18 | baixa |
| [45] | Auvo sem preço de plano público (/precos e /planos dão 404) | [Auvo](https://www.auvo.com/) | sem data | 2026-09-18 | média |
| [46] | Buscas na Play ("cabine primária", "ensaios elétricos", "powerdb", "laudo spda") sem app brasileiro de laudo de MT | [Google Play (busca)](https://play.google.com/store/search?q=cabine%20prim%C3%A1ria&c=apps) | 2026-09 | 2026-09-18 | média |

## Mapa de validade

**Situação:** dois números de tamanho já estavam vencidos quando esta pesquisa foi feita; foram mantidos porque não há versão mais recente. As primeiras afirmações atuais a vencer são as de **concorrência e preço, em 01/12/2026**. Atualize a pesquisa (modo *Refresh*) antes dessa data, sobretudo para acompanhar a Mesh e o GroundPRO.

Prazos de validade por tipo de afirmação: regulatório 12 meses, tamanho de mercado 18, recurso/preço/adoção de concorrente 3, dor 24, GTM 12.

| Claim | Classe | Publicado | Rechecar em | Situação |
|---|---|---|---|---|
| Engenheiros eletricistas: 116.185 [13] | tamanho | 2021-11 | 2023-05 | **já vencido** |
| ~202 mil UCs do Grupo A [9] | tamanho | 2024-07 | 2026-01 | **já vencido** |
| Mesh Labs Mobile: escopo e recursos [20] | feature | 2026-09 | 2026-12 | ok |
| Mesh Labs Mobile: downloads e avaliações [20] | tração | 2026-09 | 2026-12 | ok |
| GroundPRO: planos e "Checklists Online" [23] | preço | 2026-09 | 2026-12 | ok |
| AltoQi Builder: preços [35] | preço | 2026-09 | 2026-12 | ok |
| Mitti/GoCanvas: preços [33][34] | preço | 2026-09 | 2026-12 | ok |
| NBR 5419:2026: periodicidade/continuidade [16] | regulatório | 2026 | 2027-01 | ok (não verificado) |
| Benchmarks CAC/churn [37] | GTM | 2026 | 2027-01 | ok (baixa confiança) |
| NBR 5419:2026: publicação e transição [14][15] | regulatório | 2026-05 | 2027-05 | ok |
| NR-10 nova [1] | regulatório | 2026-06 | 2027-06 | ok; rechecar na vigência (01/06/2027) |
| Padrão de falha de sync/fotos [27] | dor | 2026-08 | 2028-08 | ok |
| Empresas por CNAE [11] | tamanho | 2026-09 | 2028-03 | ok |
