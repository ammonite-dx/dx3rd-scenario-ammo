import { dirname, relative } from "node:path";

import {
  parseScenarioMarkdown,
  renderScenarioHtmlFragment,
  resolveEnemyDataReferences,
} from "../index.js";
import type { ScenarioDocument } from "../core/types.js";
import type { ResolvedEnemyDataReference } from "../data/types.js";
import { BuildFailure } from "./diagnostics.js";
import {
  createTempPath,
  normalizeSlashes,
  readRepoFile,
  removeIfExists,
  replaceFileAtomically,
  resolveExistingRepoPath,
  resolveOutputRepoPath,
  writeTextFile,
} from "./filesystem.js";
import type { BuildConfig, BuildResult, PaperSize, PreparedChapter, PreparedPublication } from "./types.js";
import { buildDiagnostic } from "./diagnostics.js";

const HTML_CONTRACT = "dx3rd-scenario/v1";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function encodeHrefPath(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function themeHref(htmlPath: string, themePath: string): string {
  const relativePath = normalizeSlashes(relative(dirname(htmlPath), themePath));
  const safePath = relativePath.length > 0 ? relativePath : themePath.split(/[\\/]/u).pop() ?? "theme.css";
  return safePath.startsWith(".") ? encodeHrefPath(safePath) : `./${encodeHrefPath(safePath)}`;
}

function safeLoader(rootDir: string): (candidatePath: string) => string | undefined {
  return (candidatePath: string): string | undefined => {
    try {
      return readRepoFile(rootDir, candidatePath, "Referenced enemy YAML").source;
    } catch (error) {
      if (error instanceof BuildFailure) {
        const diagnostic = error.diagnostics[0];
        if (diagnostic?.code === "FILE_MISSING") return undefined;
        throw new Error(diagnostic?.message ?? "Referenced YAML path is outside the repository root.");
      }
      throw error;
    }
  };
}

function renderChapter(
  document: ScenarioDocument,
  references: readonly ResolvedEnemyDataReference[],
): string {
  const rendered = renderScenarioHtmlFragment(document, { references });
  if (!rendered.ok) throw new BuildFailure(rendered.diagnostics);
  return rendered.html;
}

function prepareChapter(
  rootDir: string,
  chapterPath: string,
): PreparedChapter {
  const file = readRepoFile(rootDir, chapterPath, "Chapter Markdown");
  const parsed = parseScenarioMarkdown(file.source, file.relativePath);
  if (!parsed.ok) throw new BuildFailure(parsed.diagnostics);

  const resolved = resolveEnemyDataReferences(parsed.document, {
    load: safeLoader(rootDir),
  });
  if (!resolved.ok) throw new BuildFailure(resolved.diagnostics);

  return {
    path: file.relativePath,
    title: parsed.document.chapterTitle,
    html: renderChapter(parsed.document, resolved.references),
  };
}

function renderPublicationDocument(
  rootDir: string,
  config: BuildConfig,
  paper: PaperSize,
  htmlPath: string,
  themePath: string,
  chapters: readonly PreparedChapter[],
): string {
  const firstChapter = readRepoFile(rootDir, config.chapters[0] ?? "", "Chapter Markdown");
  const firstParsed = parseScenarioMarkdown(firstChapter.source, firstChapter.relativePath);
  if (!firstParsed.ok) throw new BuildFailure(firstParsed.diagnostics);
  const lang = firstParsed.document.frontmatter.lang ?? "ja";
  const href = themeHref(htmlPath, themePath);
  const title = escapeHtml(config.title);
  const body = chapters.map((chapter) => chapter.html).join("\n");
  return [
    "<!doctype html>",
    `<html lang="${escapeHtml(lang)}" data-html-contract="${HTML_CONTRACT}" data-paper="${paper}">`,
    "<head>",
    "  <meta charset=\"utf-8\">",
    `  <title>${title}</title>`,
    `  <link rel="stylesheet" href="${href}">`,
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

export function preparePublication(
  rootDir: string,
  config: BuildConfig,
  paper: PaperSize,
  htmlPathOverride?: string,
): PreparedPublication {
  const htmlPath = resolveOutputRepoPath(
    rootDir,
    htmlPathOverride ?? config.output.html,
    "HTML output",
  );
  const themePath = resolveExistingRepoPath(rootDir, config.themes[paper], `${paper.toUpperCase()} theme`);
  const chapters = config.chapters.map((chapterPath) => prepareChapter(rootDir, chapterPath));
  const html = renderPublicationDocument(rootDir, config, paper, htmlPath, themePath, chapters);
  return {
    title: config.title,
    paper,
    themePath,
    htmlPath,
    html,
    chapterTitles: chapters.map((chapter) => chapter.title),
    chapters,
  };
}

export function writePreparedHtml(publication: PreparedPublication): BuildResult {
  const stagedPath = createTempPath(publication.htmlPath, ".html");
  try {
    writeTextFile(stagedPath, publication.html);
    replaceFileAtomically(stagedPath, publication.htmlPath);
  } catch (error) {
    removeIfExists(stagedPath);
    throw new BuildFailure([buildDiagnostic(
      publication.htmlPath,
      "HTML_OUTPUT_WRITE_FAILED",
      error instanceof Error ? error.message : "HTML output could not be written.",
    )]);
  }
  return { publication, outputPath: publication.htmlPath };
}
