# Fake reading fixtures

Stories 8.4 and 8.5. With `OCR_PROVIDER=fake` and `LLM_PROVIDER=fake` (the default, and
what compose keeps), the reading job replays one fixture per photo instead of calling an OCR
engine or a model. Nothing here reaches the network or a cloud account.

## Format

One file per photo, named `<sha256 of the photo's original bytes>.json`:

```json
{
  "outcome": "ok",
  "ocr": { "image": { "width": 1600, "height": 1100 }, "tokens": [], "preprocessing_applied": false },
  "structuring": { "values": [] }
}
```

- `outcome`: `ok` (the default), `error` or `timeout`. `error` throws a transient provider
  error and `timeout` a transient `ProviderTimeoutError`, both at once (the fake never
  sleeps): every attempt fails, so the job makes its three attempts and ends `failed`.
- `ocr`: an `OcrReadResult` (`packages/domain/src/contract/ocr.ts`), required when the outcome
  is `ok`. Its `image` must be the width and height of the photo's `print` variant (the job
  refuses a read of another size), and its boxes are in that variant's pixels.
- `structuring`: a `StructuringOutput`. Absent means no values. The fake reports
  `model: "fake"`, `prompt_version: "fake-1"` and zero usage.
- `prose` (Stories 9.3 and 9.5): the prose step's answer, `{"text": "..."}` or `null`
  (`proseOutputSchema`, `packages/domain/src/contract/prose.ts`). Absent reads `null`. A
  caption or an NC draft makes no OCR call, so its fixture needs no `ocr`. The fake reports the
  same model, prompt version and usage as the structuring step.

The file is validated by `fakeReadingFixtureSchema` (`providers/fake.ts`). A fixture that
does not validate fails permanently (one attempt).

## A photo with no fixture of its own (E78-Q2)

The device re-encodes every shot, so a plate photographed or imported through the app never
has the sha256 of a committed image. A photo with no fixture named after its own sha256 falls
back to the default fixture of its target block type (`DEFAULT_FIXTURE_BY_BLOCK_TYPE` in
`providers/fake.ts`):

- every block type with a nameplate (Story 13.7): `transformador_forca` replays the synthetic
  transformer plate below, and `para_raio`, `chave_seccionadora`, `disjuntor_mt`, `tp` and
  `tc` the synthetic plates of "The synthetic plates of the other types". The OCR boxes are
  scaled to the width and height of the image the job sends (read with sharp), so the job's
  size check passes whatever size the device's re-encode gave the photo, and the type's
  suggestions arrive. This is how the local stack, `e2e/plate-reading.spec.ts` and
  `e2e/plate-every-type.spec.ts` read a plate through the app under the `fake` providers.
- a type with no nameplate (`cabos_entrada`, `cabos_saida`; the app shows no plate tile on
  their sheets): the reading fails permanently at its first attempt ("no fixture for block
  type ..."), and the sheet would offer "Tentar novamente" and "Preencher manualmente".

A photo's own fixture always wins over the default (the error and timeout images below).

Story 9.1 generalizes the fallback by reading kind: each kind lists its defaults
(`fakeDefaults` in `kinds/<kind>.ts`, flattened in `FAKE_FIXTURE_DEFAULTS` of `kinds/index.ts`),
chosen by `(reading_kind, block_type?, table_key?)`, most specific first (block type and table
together, then the block type, then the table, then the kind's catch-all). A display shot of
the thermo-hygrometer has no block type and the table key `env`.

| Kind | Block type | Table (`reading_target.table_key`) | Default fixture replays |
|---|---|---|---|
| plate | `transformador_forca` | - | `plate-transformador.jpg` |
| plate | `para_raio` | - | `images/plate-para-raio.png` |
| plate | `chave_seccionadora` | - | `images/plate-chave-seccionadora.png` |
| plate | `disjuntor_mt` | - | `images/plate-disjuntor-mt.png` |
| plate | `tp` | - | `images/plate-tp.png` |
| plate | `tc` | - | `images/plate-tc.png` |
| display | `transformador_forca` | `isolacao` | `display-tres-valores.jpg` (1,20 / 1,45 / 1,80 GΩ: only 1 MINUTO is suggested) |
| display | any | `isolacao` | `display-isolacao.jpg` (147 GΩ) |
| display | any | `resistencia_contato` | `display-microhmimetro.jpg` (87 µΩ, read at 0.17: Verificar) |
| display | any | `relacao_transformacao` | `display-ttr.jpg` (34,512) |
| display | none | `env` | `display-termo.jpg` (23,4 °C at 0.26: Verificar; 58 %) |
| display | any | anything else | `display-megohmetro.jpg` (3,42, no unit) |
| caption | - | - | `images/caption-default.png` (prose "Vista geral da cabine primária") |
| nc_obs | any | - | `images/nc-obs-default.png` (prose "Oxidação aparente na estrutura do equipamento.") |
| panel | - | - | `images/panel-seccionadora.png` (Chave seccionadora at 0.93, column `C09` at 0.95) |

The six display fixtures are the sidecar's `POST /read/display` reads of the synthetic displays
in `services/ocr/tests/fixtures/` (their table: `displays.md`); a display suggestion carries
`prompt_version: display-1` (no model runs) and its run row has no model.

## Adding one

1. Commit the image the fixture is for: the synthetic transformer plate lives in
   `services/ocr/tests/fixtures/`, anything else goes in `images/` here. A test
   (`providers/fake.test.ts`) fails when a fixture's name is not the sha256 of one of them.
2. Name the fixture after that sha256 and write the OCR tokens and the structured values.
3. The target block of the photo's `reading_target` decides which keys are kept: a key its
   nameplate does not have is dropped and logged.

## The synthetic transformer plate

`a1eac9106f186a29ca82e896741922794eda7f86a231c4dcf942031d14dc26ac.json` replays
`services/ocr/tests/fixtures/plate-transformador.jpg` (1600 x 1100, its `print` variant keeps
that size). The OCR is the 43 tokens of `plate-transformador.tokens.json`, ids `t0` to `t42`,
confidence 0.99, `preprocessing_applied: false`. The target must be a `transformador_forca`
block; on another block type most keys are dropped.

With empty cells and nothing in the registries the job emits these eleven pending
suggestions (`vol_oleo` gets none: the model leaves it out):

| Field | Value emitted | Cited | Trust | Hint |
|---|---|---|---|---|
| identificacao | `TR-01` | t4 | suggested | - |
| fabricacao | `Celtta` | t6 | suggested | create_registry_entry manufacturer `Celtta` |
| n_serie | `240815-07` | t9 | suggested | - |
| tipo | `TSE-500/15` | t11 | suggested | - |
| tipo_de_isolacao | `EPÓXI` | t15 | suggested | - |
| vol_oleo | none (the model omits it) | - | - | - |
| potencia_nominal | `{raw: 500, unit: kVA, state: measured}` | t22 t23 | suggested | - |
| tap_atual | `5` (the plate prints 3) | t26 | **verify** | - |
| data_fabricacao | `2024-08` | t29 | suggested | - |
| tensao_nominal_at | `{raw: 15, unit: kV}` | t33 t34 | suggested (`replace` when typed first) | - |
| tensao_nominal_bt | `{raw: 380, unit: V}` | t38 t39 | suggested | - |
| ligacao_secundaria | `Dyn1` | t42 | suggested | - |

`tap_atual` is the wrong-digit case of Story 8.5: the value carries a digit its cited token
does not, so the server makes it `verify` whatever the model says. A cell filled before the
run gets `mode: replace`; a manufacturer the company already registered as `Celtta` stores
the registry's spelling and no hint.

## The synthetic plates of the other types (Story 13.7)

Five plates, one per nameplate type besides the transformer, each a 1200 x 900 PNG in
`images/` (the `print` variant keeps that size, so a photo of the committed image replays its
own fixture unscaled). Each draws a header with the type's label, then one row per field: the
seed label's words at the left, the value at the right. The values are invented, valid for
their field kind, and the manufacturers are made-up words; nothing comes from a real plate.
Every value cites the tokens that print all of its digits, so with empty cells and nothing in
the registries each value is a pending `suggested` suggestion, except a `voltage_class` value
(TENSÃO NOMINAL, TENSÃO DE PLACA), which is `verify` unless the company registered that class
(Story 8.5); every new manufacturer carries `create_registry_entry`. Every nameplate key of the
type is covered except `tag` and `vol_oleo`. Tokens are `t0..`, confidence 0.99,
`preprocessing_applied: false`; each value's confidence is 0.97.

| Image | Fixture | Tokens | Values (field: value, cited tokens) |
|---|---|---|---|
| `plate-para-raio.png` | `966c9b54...json` | 16 | fabricacao `Quelvar` (t2); n_serie `PR-2207-114` (t5); tipo `ZNO-15/10` (t7); tensao_nominal `15 kV` (t10 t11, verify unless registered); corrente_nominal `{raw: 10, unit: kA}` (t14 t15) |
| `plate-chave-seccionadora.png` | `deaede23...json` | 30 | identificacao `SEC-02` (t3); fabricacao `Morvatec` (t5); n_serie `SC-190344` (t8); tipo `SFU-17/630` (t10); meio_de_extincao `AR` (t14); tensao_de_placa `17,5 kV` (t18 t19, verify unless registered); corrente_nominal `{raw: 630, unit: A}` (t22 t23); acionamento `MANUAL/PUNHO` (t25); data_de_fabricacao `2019-03` (t29, prints `03/2019`) |
| `plate-disjuntor-mt.png` | `b0b6f663...json` | 40 | identificacao `DJ-01` (t3); fabricacao `Tensilda` (t5); n_serie `DJ-210587` (t8); tipo `VBX-17` (t10); meio_de_extincao `SF6` (t14); corrente_nominal `{raw: 630, unit: A}` (t17 t18); capacidade_interruptor `{raw: 25, unit: kA}` (t21 t22); data_de_fabricacao `2021-06` (t26); tensao_nominal `15 kV` (t29 t30, verify unless registered); aj_bobina `220 Vcc` (t33 t34); aj_rele_50_51 `120 A` (t38 t39) |
| `plate-tp.png` | `008145d0...json` | 37 | identificacao `TP-01` (t2); fabricacao `Ondarel` (t4); n_serie `TP-118204` (t7); tipo `UTE-15` (t9); tipo_de_isolacao `EPÓXI` (t13); potencia_nominal `{raw: 500, unit: VA}` (t16 t17); tap_atual `2` (t20); data_fabricacao `2020` (t23, a bare year as printed, AIR-V1); tensao_nominal_at the model's `{raw: 13800, unit: V}` (t27 t28, prints `13.800 V`), stored `{raw: 13.8, unit: kV}` suggested (AIR-1: moved into the field's unit, the digit rule on the printed raw); tensao_nominal_bt `{raw: 115, unit: V}` (t32 t33); ligacao_secundaria `Y` (t36) |
| `plate-tc.png` | `0b5dce48...json` | 43 | identificacao `TC-01` (t2); fabricacao `Velquor` (t4); n_serie `TC-305117` (t7); tipo `UCE-15` (t9); tipo_de_isolacao `Á SECO` (t13 t14); potencia_nominal `{raw: 25, unit: VA}` (t17 t18); tap_atual `1` (t21); data_fabricacao `2022-02` (t24); tensao_nominal_at `{raw: 15, unit: kV}` (t28 t29); tensao_nominal_bt `{raw: 220, unit: V}` (t33 t34); ligacao_secundaria `Y` (t37); relacao `200-5 A` (t39 t40); exatidao `10B100` (t42) |

The images and fixtures are generated, never edited by hand, by
`apps/api/src/scripts/make-plate-fixtures.ts` in the `tools` container:

```sh
docker compose --profile tools run --rm tools pnpm exec tsx apps/api/src/scripts/make-plate-fixtures.ts
```

It lays each plate out from a table of values and the type's seed `FieldDef`s, draws it as an
inline SVG (font DejaVu Sans) rendered by sharp, and measures every token box by drawing the
token alone at its position on a white page and trimming the page to its ink. It writes the
PNG and `<sha256>.json` and prints the shas, which `kinds/plate.ts` lists in `fakeDefaults`.
The output is reproducible in the same container image; a different font set changes the
bytes, so a re-run that prints new shas needs `kinds/plate.ts` updated and the old JSONs
removed.

## The error and timeout images

`images/plate-error.png` and `images/plate-timeout.png` are 64 x 48 single-colour PNGs made
once with sharp. Their fixtures (`d99b945b...json` and `17d23086...json`) declare only
`outcome: error` and `outcome: timeout`. A plate photo taken from either exercises the
three-attempt failure and the "Tentar novamente" path.

## The prose images (Stories 9.3 and 9.5)

`images/caption-default.png`, `images/nc-obs-default.png` and `images/caption-none.png` are
64 x 48 single-colour PNGs made once with sharp (green, red and slate). The first two are the
`caption` and `nc_obs` defaults above (a photo taken through the app replays them); the third
answers `prose: null`, the photo the job cannot caption (no suggestion, the photo stays "Sem
legenda"). The texts are authored pt-BR, not read from any real photo.

## The synthetic panel front (Story 9.2)

`36f3fca9...json` replays `images/panel-seccionadora.png` (1200 x 900), a panel door with a
white column label "C09" and a plate reading "SECCIONADORA". It is the `panel` kind's only
default, so every "Fotografar equipamento" shot taken through the app under the `fake`
providers reads as a Chave seccionadora on column 9: two OCR tokens (`t0` "C09", `t1`
"SECCIONADORA", confidence 0.99) and two structured values, `block_type`
`chave_seccionadora` (0.93, cites `t1`) and `column` `C09` (0.95, cites `t0`). The job emits
one pending suggestion on the photo's `file/{id}/block_id` with the value
`{block_type: chave_seccionadora, column: 9, column_text: "C09"}`.

The image was made once with sharp from an inline SVG, in the `tools` container:

```sh
docker compose --profile tools run --rm -w /workspace/apps/api tools node --input-type=module -e "import sharp from 'sharp'; const svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\" height=\"900\"><rect width=\"1200\" height=\"900\" fill=\"#5A6068\"/><rect x=\"60\" y=\"40\" width=\"1080\" height=\"820\" rx=\"12\" fill=\"#8A9099\" stroke=\"#3A3F46\" stroke-width=\"8\"/><rect x=\"120\" y=\"90\" width=\"240\" height=\"120\" fill=\"#FFFFFF\" stroke=\"#222222\" stroke-width=\"4\"/><text x=\"240\" y=\"178\" font-family=\"sans-serif\" font-size=\"80\" font-weight=\"bold\" text-anchor=\"middle\" fill=\"#111111\">C09</text><rect x=\"340\" y=\"390\" width=\"520\" height=\"130\" fill=\"#F2F2F2\" stroke=\"#222222\" stroke-width=\"3\"/><text x=\"600\" y=\"478\" font-family=\"sans-serif\" font-size=\"56\" font-weight=\"bold\" text-anchor=\"middle\" fill=\"#111111\">SECCIONADORA</text><circle cx=\"1040\" cy=\"450\" r=\"30\" fill=\"#3A3F46\"/></svg>'; await sharp(Buffer.from(svg)).png().toFile('src/jobs/reading/fixtures/images/panel-seccionadora.png');"
```

The token boxes were placed by hand over the rendered text.
