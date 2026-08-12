import {
  isAlias,
  isMap,
  isNode,
  isScalar,
  isSeq,
  parseDocument,
} from "yaml";
import type { Node, Pair, YAMLMap, YAMLSeq } from "yaml";

import type { SourcePoint, SourcePosition } from "../core/types.js";
import {
  ENEMY_DATA_SCHEMA,
  ENEMY_DATA_VERSION,
} from "./types.js";
import type {
  AbilitiesData,
  ComboData,
  ComboEffectData,
  DataDiagnostic,
  DLoisData,
  ELoisData,
  EffectData,
  EncroachmentData,
  EnemyData,
  EnemyDataDocument,
  EnemyDataParseFailure,
  EnemyDataParseResult,
  EnemyDataParseSuccess,
  ItemData,
  LoisData,
  PrimaryAbilityData,
  SecondaryAbilityData,
  SkillData,
} from "./types.js";

const ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const DECIMAL_INTEGER_PATTERN = /^-?(?:0|[1-9][0-9]*)$/;
const PRIMARY_IDS = ["body", "sense", "mind", "social"] as const;
const MAX_SOURCE_LENGTH = 1_000_000;
const MAX_NESTING_DEPTH = 64;

interface SourceFile {
  source: string;
  filePath: string;
  lineStarts: number[];
}

interface ValidationContext {
  file: SourceFile;
  diagnostics: DataDiagnostic[];
}

interface MapEntry {
  key?: string;
  keyNode?: Node;
  value: Node | null;
}

function makeSourceFile(source: string, filePath: string): SourceFile {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") lineStarts.push(index + 1);
  }
  return { source, filePath, lineStarts };
}

function pointAt(file: SourceFile, requestedOffset: number): SourcePoint {
  const offset = Math.max(0, Math.min(requestedOffset, file.source.length));
  let low = 0;
  let high = file.lineStarts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const lineStart = file.lineStarts[middle] ?? 0;
    if (lineStart <= offset) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, Math.min(high, file.lineStarts.length - 1));
  const lineStart = file.lineStarts[lineIndex] ?? 0;
  return {
    line: lineIndex + 1,
    column: offset - lineStart + 1,
    offset,
  };
}

function positionAt(file: SourceFile, startOffset: number, endOffset = startOffset + 1): SourcePosition {
  const start = Math.max(0, Math.min(startOffset, file.source.length));
  const end = Math.max(start, Math.min(endOffset, file.source.length));
  return { start: pointAt(file, start), end: pointAt(file, end) };
}

function nodeStart(node: Node | null | undefined, fallback = 0): number {
  const start = node?.range?.[0];
  return typeof start === "number" ? start : fallback;
}

function nodeEnd(node: Node | null | undefined, fallback: number): number {
  const end = node?.range?.[2];
  return typeof end === "number" ? end : fallback;
}

function nodePosition(context: ValidationContext, node: Node | null | undefined, fallback = 0): SourcePosition {
  const start = nodeStart(node, fallback);
  return positionAt(context.file, start, Math.max(start + 1, nodeEnd(node, start + 1)));
}

function addDiagnostic(
  context: ValidationContext,
  code: string,
  message: string,
  position: SourcePosition,
  path?: string,
): void {
  const diagnostic: DataDiagnostic = {
    category: "data",
    code,
    message,
    file: context.file.filePath,
    line: position.start.line,
    column: position.start.column,
    position,
    severity: "error",
  };
  if (path !== undefined) diagnostic.path = path;
  context.diagnostics.push(diagnostic);
}

function addNodeDiagnostic(
  context: ValidationContext,
  code: string,
  message: string,
  node: Node | null | undefined,
  path?: string,
): void {
  addDiagnostic(context, code, message, nodePosition(context, node), path);
}

function addOffsetDiagnostic(
  context: ValidationContext,
  code: string,
  message: string,
  startOffset: number,
  endOffset = startOffset + 1,
): void {
  addDiagnostic(context, code, message, positionAt(context.file, startOffset, endOffset));
}

function pathFor(parent: string, key: string | number): string {
  return `${parent}/${String(key)}`;
}

function mapEntries(map: YAMLMap<unknown, unknown>): MapEntry[] {
  return map.items.map((pair: Pair<unknown, unknown>) => {
    const keyNode = isNode(pair.key) ? pair.key : undefined;
    const key = keyNode && isScalar(keyNode) && typeof keyNode.value === "string"
      ? keyNode.value
      : undefined;
    const value = pair.value === null || pair.value === undefined
      ? null
      : isNode(pair.value)
        ? pair.value
        : null;
    return {
      ...(key === undefined ? {} : { key }),
      ...(keyNode === undefined ? {} : { keyNode }),
      value,
    };
  });
}

function findEntry(entries: readonly MapEntry[], key: string): MapEntry | undefined {
  return entries.find((entry) => entry.key === key);
}

function validateMappingKeys(
  context: ValidationContext,
  map: YAMLMap<unknown, unknown>,
  allowedKeys: readonly string[],
  path: string,
): MapEntry[] {
  const entries = mapEntries(map);
  const allowed = new Set(allowedKeys);
  for (const entry of entries) {
    if (entry.key === undefined) {
      addNodeDiagnostic(
        context,
        "DATA_MAP_KEY_TYPE",
        "Mapping keys must be strings.",
        entry.keyNode ?? entry.value,
        path,
      );
      continue;
    }
    if (entry.key === "<<") {
      addNodeDiagnostic(
        context,
        "DATA_UNSAFE_MERGE",
        "YAML merge keys are not allowed by the enemy data contract.",
        entry.keyNode ?? entry.value,
        pathFor(path, entry.key),
      );
      continue;
    }
    if (!allowed.has(entry.key)) {
      addNodeDiagnostic(
        context,
        "DATA_UNKNOWN_KEY",
        `Unknown key "${entry.key}"; it is not part of the enemy data contract.`,
        entry.keyNode ?? entry.value,
        pathFor(path, entry.key),
      );
    }
  }
  return entries;
}

function requiredEntry(
  context: ValidationContext,
  entries: readonly MapEntry[],
  key: string,
  path: string,
  parent: Node | null | undefined,
): MapEntry | undefined {
  const entry = findEntry(entries, key);
  if (!entry) {
    addNodeDiagnostic(
      context,
      "DATA_REQUIRED_KEY",
      `Required key "${key}" is missing.`,
      parent,
      pathFor(path, key),
    );
  }
  return entry;
}

function requiredMap(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  parent: Node | null | undefined,
): YAMLMap<unknown, unknown> | undefined {
  if (!entry) {
    addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "A mapping is required.", parent, path);
    return undefined;
  }
  if (!entry.value || !isMap(entry.value)) {
    addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "A mapping is required.", entry.value, path);
    return undefined;
  }
  return entry.value;
}

function optionalMap(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
): YAMLMap<unknown, unknown> | undefined {
  if (!entry) return undefined;
  if (!entry.value || !isMap(entry.value)) {
    addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "The value must be a mapping when present.", entry.value, path);
    return undefined;
  }
  return entry.value;
}

function requiredSequence(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  parent: Node | null | undefined,
): YAMLSeq<unknown> | undefined {
  if (!entry) {
    addNodeDiagnostic(context, "DATA_ARRAY_REQUIRED", "An array is required.", parent, path);
    return undefined;
  }
  if (!entry.value || !isSeq(entry.value)) {
    addNodeDiagnostic(context, "DATA_ARRAY_REQUIRED", "An array is required.", entry.value, path);
    return undefined;
  }
  return entry.value;
}

function optionalSequence(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
): YAMLSeq<unknown> | undefined {
  if (!entry) return undefined;
  if (!entry.value || !isSeq(entry.value)) {
    addNodeDiagnostic(context, "DATA_ARRAY_REQUIRED", "The value must be an array when present.", entry.value, path);
    return undefined;
  }
  return entry.value;
}

function scalarString(
  context: ValidationContext,
  node: Node | null | undefined,
  path: string,
  nonBlank: boolean,
): string | undefined {
  if (!node || !isScalar(node) || typeof node.value !== "string") {
    addNodeDiagnostic(context, "DATA_STRING_REQUIRED", "The value must be a string.", node, path);
    return undefined;
  }
  if (nonBlank && node.value.trim().length === 0) {
    addNodeDiagnostic(context, "DATA_STRING_REQUIRED", "The string must not be blank.", node, path);
  }
  return node.value;
}

function requiredString(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  parent: Node | null | undefined,
  nonBlank = true,
): string {
  if (!entry) {
    addNodeDiagnostic(context, "DATA_REQUIRED_KEY", "A required string is missing.", parent, path);
    return "";
  }
  return scalarString(context, entry.value, path, nonBlank) ?? "";
}

function optionalString(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  nonBlank = false,
): string | undefined {
  return entry ? scalarString(context, entry.value, path, nonBlank) : undefined;
}

function validId(value: string): boolean {
  return ID_PATTERN.test(value);
}

function requiredId(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  parent: Node | null | undefined,
): string {
  const value = requiredString(context, entry, path, parent);
  if (!validId(value)) {
    addNodeDiagnostic(
      context,
      "DATA_ID_INVALID",
      "IDs must match ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$.",
      entry?.value ?? parent,
      path,
    );
  }
  return value;
}

function scalarInteger(
  context: ValidationContext,
  node: Node | null | undefined,
  path: string,
  minimum?: number,
): number | undefined {
  if (!node || !isScalar(node) || typeof node.value !== "number" || !Number.isSafeInteger(node.value)) {
    addNodeDiagnostic(context, "DATA_INTEGER_REQUIRED", "The value must be a safe decimal integer.", node, path);
    return undefined;
  }
  if (typeof node.source !== "string" || !DECIMAL_INTEGER_PATTERN.test(node.source)) {
    addNodeDiagnostic(context, "DATA_INTEGER_REQUIRED", "The value must use decimal integer notation.", node, path);
    return undefined;
  }
  if (minimum !== undefined && node.value < minimum) {
    addNodeDiagnostic(
      context,
      minimum === 1 ? "DATA_INTEGER_POSITIVE" : "DATA_INTEGER_NONNEGATIVE",
      minimum === 1 ? "The value must be at least 1." : "The value must not be negative.",
      node,
      path,
    );
  }
  return node.value;
}

function requiredInteger(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  parent: Node | null | undefined,
  minimum?: number,
): number {
  if (!entry) {
    addNodeDiagnostic(context, "DATA_REQUIRED_KEY", "A required integer is missing.", parent, path);
    return 0;
  }
  return scalarInteger(context, entry.value, path, minimum) ?? 0;
}

function optionalInteger(
  context: ValidationContext,
  entry: MapEntry | undefined,
  path: string,
  minimum?: number,
): number | undefined {
  return entry ? scalarInteger(context, entry.value, path, minimum) : undefined;
}

function itemNode(sequence: YAMLSeq<unknown>, index: number): Node | null {
  const item = sequence.items[index];
  return isNode(item) ? item : null;
}

function idNode(node: Node | null): Node | null {
  if (!node || !isMap(node)) return node;
  const idEntry = findEntry(mapEntries(node), "id");
  return idEntry?.value ?? idEntry?.keyNode ?? node;
}

function reportDuplicateIds(
  context: ValidationContext,
  ids: readonly string[],
  nodes: readonly (Node | null)[],
  path: string,
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (id.length === 0 || !validId(id)) return;
    if (seen.has(id)) {
      addNodeDiagnostic(
        context,
        "DATA_DUPLICATE_ID",
        `ID "${id}" is duplicated in the same array.`,
        idNode(nodes[index] ?? null),
        `${path}/${index}/id`,
      );
    }
    seen.add(id);
  });
}

function validateStringArray(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): string[] {
  if (!sequence) return [];
  return sequence.items.map((_, index) =>
    scalarString(context, itemNode(sequence, index), `${path}/${index}`, true) ?? "",
  );
}

function validatePrimary(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): PrimaryAbilityData[] {
  if (!sequence) return [];
  if (sequence.items.length !== PRIMARY_IDS.length) {
    addNodeDiagnostic(
      context,
      "DATA_PRIMARY_COUNT",
      "abilities.primary must contain exactly four entries.",
      sequence,
      path,
    );
  }
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each ability entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "body" as const, name: "", value: 0 };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "value"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const value = requiredInteger(context, requiredEntry(context, entries, "value", `${path}/${index}`, node), `${path}/${index}/value`, node, 0);
    ids.push(id);
    const primaryId = isPrimaryId(id) ? id : "body";
    if (!isPrimaryId(id)) {
      addNodeDiagnostic(context, "DATA_PRIMARY_ID_INVALID", "abilities.primary id must be body, sense, mind, or social.", idNode(node), `${path}/${index}/id`);
    }
    return { id: primaryId, name, value };
  });
  reportDuplicateIds(context, ids, nodes, path);
  for (const primaryId of PRIMARY_IDS) {
    if (!ids.includes(primaryId)) {
      addNodeDiagnostic(context, "DATA_PRIMARY_ID_REQUIRED", `abilities.primary is missing "${primaryId}".`, sequence, path);
    }
  }
  return values;
}

function isPrimaryId(value: string): value is PrimaryAbilityData["id"] {
  return (PRIMARY_IDS as readonly string[]).includes(value);
}

function validateSecondary(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): SecondaryAbilityData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each ability entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "" };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "value", "formula"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const valueEntry = findEntry(entries, "value");
    const formulaEntry = findEntry(entries, "formula");
    if ((valueEntry === undefined) === (formulaEntry === undefined)) {
      addNodeDiagnostic(context, "DATA_SECONDARY_VALUE_FORMULA", "A secondary ability must define exactly one of value or formula.", node, `${path}/${index}`);
    }
    const value = optionalInteger(context, valueEntry, `${path}/${index}/value`);
    const formula = optionalString(context, formulaEntry, `${path}/${index}/formula`, true);
    ids.push(id);
    const result: SecondaryAbilityData = { id, name };
    if (value !== undefined) result.value = value;
    if (formula !== undefined) result.formula = formula;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateSkills(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
  primaryIds: ReadonlySet<string>,
): SkillData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each skill entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "", ability_id: "body" as const, value: 0 };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "ability_id", "value"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const abilityId = requiredId(context, requiredEntry(context, entries, "ability_id", `${path}/${index}`, node), `${path}/${index}/ability_id`, node);
    const value = requiredInteger(context, requiredEntry(context, entries, "value", `${path}/${index}`, node), `${path}/${index}/value`, node, 0);
    if (!primaryIds.has(abilityId)) {
      addNodeDiagnostic(context, "DATA_ABILITY_REFERENCE_MISSING", `ability_id "${abilityId}" does not refer to abilities.primary.`, idNode(node), `${path}/${index}/ability_id`);
    }
    ids.push(id);
    return { id, name, ability_id: isPrimaryId(abilityId) ? abilityId : "body", value };
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateAbilities(
  context: ValidationContext,
  map: YAMLMap<unknown, unknown> | undefined,
  path: string,
): AbilitiesData {
  if (!map) return { primary: [], secondary: [], skills: [] };
  const entries = validateMappingKeys(context, map, ["primary", "secondary", "skills"], path);
  const primary = validatePrimary(context, requiredSequence(context, requiredEntry(context, entries, "primary", path, map), `${path}/primary`, map), `${path}/primary`);
  const secondary = validateSecondary(context, requiredSequence(context, requiredEntry(context, entries, "secondary", path, map), `${path}/secondary`, map), `${path}/secondary`);
  const primaryIds = new Set(primary.map((entry) => entry.id));
  const skills = validateSkills(context, requiredSequence(context, requiredEntry(context, entries, "skills", path, map), `${path}/skills`, map), `${path}/skills`, primaryIds);
  return { primary, secondary, skills };
}

function validateEncroachment(
  context: ValidationContext,
  map: YAMLMap<unknown, unknown> | undefined,
  path: string,
): EncroachmentData | undefined {
  if (!map) return undefined;
  const entries = validateMappingKeys(context, map, ["rate", "level_bonus", "dice_bonus", "notes"], path);
  const rate = requiredInteger(context, requiredEntry(context, entries, "rate", path, map), `${path}/rate`, map, 0);
  const levelBonus = optionalInteger(context, findEntry(entries, "level_bonus"), `${path}/level_bonus`, 0) ?? 0;
  const diceBonus = optionalInteger(context, findEntry(entries, "dice_bonus"), `${path}/dice_bonus`, 0) ?? 0;
  const notes = optionalString(context, findEntry(entries, "notes"), `${path}/notes`);
  const result: EncroachmentData = { rate, level_bonus: levelBonus, dice_bonus: diceBonus };
  if (notes !== undefined) result.notes = notes;
  return result;
}

function validateEffects(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): EffectData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each effect entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "" };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "group", "level", "description", "notes"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const group = optionalString(context, findEntry(entries, "group"), `${path}/${index}/group`);
    const level = optionalInteger(context, findEntry(entries, "level"), `${path}/${index}/level`, 1);
    const description = optionalString(context, findEntry(entries, "description"), `${path}/${index}/description`);
    const notes = optionalString(context, findEntry(entries, "notes"), `${path}/${index}/notes`);
    ids.push(id);
    const result: EffectData = { id, name };
    if (group !== undefined) result.group = group;
    if (level !== undefined) result.level = level;
    if (description !== undefined) result.description = description;
    if (notes !== undefined) result.notes = notes;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateItems(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): ItemData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each item entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "" };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "category", "attack", "guard", "armor", "range", "description", "notes"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const category = optionalString(context, findEntry(entries, "category"), `${path}/${index}/category`);
    const attack = optionalInteger(context, findEntry(entries, "attack"), `${path}/${index}/attack`);
    const guard = optionalInteger(context, findEntry(entries, "guard"), `${path}/${index}/guard`);
    const armor = optionalInteger(context, findEntry(entries, "armor"), `${path}/${index}/armor`);
    const range = optionalString(context, findEntry(entries, "range"), `${path}/${index}/range`);
    const description = optionalString(context, findEntry(entries, "description"), `${path}/${index}/description`);
    const notes = optionalString(context, findEntry(entries, "notes"), `${path}/${index}/notes`);
    ids.push(id);
    const result: ItemData = { id, name };
    if (category !== undefined) result.category = category;
    if (attack !== undefined) result.attack = attack;
    if (guard !== undefined) result.guard = guard;
    if (armor !== undefined) result.armor = armor;
    if (range !== undefined) result.range = range;
    if (description !== undefined) result.description = description;
    if (notes !== undefined) result.notes = notes;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateLois(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): LoisData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each lois entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "" };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "relation", "positive_emotion", "negative_emotion", "notes"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const relation = optionalString(context, findEntry(entries, "relation"), `${path}/${index}/relation`);
    const positiveEmotion = optionalString(context, findEntry(entries, "positive_emotion"), `${path}/${index}/positive_emotion`);
    const negativeEmotion = optionalString(context, findEntry(entries, "negative_emotion"), `${path}/${index}/negative_emotion`);
    const notes = optionalString(context, findEntry(entries, "notes"), `${path}/${index}/notes`);
    ids.push(id);
    const result: LoisData = { id, name };
    if (relation !== undefined) result.relation = relation;
    if (positiveEmotion !== undefined) result.positive_emotion = positiveEmotion;
    if (negativeEmotion !== undefined) result.negative_emotion = negativeEmotion;
    if (notes !== undefined) result.notes = notes;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateDLois(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): DLoisData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each d_lois entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "" };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "alias", "description", "notes"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const alias = optionalString(context, findEntry(entries, "alias"), `${path}/${index}/alias`);
    const description = optionalString(context, findEntry(entries, "description"), `${path}/${index}/description`);
    const notes = optionalString(context, findEntry(entries, "notes"), `${path}/${index}/notes`);
    ids.push(id);
    const result: DLoisData = { id, name };
    if (alias !== undefined) result.alias = alias;
    if (description !== undefined) result.description = description;
    if (notes !== undefined) result.notes = notes;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateELois(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
): ELoisData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each e_lois entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "", count: 1 };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "count", "description", "notes"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const count = optionalInteger(context, findEntry(entries, "count"), `${path}/${index}/count`, 1) ?? 1;
    const description = optionalString(context, findEntry(entries, "description"), `${path}/${index}/description`);
    const notes = optionalString(context, findEntry(entries, "notes"), `${path}/${index}/notes`);
    ids.push(id);
    const result: ELoisData = { id, name, count };
    if (description !== undefined) result.description = description;
    if (notes !== undefined) result.notes = notes;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateComboEffects(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
  effectIds: ReadonlySet<string>,
): ComboEffectData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each combo effect must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { effect_id: "" };
    }
    const entries = validateMappingKeys(context, map, ["effect_id", "level"], `${path}/${index}`);
    const effectId = requiredId(context, requiredEntry(context, entries, "effect_id", `${path}/${index}`, node), `${path}/${index}/effect_id`, node);
    const level = optionalInteger(context, findEntry(entries, "level"), `${path}/${index}/level`, 1);
    if (!effectIds.has(effectId)) {
      addNodeDiagnostic(context, "DATA_EFFECT_REFERENCE_MISSING", `effect_id "${effectId}" does not refer to enemy.effects.`, idNode(node), `${path}/${index}/effect_id`);
    }
    ids.push(effectId);
    const result: ComboEffectData = { effect_id: effectId };
    if (level !== undefined) result.level = level;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateItemIds(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
  itemIds: ReadonlySet<string>,
): string[] {
  if (!sequence) return [];
  const ids = sequence.items.map((_, index) => requiredId(context, {
    value: itemNode(sequence, index),
  }, `${path}/${index}`, sequence));
  ids.forEach((id, index) => {
    if (!itemIds.has(id)) {
      addNodeDiagnostic(context, "DATA_ITEM_REFERENCE_MISSING", `item_id "${id}" does not refer to enemy.items.`, itemNode(sequence, index), `${path}/${index}`);
    }
  });
  reportDuplicateIds(context, ids, sequence.items.map((_, index) => itemNode(sequence, index)), path);
  return ids;
}

function validateCombos(
  context: ValidationContext,
  sequence: YAMLSeq<unknown> | undefined,
  path: string,
  effectIds: ReadonlySet<string>,
  itemIds: ReadonlySet<string>,
): ComboData[] {
  if (!sequence) return [];
  const ids: string[] = [];
  const nodes: (Node | null)[] = [];
  const values = sequence.items.map((_, index) => {
    const node = itemNode(sequence, index);
    nodes.push(node);
    const map = node && isMap(node) ? node : undefined;
    if (!map) {
      addNodeDiagnostic(context, "DATA_MAPPING_REQUIRED", "Each combo entry must be a mapping.", node, `${path}/${index}`);
      ids.push("");
      return { id: "", name: "", effects: [], item_ids: [], timing: "", target: "", range: "", check: "", description: "" };
    }
    const entries = validateMappingKeys(context, map, ["id", "name", "effects", "item_ids", "timing", "target", "range", "check", "attack_type", "attack_power", "uses", "description", "notes"], `${path}/${index}`);
    const id = requiredId(context, requiredEntry(context, entries, "id", `${path}/${index}`, node), `${path}/${index}/id`, node);
    const name = requiredString(context, requiredEntry(context, entries, "name", `${path}/${index}`, node), `${path}/${index}/name`, node);
    const effects = validateComboEffects(context, requiredSequence(context, requiredEntry(context, entries, "effects", `${path}/${index}`, node), `${path}/${index}/effects`, node), `${path}/${index}/effects`, effectIds);
    const itemIdsValue = validateItemIds(context, optionalSequence(context, findEntry(entries, "item_ids"), `${path}/${index}/item_ids`), `${path}/${index}/item_ids`, itemIds);
    const timing = requiredString(context, requiredEntry(context, entries, "timing", `${path}/${index}`, node), `${path}/${index}/timing`, node);
    const target = requiredString(context, requiredEntry(context, entries, "target", `${path}/${index}`, node), `${path}/${index}/target`, node);
    const range = requiredString(context, requiredEntry(context, entries, "range", `${path}/${index}`, node), `${path}/${index}/range`, node);
    const check = requiredString(context, requiredEntry(context, entries, "check", `${path}/${index}`, node), `${path}/${index}/check`, node);
    const attackType = optionalString(context, findEntry(entries, "attack_type"), `${path}/${index}/attack_type`);
    const attackPower = optionalInteger(context, findEntry(entries, "attack_power"), `${path}/${index}/attack_power`);
    const uses = optionalString(context, findEntry(entries, "uses"), `${path}/${index}/uses`);
    const description = requiredString(context, requiredEntry(context, entries, "description", `${path}/${index}`, node), `${path}/${index}/description`, node);
    const notes = optionalString(context, findEntry(entries, "notes"), `${path}/${index}/notes`);
    ids.push(id);
    const result: ComboData = { id, name, effects, item_ids: itemIdsValue, timing, target, range, check, description };
    if (attackType !== undefined) result.attack_type = attackType;
    if (attackPower !== undefined) result.attack_power = attackPower;
    if (uses !== undefined) result.uses = uses;
    if (notes !== undefined) result.notes = notes;
    return result;
  });
  reportDuplicateIds(context, ids, nodes, path);
  return values;
}

function validateEnemy(
  context: ValidationContext,
  map: YAMLMap<unknown, unknown> | undefined,
  path: string,
): EnemyData {
  if (!map) {
    return {
      id: "",
      name: "",
      aliases: [],
      syndromes: [],
      abilities: { primary: [], secondary: [], skills: [] },
      effects: [],
      items: [],
      lois: [],
      d_lois: [],
      e_lois: [],
      combos: [],
    };
  }
  const entries = validateMappingKeys(context, map, ["id", "name", "aliases", "syndromes", "encroachment", "impulse", "abilities", "effects", "items", "lois", "d_lois", "e_lois", "combos", "notes"], path);
  const id = requiredId(context, requiredEntry(context, entries, "id", path, map), `${path}/id`, map);
  const name = requiredString(context, requiredEntry(context, entries, "name", path, map), `${path}/name`, map);
  const aliases = validateStringArray(context, optionalSequence(context, findEntry(entries, "aliases"), `${path}/aliases`), `${path}/aliases`);
  const syndromes = validateStringArray(context, optionalSequence(context, findEntry(entries, "syndromes"), `${path}/syndromes`), `${path}/syndromes`);
  const encroachment = validateEncroachment(context, optionalMap(context, findEntry(entries, "encroachment"), `${path}/encroachment`), `${path}/encroachment`);
  const impulse = optionalString(context, findEntry(entries, "impulse"), `${path}/impulse`);
  const abilities = validateAbilities(context, requiredMap(context, requiredEntry(context, entries, "abilities", path, map), `${path}/abilities`, map), `${path}/abilities`);
  const effects = validateEffects(context, requiredSequence(context, requiredEntry(context, entries, "effects", path, map), `${path}/effects`, map), `${path}/effects`);
  const items = validateItems(context, requiredSequence(context, requiredEntry(context, entries, "items", path, map), `${path}/items`, map), `${path}/items`);
  const lois = validateLois(context, requiredSequence(context, requiredEntry(context, entries, "lois", path, map), `${path}/lois`, map), `${path}/lois`);
  const dLois = validateDLois(context, requiredSequence(context, requiredEntry(context, entries, "d_lois", path, map), `${path}/d_lois`, map), `${path}/d_lois`);
  const eLois = validateELois(context, requiredSequence(context, requiredEntry(context, entries, "e_lois", path, map), `${path}/e_lois`, map), `${path}/e_lois`);
  const combos = validateCombos(context, requiredSequence(context, requiredEntry(context, entries, "combos", path, map), `${path}/combos`, map), `${path}/combos`, new Set(effects.map((entry) => entry.id)), new Set(items.map((entry) => entry.id)));
  const notes = optionalString(context, findEntry(entries, "notes"), `${path}/notes`);
  const result: EnemyData = {
    id,
    name,
    aliases,
    syndromes,
    abilities,
    effects,
    items,
    lois,
    d_lois: dLois,
    e_lois: eLois,
    combos,
  };
  if (encroachment !== undefined) result.encroachment = encroachment;
  if (impulse !== undefined) result.impulse = impulse;
  if (notes !== undefined) result.notes = notes;
  return result;
}

function walkUnsafeYaml(context: ValidationContext, node: Node | null | undefined, seenDepth = 0): void {
  if (!node) return;
  if (seenDepth > MAX_NESTING_DEPTH) {
    addNodeDiagnostic(context, "DATA_NESTING_TOO_DEEP", `YAML nesting exceeds the limit of ${MAX_NESTING_DEPTH}.`, node);
    return;
  }
  if (isAlias(node)) {
    addNodeDiagnostic(context, "DATA_UNSAFE_ALIAS", "YAML aliases are not allowed by the enemy data contract.", node);
    return;
  }
  if (node.tag !== undefined) {
    addNodeDiagnostic(context, "DATA_UNSAFE_TAG", "Explicit YAML tags are not allowed by the enemy data contract.", node);
  }
  if (isScalar(node)) {
    if (node.anchor !== undefined) {
      addNodeDiagnostic(context, "DATA_UNSAFE_ANCHOR", "YAML anchors are not allowed by the enemy data contract.", node);
    }
    return;
  }
  if (isMap(node)) {
    if (node.anchor !== undefined) {
      addNodeDiagnostic(context, "DATA_UNSAFE_ANCHOR", "YAML anchors are not allowed by the enemy data contract.", node);
    }
    for (const pair of node.items) {
      if (isNode(pair.key)) walkUnsafeYaml(context, pair.key, seenDepth + 1);
      if (isNode(pair.value)) walkUnsafeYaml(context, pair.value, seenDepth + 1);
    }
    return;
  }
  if (isSeq(node)) {
    if (node.anchor !== undefined) {
      addNodeDiagnostic(context, "DATA_UNSAFE_ANCHOR", "YAML anchors are not allowed by the enemy data contract.", node);
    }
    for (const item of node.items) {
      if (isNode(item)) walkUnsafeYaml(context, item, seenDepth + 1);
    }
  }
}

function sortDiagnostics(diagnostics: DataDiagnostic[]): DataDiagnostic[] {
  return diagnostics.sort((left, right) => {
    if (left.position.start.offset !== right.position.start.offset) {
      return left.position.start.offset - right.position.start.offset;
    }
    return left.code.localeCompare(right.code);
  });
}

function parseErrorCode(code: string): string {
  return code === "DUPLICATE_KEY" ? "YAML_DUPLICATE_KEY" : `YAML_${code}`;
}

function failure(diagnostics: DataDiagnostic[]): EnemyDataParseFailure {
  return { ok: false, success: false, diagnostics: sortDiagnostics(diagnostics) };
}

function success(value: EnemyDataDocument): EnemyDataParseSuccess {
  return { ok: true, success: true, diagnostics: [], value, data: value, document: value };
}

export function parseEnemyDataYaml(source: string, filePath = "<input>"): EnemyDataParseResult {
  const file = makeSourceFile(source, filePath);
  const diagnostics: DataDiagnostic[] = [];
  const context: ValidationContext = { file, diagnostics };

  if (source.length > MAX_SOURCE_LENGTH) {
    addOffsetDiagnostic(context, "DATA_SOURCE_TOO_LARGE", `YAML source exceeds the limit of ${MAX_SOURCE_LENGTH} characters.`, 0);
    return failure(diagnostics);
  }
  const replacementOffset = source.indexOf("\uFFFD");
  if (replacementOffset >= 0) {
    addOffsetDiagnostic(context, "DATA_INVALID_UNICODE", "The YAML source contains a replacement character and may not be valid UTF-8.", replacementOffset);
    return failure(diagnostics);
  }

  let document: ReturnType<typeof parseDocument>;
  try {
    document = parseDocument(source, {
      prettyErrors: false,
      uniqueKeys: true,
      keepSourceTokens: true,
      schema: "core",
      version: "1.2",
      resolveKnownTags: false,
      merge: false,
      strict: true,
    });
  } catch (error) {
    addOffsetDiagnostic(
      context,
      "YAML_PARSE_ERROR",
      error instanceof Error ? error.message : "The YAML source could not be parsed.",
      0,
      Math.max(1, source.length),
    );
    return failure(diagnostics);
  }

  for (const error of document.errors) {
    const start = error.pos[0] ?? 0;
    const end = error.pos[1] ?? start + 1;
    addDiagnostic(context, parseErrorCode(error.code), error.message, positionAt(file, start, end));
  }

  const contents = document.contents;
  if (!contents || !isMap(contents)) {
    addNodeDiagnostic(context, "DATA_TOP_LEVEL_MAPPING_REQUIRED", "The YAML document must be a top-level mapping.", contents, "");
    return failure(diagnostics);
  }

  walkUnsafeYaml(context, contents);
  const rootEntries = validateMappingKeys(context, contents, ["schema", "version", "enemy"], "");
  const schema = requiredString(context, requiredEntry(context, rootEntries, "schema", "", contents), "/schema", contents);
  if (schema !== ENEMY_DATA_SCHEMA) {
    addNodeDiagnostic(context, "DATA_SCHEMA_INVALID", `schema must equal "${ENEMY_DATA_SCHEMA}".`, findEntry(rootEntries, "schema")?.value ?? contents, "/schema");
  }
  const version = requiredInteger(context, requiredEntry(context, rootEntries, "version", "", contents), "/version", contents);
  if (version !== ENEMY_DATA_VERSION) {
    addNodeDiagnostic(context, "DATA_VERSION_INVALID", `version must equal ${ENEMY_DATA_VERSION}.`, findEntry(rootEntries, "version")?.value ?? contents, "/version");
  }
  const enemy = validateEnemy(context, requiredMap(context, requiredEntry(context, rootEntries, "enemy", "", contents), "/enemy", contents), "/enemy");

  if (diagnostics.length > 0) return failure(diagnostics);
  return success({ schema: ENEMY_DATA_SCHEMA, version: ENEMY_DATA_VERSION, enemy });
}

export function validateEnemyDataYaml(source: string, filePath?: string): DataDiagnostic[] {
  return parseEnemyDataYaml(source, filePath).diagnostics;
}

export function isEnemyDataParseSuccess(result: EnemyDataParseResult): result is EnemyDataParseSuccess {
  return result.ok;
}
