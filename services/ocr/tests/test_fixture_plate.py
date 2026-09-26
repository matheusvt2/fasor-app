"""The committed synthetic plate read end to end: one token per word, in the received
image's pixel space, matching the generator's expected tokens (rules in matching.py).

Pass: at least 95% of the expected tokens match and every value token matches.
"""

from conftest import SUMMARY, assert_read_result
from make_plate import value_words
from matching import match, value_flags

MIN_ACCURACY = 0.95


def test_plate_matches_expected_tokens(plate_response, expected_tokens):
    assert_read_result(plate_response)
    assert plate_response["image"] == expected_tokens["image"]
    assert plate_response["preprocessing_applied"] is False

    expected = expected_tokens["tokens"]
    flags = value_flags(expected, value_words())
    report = match(expected, plate_response["tokens"], flags)
    SUMMARY.append(report.line("plate JPEG"))
    for miss in report.misses:
        SUMMARY.append(f"  miss: {miss}")

    assert report.accuracy >= MIN_ACCURACY, report.misses
    assert report.values_matched == report.values_total, report.misses
    # One token per word: nothing returned beyond the printed words.
    assert len(plate_response["tokens"]) == len(expected), [t["text"] for t in plate_response["tokens"]]


def test_plate_tokens_are_in_reading_order(plate_response, expected_tokens):
    returned = [t["text"] for t in plate_response["tokens"]]
    values = value_words()
    # The value words appear in the same order the plate prints them.
    positions = [returned.index(v) for v in values if v in returned]
    assert positions == sorted(positions)
    # Rows top to bottom: each token's centre is not above the previous row's top.
    tops = [t["bbox"][1] for t in plate_response["tokens"]]
    centres = [(t["bbox"][1] + t["bbox"][3]) / 2 for t in plate_response["tokens"]]
    for prev_top, centre in zip(tops, centres[1:]):
        assert centre >= prev_top
