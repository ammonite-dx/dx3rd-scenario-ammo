import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  extname,
  join,
  relative,
  resolve,
} from "node:path";

import { parseDocument, stringify } from "yaml";

import type { Diagnostic, ParseResult } from "../core/types.js";
import { parseScenarioMarkdown } from "../core/parser.js";
import type { DataDiagnostic, EnemyDataDocument, EnemyDataParseResult } from "../data/types.js";
import { parseEnemyDataYaml } from "../data/enemy.js";
import { resolveEnemyDataReferences } from "../data/references.js";
import { isWithin, normalizeSlashes, repositoryRoot } from "../build/filesystem.js";
import type {
  GiftInventory,
  GiftMigrationOptions,
  GiftMigrationReport,
  GiftMigrationRunResult,
  GiftMarkdownMigrationOptions,
  GiftMarkdownMigrationResult,
  MigrationDiagnostic,
  MigrationFileReport,
  MigrationFileStatus,
  ReplacementRuleInventory,
} from "./types.js";

const EXCLUDED_DIRECTORIES = new Set(["node_modules", ".vivliostyle"]);
const GENERATED_EXTENSIONS = new Set([".html", ".htm", ".pdf"]);
const PROTECTED_OUTPUT_ROOTS = ["gift", "manuscripts", "data"] as const;
const LEGACY_BLOCK_MAP: Readonly<Record<string, string>> = {
  serif: "dialogue",
  rp: "roleplay",
  select: "choice",
  check: "check",
  info: "info",
  "e-lois": "e-lois",
  battle: "battle",
};
const FLATTENED_BLOCKS = new Set(["trailer", "toc"]);
const KNOWN_NARRATIVE_BLOCKS = new Set(Object.values(LEGACY_BLOCK_MAP));
const OLD_DESCRIPTION_LABEL = /^\[([^\]\r\n]+)\][ \t]+(.+?)\s*$/u;
const OLD_FIELD_LABEL = /^\[([^\]\r\n]+)\][ \t]*(.*)$/u;
const RUBY_PATTERN = /\{([^{}\n|]+)\|([^{}\n|]+)\}/gu;
const IMAGE_ATTRIBUTE_PATTERN = /(!\[[^\]]*\]\([^)]*\))\{([^{}\n]+)\}/gu;
const INLINE_LINK_PATTERN = /\[([^\]\r\n]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
const SAFE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

interface WalkedFile {
  absolutePath: string;
  relativePath: string;
  size: number;
}

interface LegacyFrontmatter {
  openingLine: number;
  closingLine: number;
  contentStartLine: number;
  values: Record<string, unknown>;
}

interface LegacyBlock {
  name: string;
  title: string;
  startLine: number;
  closeLine?: number;
  bodyStartLine: number;
  bodyEndLine: number;
}

interface LegacyScan {
  blocks: LegacyBlock[];
  diagnostics: MigrationDiagnostic[];
  lineBlockNames: Array<string | undefined>;
}

interface SourceDocument {
  source: string;
  sourceFile: string;
  lines: string[];
  frontmatter?: LegacyFrontmatter;
  scan: LegacyScan;
  id?: string;
  lang?: string;
  sectionTitle?: string;
  sectionKicker?: string;
  chapterTitle?: string;
}

interface EnemyPageInfo {
  sourceFile: string;
  outputFile: string;
  dataPath: string;
  displayName: string;
  yamlAvailable: boolean;
}

interface EnemyExtraction {
  yaml?: string;
  data?: EnemyDataDocument;
  dataPath: string;
  displayName: string;
  diagnostics: MigrationDiagnostic[];
}

interface TransformedFile {
  sourceDocument: SourceDocument;
  migration: GiftMarkdownMigrationResult;
  enemy?: EnemyExtraction;
}

export class GiftMigrationFailure extends Error {
  readonly diagnostics: MigrationDiagnostic[];

  constructor(diagnostics: MigrationDiagnostic[]) {
    super(diagnostics.map((diagnostic) => diagnostic.message).join("; ") || "Gift migration failed.");
    this.name = "GiftMigrationFailure";
    this.diagnostics = diagnostics;
  }
}

function migrationDiagnostic(
  file: string,
  code: string,
  message: string,
  severity: MigrationDiagnostic["severity"],
  line = 1,
  column = 1,
  category: MigrationDiagnostic["category"] = "markdown",
  sourceFile?: string,
  outputFile?: string,
): MigrationDiagnostic {
  const diagnostic: MigrationDiagnostic = {
    category,
    code,
    message,
    file,
    line: Math.max(1, line),
    column: Math.max(1, column),
    severity,
  };
  if (sourceFile !== undefined) diagnostic.sourceFile = sourceFile;
  if (outputFile !== undefined) diagnostic.outputFile = outputFile;
  return diagnostic;
}

function addDiagnostic(
  diagnostics: MigrationDiagnostic[],
  file: string,
  code: string,
  message: string,
  severity: MigrationDiagnostic["severity"],
  line = 1,
  column = 1,
  category: MigrationDiagnostic["category"] = "markdown",
  sourceFile?: string,
  outputFile?: string,
): void {
  diagnostics.push(migrationDiagnostic(file, code, message, severity, line, column, category, sourceFile, outputFile));
}

function sortDiagnostics(diagnostics: MigrationDiagnostic[]): MigrationDiagnostic[] {
  return diagnostics.sort((left, right) => {
    if (left.file !== right.file) return left.file.localeCompare(right.file);
    if (left.line !== right.line) return left.line - right.line;
    if (left.column !== right.column) return left.column - right.column;
    return left.code.localeCompare(right.code);
  });
}

function relativeRepoPath(rootDir: string, absolutePath: string): string {
  return normalizeSlashes(relative(rootDir, absolutePath));
}

function normalizeRelativePath(directory: string, target: string): string {
  const segments = normalizeSlashes(join(directory, target)).split("/");
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join("/");
}

function isAbsoluteInput(value: string): boolean {
  return value.startsWith("/") || value.startsWith("\\") || /^[A-Za-z]:[\\/]/u.test(value);
}

function existingAncestor(path: string): string {
  let candidate = path;
  while (!existsSync(candidate)) {
    const parent = dirname(candidate);
    if (parent === candidate) return candidate;
    candidate = parent;
  }
  return candidate;
}

function safeRepoDirectory(rootDir: string, inputPath: string, label: string): string {
  if (isAbsoluteInput(inputPath)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_PATH_ABSOLUTE", `${label} must be repository-relative.`, "error", 1, 1, "safety"),
    ]);
  }
  const lexical = resolve(rootDir, inputPath);
  if (!isWithin(rootDir, lexical)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_PATH_TRAVERSAL", `${label} escapes the repository root.`, "error", 1, 1, "safety"),
    ]);
  }
  if (!existsSync(lexical)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_SOURCE_MISSING", `${label} does not exist: ${normalizeSlashes(inputPath)}.`, "error", 1, 1, "safety"),
    ]);
  }
  const actual = realpathSync(lexical);
  if (!isWithin(rootDir, actual)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_SYMLINK_ROOT_ESCAPE", `${label} resolves outside the repository root.`, "error", 1, 1, "safety"),
    ]);
  }
  if (!statSync(actual).isDirectory()) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_DIRECTORY_REQUIRED", `${label} must be a directory.`, "error", 1, 1, "safety"),
    ]);
  }
  return actual;
}

function safeOutputPath(rootDir: string, inputPath: string, sourceRoot: string, dryRun: boolean): string {
  if (isAbsoluteInput(inputPath)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_OUTPUT_ABSOLUTE", "Output must be repository-relative.", "error", 1, 1, "safety"),
    ]);
  }
  const lexical = resolve(rootDir, inputPath);
  if (!isWithin(rootDir, lexical) || lexical === rootDir) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_OUTPUT_TRAVERSAL", "Output must be a non-root path inside the repository.", "error", 1, 1, "safety"),
    ]);
  }
  for (const protectedRoot of PROTECTED_OUTPUT_ROOTS) {
    const protectedPath = resolve(rootDir, protectedRoot);
    if (isWithin(protectedPath, lexical)) {
      throw new GiftMigrationFailure([
        migrationDiagnostic(inputPath, "MIGRATION_PROTECTED_OUTPUT", `Output must not write under ${protectedRoot}/.`, "error", 1, 1, "safety"),
      ]);
    }
  }
  if (isWithin(sourceRoot, lexical) || isWithin(lexical, sourceRoot)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_SOURCE_OUTPUT_OVERLAP", "Source and output paths must not overlap.", "error", 1, 1, "safety"),
    ]);
  }
  if (existsSync(lexical)) {
    const actualTarget = realpathSync(lexical);
    if (!isWithin(rootDir, actualTarget)) {
      throw new GiftMigrationFailure([
        migrationDiagnostic(inputPath, "MIGRATION_OUTPUT_SYMLINK_ESCAPE", "Output resolves outside the repository root.", "error", 1, 1, "safety"),
      ]);
    }
    if (isWithin(sourceRoot, actualTarget) || isWithin(actualTarget, sourceRoot)) {
      throw new GiftMigrationFailure([
        migrationDiagnostic(inputPath, "MIGRATION_SOURCE_OUTPUT_OVERLAP", "Source and output paths must not overlap after symlink resolution.", "error", 1, 1, "safety"),
      ]);
    }
  }
  if (!dryRun && existsSync(lexical)) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_OUTPUT_EXISTS", "Output directory already exists; refusing to overwrite it.", "error", 1, 1, "safety"),
    ]);
  }
  const ancestor = existingAncestor(lexical);
  if (!isWithin(rootDir, realpathSync(ancestor))) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(inputPath, "MIGRATION_OUTPUT_SYMLINK_ESCAPE", "Output parent resolves outside the repository root.", "error", 1, 1, "safety"),
    ]);
  }
  return lexical;
}

function walkSourceFiles(rootDir: string, sourceBoundary: string, current: string, files: WalkedFile[], excludedDirectories: string[], excludedGeneratedFiles: string[]): void {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const absolutePath = join(current, entry.name);
    const relativePath = relativeRepoPath(rootDir, absolutePath);
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) {
      excludedDirectories.push(relativePath);
      continue;
    }
    const actualPath = realpathSync(absolutePath);
    if (!isWithin(rootDir, actualPath)) {
      throw new GiftMigrationFailure([
        migrationDiagnostic(relativePath, "MIGRATION_SYMLINK_ROOT_ESCAPE", "A source entry resolves outside the repository root.", "error", 1, 1, "safety"),
      ]);
    }
    if (!isWithin(sourceBoundary, actualPath)) {
      throw new GiftMigrationFailure([
        migrationDiagnostic(relativePath, "MIGRATION_SYMLINK_SOURCE_ESCAPE", "A source entry resolves outside the selected source directory.", "error", 1, 1, "safety"),
      ]);
    }
    if (entry.isDirectory() || statSync(actualPath).isDirectory()) {
      walkSourceFiles(rootDir, sourceBoundary, absolutePath, files, excludedDirectories, excludedGeneratedFiles);
      continue;
    }
    if (!entry.isFile() && !statSync(actualPath).isFile()) continue;
    if (GENERATED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      excludedGeneratedFiles.push(relativePath);
      continue;
    }
    files.push({ absolutePath, relativePath, size: statSync(actualPath).size });
  }
}

function parseReplacementRules(
  rootDir: string,
  sourceRoot: string,
  files: readonly WalkedFile[],
  markdownSources: ReadonlyMap<string, string>,
  diagnostics: MigrationDiagnostic[],
): ReplacementRuleInventory[] {
  const replacementRelative = files.find((file) => file.relativePath === relativeRepoPath(rootDir, join(sourceRoot, "_postReplaceList.json")));
  if (!replacementRelative) {
    addDiagnostic(diagnostics, "gift/_postReplaceList.json", "MIGRATION_REPLACEMENT_LIST_MISSING", "_postReplaceList.json was not found in the source tree.", "warning", 1, 1, "inventory");
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(replacementRelative.absolutePath, "utf8")) as unknown;
  } catch (error) {
    addDiagnostic(
      diagnostics,
      replacementRelative.relativePath,
      "MIGRATION_REPLACEMENT_LIST_INVALID",
      `Could not parse _postReplaceList.json${error instanceof Error ? `: ${error.message}` : "."}`,
      "error",
      1,
      1,
      "inventory",
    );
    return [];
  }
  if (!Array.isArray(parsed)) {
    addDiagnostic(diagnostics, replacementRelative.relativePath, "MIGRATION_REPLACEMENT_LIST_SHAPE", "The replacement list must be an array.", "error", 1, 1, "inventory");
    return [];
  }
  const result: ReplacementRuleInventory[] = [];
  for (const [index, item] of parsed.entries()) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      addDiagnostic(diagnostics, replacementRelative.relativePath, "MIGRATION_REPLACEMENT_RULE_INVALID", `Replacement rule ${index} is not an object.`, "error", index + 1, 1, "inventory");
      continue;
    }
    const candidate = item as { f?: unknown; r?: unknown };
    if (typeof candidate.f !== "string" || typeof candidate.r !== "string") {
      addDiagnostic(diagnostics, replacementRelative.relativePath, "MIGRATION_REPLACEMENT_RULE_INVALID", `Replacement rule ${index} must contain string f and r values.`, "error", index + 1, 1, "inventory");
      continue;
    }
    let expression: RegExp;
    try {
      expression = new RegExp(candidate.f, "gu");
    } catch (error) {
      addDiagnostic(diagnostics, replacementRelative.relativePath, "MIGRATION_REPLACEMENT_RULE_REGEX_INVALID", `Replacement rule ${index} has an invalid regular expression${error instanceof Error ? `: ${error.message}` : "."}`, "error", index + 1, 1, "inventory");
      continue;
    }
    let sourceMatchCount = 0;
    let sourceFileCount = 0;
    for (const [file, source] of markdownSources) {
      expression.lastIndex = 0;
      const matches = [...source.matchAll(expression)];
      if (matches.length > 0) sourceFileCount += 1;
      sourceMatchCount += matches.length;
      if (expression.lastIndex !== 0) expression.lastIndex = 0;
      void file;
    }
    result.push({
      index,
      pattern: candidate.f,
      replacement: candidate.r,
      sourceMatchCount,
      sourceFileCount,
    });
  }
  return result;
}

function sourceLine(lines: readonly string[], lineNumber: number): string {
  return lines[lineNumber - 1] ?? "";
}

function parseLegacyFrontmatter(sourceFile: string, lines: string[], diagnostics: MigrationDiagnostic[]): LegacyFrontmatter | undefined {
  const bomOffset = lines[0]?.startsWith("\uFEFF") ? 1 : 0;
  if (bomOffset > 0) lines[0] = lines[0]?.slice(1) ?? "";
  if (lines[0] !== "---") return undefined;
  let closingLine = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === "---") {
      closingLine = index;
      break;
    }
  }
  if (closingLine < 0) {
    addDiagnostic(diagnostics, sourceFile, "MIGRATION_FRONTMATTER_UNCLOSED", "Legacy frontmatter has no closing --- line.", "unresolved", 1, 1, "frontmatter");
    return undefined;
  }
  const raw = lines.slice(1, closingLine).join("\n");
  let parsed: unknown;
  try {
    const document = parseDocument(raw, { prettyErrors: false, uniqueKeys: true });
    if (document.errors.length > 0) throw document.errors[0];
    parsed = document.toJS() as unknown;
  } catch (error) {
    addDiagnostic(diagnostics, sourceFile, "MIGRATION_FRONTMATTER_INVALID", `Legacy frontmatter could not be parsed${error instanceof Error ? `: ${error.message}` : "."}`, "unresolved", 2, 1, "frontmatter");
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    addDiagnostic(diagnostics, sourceFile, "MIGRATION_FRONTMATTER_MAPPING_REQUIRED", "Legacy frontmatter must be a mapping.", "unresolved", 2, 1, "frontmatter");
    return undefined;
  }
  const values = parsed as Record<string, unknown>;
  const id = values.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    addDiagnostic(diagnostics, sourceFile, "MIGRATION_FRONTMATTER_ID_REQUIRED", "Legacy frontmatter must contain a non-empty string id.", "unresolved", 2, 1, "frontmatter");
  }
  return {
    openingLine: 1,
    closingLine: closingLine + 1,
    contentStartLine: closingLine + 2,
    values,
  };
}

function isFenceOpening(line: string): { character: "`" | "~"; length: number } | undefined {
  const match = /^(?: {0,3})(`{3,}|~{3,})/u.exec(line);
  if (!match) return undefined;
  const marker = match[1];
  if (!marker) return undefined;
  return { character: marker[0] as "`" | "~", length: marker.length };
}

function closesFence(line: string, fence: { character: "`" | "~"; length: number }): boolean {
  const escaped = fence.character === "`" ? "`" : "~";
  const pattern = new RegExp(`^ {0,3}${escaped}{${fence.length},}[ \\t]*$`, "u");
  return pattern.test(line);
}

function parseLegacyOpening(line: string): { name: string; title: string } | undefined {
  const match = /^:::([a-z0-9-]+)(?:[ \t]+(.*?))?[ \t]*$/u.exec(line);
  if (!match) return undefined;
  return { name: match[1] ?? "", title: (match[2] ?? "").trim() };
}

function scanLegacyBlocks(sourceFile: string, lines: string[]): LegacyScan {
  const blocks: LegacyBlock[] = [];
  const diagnostics: MigrationDiagnostic[] = [];
  const lineBlockNames: Array<string | undefined> = Array.from({ length: lines.length });
  let fence: { character: "`" | "~"; length: number } | undefined;
  let active: LegacyBlock | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const openingFence = isFenceOpening(line);
    if (openingFence) {
      fence = openingFence;
      continue;
    }
    if (active) {
      lineBlockNames[index] = active.name;
      if (line === ":::") {
        active.closeLine = index + 1;
        active.bodyEndLine = index;
        blocks.push(active);
        active = undefined;
        continue;
      }
      if (line.startsWith(":::") && line !== ":::") {
        addDiagnostic(diagnostics, sourceFile, "MIGRATION_BLOCK_NESTED", "A legacy block contains another block marker; the nested marker was not interpreted.", "unresolved", index + 1, 1, "markdown");
      }
      continue;
    }
    if (line === ":::") {
      addDiagnostic(diagnostics, sourceFile, "MIGRATION_BLOCK_TERMINATOR_EXTRA", "A legacy block terminator appears outside a block.", "unresolved", index + 1, 1, "markdown");
      continue;
    }
    if (!line.startsWith(":::")) continue;
    const opening = parseLegacyOpening(line);
    if (!opening) {
      addDiagnostic(diagnostics, sourceFile, "MIGRATION_BLOCK_OPENING_INVALID", "A legacy block opening line could not be parsed.", "unresolved", index + 1, 1, "markdown");
      continue;
    }
    active = {
      name: opening.name,
      title: opening.title,
      startLine: index + 1,
      bodyStartLine: index + 2,
      bodyEndLine: lines.length + 1,
    };
    lineBlockNames[index] = active.name;
  }
  if (active) {
    addDiagnostic(diagnostics, sourceFile, "MIGRATION_BLOCK_UNCLOSED", `Legacy block :::${active.name} has no closing :::.`, "unresolved", active.startLine, 1, "markdown");
    blocks.push(active);
  }
  return { blocks, diagnostics, lineBlockNames };
}

function findSectionMetadata(document: SourceDocument): void {
  const section = document.scan.blocks.find((block) => block.name === "section-title");
  if (!section) return;
  document.sectionTitle = section.title;
  let headingLine = -1;
  for (let line = section.bodyStartLine; line < section.bodyEndLine; line += 1) {
    if (/^#[ \t]+\S/u.test(sourceLine(document.lines, line))) {
      headingLine = line;
      break;
    }
  }
  if (headingLine < 0) {
    addDiagnostic(document.scan.diagnostics, document.sourceFile, "MIGRATION_SECTION_TITLE_H1_MISSING", "section-title did not contain a chapter H1.", "unresolved", section.startLine, 1, "markdown");
    return;
  }
  document.chapterTitle = sourceLine(document.lines, headingLine).replace(/^#[ \t]+/u, "").trim();
  const preHeading = document.lines.slice(section.bodyStartLine - 1, headingLine - 1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (preHeading.length > 0) {
    const kicker = preHeading[0];
    if (kicker !== undefined) document.sectionKicker = kicker;
    if (preHeading.length > 1) {
      addDiagnostic(
      document.scan.diagnostics,
        document.sourceFile,
        "MIGRATION_SECTION_TITLE_EXTRA_CONTENT",
        "More than one non-empty line appeared before the legacy chapter H1; only the first was mapped to frontmatter.kicker.",
        "unresolved",
        section.bodyStartLine,
        1,
        "markdown",
      );
    }
  }
}

function parseLegacyDocument(sourceFile: string, source: string): SourceDocument {
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const diagnostics: MigrationDiagnostic[] = [];
  const frontmatter = parseLegacyFrontmatter(sourceFile, lines, diagnostics);
  const scan = scanLegacyBlocks(sourceFile, lines);
  scan.diagnostics.push(...diagnostics);
  const document: SourceDocument = { source, sourceFile, lines, scan };
  if (frontmatter !== undefined) document.frontmatter = frontmatter;
  const id = frontmatter?.values.id;
  const lang = frontmatter?.values.lang;
  if (typeof id === "string") document.id = id;
  if (typeof lang === "string") document.lang = lang;
  findSectionMetadata(document);
  return document;
}

function yamlScalar(value: string): string {
  const serialized = stringify(value).trimEnd();
  return serialized;
}

function rewriteFrontmatter(document: SourceDocument, diagnostics: MigrationDiagnostic[]): string[] {
  const frontmatter = document.frontmatter;
  if (!frontmatter) return [];
  const values: Record<string, string> = {};
  if (typeof frontmatter.values.id === "string") values.id = frontmatter.values.id;
  if (document.sectionKicker !== undefined && document.sectionKicker.length > 0) values.kicker = document.sectionKicker;
  if (typeof frontmatter.values.lang === "string") values.lang = frontmatter.values.lang;
  for (const key of Object.keys(frontmatter.values)) {
    if (key !== "id" && key !== "lang" && key !== "kicker") {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_FRONTMATTER_KEY_DROPPED", `Legacy frontmatter key "${key}" has no current contract and was dropped.`, "warning", frontmatter.openingLine + 1, 1, "frontmatter");
    }
  }
  if (!values.id) {
    addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_FRONTMATTER_ID_UNAVAILABLE", "No usable id was available for the new frontmatter.", "unresolved", frontmatter.openingLine, 1, "frontmatter");
  }
  const result = ["---"];
  for (const key of ["id", "kicker", "lang"] as const) {
    const value = values[key];
    if (value !== undefined) result.push(`${key}: ${yamlScalar(value)}`);
  }
  result.push("---", "");
  return result;
}

function blockForLine(document: SourceDocument, lineNumber: number): LegacyBlock | undefined {
  return document.scan.blocks.find((block) => lineNumber >= block.startLine && lineNumber <= (block.closeLine ?? document.lines.length + 1));
}

function isInsideCodeFence(lines: readonly string[], lineNumber: number): boolean {
  let fence: { character: "`" | "~"; length: number } | undefined;
  for (let index = 0; index < lineNumber - 1; index += 1) {
    const line = lines[index] ?? "";
    if (fence) {
      if (closesFence(line, fence)) fence = undefined;
      continue;
    }
    const opening = isFenceOpening(line);
    if (opening) fence = opening;
  }
  return fence !== undefined;
}

function normalizeDifficultyLine(
  line: string,
  blockName: string,
  sourceFile: string,
  lineNumber: number,
  diagnostics: MigrationDiagnostic[],
): string[] {
  if (blockName !== "check" && blockName !== "info" && blockName !== "e-lois") return [line];
  const match = /^\[難易度\][ \t]+(\d+)[ \t]*★[ \t]*$/u.exec(line);
  if (!match) return [line];
  addDiagnostic(diagnostics, sourceFile, "MIGRATION_MANDATORY_MARK_MAPPED", "The legacy ★ difficulty marker was mapped to a current [必須] field.", "warning", lineNumber, 1, "markdown");
  return [`[難易度] ${match[1] ?? ""}`, "[必須]"];
}

function transformInlineLine(
  line: string,
  document: SourceDocument,
  lineNumber: number,
  options: GiftMarkdownMigrationOptions,
  diagnostics: MigrationDiagnostic[],
  blockName?: string,
): string {
  let result = line;
  if (isInsideCodeFence(document.lines, lineNumber) || isFenceOpening(line)) return result;
  result = result.replace(IMAGE_ATTRIBUTE_PATTERN, (_match, image: string, attributes: string) => {
    addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_IMAGE_ATTRIBUTE_DROPPED", `The legacy image attribute list {${attributes}} is not part of the current Markdown contract and was dropped.`, "warning", lineNumber, 1, "markdown");
    return image as string;
  });
  for (const match of result.matchAll(RUBY_PATTERN)) {
    const start = match.index ?? 0;
    addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_RUBY_PRESERVED", "Legacy {display|reading} ruby syntax has no current contract; the original text was preserved for manual review.", "unresolved", lineNumber, start + 1, "markdown");
  }
  result = result.replace(INLINE_LINK_PATTERN, (full: string, label: string, href: string) => {
    const normalizedHref = normalizeSlashes(href);
    const htmlTarget = normalizedHref.replace(/\.html$/iu, ".md");
    const resolvedTarget = normalizeRelativePath(dirname(options.outputFile), htmlTarget);
    const targetExists = options.markdownTargets?.has(resolvedTarget) ?? false;
    const enemyTarget = options.enemyPages?.get(resolvedTarget) ?? options.enemyPages?.get(htmlTarget);
    if (enemyTarget && (label.includes("エネミーデータ") || label.includes("敵データ"))) {
      const outputDirectory = dirname(options.outputFile);
      const dataHref = normalizeSlashes(relative(outputDirectory, enemyTarget.dataPath)) || ".";
      const display = label.includes("：") || label.includes(":")
        ? `敵データ：${enemyTarget.displayName}`
        : `敵データ：${enemyTarget.displayName}`;
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_LINK_MAPPED", `Legacy enemy page link was mapped to ${dataHref}.`, "warning", lineNumber, 1, "markdown");
      return `[${display}](${dataHref})`;
    }
    const oldEnemyLabel = /^(?:エネミー|敵)データ[ \t]*[:：][ \t]*(.+)$/u.exec(label);
    if (oldEnemyLabel && enemyTarget) {
      const outputDirectory = dirname(options.outputFile);
      const dataHref = normalizeSlashes(relative(outputDirectory, enemyTarget.dataPath)) || ".";
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_LINK_MAPPED", `Legacy enemy page link was mapped to ${dataHref}.`, "warning", lineNumber, 1, "markdown");
      return `[敵データ：${oldEnemyLabel[1]?.trim() ?? enemyTarget.displayName}](${dataHref})`;
    }
    if (/\.html$/iu.test(normalizedHref)) {
      if (!targetExists) {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_LINK_TARGET_MISSING", `Legacy HTML link target ${href} was not found among source Markdown files.`, "unresolved", lineNumber, 1, "markdown");
      } else {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_HTML_LINK_MAPPED", `Legacy HTML link was mapped to ${htmlTarget}.`, "warning", lineNumber, 1, "markdown");
      }
      return `[${label}](${htmlTarget})`;
    }
    return full;
  });
  if (blockName === undefined || !KNOWN_NARRATIVE_BLOCKS.has(blockName)) {
    const description = OLD_DESCRIPTION_LABEL.exec(result);
    if (description && !result.startsWith("- ") && !result.startsWith("* ") && !result.startsWith("> ")) {
      return `**${description[1] ?? ""}**: ${description[2] ?? ""}`;
    }
  }
  return result;
}

function mapBlockOpening(block: LegacyBlock, title = block.title): string | undefined {
  const mapped = LEGACY_BLOCK_MAP[block.name];
  if (mapped) return `:::${mapped}${title.length > 0 ? ` ${title}` : ""}`;
  return undefined;
}

function titleForCurrentSyntax(title: string, sourceFile: string, lineNumber: number, diagnostics: MigrationDiagnostic[]): string {
  return title.replace(RUBY_PATTERN, (_match, display: string, reading: string) => {
    addDiagnostic(diagnostics, sourceFile, "MIGRATION_RUBY_TITLE_TEXTUALIZED", "Legacy ruby in a block title was rendered as display（reading） because the current block title grammar rejects attribute-like braces; manual review is still required.", "unresolved", lineNumber, 1, "markdown");
    return `${display}（${reading}）`;
  });
}

function lineMapDiagnostic(
  diagnostic: Diagnostic | DataDiagnostic,
  sourceFile: string,
  outputLineToSourceLine: readonly number[],
  outputFile: string,
): MigrationDiagnostic {
  const sourceLineNumber = outputLineToSourceLine[diagnostic.line - 1] ?? diagnostic.line;
  const category: MigrationDiagnostic["category"] = diagnostic.category === "data" || diagnostic.category === "reference"
    ? diagnostic.category
    : "validation";
  return migrationDiagnostic(
    sourceFile,
    diagnostic.code,
    diagnostic.message,
    "error",
    sourceLineNumber,
    diagnostic.column,
    category,
    sourceFile,
    outputFile,
  );
}

export function migrateGiftMarkdown(
  source: string,
  options: GiftMarkdownMigrationOptions,
): GiftMarkdownMigrationResult {
  const document = parseLegacyDocument(options.sourceFile, source);
  const diagnostics = [...document.scan.diagnostics];
  const section = document.scan.blocks.find((block) => block.name === "section-title");
  const sectionHeadingLine = section
    ? document.lines.findIndex((line, index) => index + 1 >= section.bodyStartLine && index + 1 < section.bodyEndLine && /^#[ \t]+\S/u.test(line)) + 1
    : -1;
  const outputLines: string[] = [];
  const outputLineToSourceLine: number[] = [];
  const append = (line: string, sourceLine: number): void => {
    outputLines.push(line);
    outputLineToSourceLine.push(sourceLine);
  };
  const frontmatter = rewriteFrontmatter(document, diagnostics);
  if (frontmatter.length > 0) {
    for (const line of frontmatter) append(line, document.frontmatter?.openingLine ?? 1);
  }
  let skipCombo = false;
  let skipSection = false;
  let sectionOutputDone = false;
  for (let lineNumber = document.frontmatter?.contentStartLine ?? 1; lineNumber <= document.lines.length; lineNumber += 1) {
    const line = sourceLine(document.lines, lineNumber);
    const block = blockForLine(document, lineNumber);
    if (block?.name === "section-title") {
      if (lineNumber === block.startLine) {
        skipSection = true;
        continue;
      }
      if (lineNumber === block.closeLine) {
        skipSection = false;
        continue;
      }
      if (lineNumber === sectionHeadingLine && !sectionOutputDone) {
        append(line, lineNumber);
        sectionOutputDone = true;
      }
      continue;
    }
    if (skipSection) continue;
    if (block?.name === "combo") {
      if (lineNumber === block.startLine) {
        for (const match of block.title.matchAll(RUBY_PATTERN)) {
          addDiagnostic(diagnostics, options.sourceFile, "MIGRATION_RUBY_PRESERVED", "Legacy {display|reading} ruby syntax has no current contract; the original text was preserved for manual review.", "unresolved", lineNumber, (match.index ?? 0) + 1, "markdown");
        }
        const currentTitle = titleForCurrentSyntax(block.title, options.sourceFile, lineNumber, diagnostics);
        if (options.enemyPage?.yamlAvailable) {
          const outputDirectory = dirname(options.outputFile);
          const href = normalizeSlashes(relative(outputDirectory, options.enemyPage.dataPath));
          const comboId = comboIdForTitle(block.title, block.startLine);
          append(`[コンボデータ：${currentTitle}](${href}#${comboId})`, lineNumber);
          addDiagnostic(diagnostics, options.sourceFile, "MIGRATION_COMBO_LINK_MAPPED", `Legacy combo block was mapped to ${href}#${comboId}.`, "warning", lineNumber, 1, "markdown");
          skipCombo = true;
        } else {
          append(`#### コンボ: ${currentTitle}`, lineNumber);
          addDiagnostic(diagnostics, options.sourceFile, "MIGRATION_COMBO_OWNER_UNRESOLVED", "The legacy combo has no safely identifiable enemy owner; it was flattened to ordinary Markdown and needs manual data migration.", "unresolved", lineNumber, 1, "markdown");
        }
        continue;
      }
      if (lineNumber === block.closeLine) {
        skipCombo = false;
        continue;
      }
      if (skipCombo) continue;
      const normalized = transformInlineLine(line.replace(/^~/u, ""), document, lineNumber, options, diagnostics, "combo");
      append(normalized, lineNumber);
      continue;
    }
    if (block && lineNumber === block.startLine) {
      for (const match of block.title.matchAll(RUBY_PATTERN)) {
        addDiagnostic(diagnostics, options.sourceFile, "MIGRATION_RUBY_PRESERVED", "Legacy {display|reading} ruby syntax has no current contract; the original text was preserved for manual review.", "unresolved", lineNumber, (match.index ?? 0) + 1, "markdown");
      }
      const opening = mapBlockOpening(block, titleForCurrentSyntax(block.title, options.sourceFile, lineNumber, diagnostics));
      if (opening) {
        append(opening, lineNumber);
      } else if (FLATTENED_BLOCKS.has(block.name)) {
        addDiagnostic(diagnostics, options.sourceFile, "MIGRATION_LEGACY_CONTAINER_FLATTENED", `Legacy :::${block.name} container was flattened to ordinary Markdown.`, "warning", lineNumber, 1, "markdown");
      } else if (block.name === "section-title") {
        // handled above
      } else {
        append(line, lineNumber);
        addDiagnostic(diagnostics, options.sourceFile, "MIGRATION_UNKNOWN_BLOCK_PRESERVED", `Unknown legacy block :::${block.name} was preserved for manual review.`, "unresolved", lineNumber, 1, "markdown");
      }
      continue;
    }
    if (block && lineNumber === block.closeLine) {
      if (LEGACY_BLOCK_MAP[block.name]) append(":::", lineNumber);
      continue;
    }
    if (FLATTENED_BLOCKS.has(block?.name ?? "")) {
      const normalized = transformInlineLine(line.replace(/^~/u, ""), document, lineNumber, options, diagnostics, undefined);
      append(normalized, lineNumber);
      continue;
    }
    let normalizedLine = line;
    if (!isInsideCodeFence(document.lines, lineNumber) && !isFenceOpening(normalizedLine)) normalizedLine = normalizedLine.replace(/^~/u, "");
    const blockName = block ? LEGACY_BLOCK_MAP[block.name] : undefined;
    const difficultyLines = normalizeDifficultyLine(normalizedLine, blockName ?? "", options.sourceFile, lineNumber, diagnostics);
    for (const difficultyLine of difficultyLines) {
      append(transformInlineLine(difficultyLine, document, lineNumber, options, diagnostics, blockName), lineNumber);
    }
  }
  if (outputLines.length > 0 && outputLines.at(-1) !== "") outputLines.push(""), outputLineToSourceLine.push(document.lines.length);
  return {
    source,
    output: outputLines.join("\n"),
    diagnostics: sortDiagnostics(diagnostics),
    outputLineToSourceLine,
  };
}

function slugify(value: string, fallback: string): string {
  const ascii = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (SAFE_ID_PATTERN.test(ascii)) return ascii;
  return fallback;
}

function comboIdForTitle(title: string, ordinal: number): string {
  return slugify(title, `combo-${String(ordinal).padStart(2, "0")}`);
}

function enemyIdForFile(sourceFile: string): string {
  const stem = basename(sourceFile, extname(sourceFile));
  return slugify(stem, "enemy-01");
}

function trimLegacyValue(value: string): string {
  return value.replace(/[ \t]+$/u, "").trim();
}

function findDirectField(lines: readonly string[], label: string): { value: string; line: number } | undefined {
  for (let index = 0; index < lines.length; index += 1) {
    const match = new RegExp(`^\\[${label}\\][ \\t]+(.+?)\\s*$`, "u").exec(lines[index] ?? "");
    if (match) return { value: trimLegacyValue(match[1] ?? ""), line: index + 1 };
  }
  return undefined;
}

function linesBetweenHeadings(lines: readonly string[], startHeading: string, endHeading?: string): { lines: string[]; startLine: number } {
  const startIndex = lines.findIndex((line) => line.trim() === startHeading);
  if (startIndex < 0) return { lines: [], startLine: 1 };
  const endIndex = endHeading === undefined
    ? lines.length
    : lines.findIndex((line, index) => index > startIndex && line.trim() === endHeading);
  const end = endIndex < 0 ? lines.length : endIndex;
  return { lines: lines.slice(startIndex + 1, end), startLine: startIndex + 2 };
}

function splitSyndromes(value: string): string[] {
  return value.split(/[×＋+]/u).map(trimLegacyValue).filter((entry) => entry.length > 0);
}

function normalizeDataName(value: string): string {
  return value.replace(/[《》]/gu, "").replace(/\s+/gu, "").replace(/：/gu, ":").trim();
}

function parseInteger(value: string): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) return undefined;
  return Number(value);
}

function parseEnemyExtraction(document: SourceDocument, outputFile: string, dataPath: string): EnemyExtraction | undefined {
  const diagnostics: MigrationDiagnostic[] = [];
  const id = enemyIdForFile(document.sourceFile);
  const displayName = document.chapterTitle ?? document.sectionTitle?.replace(/^敵データ[：:]?[ \t]*/u, "") ?? id;
  const name = document.chapterTitle?.trim();
  if (!name) {
    addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_NAME_UNRESOLVED", "Enemy H1 was not available for the external YAML name.", "unresolved", 1, 1, "data");
    return { dataPath, displayName, diagnostics };
  }
  const syndromeField = findDirectField(document.lines, "シンドローム");
  const encroachmentField = findDirectField(document.lines, "侵蝕率");
  const impulseField = findDirectField(document.lines, "衝動");
  if (!syndromeField || !impulseField) {
    addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_REQUIRED_FIELD_UNRESOLVED", "Enemy syndrome or impulse information is missing; no YAML was generated.", "unresolved", document.frontmatter?.contentStartLine ?? 1, 1, "data");
    return { dataPath, displayName, diagnostics };
  }
  const abilitySection = linesBetweenHeadings(document.lines, "## 能力値・副能力値・技能", "## 取得エフェクト");
  const primaryNames: Readonly<Record<string, { id: "body" | "sense" | "mind" | "social"; name: string }>> = {
    "肉体": { id: "body", name: "肉体" },
    "感覚": { id: "sense", name: "感覚" },
    "精神": { id: "mind", name: "精神" },
    "社会": { id: "social", name: "社会" },
  };
  const primary: EnemyDataDocument["enemy"]["abilities"]["primary"] = [];
  const skills: EnemyDataDocument["enemy"]["abilities"]["skills"] = [];
  let skillOrdinal = 1;
  for (const [index, line] of abilitySection.lines.entries()) {
    const primaryMatch = /^~?【(肉体|感覚|精神|社会)】[ \t]*(\d+)(.*)$/u.exec(line);
    if (!primaryMatch) continue;
    const primaryInfo = primaryNames[primaryMatch[1] ?? ""];
    const value = parseInteger(primaryMatch[2] ?? "");
    if (!primaryInfo || value === undefined) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_ABILITY_UNRESOLVED", "A primary ability value could not be converted to a non-negative integer.", "unresolved", abilitySection.startLine + index, 1, "data");
      continue;
    }
    primary.push({ id: primaryInfo.id, name: primaryInfo.name, value });
    const rest = primaryMatch[3] ?? "";
    for (const skillMatch of rest.matchAll(/〈([^〉]+)〉[ \t]*(\d+)/gu)) {
      const skillName = trimLegacyValue(skillMatch[1] ?? "");
      const skillValue = parseInteger(skillMatch[2] ?? "");
      if (!skillName || skillValue === undefined) {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_SKILL_UNRESOLVED", "A skill entry could not be converted safely.", "unresolved", abilitySection.startLine + index, 1, "data");
        continue;
      }
      skills.push({ id: `skill-${primaryInfo.id}-${String(skillOrdinal).padStart(2, "0")}`, name: skillName, ability_id: primaryInfo.id, value: skillValue });
      skillOrdinal += 1;
    }
  }
  if (primary.length !== 4 || new Set(primary.map((entry) => entry.id)).size !== 4) {
    addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_PRIMARY_INCOMPLETE", "The legacy enemy does not provide exactly one convertible body/sense/mind/social ability each.", "unresolved", abilitySection.startLine, 1, "data");
  }
  const secondary: EnemyDataDocument["enemy"]["abilities"]["secondary"] = [];
  for (const label of ["HP最大値", "行動値"] as const) {
    const field = findDirectField(abilitySection.lines, label);
    if (!field) continue;
    const value = parseInteger(field.value);
    if (value === undefined) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_SECONDARY_UNRESOLVED", `[${label}] is not a plain non-negative integer and was not guessed.`, "unresolved", abilitySection.startLine + field.line - 1, 1, "data");
      continue;
    }
    secondary.push({ id: label === "HP最大値" ? "hp-max" : "action", name: label, value });
  }
  const effectSection = linesBetweenHeadings(document.lines, "## 取得エフェクト", "## 取得Dロイス・Eロイス");
  const effects: EnemyDataDocument["enemy"]["effects"] = [];
  let currentGroup = "";
  const effectNameToId = new Map<string, string>();
  for (const [index, line] of effectSection.lines.entries()) {
    const groupMatch = /^###\s+(.+)$/u.exec(line);
    if (groupMatch) {
      currentGroup = trimLegacyValue(groupMatch[1] ?? "");
      continue;
    }
    const effectMatch = /^~?《([^》]+)》[ \t]*(\d+)[ \t]*$/u.exec(line);
    if (!effectMatch) continue;
    const effectName = trimLegacyValue(effectMatch[1] ?? "");
    const level = parseInteger(effectMatch[2] ?? "");
    if (!effectName || level === undefined || level < 1) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_EFFECT_UNRESOLVED", "An effect entry could not be converted safely.", "unresolved", effectSection.startLine + index, 1, "data");
      continue;
    }
    const effectId = `effect-${String(effects.length + 1).padStart(2, "0")}`;
    const normalizedName = normalizeDataName(effectName);
    if (effectNameToId.has(normalizedName)) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_EFFECT_DUPLICATE", `Effect name "${effectName}" is duplicated; combo references would be ambiguous.`, "unresolved", effectSection.startLine + index, 1, "data");
    }
    effectNameToId.set(normalizedName, effectId);
    const effect: EnemyDataDocument["enemy"]["effects"][number] = { id: effectId, name: effectName, level };
    if (currentGroup.length > 0) effect.group = currentGroup;
    effects.push(effect);
  }
  const itemSection = linesBetweenHeadings(document.lines, "## 取得アイテム", "## コンボデータ");
  const items: EnemyDataDocument["enemy"]["items"] = [];
  for (const line of itemSection.lines) {
    const itemMatch = /^~?(.+?)\s*$/u.exec(line);
    if (!itemMatch || !itemMatch[1] || itemMatch[1].startsWith("#") || itemMatch[1].startsWith("[") || itemMatch[1].trim().length === 0) continue;
    const itemName = trimLegacyValue(itemMatch[1]);
    if (itemName.startsWith("~")) continue;
    items.push({ id: `item-${String(items.length + 1).padStart(2, "0")}`, name: itemName });
  }
  const lois: EnemyDataDocument["enemy"]["lois"] = [];
  const dLois: EnemyDataDocument["enemy"]["d_lois"] = [];
  const eLois: EnemyDataDocument["enemy"]["e_lois"] = [];
  const loisSection = linesBetweenHeadings(document.lines, "## 取得Dロイス・Eロイス", "## 取得アイテム");
  let loisKind: "d" | "e" | undefined;
  for (const [index, line] of loisSection.lines.entries()) {
    if (/^###\s+Dロイス/u.test(line)) {
      loisKind = "d";
      continue;
    }
    if (/^###\s+Eロイス/u.test(line)) {
      loisKind = "e";
      continue;
    }
    const loisMatch = /^~?《([^》]+)》(?:×(\d+))?[ \t]*$/u.exec(line);
    if (!loisMatch || !loisKind) continue;
    const loisName = trimLegacyValue(loisMatch[1] ?? "");
    const count = loisMatch[2] === undefined ? 1 : parseInteger(loisMatch[2]);
    if (!loisName || count === undefined || count < 1) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_LOIS_UNRESOLVED", "A D/E-lois entry could not be converted safely.", "unresolved", loisSection.startLine + index, 1, "data");
      continue;
    }
    if (loisKind === "d") dLois.push({ id: `d-lois-${String(dLois.length + 1).padStart(2, "0")}`, name: loisName });
    else eLois.push({ id: `e-lois-${String(eLois.length + 1).padStart(2, "0")}`, name: loisName, count });
  }
  const combos: EnemyDataDocument["enemy"]["combos"] = [];
  const comboBlocks = document.scan.blocks.filter((block) => block.name === "combo");
  for (const [comboIndex, block] of comboBlocks.entries()) {
    const body = document.lines.slice(block.bodyStartLine - 1, (block.closeLine ?? document.lines.length + 1) - 1);
    const effectLineIndex = body.findIndex((line) => /^~?《/u.test(line));
    const effectLine = effectLineIndex < 0 ? undefined : body[effectLineIndex];
    const comboEffects: EnemyDataDocument["enemy"]["combos"][number]["effects"] = [];
    if (!effectLine) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_COMBO_EFFECTS_MISSING", `Combo "${block.title}" has no convertible effect list.`, "unresolved", block.startLine, 1, "data");
    } else {
      const tokens = [...effectLine.matchAll(/《([^》]+)》[ \t]*(\d+)/gu)];
      const reconstructed = tokens.map((token) => `《${token[1] ?? ""}》${token[2] ?? ""}`).join("+");
      const comparable = effectLine.replace(/^~/u, "").replace(/[ \t]+$/u, "");
      if (tokens.length === 0 || comparable !== reconstructed) {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_COMBO_EFFECTS_AMBIGUOUS", `Combo "${block.title}" effect expression was not a simple + list; it was not guessed.`, "unresolved", block.startLine + effectLineIndex + 1, 1, "data");
      }
      for (const token of tokens) {
        const tokenName = normalizeDataName(token[1] ?? "");
        const effectId = effectNameToId.get(tokenName);
        const level = parseInteger(token[2] ?? "");
        if (!effectId || level === undefined) {
          addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_COMBO_EFFECT_REFERENCE_UNRESOLVED", `Combo "${block.title}" refers to an effect that could not be matched safely: ${token[1] ?? ""}.`, "unresolved", block.startLine + effectLineIndex + 1, 1, "data");
          continue;
        }
        comboEffects.push({ effect_id: effectId, level });
      }
    }
    const fields = new Map<string, string>();
    const descriptions: string[] = [];
    for (const [index, line] of body.entries()) {
      const fieldMatch = /^\[(タイミング|対象|射程|判定)\][ \t]+(.+?)\s*$/u.exec(line);
      if (fieldMatch) {
        fields.set(fieldMatch[1] ?? "", trimLegacyValue(fieldMatch[2] ?? ""));
        continue;
      }
      if (index === effectLineIndex || line.trim().length === 0) continue;
      descriptions.push(line.replace(/^~/u, "").trim());
    }
    const timing = fields.get("タイミング");
    const target = fields.get("対象");
    const range = fields.get("射程");
    const check = fields.get("判定");
    const description = descriptions.filter((line) => line.length > 0).join("\n").trim();
    if (!timing || !target || !range || !check || !description || comboEffects.length === 0) {
      addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_COMBO_REQUIRED_FIELD_UNRESOLVED", `Combo "${block.title}" lacks a complete current YAML representation; it was not generated.`, "unresolved", block.startLine, 1, "data");
      continue;
    }
    const combo: EnemyDataDocument["enemy"]["combos"][number] = {
      id: comboIdForTitle(block.title, block.startLine),
      name: block.title,
      effects: comboEffects,
      item_ids: [],
      timing,
      target,
      range,
      check,
      description,
    };
    const attackPowerMatch = /攻撃力\s*:\s*\+?(-?\d+)/u.exec(description);
    if (attackPowerMatch) combo.attack_power = Number(attackPowerMatch[1]);
    if (/射撃/u.test(description)) combo.attack_type = "射撃";
    else if (/白兵/u.test(description)) combo.attack_type = "白兵";
    if (/シーン\s*\d+回/u.test(description)) {
      const uses = description.match(/シーン\s*\d+回/u)?.[0];
      if (uses !== undefined) combo.uses = uses;
    }
    combos.push(combo);
  }
  const rateMatch = encroachmentField ? /^(\d+)%/u.exec(encroachmentField.value) : undefined;
  const rate = rateMatch ? parseInteger(rateMatch[1] ?? "") : undefined;
  let levelBonus = 0;
  let diceBonus = 0;
  if (encroachmentField) {
    const levelMatch = /LV\s*\+\s*(\d+)/iu.exec(encroachmentField.value);
    const diceMatch = /ダイス\s*\+\s*(\d+)/u.exec(encroachmentField.value);
    if (levelMatch) levelBonus = Number(levelMatch[1]);
    if (diceMatch) diceBonus = Number(diceMatch[1]);
    if (rate === undefined) addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ENEMY_ENCROACHMENT_UNRESOLVED", "侵蝕率 was not a plain percentage and was not guessed.", "unresolved", encroachmentField.line, 1, "data");
  }
  const enemy: EnemyDataDocument["enemy"] = {
    id,
    name,
    aliases: [],
    syndromes: splitSyndromes(syndromeField.value),
    abilities: { primary, secondary, skills },
    effects,
    items,
    lois,
    d_lois: dLois,
    e_lois: eLois,
    combos,
  };
  if (impulseField.value.length > 0) enemy.impulse = impulseField.value;
  if (rate !== undefined) enemy.encroachment = { rate, level_bonus: levelBonus, dice_bonus: diceBonus };
  if (diagnostics.some((diagnostic) => diagnostic.severity === "unresolved" || diagnostic.severity === "error")) {
    return { dataPath, displayName, diagnostics };
  }
  const data: EnemyDataDocument = { schema: "dx3rd-scenario/enemy", version: 1, enemy };
  return { data, yaml: stringify(data, { lineWidth: 0 }), dataPath, displayName, diagnostics };
}

function isEnemyDocument(document: SourceDocument): boolean {
  return document.id?.startsWith("ENEMY-DATA-") === true || document.sectionTitle?.startsWith("敵データ") === true;
}

function diagnosticFromValidation(
  diagnostic: Diagnostic | DataDiagnostic,
  sourceFile: string,
  outputFile: string,
  outputLineToSourceLine: readonly number[],
): MigrationDiagnostic {
  return lineMapDiagnostic(diagnostic, sourceFile, outputLineToSourceLine, outputFile);
}

function validationSummary(
  ok: boolean,
  diagnostics: Array<Diagnostic | DataDiagnostic | MigrationDiagnostic>,
): { ok: boolean; diagnostics: Array<Diagnostic | DataDiagnostic | MigrationDiagnostic> } {
  return { ok, diagnostics };
}

function toMarkdownReport(report: GiftMigrationReport): string {
  const summary = report.summary;
  const lines = [
    "# gift移行レポート",
    "",
    `- 入力: \`${report.source}\``,
    `- 出力: ${report.output ? `\`${report.output}\`` : "dry-run（公開なし）"}`,
    `- 対象Markdown: ${summary.sourceMarkdownFiles}件`,
    `- parser検証: 成功 ${summary.parserValidatedMarkdownFiles}/${summary.convertedMarkdownFiles}件、失敗 ${summary.parserFailedMarkdownFiles}件`,
    `- 完全変換: ${summary.successfulMarkdownFiles}件`,
    `- 未解決を含む部分変換: ${summary.partialMarkdownFiles}件`,
    `- 検証失敗: ${summary.failedMarkdownFiles}件`,
    `- 生成YAML: ${summary.generatedYamlFiles}件（検証成功 ${summary.validatedYamlFiles}件、失敗 ${summary.invalidYamlFiles}件）`,
    `- 参照検証: 成功 ${summary.referenceValidatedFiles}件、失敗 ${summary.referenceFailureFiles}件`,
    `- 診断: warning ${summary.warningCount}件、unresolved ${summary.unresolvedDiagnosticCount}件、error ${summary.errorCount}件`,
    `- 画像等のコピー: ${summary.copiedAssetFiles}件`,
    "",
    "## ファイル別結果",
    "",
    "| 状態 | 入力 | 出力 | YAML | parser | 参照 | 診断 |",
    "| --- | --- | --- | --- | --- | --- | ---: |",
  ];
  for (const file of report.files) {
    lines.push(`| ${file.status} | \`${file.source}\` | ${file.output ? `\`${file.output}\`` : "-"} | ${file.generatedYaml ? `\`${file.generatedYaml}\`` : "-"} | ${file.parser.ok ? "ok" : "失敗"} | ${file.references.ok ? "ok" : "失敗"} | ${file.diagnostics.length} |`);
  }
  lines.push("", "## _postReplaceList.jsonとの突合", "", "| # | 旧正規表現 | 旧Markdown出現数 | ファイル数 |", "| ---: | --- | ---: | ---: |");
  for (const rule of report.inventory.replacementRules) {
    lines.push(`| ${rule.index} | \`${rule.pattern.replaceAll("|", "\\|")}\` | ${rule.sourceMatchCount} | ${rule.sourceFileCount} |`);
  }
  lines.push("", "## 診断", "");
  if (report.diagnostics.length === 0) lines.push("診断はありません。", "");
  else {
    for (const diagnostic of report.diagnostics) {
      lines.push(`- ${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code} [${diagnostic.severity}] ${diagnostic.message}`);
    }
    lines.push("");
  }
  lines.push("## 調査除外", "", `- ディレクトリ: ${report.inventory.excludedDirectories.length > 0 ? report.inventory.excludedDirectories.map((entry) => `\`${entry}\``).join(", ") : "なし"}`, `- HTML/PDF: ${report.inventory.excludedGeneratedFiles.length > 0 ? report.inventory.excludedGeneratedFiles.map((entry) => `\`${entry}\``).join(", ") : "なし"}`, "");
  return `${lines.join("\n")}\n`;
}

function addAssetReferences(
  document: SourceDocument,
  sourceAbsolutePath: string,
  sourceRoot: string,
  assetSources: Map<string, string>,
  diagnostics: MigrationDiagnostic[],
): void {
  const manuscriptRoot = join(sourceRoot, "manuscripts");
  for (const [index, line] of document.lines.entries()) {
    for (const match of line.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/gu)) {
      const href = match[1] ?? "";
      if (href.length === 0 || href.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(href)) continue;
      const sourceAsset = resolve(dirname(sourceAbsolutePath), href);
      const actualAsset = existsSync(sourceAsset) ? realpathSync(sourceAsset) : sourceAsset;
      if (!isWithin(manuscriptRoot, actualAsset)) {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ASSET_PATH_TRAVERSAL", `Image path ${href} escapes gift/manuscripts and was not copied.`, "unresolved", index + 1, (match.index ?? 0) + 1, "safety");
        continue;
      }
      if (!existsSync(actualAsset) || !statSync(actualAsset).isFile()) {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ASSET_MISSING", `Referenced image does not exist: ${href}.`, "unresolved", index + 1, (match.index ?? 0) + 1, "markdown");
        continue;
      }
      const assetRelative = `manuscripts/${normalizeSlashes(relative(manuscriptRoot, sourceAsset))}`;
      const previous = assetSources.get(assetRelative);
      if (previous !== undefined && realpathSync(previous) !== actualAsset) {
        addDiagnostic(diagnostics, document.sourceFile, "MIGRATION_ASSET_COLLISION", `Two source assets map to the same output path: ${assetRelative}.`, "unresolved", index + 1, 1, "safety");
        continue;
      }
      assetSources.set(assetRelative, actualAsset);
    }
  }
}

function createInventory(rootDir: string, sourceRoot: string, files: readonly WalkedFile[], markdownSources: ReadonlyMap<string, string>, diagnostics: MigrationDiagnostic[]): GiftInventory {
  const includedFiles = files.map((file) => file.relativePath).sort();
  const markdownFiles = files
    .filter((file) => extname(file.relativePath).toLowerCase() === ".md")
    .map((file) => file.relativePath)
    .sort();
  const sourceRelativeRoot = relativeRepoPath(rootDir, sourceRoot);
  const legacyConfigurationFiles = includedFiles.filter((file) => {
    const lower = file.toLowerCase();
    return lower === `${sourceRelativeRoot}/vivliostyle.config.js` || lower === `${sourceRelativeRoot}/package.json` || lower === `${sourceRelativeRoot}/_postreplacelist.json`;
  });
  const legacyThemeFiles = includedFiles.filter((file) => file.startsWith(`${sourceRelativeRoot}/themes/`) || file.startsWith(`${sourceRelativeRoot}/manuscripts/themes/`));
  const excludedDirectories: string[] = [];
  const excludedGeneratedFiles: string[] = [];
  void excludedDirectories;
  void excludedGeneratedFiles;
  return {
    includedFiles,
    excludedDirectories: [],
    excludedGeneratedFiles: [],
    markdownFiles,
    legacyConfigurationFiles,
    legacyThemeFiles,
    replacementRules: parseReplacementRules(rootDir, sourceRoot, files, markdownSources, diagnostics),
  };
}

function copyAssets(assetSources: ReadonlyMap<string, string>, stageRoot: string | undefined, dryRun: boolean): number {
  if (dryRun || !stageRoot) return assetSources.size;
  for (const [relativePath, sourcePath] of assetSources) {
    const target = join(stageRoot, ...relativePath.split("/"));
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(sourcePath, target);
  }
  return assetSources.size;
}

function publishStagedOutput(stageRoot: string, outputPath: string): void {
  try {
    renameSync(stageRoot, outputPath);
    return;
  } catch (error) {
    // Some Windows filesystem providers refuse a directory rename while the
    // directory is being indexed. The target is guaranteed new, so publish
    // its already-staged top-level entries into a new empty directory.
    if (existsSync(outputPath)) throw error;
    mkdirSync(outputPath, { recursive: false });
    try {
      for (const entry of readdirSync(stageRoot)) {
        renameSync(join(stageRoot, entry), join(outputPath, entry));
      }
      rmSync(stageRoot, { recursive: true, force: true });
    } catch (publishError) {
      if (existsSync(outputPath)) rmSync(outputPath, { recursive: true, force: true });
      throw publishError;
    }
  }
}

function formatValidationDiagnostics(
  diagnostics: readonly (Diagnostic | DataDiagnostic)[],
  sourceFile: string,
  outputFile: string,
  outputLineToSourceLine: readonly number[],
): MigrationDiagnostic[] {
  return diagnostics.map((diagnostic) => diagnosticFromValidation(diagnostic, sourceFile, outputFile, outputLineToSourceLine));
}

function fileStatus(
  parserOk: boolean,
  referencesOk: boolean,
  diagnostics: readonly MigrationDiagnostic[],
  yamlOk: boolean,
): MigrationFileStatus {
  if (!parserOk || !referencesOk || !yamlOk || diagnostics.some((diagnostic) => diagnostic.severity === "error")) return "failed";
  if (diagnostics.some((diagnostic) => diagnostic.severity === "unresolved")) return "partial";
  return "success";
}

export async function runGiftMigration(options: GiftMigrationOptions): Promise<GiftMigrationRunResult> {
  const rootDir = repositoryRoot(options.rootDir);
  const sourceRoot = safeRepoDirectory(rootDir, options.sourcePath, "Migration source");
  const outputInput = options.outputPath ?? "tmp/gift-migration";
  const dryRun = options.dryRun === true;
  const outputPath = safeOutputPath(rootDir, outputInput, sourceRoot, dryRun);
  if (!dryRun) mkdirSync(dirname(outputPath), { recursive: true });
  const sourceRelative = relativeRepoPath(rootDir, sourceRoot);
  const manuscriptsRoot = join(sourceRoot, "manuscripts");
  if (!existsSync(manuscriptsRoot) || !statSync(manuscriptsRoot).isDirectory()) {
    throw new GiftMigrationFailure([
      migrationDiagnostic(`${sourceRelative}/manuscripts`, "MIGRATION_MANUSCRIPTS_MISSING", "Migration source must contain a manuscripts directory.", "error", 1, 1, "safety"),
    ]);
  }
  const walkedFiles: WalkedFile[] = [];
  const excludedDirectories: string[] = [];
  const excludedGeneratedFiles: string[] = [];
  walkSourceFiles(rootDir, sourceRoot, sourceRoot, walkedFiles, excludedDirectories, excludedGeneratedFiles);
  const sourceMarkdownFiles = walkedFiles.filter((file) => file.relativePath.startsWith(`${sourceRelative}/manuscripts/`) && extname(file.relativePath).toLowerCase() === ".md");
  const markdownSources = new Map<string, string>();
  for (const file of sourceMarkdownFiles) markdownSources.set(file.relativePath, readFileSync(file.absolutePath, "utf8"));
  const inventoryDiagnostics: MigrationDiagnostic[] = [];
  const inventory = createInventory(rootDir, sourceRoot, walkedFiles, markdownSources, inventoryDiagnostics);
  inventory.excludedDirectories.push(...excludedDirectories.sort());
  inventory.excludedGeneratedFiles.push(...excludedGeneratedFiles.sort());
  const documents = sourceMarkdownFiles.map((file) => ({
    file,
    document: parseLegacyDocument(file.relativePath, markdownSources.get(file.relativePath) ?? ""),
    outputFile: `manuscripts/${normalizeSlashes(relative(join(sourceRoot, "manuscripts"), file.absolutePath))}`,
  }));
  const markdownTargets = new Set(documents.map((entry) => entry.outputFile));
  const enemyExtractions = new Map<string, EnemyExtraction>();
  const enemyPages = new Map<string, { dataPath: string; displayName: string; yamlAvailable: boolean }>();
  for (const entry of documents) {
    if (!isEnemyDocument(entry.document)) continue;
    const enemyId = enemyIdForFile(entry.file.relativePath);
    const dataPath = `data/enemies/${enemyId}.yaml`;
    const extraction = parseEnemyExtraction(entry.document, entry.outputFile, dataPath);
    if (!extraction) continue;
    enemyExtractions.set(entry.file.relativePath, extraction);
    enemyPages.set(entry.outputFile, { dataPath, displayName: extraction.displayName, yamlAvailable: extraction.yaml !== undefined });
  }
  const transformed: TransformedFile[] = [];
  const yamlByPath = new Map<string, string>();
  for (const entry of documents) {
    const extraction = enemyExtractions.get(entry.file.relativePath);
    const currentEnemyPage = extraction
      ? { dataPath: extraction.dataPath, displayName: extraction.displayName, yamlAvailable: extraction.yaml !== undefined }
      : undefined;
    const migration = migrateGiftMarkdown(markdownSources.get(entry.file.relativePath) ?? "", {
      sourceFile: entry.file.relativePath,
      outputFile: entry.outputFile,
      ...(currentEnemyPage ? { enemyPage: currentEnemyPage } : {}),
      enemyPages,
      markdownTargets,
    });
    if (extraction?.yaml !== undefined) yamlByPath.set(extraction.dataPath, extraction.yaml);
    transformed.push({ sourceDocument: entry.document, migration, ...(extraction ? { enemy: extraction } : {}) });
  }
  const assetSources = new Map<string, string>();
  for (const entry of documents) {
    addAssetReferences(entry.document, entry.file.absolutePath, sourceRoot, assetSources, inventoryDiagnostics);
  }
  const stageRoot = dryRun ? undefined : mkdtempSync(join(dirname(outputPath), ".gift-migration-stage-"));
  const fileReports: MigrationFileReport[] = [];
  let validatedYamlFiles = 0;
  let invalidYamlFiles = 0;
  let referenceValidatedFiles = 0;
  let referenceFailureFiles = 0;
  try {
    if (!dryRun) mkdirSync(stageRoot ?? outputPath, { recursive: true });
    const validatedYaml = new Map<string, string>();
    const yamlValidationDiagnostics = new Map<string, DataDiagnostic[]>();
    for (const [dataPath, yamlSource] of yamlByPath) {
      const validation = parseEnemyDataYaml(yamlSource, dataPath);
      if (validation.ok) {
        validatedYamlFiles += 1;
        validatedYaml.set(dataPath, yamlSource);
      } else {
        invalidYamlFiles += 1;
        yamlValidationDiagnostics.set(dataPath, validation.diagnostics);
      }
    }
    for (const entry of transformed) {
      const sourceFile = entry.sourceDocument.sourceFile;
      const outputFile = `manuscripts/${normalizeSlashes(relative(join(sourceRoot, "manuscripts"), resolve(rootDir, sourceFile)))}`;
      const fileDiagnostics = [
        ...(entry.enemy?.diagnostics ?? []),
        ...entry.migration.diagnostics,
      ];
      if (entry.enemy?.dataPath !== undefined) {
        const yamlDiagnostics = yamlValidationDiagnostics.get(entry.enemy.dataPath) ?? [];
        fileDiagnostics.push(...formatValidationDiagnostics(yamlDiagnostics, sourceFile, entry.enemy.dataPath, []));
      }
      const parserResult: ParseResult = parseScenarioMarkdown(entry.migration.output, outputFile);
      const parserDiagnostics = parserResult.ok ? [] : parserResult.diagnostics;
      fileDiagnostics.push(...formatValidationDiagnostics(parserDiagnostics, sourceFile, outputFile, entry.migration.outputLineToSourceLine));
      let references = validationSummary(true, []);
      if (parserResult.ok) {
        const resolved = resolveEnemyDataReferences(parserResult.document, validatedYaml, outputFile);
        if (resolved.ok) {
          referenceValidatedFiles += 1;
        } else {
          referenceFailureFiles += 1;
          fileDiagnostics.push(...formatValidationDiagnostics(resolved.diagnostics, sourceFile, outputFile, entry.migration.outputLineToSourceLine));
        }
        references = validationSummary(resolved.ok, resolved.ok ? [] : resolved.diagnostics);
      } else {
        referenceFailureFiles += 1;
        references = validationSummary(false, []);
      }
      const generatedYamlPath = entry.enemy?.yaml !== undefined ? entry.enemy.dataPath : undefined;
      const yamlOk = generatedYamlPath === undefined || validatedYaml.has(generatedYamlPath);
      const status = fileStatus(parserResult.ok, references.ok, fileDiagnostics, yamlOk);
      if (!dryRun && stageRoot) {
        const target = join(stageRoot, ...outputFile.split("/"));
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, entry.migration.output, "utf8");
      }
      if (generatedYamlPath !== undefined && validatedYaml.has(generatedYamlPath) && !dryRun && stageRoot) {
        const yamlTarget = join(stageRoot, ...generatedYamlPath.split("/"));
        mkdirSync(dirname(yamlTarget), { recursive: true });
        writeFileSync(yamlTarget, validatedYaml.get(generatedYamlPath) ?? "", "utf8");
      }
      const fileReport: MigrationFileReport = {
        source: sourceFile,
        output: outputFile,
        status,
        sourceBytes: Buffer.byteLength(entry.sourceDocument.source, "utf8"),
        outputBytes: Buffer.byteLength(entry.migration.output, "utf8"),
        parser: validationSummary(parserResult.ok, parserDiagnostics),
        references,
        diagnostics: sortDiagnostics(fileDiagnostics),
      };
      if (generatedYamlPath !== undefined) fileReport.generatedYaml = generatedYamlPath;
      fileReports.push(fileReport);
    }
    const copiedAssetFiles = copyAssets(assetSources, stageRoot, dryRun);
    const allDiagnostics = sortDiagnostics([
      ...inventoryDiagnostics,
      ...fileReports.flatMap((file) => file.diagnostics),
    ]);
    const summary = {
      sourceMarkdownFiles: sourceMarkdownFiles.length,
      convertedMarkdownFiles: fileReports.length,
      parserValidatedMarkdownFiles: fileReports.filter((file) => file.parser.ok).length,
      parserFailedMarkdownFiles: fileReports.filter((file) => !file.parser.ok).length,
      successfulMarkdownFiles: fileReports.filter((file) => file.status === "success").length,
      partialMarkdownFiles: fileReports.filter((file) => file.status === "partial").length,
      failedMarkdownFiles: fileReports.filter((file) => file.status === "failed").length,
      generatedYamlFiles: [...yamlByPath.keys()].length,
      validatedYamlFiles,
      invalidYamlFiles,
      referenceValidatedFiles,
      referenceFailureFiles,
      warningCount: allDiagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
      unresolvedDiagnosticCount: allDiagnostics.filter((diagnostic) => diagnostic.severity === "unresolved").length,
      errorCount: allDiagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
      copiedAssetFiles,
    };
    const report: GiftMigrationReport = {
      reportVersion: 1,
      tool: "gift-migration",
      source: sourceRelative,
      output: relativeRepoPath(rootDir, outputPath),
      dryRun,
      inventory,
      summary,
      files: fileReports,
      diagnostics: allDiagnostics,
    };
    if (!dryRun && stageRoot) {
      writeFileSync(join(stageRoot, "migration-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      writeFileSync(join(stageRoot, "migration-report.md"), toMarkdownReport(report), "utf8");
      publishStagedOutput(stageRoot, outputPath);
    }
    return { report, outputPath: relativeRepoPath(rootDir, outputPath), published: !dryRun };
  } catch (error) {
    if (stageRoot && existsSync(stageRoot)) rmSync(stageRoot, { recursive: true, force: true });
    if (error instanceof GiftMigrationFailure) throw error;
    throw new GiftMigrationFailure([
      migrationDiagnostic("<migration>", "MIGRATION_UNEXPECTED_ERROR", error instanceof Error ? error.message : "Unexpected migration failure.", "error", 1, 1, "validation"),
    ]);
  }
}

export function formatMigrationDiagnostic(diagnostic: MigrationDiagnostic): string {
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column} ${diagnostic.code} ${diagnostic.message}`;
}

export function formatMigrationDiagnostics(diagnostics: readonly MigrationDiagnostic[]): string {
  return diagnostics.map(formatMigrationDiagnostic).join("\n");
}
