/*
 * AD-13 contract skew. Families and routes are append-only, so the push route
 * accepts every client's ops. A pull compares the header with `MIN_CONTRACT_VERSION`
 * and answers `426 contract_outdated` to an outdated client, which keeps pushing,
 * stops pulling and shows the "Atualizar" state.
 *
 * One exception on the push (2026-09-29, E10-Q6): a client older than
 * `MARK_AWARE_CONTRACT_VERSION` (or one sending no header) does not stamp what it saw, so
 * its plain edit would settle a contradiction it never saw. A push of such a client that
 * writes a `sheet/*` put on a cell holding `conflict`, or a `block/{id}/removed_at` write on
 * a block holding `removal_conflict`, is answered `426 contract_outdated` whole, with
 * nothing applied; its other pushes are accepted as before.
 */

/**
 * The version this bundle speaks; sent on every sync request.
 *
 * 2 (2026-09-22, Epic 1 retro A2): the `user` row carries `council`, `registration_number`
 * and `title` instead of `professional_registration`, the server-only `user/{id}` create
 * family is new, and the per-op reject code `op_forbidden` is new.
 *
 * 3 (2026-09-25, E12-Q4): the server-only `template/{id}/seed_version` put family is new
 * (the seed moves an unedited standard template to the current seed version).
 *
 * 4 (2026-09-25, Story 6.6): the `point` row carries `action`, `priority`, `deadline` and
 * `owner`, so the `point/{id}/{action|priority|deadline|owner}` put families are new.
 *
 * 5 (2026-09-26, Story 8.1): the `suggestion` row carries an optional `hint`
 * (`{create_registry_entry: {kind: 'manufacturer', name}}` or null); a device's photo
 * `file/{id}` create may carry `reading_kind`, `reading_target` and `reading_status:
 * 'queued'`; and the push route refuses a client photo create whose `reading_status` is
 * neither `none` nor `queued`, or `queued` without a `reading_kind` (`op_invalid`).
 *
 * 6 (2026-09-27, Stories 7.4/7.5): the relatório setup carries `parecer`, so the
 * `relatorio/setup/parecer` put family is new, and the `generation_job` row carries
 * `started_at`, so the server-only `generation_job/{id}/started_at` put is new.
 *
 * 7 (2026-09-28, Story 9.2): `reading_kind` and `reading_target` are client file fields, so
 * the `file/{id}/reading_kind` and `file/{id}/reading_target` put families are new; a
 * `reading_kind` put on a photo also sets its `reading_status` to `queued` (`applyOp`), and
 * the push route sends the reading when the photo's bytes are already stored.
 *
 * 8 (2026-09-28, Story 9.3): the photo row carries `people_in_photo` ("Pessoas na foto", a
 * photo never sent to the prose provider), so the `file/{id}/people_in_photo` put family is new.
 *
 * 9 (2026-09-29, E9-Q2/Q3): a client `file/{id}/reading_kind` put is narrowed to `plate` (on a
 * photo whose stored kind is `panel`, the Story 9.2 re-target) or null (its undo), and a
 * `file/{id}/reading_target` put to an object or null; the push route answers anything else
 * `op_invalid`. A `reading_kind` put queues only a kind that differs from the stored one, and a
 * null one sets `reading_status: none` (`applyOp`, `readingKindPutStatus`). The undo of a
 * re-target puts both null and a settled panel suggestion `discarded` (`invertBatch`). No new
 * family, but the reducer changed: `MIN_CONTRACT_VERSION` goes to 9 too.
 *
 * 10 (2026-09-29, Story 10.1): the fold merges a concurrent `sheet/*` put by rule
 * (`merge/policy.ts`): a put whose `prev_op_id` is not the cell's head op no longer simply
 * replaces the cell (NC stands over C, a filled cell over an empty one, the NC device's
 * observation over the other), and a sheet cell may carry an optional `merge` record
 * (`cellMergeSchema`). No new family, but the reducer and the cell shape changed:
 * `MIN_CONTRACT_VERSION` goes to 10 too.
 *
 * 11 (2026-09-29, Story 10.4): the company pull summary's relatório entries carry an optional
 * `progress: {sheets, photos}` (the server's live blocks and photo files of each), for the
 * "Baixando… 12 de 30 fichas" line. Additive on a non-strict object: a version-10 bundle
 * ignores it and reads "Baixando…" alone, so `MIN_CONTRACT_VERSION` stays 10.
 *
 * 12 (2026-09-29, Stories 10.2 and 10.3): the fold marks a true contradiction on the cell
 * (`cell.conflict`, the displaced side) and a block removed on one device and edited on the
 * other (`block.removal_conflict`, plus `block.removed_by`, the actor of the latest
 * `removed_at` write). A device stamps what it saw on its ops, `meta.standing_op_id` on a
 * `sheet/*` put (with `meta.seen_conflict_op_id`, the `conflict` it saw: a sequential put
 * keeps a `conflict` it did not see) and `meta.seen_modified_at` on a `block/{id}/removed_at`
 * write, and the fold reads them. The session information gains the `block_added` rule (a
 * `MergeInfo` whose `over_op_id` is null). No new family, but the reducer and two row shapes
 * changed: `MIN_CONTRACT_VERSION` goes to 12 too.
 *
 * 13 (2026-09-29, E10-Q2): the undo of a resolution brings the decision back. An op may
 * carry `meta.restore` (the marks its original cleared: `{conflict, shown_op_id}` on a
 * `sheet/*` put, `{removed_by, removal_conflict}` on a `block/{id}/removed_at` write), which
 * a sequential fold writes back, and a sheet cell may carry an optional `shown_op_id` (the
 * op whose value it shows when that is not its head). No new family, but the reducer and
 * the cell shape changed: `MIN_CONTRACT_VERSION` goes to 13 too.
 *
 * 14 (2026-09-30, ledger 1131, batch C): a gallery import batch creates its photos with no
 * reading and, once the batch is answered or closed, asks for the caption reading of each
 * photo left with no sheet, caption or "Pessoas na foto" mark with a client
 * `file/{id}/reading_kind = 'caption'` put. The push route accepts that put only on a photo
 * with no reading and no context (`clientReadingKindPutAllowed`); a version-13 server refuses
 * it (`op_invalid`), so a version-14 client must not talk to one. No new family and no row
 * shape change; `MIN_CONTRACT_VERSION` stays 13.
 *
 * 15 (2026-10-07, Story 13.8): the emission audit. The server-only `audit_run/{id}` create and
 * `audit_run/{id}/{field}` put families are new (the `audit_run` row: status, findings,
 * prompt version, timestamps), and so are the route `POST /api/relatorios/{id}/audit` and the
 * error code `audit_running`.
 *
 * 16 (2026-10-09, PR #121 review): the conclusion text merge. A `sheet/{id}/conclusion/text`
 * put may carry `meta.composed = true` (the text the app composed and confirms with
 * `text_status = confirmed`: "Concluir ficha", "Confirmar", "Substituir"); the fold makes a
 * concurrent flagged put over a standing `text_status = edited` a contradiction
 * (`cell.conflict`) instead of `latest_text`, a concurrent `text_basis` put follows the text
 * (sequential) unless the status is in contradiction, and the Conflict view resolves the
 * text, its status and its basis as one unit (three puts). The focused review refined it
 * before release (c16-1/2/3): the unit row is built from an edited and a composed writer
 * side, a composed put over a text already in contradiction keeps that `conflict`, and the
 * undo of "Aplicar" on the text also restores its cleared `merge` record (`meta.restore`).
 * No new family, but the reducer changed: `MIN_CONTRACT_VERSION` goes to 16 too; 2026-10-09,
 * Matheus.
 *
 * 17 (2026-10-13, Story 14.2): Local › Painel › Coluna. The location row's `kind` gains
 * `painel` (a child of a cabine that only groups colunas: no data, no block), the cabine row
 * gains the optional `funcao` (a reserved key of `FUNCAO_KEYS` or a typed name; absent and
 * null both mean none), and the `location/{id}/funcao` put family is new. The template
 * skeleton gains the same `painel` node and cabine `funcao`. The fold refuses what a kind
 * never holds with `LocationKindError` (a block placed on a painel, `se`, `env`,
 * `agrupar_por_tipo` or `funcao` on a painel, `funcao` on a coluna), which the push route
 * answers `op_invalid`. A row written before 17 parses to the same bytes and nothing an
 * existing log can contain starts to throw. `MIN_CONTRACT_VERSION` goes to 17 too.
 *
 * 18 (2026-10-13, Story 14.3): Verificações do local. The put family
 * `location/{id}/checklist/{item_key}/{result|observation}` is new (`item_key` one of the
 * closed `SITE_ITEM_KEYS`): a cell on the cabine row's optional `checklist`, folded through
 * `mergeCell` with the sheet checklist's rules and stamped like a sheet put. The photo row and
 * the point row gain the optional `location_id` (`file/{id}/location_id`,
 * `point/{id}/location_id`; absent and null both mean none). Seed v4 ships (the site item list
 * and the Disjuntor MT item `no_break_de_comando`, a new `ITEM_KEYS` value) and is the version
 * of a new template. The fold refuses a site put on a painel or a coluna (`LocationKindError`)
 * and one whose item the relatório's seed version does not offer (`SeedPathError`); both are
 * answered `op_invalid`. A site put whose `item_key` is outside `SITE_ITEM_KEYS`, or whose
 * field is neither `result` nor `observation`, never reaches the fold: the path does not
 * parse (`parsePath`) and the push route answers `op_path_unknown`. A row written before 18
 * parses to the same bytes and nothing an existing log can contain starts to throw.
 * `MIN_CONTRACT_VERSION` goes to 18 too.
 *
 * 19 (2026-10-13, Story 14.5): the measurement table and the first library type. The put
 * family `sheet/{block_id}/test/{test_key}/value/{value_key}` is new: a cell stored at
 * `sheet.test[test_key].values[value_key]` (the optional `values` map of a test entry), folded
 * through `mergeCell` and stamped like every `sheet/*` put. `sheet/test/cell` now also
 * addresses a measurement test (`row` the index in the test's rows, `col` in its columns), and
 * a choice is stored as `{raw: optionKey, unit: null, state: 'measured'}`. The block type
 * `chave_transferencia_automatica` is a new `EQUIPMENT_BLOCK_TYPES` value, with six new
 * `SUB_BLOCK_KEYS` (its tests, `cta_*`) and 17 new `ITEM_KEYS`; `BlockConfig` gains the
 * optional `options` (the block's own configuration, written whole with `block/{id}/config`).
 * Seed v5 ships (v4 plus that one type) and is the version of a new template. The fold
 * refuses a block create of that type on a seed version that does not ship it, a table cell
 * outside the test's geometry or on a fixed cell, a value key the test does not declare, and
 * an instrument or a criterion override a measurement test does not hold (`SeedPathError`,
 * answered `op_invalid`). A row written before 19 parses to the same bytes and nothing an
 * existing log can contain starts to throw. `MIN_CONTRACT_VERSION` goes to 19 too.
 *
 * 20 (2026-10-15, Story 14.10 lane B): the emission audit's coverage. The server-only put
 * `audit_run/{id}/coverage` is new (`AUDIT_RUN_FIELDS` gains `coverage`): `{sent, total}`, the
 * sheets the run sent the model of the ones the layout prints, written in the done batch. The
 * `audit_run` row gains the optional `coverage` (null on a run not finished and on every run
 * written before 20, which parses to it). A client push of that path is refused as server-only
 * like every other `audit_run` field. `MIN_CONTRACT_VERSION` goes to 20 too.
 *
 * 21 (2026-10-20, Stories 14.9 and 14.11, one batch): seed v6. The block type `quadro_eletrico`
 * (the Quadro elétrico, QGBT/QD) is a new `EQUIPMENT_BLOCK_TYPES` value, with 13 new
 * `ITEM_KEYS`; seed v6 ships (v5 plus that type, ÓLEO in TIPO DE ISOLAÇÃO on Transformador de
 * força, TP and TC, VÁCUO, ÓLEO (PVO) and ÓLEO (GVO) in the Disjuntor MT's MEIO DE EXTINÇÃO,
 * and the oil rule on those four types) and is the version of a new template. No path family
 * is new: the oil rule's NA marks are derived, never written, and a crossing between oil and
 * non-oil writes existing puts (`sheet/.../checklist/...`, `sheet/.../nameplate/...`,
 * `file/{id}/item_key`). A version-20 bundle cannot parse a block create of the new type (its
 * `equipmentBlockTypeSchema` refuses it, so the whole pulled page fails, `invalid_response`) nor
 * resolve seed v6, which a template the server moved to v6 and every relatório created on it
 * carry; and its fold would count and print a v6 non-oil unit's oil items as unanswered where a
 * version-21 fold reads them NA. The fold refuses a block create of the new type on a seed
 * version that does not ship it (`SeedPathError`, answered `op_invalid`). A row written before 21
 * parses to the same bytes and nothing an existing log can contain starts to throw.
 * `MIN_CONTRACT_VERSION` goes to 21 too.
 *
 * 22 (2026-10-21, Story 14.14): seed v7. v6 plus the Disjuntor MT's MEIO DE EXTINÇÃO as "Ar",
 * "Gás SF6", "Vácuo", "Óleo", "Outro" (with the v6 spellings as aliases), its oil rule naming
 * "Óleo" as oil and "Outro" as a value that shows the oil items in full, the help text of the
 * Quadro elétrico's "Circuito SELV/PELV", the SELV voltage ceiling and the band test voltages;
 * it is the version of a new template. No path family, row field nor enum value is new: the
 * notices are derived, never written. A version-21 bundle cannot resolve seed v7, which a
 * template the server moved to v7 and every relatório created on it carry, and its fold would
 * count and print an "Outro" disjuntor's oil item as derived NA where a version-22 fold shows it
 * unanswered. A row written before 22 parses to the same bytes. `MIN_CONTRACT_VERSION` goes to
 * 22 too.
  *
 * 23 (2026-10-21, Story 14.12): the company's learned options. The registry kind `nc_phrase` is
 * new (`registryKindSchema` gains it): `registry/nc_phrase/{id}` `{block_type, item_key, name}`,
 * an NC phrase the server learns from an observation typed on a sheet, created only by the
 * server (`system:registry`, after a client push, in its transaction); a client create of the
 * kind is refused `op_server_only`, a client `name` or `removed_at` put is accepted (the office's
 * Cadastros › Frases de NC), and `block_type` and `item_key` are immutable (`op_path_unknown`).
 * The server also creates a `registry/manufacturer/{id}` row for a FABRICANTE typed with no
 * matching row. No path family is new. A version-22 (or older) bundle cannot parse a
 * `registry/nc_phrase/...` op (its `registryKindSchema` refuses the kind, so the whole pulled page
 * fails, `invalid_response`), and the company stream carries one as soon as anyone types an NC
 * observation. `MIN_CONTRACT_VERSION` goes to 23 too.
 *
 * 24 (2026-10-22, UX pass F43, Matheus's decision SEED_V8_VARIABLES): seed v8. v7 plus a
 * Conclusão (section 10) text naming the sections that hold the results by the new section
 * variable `{itens_resultados}` (`SECTION_VARIABLES` gains it), which resolves to "nos itens 4 e
 * 5" by the Sumário positions of sections 8 and 9 ("no item 5" with one, "no corpo" with
 * neither); it is the version of a new template. No path family, row field nor enum value is
 * new. A version-23 bundle cannot resolve seed v8, which a template the server moved to v8 and
 * every relatório created on it carry, and it would print the variables as unknown tokens. A row
 * written before 24 parses to the same bytes. `MIN_CONTRACT_VERSION` goes to 24 too.
 *
 * 25 (2026-10-22, Stories 15.3 and 15.6, Bruno's "Melhorias produto"): seed v9. v8 with the
 * shared transformer checklist asking about the oil level once (item `indicador_nivel_de_oleo`
 * dropped, so the dry subtypes and the oil rule name seven items), the TC without POTÊNCIA
 * NOMINAL, two site items appended to Ambiente (`SITE_ITEM_KEYS` gains
 * `grades_e_portas_estado_e_fixacao` and `pintura_e_corrosao`, so the path family
 * `location/{id}/checklist/{item_key}/...` accepts them), and the optional table field
 * `ratio_factor: 'sqrt3'` on the transformador de força's ratio table (VAL CALCULADO is
 * U1 · √3 / U2). It is the version of a new template. A version-24 bundle cannot parse a
 * `location/{id}/checklist/pintura_e_corrosao/...` op (its `siteItemKeySchema` refuses the key,
 * so its `opSchema` fails the whole pulled page) nor resolve seed v9. A row written before 25
 * parses to the same bytes. `MIN_CONTRACT_VERSION` goes to 25 too.
 *
 * 26 (2026-10-26, Story 16.4, Bruno's WhatsApp of 2026-10-23): the AD-11 number value gains a
 * fourth state, `not_applicable`, stored `{ raw: '', unit: null, state: 'not_applicable' }`, typed
 * "N.A" (or "NA", "N/A", "N.A.") in a nameplate or cabine number field and shown and printed
 * "N.A" with no unit (`NOT_APPLICABLE_TEXT`). No path family, row field nor seed is new: the
 * value travels on the existing `sheet/{id}/nameplate/{key}` and `location/{id}/se|env/{field}`
 * puts. A version-25 bundle's `numberValueSchema` refuses the state, so a pulled cabine row or op
 * holding it fails its parse, and its readers would print "-" or a blank where the server prints
 * "N.A". The OCR contract keeps its own three-state shape, so the exported JSON Schema is
 * unchanged. A row written before 26 parses to the same bytes. `MIN_CONTRACT_VERSION` goes to 26
 * too.
 *
 * 27 (2026-10-28, Stories 15.7 and 17.6, Epic 17 wave B): seed v10, v9 with the TC's own
 * seven-item checklist (Bruno's list; `epoxi` and `a_seco` mark only VASAMENTO NA and the oil
 * rule names it alone), so `ITEM_KEYS` gains `limpeza_pintura_e_corrosao`, `vasamento`,
 * `fiacao_secundaria` and `buchas`; and `site_altitude_na` on the relatório setup (Story 17.6:
 * "Altitude do site" marked N/A, winning over `site_altitude_m` in every reader). It is the
 * version of a new template. A version-26 bundle cannot resolve seed v10, parse a
 * `relatorio/setup/site_altitude_na` op (outside its `RELATORIO_SETUP_KEYS`), nor a `file` or
 * `point` row naming a new item key (its `itemKeySchema` refuses it). No op kind nor path family
 * is new. A row written before 27 parses to the same bytes (`site_altitude_na` defaults to
 * false). `MIN_CONTRACT_VERSION` goes to 27 too.
 *
 * 28 (2026-10-29, fix batch fxrm, Matheus's decision on the production pass): the path family
 * `relatorio/removed_at`, put (an ISO instant, or null to restore) and remove, the only op
 * path that writes a relatório's tombstone (`relatorio/{id}` is create-only). The server's
 * one-shot cleanup (`apps/api/src/db/tombstone-cli.ts`, actor `system:cleanup`) writes it to
 * remove the 2026-10-15 test data, and a device that follows the relatório learns the removal
 * through it alone (AD-13). A version-27 bundle cannot parse the op (its `opPathSchema` refuses
 * the family, so its `opSchema` fails the whole pulled page). No row field, seed nor enum value
 * is new: a row written before 28 parses to the same bytes. `MIN_CONTRACT_VERSION` goes to 28
 * too.
 *
 * 29 (2026-11-03, Stories 20.7 to 20.10, the security pass of the same day): the server enforces
 * the business rules of every client op (AD-22, AD-24, AD-11 amended). Four per-op refusal codes
 * are new and appended to `opRejectCodeSchema`: `op_status_transition` (a status move AD-22's
 * table does not allow from the server's status, or a relatório create not born Rascunho),
 * `op_attribution` (a value naming another actor, or an instant past the server's clock or
 * before the relatório's creation, beyond `CLOCK_SKEW_MS`), `op_value_invalid` (a value outside
 * its field's type, cap or range, or a responsible user who is no user of the company) and
 * `op_target_missing` (a put on a row that does not exist in the relatório or obra it names);
 * `op_forbidden` also refuses the removal of an Emitido relatório. Each refuses its op alone:
 * the rest of the client batch applies. Two error codes are reserved for batch e20e:
 * `quota_exceeded` (Story 20.12) and `forbidden_origin` (Story 20.13). The push body is capped
 * at `SYNC_PUSH_MAX_BYTES` (4 MiB, `413 body_too_large`), and a device splits its pushes under
 * it. No path family, row field, seed nor enum value of a row is new: a row written before 29
 * parses to the same bytes, and no cap reaches a row schema or `applyOp`, so every stored row
 * and pulled op still parses. A version-28 bundle cannot parse a push answer that carries a new
 * code (its `syncPushResponseSchema` refuses the code, so the whole answer fails and the push is
 * retried forever), so `MIN_CONTRACT_VERSION` goes to 29 too.
 *
 * 30 (2026-11-05, Stories 21.1 and 21.2, Bruno's WhatsApp of the same day): seed v11, v10 with the
 * transformador de força's LIGAÇÃO SECUNDÁRIA as a select of the 47 vector groups
 * (`relatorio/vector-group.ts`) and its ratio table's `ratio_factor` as `vector_group` (the
 * enum gains the value): VAL CALCULADO is U1 · k / U2 with the group's k, the captures read the
 * group's terminal pairs, and with no group there is none. On seeds v9 and v10 a LIGAÇÃO
 * SECUNDÁRIA the parser reads applies its group too (an unparsed one keeps √3 and the Dyn1 pairs).
 * It is the version of a new template. A plate reading may now emit a nameplate suggestion citing
 * no OCR token over the whole image (`ocr_token_ids: []`, the prose precedent), a vector group
 * read from the drawn diagram, always `verify`; `suggestionRowSchema` already took that shape. These
 * two stories add no op kind, path family, row field nor reject code (Story 21.3's `order_key`
 * below does): a row written before 30 parses to the same bytes. `MIN_CONTRACT_VERSION` goes to 30 too.
 *
 * 30 (2026-11-05, Story 21.3, batch e21p): a photo row gains an optional `order_key`
 * (`photoFileRowSchema`, `0-9a-z` only and never ending in `0`, absent and null both meaning never moved), and
 * `FILE_FIELDS` gains `order_key`, so `file/{id}/order_key` is a new put path: one put per
 * "Subir" or "Descer" in the gallery's Overflow places a "Geral" photo in section 7 (the
 * REGISTRO FOTOGRÁFICO), and the one numbering sequence follows (`photos/order.ts`
 * `geralPhotos`, `print/photo-order.ts`). The value is capped as any order key (medium,
 * Story 20.9). A row written before 30 parses to the same bytes and keeps its capture-order
 * place. A version-29 bundle cannot parse the put (its `opSchema` refuses the field, so a pulled
 * page carrying one fails whole) and its row schema would strip the key, so its gallery would
 * number section 7 in capture order where the server prints the moved order:
 * `MIN_CONTRACT_VERSION` goes to 30 too.
 *
 * 31 (2026-11-06, Stories 22.4 to 22.6, batch e22c): the conclusion, the points of attention
 * and the parecer follow the fichas. Story 22.4: the kernel derives a floor for each sheet's
 * conclusion pair (`conclusionFloor`: an out reading, a ratio INSATISFATÓRIO, a measurement
 * cell out or a defect Não ensaiado reason give Reprovado · Com restrições; an NC row or an
 * observation give Aprovado · Com restrições) and every reader shows the effective pair, the
 * stricter of floor and stored ("Concluir ficha" writes it through the existing
 * `conclusion/result` and `/restriction` puts, no new op shape); a seed's not-tested reason
 * gains the optional `defect` flag, which no shipped seed sets. Story 22.5: a point row's
 * `origin` gains `nc`, `reading` and `reprovado`, with the optional `item_key` and `test_key`
 * (fixed at create, capped short, absent and null both meaning none, so a row written before
 * 31 parses to the same bytes), and section 8 derives an entry for every NC row, out test and
 * Reprovado sheet. Story 22.6: the parecer verdict is derived from the effective pairs (a
 * stored one counts only when stricter), the summary is always the composed one and a summary
 * typed before prints as "Observações do responsável"; "Parecer não preenchido" retires.
 *
 * 32 (2026-11-06, Story 22.10, batch e22r): a reading above the instrument's limit. AD-11's
 * number value gains the state `over_range` (`numberValueSchema`), stored by a test cell put as
 * `{raw: limit, unit, state: 'over_range'}`: typed "OL" or "0L" (the picked instrument's limit
 * for the test, read live from the registry and stored by value), "> 2 TΩ" or the cell's "> limite"
 * action. The kernel judges it (`relatorio/over-range.ts`: a `>` criterion within iff the limit
 * reaches it, a `<` one out) and every reader shows "> 2" and prints "> 2 TΩ"; a relação de
 * transformação cell and a cell a relative or equals criterion compares refuse it at input and
 * read a stored one as invalid. An instrument row gains the optional `range_isolacao` and
 * `range_resistencia_contato` (AR-18's test-default shape, absent and null both meaning unset), so
 * `registry/instrument/{id}/range_*` are new put paths. A test cell value in `over_range` whose
 * `raw` is no positive plain decimal or whose `unit` is no short text is refused
 * (`op_value_invalid`, `ops/value-limits.ts`), and so is a value in `over_range` anywhere but a
 * test cell: a nameplate field, a measurement test's value and the cabine's `se` and `env`
 * numbers (e22g, review S4). No plate or display reading proposes the state. A row written
 * before 32 parses to the same bytes.
 *
 * 32 (2026-11-06, Story 22.12, batch e22r): the previous visit's value beside each reading. An
 * equipment row gains the optional `last_results` (`lastResultsSchema`, absent and null both
 * meaning none), written only by the issue job through the new server-only family
 * `equipment/{id}/last_results` (AD-25's second projection, `print/last-results.ts`) in the batch
 * that writes the revision: the measured and over-range captures of the issued revision keyed by
 * test, row and column, and `prior`, the entry of the visit before when the same relatório is
 * issued again. A sheet of another relatório of the obra shows "Anterior: …" under each capture
 * cell and its section 9 prints a MANUT. ANTERIOR column; no value is ever copied into a cell. A
 * row written before 32 parses to the same bytes, and a relatório whose equipment has no previous
 * value prints as before.
 *
 * 32 (2026-11-06, Stories 22.7 to 22.9 and 22.11, batch e22s): seed v12, v11 with ÓLEO MINERAL
 * in TIPO DE ISOLAÇÃO (an earlier ÓLEO read as it) on the transformador de força, the TP and the
 * TC; the transformador de força's TIPO DO ÓLEO and its LIGAÇÃO SECUNDÁRIA relabelled DESLOCAMENTO
 * ANGULAR; the TP on the TC's checklist; the Não ensaiado reason `defeito_no_equipamento`, the
 * first flagged `defect`; a TENSÃO (kV) column per row on every insulation table, typed through
 * the existing `sheet/{b}/test/{t}/cell/{row}/{col}` put at the column's index (appended after the
 * value columns, so every v11 index stands); EXATIDÃO a select of accuracy classes on the TC and a
 * new field on the TP, the ratio criterion following the class (`relatorio/accuracy-class.ts`);
 * and a library block type, `inspecao_qgbt` (Inspeção de QGBT). No new op family and no new row
 * field: the seed schema gains optional keys only (a column's `voltage` role and `options`, a
 * table's `voltage_rows`, a test's `criterion_class_field`), so v1 to v11 parse to the bytes they
 * shipped with and a row written before 32 parses to the same bytes.
 *
 * 33 (2026-11-07, Story 14.6, batch e22t; AD-3, AD-15 and AD-21 notes of 2026-11-06): company
 * equipment types. Three company-scope families are appended: `equipment_type/{id}` (create), the
 * row `{id, derived_from, draft, retired_at, removed_at}` with the derived `latest_version`;
 * `equipment_type/{id}/{draft|retired_at|removed_at}` (put); and the create-only
 * `equipment_type_version/{id}`, `{id, type_id, version, definition, published_by, published_at}`,
 * whose fold also sets its type's `latest_version` and clears the draft it published.
 * `blockTypeSchema` opens to a union of the closed enum and `type:{uuidv7}`, and `BlockConfig`
 * gains `type_version` (optional and never defaulted, required exactly on a company type); a
 * company type's `sub_blocks` and `na_defaults` keys are its definition's. `RelatorioSnapshot`
 * gains the optional `equipment_types` (absent when no block names a company type). `applyOp`
 * refuses, as `SeedPathError` (`op_invalid`): a version that is not its type's `latest_version + 1`
 * (two devices publishing at once), a definition the strict schema refuses, a version create or a
 * draft or retirement put on a removed type, a discard of a published type, a block create naming
 * no version row in state (the cross-tenant guard), a config put changing a company block's type
 * or version, and a sheet write outside the resolved definition. A version naming a type the
 * company does not hold is `op_target_missing` (`REFERENCE_FIELDS`). No seed version and no seed
 * file change: a row written before 33 parses to the same bytes, and a relatório holding only
 * seeded types snapshots byte-equal.
 * Amended in place by e22h S2 (2026-11-07, before 33 was deployed): `BlockConfig` also gains
 * `type_version_id` (the version row's uuidv7, beside `type_version` on a company type only;
 * optional and never defaulted, a template block may omit it), and `applyOp` refuses as
 * `SeedPathError` a company block create without it or naming a row that is not of its type and
 * number, and a config put changing it; `equipment_types` keeps each block's own row when two
 * share a number. A device whose publish was refused for its number renumbers it and the blocks
 * naming its row on "Reenviar" (`resendRenumberedVersions`). MIN stays 33.
 */
/*
 * 34 (2026-11-08, Stories 23.2 to 23.4, batch e23a): seed v13 (the NETA criterion tables, the
 * instrument-limit note) is what a template the server moves to v13 and every relatório created on it
 * carry, and `applyOp` refuses as `SeedPathError` (`op_invalid`) a `sheet/{b}/test/{t}/criterion_override`
 * put on a v13 sheet whose value is neither null nor a well-formed manufacturer's value (`{raw, unit}`,
 * raw a positive dot-decimal, a unit the test's criterion converts to; `manufacturerRefusal`). v1 to
 * v12 sheets fold as before, so no stored op changes its outcome. No path, row or snapshot shape
 * changes: a row written before 34 parses to the same bytes.
 *
 * 35 (2026-11-08, Stories 23.7 to 23.9, batch e23b; 34 is batch e23a's, merged first): seed v13's
 * nameplate fields of decision K (TAPS, a numeric TAP ATUAL picked from them, the transformer's
 * winding material, temperatures, impedance and thermal class, the disjuntor's mounting, command
 * voltage, drive, counter and maker's times, the seccionadora's type, fuse current and
 * MOTORIZADO, the TP's NBR 6855 group, the arrester's MCOV, housing and disconnector, a cable
 * nameplate), a number field's raw taking a list ("13.8;13.2") or "N/√3" (`parse/pt-br-number.ts`),
 * the TC's RELAÇÃO read with a dash; the transformer's TTR with one row per tap, its `row` the tap
 * in whole V (`relatorio/tap-rows.ts`), which `applyOp` accepts only for a tap of the block's
 * current list (or, the list empty, the seeded row) and refuses otherwise as `SeedPathError`; and
 * a test's applicability from the nameplate, the new `TEST_FIELDS` value `applicability`
 * (`sheet/{b}/test/{k}/applicability`, `'applied'` or null, refused as `SeedPathError` on a test
 * whose definition carries no `applies_when` and for any other value), a cell of the sheet's test
 * entry (optional and never defaulted, appended last) with its single-cell conflict. The seed
 * schema gains optional keys only (a field's `list`, `pick_from`, `over_sqrt3`, `dash_ratio`; a
 * table's `rows_from`; the oil rule's `dry_fields`; a test's `applies_when` and `initial_off`, in
 * both grammars), so v1 to v12 parse to the bytes they shipped with and a row written before 35
 * parses to the same bytes. MIN follows to 35 (below).
 *
 * 36 (2026-11-09, Stories 23.5, 23.6 and 23.14, batch e23v): seed v13's insulation judged corrected
 * to 20 °C (the test key `temperature_correction`: the transformer by its oil or winding temperature
 * on the plate, the disjuntor and the seccionadora by the solid factor, each with the cabine's
 * ambient as fallback), the third level of a reading, `restricted` (the test key `restriction`: the
 * transformer's drop since the previous visit, the cables' and the arrester's comparison with the
 * largest row, the contact resistance's pole deviation, the arrester's disconnector prerequisite),
 * and the test key `criterion_status`. The point `origin` enum gains `restricao` (a point written
 * from a restricted test's derived entry, with its `test_key`; it replaces that entry), and a
 * `last_results` reading gains the optional `corrected: {raw, unit}` (the value judged at 20 °C,
 * which the next visit's history rule compares with). The seed schema gains optional keys only, so
 * v1 to v12 parse to the bytes they shipped with and a row written before 36 parses to the same
 * bytes. MIN follows to 36 (below).
 *
 * 37 (2026-11-09, Stories 23.10 and 23.11, batch e23h; 36 is batch e23v's, merged first): a test
 * definition, in both grammars, on a seed or a company type, gains two optional text keys
 * (`seed/test-help.ts`): `help`, "Como ensaiar" (up to eight texts, shown on the sheet from the
 * definition on the device, never printed), and `recommendation`, the text a `reading` derived
 * point of section 8 starts with (`points/derived.ts` `recommendedPointText`). Both ride inside
 * the existing `equipment_type` draft and `equipment_type_version` definition values (no path, op
 * family or row shape changes); `applyOp` refuses as `op_invalid` a version create whose heading
 * or recommendation is blank or longer than `TEST_TEXT_MAX_LENGTH` (1 000, `TEXT_CAPS.medium`),
 * through the strict publish schema. No seed carries them, so v1 to v13 parse to the bytes they
 * shipped with and a row written before 37 parses to the same bytes. MIN follows to 37 (below).
 */
/*
 * 38 (2026-11-09, Stories 23.15, 23.16, 23.17 and 23.19, batch e23t; 37 is batch e23h's, merged
 * first): seed v13's winding resistance on the transformador de força, its oil sampling on the
 * transformador and the disjuntor, and the HH fuses on the chave seccionadora, three measurement
 * tests whose keys are appended to `SUB_BLOCK_KEYS` (`resistencia_enrolamento`, `coleta_oleo`,
 * `resistencia_fusiveis`), so a `block/{id}/config` naming them and a `sheet/{b}/test/{k}/cell` or
 * `/value` put on them parse only from 38 on; the measurement grammar gains the criterion
 * `phase_deviation`, a row's `optional`, a value shown under a choice cell (`when.cell`), and a
 * test's `winding_correction` and `history_deviation_pct`; a seeded test gains `polarization_index`
 * and a table column the role `index` (the transformer's ABSORÇÃO and POLARIZAÇÃO, typed and judged);
 * a nameplate field gains `excused_unless` (TIPO (ANP), only for a MINERAL liquid); the
 * transformer's TIPO DE ISOLAÇÃO reads ÓLEO ISOLANTE and TIPO DO ÓLEO gives way to NATUREZA DO
 * LÍQUIDO and TIPO (ANP). A measurement reading corrected to 75 °C keeps its `corrected` in
 * `last_results` (the shape of 36). The template seed move drops a default-off part the new
 * version's definition no longer has, whatever its switch (`withVersionSubBlocks`: the v13
 * transformer's `ia_ip_display`, whose IP and DAR v13 types in the table). The seed and company schemas gain optional keys only, so v1 to v12 parse to the
 * bytes they shipped with and a row written before 38 parses to the same bytes. MIN follows to 38
 * (below).
 */
/*
 * 39 (2026-11-09, Stories 23.13, 23.18, 23.20 and 23.21, batch e23e; 38 is batch e23t's, merged
 * first): seed v13's thermography on the eight types and the two tests of the new library type
 * Malha de aterramento, whose keys are appended to `SUB_BLOCK_KEYS` (`termografia`,
 * `resistencia_malha`, `continuidade_malha`), and the type itself, appended to
 * `EQUIPMENT_BLOCK_TYPES` (`malha_aterramento`), so a `block/{id}/config` naming them, a block create
 * of the type and a `sheet/{b}/test/{k}/cell` or `/value` put on them parse only from 39 on (the
 * fold refuses the type's block on a v1 to v12 relatório, which ships no definition of it); a
 * seeded table column gains the role `choice` with `fails_on` (the TC's and TP's POLARIDADE, a
 * `{raw: option, unit: null, state: 'measured'}` cell the fold takes only with one of its options
 * or null), a table gains `voltage_default`, a test `notice_when` and `print_note`; the measurement
 * grammar gains the criteria `bands` and `max_field` and an `applies_when` over a value of the test.
 * The seed and company schemas gain optional keys only, so v1 to v12 parse to the bytes they shipped
 * with and a row written before 39 parses to the same bytes. MIN follows to 39 (below).
 */
/*
 * 40 (2026-11-10, fix batch e23z, the final Epic 23 fixes): no new op, path or schema family. The
 * fold takes a put of null (or a remove) on a TTR row whose tap left TAPS while it still holds a
 * reading ("Apagar leitura", `tapRowClearable`); a non-null put there stays refused. The kernel
 * derives differently on seed v13: a measured cell a deviation-between-phases test cannot judge
 * withholds Aprovado · Sem restrições (`unjudged`), a restricted measurement point stands while a rule
 * still flags a cell (`restrictionStands`), a Reprovado chosen by hand starts with the in-force tests'
 * recommendations, and a failed IP starts with its test's `index_recommendation`. A company type's
 * definition gains the optional `base_block_type` (Duplicar of a seeded type; print group and test
 * numbering as its base) and a seeded-grammar test the optional `index_recommendation`, so a row
 * written before 40 parses to the same bytes. MIN follows to 40 (below).
 */
/*
 * 41 (2026-11-10, fix batch e24h, Matheus on Bruno's report): no new op, path or schema family. The
 * kernel derives differently on every seed: a point of attention exists only when the technician
 * creates it, so an NC row, a reading out of its criterion, a restricted reading, a Reprovado chosen
 * by hand and a sheet marked Não ensaiado no longer list, count or print as automatic points (the
 * Points screen, Sumário row 8, the pre-issue rows, section 8 and the parecer's point counts read the
 * stored live points only); the findings still floor the parecer's verdict, so no verdict moves, and
 * a stored point still reads "Origem resolvida" when its finding is gone. MIN follows to 41 (below).
 */
export const CONTRACT_VERSION = 41;

/**
 * The oldest version the server still answers pulls for (a constant, not an env variable).
 * 2: a version-1 bundle cannot parse the `user/{id}` creates every company stream now
 * carries, so it must stop pulling and show "Atualizar" (AD-13).
 * 3: a version-2 bundle cannot parse the `template/{id}/seed_version` put a company stream
 * carries once its standard template was upgraded, so it updates the same way.
 * 4: a version-3 bundle cannot parse a `point/{id}/action` (or `priority`, `deadline`,
 * `owner`) put a relatório stream carries once a point holds an action, so it updates too.
 * Stays 4 at contract 5 (2026-09-26, Story 8.1): a version-4 bundle parses every op a
 * version-5 stream carries -- its suggestion schema strips the unknown `hint` key, and the
 * photo row's reading fields were already in its schema -- so no pull is refused.
 */
/*
 * 6 (2026-09-27): a version-5 (or older) bundle cannot parse a `relatorio/setup/parecer` put
 * nor a `generation_job/{id}/started_at` put a relatório stream carries once a parecer is set
 * or a job runs, so it updates too.
 */
/*
 * 7 (2026-09-28, Story 9.2): a version-6 (or older) bundle cannot parse a
 * `file/{id}/reading_kind` or `file/{id}/reading_target` put, which a relatório stream carries
 * once a block is created by photographing the equipment, so it updates too.
 *
 * 8 (2026-09-28, Story 9.3): a version-7 (or older) bundle cannot parse a
 * `file/{id}/people_in_photo` put a relatório stream carries once a photo is marked
 * "Pessoas na foto", so it updates too.
 *
 * 9 (2026-09-29, E9-Q2/Q3): a version-8 bundle's `applyOp` derives a different
 * `reading_status` from a null or same-kind `reading_kind` put, and its undo of a 9.2 create
 * pushes a `panel` put the route now refuses, so it updates too.
 *
 * 10 (2026-09-29, Story 10.1): a version-9 bundle's `applyOp` lets a concurrent C land over
 * an NC (or a clear over a filled cell) that a version-10 fold keeps, and its cell schema
 * strips the `merge` record, so its rows would diverge from the server's: it updates too.
 *
 * Stays 10 at contract 11 (2026-09-29, Story 10.4): the summary's `progress` is additive.
 *
 * 12 (2026-09-29, Stories 10.2 and 10.3): a version-11 (or older) bundle's cell and block
 * schemas strip `conflict`, `removal_conflict` and `removed_by`, and its fold ignores the meta
 * stamps, so its rows would diverge from the server's: it updates too.
 *
 * 13 (2026-09-29, E10-Q2): a version-12 bundle's fold ignores `meta.restore` and its cell
 * schema strips `shown_op_id`, so it would fold the undo of a resolution without the marks
 * the server writes back: it updates too.
 *
 * Stays 13 at contract 14 (2026-09-30, ledger 1131, batch C): a version-13 bundle parses the
 * `file/{id}/reading_kind = 'caption'` put a relatório stream now carries and its `applyOp`
 * derives the same `queued` status from it (`readingKindPutStatus`), ~~so no pull is refused~~.
 * Superseded on 2026-10-05 by the 14 paragraph below: MIN goes to 14 all the same.
 *
 * 14 (2026-10-05, Story 11.6): `LLM_PROVIDER=bedrock` sends a caption reading's photo to a
 * cloud model. A version-13 bundle queues that reading at pick time, before the import batch
 * is answered, so a photo later marked "Pessoas na foto" or given a caption could already be
 * on its way; a version-14 bundle asks only once the batch is answered or closed (ledger 1131).
 * No contract change at 14, but a version-13 bundle must update before a cloud LLM is wired.
 *
 * 15 (2026-10-07, Story 13.8): a version-14 bundle cannot parse an `audit_run/{id}` create nor
 * an `audit_run/{id}/{field}` put: its `opSchema` refuses an unknown family, so the whole
 * pulled page fails (`invalid_response`) instead of the unknown family being skipped. A
 * relatório stream carries those ops once anyone taps "Conferir antes de emitir", so the
 * version-14 bundle updates too.
 *
 * 16 (2026-10-09, PR #121 review; Matheus): a version-15 bundle folds a composed conclusion
 * text (`meta.composed`) over an edited one as `latest_text`, where a version-16 fold marks a
 * contradiction, and it folds a concurrent differing `text_basis` as a contradiction where a
 * version-16 fold follows the text (`sequential`), so its rows would diverge from the
 * server's: it updates too.
 *
 * 17 (2026-10-13, Story 14.2): a version-16 (or older) bundle cannot parse a `location/{id}`
 * create with `kind: 'painel'` (its row schema knows `cabine` and `coluna` only) nor a
 * `location/{id}/funcao` put (an unknown path: its `opSchema` fails the whole pulled page,
 * `invalid_response`), and its template schema refuses a skeleton holding a `painel` node. A
 * relatório or company stream carries those as soon as anyone adds a painel or sets a
 * local's Função, so the version-16 bundle updates too.
 *
 * 18 (2026-10-13, Story 14.3): a version-17 (or older) bundle cannot parse a
 * `location/{id}/checklist/...` put, a `file/{id}/location_id` put nor a
 * `point/{id}/location_id` put (unknown paths: its `opSchema` fails the whole pulled page,
 * `invalid_response`), and it cannot resolve seed v4: a template the server moved to v4, a
 * relatório created on it, and a Disjuntor MT sheet's `no_break_de_comando` item are all
 * outside what it ships. A relatório or company stream carries those as soon as the template
 * upgrade runs or anyone answers a site item, so the version-17 bundle updates too.
 *
 * 19 (2026-10-13, Story 14.5): a version-18 (or older) bundle cannot parse a
 * `sheet/{block_id}/test/{test_key}/value/{value_key}` put (an unknown path: its `opSchema`
 * fails the whole pulled page, `invalid_response`), and it cannot resolve the ninth block
 * type nor seed v5: a template the server moved to v5, a relatório created on it and a Chave
 * de transferência automática block are all outside what it ships, so it would stall on pull
 * or draw a sheet it has no definition of. A stream carries those as soon as the template
 * upgrade runs or anyone adds that type, so the version-18 bundle updates too.
 *
 * 20 (2026-10-15, Story 14.10 lane B): a version-19 (or older) bundle cannot parse an
 * `audit_run/{id}/coverage` put: the field is outside its `audit_run/field` enum, so its
 * `opSchema` fails the whole pulled page (`invalid_response`) instead of skipping the op. A
 * relatório stream carries that put as soon as an audit finishes, so the version-19 bundle
 * updates too.
 *
 * 21 (2026-10-20, Stories 14.9 and 14.11): a version-20 (or older) bundle cannot parse a block
 * create of type `quadro_eletrico` (its `opSchema` fails the whole pulled page) nor resolve seed
 * v6, which a template the server moved to v6 and every relatório created on it carry; and on a
 * v6 sheet it would count and print a non-oil unit's oil items as unanswered where the server's
 * kernel reads them NA, so its Sumário, pre-issue and documents would disagree. A stream carries
 * those as soon as the template upgrade runs, so the version-20 bundle updates too.
 *
 * 22 (2026-10-21, Story 14.14): a version-21 (or older) bundle cannot resolve seed v7, which a
 * template the server moved to v7 and every relatório created on it carry, and on a v7 disjuntor
 * whose medium is "Outro" it would read the oil item NA and VOL. ÓLEO excused where the server's
 * kernel shows them unanswered, so its Sumário, pre-issue and documents would disagree. A
 * stream carries those as soon as the template upgrade runs, so the version-21 bundle updates too.
  *
 * 23 (2026-10-21, Story 14.12): a version-22 (or older) bundle cannot parse a
 * `registry/nc_phrase/{id}` create nor a put on one (its `registryKindSchema` refuses the kind,
 * so its `opSchema` fails the whole pulled page, `invalid_response`). The company stream carries
 * one as soon as the server learns an NC phrase from any device's push, so the version-22
 * bundle updates too.
 *
 * 24 (2026-10-22, UX pass F43): a version-23 (or older) bundle cannot resolve seed v8, which a
 * template the server moved to v8 and every relatório created on it carry, and its Conclusão
 * text would keep `{itens_resultados}` unresolved where the server's kernel prints the section
 * numbers, so its preview and the documents would disagree. A stream carries
 * those as soon as the template upgrade runs, so the version-23 bundle updates too.
 *
 * 25 (2026-10-22, Stories 15.3 and 15.6): a version-24 (or older) bundle cannot parse a site
 * checklist op on `grades_e_portas_estado_e_fixacao` or `pintura_e_corrosao` (its `opSchema`
 * fails the whole pulled page) nor resolve seed v9, which a template the server moved to v9 and
 * every relatório created on it carry; on a v9 transformer it would compute VAL CALCULADO as
 * U1/U2 where the server's kernel applies √3, so its condições, Sumário and documents would
 * disagree. A stream carries those as soon as the template upgrade runs, so the version-24 bundle
 * updates too.
 *
 * 26 (2026-10-26, Story 16.4): a version-25 (or older) bundle's `numberValueSchema` refuses the
 * `not_applicable` state, so a pulled cabine row or a nameplate or cabine put holding "N.A" fails
 * its parse (the whole pulled page, `invalid_response`), and its readers would print "-" or a
 * blank where the server's kernel prints "N.A". A stream carries one as soon as any device types
 * "N.A", so the version-25 bundle updates too.
 *
 * 27 (2026-10-28, Stories 15.7 and 17.6): a version-26 (or older) bundle cannot resolve seed
 * v10, which a template the server moved to v10 and every relatório created on it carry, nor
 * parse a `relatorio/setup/site_altitude_na` put (its `opSchema` fails the whole pulled page);
 * its schema would strip the key from a pulled relatório row and show the altitude empty where
 * the server's kernel prints "N/A". A stream carries those as soon as the template upgrade runs
 * or any device marks the altitude N/A, so the version-26 bundle updates too.
 *
 * 28 (2026-10-29, fix batch fxrm): a version-27 (or older) bundle cannot parse a
 * `relatorio/removed_at` op (its `opSchema` fails the whole pulled page, `invalid_response`).
 * The relatório stream carries one as soon as the cleanup tombstones a relatório a device
 * follows, so the version-27 bundle updates too, and only then drops the relatório's card.
 *
 * 29 (2026-11-03, Stories 20.7 to 20.10): a version-28 (or older) bundle cannot parse a push
 * answer whose `rejected` carries one of the four new codes (its `opRejectCodeSchema` refuses
 * it, so the whole answer fails and the device keeps re-sending the same push), it does not
 * split a push under the 4 MiB body cap, and it shows no sentence for the new refusals. The
 * server refuses its status ops and oversized values from the first push of the deploy on, so
 * the version-28 bundle updates too, through the outdated-contract screen as on every bump.
 *
 * 30 (2026-11-05, Stories 21.1 and 21.2): a version-29 (or older) bundle cannot resolve seed v11,
 * which a template the server moves to v11 and every relatório created on it carry. On a v9 or v10
 * transformer whose LIGAÇÃO SECUNDÁRIA names a group other than Dyn1 ("YYN0") it would compute
 * VAL CALCULADO with √3 where the server's kernel applies the group's k, so its condições,
 * Sumário and documents would disagree with the server's. A stream carries those as soon as the
 * template upgrade runs, and the v9/v10 relatórios already hold such texts, so the version-29
 * bundle updates too.
 *
 * 30 (2026-11-05, Story 21.3): a version-29 (or older) bundle's `opSchema` refuses a
 * `file/{id}/order_key` put (the `FILE_FIELDS` enum), so a pulled page carrying one fails whole
 * (`invalid_response`), the precedent of versions 20, 23 and 28; and its `photoFileRowSchema`
 * would strip `order_key`, so its gallery and preview would number section 7 in capture order
 * where the server's documents print the moved order. A relatório stream carries the put as
 * soon as any device moves a photo, so the version-29 bundle updates too.
 *
 * 31 (2026-11-06, Stories 22.4 to 22.6): a version-30 (or older) bundle's `pointRowSchema`
 * refuses a point create whose `origin` is `nc`, `reading` or `reprovado`, so a pulled page
 * carrying one fails whole (`invalid_response`), the precedent of versions 20, 23, 28 and 30;
 * and it would show and print a stored conclusion pair looser than the floor its sheet now
 * sets (an Aprovado · Sem restrições over an NC or a reading out of criterion), a tapped
 * parecer looser than the fichas' and no derived NC or out-reading point, where the server's
 * documents print the effective pair, the derived verdict and every derived entry. The
 * version-30 bundle updates too.
 *
 * 32 (2026-11-06, Story 22.10): a version-31 (or older) bundle's kernel reads a test cell in the
 * `over_range` state as invalid (no verdict, the raw "2" shown where the server's documents print
 * "> 2 TΩ" and judge the row), so its Sumário, conclusion floor and parecer would disagree with
 * the server's, and its instrument row schema would strip `range_isolacao` and
 * `range_resistencia_contato`. A relatório stream carries such a cell as soon as any device types
 * "OL", so the version-31 bundle updates too.
 *
 * 32 (2026-11-06, Story 22.12): a version-31 (or older) bundle's `opSchema` refuses an
 * `equipment/{id}/last_results` put (an unknown path family), so a pulled project page carrying
 * one fails whole (`invalid_response`), the precedent of versions 20, 23, 28, 30 and 31; and its
 * equipment row schema would strip `last_results`, so its sheets would show no "Anterior" line
 * where the server's documents print MANUT. ANTERIOR. A project stream carries the put from the
 * first issue after the deploy on, so the version-31 bundle updates too.
 *
 * 32 (2026-11-06, Stories 22.7 to 22.9 and 22.11, batch e22s): a version-31 (or older) bundle
 * cannot resolve seed v12, which a template the server moves to v12 and every relatório created
 * on it carry; its `opSchema` refuses a block create of type `inspecao_qgbt` (the
 * `equipmentBlockTypeSchema` enum) and a `block/{id}/not_tested` value naming the reason
 * `defeito_no_equipamento` (`NOT_TESTED_REASON_KEYS`), so a pulled page carrying either fails
 * whole (`invalid_response`), the precedent of versions 20, 23, 28, 30 and 31; and on a v12 sheet
 * it would judge a TC or TP ratio at ± 0,5 % where the server's kernel judges it by its class, and
 * print no TENSÃO column. The version-31 bundle updates too.
 *
 * 33 (2026-11-07, Story 14.6, batch e22t): a version-32 (or older) bundle cannot parse the three
 * `equipment_type` families a company stream carries once a type is created (its `opSchema`
 * refuses the path, so the pulled page fails whole, `invalid_response`, the precedent of versions
 * 20, 23, 28, 30, 31 and 32), nor a block create of a `type:{uuidv7}` type nor a snapshot carrying
 * `equipment_types`; it would show a company block as an unknown section and print nothing of it.
 * Its pull answers `426 contract_outdated` and it updates; its pushes are still accepted.
 */
/*
 * 34 (2026-11-08, batch e23a): a version-33 (or older) bundle cannot resolve seed v13, which a
 * template the server moves to v13 and every relatório created on it carry, so it would show a v13
 * sheet as unknown and judge nothing; and its fold would store a malformed manufacturer's value the
 * server's fold refuses, which it would then show as the device's own. Its pull answers
 * `426 contract_outdated` and it updates; its pushes are still accepted.
 *
 * 35 (2026-11-08, Stories 23.7 to 23.9, batch e23b): a version-34 (or older) bundle's `opSchema`
 * refuses a `sheet/{b}/test/{k}/applicability` put (an unknown `TEST_FIELDS` value), so a pulled
 * page carrying one fails whole (`invalid_response`), the precedent of versions 20, 23, 28, 30 to
 * 33; and it cannot read a v13 sheet as the server's kernel does: it would count a test the
 * nameplate makes not applicable as missing and print it, show the transformer's TTR as one
 * typed row where the server prints one row per tap (and would refuse, then drop, a reading on a
 * tap row), and read a TAPS list or a "115/√3" as no number. A relatório stream carries such ops
 * from the first v13 sheet on, so the version-34 bundle updates too.
 *
 * 36 (2026-11-09, Stories 23.5, 23.6 and 23.14, batch e23v): a version-35 (or older) bundle's
 * `pointRowSchema` refuses a point create whose `origin` is `restricao`, so a pulled page carrying
 * one fails whole (`invalid_response`), the precedent of versions 20, 23, 28, 30 to 33 and 35; its
 * equipment row schema would strip a reading's `corrected` from `last_results`; and it cannot judge
 * a v13 sheet as the server's kernel does: it would judge a transformer's insulation raw where the
 * server corrects it to 20 °C, and show no restricted reading, no Aprovado · Com restrições floor
 * and no restricted point where the server prints them. A relatório stream carries such sheets from
 * the first v13 relatório on, so the version-35 bundle updates too.
 *
 * 37 (2026-11-09, Stories 23.10 and 23.11, batch e23h): a version-36 (or older) bundle would show
 * no "Como ensaiar" on a company sheet; it would derive the generic text of a point out of
 * criterion where the server's kernel derives the test's recommendation first, so the section 8 it
 * shows would differ from the printed one; and its fold would not refuse an over-cap or blank help
 * text the server's fold refuses (the precedent of 34). Its pull answers `426 contract_outdated`
 * and it updates; its pushes are still accepted.
 */
/*
 * 38 (2026-11-09, Stories 23.15 to 23.17 and 23.19, batch e23t): a version-37 (or older) bundle's
 * `blockConfigSchema` refuses a config naming `resistencia_enrolamento`, `coleta_oleo` or
 * `resistencia_fusiveis` (unknown `SUB_BLOCK_KEYS`), so a pulled page carrying a v13 transformer,
 * disjuntor or seccionadora block create fails whole (`invalid_response`), the precedent of 35 and
 * 36; and it cannot judge a v13 sheet as the server's kernel does: it would show no winding,
 * sampling or fuse test, no typed IP and no TIPO (ANP) rule where the server prints them, and judge
 * a transformer IP the server judges. Its pull answers `426 contract_outdated` and it updates.
 */
/*
 * 39 (2026-11-09, Stories 23.13, 23.18, 23.20 and 23.21, batch e23e): a version-38 (or older)
 * bundle's `blockConfigSchema` refuses a config naming `termografia`, `resistencia_malha` or
 * `continuidade_malha`, and its block schema a `malha_aterramento` block, so a pulled page carrying
 * any v13 block create fails whole (`invalid_response`), the precedent of 35, 36 and 38; and it
 * cannot judge a v13 sheet as the server's kernel does: it would read a polarity INVERTIDA as no
 * answer (no Reprovado floor, no point), show no thermography, start every insulation row at the
 * instrument's voltage where the server prints decision D's default, and judge a 0,3S TC at the
 * seeded ± 0,5 %. Its pull answers `426 contract_outdated` and it updates.
 */
/*
 * 40 (2026-11-10, fix batch e23z): a version-39 (or older) bundle's fold refuses the off-plate clear
 * the server's fold accepts, so the device would see its "Apagar leitura" refused; and its kernel
 * would not judge a v13 sheet as the server's does: an Aprovado floor where the server gives none, a
 * restricted point shown "Origem resolvida", the generic Reprovado and IP point texts where the
 * server derives the recommendations, a copy of the eight under "Outros equipamentos" where the
 * server prints it in its base's group. Its pull answers `426 contract_outdated` and it updates.
 */
/*
 * 41 (2026-11-10, fix batch e24h): a version-40 (or older) bundle's kernel would list, count and
 * print automatic points the server's kernel no longer does: its Points screen, Sumário row 8 and
 * export preview would show an entry for every NC row, reading out of criterion, restricted reading,
 * Reprovado chosen by hand and sheet marked Não ensaiado, and its parecer would count them, where the
 * printed document holds the stored points only. Its pull answers `426 contract_outdated` and it
 * updates; its pushes are still accepted.
 */
export const MIN_CONTRACT_VERSION = 41;

/**
 * E10-Q6 (2026-09-29): the first version whose client stamps what it saw on its writes
 * (`meta.standing_op_id`, `seen_conflict_op_id`, `seen_modified_at`, contract 12). The push
 * route refuses a push from an older client (or one with no header) that touches a cell or
 * block holding a conflict mark, since its plain write would clear a mark it never saw.
 */
export const MARK_AWARE_CONTRACT_VERSION = 12;

export const CONTRACT_VERSION_HEADER = 'x-contract-version';
