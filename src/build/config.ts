import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

import { buildDiagnostic } from "./diagnostics.js";
import type { BuildConfig, PaperSize } from "./types.js";

export interface ConfigReadSuccess {
  ok: true;
  config: BuildConfig;
}

export interface ConfigReadFailure {
  ok: false;
  diagnostics: ReturnType<typeof buildDiagnostic>[];
}

export type ConfigReadResult = ConfigReadSuccess | ConfigReadFailure;

const CONFIG_KEYS = new Set([
  "title",
  "chapters",
  "themes",
  "output",
  "vivliostyleConfig",
  "workspaceDir",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRelativePath(value: string): boolean {
  return !value.startsWith("/")
    && !/^[A-Za-z]:[\\/]/u.test(value)
    && !value.includes("\0")
    && !/[?*\[\]]/u.test(value);
}

function validatePath(
  value: unknown,
  configPath: string,
  field: string,
  diagnostics: ReturnType<typeof buildDiagnostic>[],
): value is string {
  if (!isNonEmptyString(value) || !isRelativePath(value)) {
    diagnostics.push(buildDiagnostic(
      configPath,
      "CONFIG_PATH_INVALID",
      `${field} must be a non-empty repository-relative path without glob characters.`,
    ));
    return false;
  }
  return true;
}

function readPaperPath(
  value: unknown,
  configPath: string,
  field: string,
  diagnostics: ReturnType<typeof buildDiagnostic>[],
): Record<PaperSize, string> | undefined {
  if (!isRecord(value)) {
    diagnostics.push(buildDiagnostic(configPath, "CONFIG_FIELD_REQUIRED", `${field} must be an object with a5 and a4 paths.`));
    return undefined;
  }
  const result = {} as Record<PaperSize, string>;
  for (const paper of ["a5", "a4"] as const) {
    const candidate = value[paper];
    if (validatePath(candidate, configPath, `${field}.${paper}`, diagnostics)) result[paper] = candidate;
  }
  return Object.keys(result).length === 2 ? result : undefined;
}

function jsonErrorPosition(message: string, source: string): { line: number; column: number } {
  const positionMatch = /position\s+(\d+)/iu.exec(message);
  const offset = positionMatch?.[1] === undefined ? 0 : Number(positionMatch[1]);
  const before = source.slice(0, Number.isFinite(offset) ? offset : 0);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: before.length - lastNewline };
}

export function readBuildConfig(configPath: string): ConfigReadResult {
  const diagnostics: ReturnType<typeof buildDiagnostic>[] = [];
  let source: string;
  try {
    source = readFileSync(configPath, "utf8").replace(/^\uFEFF/u, "");
  } catch (error) {
    diagnostics.push(buildDiagnostic(
      configPath,
      "CONFIG_FILE_MISSING",
      `Build configuration could not be read${error instanceof Error ? `: ${error.message}` : "."}`,
      "build",
    ));
    return { ok: false, diagnostics };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    const position = jsonErrorPosition(error instanceof Error ? error.message : "", source);
    diagnostics.push(buildDiagnostic(
      configPath,
      "CONFIG_JSON_INVALID",
      error instanceof Error ? error.message : "Build configuration is not valid JSON.",
      "build",
      position.line,
      position.column,
    ));
    return { ok: false, diagnostics };
  }

  if (!isRecord(parsed)) {
    diagnostics.push(buildDiagnostic(configPath, "CONFIG_OBJECT_REQUIRED", "Build configuration must be a JSON object."));
    return { ok: false, diagnostics };
  }

  for (const key of Object.keys(parsed)) {
    if (!CONFIG_KEYS.has(key)) diagnostics.push(buildDiagnostic(configPath, "CONFIG_UNKNOWN_KEY", `Unknown build configuration key: ${key}.`));
  }

  const title = parsed.title;
  if (!isNonEmptyString(title)) diagnostics.push(buildDiagnostic(configPath, "CONFIG_FIELD_REQUIRED", "title must be a non-empty string."));

  const chaptersValue = parsed.chapters;
  const chapters: string[] = [];
  if (!Array.isArray(chaptersValue) || chaptersValue.length === 0) {
    diagnostics.push(buildDiagnostic(configPath, "CONFIG_CHAPTERS_REQUIRED", "chapters must be a non-empty ordered array of paths."));
  } else {
    const seen = new Set<string>();
    for (const [index, chapter] of chaptersValue.entries()) {
      if (!validatePath(chapter, configPath, `chapters[${index}]`, diagnostics)) continue;
      if (seen.has(chapter)) diagnostics.push(buildDiagnostic(configPath, "CONFIG_CHAPTER_DUPLICATE", `chapters contains the same path more than once: ${chapter}.`));
      seen.add(chapter);
      chapters.push(chapter);
    }
  }

  const themes = readPaperPath(parsed.themes, configPath, "themes", diagnostics);
  const output = parsed.output;
  let htmlOutput: string | undefined;
  let pdfOutput: Record<PaperSize, string> | undefined;
  if (!isRecord(output)) {
    diagnostics.push(buildDiagnostic(configPath, "CONFIG_FIELD_REQUIRED", "output must be an object with html and pdf paths."));
  } else {
    if (validatePath(output.html, configPath, "output.html", diagnostics)) htmlOutput = output.html;
    pdfOutput = readPaperPath(output.pdf, configPath, "output.pdf", diagnostics);
  }

  const vivliostyleConfig = parsed.vivliostyleConfig === undefined
    ? "vivliostyle.config.js"
    : validatePath(parsed.vivliostyleConfig, configPath, "vivliostyleConfig", diagnostics)
      ? parsed.vivliostyleConfig
      : undefined;
  const workspaceDir = parsed.workspaceDir === undefined
    ? "generated/.vivliostyle"
    : validatePath(parsed.workspaceDir, configPath, "workspaceDir", diagnostics)
      ? parsed.workspaceDir
      : undefined;

  if (diagnostics.length > 0 || !isNonEmptyString(title) || !themes || !htmlOutput || !pdfOutput || !vivliostyleConfig || !workspaceDir) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    config: {
      title,
      chapters,
      themes,
      output: { html: htmlOutput, pdf: pdfOutput },
      vivliostyleConfig,
      workspaceDir,
    },
  };
}

export function defaultConfigPath(): string {
  return "build.config.json";
}

export function isConfigPath(value: string): boolean {
  return extname(value).toLowerCase() === ".json" || basename(value).toLowerCase().includes("config");
}
