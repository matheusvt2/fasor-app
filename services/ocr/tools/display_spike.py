"""Story 9.1 spike: the display read (`app/display.py`) scored on a folder of display crops.

Holds no data. The crops and their ground truth stay outside the repository (the spike base
set is client material, `docs/media/display-spike/`, git-ignored); they are mounted read-only:

  docker run --rm --network none \
    -v <crops dir>:/crops:ro -v <truth.json>:/truth.json:ro \
    -v ./services/ocr/tools:/app/tools:ro app-ocr python /app/tools/display_spike.py /crops /truth.json [text]

The optional third argument `text` scores the plate pipeline (`read_image`) instead: the
baseline the spike compared against. Run it from the `services/ocr` image built by compose
(`docker compose --profile ocr build ocr`).

`truth.json` maps a crop's two-character prefix to {family, digits, prefix?}: `digits` are the
expected digits of the reading (decimal point dropped), `prefix: true` scores only that many
leading digits (a truncated or caveated ground truth). Crops under `<crops>/far/` have no
reading and score as negatives: the reader should return no value. Only aggregate counts are
printed with the per-crop lines keyed by prefix, never an image or a file name.

The value rule mirrors the kernel's `displayValues` (`packages/domain/src/reading/display.ts`):
a token with `/` or `:` is a date or time; `I=<n>A` is the test current; a number followed by
`A`, `V`, `Hz`, `s` or `min` is an annotation; in a token with `=` only the part after the last
`=` is read; every other number is a value, in reading order.
"""

import json
import re
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.detector import load_detector  # noqa: E402
from app.display import read_display  # noqa: E402
from app.pipeline import decode, read_image  # noqa: E402
from app.recognizer import load_recognizer  # noqa: E402

NUMBER = re.compile(r"-?\d+(?:[.,]\d+)?")
ANNOTATION_AFTER = re.compile(r"^(A|V|kV|Hz|s|min|m)\b", re.IGNORECASE)


def values_of(tokens: list[dict]) -> list[tuple[str, float]]:
    out: list[tuple[str, float]] = []
    for token in tokens:
        text = token["text"]
        if "/" in text or ":" in text:
            continue
        if "=" in text:
            head, _, text = text.rpartition("=")
            if re.fullmatch(r"[I1l]", head) and re.match(r"\s*-?[\d.,]+\s*A", text):
                continue
        for match in NUMBER.finditer(text):
            after = text[match.end() :]
            before = text[: match.start()]
            if ANNOTATION_AFTER.match(after) or before.endswith("R"):
                continue
            out.append((match.group(0), token["confidence"]))
    return out


def digits(text: str) -> str:
    return re.sub(r"\D", "", text)


def main() -> None:
    crops, truth_path = Path(sys.argv[1]), Path(sys.argv[2])
    truth: dict = json.loads(truth_path.read_text())
    reader = read_image if len(sys.argv) > 3 and sys.argv[3] == "text" else read_display
    detector, recognizer = load_detector(), load_recognizer()

    def read(path: Path) -> list[dict]:
        result = reader(decode(path.read_bytes()), detector, recognizer)
        return [{"text": t.text, "confidence": t.confidence} for t in result.tokens]

    by_family: dict[str, list[int]] = {}
    confidences = {"right": [], "wrong": []}
    for key, expected in sorted(truth.items()):
        path = next(crops.glob(f"{key}-*.png"))
        tokens = read(path)
        values = values_of(tokens)
        family = by_family.setdefault(expected["family"], [0, 0])
        family[1] += 1
        # A single-value display: the last value read (the reading follows any label or current).
        got = digits(values[-1][0]) if values else ""
        want = expected["digits"]
        ok = got.startswith(want) if expected.get("prefix") else got == want
        family[0] += ok
        if values:
            confidences["right" if ok else "wrong"].append(values[-1][1])
        print(f"{key} {expected['family']:8s} ok={ok} value={'yes' if values else 'none'} conf={values[-1][1] if values else '-'} tokens={[t['text'] for t in tokens]}")

    far = sorted((crops / "far").glob("*.png"))
    refused = 0
    far_conf: list[float] = []
    for path in far:
        values = values_of(read(path))
        if values:
            far_conf.append(values[-1][1])
        else:
            refused += 1

    total = sum(v[0] for v in by_family.values())
    n = sum(v[1] for v in by_family.values())
    print(f"ACCURACY {total}/{n} " + " ".join(f"{k}={v[0]}/{v[1]}" for k, v in sorted(by_family.items())))
    print(f"NEGATIVES refused {refused}/{len(far)}; values returned on {len(far) - refused}, confidence {sorted(far_conf)}")
    for name, values in confidences.items():
        if values:
            print(f"CONFIDENCE {name}: n={len(values)} min={min(values):.3f} median={statistics.median(values):.3f} max={max(values):.3f}")


if __name__ == "__main__":
    main()
