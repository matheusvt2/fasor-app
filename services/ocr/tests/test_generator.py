"""The fixtures are reproducible: re-running each generator gives the committed files."""

from conftest import FIXTURES
import make_display
from make_plate import NAME, write


def test_generator_reproduces_the_committed_fixture(tmp_path):
    write(tmp_path)
    for suffix in (".tokens.json", ".md"):
        assert (tmp_path / f"{NAME}{suffix}").read_text(encoding="utf-8") == (FIXTURES / f"{NAME}{suffix}").read_text(
            encoding="utf-8"
        ), suffix
    assert (tmp_path / f"{NAME}.jpg").read_bytes() == (FIXTURES / f"{NAME}.jpg").read_bytes()


def test_display_generator_reproduces_the_committed_fixtures(tmp_path):
    """Story 9.1: the six synthetic displays, their expected values and their table."""
    make_display.write(tmp_path)
    for name in ("displays.json", "displays.md"):
        assert (tmp_path / name).read_text(encoding="utf-8") == (FIXTURES / name).read_text(encoding="utf-8"), name
    for display in make_display.DISPLAYS:
        name = f"{display.name}.jpg"
        assert (tmp_path / name).read_bytes() == (FIXTURES / name).read_bytes(), name
