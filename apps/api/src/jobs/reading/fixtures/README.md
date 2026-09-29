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

- `transformador_forca`: the synthetic transformer plate below. Its OCR boxes are scaled to
  the width and height of the image the job sends (read with sharp), so the job's size check
  passes whatever size the device's re-encode gave the photo, and the eleven suggestions
  arrive. This is how the local stack and `e2e/plate-reading.spec.ts` read a plate through the
  app under the `fake` providers.
- any other block type: the reading fails permanently at its first attempt ("no fixture for
  block type ..."), and the sheet offers "Tentar novamente" and "Preencher manualmente".

A photo's own fixture always wins over the default (the error and timeout images below).

Story 9.1 generalizes the fallback by reading kind: each kind lists its defaults
(`fakeDefaults` in `kinds/<kind>.ts`, flattened in `FAKE_FIXTURE_DEFAULTS` of `kinds/index.ts`),
chosen by `(reading_kind, block_type?, table_key?)`, most specific first (block type and table
together, then the block type, then the table, then the kind's catch-all). A display shot of
the thermo-hygrometer has no block type and the table key `env`.

| Kind | Block type | Table (`reading_target.table_key`) | Default fixture replays |
|---|---|---|---|
| plate | `transformador_forca` | - | `plate-transformador.jpg` |
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

1. Commit the image the fixture is for: the synthetic plate lives in
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
