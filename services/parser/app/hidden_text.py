"""Hidden-text detection — the Python port of the TS parser's rules.

Source of truth: ATSAgent ``src/lib/document-hidden-text.ts`` (byte-identical
in the refactor monorepo at packages/security/src/shared/document-hidden-text.ts).
Constants and thresholds are copied verbatim; the DOCX run-stripper is a
direct transliteration of ``stripHiddenDocxRuns``. The PDF per-run
classification (render mode, fill luminance, painted background nuance) lives
in ``app.extraction`` — pdfminer's layout objects carry the render mode and
non-stroking colour per character.
"""

from __future__ import annotations

import re

MIN_HIDDEN_CHARS = 3
TINY_FONT_PT = 3.0
NEAR_WHITE = 0.92
HIDDEN_TEXT_MARKER = "[Hidden text removed from this document"


def hidden_text_marker(chars: int) -> str:
    return f"{HIDDEN_TEXT_MARKER}: {chars} characters]"


def with_hidden_marker(visible: str, hidden: list[str]) -> str:
    """Visible text plus the marker once anything >= MIN_HIDDEN_CHARS was removed."""
    chars = len(re.sub(r"\s+", "", "".join(hidden)))
    if chars < MIN_HIDDEN_CHARS:
        return visible
    return f"{visible}\n{hidden_text_marker(chars)}".strip()


def luminance(hex_color: str | None) -> float | None:
    """Luminance (0-1) of "#rrggbb" (the leading # optional); None when unreadable."""
    if not hex_color:
        return None
    m = re.fullmatch(r"#?([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})", hex_color.strip())
    if not m:
        return None
    r, g, b = (int(part, 16) / 255 for part in m.groups())
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


_VANISH = re.compile(r'<w:(vanish|webHidden)(\s*/>|\s+w:val="(true|1|on)"\s*/>)')
_COLOR = re.compile(r'<w:color\s+w:val="([0-9A-Fa-f]{6})"')
_SZ = re.compile(r'<w:sz\s+w:val="(\d+)"')
_SHADED = re.compile(r'<w:shd\b[^>]*w:fill="(?!auto|FFFFFF|ffffff)[0-9A-Fa-f]{6}"')
_RUN = re.compile(r"<w:r[ >][\s\S]*?</w:r>")
_RUN_TEXT = re.compile(r"<w:t[^>]*>([^<]*)</w:t>")


def strip_hidden_docx_runs(xml: str) -> tuple[str, list[str]]:
    """Remove the Word runs a reader never sees, returning the cleaned XML and
    the text of everything removed.

    Hidden: ``w:vanish``/``w:webHidden``, near-white colour, or a font under
    TINY_FONT_PT points (``w:sz`` is half-points) — except when the run has
    its own shading (white text on a coloured box is visible).
    """
    hidden: list[str] = []

    def replace_run(match: re.Match[str]) -> str:
        run = match.group(0)
        props_m = re.search(r"<w:rPr>([\s\S]*?)</w:rPr>", run)
        props = props_m.group(1) if props_m else ""
        vanish = _VANISH.search(props) is not None
        color_m = _COLOR.search(props)
        lum = luminance(f"#{color_m.group(1)}") if color_m else None
        white = (lum if lum is not None else 0) >= NEAR_WHITE if color_m else False
        sz_m = _SZ.search(props)
        tiny = sz_m is not None and int(sz_m.group(1)) / 2 < TINY_FONT_PT
        shaded = _SHADED.search(props) is not None
        if vanish or tiny or (white and not shaded):
            texts = [re.sub(r"<[^>]+>", "", t) for t in _RUN_TEXT.findall(run)]
            text = "".join(texts)
            if text.strip():
                hidden.append(text)
            return ""
        return run

    cleaned = _RUN.sub(replace_run, xml)
    return cleaned, hidden
