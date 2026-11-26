"""Document text extraction — the Python shadow of the TS parser's engine.

Parity target: ATSAgent ``src/lib/cv-text.server.ts`` ``extractTextLocal``
(PDF via pdf.js with hidden-text classification, DOCX via unzip + XML run
stripping, everything else as UTF-8 text). Constants and marker semantics
live in ``app.hidden_text``.

PDF engine: pdfminer.six with a small interpreter/aggregator subclass that
restores the two facts pdfminer's layout does not carry by itself:

- render mode (``Tr``): ``do_Tr`` is registered on the interpreter (pdfminer
  dispatches any operator with a ``do_<name>`` method) and stamped onto every
  ``LTChar`` the aggregator creates from then on (render_char override);
- painted background: every filled path/image on the page counts toward the
  page's ``painted_background`` flag (pdf.js semantics: once a non-white
  shape or an image is painted, white text is treated as visible — a scanned
  CV's white OCR layer stays).

Known parity gaps vs pdf.js, tracked for the §9 parity report:
- pdf.js evaluates ``painted_background`` at each show-text op in stream
  order; here it is a per-page aggregate (text drawn before the background
  shape is still treated as covered). The hidden-text fixtures do not draw a
  background after hidden text, so they are unaffected; real corpora diffs
  will size the gap.
"""

from __future__ import annotations

import io
import re
import zipfile
from collections.abc import Callable, Iterable, Sequence
from typing import Any

from pdfminer.converter import PDFPageAggregator
from pdfminer.layout import LAParams, LTChar, LTImage, LTTextLine
from pdfminer.pdfcolor import PDFColorSpace
from pdfminer.pdffont import PDFFont
from pdfminer.pdfinterp import (
    PDFGraphicState,
    PDFPageInterpreter,
    PDFResourceManager,
    PDFStackT,
)
from pdfminer.pdfpage import PDFPage
from pdfminer.pdftypes import PDFStream
from pdfminer.psparser import PSLiteral
from pdfminer.utils import Matrix, PathSegment

from app.hidden_text import (
    NEAR_WHITE,
    TINY_FONT_PT,
    with_hidden_marker,
)
from app.hidden_text import (
    strip_hidden_docx_runs as _strip_hidden_docx_runs,
)

MAX_PAGES = 30
MAX_DOCX_XML_BYTES = 20_000_000
_WS = re.compile(r"\s+")


def extract_text(filename: str, content: bytes) -> str:
    """Dispatch on the file name — same rules as extractTextLocal."""
    name = filename.lower()
    if name.endswith(".pdf"):
        return _pdf_text(content)
    if name.endswith(".docx"):
        return _docx_text(content)
    return content.decode("utf-8", errors="replace").strip()


# --------------------------------------------------------------------- DOCX


def _docx_text(content: bytes) -> str:
    """Unzip word/document.xml, strip hidden runs, decode entities — the exact
    regex pipeline of the TS extractor."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            xml_bytes = zf.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError):
        return ""
    if len(xml_bytes) > MAX_DOCX_XML_BYTES:
        return ""
    xml = xml_bytes.decode("utf-8", errors="replace")
    visible_xml, hidden = _strip_hidden_docx_runs(xml)
    text = visible_xml.replace("</w:p>", "\n").strip()
    text = re.sub(r"<[^>]+>", " ", text)
    for entity, char in (("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">")):
        text = text.replace(entity, char)
    text = re.sub(r"[ \t]+", " ", text).strip()
    return with_hidden_marker(text, hidden)


# ---------------------------------------------------------------------- PDF


class _ShadowLTChar(LTChar):
    """LTChar plus the render mode (Tr) active when it was drawn."""

    rendermode: int = 0


class ShadowPageAggregator(PDFPageAggregator):
    """PDFPageAggregator whose characters remember their render mode."""

    def __init__(self, rsrcmgr: PDFResourceManager, laparams: LAParams | None = None) -> None:
        super().__init__(rsrcmgr, laparams=laparams)
        self._rendermode = 0
        self.painted_background = False
        self.painted_image = False

    def set_rendermode(self, rendermode: int) -> None:
        self._rendermode = rendermode

    def paint_path(
        self,
        gstate: PDFGraphicState,
        stroke: bool,
        fill: bool,
        evenodd: bool,
        path: Sequence[PathSegment],
    ) -> None:
        super().paint_path(gstate, stroke, fill, evenodd, path)
        # A filled, non-white shape makes white text on top of it visible.
        if fill:
            lum = _color_luminance(gstate.ncolor)
            if lum is not None and lum < NEAR_WHITE:
                self.painted_background = True

    def render_image(self, name: str, stream: PDFStream) -> None:
        self.painted_image = True
        super().render_image(name, stream)

    def render_char(
        self,
        matrix: Matrix,
        font: PDFFont,
        fontsize: float,
        scaling: float,
        rise: float,
        cid: int,
        ncs: PDFColorSpace,
        graphicstate: PDFGraphicState,
    ) -> float:
        try:
            text = font.to_unichr(cid)
            assert isinstance(text, str)
        except Exception:  # noqa: BLE001 — undefined cid: same placeholder as base
            text = f"(cid:{cid})"
        textwidth = font.char_width(cid)
        textdisp = font.char_disp(cid)
        item = _ShadowLTChar(
            matrix,
            font,
            fontsize,
            scaling,
            rise,
            text,
            textwidth,
            textdisp,
            ncs,
            graphicstate,
        )
        item.rendermode = self._rendermode
        self.cur_item.add(item)
        return item.adv


class ShadowInterpreter(PDFPageInterpreter):
    """PDFPageInterpreter with the Tr operator registered (pdfminer dispatches
    any operator with a do_<name> method)."""

    def do_Tr(self, mode: PDFStackT) -> None:
        value = mode[0] if isinstance(mode, list) else mode
        try:
            rendermode = int(value)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return
        device = self.device
        if hasattr(device, "set_rendermode"):
            device.set_rendermode(rendermode)


def _color_luminance(color: Any) -> float | None:
    """Luminance of a pdfminer colour (1/3/4-component tuple or ColorSpace-less)."""
    if color is None or isinstance(color, PSLiteral):
        return None
    try:
        values = [float(v) for v in color]
    except (TypeError, ValueError):
        return None
    if not values:
        return None
    if len(values) == 1:
        r = g = b = float(values[0])
    elif len(values) == 3:
        r, g, b = (float(v) for v in values)
    elif len(values) == 4:
        c, m, y, k = (float(v) for v in values)
        r, g, b = (1 - min(1, c + k), 1 - min(1, m + k), 1 - min(1, y + k))
    else:
        return None
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _walk_lines(obj: Any, visit: Callable[[LTTextLine], None]) -> None:
    """Visit every LTTextLine in the layout tree."""

    if isinstance(obj, LTTextLine):
        visit(obj)
        return
    try:
        children: Iterable[object] = iter(obj)
    except TypeError:
        return
    for child in children:
        _walk_lines(child, visit)


def _page_facts(page: object) -> tuple[dict[LTTextLine, list[_ShadowLTChar]], bool]:
    lines: dict[LTTextLine, list[_ShadowLTChar]] = {}
    images = False

    def visit(line: LTTextLine) -> None:
        chars: list[_ShadowLTChar] = []

        def collect(obj: Any) -> None:
            nonlocal images
            if isinstance(obj, _ShadowLTChar):
                chars.append(obj)
            elif isinstance(obj, LTImage):
                images = True

        def walk(obj: Any) -> None:
            try:
                children: Iterable[object] = iter(obj)
            except TypeError:
                return
            for child in children:
                collect(child)
                walk(child)

        walk(line)
        lines[line] = chars

    _walk_lines(page, visit)
    return lines, images


def _pdf_text(content: bytes) -> str:
    """Per-line classification with the TS thresholds, then the same
    whitespace collapse and marker semantics. Raises ValueError when the
    document cannot be parsed at all (the worker answers 422)."""
    if not content:
        return ""
    hidden: list[str] = []
    pages: list[str] = []
    page_count = 0
    try:
        rsrcmgr = PDFResourceManager()
        laparams = LAParams()
        device = ShadowPageAggregator(rsrcmgr, laparams=laparams)
        interpreter = ShadowInterpreter(rsrcmgr, device)
        for page in PDFPage.get_pages(io.BytesIO(content)):
            page_count += 1
            if page_count > MAX_PAGES:
                return ""
            device.set_rendermode(0)
            device.painted_background = False
            device.painted_image = False
            interpreter.process_page(page)
            layout = device.get_result()
            lines, images = _page_facts(layout)
            painted_background = device.painted_background or device.painted_image or images
            visible_lines: list[str] = []
            for line, chars in lines.items():
                if not chars:
                    continue
                visible_chars: list[str] = []
                line_hidden: list[str] = []
                for ch in chars:
                    text = ch.get_text()
                    if not text.strip():
                        continue
                    invisible = ch.rendermode in (3, 7) and not painted_background
                    lum = _color_luminance(
                        ch.graphicstate.ncolor if ch.graphicstate else None
                    )
                    white = lum is not None and lum >= NEAR_WHITE
                    tiny = float(ch.size) < TINY_FONT_PT
                    if invisible or white or tiny:
                        line_hidden.append(text)
                    else:
                        visible_chars.append(text)
                if visible_chars and not line_hidden:
                    visible_lines.append(line.get_text())
                elif visible_chars:
                    visible_lines.append("".join(visible_chars))
                hidden.extend(line_hidden)
            pages.append(_WS.sub(" ", "\n".join(visible_lines)).strip())
            # kept for parity with the TS marker semantics
    except Exception as e:  # noqa: BLE001 — unparseable documents are a 422
        raise ValueError("could not parse") from e
    text = _WS.sub(" ", " ".join(pages)).strip()
    return with_hidden_marker(text, hidden)
