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

The file is validated by `fakeReadingFixtureSchema` (`providers/fake.ts`). A photo without a
fixture, or with one that does not validate, fails permanently (one attempt).

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
