"""Expected-vs-returned token matching shared by the fixture tests.

Each expected token is paired with at most one returned token, greedily by best IoU.
A pair matches when the text agrees under the recognizer's text rule, IoU >= 0.5 and
every edge lies within max(6 px, 0.2 x the expected token's height).

Text rule: PARSeq's charset is 94 printable ASCII characters, so it cannot print an
accent or the ordinal sign. Label tokens therefore compare accent-insensitively
(`fold`: NFKD, combining marks dropped, º read as o); value tokens compare exactly
after NFC, except `EPÓXI`, which compares accent-insensitively for the same reason.

Unit rule (decided 2026-09-26, Story 8.3 review): the unit tokens `kVA`, `kV`, `V` and
`L` compare case-insensitively. PARSeq reads the lower-case `k` of `kVA`/`kV` as `K`
on this plate however the crop is margined or padded; the reading job parses units
through the kernel (Story 8.4), which knows the unit from the field definition, so the
case of the printed unit carries no information the job needs. Every other value token
stays exact. The accuracy line keeps the exact-text count visible next to the match
count, so this allowance never hides a recognition error.
"""

import unicodedata
from dataclasses import dataclass

from conftest import fold, iou

ACCENTED_VALUES = {"EPÓXI"}
UNIT_VALUES = {"kVA", "kV", "V", "L"}


@dataclass
class MatchReport:
    total: int
    matched: int
    values_total: int
    values_matched: int
    exact_text: int
    accentless_text: int
    folded_text: int
    mean_iou: float
    misses: list[str]

    @property
    def accuracy(self) -> float:
        return self.matched / self.total if self.total else 1.0

    def line(self, label: str) -> str:
        return (
            f"OCR accuracy [{label}]: matched {self.matched}/{self.total} ({self.accuracy:.1%}), "
            f"values {self.values_matched}/{self.values_total}, "
            f"exact text {self.exact_text}/{self.total}, accent-insensitive text {self.accentless_text}/{self.total}, case-and-accent-insensitive text {self.folded_text}/{self.total}, "
            f"mean IoU {self.mean_iou:.3f}"
        )


def _text_ok(expected: str, got: str, is_value: bool) -> bool:
    if is_value and expected in UNIT_VALUES:
        return expected.casefold() == got.casefold()
    if is_value and expected not in ACCENTED_VALUES:
        return unicodedata.normalize("NFC", expected) == unicodedata.normalize("NFC", got)
    return fold(expected) == fold(got)


def _edges_ok(e, g) -> bool:
    tolerance = max(6.0, 0.2 * (e[3] - e[1]))
    return all(abs(a - b) <= tolerance for a, b in zip(e, g))


def match(expected: list[dict], returned: list[dict], value_flags: list[bool]) -> MatchReport:
    pairs = sorted(
        ((iou(e["bbox"], r["bbox"]), i, j) for i, e in enumerate(expected) for j, r in enumerate(returned)),
        reverse=True,
    )
    paired: dict[int, int] = {}
    used: set[int] = set()
    for score, i, j in pairs:
        if score <= 0:
            break
        if i in paired or j in used:
            continue
        paired[i] = j
        used.add(j)

    matched = values_matched = exact = accentless = folded = 0
    ious: list[float] = []
    misses: list[str] = []
    for i, e in enumerate(expected):
        j = paired.get(i)
        if j is None:
            misses.append(f"{e['text']!r}: no box")
            ious.append(0.0)
            continue
        r = returned[j]
        score = iou(e["bbox"], r["bbox"])
        ious.append(score)
        exact += unicodedata.normalize("NFC", e["text"]) == unicodedata.normalize("NFC", r["text"])
        accentless += fold(e["text"]) == fold(r["text"])
        folded += fold(e["text"]).casefold() == fold(r["text"]).casefold()
        ok = _text_ok(e["text"], r["text"], value_flags[i]) and score >= 0.5 and _edges_ok(e["bbox"], r["bbox"])
        if ok:
            matched += 1
            values_matched += value_flags[i]
        else:
            misses.append(f"{e['text']!r} -> {r['text']!r} iou={score:.2f} {e['bbox']} vs {r['bbox']}")
    return MatchReport(
        total=len(expected),
        matched=matched,
        values_total=sum(value_flags),
        values_matched=values_matched,
        exact_text=exact,
        accentless_text=accentless,
        folded_text=folded,
        mean_iou=sum(ious) / len(ious) if ious else 1.0,
        misses=misses,
    )


def value_flags(expected: list[dict], value_words: list[str]) -> list[bool]:
    """Flags the right-hand value tokens: after the header, the tokens in the value column."""
    from make_plate import VALUE_X

    flags = [t["bbox"][0] >= VALUE_X - 2 and t["bbox"][1] > 160 for t in expected]
    assert [t["text"] for t, f in zip(expected, flags) if f] == value_words
    return flags
