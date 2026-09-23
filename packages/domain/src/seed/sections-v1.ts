import type { CoverDefinition, SectionEntry, TextBlock } from './schema.ts';

/*
 * Seed version 1 section boilerplate (FR-66, AR-20): the fixed text of FO.SERV-03's
 * sections 1-6 and 10 and the cover's `DADOS DO CLIENTE`, verbatim, keyed by
 * `(section, effective_from)`. What changes per job is a named variable resolved at
 * generation: `{empresa_executora}`, `{cliente}`, `{obra}`, `{escopo}`, `{datas}`,
 * `{responsavel}`. Plain text only (no formatting runs): the MVP editor is plain text.
 *
 * Frozen with the rest of v1 (see `v1.ts`).
 */

const h = (text: string): TextBlock => ({ kind: 'heading', text });
const p = (text: string): TextBlock => ({ kind: 'paragraph', text });
const i = (text: string): TextBlock => ({ kind: 'item', text });

/** The base date of every text this version seeds: in force since before any job. */
const BASE = '2000-01-01';

/** The date the revised NR-10 takes effect; its section 5 text is not seeded yet (FR-66). */
export const NR10_REVISION_DATE = '2027-06-01';

export const SECTION_TITLES_V1: Record<string, string> = {
  '1': 'OBJETIVO',
  '2': 'DEFINIÇÕES',
  '3': 'LIMITE DE ESCOPO',
  '4': 'REQUISITOS BÁSICOS PARA EXECUÇÃO DE MANUTENÇÃO PREVENTIVA EM CABINES PRIMÁRIAS',
  '5': 'RECOMENDAÇÕES GERAIS TÉCNICAS E DE SEGURANÇA',
  '6': 'VERIFICAÇÕES E ENSAIOS APLICÁVEIS',
  '7': 'REGISTRO FOTOGRÁFICO MANUTENÇÃO PREVENTIVA',
  '8': 'PONTOS DE ATENÇÃO / SUGESTÃO DE CORRETIVAS COMPLEMENTARES',
  '9': 'RELATÓRIOS DOS ENSAIOS',
  '10': 'CONCLUSÃO E OBSERVAÇÕES TÉCNICAS',
  '11': 'CERTIFICADOS',
};

const SECTION_1: TextBlock[] = [
  p(
    'O presente relatório tem por objetivo apresentar, de forma clara e objetiva, as atividades realizadas pela {empresa_executora}, referentes à manutenção preventiva e à execução de ensaios dielétricos nas Cabines Primárias de Proteção, Distribuição e Transformação de {obra} da {cliente}.',
  ),
  p(
    'O documento contempla o registro dos serviços executados, dos ensaios e das verificações realizados durante a intervenção, visando documentar as condições operacionais dos equipamentos e atividades realizadas.',
  ),
];

const SECTION_2: TextBlock[] = [
  p(
    'A manutenção caracteriza-se como todo serviço de controle, conservação e restauração de um equipamento ou instalação, com o principal objetivo de mantê-lo em condições ótimas de uso e prevenir anomalias que possam torná-los indisponíveis.',
  ),
  p(
    'Manutenção Preventiva é um procedimento programado que tem como objetivo manter um equipamento ou instalação em condições satisfatórias de uso, protegendo-os contra ocorrências que possam aumentar sua indisponibilidade.',
  ),
  p(
    'Resistência Ôhmica dos Contatos: Medir a resistência de contato das fases com o objetivo de visualizar as condições do seu fechamento nos polos.',
  ),
  p(
    'Relação de Transformação: Determinar a relação de transformação comparando-a com a obtida no cálculo teórico/valores de placa e ensaios de campo.',
  ),
  p(
    'Resistência de Isolação: Medir e verificar a resistência de isolação dos principais equipamentos como transformadores, disjuntores, seccionadoras, cabos e isoladores com o intuito de verificar a qualidade e a vida útil da isolação.',
  ),
  p(
    'Resistência Ôhmica de Aterramento: Medir os valores de resistência de aterramento para verificar se demonstram valores dentro da margem de tolerância exigida pela norma NBR 5419.',
  ),
  p(
    'Obs: Em todas as manutenções deve ser elaborado relatório técnico contendo os resultados dos ensaios e análises dos equipamentos e instalações, com o objetivo de comparar os resultados de relatórios anteriores, detectando possíveis falhas eminentes.',
  ),
  p('Conforme determinação da NR-10, este relatório deve fazer parte do prontuário da instalação (PIE).'),
];

const SECTION_3: TextBlock[] = [
  p(
    'Os serviços executados limitam-se à execução de ensaios elétricos e inspeções técnicas nos equipamentos integrantes do sistema de Média Tensão, incluindo o relé de proteção.',
  ),
  p('Exclusões:'),
  i('Quadros elétricos terminais, localizados nos respectivos setores;'),
  i('Painéis e transformadores de rede estabilizada (nobreak);'),
  i('Geradores e seus periféricos.'),
];

const SECTION_4: TextBlock[] = [
  h('Documentação'),
  i('ART preenchida e recolhida por profissional legalmente habilitado;'),
  i('Manual de fabricantes dos equipamentos constantes na SE;'),
  i('Folha de registro do relatório da manutenção anterior;'),
  i('Formulário para registro dos ensaios e verificações dos equipamentos (conforme Anexo deste documento);'),
  i('Procedimento de trabalho padronizado conforme NR-10.'),
  h('EPC’s'),
  i('Fita de sinalização padronizada;'),
  i('Placa de sinalização ou bandeirola;'),
  i('Sistema de bloqueio padronizado;'),
  i('Detector de tensão;'),
  i('Conjunto de Aterramento Temporário;'),
  i('Bastão isolante para fixação do aterramento temporário;'),
  i('Cones de sinalização.'),
  h('EPI’s'),
  i('Calçado de segurança para trabalho com eletricidade;'),
  i('Luva de borracha com classe de tensão apropriada;'),
  i('Óculos de segurança;'),
  i('Luva de Vaqueta;'),
  i('Capacete para trabalhos em eletricidade;'),
  i('Cinto de segurança (caso haja trabalho acima de dois metros);'),
  i('Uniforme adequado.'),
  h('Equipamentos de Ensaio'),
  i('Megôhmetro;'),
  i('Microhmímetro;'),
  i('Medidor de relação de espiras TTR'),
  i('Alicate Amperímetro;'),
  i('Fasímetro;'),
  i('Mala de Calibração de Relés.'),
  h('Ferramentas e Materiais'),
  i('Gerador, extensões e iluminação;'),
  i('Materiais de limpeza: solventes, pano para limpeza, sacos para recolhimento de lixo, etc;'),
  i('Mala de ferramentas completa;'),
  i('Escada isolada para eletricista.'),
];

const SECTION_5: TextBlock[] = [
  i(
    'Para execução de trabalhos de manutenção em subestações os profissionais envolvidos devem ser qualificados e autorizados para a tarefa, bem como dispor dos equipamentos de proteção coletiva (EPC) e equipamentos de proteção individual (EPI) necessários.',
  ),
  i(
    'É vedado o uso de adornos pessoais nos trabalhos com instalações elétricas ou em suas proximidades como relógios, anéis, pulseiras etc.',
  ),
  i(
    'Para a realização da manutenção, a subestação deve estar desobstruída de peças, ferramentas, materiais e equipamentos alheios ao serviço, devendo também ser verificado os seguintes itens: disponibilidade dos EPI’s e EPC’s; portas de emergência e de acesso devem estar livres, os extintores de incêndio devem estar carregados e dentro do período de validade.',
  ),
  i(
    'Para realização de quaisquer trabalhos de manutenção em subestações de energia, recomenda-se que ela seja totalmente desenergizada.',
  ),
  i('Conforme NR-10, capítulo 5.1, item 10.5.1:'),
  p(
    '“Somente serão consideradas desenergizadas as instalações elétricas liberadas para trabalho, mediante os procedimentos apropriados, obedecida a sequência abaixo:',
  ),
  i('a-) Seccionamento;'),
  i('b-) Impedimento de reenergização;'),
  i('c-) Constatação da ausência de tensão;'),
  i('d-) Instalação de aterramento temporário, com equipotencialização dos condutores do circuito;'),
  i('e-) Proteção dos elementos energizados existentes na zona controlada;'),
  i('f-) Instalação da sinalização de impedimento de reenergização”'),
  p(
    'Após recebimento da conclusão da manobra de desligamento pelo operador da SE (conforme procedimentos acima), o responsável pela manutenção deve conferir tal situação com todos os colaboradores envolvidos, verificando se realmente os equipamentos estão isolados, sinalizados e bloqueados elétrica e mecanicamente antes do início das atividades.',
  ),
  p(
    'Antes da execução dos trabalhos de manutenção é necessário a criação de um planejamento pelo responsável da obra, definindo um plano ou roteiro das diversas etapas, para se ter esclarecimento do que fazer, porque fazer, como fazer, quando fazer e quem fazer.',
  ),
  p(
    'O estado da instalação desenergizada deve ser mantido até autorização de nova energização, respeitando-se os seguintes itens antes de fazê-lo:',
  ),
  i('Se todos os pontos desconectados foram conectados;'),
  i('Retirada do aterramento temporário;'),
  i('Retirada de ferramentas;'),
  i('Retirada de instrumentos de ensaios;'),
  i('Limpeza geral foi feita;'),
  i('Retirada de materiais e de peças;'),
  i('Grades de proteções e tampas dos painéis/cubículos foram devidamente fixadas;'),
  i('Retirada das pessoas não envolvidas no religamento;'),
  i('Manobra de religamento feita de forma inversa ao desligamento (itens “a” à “f”).'),
];

const SECTION_6: TextBlock[] = [
  h('Cabos de Alimentação'),
  i(
    'Inspecionar os cabos quanto a indícios de aquecimento, derretimento, condições de isolação e condição das terminações (muflas);',
  ),
  i('Ensaio de isolação.'),
  h('Para-Raios'),
  i('Limpeza do corpo do para-raios;'),
  i('Verificar condições dos isoladores, se não existem trincas ou rachaduras;'),
  i('Reaperto dos conectores de fase e terra;'),
  i('Ensaio de isolação.'),
  h('Chaves Seccionadoras'),
  i('Verificar simultaneidade da abertura e do fechamento das fases;'),
  i('Verificar o estado dos contatos fixos e móveis, que devem ser limpos, reapertados e lubrificados;'),
  i('Reaperto, limpeza e lubrificação das articulações, punhos de manobra, varão e partes rotativas;'),
  i('Verificar condições dos isoladores, se não existem trincas ou rachaduras;'),
  i('Verificar funcionamento de chaves de fim de curso (se houver);'),
  i('Ensaio de isolação;'),
  i('Ensaio de resistência de contato.'),
  h('Transformador de Potencial e Transformador de Corrente'),
  i('Limpeza, reaperto das conexões e fixações do equipamento à sua base;'),
  i('Verificação dos fusíveis de proteção e bases dos transformadores de potencial;'),
  i('Ensaio de isolação.'),
  h('Disjuntor de MT'),
  i('Limpeza geral e reaperto das conexões de potência e comando;'),
  i(
    'Verificar estado geral de isoladores, molas, motor, travas, engrenagens, bobinas, indicador de posição, contador de operações, bloco de terminais e estado da fiação. Deverão ser limpos, reapertados e lubrificados (se for o caso);',
  ),
  i('Ensaiar abertura e fechamento mecânico, elétrico, local e remoto do disjuntor;'),
  i('Ensaio de isolação;'),
  i('Ensaio de resistência de contato.'),
  h('Relé de Proteção'),
  i('Limpeza e reaperto de todas as conexões;'),
  i('Conferir, comparar via ensaios (corrente e tensão) e anotar os valores de parametrização encontrados;'),
  i('Testar as funcionalidades da IHM.'),
  h('Transformador de Força (à seco)'),
  i('Limpeza geral;'),
  i('Verificar se não existem trincas nos isoladores (buchas primárias);'),
  i('Inspecionar se os cabos ou barras estão firmemente conectados aos terminais do transformador;'),
  i('Ensaio de isolação;'),
  i('Ensaio de relação de transformação;'),
  i('Ensaio no sistema de monitoramento de temperatura dos enrolamentos.'),
  h('Cubículos, QGBT’s e Quadros de Distribuição'),
  i('Limpeza geral;'),
  i('Reaperto de todas as conexões mecânicas e elétricas;'),
  i('Verificar estado dos isoladores quanto à trinca ou rachaduras;'),
  i(
    'Verificar estado dos barramentos (indícios de aquecimento, corrosão, trinca e rachaduras, desgaste da pintura, conexão com os isoladores, distâncias para laterais e portas de painel);',
  ),
  i('Verificar cabos internos e de saída quanto a indícios de aquecimento, derretimento e isolação.'),
];

const SECTION_10: TextBlock[] = [
  i(
    'Foram realizados os ensaios elétricos e mecânicos (acionamentos) nos equipamentos pertinentes às Subestações de Proteção (Primária), Distribuição e de Transformação;',
  ),
  i(
    'Todos os resultados dos testes aplicados nos equipamentos das subestações e as observações e particularidades pertinentes a cada equipamento objeto desta manutenção preventiva encontram-se nos itens 8 e 9 deste relatório;',
  ),
  i(
    'Apesar dos resultados dos testes serem positivos para a continuidade de operação das SE’s, sugerimos que as observações dos relatórios e dos pontos críticos constantes nos itens 8 e 9 deste sejam atendidas.',
  ),
];

export const SECTIONS_V1: SectionEntry[] = [
  { section: 1, effective_from: BASE, blocks: SECTION_1 },
  { section: 2, effective_from: BASE, blocks: SECTION_2 },
  { section: 3, effective_from: BASE, blocks: SECTION_3 },
  { section: 4, effective_from: BASE, blocks: SECTION_4 },
  { section: 5, effective_from: BASE, blocks: SECTION_5 },
  // The slot exists and stays empty until the revised NR-10 text is seeded (a later version).
  { section: 5, effective_from: NR10_REVISION_DATE, blocks: null },
  { section: 6, effective_from: BASE, blocks: SECTION_6 },
  { section: 10, effective_from: BASE, blocks: SECTION_10 },
];

export const COVER_V1: CoverDefinition = {
  title: 'DADOS DO CLIENTE',
  rows: [
    { label: 'Cliente', value: '{cliente}' },
    { label: 'Cidade/local', value: '{obra}' },
    { label: 'Data da execução do serviço', value: '{datas}' },
    { label: 'Informações adicionais', value: '{escopo}' },
    { label: 'Responsável', value: '{responsavel}' },
  ],
};
