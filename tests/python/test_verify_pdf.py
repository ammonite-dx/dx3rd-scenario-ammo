"""Regression tests for PDF text comparison compatibility."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[2] / "scripts" / "verify-pdf.py"
SPEC = importlib.util.spec_from_file_location("verify_pdf", MODULE_PATH)
if SPEC is None or SPEC.loader is None:  # pragma: no cover - test setup failure
    raise RuntimeError(f"Could not load {MODULE_PATH}")
VERIFY_PDF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY_PDF)


class VerifyPdfTextComparisonTests(unittest.TestCase):
    def test_pinned_pdf_dependencies_are_importable(self) -> None:
        import pdfplumber
        import pypdf

        self.assertTrue(pypdf.__version__)
        self.assertTrue(pdfplumber.__version__)

    def test_nfkc_maps_cjk_radical_supplement_to_standard_kanji(self) -> None:
        self.assertEqual(VERIFY_PDF.normalize_for_comparison("\u2fac\u2fb3"), "雨音")

    def test_title_matching_normalizes_extracted_and_expected_text(self) -> None:
        self.assertEqual(VERIFY_PDF.find_missing_titles("開幕 \u2fac\u2fb3", ["雨音"]), [])
        self.assertEqual(VERIFY_PDF.find_missing_titles("開幕 雨音", ["\u2fac\u2fb3"]), [])

    def test_xml_error_marker_detection_survives_normalized_text(self) -> None:
        text = "\u2fac\u2fb3\nThis page contains the following errors:\nStart tag expected"
        self.assertEqual(
            VERIFY_PDF.find_error_page_markers(text),
            [
                "This page contains the following errors:",
                "Start tag expected",
            ],
        )


if __name__ == "__main__":
    unittest.main()
