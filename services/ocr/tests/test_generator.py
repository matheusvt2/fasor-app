"""The fixture plate is reproducible: re-running the generator gives the committed files."""

from conftest import FIXTURES
from make_plate import NAME, write


def test_generator_reproduces_the_committed_fixture(tmp_path):
    write(tmp_path)
    for suffix in (".tokens.json", ".md"):
        assert (tmp_path / f"{NAME}{suffix}").read_text(encoding="utf-8") == (FIXTURES / f"{NAME}{suffix}").read_text(
            encoding="utf-8"
        ), suffix
    assert (tmp_path / f"{NAME}.jpg").read_bytes() == (FIXTURES / f"{NAME}.jpg").read_bytes()
