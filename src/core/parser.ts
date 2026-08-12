import { parseDocument } from "yaml";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import { unified } from "unified";

import type {
  CheckBlock,
  CheckSpec,
  Diagnostic,
  DiagnosticCategory,
  ELoisBlock,
  InfoBlock,
  KnownFieldLabel,
  MarkdownNode,
  MarkdownRoot,
  NarrativeBlock,
  NarrativeBlockBase,
  NarrativeBlockName,
  ParseResult,
  ScenarioDocument,
  ScenarioField,
  ScenarioFrontmatter,
  SkillDifficultyPair,
  SourcePoint,
  SourcePosition,
} from "./types.js";

export const NARRATIVE_BLOCK_NAMES = [
  "dialogue",
  "roleplay",
  "choice",
  "check",
  "info",
  "e-lois",
  "battle",
] as const satisfies readonly NarrativeBlockName[];

export const KNOWN_FIELDS_BY_BLOCK = {
  dialogue: [],
  roleplay: ["対象", "条件", "備考"],
  choice: ["対象", "条件", "分岐", "備考"],
  check: ["技能", "難易度", "必須", "成功時", "失敗時", "備考"],
  info: [
    "技能",
    "難易度",
    "必須",
    "対象",
    "条件",
    "成功時",
    "失敗時",
    "備考",
  ],
  "e-lois": ["技能", "難易度", "必須", "対象", "条件", "備考"],
  battle: ["エネミー", "配置", "戦闘終了条件", "参照", "備考"],
} as const satisfies Readonly<Record<NarrativeBlockName, readonly KnownFieldLabel[]>>;

const RESERVED_DATA_BLOCKS = new Set(["combo", "enemy"]);
const LEGACY_BLOCK_NAMES = new Set([
  "serif",
  "rp",
  "select",
  "section-title",
  "trailer",
  "toc",
]);
const MACHINE_FIELD_LABELS = new Set(["技能", "難易度", "必須"]);

interface SourceLine {
  index: number;
  number: number;
  text: string;
  startOffset: number;
  endOffset: number;
  rawEndOffset: number;
}

interface SourceFile {
  source: string;
  lines: SourceLine[];
}

interface FenceState {
  character: "`" | "~";
  length: number;
}

interface BlockOpening {
  name: string;
  title: string;
  hasAttributeList: boolean;
  hasSeparator: boolean;
}

interface ScannedBlock {
  opening: BlockOpening;
  startLine: SourceLine;
  closeLine?: SourceLine;
  bodyStartOffset: number;
  bodyEndOffset: number;
  endOffset: number;
  bodyLineIndices: number[];
}

interface ScanResult {
  normalRanges: Array<[number, number]>;
  blocks: ScannedBlock[];
  markerEvents: Array<{ offset: number; kind: "block" | "terminator" }>;
}

interface ParsedFrontmatter {
  frontmatter?: ScenarioFrontmatter;
  openingLineIndex?: number;
  closingLineIndex?: number;
  contentStartLineIndex: number;
  contentStartOffset: number;
}

interface ParsedBlockData {
  scanned: ScannedBlock;
  bodyAst: MarkdownRoot;
  contentAst: MarkdownRoot;
  fields: ScenarioField[];
  knownFields: Readonly<Record<string, ScenarioField[]>>;
}

interface FieldLineParse {
  label: string;
  value: string;
  valueStartOffset?: number;
}

interface FieldCollection {
  fields: ScenarioField[];
  maskedBody: string;
}

const markdownParser = unified().use(remarkParse).use(remarkFrontmatter, "yaml");

function splitSource(source: string): SourceFile {
  const firstOffset = source.startsWith("\uFEFF") ? 1 : 0;
  const lines: SourceLine[] = [];
  let cursor = firstOffset;
  let lineNumber = 1;

  while (true) {
    const newlineOffset = source.indexOf("\n", cursor);
    const rawEndOffset = newlineOffset === -1 ? source.length : newlineOffset + 1;
    let endOffset = newlineOffset === -1 ? source.length : newlineOffset;
    if (endOffset > cursor && source[endOffset - 1] === "\r") {
      endOffset -= 1;
    }

    lines.push({
      index: lines.length,
      number: lineNumber,
      text: source.slice(cursor, endOffset),
      startOffset: cursor,
      endOffset,
      rawEndOffset,
    });

    if (newlineOffset === -1) {
      break;
    }

    cursor = rawEndOffset;
    lineNumber += 1;
    if (cursor === source.length) {
      lines.push({
        index: lines.length,
        number: lineNumber,
        text: "",
        startOffset: cursor,
        endOffset: cursor,
        rawEndOffset: cursor,
      });
      break;
    }
  }

  if (lines.length === 0) {
    lines.push({
      index: 0,
      number: 1,
      text: "",
      startOffset: firstOffset,
      endOffset: firstOffset,
      rawEndOffset: firstOffset,
    });
  }

  return { source, lines };
}

function pointAt(file: SourceFile, requestedOffset: number): SourcePoint {
  const offset = Math.max(0, Math.min(requestedOffset, file.source.length));
  let low = 0;
  let high = file.lines.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = file.lines[middle];
    if (!line) break;
    if (line.startOffset <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  const line = file.lines[Math.max(0, Math.min(high, file.lines.length - 1))];
  if (!line) {
    return { line: 1, column: 1, offset };
  }

  return {
    line: line.number,
    column: Math.max(1, offset - line.startOffset + 1),
    offset,
  };
}

function positionFromOffsets(file: SourceFile, startOffset: number, endOffset: number): SourcePosition {
  return {
    start: pointAt(file, startOffset),
    end: pointAt(file, endOffset),
  };
}

function positionFromLine(file: SourceFile, line: SourceLine): SourcePosition {
  return positionFromOffsets(file, line.startOffset, line.endOffset);
}

function issue(
  diagnostics: Diagnostic[],
  file: SourceFile,
  filePath: string,
  category: DiagnosticCategory,
  code: string,
  message: string,
  startOffset: number,
  endOffset = startOffset + 1,
): void {
  const position = positionFromOffsets(file, startOffset, Math.max(startOffset, endOffset));
  diagnostics.push({
    category,
    code,
    message,
    file: filePath,
    line: position.start.line,
    column: position.start.column,
    position,
    severity: "error",
  });
}

function trimHorizontal(value: string): string {
  return value.replace(/^[ \t]+|[ \t]+$/g, "");
}

function isBlank(line: SourceLine): boolean {
  return /^[ \t]*$/.test(line.text);
}

function isFenceStart(line: string): FenceState | undefined {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return undefined;
  const marker = match[2];
  if (!marker) return undefined;
  if (marker[0] === "`" && match[3]?.includes("`")) return undefined;
  return {
    character: marker[0] as "`" | "~",
    length: marker.length,
  };
}

function isFenceEnd(line: string, fence: FenceState): boolean {
  const escapedCharacter = fence.character === "`" ? "`" : "~";
  const expression = new RegExp(`^ {0,3}${escapedCharacter}{${fence.length},}[ \\t]*$`);
  return expression.test(line);
}

function advanceFence(line: string, current: FenceState | undefined): FenceState | undefined {
  if (current) {
    return isFenceEnd(line, current) ? undefined : current;
  }
  return isFenceStart(line);
}

function parseBlockOpening(line: string): BlockOpening | undefined {
  if (!line.startsWith(":::") || line === ":::") return undefined;

  const restAfterMarker = line.slice(3);
  if (restAfterMarker.length === 0) return undefined;

  const tokenMatch = /^[^ \t]+/.exec(restAfterMarker);
  const token = tokenMatch?.[0] ?? "";
  const tokenRemainder = restAfterMarker.slice(token.length);
  const hasSeparator = tokenRemainder.length > 0 && /^[ \t]/.test(tokenRemainder);

  let name = token;
  let hasAttributeList = false;
  const attributeToken = /^([A-Za-z][A-Za-z0-9-]*)(\{.*\})$/.exec(token);
  if (attributeToken) {
    name = attributeToken[1] ?? token;
    hasAttributeList = true;
  }

  let title = hasSeparator ? trimHorizontal(tokenRemainder) : "";
  if (title && /\{[^{}\r\n]*\}[ \t]*$/.test(title)) {
    hasAttributeList = true;
  }
  if (!hasSeparator && token && !attributeToken) {
    hasAttributeList = /\{[^{}\r\n]*\}/.test(token);
  }

  if (hasAttributeList && !title && attributeToken) {
    title = "";
  }

  return { name, title, hasAttributeList, hasSeparator };
}

function scanBlocks(
  file: SourceFile,
  contentStartLineIndex: number,
  diagnostics: Diagnostic[],
  filePath: string,
): ScanResult {
  const normalRanges: Array<[number, number]> = [];
  const blocks: ScannedBlock[] = [];
  const markerEvents: Array<{ offset: number; kind: "block" | "terminator" }> = [];
  const lines = file.lines;
  const safeStart = Math.max(0, Math.min(contentStartLineIndex, lines.length));
  let segmentStart = safeStart;
  let normalFence: FenceState | undefined;
  let index = safeStart;

  const pushNormalRange = (start: number, end: number): void => {
    if (end > start) normalRanges.push([start, end]);
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;

    if (!normalFence && line.text === ":::") {
      pushNormalRange(segmentStart, index);
      markerEvents.push({ offset: line.startOffset, kind: "terminator" });
      issue(
        diagnostics,
        file,
        filePath,
        "block",
        "EXTRA_TERMINATOR",
        "A block terminator appears outside a narrative block.",
        line.startOffset,
        line.endOffset,
      );
      segmentStart = index + 1;
      index += 1;
      continue;
    }

    if (!normalFence && line.text.startsWith(":::")) {
      pushNormalRange(segmentStart, index);
      const opening = parseBlockOpening(line.text) ?? {
        name: "",
        title: "",
        hasAttributeList: false,
        hasSeparator: false,
      };
      markerEvents.push({ offset: line.startOffset, kind: "block" });

      let bodyFence: FenceState | undefined;
      let closeLineIndex = -1;
      for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
        const bodyLine = lines[bodyIndex];
        if (!bodyLine) break;
        if (!bodyFence && bodyLine.text === ":::") {
          closeLineIndex = bodyIndex;
          break;
        }
        if (!bodyFence && bodyLine.text.startsWith(":::")) {
          issue(
            diagnostics,
            file,
            filePath,
            "block",
            "NESTED_BLOCK",
            "Narrative blocks cannot be nested.",
            bodyLine.startOffset,
            bodyLine.endOffset,
          );
        }
        bodyFence = advanceFence(bodyLine.text, bodyFence);
      }

      const bodyStartLine = lines[index + 1];
      const bodyStartOffset = bodyStartLine?.startOffset ?? file.source.length;
      const closeLine = closeLineIndex >= 0 ? lines[closeLineIndex] : undefined;
      const bodyEndOffset = closeLine?.startOffset ?? file.source.length;
      const endOffset = closeLine?.endOffset ?? file.source.length;
      const bodyLineIndices: number[] = [];
      const bodyEndLineIndex = closeLineIndex >= 0 ? closeLineIndex : lines.length;
      for (let bodyIndex = index + 1; bodyIndex < bodyEndLineIndex; bodyIndex += 1) {
        bodyLineIndices.push(bodyIndex);
      }

      if (!closeLine) {
        issue(
          diagnostics,
          file,
          filePath,
          "block",
          "UNCLOSED_BLOCK",
          `Narrative block ${opening.name ? `"${opening.name}" ` : ""}is not closed before end of file.`,
          line.startOffset,
          line.endOffset,
        );
      }

      blocks.push({
        opening,
        startLine: line,
        ...(closeLine ? { closeLine } : {}),
        bodyStartOffset,
        bodyEndOffset,
        endOffset,
        bodyLineIndices,
      });

      segmentStart = closeLineIndex >= 0 ? closeLineIndex + 1 : lines.length;
      index = segmentStart;
      normalFence = undefined;
      continue;
    }

    normalFence = advanceFence(line.text, normalFence);
    index += 1;
  }

  pushNormalRange(segmentStart, lines.length);
  return { normalRanges, blocks, markerEvents };
}

function adjustMarkdownTree(
  node: MarkdownNode,
  baseOffset: number,
  baseLine: number,
  baseColumn: number,
): void {
  if (node.position) {
    const start = node.position.start;
    const end = node.position.end;
    const startLine = baseLine + start.line - 1;
    const endLine = baseLine + end.line - 1;
    node.position = {
      start: {
        line: startLine,
        column: start.column + (start.line === 1 ? baseColumn - 1 : 0),
        offset: baseOffset + start.offset,
      },
      end: {
        line: endLine,
        column: end.column + (end.line === 1 ? baseColumn - 1 : 0),
        offset: baseOffset + end.offset,
      },
    };
  }
  for (const child of node.children ?? []) {
    adjustMarkdownTree(child, baseOffset, baseLine, baseColumn);
  }
}

function parseMarkdownFragment(
  fragment: string,
  baseOffset: number,
  baseLine: number,
  baseColumn = 1,
): MarkdownRoot {
  const parsed = markdownParser.parse(fragment) as unknown as MarkdownRoot;
  adjustMarkdownTree(parsed, baseOffset, baseLine, baseColumn);
  return parsed;
}

function ensureRootPosition(root: MarkdownRoot, file: SourceFile, startOffset: number, endOffset: number): void {
  if (!root.position) {
    root.position = positionFromOffsets(file, startOffset, endOffset);
  }
}

function plainText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

function walk(node: MarkdownNode, callback: (node: MarkdownNode) => void): void {
  callback(node);
  for (const child of node.children ?? []) walk(child, callback);
}

function parseFieldLine(line: SourceLine): FieldLineParse | undefined {
  const match = /^\[([^\]\r\n]+)\](?:[ \t]+(.*?))?[ \t]*$/.exec(line.text);
  if (!match) return undefined;
  const label = match[1] ?? "";
  const value = (match[2] ?? "").trim();
  const closeBracketOffset = line.text.indexOf("]") + 1;
  const valueStartInLine = value.length > 0
    ? closeBracketOffset + (line.text.slice(closeBracketOffset).match(/^[ \t]*/) ?? [""])[0].length
    : undefined;
  return {
    label,
    value,
    ...(valueStartInLine === undefined
      ? {}
      : { valueStartOffset: line.startOffset + valueStartInLine }),
  };
}

function topLevelParagraphStartsAt(root: MarkdownRoot, lineNumber: number): boolean {
  return root.children.some((node) => {
    const position = node.position;
    return node.type === "paragraph"
      && position?.start.line === lineNumber
      && position.start.column === 1;
  });
}

function collectFields(
  file: SourceFile,
  scanned: ScannedBlock,
  bodyAst: MarkdownRoot,
): FieldCollection {
  const directLines: Array<{ line: SourceLine; parsed: FieldLineParse }> = [];
  let fence: FenceState | undefined;
  let fieldRun = false;

  for (const lineIndex of scanned.bodyLineIndices) {
    const line = file.lines[lineIndex];
    if (!line) continue;

    if (fence) {
      fence = advanceFence(line.text, fence);
      continue;
    }
    const nextFence = isFenceStart(line.text);
    if (nextFence) {
      fence = nextFence;
      fieldRun = false;
      continue;
    }
    if (isBlank(line)) continue;

    const parsed = parseFieldLine(line);
    if (!parsed) {
      fieldRun = false;
      continue;
    }

    const direct = fieldRun || topLevelParagraphStartsAt(bodyAst, line.number);
    if (direct) {
      directLines.push({ line, parsed });
      fieldRun = true;
    } else {
      fieldRun = false;
    }
  }

  // Use UTF-16 code units here because mdast offsets and JavaScript string
  // slices use the same coordinate system (Array.from would collapse emoji
  // surrogate pairs and shift every later position).
  const mask = file.source.slice(scanned.bodyStartOffset, scanned.bodyEndOffset).split("");
  for (const { line } of directLines) {
    const localStart = line.startOffset - scanned.bodyStartOffset;
    const localEnd = line.endOffset - scanned.bodyStartOffset;
    for (let index = localStart; index < localEnd; index += 1) {
      if (index >= 0 && index < mask.length) mask[index] = " ";
    }
  }

  const fields: ScenarioField[] = directLines.map(({ line, parsed }) => {
    const position = positionFromLine(file, line);
    const valueStartOffset = parsed.valueStartOffset;
    const valueAst = valueStartOffset === undefined
      ? ({ type: "root", children: [] } satisfies MarkdownRoot)
      : parseMarkdownFragment(
          parsed.value,
          valueStartOffset,
          line.number,
          pointAt(file, valueStartOffset).column,
        );
    if (valueStartOffset !== undefined) {
      ensureRootPosition(valueAst, file, valueStartOffset, valueStartOffset + parsed.value.length);
    }
    const fieldNode: MarkdownNode = {
      type: "scenarioField",
      label: parsed.label,
      value: parsed.value,
      position,
      children: valueAst.children,
    };
    const field: ScenarioField = {
      label: parsed.label,
      value: parsed.value,
      text: plainText(valueAst),
      raw: line.text,
      position,
      valueAst,
      node: fieldNode,
    };
    if (valueStartOffset !== undefined) {
      field.valuePosition = positionFromOffsets(
        file,
        valueStartOffset,
        valueStartOffset + parsed.value.length,
      );
    }
    return field;
  });

  return { fields, maskedBody: mask.join("") };
}

function frontmatterKeyOffsets(file: SourceFile, startIndex: number, endIndex: number, key: string): number[] {
  const offsets: number[] = [];
  for (let index = startIndex; index < endIndex; index += 1) {
    const line = file.lines[index];
    if (!line) continue;
    const match = /^(\s*)(?:(['"])(.*?)\2|([A-Za-z0-9_-]+))\s*:/.exec(line.text);
    if (!match) continue;
    const actualKey = match[3] ?? match[4];
    if (actualKey === key) {
      offsets.push(line.startOffset + (match[1]?.length ?? 0));
    }
  }
  return offsets;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLanguageTag(value: string): boolean {
  return /^(?:[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*|x(?:-[A-Za-z0-9]{1,8})+|i(?:-[A-Za-z0-9]{1,8})+)$/.test(value);
}

function parseFrontmatter(
  file: SourceFile,
  diagnostics: Diagnostic[],
  filePath: string,
): ParsedFrontmatter {
  const firstLine = file.lines[0];
  if (!firstLine || firstLine.text !== "---") {
    issue(
      diagnostics,
      file,
      filePath,
      "frontmatter",
      "FRONTMATTER_REQUIRED",
      "A YAML frontmatter section must start at the beginning of the file.",
      firstLine?.startOffset ?? 0,
      firstLine?.endOffset ?? Math.min(1, file.source.length),
    );
    return {
      contentStartLineIndex: 0,
      contentStartOffset: firstLine?.startOffset ?? 0,
    };
  }

  let closingLineIndex = -1;
  for (let index = 1; index < file.lines.length; index += 1) {
    if (file.lines[index]?.text === "---") {
      closingLineIndex = index;
      break;
    }
  }

  if (closingLineIndex < 0) {
    issue(
      diagnostics,
      file,
      filePath,
      "frontmatter",
      "FRONTMATTER_UNCLOSED",
      "The YAML frontmatter section is not closed by a line containing only ---.",
      firstLine.startOffset,
      firstLine.endOffset,
    );
    const contentLine = file.lines[1];
    return {
      openingLineIndex: 0,
      contentStartLineIndex: 1,
      contentStartOffset: contentLine?.startOffset ?? file.source.length,
    };
  }

  const closingLine = file.lines[closingLineIndex];
  if (!closingLine) {
    return { contentStartLineIndex: closingLineIndex + 1, contentStartOffset: file.source.length };
  }
  const bodyStartOffset = firstLine.rawEndOffset;
  const bodyEndOffset = closingLine.startOffset;
  const raw = file.source.slice(bodyStartOffset, bodyEndOffset);
  const yamlNode: MarkdownNode = {
    type: "yaml",
    value: raw,
    position: positionFromOffsets(file, firstLine.startOffset, closingLine.endOffset),
  };

  let parsedValue: unknown;
  try {
    const document = parseDocument(raw, { prettyErrors: false, uniqueKeys: true });
    for (const error of document.errors) {
      const errorStart = Array.isArray(error.pos) ? error.pos[0] ?? 0 : 0;
      const errorEnd = Array.isArray(error.pos) ? error.pos[1] ?? errorStart + 1 : errorStart + 1;
      issue(
        diagnostics,
        file,
        filePath,
        "frontmatter",
        `YAML_${error.code}`,
        error.message,
        bodyStartOffset + errorStart,
        bodyStartOffset + errorEnd,
      );
    }
    parsedValue = document.toJS();
  } catch (error) {
    issue(
      diagnostics,
      file,
      filePath,
      "frontmatter",
      "YAML_PARSE_ERROR",
      error instanceof Error ? error.message : "The frontmatter YAML could not be parsed.",
      bodyStartOffset,
      Math.max(bodyStartOffset + 1, bodyEndOffset),
    );
  }

  if (!isRecord(parsedValue)) {
    issue(
      diagnostics,
      file,
      filePath,
      "frontmatter",
      "FRONTMATTER_NOT_MAPPING",
      "Frontmatter must be a top-level YAML mapping.",
      bodyStartOffset,
      Math.max(bodyStartOffset + 1, bodyEndOffset),
    );
    return {
      openingLineIndex: 0,
      closingLineIndex,
      contentStartLineIndex: closingLineIndex + 1,
      contentStartOffset: closingLine.rawEndOffset,
    };
  }

  const values = parsedValue;
  for (const key of Object.keys(values)) {
    if (key !== "id" && key !== "kicker" && key !== "lang") {
      const offsets = frontmatterKeyOffsets(file, 1, closingLineIndex, key);
      issue(
        diagnostics,
        file,
        filePath,
        "frontmatter",
        "FRONTMATTER_UNKNOWN_KEY",
        `Unknown frontmatter key "${key}"; expected id, kicker, or lang.`,
        offsets[0] ?? bodyStartOffset,
        (offsets[0] ?? bodyStartOffset) + Math.max(1, key.length),
      );
    }
  }

  const id = values.id;
  const idOffsets = frontmatterKeyOffsets(file, 1, closingLineIndex, "id");
  if (typeof id !== "string" || id.length === 0) {
    issue(
      diagnostics,
      file,
      filePath,
      "frontmatter",
      "FRONTMATTER_ID_REQUIRED",
      "Frontmatter id must be a non-empty string.",
      idOffsets[0] ?? bodyStartOffset,
    );
  } else if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    issue(
      diagnostics,
      file,
      filePath,
      "frontmatter",
      "FRONTMATTER_ID_INVALID",
      "Frontmatter id must match [A-Za-z][A-Za-z0-9_-]*.",
      idOffsets[0] ?? bodyStartOffset,
    );
  }

  const optionalValues: Partial<Pick<ScenarioFrontmatter, "kicker" | "lang">> = {};
  for (const key of ["kicker", "lang"] as const) {
    if (!(key in values)) continue;
    const value = values[key];
    const offsets = frontmatterKeyOffsets(file, 1, closingLineIndex, key);
    if (typeof value !== "string" || value.trim().length === 0) {
      issue(
        diagnostics,
        file,
        filePath,
        "frontmatter",
        `FRONTMATTER_${key.toUpperCase()}_TYPE`,
        `Frontmatter ${key} must be a non-empty string when present.`,
        offsets[0] ?? bodyStartOffset,
      );
      continue;
    }
    if (key === "lang" && !isLanguageTag(value)) {
      issue(
        diagnostics,
        file,
        filePath,
        "frontmatter",
        "FRONTMATTER_LANG_INVALID",
        "Frontmatter lang must be a valid language tag.",
        offsets[0] ?? bodyStartOffset,
      );
      continue;
    }
    optionalValues[key] = value;
  }

  if (typeof id !== "string" || id.length === 0 || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    return {
      openingLineIndex: 0,
      closingLineIndex,
      contentStartLineIndex: closingLineIndex + 1,
      contentStartOffset: closingLine.rawEndOffset,
    };
  }

  const frontmatter: ScenarioFrontmatter = {
    id,
    values,
    raw,
    position: positionFromOffsets(file, firstLine.startOffset, closingLine.endOffset),
    node: yamlNode,
  };
  if (optionalValues.kicker !== undefined) frontmatter.kicker = optionalValues.kicker;
  if (optionalValues.lang !== undefined) frontmatter.lang = optionalValues.lang;

  return {
    frontmatter,
    openingLineIndex: 0,
    closingLineIndex,
    contentStartLineIndex: closingLineIndex + 1,
    contentStartOffset: closingLine.rawEndOffset,
  };
}

function reportRawHtml(
  root: MarkdownRoot,
  diagnostics: Diagnostic[],
  file: SourceFile,
  filePath: string,
): void {
  walk(root, (node) => {
    if (node.type !== "html" || !node.position) return;
    issue(
      diagnostics,
      file,
      filePath,
      "raw-html",
      "RAW_HTML",
      "Raw HTML is not allowed in scenario Markdown.",
      node.position.start.offset,
      Math.max(node.position.start.offset + 1, node.position.end.offset),
    );
  });
}

function reportH1InBlock(
  root: MarkdownRoot,
  diagnostics: Diagnostic[],
  file: SourceFile,
  filePath: string,
): void {
  walk(root, (node) => {
    if (node.type !== "heading" || node.depth !== 1 || !node.position) return;
    issue(
      diagnostics,
      file,
      filePath,
      "chapter",
      "H1_IN_BLOCK",
      "H1 is reserved for the chapter title and cannot appear inside a narrative block.",
      node.position.start.offset,
      node.position.end.offset,
    );
  });
}

function knownLabelsFor(name: string): readonly string[] {
  if (!Object.prototype.hasOwnProperty.call(KNOWN_FIELDS_BY_BLOCK, name)) return [];
  return KNOWN_FIELDS_BY_BLOCK[name as NarrativeBlockName];
}

function validateFieldValues(
  name: string,
  fields: ScenarioField[],
  diagnostics: Diagnostic[],
  file: SourceFile,
  filePath: string,
): void {
  const knownLabels = new Set(knownLabelsFor(name));
  for (const field of fields) {
    if (!knownLabels.has(field.label)) {
      issue(
        diagnostics,
        file,
        filePath,
        "field",
        "UNKNOWN_FIELD",
        `${name ? `${name}: ` : ""}unknown reserved field [${field.label}].`,
        field.position.start.offset,
        field.position.end.offset,
      );
      continue;
    }

    if (field.label === "必須") {
      const bareMandatoryAllowed = name === "check" || name === "info" || name === "e-lois";
      if (!bareMandatoryAllowed || field.value.length > 0) {
        issue(
          diagnostics,
          file,
          filePath,
          "field",
          "MANDATORY_FIELD_FORMAT",
          "[必須] must be a standalone field without a value.",
          field.position.start.offset,
          field.position.end.offset,
        );
      }
      continue;
    }

    if (field.value.length === 0) {
      issue(
        diagnostics,
        file,
        filePath,
        "field",
        "FIELD_VALUE_REQUIRED",
        `Field [${field.label}] must have a non-empty value.`,
        field.position.start.offset,
        field.position.end.offset,
      );
    }
  }
}

function firstContentOffset(root: MarkdownRoot): number | undefined {
  return root.children[0]?.position?.start.offset;
}

function validateCheck(
  data: ParsedBlockData,
  diagnostics: Diagnostic[],
  file: SourceFile,
  filePath: string,
): CheckSpec | undefined {
  const { fields, contentAst, scanned } = data;
  const firstField = fields[0];
  const firstContent = contentAst.children[0];
  const firstContentOffsetValue = firstContentOffset(contentAst);
  const firstFieldIsFirst = firstField !== undefined
    && (firstContentOffsetValue === undefined || firstField.position.start.offset < firstContentOffsetValue);

  if (!firstField || firstField.label !== "技能" || !firstFieldIsFirst) {
    const offset = !firstField || !firstFieldIsFirst
      ? (firstContent?.position?.start.offset ?? firstField?.position.start.offset ?? scanned.startLine.startOffset)
      : firstField.position.start.offset;
    issue(
      diagnostics,
      file,
      filePath,
      "field",
      "CHECK_SKILL_MISSING",
      "check must start with a [技能] field.",
      offset,
    );
  }

  if (!firstField || firstField.label !== "技能") return undefined;

  const difficultyField = fields[1];
  if (!difficultyField || difficultyField.label !== "難易度") {
    issue(
      diagnostics,
      file,
      filePath,
      "field",
      "CHECK_DIFFICULTY_MISSING",
      "check [技能] must be followed by [難易度].",
      firstField.position.start.offset,
      firstField.position.end.offset,
    );
  }

  if (!difficultyField || difficultyField.label !== "難易度") return undefined;

  const difficultyMatch = /^[0-9]+$/.test(difficultyField.value);
  if (!difficultyMatch) {
    issue(
      diagnostics,
      file,
      filePath,
      "field",
      "CHECK_DIFFICULTY_INVALID",
      "check [難易度] must be a non-negative ASCII integer.",
      difficultyField.position.start.offset,
      difficultyField.position.end.offset,
    );
  }

  const bodyOffset = firstContentOffsetValue ?? Number.POSITIVE_INFINITY;
  let mandatory = false;
  let mandatoryField: ScenarioField | undefined;
  let pairEndIndex = 2;
  const possibleMandatory = fields[2];
  if (possibleMandatory?.label === "必須" && possibleMandatory.position.start.offset < bodyOffset) {
    mandatory = true;
    mandatoryField = possibleMandatory;
    pairEndIndex = 3;
  }

  for (let index = pairEndIndex; index < fields.length; index += 1) {
    const field = fields[index];
    if (!field || !MACHINE_FIELD_LABELS.has(field.label)) continue;
    const code = field.position.start.offset > bodyOffset
      ? "CHECK_FIELD_AFTER_BODY"
      : "CHECK_SECOND_PAIR";
    const message = code === "CHECK_FIELD_AFTER_BODY"
      ? "Machine-readable check fields cannot appear after normal Markdown body content."
      : "check may contain exactly one skill/difficulty pair.";
    issue(
      diagnostics,
      file,
      filePath,
      "field",
      code,
      message,
      field.position.start.offset,
      field.position.end.offset,
    );
  }

  if (!difficultyMatch || firstField.value.length === 0) return undefined;
  const result: CheckSpec = {
    skill: firstField.text,
    difficulty: Number(difficultyField.value),
    mandatory,
    skillField: firstField,
    difficultyField,
  };
  if (mandatoryField) result.mandatoryField = mandatoryField;
  return result;
}

function validateSkillDifficultyPairs(
  name: "info" | "e-lois",
  fields: ScenarioField[],
  diagnostics: Diagnostic[],
  file: SourceFile,
  filePath: string,
): SkillDifficultyPair<string>[] {
  const pairs: SkillDifficultyPair<string>[] = [];
  let pendingSkill: ScenarioField | undefined;
  let previousField: ScenarioField | undefined;

  for (const field of fields) {
    if (field.label === "技能") {
      if (pendingSkill) {
        issue(
          diagnostics,
          file,
          filePath,
          "field",
          "PAIR_DIFFICULTY_MISSING",
          `${name} [技能] must be followed by a [難易度] field.`,
          pendingSkill.position.start.offset,
          pendingSkill.position.end.offset,
        );
      }
      pendingSkill = field;
    } else if (field.label === "難易度") {
      if (!pendingSkill) {
        issue(
          diagnostics,
          file,
          filePath,
          "field",
          "PAIR_SKILL_MISSING",
          `${name} [難易度] must follow a [技能] field.`,
          field.position.start.offset,
          field.position.end.offset,
        );
      } else {
        pairs.push({
          skill: pendingSkill.text,
          difficulty: field.value,
          mandatory: false,
          skillField: pendingSkill,
          difficultyField: field,
        });
        pendingSkill = undefined;
      }
    } else if (field.label === "必須") {
      const pair = pairs[pairs.length - 1];
      if (!pair || previousField?.label !== "難易度") {
        issue(
          diagnostics,
          file,
          filePath,
          "field",
          "MANDATORY_FIELD_POSITION",
          `${name} [必須] must follow a [難易度] field.`,
          field.position.start.offset,
          field.position.end.offset,
        );
      } else {
        pair.mandatory = true;
        pair.mandatoryField = field;
      }
    }
    previousField = field;
  }

  if (pendingSkill) {
    issue(
      diagnostics,
      file,
      filePath,
      "field",
      "PAIR_DIFFICULTY_MISSING",
      `${name} [技能] must be followed by a [難易度] field.`,
      pendingSkill.position.start.offset,
      pendingSkill.position.end.offset,
    );
  }

  return pairs;
}

function parseBlockData(
  file: SourceFile,
  scanned: ScannedBlock,
  diagnostics: Diagnostic[],
  filePath: string,
): ParsedBlockData {
  const body = file.source.slice(scanned.bodyStartOffset, scanned.bodyEndOffset);
  const bodyStartPoint = pointAt(file, scanned.bodyStartOffset);
  let bodyAst: MarkdownRoot;
  try {
    bodyAst = parseMarkdownFragment(body, scanned.bodyStartOffset, bodyStartPoint.line);
  } catch (error) {
    issue(
      diagnostics,
      file,
      filePath,
      "markdown",
      "MARKDOWN_PARSE_ERROR",
      error instanceof Error ? error.message : "The block body could not be parsed as Markdown.",
      scanned.bodyStartOffset,
      Math.max(scanned.bodyStartOffset + 1, scanned.bodyEndOffset),
    );
    bodyAst = { type: "root", children: [] };
  }
  ensureRootPosition(bodyAst, file, scanned.bodyStartOffset, scanned.bodyEndOffset);

  const collection = collectFields(file, scanned, bodyAst);
  let contentAst: MarkdownRoot;
  try {
    contentAst = parseMarkdownFragment(
      collection.maskedBody,
      scanned.bodyStartOffset,
      bodyStartPoint.line,
    );
  } catch (error) {
    issue(
      diagnostics,
      file,
      filePath,
      "markdown",
      "MARKDOWN_PARSE_ERROR",
      error instanceof Error ? error.message : "The block content could not be parsed as Markdown.",
      scanned.bodyStartOffset,
      Math.max(scanned.bodyStartOffset + 1, scanned.bodyEndOffset),
    );
    contentAst = { type: "root", children: [] };
  }
  ensureRootPosition(contentAst, file, scanned.bodyStartOffset, scanned.bodyEndOffset);

  const knownLabels = new Set(knownLabelsFor(scanned.opening.name));
  const knownFields: Record<string, ScenarioField[]> = {};
  for (const field of collection.fields) {
    if (!knownLabels.has(field.label)) continue;
    const existing = knownFields[field.label] ?? [];
    existing.push(field);
    knownFields[field.label] = existing;
  }

  return {
    scanned,
    bodyAst,
    contentAst,
    fields: collection.fields,
    knownFields,
  };
}

function makeBlock(
  file: SourceFile,
  data: ParsedBlockData,
  diagnostics: Diagnostic[],
  filePath: string,
): NarrativeBlock | undefined {
  const { scanned, bodyAst, contentAst, fields, knownFields } = data;
  const name = scanned.opening.name;
  if (!NARRATIVE_BLOCK_NAMES.includes(name as NarrativeBlockName)) {
    if (RESERVED_DATA_BLOCKS.has(name)) {
      issue(
        diagnostics,
        file,
        filePath,
        "block",
        `RESERVED_${name.toUpperCase()}_BLOCK`,
        `${name} is structured data, not a narrative block; use a normal link to external YAML data.`,
        scanned.startLine.startOffset,
        scanned.startLine.endOffset,
      );
    } else if (LEGACY_BLOCK_NAMES.has(name)) {
      issue(
        diagnostics,
        file,
        filePath,
        "block",
        "LEGACY_BLOCK_NAME",
        `Legacy block name ${name} is not accepted in the canonical syntax.`,
        scanned.startLine.startOffset,
        scanned.startLine.endOffset,
      );
    } else {
      issue(
        diagnostics,
        file,
        filePath,
        "block",
        "UNKNOWN_BLOCK",
        `Unknown narrative block ${name ? `"${name}"` : "name"}.`,
        scanned.startLine.startOffset,
        scanned.startLine.endOffset,
      );
    }
    return undefined;
  }

  if (!scanned.opening.hasSeparator || scanned.opening.title.length === 0) {
    if (!scanned.opening.hasAttributeList) {
      issue(
        diagnostics,
        file,
        filePath,
        "block",
        "BLOCK_TITLE_REQUIRED",
        `${name} requires a non-empty display title after the block name.`,
        scanned.startLine.startOffset,
        scanned.startLine.endOffset,
      );
    }
  }
  if (scanned.opening.hasAttributeList) {
    issue(
      diagnostics,
      file,
      filePath,
      "block",
      "BLOCK_ATTRIBUTE_LIST",
      "Narrative block start lines do not accept attribute lists.",
      scanned.startLine.startOffset,
      scanned.startLine.endOffset,
    );
  }

  validateFieldValues(name, fields, diagnostics, file, filePath);
  reportRawHtml(bodyAst, diagnostics, file, filePath);
  reportH1InBlock(bodyAst, diagnostics, file, filePath);
  if (contentAst.children.length === 0) {
    issue(
      diagnostics,
      file,
      filePath,
      "block",
      "BLOCK_BODY_REQUIRED",
      `${name} must contain non-empty Markdown body content.`,
      scanned.bodyStartOffset,
      Math.max(scanned.bodyStartOffset + 1, scanned.bodyEndOffset),
    );
  }

  const base: NarrativeBlockBase = {
    name: name as NarrativeBlockName,
    type: "narrative-block",
    displayTitle: scanned.opening.title,
    title: scanned.opening.title,
    body: file.source.slice(scanned.bodyStartOffset, scanned.bodyEndOffset),
    bodyAst,
    contentAst,
    fields,
    knownFields,
    position: positionFromOffsets(file, scanned.startLine.startOffset, scanned.endOffset),
    bodyPosition: positionFromOffsets(file, scanned.bodyStartOffset, scanned.bodyEndOffset),
  };

  if (name === "check") {
    const check = validateCheck(data, diagnostics, file, filePath);
    const block: CheckBlock = { ...base, name: "check" };
    if (check) block.check = check;
    return block;
  }
  if (name === "info") {
    const block: InfoBlock = {
      ...base,
      name: "info",
      skillDifficultyPairs: validateSkillDifficultyPairs("info", fields, diagnostics, file, filePath),
    };
    return block;
  }
  if (name === "e-lois") {
    const block: ELoisBlock = {
      ...base,
      name: "e-lois",
      skillDifficultyPairs: validateSkillDifficultyPairs("e-lois", fields, diagnostics, file, filePath),
    };
    return block;
  }

  return { ...base, name } as NarrativeBlock;
}

function isHeadingOne(node: MarkdownNode): boolean {
  return node.type === "heading" && node.depth === 1;
}

function headingHasAttributeList(file: SourceFile, node: MarkdownNode): boolean {
  const offset = node.position?.start.offset;
  if (offset === undefined) return false;
  const line = file.lines.find((candidate) => candidate.startOffset <= offset && offset <= candidate.endOffset);
  if (!line) return false;
  return /^ {0,3}#[ \t]+.*\{[^{}\r\n]*\}[ \t]*$/.test(line.text);
}

function validateChapter(
  file: SourceFile,
  normalNodes: MarkdownNode[],
  markerEvents: Array<{ offset: number; kind: "block" | "terminator" }>,
  contentStartOffset: number,
  diagnostics: Diagnostic[],
  filePath: string,
): MarkdownNode | undefined {
  const headings = normalNodes.filter(isHeadingOne);
  const events: Array<{ offset: number; kind: "markdown" | "marker"; node?: MarkdownNode }> = [
    ...normalNodes
      .filter((node) => node.position)
      .map((node) => ({ offset: node.position?.start.offset ?? 0, kind: "markdown" as const, node })),
    ...markerEvents.map((event) => ({ offset: event.offset, kind: "marker" as const })),
  ].sort((left, right) => left.offset - right.offset);
  const firstEvent = events[0];
  const firstHeading = headings[0];

  if (!firstHeading) {
    issue(
      diagnostics,
      file,
      filePath,
      "chapter",
      "CHAPTER_H1_MISSING",
      "The first non-empty Markdown element after frontmatter must be the chapter H1.",
      firstEvent?.offset ?? contentStartOffset,
    );
  } else {
    if (!firstEvent || firstEvent.node !== firstHeading) {
      issue(
        diagnostics,
        file,
        filePath,
        "chapter",
        "CHAPTER_H1_NOT_FIRST",
        "The first non-empty Markdown element after frontmatter must be the chapter H1.",
        firstEvent?.offset ?? firstHeading.position?.start.offset ?? contentStartOffset,
      );
    }
    for (const heading of headings.slice(1)) {
      if (!heading.position) continue;
      issue(
        diagnostics,
        file,
        filePath,
        "chapter",
        "CHAPTER_H1_MULTIPLE",
        "A chapter document may contain exactly one H1.",
        heading.position.start.offset,
        heading.position.end.offset,
      );
    }
  }

  for (const heading of headings) {
    if (!heading.position) continue;
    if (plainText(heading).trim().length === 0) {
      issue(
        diagnostics,
        file,
        filePath,
        "chapter",
        "CHAPTER_H1_EMPTY",
        "The chapter H1 must have a non-empty title.",
        heading.position.start.offset,
        heading.position.end.offset,
      );
    }
    if (headingHasAttributeList(file, heading)) {
      issue(
        diagnostics,
        file,
        filePath,
        "chapter",
        "CHAPTER_H1_ATTRIBUTE_LIST",
        "The chapter H1 must be plain Markdown without an attribute list or .scene-title.",
        heading.position.start.offset,
        heading.position.end.offset,
      );
    }
  }

  return firstHeading;
}

function parseNormalRange(
  file: SourceFile,
  range: [number, number],
): MarkdownRoot | undefined {
  const [startIndex, endIndex] = range;
  const firstLine = file.lines[startIndex];
  const lastLine = file.lines[endIndex - 1];
  if (!firstLine || !lastLine) return undefined;
  const startOffset = firstLine.startOffset;
  const endOffset = lastLine.rawEndOffset;
  if (endOffset <= startOffset) return undefined;
  return parseMarkdownFragment(
    file.source.slice(startOffset, endOffset),
    startOffset,
    firstLine.number,
  );
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.sort((left, right) => {
    if (left.position.start.offset !== right.position.start.offset) {
      return left.position.start.offset - right.position.start.offset;
    }
    return left.code.localeCompare(right.code);
  });
}

export function parseScenarioMarkdown(source: string, filePath = "<input>"): ParseResult {
  const file = splitSource(source);
  const diagnostics: Diagnostic[] = [];
  const parsedFrontmatter = parseFrontmatter(file, diagnostics, filePath);
  const scan = scanBlocks(file, parsedFrontmatter.contentStartLineIndex, diagnostics, filePath);

  const normalRoots: MarkdownRoot[] = [];
  const normalNodes: MarkdownNode[] = [];
  for (const range of scan.normalRanges) {
    try {
      const root = parseNormalRange(file, range);
      if (!root) continue;
      normalRoots.push(root);
      normalNodes.push(...root.children);
      reportRawHtml(root, diagnostics, file, filePath);
    } catch (error) {
      const firstLine = file.lines[range[0]];
      const lastLine = file.lines[Math.max(range[0], range[1] - 1)];
      issue(
        diagnostics,
        file,
        filePath,
        "markdown",
        "MARKDOWN_PARSE_ERROR",
        error instanceof Error ? error.message : "The Markdown fragment could not be parsed.",
        firstLine?.startOffset ?? parsedFrontmatter.contentStartOffset,
        lastLine?.endOffset ?? parsedFrontmatter.contentStartOffset + 1,
      );
    }
  }

  const blocks: NarrativeBlock[] = [];
  const blockRoots: MarkdownRoot[] = [];
  for (const scannedBlock of scan.blocks) {
    const blockData = parseBlockData(file, scannedBlock, diagnostics, filePath);
    blockRoots.push(blockData.bodyAst);
    const block = makeBlock(file, blockData, diagnostics, filePath);
    if (block) blocks.push(block);
  }

  const allMarkdownNodes = [
    ...normalRoots.flatMap((root) => root.children),
    ...blockRoots.flatMap((root) => root.children),
  ].sort((left, right) => (left.position?.start.offset ?? 0) - (right.position?.start.offset ?? 0));
  const ast: MarkdownRoot = { type: "root", children: allMarkdownNodes };
  ensureRootPosition(ast, file, parsedFrontmatter.contentStartOffset, file.source.length);
  const chapterHeading = validateChapter(
    file,
    normalNodes,
    scan.markerEvents,
    parsedFrontmatter.contentStartOffset,
    diagnostics,
    filePath,
  );

  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const partial: Partial<ScenarioDocument> = {
    source,
    filePath,
    ast,
    markdown: ast,
    blocks,
  };
  if (parsedFrontmatter.frontmatter) partial.frontmatter = parsedFrontmatter.frontmatter;
  if (chapterHeading) {
    partial.chapterHeading = chapterHeading;
    partial.chapterTitle = plainText(chapterHeading);
    partial.displayTitle = plainText(chapterHeading);
  }

  if (sortedDiagnostics.length > 0 || !parsedFrontmatter.frontmatter || !chapterHeading) {
    if (sortedDiagnostics.length === 0) {
      issue(
        sortedDiagnostics,
        file,
        filePath,
        "markdown",
        "PARSE_INCOMPLETE",
        "The scenario could not be assembled into a complete document.",
        parsedFrontmatter.contentStartOffset,
      );
    }
    return {
      ok: false,
      success: false,
      diagnostics: sortDiagnostics(sortedDiagnostics),
      partial,
    };
  }

  const chapterTitle = plainText(chapterHeading);
  const document: ScenarioDocument = {
    source,
    filePath,
    frontmatter: parsedFrontmatter.frontmatter,
    chapterTitle,
    displayTitle: chapterTitle,
    chapterHeading,
    ast,
    markdown: ast,
    blocks,
  };
  return {
    ok: true,
    success: true,
    diagnostics: [],
    document,
    value: document,
    frontmatter: document.frontmatter,
    chapterTitle: document.chapterTitle,
    displayTitle: document.displayTitle,
    chapterHeading: document.chapterHeading,
    ast: document.ast,
    markdown: document.markdown,
    blocks: document.blocks,
  };
}

export function validateScenarioMarkdown(source: string, filePath?: string): Diagnostic[] {
  return parseScenarioMarkdown(source, filePath).diagnostics;
}

export function isParseSuccess(result: ParseResult): result is Extract<ParseResult, { ok: true }> {
  return result.ok;
}
