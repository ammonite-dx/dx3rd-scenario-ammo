import type { DataDiagnostic } from "../data/types.js";
import type { Diagnostic } from "../core/types.js";
import type { HtmlDiagnostic } from "../html/types.js";

export type PaperSize = "a5" | "a4";

export interface BuildConfig {
  title: string;
  chapters: string[];
  themes: Record<PaperSize, string>;
  output: {
    html: string;
    pdf: Record<PaperSize, string>;
  };
  vivliostyleConfig: string;
  workspaceDir: string;
}

export interface BuildDiagnostic {
  category: "build" | "security" | "cli" | "pdf";
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  severity: "error";
}

export type AnyBuildDiagnostic =
  | BuildDiagnostic
  | Diagnostic
  | DataDiagnostic
  | HtmlDiagnostic;

export interface PreparedChapter {
  path: string;
  title: string;
  html: string;
}

export interface PreparedPublication {
  title: string;
  paper: PaperSize;
  themePath: string;
  htmlPath: string;
  html: string;
  chapterTitles: string[];
  chapters: PreparedChapter[];
}

export interface BuildResult {
  publication: PreparedPublication;
  outputPath: string;
}
