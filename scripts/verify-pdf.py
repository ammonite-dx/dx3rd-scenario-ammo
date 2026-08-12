"""Verify a generated scenario PDF with the bundled pypdf/pdfplumber stack."""

from __future__ import annotations

import argparse
import json
import logging
import sys
import unicodedata
from pathlib import Path


ERROR_PAGE_MARKERS = (
    "This page contains the following errors:",
    "Below is a rendering of the page up to the first error.",
    "Start tag expected",
)


def normalize_for_comparison(value: str) -> str:
    """Normalize extracted and expected text before semantic comparisons."""

    return unicodedata.normalize("NFKC", value)


def find_error_page_markers(text: str) -> list[str]:
    normalized_text = normalize_for_comparison(text).casefold()
    return [
        marker
        for marker in ERROR_PAGE_MARKERS
        if normalize_for_comparison(marker).casefold() in normalized_text
    ]


def find_missing_titles(text: str, titles: list[str]) -> list[str]:
    normalized_text = normalize_for_comparison(text)
    return [
        title
        for title in titles
        if normalize_for_comparison(title) not in normalized_text
    ]


def expected_size_mm(paper: str) -> tuple[float, float]:
    return {"a5": (148.0, 210.0), "a4": (210.0, 297.0)}[paper]


def box_mm(box) -> tuple[float, float]:
    return ((float(box.right) - float(box.left)) * 25.4 / 72.0,
            (float(box.top) - float(box.bottom)) * 25.4 / 72.0)


def close(value: float, expected: float, tolerance: float = 1.5) -> bool:
    return abs(value - expected) <= tolerance


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--paper", choices=("a5", "a4"), required=True)
    parser.add_argument("--title", action="append", default=[])
    args = parser.parse_args()

    try:
        from pypdf import PdfReader
    except Exception as exc:  # pragma: no cover - environment dependent
        print(f"pypdf is required for PDF verification: {exc}", file=sys.stderr)
        return 2

    pdf_path = Path(args.pdf)
    if not pdf_path.is_file() or pdf_path.stat().st_size == 0:
        print(f"PDF does not exist or is empty: {pdf_path}", file=sys.stderr)
        return 2

    try:
        reader = PdfReader(str(pdf_path))
        pages = reader.pages
        if len(pages) == 0:
            print("PDF has no pages.", file=sys.stderr)
            return 2

        expected_w, expected_h = expected_size_mm(args.paper)
        extracted_pages: list[str] = []
        boxes: list[tuple[float, float]] = []
        for index, page in enumerate(pages, start=1):
            box = page.trimbox if "/TrimBox" in page else page.mediabox
            width, height = box_mm(box)
            boxes.append((width, height))
            # Some engines include the CSS bleed in MediaBox while keeping the
            # trim box at the requested paper size. Accept that documented
            # representation but reject another trim size or orientation.
            if not (close(width, expected_w) and close(height, expected_h)):
                media_w, media_h = box_mm(page.mediabox)
                bleed_w = expected_w + 6.0
                bleed_h = expected_h + 6.0
                if not (close(media_w, bleed_w) and close(media_h, bleed_h)):
                    print(
                        f"Page {index} has {width:.3f} x {height:.3f} mm; expected "
                        f"{expected_w:.3f} x {expected_h:.3f} mm.",
                        file=sys.stderr,
                    )
                    return 2
            text = page.extract_text() or ""
            if not text.strip():
                print(f"Page {index} has no extractable text.", file=sys.stderr)
                return 2
            extracted_pages.append(text)

        all_text = "\n".join(extracted_pages)
        try:
            import pdfplumber

            pdfminer_loggers = (
                logging.getLogger("pdfminer"),
                logging.getLogger("pdfminer.pdffont"),
            )
            previous_levels = [logger.level for logger in pdfminer_loggers]
            for logger in pdfminer_loggers:
                logger.setLevel(logging.ERROR)
            try:
                with pdfplumber.open(str(pdf_path)) as pdf:
                    fallback = "\n".join((page.extract_text() or "") for page in pdf.pages)
            finally:
                for logger, level in zip(pdfminer_loggers, previous_levels):
                    logger.setLevel(level)
            if len(fallback) > len(all_text):
                all_text = fallback
        except Exception:
            pass

        error_markers = find_error_page_markers(all_text)
        if error_markers:
            print(
                "Vivliostyle/XML error page detected in extracted PDF text: "
                f"{error_markers}",
                file=sys.stderr,
            )
            return 2

        missing = find_missing_titles(all_text, args.title)
        if missing:
            print(f"Missing chapter titles in extracted PDF text: {missing}", file=sys.stderr)
            return 2

        print(json.dumps({
            "pages": len(pages),
            "paper": args.paper,
            "box_mm": [[round(width, 3), round(height, 3)] for width, height in boxes],
            "text_chars": len(all_text),
            "titles": args.title,
        }, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(f"PDF inspection failed: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
