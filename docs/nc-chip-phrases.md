# NC chip phrases for review

**Status:** pending review by Bruno, via Matheus (entry dated 2026-09-22). Seed version `v1`.

## What this is

When a checklist row of an equipment sheet is marked NC (não conforme), its observation field offers three or four item-specific chips above it (`EXPERIENCE.md`, Checklist row and Smart Input: NC observation). A tap inserts the chip's text into the observation. The phrases describe the typical non-conformity of each item. They are domain knowledge that the reference FO.SERV-03 report does not contain, so they were drafted for this review rather than transcribed (`epics.md`, Story 3.1; `source-deltas.md`: "Chips ship pre-seeded with standard phrases per item").

The phrases live in `packages/domain/src/seed/v1.ts`, one list per checklist item. The tables below list every one of them, separated by `·`. `scripts/nc-chip-phrases.test.ts` fails when a seeded phrase is missing from its row here, so the two cannot drift apart.

## How to review

- Check each phrase for wording a field engineer would actually write in an observation, and for a non-conformity that is missing or wrong.
- Mark changes directly in this document (strike the old phrase with `~~...~~` and write the new one beside it) and hand it back to Matheus.
- Timing matters: seed `v1` freezes when it merges. A change requested after the merge ships as seed `v2`; relatórios already created keep the `v1` phrases.
- The seed test checks only presence and count (three or four per item), never the wording, so the wording is this review's responsibility alone.

## Cabos (entrada, saída and alimentação)

Block types: `cabos_entrada`, `cabos_saida`.

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | LIMPEZA | `limpeza` | acúmulo de poeira e sujeira · presença de umidade · resíduos de óleo ou graxa |
| 2 | MUFLA | `mufla` | sinais de aquecimento na mufla · trinca ou fissura na mufla · sinais de descarga parcial (trilhamento) · mufla mal fixada |
| 3 | CONEXÕES | `conexoes` | conexão frouxa · oxidação nos terminais · sinais de aquecimento na conexão |
| 4 | ATERRAMENTO CORDOALHAS | `aterramento_cordoalhas` | cordoalha desconectada · cordoalha rompida ou danificada · oxidação na cordoalha |
| 5 | FIXAÇÃO | `fixacao` | cabo sem fixação adequada · abraçadeira solta ou ausente · cabo apoiado em estrutura metálica |

## Para-raio

Block types: `para_raio`.

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | LIMPEZA | `limpeza` | acúmulo de poeira e sujeira no corpo · presença de fuligem ou poluição · resíduos de umidade |
| 2 | ISOLADOR | `isolador` | trinca no isolador · lascamento no corpo polimérico · sinais de trilhamento elétrico |
| 3 | CONTADOR DE OPERAÇÃO | `contador_de_operacao` | contador danificado · contador ausente · visor do contador ilegível |
| 4 | ATERRAMENTO | `aterramento` | cabo de aterramento desconectado · oxidação na conexão de terra · cabo de terra danificado |
| 5 | CONEXÕES | `conexoes` | conector frouxo · oxidação nos conectores · sinais de aquecimento na conexão |

## Chave seccionadora

Block types: `chave_seccionadora`.

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | ABERTURA E FECHAMENTO MANUAL | `abertura_e_fechamento_manual` | esforço excessivo na manobra · manobra incompleta · travamento durante a manobra |
| 2 | ABERTURA E FECHAMENTO ELÉTRICO | `abertura_e_fechamento_eletrico` | não atua no comando elétrico · atuação intermitente · tempo de manobra elevado |
| 3 | MECANISMO DE ACIONAMENTO | `mecanismo_de_acionamento` | mecanismo com folga · falta de lubrificação no mecanismo · peças desgastadas no mecanismo |
| 4 | INTERTRAVAMENTO ELÉTRICO | `intertravamento_eletrico` | intertravamento elétrico inoperante · fim de curso desregulado · fiação do intertravamento danificada |
| 5 | INTERTRAVAMENTO MECÂNICO | `intertravamento_mecanico` | intertravamento mecânico inoperante · trava mecânica desajustada · peça do intertravamento danificada |
| 6 | ISOLADORES | `isoladores` | trinca no isolador · lascamento no isolador · sujeira acumulada no isolador |
| 7 | CONEXÕES | `conexoes` | conexão frouxa · oxidação nos terminais · sinais de aquecimento na conexão |
| 8 | CONTATOS | `contatos` | sinais de aquecimento · oxidação · desgaste |
| 9 | MOTOR | `motor` | motor inoperante · ruído anormal no motor · aquecimento excessivo do motor |
| 10 | FUSÍVEIS | `fusiveis` | fusível queimado · fusível com dimensionamento incorreto · base do fusível danificada |
| 11 | ATERRAMENTO | `aterramento` | aterramento desconectado · cordoalha de aterramento danificada · oxidação na conexão de terra |
| 12 | SIMULTANEIDADE | `simultaneidade` | fases sem simultaneidade na abertura · fases sem simultaneidade no fechamento · necessita ajuste das hastes |
| 13 | PINTURA, CORROSÃO | `pintura_corrosao` | pontos de corrosão · pintura descascada · corrosão avançada na estrutura |
| 14 | LIMPEZA E LUBRIFICAÇÃO | `limpeza_e_lubrificacao` | falta de lubrificação · graxa ressecada · acúmulo de sujeira |

## Disjuntor MT

Block types: `disjuntor_mt`.

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | LIMPEZA E LUBRIFICAÇÃO | `limpeza_e_lubrificacao` | falta de lubrificação · graxa ressecada · acúmulo de sujeira |
| 2 | ABERTURA E FECHAMENTO ELÉTRICO/REMOTO | `abertura_e_fechamento_eletrico_remoto` | não atua no comando remoto · não atua no comando elétrico local · atuação intermitente |
| 3 | ABERTURA E FECHAMENTO MECÂNICO | `abertura_e_fechamento_mecanico` | não atua no comando mecânico · esforço excessivo no comando mecânico · manobra incompleta |
| 4 | BOBINAS | `bobinas` | bobina de abertura inoperante · bobina de fechamento inoperante · bobina com sinais de aquecimento |
| 5 | CARREGAMENTO MANUAL DE MOLAS | `carregamento_manual_de_molas` | mola não carrega manualmente · manivela de carregamento danificada · indicação de mola carregada inoperante |
| 6 | INDICADOR DE POSIÇÃO | `indicador_de_posicao` | indicador de posição inoperante · indicação divergente do estado real · visor do indicador danificado |
| 7 | CÂMARA DE EXTINÇÃO | `camara_de_extincao` | sinais de desgaste na câmara · pressão de SF6 abaixo do nominal · sinais de vazamento na câmara |
| 8 | CONTATOS MÓVEL E FIXO | `contatos_movel_e_fixo` | sinais de aquecimento · oxidação · desgaste |
| 9 | ISOLADORES | `isoladores` | trinca no isolador · lascamento no isolador · sujeira acumulada no isolador |
| 10 | CABOS DE CONTROLE | `cabos_de_controle` | cabo de controle danificado · conexão frouxa no borne · falta de identificação dos cabos |
| 11 | LÂMPADAS DE SINALIZAÇÃO | `lampadas_de_sinalizacao` | lâmpada queimada · lâmpada ausente · sinalização divergente do estado real |
| 12 | CONTATOS AUXILIARES | `contatos_auxiliares` | contato auxiliar inoperante · contato auxiliar com mau contato · contato auxiliar desregulado |
| 13 | CONDIÇÃO GERAL DOS MECANISMOS | `condicao_geral_dos_mecanismos` | mecanismo com folga · peças desgastadas · falta de lubrificação no mecanismo |
| 14 | RELÉ DE ACIONAMENTO SECUNDÁRIO OU PRIM. | `rele_de_acionamento_secundario_ou_prim` | relé não atua · relé sem ajuste registrado · fiação do relé danificada |
| 15 | ÓLEO ISOLANTE/INDICADOR DE NÍVEL | `oleo_isolante_indicador_de_nivel` | nível de óleo abaixo do mínimo · vazamento de óleo · indicador de nível ilegível |

## TP, TC and Transformador de força (one shared list)

Block types: `tp`, `tc`, `transformador_forca`.

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | LIMPEZA | `limpeza` | acúmulo de poeira e sujeira · presença de umidade · resíduos de óleo |
| 2 | VÁLVULA DE ALÍVIO | `valvula_de_alivio` | válvula de alívio atuada · vazamento na válvula de alívio · válvula de alívio danificada |
| 3 | ELEMENTO SECANTE | `elemento_secante` | sílica gel saturada · recipiente do secante danificado · elemento secante ausente |
| 4 | JUNTAS, VEDAÇÕES E VAZAMENTOS | `juntas_vedacoes_e_vazamentos` | vazamento de óleo pela junta · junta ressecada · vedação danificada |
| 5 | INDICADOR NÍVEL DE ÓLEO | `indicador_nivel_de_oleo` | nível de óleo abaixo do mínimo · indicador de nível ilegível · indicador de nível danificado |
| 6 | VENTILADORES | `ventiladores` | ventilador inoperante · ruído anormal no ventilador · ventilador com acúmulo de sujeira |
| 7 | REGISTROS, RADIADORES | `registros_radiadores` | registro fechado · vazamento no radiador · radiador com amassados ou corrosão |
| 8 | RELÉ DE GÁS, FUNCIONAMENTO | `rele_de_gas_funcionamento` | relé de gás inoperante · presença de gás no visor do relé · fiação do relé danificada |
| 9 | CORROSÃO, PINTURA, VIBRAÇÕES | `corrosao_pintura_vibracoes` | pontos de corrosão · pintura descascada · vibração ou ruído anormal |
| 10 | ATERRAMENTO | `aterramento` | aterramento desconectado · cordoalha de aterramento danificada · oxidação na conexão de terra |
| 11 | BUCHAS PRIMÁRIA/SECUNDÁRIAS | `buchas_primaria_secundarias` | trinca na bucha · lascamento na bucha · sinais de aquecimento na bucha |
| 12 | TERMÔMETRO | `termometro` | termômetro inoperante · leitura incoerente com a temperatura ambiente · visor do termômetro danificado |
| 13 | ÓLEO ISOLANTE/INDICADOR DE NÍVEL | `oleo_isolante_indicador_de_nivel` | nível de óleo abaixo do mínimo · óleo com coloração escura · indicador de nível ilegível |
| 14 | CONEXÕES | `conexoes` | conexão frouxa · oxidação nos terminais · sinais de aquecimento na conexão |
| 15 | RELÉ DE TEMPERATURA EXTERNO | `rele_de_temperatura_externo` | relé de temperatura inoperante · ajuste de alarme ou desligamento ausente · sensor de temperatura danificado |
