import type { MarkdownNode, MarkdownRoot, ScenarioDocument, SourcePosition } from "../core/types.js";

export const ENEMY_DATA_SCHEMA = "dx3rd-scenario/enemy" as const;
export const ENEMY_DATA_VERSION = 1 as const;

export interface EncroachmentData {
  rate: number;
  level_bonus: number;
  dice_bonus: number;
  notes?: string;
}

export interface PrimaryAbilityData {
  id: "body" | "sense" | "mind" | "social";
  name: string;
  value: number;
}

export interface SecondaryAbilityData {
  id: string;
  name: string;
  value?: number;
  formula?: string;
}

export interface SkillData {
  id: string;
  name: string;
  ability_id: PrimaryAbilityData["id"];
  value: number;
}

export interface AbilitiesData {
  primary: PrimaryAbilityData[];
  secondary: SecondaryAbilityData[];
  skills: SkillData[];
}

export interface EffectData {
  id: string;
  name: string;
  group?: string;
  level?: number;
  description?: string;
  notes?: string;
}

export interface ItemData {
  id: string;
  name: string;
  category?: string;
  attack?: number;
  guard?: number;
  armor?: number;
  range?: string;
  description?: string;
  notes?: string;
}

export interface LoisData {
  id: string;
  name: string;
  relation?: string;
  positive_emotion?: string;
  negative_emotion?: string;
  notes?: string;
}

export interface DLoisData {
  id: string;
  name: string;
  alias?: string;
  description?: string;
  notes?: string;
}

export interface ELoisData {
  id: string;
  name: string;
  count: number;
  description?: string;
  notes?: string;
}

export interface ComboEffectData {
  effect_id: string;
  level?: number;
}

export interface ComboData {
  id: string;
  name: string;
  effects: ComboEffectData[];
  item_ids: string[];
  timing: string;
  target: string;
  range: string;
  check: string;
  attack_type?: string;
  attack_power?: number;
  uses?: string;
  description: string;
  notes?: string;
}

export interface EnemyData {
  id: string;
  name: string;
  aliases: string[];
  syndromes: string[];
  encroachment?: EncroachmentData;
  impulse?: string;
  abilities: AbilitiesData;
  effects: EffectData[];
  items: ItemData[];
  lois: LoisData[];
  d_lois: DLoisData[];
  e_lois: ELoisData[];
  combos: ComboData[];
  notes?: string;
}

export interface EnemyDataDocument {
  schema: typeof ENEMY_DATA_SCHEMA;
  version: typeof ENEMY_DATA_VERSION;
  enemy: EnemyData;
}

export interface DataDiagnostic {
  category: "data" | "reference";
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  position: SourcePosition;
  severity: "error";
  path?: string;
  href?: string;
  candidatePath?: string;
  referencePosition?: SourcePosition;
}

export interface EnemyDataParseSuccess {
  ok: true;
  success: true;
  diagnostics: [];
  value: EnemyDataDocument;
  data: EnemyDataDocument;
  document: EnemyDataDocument;
}

export interface EnemyDataParseFailure {
  ok: false;
  success: false;
  diagnostics: DataDiagnostic[];
}

export type EnemyDataParseResult = EnemyDataParseSuccess | EnemyDataParseFailure;

export type DataReferenceKind = "enemy" | "combo";

export interface EnemyDataReference {
  kind: DataReferenceKind;
  label: string;
  displayName: string;
  href: string;
  filePath: string;
  filePart: string;
  candidatePath: string;
  fragment?: string;
  position: SourcePosition;
  node: MarkdownNode;
}

export interface DataReferenceExtractionResult {
  references: EnemyDataReference[];
  diagnostics: DataDiagnostic[];
}

export interface ResolvedEnemyDataReference {
  reference: EnemyDataReference;
  candidatePath: string;
  data: EnemyDataDocument;
  enemy: EnemyData;
  combo?: ComboData;
}

export interface DataReferenceResolutionSuccess {
  ok: true;
  success: true;
  diagnostics: [];
  references: ResolvedEnemyDataReference[];
  value: ResolvedEnemyDataReference[];
}

export interface DataReferenceResolutionFailure {
  ok: false;
  success: false;
  diagnostics: DataDiagnostic[];
  references: ResolvedEnemyDataReference[];
  value: ResolvedEnemyDataReference[];
}

export type DataReferenceResolutionResult =
  | DataReferenceResolutionSuccess
  | DataReferenceResolutionFailure;

export type EnemyDataSourceLoader = (candidatePath: string) => string | undefined;

export interface EnemyDataSourceLoaderObject {
  load: EnemyDataSourceLoader;
}

export type EnemyDataSource =
  | ReadonlyMap<string, string>
  | Readonly<Record<string, string>>
  | EnemyDataSourceLoader
  | EnemyDataSourceLoaderObject;

export type MarkdownReferenceInput =
  | MarkdownRoot
  | ScenarioDocument
  | readonly EnemyDataReference[];
