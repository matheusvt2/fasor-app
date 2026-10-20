# NC chip phrases for review

**Status:** ~~pending review by Bruno, via Matheus~~ ~~(entry dated 2026-09-22). Seed version `v1`.~~ ~~*(2026-10-15)* for the Quadros elétricos draft at the end only (seed `v6`, Story 14.9) (entry dated 2026-10-15).~~ *(2026-10-20)* every phrase in this document is reviewed and accepted: the Quadros elétricos draft at the end (seed `v6`, Story 14.9) was accepted as it is by Bruno, via Matheus, on 2026-10-20 ("de acordo"), with the request that a phrase typed by hand become a chip of the company's next sheets (Story 14.12). Every phrase of seeds `v1` to `v5` (the equipment items, NO-BREAK DE COMANDO, the 19 Verificações do local items and the 51 CTA phrases) was reviewed and accepted as it is by Bruno, via Matheus, on 2026-10-15 ("de acordo").

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
| 16 | NO-BREAK DE COMANDO | `no_break_de_comando` | No-break inoperante · Bateria vencida ou estufada · Sem autonomia para o relé |

*(2026-10-13, Story 14.3: row 16 ships with seed `v4` only, in `packages/domain/src/seed/v4.ts`; seeds `v1` to `v3` keep the fifteen rows above. Its three phrases are the chips the approved mock draws on the item (`60-ficha.html`, item 16), pending Bruno's review like the rest. The NC phrases of the 19 "Verificações do local" items are in the same file and are listed for Bruno in the Story 14.3 pull request.)*

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

## Chave de transferência automática (library type, seed `v5`)

Block types: `chave_transferencia_automatica`.

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | Placa confere com o projeto | `placa_confere_com_o_projeto` | Placa divergente do projeto · Placa ilegível · Placa ausente |
| 2 | Invólucro, fixação e continuidade do aterramento do painel | `involucro_fixacao_e_continuidade_do_aterramento_do_painel` | Invólucro danificado · Fixação solta · Sem continuidade de aterramento |
| 3 | Tampas e barreiras fixadas, aviso de transferência manual presente | `tampas_e_barreiras_fixadas_aviso_de_transferencia_manual_presente` | Aviso ausente · Barreira solta · Tampa sem parafusos |
| 4 | Limpeza interna, aspirada, sem soprar | `limpeza_interna_aspirada_sem_soprar` | Acúmulo de poeira · Presença de umidade · Resíduos metálicos no interior |
| 5 | Contatos principais, de arco e auxiliares (posição) sem pites ou superaquecimento | `contatos_principais_de_arco_e_auxiliares_posicao_sem_pites_ou_superaquecimento` | Pites nos contatos · Sinais de superaquecimento · Contato auxiliar fora de posição |
| 6 | Isoladores e barramentos | `isoladores_e_barramentos` | Trinca no isolador · Barramento com sinais de aquecimento · Sujeira acumulada no isolador |
| 7 | Reaperto da potência ao torque da etiqueta | `reaperto_da_potencia_ao_torque_da_etiqueta` | Terminal de potência frouxo · Torque abaixo do indicado na etiqueta · Sinais de aquecimento no terminal |
| 8 | Reaperto da fiação de controle, chicote e fusíveis de comando | `reaperto_da_fiacao_de_controle_chicote_e_fusiveis_de_comando` | Borne de controle frouxo · Chicote mal encaixado · Fusível de comando queimado |
| 9 | Lubrificação somente conforme o fabricante, sem óleo | `lubrificacao_somente_conforme_o_fabricante_sem_oleo` | Lubrificação ressecada · Lubrificante inadequado · Presença de óleo no mecanismo |
| 10 | Operação manual com as fontes desenergizadas | `operacao_manual_com_as_fontes_desenergizadas` | Operação manual travada · Mecanismo com esforço excessivo · Manopla de operação ausente |
| 11 | Intertravamento mecânico e elétrico N/E | `intertravamento_mecanico_e_eletrico_n_e` | Intertravamento mecânico inoperante · Intertravamento elétrico inoperante · Intertravamento desajustado |
| 12 | Rotação de fases da Emergência igual à da Normal | `rotacao_de_fases_da_emergencia_igual_a_da_normal` | Rotação de fases invertida · Rotação de fases não verificada · Fases sem identificação |
| 13 | Indicação de posição, LEDs e alarmes; leituras de V, I e f conferem com instrumento | `indicacao_de_posicao_leds_e_alarmes_leituras_de_v_i_e_f_conferem_com_instrumento` | LED de posição inoperante · Alarme inoperante · Leitura divergente do instrumento |
| 14 | Registro de manobras e contador de transferências revisados | `registro_de_manobras_e_contador_de_transferencias_revisados` | Registro de manobras inacessível · Contador de transferências inoperante · Registro com falhas não tratadas |
| 15 | Partida do gerador comandada pela chave; exercitador programado | `partida_do_gerador_comandada_pela_chave_exercitador_programado` | Gerador não parte pelo comando da chave · Exercitador não programado · Sinal de partida interrompido |
| 16 | Aquecedor e ventilação, se houver | `aquecedor_e_ventilacao_se_houver` | Aquecedor inoperante · Ventilação inoperante · Termostato desajustado |
| 17 | Gerador deixado em AUTOMÁTICO ao final | `gerador_deixado_em_automatico_ao_final` | Gerador deixado em MANUAL · Gerador deixado em DESLIGADO · Chave seletora sem identificação |

*(2026-10-13, Story 14.5: this list ships with seed `v5` only, in `packages/domain/src/seed/v5.ts`; seeds `v1` to `v4` have no such block type. The 17 items are those of `sprint-change-proposal-2026-10-08.md` § 8.4, written in sentence case as the sheet shows them (the document prints them in caps). The three phrases of item 3 are the chips the approved mock draws on it (`63-ficha-cta.html`); the rest were authored after them and are pending Bruno's review like every other list here. A change after the merge ships as a later seed version.)*

## Quadros elétricos, QGBT/QD (draft for seed `v6`, Story 14.9)

Block types: `quadro_eletrico`.

*(2026-10-15, draft, authored for Bruno's review: the 17 items of the "Quadros Elétricos" sheet of the original form (`docs/context/FO.SERV-03 Relatórios-Complemento.xlsx`, git-ignored), labels verbatim. ~~The type is not seeded yet; the block type key and the item keys are proposed and settled in the Story 14.9 spec, and `scripts/nc-chip-phrases.test.ts` checks these rows once the type ships.~~ Item 17 is printed as a second "16" in the original (open question 1 of Story 14.9).)* *(2026-10-20, Story 14.9 as built: the list ships with seed `v6` only, in `packages/domain/src/seed/v6.ts`, item keys as proposed; `scripts/nc-chip-phrases.test.ts` checks these rows. Items 8 and 16 carry their hints on the sheet only.)* *(2026-10-20, Bruno, via Matheus: accepted as drafted, and the second 16 is numbered 17. A phrase typed by hand on an NC row becomes a chip of the company's next sheets with Story 14.12; it is not a seeded row of this table.)*

| # | Item | Key | NC phrases |
| --- | --- | --- | --- |
| 1 | LIMPEZA INTERNA E EXTERNA | `limpeza_interna_e_externa` | acúmulo de poeira e sujeira · presença de umidade · resíduos no interior do quadro |
| 2 | PINTURA, CORROSÃO DA CAIXA | `pintura_corrosao_da_caixa` | pontos de corrosão na caixa · pintura descascada · caixa amassada ou danificada |
| 3 | RESISTÊNCIA DE AQUECIMENTO | `resistencia_de_aquecimento` | resistência de aquecimento inoperante · termostato desajustado · resistência ausente |
| 4 | ILUMINAÇÃO INTERNA | `iluminacao_interna` | iluminação interna inoperante · lâmpada queimada · interruptor de porta danificado |
| 5 | LÂMPADAS DE SINALIZAÇÃO | `lampadas_de_sinalizacao` | lâmpada de sinalização queimada · sinalização incoerente com o estado do circuito · lente danificada ou ausente |
| 6 | RELÉS E CONTATORES | `reles_e_contatores` | relé ou contator inoperante · contatos com sinais de desgaste · ruído anormal no contator |
| 7 | FUSÍVEIS | `fusiveis` | fusível queimado · fusível com capacidade divergente · porta-fusível danificado |
| 8 | DISJUNTORES TERMOMAGNÉTICOS | `disjuntores_termomagneticos` | disjuntor não liga ou não desliga · disjuntor não atua no trip · sinais de aquecimento no disjuntor |
| 9 | ATERRAMENTO | `aterramento` | aterramento desconectado · cordoalha de aterramento danificada · oxidação na conexão de terra |
| 10 | INSTRUMENTOS DE MEDIÇÃO | `instrumentos_de_medicao` | instrumento inoperante · leitura divergente do instrumento de referência · visor do instrumento danificado |
| 11 | BARRAMENTOS | `barramentos` | sinais de aquecimento no barramento · oxidação no barramento · barramento sem proteção contra contato |
| 12 | ISOLADORES | `isoladores` | trinca no isolador · sujeira acumulada no isolador · sinais de descarga no isolador |
| 13 | FIAÇÃO INTERNA | `fiacao_interna` | isolação da fiação danificada · sinais de aquecimento na fiação · fiação sem fixação adequada |
| 14 | REAPERTO GERAL | `reaperto_geral` | conexão frouxa encontrada · sinais de aquecimento na conexão · terminal oxidado |
| 15 | PLACAS DE SINALIZAÇÃO | `placas_de_sinalizacao` | placa de sinalização ausente · placa ilegível · placa sem advertência de risco elétrico |
| 16 | ORGANIZAÇÃO INTERNA | `organizacao_interna` | cabos fora da canaleta · canaleta sem tampa · chicote desorganizado |
| 17 | IDENTIFICAÇÃO DE CIRCUITOS | `identificacao_de_circuitos` | circuitos sem identificação · identificação ilegível · identificação divergente do diagrama |
