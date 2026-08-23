import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { BuildFailure, buildDiagnostic } from "./diagnostics.js";
import {
  createTempPath,
  normalizeSlashes,
  removeIfExists,
  repoRelativePath,
  replaceFileAtomically,
  resolveExistingRepoPath,
  writeTextFile,
} from "./filesystem.js";
import type { PaperSize, PreparedPublication } from "./types.js";
import { locateVivliostyle, runVivliostyle } from "./vivliostyle.js";

export interface PdfBuildOptions {
  rootDir: string;
  vivliostyleConfigPath?: string;
  workspaceDir?: string;
  publication: PreparedPublication;
  pdfPath: string;
  paper: PaperSize;
  vivliostylePath?: string;
}

export function vivliostyleConfigStageBasePath(rootDir: string): string {
  return resolve(rootDir, "vivliostyle.config.js");
}

export function buildStagedVivliostyleConfig(
  rootDir: string,
  htmlPath: string,
  pdfPath: string,
  themePath: string,
  workspaceDir: string,
  paper: PaperSize,
): string {
  const entry = normalizeSlashes(repoRelativePath(rootDir, htmlPath));
  const output = normalizeSlashes(repoRelativePath(rootDir, pdfPath));
  const theme = normalizeSlashes(repoRelativePath(rootDir, themePath));
  const workspace = normalizeSlashes(repoRelativePath(rootDir, workspaceDir));
  return `export default ${JSON.stringify({
    entry: [entry],
    entryContext: ".",
    theme,
    size: paper.toUpperCase(),
    workspaceDir: workspace,
    output: { path: output, format: "pdf" },
  }, null, 2)};\n`;
}

function pythonCandidates(): Array<{ command: string; prefix: string[] }> {
  const configured = process.env.PDF_PYTHON;
  if (configured) return [{ command: configured, prefix: [] }];
  return [
    { command: "python", prefix: [] },
    { command: "python3", prefix: [] },
    { command: "py", prefix: ["-3"] },
  ];
}

function verificationScript(rootDir: string): string {
  return resolve(rootDir, "scripts", "verify-pdf.py");
}

function verifyPdf(
  rootDir: string,
  pdfPath: string,
  paper: PaperSize,
  titles: readonly string[],
): void {
  const script = verificationScript(rootDir);
  if (!existsSync(script)) {
    throw new BuildFailure([buildDiagnostic("scripts/verify-pdf.py", "PDF_VERIFY_SCRIPT_MISSING", "The PDF verification script is missing.", "pdf")]);
  }

  let lastError = "";
  for (const candidate of pythonCandidates()) {
    const args = [
      ...candidate.prefix,
      script,
      "--pdf",
      pdfPath,
      "--paper",
      paper,
      ...titles.flatMap((title) => ["--title", title]),
    ];
    const result = spawnSync(candidate.command, args, {
      cwd: rootDir,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    });
    if (result.error) {
      lastError = result.error.message;
      continue;
    }
    if (result.status === 0) {
      if (result.stdout.trim().length > 0) process.stdout.write(`PDF verification: ${result.stdout.trim()}\n`);
      return;
    }
    const detail = [result.stderr, result.stdout].filter((value) => value.trim().length > 0).join(" ").trim();
    throw new BuildFailure([buildDiagnostic(
      pdfPath,
      "PDF_VERIFY_FAILED",
      detail || `PDF verification exited with status ${String(result.status)}.`,
      "pdf",
    )]);
  }

  throw new BuildFailure([buildDiagnostic(
    "scripts/verify-pdf.py",
    "PDF_VERIFY_UNAVAILABLE",
    `Python could not run the PDF verifier${lastError ? `: ${lastError}` : ". Install Python with pypdf or set PDF_PYTHON."}`,
    "pdf",
  )]);
}

export async function buildPdf(options: PdfBuildOptions): Promise<string> {
  const externalPath = options.vivliostylePath ?? process.env.VIVLIOSTYLE_BIN;
  const executable = externalPath
    ? locateVivliostyle(options.rootDir, externalPath)
    : undefined;
  if (executable && (!options.vivliostyleConfigPath || !options.workspaceDir)) {
    throw new BuildFailure([buildDiagnostic(
      "<vivliostyle>",
      "VIVLIOSTYLE_COMPAT_CONFIG_REQUIRED",
      "The explicit external Vivliostyle path requires vivliostyleConfigPath and workspaceDir.",
      "pdf",
    )]);
  }
  if (executable && options.vivliostyleConfigPath) {
    resolveExistingRepoPath(options.rootDir, options.vivliostyleConfigPath, "Vivliostyle config");
  }
  const htmlStage = createTempPath(options.publication.htmlPath, ".html");
  const pdfStage = createTempPath(options.pdfPath, ".pdf");
  const configStage = executable
    ? createTempPath(vivliostyleConfigStageBasePath(options.rootDir), ".js")
    : undefined;
  try {
    writeTextFile(htmlStage, options.publication.html);
    if (configStage && options.workspaceDir) {
      writeTextFile(configStage, buildStagedVivliostyleConfig(
        options.rootDir,
        htmlStage,
        pdfStage,
        options.publication.themePath,
        options.workspaceDir,
        options.paper,
      ));
    }
    await runVivliostyle({
      rootDir: options.rootDir,
      ...(executable ? { executable } : {}),
      ...(configStage ? { configPath: repoRelativePath(options.rootDir, configStage) } : {}),
      htmlPath: repoRelativePath(options.rootDir, htmlStage),
      pdfPath: repoRelativePath(options.rootDir, pdfStage),
      paper: options.paper,
    });
    if (!existsSync(pdfStage)) {
      throw new BuildFailure([buildDiagnostic(pdfStage, "PDF_OUTPUT_MISSING", "Vivliostyle completed without producing a PDF.", "pdf")]);
    }
    verifyPdf(options.rootDir, pdfStage, options.paper, options.publication.chapterTitles);
    replaceFileAtomically(htmlStage, options.publication.htmlPath);
    replaceFileAtomically(pdfStage, options.pdfPath);
    return options.pdfPath;
  } catch (error) {
    removeIfExists(htmlStage);
    removeIfExists(pdfStage);
    if (error instanceof BuildFailure) throw error;
    throw new BuildFailure([buildDiagnostic(
      options.pdfPath,
      "PDF_BUILD_FAILED",
      error instanceof Error ? error.message : "PDF build failed.",
      "pdf",
    )]);
  } finally {
    if (configStage) removeIfExists(configStage);
  }
}
