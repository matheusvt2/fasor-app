"""Deterministic generator of the synthetic instrument displays (Story 9.1).

Synthetic, no client material: every value, date and layout is invented, drawn as a
seven-segment LCD (insulation testers, the thermo-hygrometer) or as a dot-matrix character
LCD (micro-ohmmeter, ratio meter). No randomness: the same Pillow and DejaVu fonts (from
fonts-dejavu-core) give the same PNG bytes, then the same JPEG bytes.

Writes, into the directory given as the first argument (default: this file's directory),
for each display NAME of DISPLAYS:
  NAME.jpg           the photo, 1200 x 900, JPEG quality 90, no EXIF
  displays.json      {NAME: {image, lines, values: [{raw, unit}]}}: what each display prints
                     and the values a reader must return, in reading order
  displays.md        the table of the above, the regenerate command, each sha256

Regenerate (inside the image, never on the host):
  docker compose --profile ocr run --rm --user "$(id -u):$(id -g)" \
    -v ./services/ocr/tests/fixtures:/app/tests/fixtures ocr python tests/fixtures/make_display.py
"""

import hashlib
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

WIDTH, HEIGHT = 1200, 900
FONT_DIR = Path("/usr/share/fonts/truetype/dejavu")
CASE = (46, 50, 56)
BEZEL = (22, 24, 27)
LCD_GREY = (176, 186, 168)  # an unlit reflective LCD
LCD_GREEN = (150, 196, 72)  # a green backlit character LCD
SEGMENT_INK = (30, 34, 30)
LABEL_INK = (220, 222, 226)

# Seven-segment masks: segments a b c d e f g (top, top right, bottom right, bottom,
# bottom left, top left, middle).
SEGMENTS = {
    "0": "abcdef",
    "1": "bc",
    "2": "abdeg",
    "3": "abcdg",
    "4": "bcfg",
    "5": "acdfg",
    "6": "acdefg",
    "7": "abc",
    "8": "abcdefg",
    "9": "abcdfg",
    "-": "g",
    " ": "",
}


@dataclass(frozen=True)
class SegmentLine:
    """One seven-segment row: digits (with '.' after a digit), then an optional printed unit."""

    text: str
    unit: str | None
    digit_height: int


@dataclass(frozen=True)
class CharLine:
    """One dot-matrix character row."""

    text: str


@dataclass(frozen=True)
class Display:
    name: str
    title: str
    kind: str  # "segment" or "character"
    lines: list
    values: list[dict] = field(default_factory=list)


DISPLAYS: list[Display] = [
    Display(
        "display-megohmetro",
        "3 1/2-digit seven-segment insulation tester, no unit on screen",
        "segment",
        [SegmentLine(" 3.42", None, 170)],
        [{"raw": "3.42", "unit": None}],
    ),
    Display(
        "display-isolacao",
        "seven-segment insulation tester that prints its unit",
        "segment",
        [SegmentLine("147", "GΩ", 170)],
        [{"raw": "147", "unit": "GΩ"}],
    ),
    Display(
        "display-microhmimetro",
        "2x16 character LCD micro-ohmmeter: date, time, test current and the reading",
        "character",
        [CharLine("12/03/2026 10:15"), CharLine("I=10.0A  87 uΩ")],
        [{"raw": "87", "unit": "µΩ"}],
    ),
    Display(
        "display-ttr",
        "2x16 character LCD ratio meter",
        "character",
        [CharLine("12/03/2026 10:40"), CharLine("RATIO = 34.512")],
        [{"raw": "34.512", "unit": None}],
    ),
    Display(
        "display-termo",
        "seven-segment thermo-hygrometer: temperature and relative humidity",
        "segment",
        [SegmentLine("23.4", "°C", 150), SegmentLine("58", "%UR", 150)],
        [{"raw": "23.4", "unit": "°C"}, {"raw": "58", "unit": "%"}],
    ),
    Display(
        "display-tres-valores",
        "character LCD insulation tester showing its stored 30 s, 1 min and 10 min results",
        "character",
        [CharLine("R30s 1.20 GΩ"), CharLine("R1m  1.45 GΩ"), CharLine("R10m 1.80 GΩ")],
        [{"raw": "1.20", "unit": "GΩ"}, {"raw": "1.45", "unit": "GΩ"}, {"raw": "1.80", "unit": "GΩ"}],
    ),
]


def _segment_polys(x: float, y: float, w: float, h: float, t: float, slant: float) -> dict[str, list[tuple[float, float]]]:
    """The seven segment polygons of one digit cell with its top-left corner at (x, y)."""
    half = h / 2
    g = t * 0.15  # the gap between two segments

    def sk(px: float, py: float) -> tuple[float, float]:
        return (px + slant * (h - (py - y)) / h, py)

    def horizontal(cy: float) -> list[tuple[float, float]]:
        x0, x1 = x + t / 2 + g, x + w - t / 2 - g
        x0, x1 = x0 - t / 2, x1 + t / 2
        return [sk(x0, cy), sk(x0 + t / 2, cy - t / 2), sk(x1 - t / 2, cy - t / 2), sk(x1, cy), sk(x1 - t / 2, cy + t / 2), sk(x0 + t / 2, cy + t / 2)]

    def vertical(cx: float, y0: float, y1: float) -> list[tuple[float, float]]:
        y0, y1 = y0 + g, y1 - g
        return [sk(cx, y0), sk(cx + t / 2, y0 + t / 2), sk(cx + t / 2, y1 - t / 2), sk(cx, y1), sk(cx - t / 2, y1 - t / 2), sk(cx - t / 2, y0 + t / 2)]

    left, right = x + t / 2, x + w - t / 2
    return {
        "a": horizontal(y + t / 2),
        "b": vertical(right, y + t / 2, y + half),
        "c": vertical(right, y + half, y + h - t / 2),
        "d": horizontal(y + h - t / 2),
        "e": vertical(left, y + half, y + h - t / 2),
        "f": vertical(left, y + t / 2, y + half),
        "g": horizontal(y + half),
    }


def _draw_segment_line(draw: ImageDraw.ImageDraw, line: SegmentLine, x: float, y: float, ink) -> float:
    """Draws one seven-segment row from (x, y); returns the x after its last glyph."""
    h = line.digit_height
    w = h * 0.52
    t = h * 0.13
    slant = h * 0.08
    pitch = w + h * 0.2
    for char in line.text:
        if char == ".":
            r = t * 0.55
            cx, cy = x - pitch + w + h * 0.12, y + h - r
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ink)
            continue
        for segment in SEGMENTS[char]:
            draw.polygon(_segment_polys(x, y, w, h, t, slant)[segment], fill=ink)
        x += pitch
    if line.unit is not None:
        font = ImageFont.truetype(str(FONT_DIR / "DejaVuSans-Bold.ttf"), int(h * 0.36))
        draw.text((x + h * 0.08, y + h * 0.58), line.unit, font=font, fill=ink)
        x += h * 0.1 + font.getlength(line.unit)
    return x


def _char_lcd(lines: list[CharLine], cols: int = 16) -> Image.Image:
    """A dot-matrix character LCD: each glyph rendered small, then enlarged as 5x7-ish dots."""
    font = ImageFont.truetype(str(FONT_DIR / "DejaVuSansMono-Bold.ttf"), 14)
    cell_w, cell_h = 9, 16
    small = Image.new("L", (cols * cell_w + 8, len(lines) * cell_h + 6), 0)
    draw = ImageDraw.Draw(small)
    for row, line in enumerate(lines):
        for col, char in enumerate(line.text.ljust(cols)[:cols]):
            draw.text((4 + col * cell_w, 3 + row * cell_h), char, font=font, fill=255)
    mask = small.point(lambda v: 255 if v > 110 else 0)
    dot = 6
    big = mask.resize((mask.width * dot, mask.height * dot), Image.Resampling.NEAREST)
    # The dot grid: a thin gap between dots, as a character LCD shows it.
    grid = Image.new("L", big.size, 255)
    grid_draw = ImageDraw.Draw(grid)
    for gx in range(0, big.width, dot):
        grid_draw.line((gx, 0, gx, big.height), fill=0)
    for gy in range(0, big.height, dot):
        grid_draw.line((0, gy, big.width, gy), fill=0)
    dots = Image.composite(big, Image.new("L", big.size, 0), grid)
    lcd = Image.new("RGB", big.size, LCD_GREEN)
    lcd.paste(Image.new("RGB", big.size, SEGMENT_INK), (0, 0), dots)
    return lcd


def render(display: Display) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), CASE)
    draw = ImageDraw.Draw(image)
    label_font = ImageFont.truetype(str(FONT_DIR / "DejaVuSans.ttf"), 30)
    draw.text((80, 60), "MODELO SINTETICO", font=label_font, fill=LABEL_INK)
    if display.kind == "segment":
        box = (140, 160, WIDTH - 140, HEIGHT - 200)
        draw.rounded_rectangle((box[0] - 24, box[1] - 24, box[2] + 24, box[3] + 24), radius=18, fill=BEZEL)
        draw.rectangle(box, fill=LCD_GREY)
        rows = len(display.lines)
        pitch = (box[3] - box[1]) / rows
        for i, line in enumerate(display.lines):
            y = box[1] + (pitch - line.digit_height) / 2 + i * pitch
            _draw_segment_line(draw, line, box[0] + 90, y, SEGMENT_INK)
    else:
        lcd = _char_lcd(display.lines)
        scale = min((WIDTH - 200) / lcd.width, (HEIGHT - 360) / lcd.height)
        lcd = lcd.resize((int(lcd.width * scale), int(lcd.height * scale)), Image.Resampling.NEAREST)
        x, y = (WIDTH - lcd.width) // 2, 170
        draw.rounded_rectangle((x - 30, y - 30, x + lcd.width + 30, y + lcd.height + 30), radius=18, fill=BEZEL)
        image.paste(lcd, (x, y))
    # A camera is never perfectly sharp.
    return image.filter(ImageFilter.GaussianBlur(1.2))


def _lines_text(display: Display) -> list[str]:
    out = []
    for line in display.lines:
        if isinstance(line, SegmentLine):
            out.append(line.text.strip() + (f" {line.unit}" if line.unit else ""))
        else:
            out.append(line.text)
    return out


def _markdown(shas: dict[str, str]) -> str:
    lines = [
        "# Fixtures: synthetic instrument displays",
        "",
        "Synthetic test fixtures of the display reading path (Story 9.1). No client material:",
        "every value, date and layout is invented. Generated by `make_display.py` (Pillow, DejaVu",
        "fonts from `fonts-dejavu-core`, no randomness). Regenerate inside the image, never on the host:",
        "",
        "```",
        'docker compose --profile ocr run --rm --user "$(id -u):$(id -g)" \\',
        "  -v ./services/ocr/tests/fixtures:/app/tests/fixtures ocr python tests/fixtures/make_display.py",
        "```",
        "",
        f"Each image is {WIDTH} x {HEIGHT}, JPEG quality 90, no EXIF.",
        "",
        "| Image | Display | Prints | Values | sha256 |",
        "|---|---|---|---|---|",
    ]
    for display in DISPLAYS:
        prints = " / ".join(f"`{text}`" for text in _lines_text(display))
        values = ", ".join(f"{v['raw']} {v['unit'] or '(no unit)'}" for v in display.values)
        lines.append(f"| `{display.name}.jpg` | {display.title} | {prints} | {values} | `{shas[display.name]}` |")
    lines.append("")
    return "\n".join(lines)


def write(out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    expected: dict[str, dict] = {}
    shas: dict[str, str] = {}
    for display in DISPLAYS:
        path = out_dir / f"{display.name}.jpg"
        render(display).save(path, "JPEG", quality=90)
        shas[display.name] = hashlib.sha256(path.read_bytes()).hexdigest()
        expected[display.name] = {
            "image": {"width": WIDTH, "height": HEIGHT},
            "lines": _lines_text(display),
            "values": display.values,
        }
    (out_dir / "displays.json").write_text(json.dumps(expected, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "displays.md").write_text(_markdown(shas), encoding="utf-8")


if __name__ == "__main__":
    write(Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent)
