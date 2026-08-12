export type DiagnosticSeverity = "error";

export type DiagnosticCategory =
  | "frontmatter"
  | "chapter"
  | "block"
  | "field"
  | "markdown"
  | "raw-html";

export interface SourcePoint {
  line: number;
  column: number;
  offset: number;
}

export interface SourcePosition {
  start: SourcePoint;
  end: SourcePoint;
}

export interface Diagnostic {
  category: DiagnosticCategory;
  code: string;
  message: string;
  file: string;
  line: number;
  column: number;
  position: SourcePosition;
  severity: DiagnosticSeverity;
}

/**
 * A deliberately small structural view of mdast.  The concrete mdast types
 * are transitive dependencies of remark-parse, so the public API keeps this
 * view stable without requiring callers to install a second type package.
 */
export interface MarkdownNode {
  type: string;
  position?: SourcePosition;
  value?: string;
  children?: MarkdownNode[];
  [key: string]: unknown;
}

export interface MarkdownRoot extends MarkdownNode {
  type: "root";
  children: MarkdownNode[];
}

export interface ScenarioFrontmatter {
  id: string;
  kicker?: string;
  lang?: string;
  values: Readonly<Record<string, unknown>>;
  raw: string;
  position: SourcePosition;
  node: MarkdownNode;
}

export type NarrativeBlockName =
  | "dialogue"
  | "roleplay"
  | "choice"
  | "check"
  | "info"
  | "e-lois"
  | "battle";

export type KnownFieldLabel =
  | "技能"
  | "難易度"
  | "必須"
  | "成功時"
  | "失敗時"
  | "備考"
  | "対象"
  | "条件"
  | "分岐"
  | "エネミー"
  | "配置"
  | "戦闘終了条件"
  | "参照";

export interface ScenarioField {
  label: string;
  value: string;
  text: string;
  raw: string;
  position: SourcePosition;
  valuePosition?: SourcePosition;
  valueAst: MarkdownRoot;
  node: MarkdownNode;
}

export interface SkillDifficultyPair<TDifficulty = string> {
  skill: string;
  difficulty: TDifficulty;
  mandatory: boolean;
  skillField: ScenarioField;
  difficultyField: ScenarioField;
  mandatoryField?: ScenarioField;
}

export interface CheckSpec {
  skill: string;
  difficulty: number;
  mandatory: boolean;
  skillField: ScenarioField;
  difficultyField: ScenarioField;
  mandatoryField?: ScenarioField;
}

export interface NarrativeBlockBase<Name extends NarrativeBlockName = NarrativeBlockName> {
  name: Name;
  type: "narrative-block";
  displayTitle: string;
  /** Alias retained for consumers that call the display title simply `title`. */
  title: string;
  body: string;
  bodyAst: MarkdownRoot;
  /** Body AST with direct field rows removed from normal Markdown content. */
  contentAst: MarkdownRoot;
  fields: ScenarioField[];
  knownFields: Readonly<Record<string, ScenarioField[]>>;
  position: SourcePosition;
  bodyPosition: SourcePosition;
}

export interface DialogueBlock extends NarrativeBlockBase<"dialogue"> {}
export interface RoleplayBlock extends NarrativeBlockBase<"roleplay"> {}
export interface ChoiceBlock extends NarrativeBlockBase<"choice"> {}

export interface CheckBlock extends NarrativeBlockBase<"check"> {
  check?: CheckSpec;
}

export interface InfoBlock extends NarrativeBlockBase<"info"> {
  skillDifficultyPairs: SkillDifficultyPair<string>[];
}

export interface ELoisBlock extends NarrativeBlockBase<"e-lois"> {
  skillDifficultyPairs: SkillDifficultyPair<string>[];
}

export interface BattleBlock extends NarrativeBlockBase<"battle"> {}

export type NarrativeBlock =
  | DialogueBlock
  | RoleplayBlock
  | ChoiceBlock
  | CheckBlock
  | InfoBlock
  | ELoisBlock
  | BattleBlock;

export interface ScenarioDocument {
  source: string;
  filePath: string;
  frontmatter: ScenarioFrontmatter;
  chapterTitle: string;
  /** Alias for chapterTitle used by consumers that model titles uniformly. */
  displayTitle: string;
  chapterHeading: MarkdownNode;
  ast: MarkdownRoot;
  markdown: MarkdownRoot;
  blocks: NarrativeBlock[];
}

export interface ParseSuccess {
  ok: true;
  success: true;
  diagnostics: [];
  document: ScenarioDocument;
  value: ScenarioDocument;
  frontmatter: ScenarioFrontmatter;
  chapterTitle: string;
  displayTitle: string;
  chapterHeading: MarkdownNode;
  ast: MarkdownRoot;
  markdown: MarkdownRoot;
  blocks: NarrativeBlock[];
}

export interface ParseFailure {
  ok: false;
  success: false;
  diagnostics: Diagnostic[];
  partial?: Partial<ScenarioDocument>;
}

export type ParseResult = ParseSuccess | ParseFailure;
