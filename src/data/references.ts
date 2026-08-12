import type {
  MarkdownNode,
  MarkdownRoot,
  ScenarioDocument,
  SourcePosition,
} from "../core/types.js";
import { parseEnemyDataYaml } from "./enemy.js";
import type {
  ComboData,
  DataDiagnostic,
  DataReferenceExtractionResult,
  DataReferenceResolutionResult,
  EnemyData,
  EnemyDataDocument,
  EnemyDataParseResult,
  EnemyDataReference,
  EnemyDataSource,
  EnemyDataSourceLoaderObject,
  MarkdownReferenceInput,
  ResolvedEnemyDataReference,
} from "./types.js";

const ENEMY_LABEL = "敵データ";
const COMBO_LABEL = "コンボデータ";
const LABEL_SEPARATOR = "：";
const ENEMY_PATH_PATTERN = /(?:^|\/)data\/enemies\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.yaml$/;
const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const ENCODED_PATH_SEPARATOR_PATTERN = /%(?:2f|5c)/iu;

interface HrefParts {
  filePart: string;
  hasFragment: boolean;
  fragment?: string;
}

interface CandidatePath {
  candidatePath: string;
  fileId: string;
}

function isScenarioDocument(input: MarkdownReferenceInput): input is ScenarioDocument {
  return !Array.isArray(input)
    && typeof input === "object"
    && input !== null
    && "ast" in input
    && "filePath" in input;
}

function plainText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map(plainText).join("");
}

function walk(node: MarkdownNode, callback: (node: MarkdownNode) => void): void {
  callback(node);
  for (const child of node.children ?? []) walk(child, callback);
}

function positionForNode(node: MarkdownNode): SourcePosition {
  if (node.position) return node.position;
  const point = { line: 1, column: 1, offset: 0 };
  return { start: point, end: { line: 1, column: 2, offset: 1 } };
}

function addReferenceDiagnostic(
  diagnostics: DataDiagnostic[],
  filePath: string,
  node: MarkdownNode,
  code: string,
  message: string,
  href?: string,
  candidatePath?: string,
): void {
  const position = positionForNode(node);
  const diagnostic: DataDiagnostic = {
    category: "reference",
    code,
    message,
    file: filePath,
    line: position.start.line,
    column: position.start.column,
    position,
    severity: "error",
  };
  if (href !== undefined) diagnostic.href = href;
  if (candidatePath !== undefined) diagnostic.candidatePath = candidatePath;
  diagnostics.push(diagnostic);
}

function sortDiagnostics(diagnostics: DataDiagnostic[]): DataDiagnostic[] {
  return diagnostics.sort((left, right) => {
    if (left.position.start.offset !== right.position.start.offset) {
      return left.position.start.offset - right.position.start.offset;
    }
    return left.code.localeCompare(right.code);
  });
}

function decodePart(
  value: string,
  diagnostics: DataDiagnostic[],
  filePath: string,
  node: MarkdownNode,
  href: string,
  partName: "path" | "fragment",
): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    addReferenceDiagnostic(
      diagnostics,
      filePath,
      node,
      "DATA_REFERENCE_PERCENT_ENCODING",
      `${partName} contains an invalid percent escape${error instanceof Error ? `: ${error.message}` : "."}`,
      href,
    );
    return undefined;
  }
}

function splitHref(
  href: string,
  diagnostics: DataDiagnostic[],
  filePath: string,
  node: MarkdownNode,
): HrefParts | undefined {
  const hashCount = [...href].filter((character) => character === "#").length;
  if (hashCount > 1) {
    addReferenceDiagnostic(
      diagnostics,
      filePath,
      node,
      "DATA_REFERENCE_FRAGMENT_MULTIPLE",
      "A data reference may contain at most one fragment separator.",
      href,
    );
    return undefined;
  }

  const hashIndex = href.indexOf("#");
  const rawFilePart = hashIndex < 0 ? href : href.slice(0, hashIndex);
  const rawFragment = hashIndex < 0 ? undefined : href.slice(hashIndex + 1);
  if (rawFilePart.length === 0) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_INVALID", "A data reference path must not be empty.", href);
    return undefined;
  }
  if (rawFilePart.includes("\\") || rawFilePart.includes("?") || CONTROL_CHARACTER_PATTERN.test(rawFilePart)) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_INVALID", "The data reference path contains a forbidden character.", href);
    return undefined;
  }
  if (rawFragment !== undefined && (rawFragment.includes("\\") || rawFragment.includes("?") || CONTROL_CHARACTER_PATTERN.test(rawFragment))) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_FRAGMENT_INVALID", "The data reference fragment contains a forbidden character.", href);
    return undefined;
  }
  if (ENCODED_PATH_SEPARATOR_PATTERN.test(rawFilePart)) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_INVALID", "Encoded path separators are not allowed in data references.", href);
    return undefined;
  }

  const filePart = decodePart(rawFilePart, diagnostics, filePath, node, href, "path");
  if (filePart === undefined) return undefined;
  const fragment = rawFragment === undefined
    ? undefined
    : decodePart(rawFragment, diagnostics, filePath, node, href, "fragment");
  if (rawFragment !== undefined && fragment === undefined) return undefined;
  if (filePart.includes("#") || filePart.includes("?") || filePart.includes("\\") || CONTROL_CHARACTER_PATTERN.test(filePart)) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_INVALID", "The decoded data reference path contains a forbidden character.", href);
    return undefined;
  }
  if (fragment?.includes("#")) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_FRAGMENT_MULTIPLE", "The decoded fragment contains another fragment separator.", href);
    return undefined;
  }
  if (filePart.startsWith("/") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(filePart)) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_INVALID", "Absolute paths and URI schemes are not allowed in data references.", href);
    return undefined;
  }
  const parts: HrefParts = { filePart, hasFragment: rawFragment !== undefined };
  if (fragment !== undefined) parts.fragment = fragment;
  return parts;
}

function resolveCandidatePath(
  sourceFilePath: string,
  filePart: string,
  diagnostics: DataDiagnostic[],
  filePath: string,
  node: MarkdownNode,
  href: string,
): CandidatePath | undefined {
  const normalizedSource = sourceFilePath.replace(/\\/g, "/");
  const slash = normalizedSource.lastIndexOf("/");
  const directory = slash < 0 ? "" : normalizedSource.slice(0, slash);
  const stack = directory.split("/").filter((segment) => segment.length > 0);
  const segments = filePart.split("/");
  if (segments.some((segment) => segment.length === 0)) {
    addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_INVALID", "Empty path segments are not allowed in data references.", href);
    return undefined;
  }
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (stack.length === 0) {
        addReferenceDiagnostic(diagnostics, filePath, node, "DATA_REFERENCE_PATH_TRAVERSAL", "The data reference escapes the repository-relative path.", href);
        return undefined;
      }
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  const candidatePath = stack.join("/");
  if (!ENEMY_PATH_PATTERN.test(candidatePath)) {
    addReferenceDiagnostic(
      diagnostics,
      filePath,
      node,
      "DATA_REFERENCE_PATH_INVALID",
      "Data references must resolve to data/enemies/<id>.yaml with a lowercase .yaml extension.",
      href,
      candidatePath,
    );
    return undefined;
  }
  const fileName = candidatePath.slice(candidatePath.lastIndexOf("/") + 1);
  return { candidatePath, fileId: fileName.slice(0, -".yaml".length) };
}

function parseReferenceLabel(
  label: string,
  diagnostics: DataDiagnostic[],
  filePath: string,
  node: MarkdownNode,
  href: string,
): { kind: "enemy" | "combo"; displayName: string } | undefined {
  const kind = label.startsWith(ENEMY_LABEL)
    ? "enemy"
    : label.startsWith(COMBO_LABEL)
      ? "combo"
      : undefined;
  if (kind === undefined) return undefined;
  const prefix = kind === "enemy" ? ENEMY_LABEL : COMBO_LABEL;
  if (!label.startsWith(`${prefix}${LABEL_SEPARATOR}`)) {
    addReferenceDiagnostic(
      diagnostics,
      filePath,
      node,
      "DATA_REFERENCE_LABEL_INVALID",
      `A ${kind} data label must start with "${prefix}${LABEL_SEPARATOR}".`,
      href,
    );
    return undefined;
  }
  const displayName = label.slice(prefix.length + LABEL_SEPARATOR.length).trim();
  if (displayName.length === 0 || /[\r\n]/u.test(displayName)) {
    addReferenceDiagnostic(
      diagnostics,
      filePath,
      node,
      "DATA_REFERENCE_LABEL_INVALID",
      "A data reference label must contain a non-empty display name.",
      href,
    );
    return undefined;
  }
  return { kind, displayName };
}

export function extractEnemyDataReferences(
  input: MarkdownRoot | ScenarioDocument,
  filePath = "<input>",
): DataReferenceExtractionResult {
  const document = isScenarioDocument(input) ? input : undefined;
  const root: MarkdownRoot = document ? document.ast : input as MarkdownRoot;
  const sourceFilePath = document?.filePath ?? filePath;
  const references: EnemyDataReference[] = [];
  const diagnostics: DataDiagnostic[] = [];

  walk(root, (node) => {
    if (node.type !== "link") return;
    const href = typeof node.url === "string" ? node.url : undefined;
    if (href === undefined) return;
    const label = plainText(node);
    const parsedLabel = parseReferenceLabel(label, diagnostics, sourceFilePath, node, href);
    if (!parsedLabel) return;
    const hrefParts = splitHref(href, diagnostics, sourceFilePath, node);
    if (!hrefParts) return;
    const candidate = resolveCandidatePath(sourceFilePath, hrefParts.filePart, diagnostics, sourceFilePath, node, href);
    if (!candidate) return;
    if (parsedLabel.kind === "enemy" && hrefParts.hasFragment) {
      addReferenceDiagnostic(diagnostics, sourceFilePath, node, "DATA_REFERENCE_ENEMY_FRAGMENT_FORBIDDEN", "An enemy data reference must not contain a fragment.", href, candidate.candidatePath);
      return;
    }
    if (parsedLabel.kind === "combo" && !hrefParts.hasFragment) {
      addReferenceDiagnostic(diagnostics, sourceFilePath, node, "DATA_REFERENCE_COMBO_FRAGMENT_REQUIRED", "A combo data reference must contain a fragment.", href, candidate.candidatePath);
      return;
    }
    if (parsedLabel.kind === "combo" && (!hrefParts.fragment || hrefParts.fragment.length === 0)) {
      addReferenceDiagnostic(diagnostics, sourceFilePath, node, "DATA_REFERENCE_FRAGMENT_EMPTY", "A combo data reference fragment must not be empty.", href, candidate.candidatePath);
      return;
    }
    if (hrefParts.fragment !== undefined && !ID_PATTERN.test(hrefParts.fragment)) {
      addReferenceDiagnostic(diagnostics, sourceFilePath, node, "DATA_REFERENCE_FRAGMENT_INVALID", "A data reference fragment must match the enemy data ID rule.", href, candidate.candidatePath);
      return;
    }
    const reference: EnemyDataReference = {
      kind: parsedLabel.kind,
      label,
      displayName: parsedLabel.displayName,
      href,
      filePath: sourceFilePath,
      filePart: hrefParts.filePart,
      candidatePath: candidate.candidatePath,
      position: positionForNode(node),
      node,
    };
    if (hrefParts.fragment !== undefined) reference.fragment = hrefParts.fragment;
    references.push(reference);
  });

  references.sort((left, right) => left.position.start.offset - right.position.start.offset);
  return { references, diagnostics: sortDiagnostics(diagnostics) };
}

function loadSource(source: EnemyDataSource, candidatePath: string): string | undefined {
  if (typeof source === "function") return source(candidatePath);
  if (isLoaderObject(source)) return source.load(candidatePath);
  if (isMapSource(source)) {
    const direct = source.get(candidatePath);
    if (typeof direct === "string") return direct;
    for (const [key, value] of source) {
      if (key.replace(/\\/g, "/").replace(/^\.\//u, "") === candidatePath) return value;
    }
    return undefined;
  }
  const record = source as Readonly<Record<string, string>>;
  const direct = record[candidatePath];
  if (typeof direct === "string") return direct;
  for (const [key, value] of Object.entries(source)) {
    if (key.replace(/\\/g, "/").replace(/^\.\//u, "") === candidatePath) return value;
  }
  return undefined;
}

function isLoaderObject(source: EnemyDataSource): source is EnemyDataSourceLoaderObject {
  if (typeof source !== "object" || source === null) return false;
  const candidate = source as { load?: unknown };
  return typeof candidate.load === "function";
}

function isMapSource(source: EnemyDataSource): source is ReadonlyMap<string, string> {
  if (source instanceof Map) return true;
  if (typeof source !== "object" || source === null) return false;
  const candidate = source as { get?: unknown };
  return typeof candidate.get === "function";
}

function attachYamlDiagnostic(
  diagnostic: DataDiagnostic,
  reference: EnemyDataReference,
): DataDiagnostic {
  return {
    ...diagnostic,
    category: "data",
    href: reference.href,
    candidatePath: reference.candidatePath,
    referencePosition: reference.position,
  };
}

function resolutionFailure(
  diagnostics: DataDiagnostic[],
  references: ResolvedEnemyDataReference[],
): DataReferenceResolutionResult {
  return {
    ok: false,
    success: false,
    diagnostics: sortDiagnostics(diagnostics),
    references,
    value: references,
  };
}

export function resolveEnemyDataReferences(
  input: MarkdownReferenceInput,
  source: EnemyDataSource,
  filePath = "<input>",
): DataReferenceResolutionResult {
  const extracted: DataReferenceExtractionResult = Array.isArray(input)
    ? { references: [...input], diagnostics: [] }
    : extractEnemyDataReferences(input as MarkdownRoot | ScenarioDocument, filePath);
  const diagnostics = [...extracted.diagnostics];
  const resolved: ResolvedEnemyDataReference[] = [];
  const parsedCache = new Map<string, EnemyDataParseResult>();

  for (const reference of extracted.references) {
    let yamlSource: string | undefined;
    try {
      yamlSource = loadSource(source, reference.candidatePath);
    } catch (error) {
      addReferenceDiagnostic(
        diagnostics,
        reference.filePath,
        reference.node,
        "DATA_REFERENCE_SOURCE_ERROR",
        `The YAML source loader failed${error instanceof Error ? `: ${error.message}` : "."}`,
        reference.href,
        reference.candidatePath,
      );
      continue;
    }
    if (yamlSource === undefined) {
      addReferenceDiagnostic(
        diagnostics,
        reference.filePath,
        reference.node,
        "DATA_REFERENCE_FILE_MISSING",
        `Referenced YAML file does not exist: ${reference.candidatePath}.`,
        reference.href,
        reference.candidatePath,
      );
      continue;
    }

    let parsed = parsedCache.get(reference.candidatePath);
    if (!parsed) {
      parsed = parseEnemyDataYaml(yamlSource, reference.candidatePath);
      parsedCache.set(reference.candidatePath, parsed);
    }
    if (!parsed.ok) {
      addReferenceDiagnostic(
        diagnostics,
        reference.filePath,
        reference.node,
        "DATA_REFERENCE_YAML_INVALID",
        `Referenced YAML file is not valid enemy data: ${reference.candidatePath}.`,
        reference.href,
        reference.candidatePath,
      );
      for (const diagnostic of parsed.diagnostics) {
        diagnostics.push(attachYamlDiagnostic(diagnostic, reference));
      }
      continue;
    }

    const candidateFileName = reference.candidatePath.slice(reference.candidatePath.lastIndexOf("/") + 1);
    const candidateFileId = candidateFileName.slice(0, -".yaml".length);
    if (parsed.data.enemy.id !== candidateFileId) {
      addReferenceDiagnostic(
        diagnostics,
        reference.filePath,
        reference.node,
        "DATA_REFERENCE_ENEMY_ID_MISMATCH",
        `YAML enemy.id "${parsed.data.enemy.id}" does not match the file name.`,
        reference.href,
        reference.candidatePath,
      );
      continue;
    }

    const resolvedReference: ResolvedEnemyDataReference = {
      reference,
      candidatePath: reference.candidatePath,
      data: parsed.data,
      enemy: parsed.data.enemy,
    };
    if (reference.kind === "combo") {
      const combo = parsed.data.enemy.combos.find((candidate) => candidate.id === reference.fragment);
      if (!combo) {
        addReferenceDiagnostic(
          diagnostics,
          reference.filePath,
          reference.node,
          "DATA_REFERENCE_COMBO_MISSING",
          `Combo "${reference.fragment ?? ""}" does not exist in ${reference.candidatePath}.`,
          reference.href,
          reference.candidatePath,
        );
        continue;
      }
      resolvedReference.combo = combo;
    }
    resolved.push(resolvedReference);
  }

  if (diagnostics.length > 0) return resolutionFailure(diagnostics, resolved);
  return {
    ok: true,
    success: true,
    diagnostics: [],
    references: resolved,
    value: resolved,
  };
}

export const extractDataReferences = extractEnemyDataReferences;
export const resolveDataReferences = resolveEnemyDataReferences;
