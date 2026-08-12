import type {
  CheckBlock,
  MarkdownNode,
  NarrativeBlock,
  ScenarioDocument,
  ScenarioField,
  SourcePosition,
} from "../core/types.js";
import type {
  ComboData,
  EffectData,
  EnemyData,
  ItemData,
  LoisData,
  DLoisData,
  ELoisData as EnemyELoisData,
  PrimaryAbilityData,
  SecondaryAbilityData,
  SkillData,
  ResolvedEnemyDataReference,
} from "../data/types.js";
import {
  HtmlRenderError,
  type HtmlDiagnostic,
  type HtmlRenderOptions,
  type HtmlRenderResult,
  type HtmlRenderSuccess,
  type HtmlReferenceExpansion,
} from "./types.js";

export const HTML_CONTRACT = "dx3rd-scenario/v1" as const;
const DEFAULT_LANGUAGE = "ja";

const FIELD_KEYS: Readonly<Record<string, string>> = {
  "技能": "skill",
  "難易度": "difficulty",
  "必須": "required",
  "対象": "target",
  "条件": "condition",
  "分岐": "branch",
  "成功時": "on-success",
  "失敗時": "on-failure",
  "エネミー": "enemy",
  "配置": "placement",
  "戦闘終了条件": "battle-end-condition",
  "参照": "reference",
  "備考": "notes",
};

const DATA_SECTION_TITLES: Readonly<Record<string, string>> = {
  basic: "基本情報",
  abilities: "能力",
  primary: "基本能力値",
  secondary: "副能力値",
  skills: "技能",
  effects: "エフェクト",
  items: "アイテム",
  lois: "ロイス",
  "d-lois": "Dロイス",
  "e-lois": "Eロイス",
  combos: "コンボ",
};

const DATA_FIELD_LABELS: Readonly<Record<string, string>> = {
  aliases: "別名",
  syndromes: "シンドローム",
  encroachment: "侵蝕率",
  rate: "率",
  level_bonus: "レベル補正",
  dice_bonus: "ダイス補正",
  impulse: "衝動",
  name: "名称",
  value: "値",
  formula: "式",
  ability_id: "能力値ID",
  group: "分類",
  level: "レベル",
  description: "効果",
  category: "分類",
  attack: "攻撃力",
  guard: "ガード値",
  armor: "装甲値",
  range: "射程",
  relation: "関係",
  positive_emotion: "ポジティブ感情",
  negative_emotion: "ネガティブ感情",
  alias: "別名",
  count: "回数",
  timing: "タイミング",
  target: "対象",
  check: "判定",
  attack_type: "攻撃種別",
  attack_power: "攻撃力",
  uses: "使用回数",
};

const DATA_COMBO_FIELD_LABELS: Readonly<Record<string, string>> = {
  timing: "タイミング",
  target: "対象",
  range: "射程",
  check: "判定",
  attack_type: "攻撃種別",
  attack_power: "攻撃力",
  uses: "使用回数",
  description: "効果",
  notes: "備考",
};

type HtmlPart = string | SectionModel;

interface SectionModel {
  level: number;
  id: string;
  titleId: string;
  titleHtml: string;
  children: HtmlPart[];
}

interface Rendered {
  html: string;
  expansions: ResolvedEnemyDataReference[];
}

interface BodyEvent {
  offset: number;
  kind: "field" | "node";
  field?: ScenarioField;
  node?: MarkdownNode;
}

interface DocumentEvent {
  offset: number;
  kind: "block" | "node";
  block?: NarrativeBlock;
  node?: MarkdownNode;
}

interface LinkDefinition {
  url: string;
  title?: string;
}

class RenderAbort extends Error {
  readonly diagnostic: HtmlDiagnostic;

  constructor(diagnostic: HtmlDiagnostic) {
    super(diagnostic.message);
    this.name = "RenderAbort";
    this.diagnostic = diagnostic;
  }
}

class IdAllocator {
  private readonly used = new Set<string>();

  allocate(base: string): string {
    const safeBase = base.length > 0 ? base : "anchor";
    let candidate = safeBase;
    let suffix = 2;
    while (this.used.has(candidate)) {
      candidate = `${safeBase}-${suffix}`;
      suffix += 1;
    }
    this.used.add(candidate);
    return candidate;
  }
}

function spaces(indent: number): string {
  return " ".repeat(Math.max(0, indent));
}

function indentLines(value: string, indent: number): string {
  const prefix = spaces(indent);
  return value.split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function attributeText(attributes: ReadonlyArray<readonly [string, string | undefined]>): string {
  const values = attributes
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
    .map(([name, value]) => `${name}="${escapeHtml(value)}"`);
  return values.length > 0 ? ` ${values.join(" ")}` : "";
}

function element(
  name: string,
  attributes: ReadonlyArray<readonly [string, string | undefined]>,
  children: string,
): string {
  const open = `<${name}${attributeText(attributes)}>`;
  if (children.length === 0) return `${open}</${name}>`;
  return `${open}\n${indentLines(children, 2)}\n</${name}>`;
}

function voidElement(
  name: string,
  attributes: ReadonlyArray<readonly [string, string | undefined]>,
): string {
  return `<${name}${attributeText(attributes)}>`;
}

function clampHeadingLevel(level: number): number {
  return Math.max(2, Math.min(6, Math.trunc(level)));
}

function slug(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^[-_]+|[-_]+$/gu, "")
    .toLowerCase();
  if (normalized.length === 0) return "document";
  if (/^[0-9]/u.test(normalized)) return `x-${normalized}`;
  return normalized;
}

function numbered(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(2, "0")}`;
}

function positionFallback(): SourcePosition {
  return {
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 2, offset: 1 },
  };
}

function nodeStart(node: { position?: SourcePosition } | undefined): number {
  return node?.position?.start.offset ?? Number.MAX_SAFE_INTEGER;
}

function stringProperty(node: MarkdownNode, key: string): string | undefined {
  const value = node[key];
  return typeof value === "string" ? value : undefined;
}

function childNodes(node: MarkdownNode): MarkdownNode[] {
  const children = node.children;
  return Array.isArray(children) ? children : [];
}

function nodeText(node: MarkdownNode): string {
  if (typeof node.value === "string") return node.value;
  return childNodes(node).map(nodeText).join("");
}

function fragmentKey(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

function fragmentCandidates(value: string): string[] {
  const normalized = fragmentKey(value);
  const compact = normalized.replace(/[^\p{L}\p{N}]+/gu, "");
  const dashed = normalized
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return [...new Set([normalized, compact, dashed].filter((candidate) => candidate.length > 0))];
}

function isScenarioDocument(value: unknown): value is ScenarioDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Partial<ScenarioDocument> & { ok?: unknown; diagnostics?: unknown };
  if (candidate.ok === false) return false;
  if (Array.isArray(candidate.diagnostics) && candidate.diagnostics.length > 0) return false;
  return typeof candidate.source === "string"
    && typeof candidate.filePath === "string"
    && typeof candidate.frontmatter === "object"
    && candidate.frontmatter !== null
    && typeof candidate.ast === "object"
    && candidate.ast !== null
    && candidate.ast.type === "root"
    && Array.isArray(candidate.ast.children)
    && typeof candidate.chapterTitle === "string"
    && typeof candidate.chapterHeading === "object"
    && candidate.chapterHeading !== null
    && Array.isArray(candidate.blocks);
}

function diagnosticFor(
  file: string,
  code: string,
  message: string,
  position: SourcePosition,
  category: HtmlDiagnostic["category"],
): HtmlDiagnostic {
  return {
    category,
    code,
    message,
    file,
    line: position.start.line,
    column: position.start.column,
    position,
    severity: "error",
  };
}

function plainDataValue(value: string | number): string {
  return escapeHtml(String(value));
}

function labelForDataKey(key: string): string {
  return DATA_FIELD_LABELS[key] ?? DATA_COMBO_FIELD_LABELS[key] ?? key;
}

class Renderer {
  private readonly ids = new IdAllocator();
  private readonly document: ScenarioDocument;
  private readonly options: HtmlRenderOptions;
  private readonly references: readonly ResolvedEnemyDataReference[];
  private readonly expanded = new Set<string>();
  private readonly referenceExpansion: HtmlReferenceExpansion;
  private readonly documentSlug: string;
  private readonly documentId: string;
  private readonly sectionIds = new Map<MarkdownNode, string>();
  private readonly internalFragmentTargets = new Map<string, string>();
  private readonly definitions = new Map<string, LinkDefinition>();
  private blockIndex = 0;
  private sectionIndex = 0;

  constructor(document: ScenarioDocument, options: HtmlRenderOptions) {
    this.document = document;
    this.options = options;
    this.references = options.references
      ?? options.resolvedReferences
      ?? options.resolvedEnemyReferences
      ?? options.resolvedEnemyDataReferences
      ?? [];
    this.referenceExpansion = options.referenceExpansion
      ?? options.expandReferences
      ?? "first";
    this.documentId = `document-${slug(document.frontmatter.id)}`;
    this.documentSlug = slug(document.frontmatter.id);
  }

  render(): string {
    this.validateDocument();
    this.collectDefinitions(this.document.ast);
    const mode = this.options.mode ?? "fragment";
    if (mode !== "fragment" && mode !== "document") {
      this.fail("HTML_MODE_INVALID", "mode must be \"fragment\" or \"document\".", undefined, "input");
    }
    const main = this.renderMain();
    if (mode === "fragment") return main;
    return this.renderDocument(main);
  }

  private validateDocument(): void {
    const frontmatterId = this.document.frontmatter.id;
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(frontmatterId)) {
      this.fail(
        "HTML_DOCUMENT_ID_INVALID",
        "ScenarioDocument.frontmatter.id must be a validated ASCII identifier.",
        this.document.frontmatter.node,
        "input",
      );
    }
    if (this.document.ast.type !== "root") {
      this.fail("HTML_ROOT_REQUIRED", "ScenarioDocument.ast must be a root node.", this.document.ast, "input");
    }
    if (this.document.chapterHeading.type !== "heading" || this.document.chapterHeading.depth !== 1) {
      this.fail(
        "HTML_CHAPTER_TITLE_REQUIRED",
        "ScenarioDocument.chapterHeading must be the validated chapter H1.",
        this.document.chapterHeading,
        "input",
      );
    }
    if (this.document.frontmatter.lang !== undefined && /[\u0000-\u001f\u007f]/u.test(this.document.frontmatter.lang)) {
      this.fail(
        "HTML_LANGUAGE_INVALID",
        "ScenarioDocument.frontmatter.lang contains a control character.",
        this.document.frontmatter.node,
        "input",
      );
    }
    if (this.referenceExpansion !== "first" && this.referenceExpansion !== "each") {
      this.fail("HTML_REFERENCE_EXPANSION_INVALID", "referenceExpansion must be \"first\" or \"each\".", undefined, "input");
    }
    for (const block of this.document.blocks) {
      if (!this.isNarrativeBlock(block)) {
        this.fail("HTML_BLOCK_INVALID", "ScenarioDocument contains an invalid narrative block.", undefined, "input");
      }
    }
  }

  private isNarrativeBlock(block: NarrativeBlock): boolean {
    return ["dialogue", "roleplay", "choice", "check", "info", "e-lois", "battle"].includes(block.name)
      && block.type === "narrative-block"
      && typeof block.displayTitle === "string"
      && Array.isArray(block.fields)
      && typeof block.contentAst === "object"
      && block.contentAst !== null;
  }

  private fail(
    code: string,
    message: string,
    node: MarkdownNode | undefined,
    category: HtmlDiagnostic["category"] = "render",
  ): never {
    const position = node?.position
      ?? this.document.chapterHeading.position
      ?? this.document.frontmatter.position
      ?? positionFallback();
    throw new RenderAbort(diagnosticFor(this.document.filePath, code, message, position, category));
  }

  private renderDocument(main: string): string {
    const lang = this.document.frontmatter.lang ?? DEFAULT_LANGUAGE;
    const title = escapeHtml(this.document.chapterTitle);
    const head = element("head", [], `${voidElement("meta", [["charset", "utf-8"]])}\n<title>${title}</title>`);
    const body = element("body", [], main);
    const html = element("html", [["lang", lang], ["data-html-contract", HTML_CONTRACT]], `${head}\n${body}`);
    return `${this.options.doctype === false ? "" : "<!doctype html>\n"}${html}`;
  }

  private collectDefinitions(node: MarkdownNode): void {
    if (node.type === "definition") {
      const identifier = stringProperty(node, "identifier");
      const url = stringProperty(node, "url");
      if (!identifier || !url) this.fail("HTML_DEFINITION_INVALID", "A link definition requires an identifier and URL.", node);
      this.validateUrl(url, node);
      if (!this.definitions.has(fragmentKey(identifier))) {
        const definition: LinkDefinition = { url };
        const title = stringProperty(node, "title");
        if (title !== undefined) definition.title = title;
        this.definitions.set(fragmentKey(identifier), definition);
      }
    }
    for (const child of childNodes(node)) this.collectDefinitions(child);
  }

  private renderMain(): string {
    const mainId = this.ids.allocate(this.documentId);
    const titleId = this.ids.allocate(`${mainId}-title`);
    this.prepareSectionIds();
    const titleRendered = this.renderInlineChildren(childNodes(this.document.chapterHeading));
    const headerParts: string[] = [];
    if (this.document.frontmatter.kicker !== undefined) {
      headerParts.push(element("p", [["class", "document-kicker"], ["data-region", "document-kicker"]], escapeHtml(this.document.frontmatter.kicker)));
    }
    headerParts.push(element("h1", [["id", titleId], ["class", "document-title"]], titleRendered.html));
    const header = element("header", [["class", "document-header"], ["data-region", "document-header"]], headerParts.join("\n"));
    const bodyParts: HtmlPart[] = [
      ...titleRendered.expansions.map((reference) => this.renderStructuredData(reference, 1)),
      ...this.renderDocumentBody(),
    ];
    const body = element("div", [["class", "document-body"], ["data-region", "document-body"]], this.serializeParts(bodyParts));
    return element(
      "main",
      [["id", mainId], ["class", "document"], ["data-document-id", this.document.frontmatter.id]],
      `${header}\n${body}`,
    );
  }

  private prepareSectionIds(): void {
    const headings = this.document.ast.children
      .filter((node) => node !== this.document.chapterHeading && node.type === "heading" && node.depth !== 1)
      .filter((node) => !this.document.blocks.some((block) => this.isInsideBlock(node, block)))
      .sort((left, right) => nodeStart(left) - nodeStart(right));
    for (const heading of headings) {
      const depth = this.headingDepth(heading);
      const sectionId = this.ids.allocate(numbered("section-" + this.documentSlug, ++this.sectionIndex));
      this.sectionIds.set(heading, sectionId);
      for (const candidate of fragmentCandidates(nodeText(heading))) {
        if (!this.internalFragmentTargets.has(candidate)) this.internalFragmentTargets.set(candidate, sectionId);
      }
      this.internalFragmentTargets.set(fragmentKey(sectionId), sectionId);
      if (depth < 2) this.fail("HTML_SECTION_HEADING_INVALID", "Document sections must use H2 through H6.", heading);
    }
  }

  private renderDocumentBody(): HtmlPart[] {
    const events: DocumentEvent[] = [];
    const chapterHeading = this.document.chapterHeading;
    const blocks = [...this.document.blocks].sort((left, right) => nodeStart(left) - nodeStart(right));

    for (const block of blocks) {
      events.push({ offset: nodeStart(block), kind: "block", block });
    }

    for (const node of this.document.ast.children) {
      if (node === chapterHeading || this.samePosition(node, chapterHeading)) continue;
      if (blocks.some((block) => this.isInsideBlock(node, block))) continue;
      events.push({ offset: nodeStart(node), kind: "node", node });
    }

    events.sort((left, right) => {
      if (left.offset !== right.offset) return left.offset - right.offset;
      return left.kind === "block" ? -1 : 1;
    });

    const root: HtmlPart[] = [];
    const stack: SectionModel[] = [];
    for (const event of events) {
      const parent = (): HtmlPart[] => stack[stack.length - 1]?.children ?? root;
      if (event.kind === "block") {
        if (!event.block) this.fail("HTML_BLOCK_EVENT_INVALID", "A block event has no block value.", undefined);
        const rendered = this.renderBlock(event.block, stack[stack.length - 1]?.level ?? 1);
        parent().push(rendered.html, ...rendered.expansions.map((reference) => this.renderStructuredData(reference, stack[stack.length - 1]?.level ?? 1)));
        continue;
      }

      const node = event.node;
      if (!node) this.fail("HTML_NODE_EVENT_INVALID", "A Markdown event has no node value.", undefined);
      if (node.type === "heading") {
        const depth = this.headingDepth(node);
        if (depth === 1) this.fail("HTML_MULTIPLE_CHAPTER_H1", "Only the validated chapter H1 may be rendered as H1.", node);
        while (true) {
          const current = stack[stack.length - 1];
          if (!current || current.level < depth) break;
          stack.pop();
        }
        const sectionId = this.sectionIds.get(node);
        if (!sectionId) this.fail("HTML_SECTION_ID_MISSING", "A document heading has no generated section ID.", node);
        const titleId = this.ids.allocate(`${sectionId}-title`);
        const renderedTitle = this.renderInlineChildren(childNodes(node));
        const section: SectionModel = {
          level: depth,
          id: sectionId,
          titleId,
          titleHtml: renderedTitle.html,
          children: [],
        };
        section.children.push(...renderedTitle.expansions.map((reference) => this.renderStructuredData(reference, depth)));
        parent().push(section);
        stack.push(section);
        continue;
      }

      const rendered = this.renderNode(node, stack[stack.length - 1]?.level ?? 1);
      if (rendered.html.length > 0) {
        parent().push(rendered.html, ...rendered.expansions.map((reference) => this.renderStructuredData(reference, stack[stack.length - 1]?.level ?? 1)));
      } else {
        parent().push(...rendered.expansions.map((reference) => this.renderStructuredData(reference, stack[stack.length - 1]?.level ?? 1)));
      }
      }
    return root;
  }

  private samePosition(left: MarkdownNode, right: MarkdownNode): boolean {
    return left.position?.start.offset !== undefined
      && left.position.start.offset === right.position?.start.offset
      && left.position.end.offset === right.position?.end.offset;
  }

  private isInsideBlock(node: MarkdownNode, block: NarrativeBlock): boolean {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    const blockStart = block.bodyPosition.start.offset;
    const blockEnd = block.bodyPosition.end.offset;
    return start !== undefined && end !== undefined && start >= blockStart && end <= blockEnd;
  }

  private headingDepth(node: MarkdownNode): number {
    const depth = node.depth;
    if (typeof depth !== "number" || depth < 1 || depth > 6 || !Number.isInteger(depth)) {
      this.fail("HTML_HEADING_DEPTH_INVALID", "A heading node must have an integer depth from 1 to 6.", node);
    }
    return depth;
  }

  private renderBlock(block: NarrativeBlock, parentHeadingLevel: number): Rendered {
    const blockId = this.ids.allocate(numbered(`block-${this.documentSlug}`, ++this.blockIndex));
    const titleId = this.ids.allocate(`${blockId}-title`);
    const headingLevel = clampHeadingLevel(parentHeadingLevel + 1);
    const title = element(
      `h${headingLevel}`,
      [["id", titleId], ["class", "scenario-block__title"]],
      escapeHtml(block.displayTitle),
    );
    const header = element(
      "header",
      [["class", "scenario-block__header"], ["data-region", "block-header"]],
      title,
    );
    const body = this.renderBlockBody(block, headingLevel);
    const attributes: Array<readonly [string, string | undefined]> = [
      ["id", blockId],
      ["class", `scenario-block scenario-block--${block.name}`],
      ["data-block-id", blockId],
      ["data-block-kind", block.name],
    ];
    if (block.name === "check") {
      attributes.push(["data-check-mandatory", block.fields.some((field) => field.label === "必須") ? "true" : "false"]);
    }
    attributes.push(["aria-labelledby", titleId]);
    return {
      html: element("section", attributes, `${header}\n${body.html}`),
      expansions: body.expansions,
    };
  }

  private renderBlockBody(block: NarrativeBlock, headingLevel: number): Rendered {
    const parts: string[] = [];
    const machineFields = new Set<ScenarioField>();
    if (block.name === "check") {
      const check = (block as CheckBlock).check;
      if (check) {
        machineFields.add(check.skillField);
        machineFields.add(check.difficultyField);
        if (check.mandatoryField) machineFields.add(check.mandatoryField);
        const fieldList = this.renderFieldList([
          check.skillField,
          check.difficultyField,
          ...(check.mandatoryField ? [check.mandatoryField] : []),
        ]);
        parts.push(fieldList.html);
        parts.push(...fieldList.expansions.map((reference) => this.renderStructuredData(reference, headingLevel)));
      }
    }

    const fields = block.fields.filter((field) => !machineFields.has(field));
    const events: BodyEvent[] = [
      ...fields.map((field) => ({ offset: field.position.start.offset, kind: "field" as const, field })),
      ...block.contentAst.children.map((node) => ({ offset: nodeStart(node), kind: "node" as const, node })),
    ].sort((left, right) => {
      if (left.offset !== right.offset) return left.offset - right.offset;
      return left.kind === "field" ? -1 : 1;
    });

    let index = 0;
    while (index < events.length) {
      const event = events[index];
      if (!event) break;
      if (event.kind === "field") {
        const group: ScenarioField[] = [];
        while (index < events.length && events[index]?.kind === "field") {
          const field = events[index]?.field;
          if (field) group.push(field);
          index += 1;
        }
        if (group.length > 0) {
          const fieldList = this.renderFieldList(group);
          parts.push(fieldList.html);
          parts.push(...fieldList.expansions.map((reference) => this.renderStructuredData(reference, headingLevel)));
        }
        continue;
      }
      if (!event.node) this.fail("HTML_NODE_EVENT_INVALID", "A block content event has no node value.", undefined);
      const rendered = this.renderNode(event.node, headingLevel);
      parts.push(rendered.html);
      parts.push(...rendered.expansions.map((reference) => this.renderStructuredData(reference, headingLevel)));
      index += 1;
    }

    const body = element(
      "div",
      [["class", "scenario-block__body"], ["data-region", "block-body"]],
      parts.join("\n"),
    );
    return { html: body, expansions: [] };
  }

  private renderFieldList(fields: readonly ScenarioField[]): Rendered {
    const items: string[] = [];
    let expansions: ResolvedEnemyDataReference[] = [];
    for (const field of fields) {
      const key = FIELD_KEYS[field.label];
      if (!key) this.fail("HTML_UNKNOWN_FIELD", `No HTML field key is defined for [${field.label}].`, field.node);
      const value = this.renderFieldValue(field);
      items.push(element(
        "div",
        [["class", "field-list__item"], ["data-field-key", key]],
        `${element("dt", [], escapeHtml(field.label))}\n${element("dd", [], value.html)}`,
      ));
      expansions = expansions.concat(value.expansions);
    }
    return {
      html: element("dl", [["class", "field-list"], ["data-region", "field-list"]], items.join("\n")),
      expansions,
    };
  }

  private renderFieldValue(field: ScenarioField): Rendered {
    const children = field.valueAst.children;
    if (children.length === 0) return { html: escapeHtml(field.label === "必須" ? "必須" : field.text), expansions: [] };
    const parts: string[] = [];
    let expansions: ResolvedEnemyDataReference[] = [];
    for (const child of children) {
      if (child.type === "paragraph") {
        const rendered = this.renderInlineChildren(childNodes(child));
        parts.push(rendered.html);
        expansions = expansions.concat(rendered.expansions);
      } else {
        const rendered = this.renderNode(child, 4);
        parts.push(rendered.html);
        expansions = expansions.concat(rendered.expansions);
      }
    }
    return { html: parts.join("\n"), expansions };
  }

  private renderNode(node: MarkdownNode, contextHeadingLevel: number): Rendered {
    switch (node.type) {
      case "root":
        return this.renderChildren(childNodes(node), contextHeadingLevel);
      case "paragraph": {
        const children = childNodes(node);
        if (children.length === 1 && (children[0]?.type === "image" || children[0]?.type === "imageReference")) {
          return this.renderFigure(children[0]);
        }
        const rendered = this.renderInlineChildren(children);
        return { html: element("p", [], rendered.html), expansions: rendered.expansions };
      }
      case "heading": {
        const depth = this.headingDepth(node);
        const rendered = this.renderInlineChildren(childNodes(node));
        return { html: element(`h${depth}`, [], rendered.html), expansions: rendered.expansions };
      }
      case "emphasis":
        return this.renderInlineContainer("em", node);
      case "strong":
        return this.renderInlineContainer("strong", node);
      case "delete":
        return this.renderInlineContainer("del", node);
      case "inlineCode": {
        const value = stringProperty(node, "value");
        if (value === undefined) this.fail("HTML_INLINE_CODE_VALUE_REQUIRED", "inlineCode requires a string value.", node);
        return { html: `<code>${escapeHtml(value)}</code>`, expansions: [] };
      }
      case "break":
        return { html: "<br>", expansions: [] };
      case "text": {
        const value = stringProperty(node, "value");
        if (value === undefined) this.fail("HTML_TEXT_VALUE_REQUIRED", "text requires a string value.", node);
        return { html: escapeHtml(value), expansions: [] };
      }
      case "link":
        return this.renderLink(node);
      case "linkReference":
        return this.renderLinkReference(node);
      case "image":
        return this.renderImage(node);
      case "imageReference":
        return this.renderImage(node);
      case "definition":
        return { html: "", expansions: [] };
      case "code": {
        const value = stringProperty(node, "value");
        if (value === undefined) this.fail("HTML_CODE_VALUE_REQUIRED", "code requires a string value.", node);
        const lang = stringProperty(node, "lang");
        const codeAttributes: Array<readonly [string, string | undefined]> = [
          ["class", lang && lang.length > 0 ? `language-${lang}` : undefined],
        ];
        const code = element("code", codeAttributes, escapeHtml(value));
        return { html: element("pre", [], code), expansions: [] };
      }
      case "blockquote": {
        const rendered = this.renderChildren(childNodes(node), contextHeadingLevel);
        return { html: element("blockquote", [], rendered.html), expansions: rendered.expansions };
      }
      case "list":
        return this.renderList(node, contextHeadingLevel);
      case "listItem": {
        const rendered = this.renderChildren(childNodes(node), contextHeadingLevel);
        return { html: element("li", [], rendered.html), expansions: rendered.expansions };
      }
      case "thematicBreak":
        return { html: "<hr>", expansions: [] };
      case "table":
        return this.renderTable(node, contextHeadingLevel);
      case "tableRow":
      case "tableCell":
        this.fail("HTML_TABLE_NODE_CONTEXT", `${node.type} may only be rendered inside a table.`, node);
        break;
      case "html":
        this.fail("HTML_RAW_HTML", "Raw HTML nodes are not emitted by the renderer.", node, "security");
        break;
      default:
        this.fail("HTML_UNKNOWN_NODE", `Unsupported Markdown AST node type: ${node.type}.`, node);
    }
    return { html: "", expansions: [] };
  }

  private renderChildren(nodes: readonly MarkdownNode[], contextHeadingLevel: number): Rendered {
    const parts: string[] = [];
    let expansions: ResolvedEnemyDataReference[] = [];
    for (const node of nodes) {
      const rendered = this.renderNode(node, contextHeadingLevel);
      if (rendered.html.length > 0) parts.push(rendered.html);
      expansions = expansions.concat(rendered.expansions);
    }
    return { html: parts.join("\n"), expansions };
  }

  private renderInlineContainer(name: string, node: MarkdownNode): Rendered {
    const rendered = this.renderInlineChildren(childNodes(node));
    return { html: `<${name}>${rendered.html}</${name}>`, expansions: rendered.expansions };
  }

  private renderInlineChildren(nodes: readonly MarkdownNode[]): Rendered {
    const parts: string[] = [];
    let expansions: ResolvedEnemyDataReference[] = [];
    for (const node of nodes) {
      const rendered = this.renderNode(node, 4);
      parts.push(rendered.html);
      expansions = expansions.concat(rendered.expansions);
    }
    return { html: parts.join(""), expansions };
  }

  private renderList(node: MarkdownNode, contextHeadingLevel: number): Rendered {
    const ordered = node.ordered === true;
    const listItems: string[] = [];
    let expansions: ResolvedEnemyDataReference[] = [];
    for (const child of childNodes(node)) {
      if (child.type !== "listItem") this.fail("HTML_LIST_ITEM_REQUIRED", "list children must be listItem nodes.", child);
      const rendered = this.renderNode(child, contextHeadingLevel);
      listItems.push(rendered.html);
      expansions = expansions.concat(rendered.expansions);
    }
    const start = typeof node.start === "number" && Number.isInteger(node.start) && node.start !== 1
      ? String(node.start)
      : undefined;
    return {
      html: element(ordered ? "ol" : "ul", [["start", ordered ? start : undefined]], listItems.join("\n")),
      expansions,
    };
  }

  private renderTable(node: MarkdownNode, contextHeadingLevel: number): Rendered {
    const rows = childNodes(node);
    const renderedRows: string[] = [];
    let expansions: ResolvedEnemyDataReference[] = [];
    rows.forEach((row, rowIndex) => {
      if (row.type !== "tableRow") this.fail("HTML_TABLE_ROW_REQUIRED", "table children must be tableRow nodes.", row);
      const cells: string[] = [];
      childNodes(row).forEach((cell) => {
        if (cell.type !== "tableCell") this.fail("HTML_TABLE_CELL_REQUIRED", "tableRow children must be tableCell nodes.", cell);
        const rendered = this.renderChildren(childNodes(cell), contextHeadingLevel);
        cells.push(element(rowIndex === 0 ? "th" : "td", [], rendered.html));
        expansions = expansions.concat(rendered.expansions);
      });
      renderedRows.push(element("tr", [], cells.join("\n")));
    });
    const caption = stringProperty(node, "caption");
    const captionPart = caption !== undefined ? `${element("caption", [], escapeHtml(caption))}\n` : "";
    const head = renderedRows.length > 0 ? element("thead", [], renderedRows[0] ?? "") : undefined;
    const bodyRows = renderedRows.slice(1);
    const body = bodyRows.length > 0 ? element("tbody", [], bodyRows.join("\n")) : undefined;
    return {
      html: element("table", [], `${captionPart}${head ?? ""}${head && body ? "\n" : ""}${body ?? ""}`),
      expansions,
    };
  }

  private renderFigure(node: MarkdownNode): Rendered {
    const imageNode = node.type === "imageReference" ? this.referenceNode(node, "image") : node;
    const image = this.renderImage(imageNode);
    const title = stringProperty(imageNode, "title");
    const caption = title !== undefined && title.length > 0 ? `\n${element("figcaption", [], escapeHtml(title))}` : "";
    return {
      html: element("figure", [["class", "document-figure"], ["data-region", "figure"]], `${image.html}${caption}`),
      expansions: image.expansions,
    };
  }

  private renderImage(node: MarkdownNode): Rendered {
    const image = node.type === "imageReference" ? this.referenceNode(node, "image") : node;
    const url = stringProperty(image, "url");
    if (url === undefined) this.fail("HTML_IMAGE_URL_REQUIRED", "image requires a string url.", node);
    this.validateUrl(url, node);
    const altValue = image.alt;
    const alt = typeof altValue === "string" ? altValue : "";
    const title = stringProperty(image, "title");
    return {
      html: voidElement("img", [["src", url], ["alt", alt], ["title", title]]),
      expansions: [],
    };
  }

  private renderLink(node: MarkdownNode): Rendered {
    const url = stringProperty(node, "url");
    if (url === undefined) this.fail("HTML_LINK_URL_REQUIRED", "link requires a string url.", node);
    this.validateUrl(url, node);
    const resolved = this.findResolvedReference(node, url);
    const label = this.renderInlineChildren(childNodes(node));
    const title = stringProperty(node, "title");
    const attributes: Array<readonly [string, string | undefined]> = [];
    let expansion: ResolvedEnemyDataReference | undefined;
    if (resolved) {
      attributes.push(
        ["class", "structured-data-reference"],
        ["data-link-kind", "structured-data"],
        ["data-data-kind", resolved.reference.kind],
        ["data-enemy-id", resolved.enemy.id],
        ["data-combo-id", resolved.combo?.id],
      );
      if (this.shouldExpand(resolved)) expansion = resolved;
    } else {
      attributes.push(["data-link-kind", this.linkKind(url)]);
    }
    const href = resolved ? url : this.resolveHref(url);
    attributes.push(["title", title], ["href", href]);
    return {
      html: `<a${attributeText(attributes)}>${label.html}</a>`,
      expansions: expansion ? [expansion] : label.expansions,
    };
  }

  private renderLinkReference(node: MarkdownNode): Rendered {
    return this.renderLink(this.referenceNode(node, "link"));
  }

  private referenceNode(node: MarkdownNode, type: "link" | "image"): MarkdownNode {
    const definition = this.definitionFor(node);
    const synthetic: MarkdownNode = {
      type,
      url: definition.url,
      children: childNodes(node),
    };
    if (definition.title !== undefined) synthetic.title = definition.title;
    if (node.position) synthetic.position = node.position;
    if (type === "image" && typeof node.alt === "string") synthetic.alt = node.alt;
    return synthetic;
  }

  private definitionFor(node: MarkdownNode): LinkDefinition {
    const identifier = stringProperty(node, "identifier");
    if (!identifier) this.fail("HTML_REFERENCE_IDENTIFIER_REQUIRED", "A reference link requires an identifier.", node);
    const definition = this.definitions.get(fragmentKey(identifier));
    if (!definition) this.fail("HTML_REFERENCE_DEFINITION_MISSING", "No definition exists for reference: " + identifier + ".", node);
    return definition;
  }

  private linkKind(url: string): "internal" | "cross-document" | "external" {
    if (url.startsWith("#")) return "internal";
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(url)) return "external";
    return "cross-document";
  }

  private resolveHref(url: string): string {
    if (!url.startsWith("#")) return url;
    let fragment = url.slice(1);
    try {
      fragment = decodeURIComponent(fragment);
    } catch {
      return url;
    }
    const target = this.internalFragmentTargets.get(fragmentKey(fragment));
    return target ? "#" + target : url;
  }

  private validateUrl(url: string, node: MarkdownNode): void {
    if (url.length === 0 || url.trim() !== url || /[\s\u0000-\u001f\u007f-\u009f]/u.test(url) || url.includes("\\")) {
      this.fail("HTML_URL_INVALID", "Links and images must use a safe URL without whitespace or control characters.", node, "security");
    }
    if (url.startsWith("//")) {
      this.fail("HTML_UNSAFE_URL", "Protocol-relative URLs are not allowed in generated HTML.", node, "security");
    }
    let decoded = url;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      this.fail("HTML_URL_INVALID", "Links and images contain invalid percent encoding.", node, "security");
    }
    if (decoded.trim() !== decoded || /[\s\u0000-\u001f\u007f-\u009f]/u.test(decoded) || decoded.includes("\\")) {
      this.fail("HTML_URL_INVALID", "Links and images contain encoded whitespace or control characters.", node, "security");
    }
    if (decoded.startsWith("//")) {
      this.fail("HTML_UNSAFE_URL", "Encoded protocol-relative URLs are not allowed in generated HTML.", node, "security");
    }
    const schemeMatch = /^([A-Za-z][A-Za-z0-9+.-]*):/u.exec(decoded);
    if (!schemeMatch) return;
    const scheme = schemeMatch[1]?.toLowerCase();
    if (scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel") return;
    this.fail("HTML_UNSAFE_URL", `The URL scheme "${scheme ?? ""}" is not allowed in generated HTML.`, node, "security");
  }

  private findResolvedReference(node: MarkdownNode, url: string): ResolvedEnemyDataReference | undefined {
    return this.references.find((candidate) => {
      if (candidate.reference.node === node) return true;
      const referenceNode = candidate.reference.node;
      return referenceNode.position?.start.offset === node.position?.start.offset
        && referenceNode.position?.end.offset === node.position?.end.offset
        && candidate.reference.href === url;
    });
  }

  private referenceKey(reference: ResolvedEnemyDataReference): string {
    return `${reference.candidatePath}:${reference.reference.kind}:${reference.enemy.id}:${reference.combo?.id ?? ""}`;
  }

  private shouldExpand(reference: ResolvedEnemyDataReference): boolean {
    if (this.referenceExpansion === "each") return true;
    const key = this.referenceKey(reference);
    if (this.expanded.has(key)) return false;
    this.expanded.add(key);
    return true;
  }

  private renderStructuredData(reference: ResolvedEnemyDataReference, contextHeadingLevel: number): string {
    if (reference.reference.kind === "enemy") return this.renderEnemy(reference.enemy, contextHeadingLevel);
    if (!reference.combo) this.fail("HTML_COMBO_DATA_REQUIRED", "A resolved combo reference must include combo data.", reference.reference.node, "input");
    return this.renderComboRoot(reference.enemy, reference.combo, contextHeadingLevel);
  }

  private renderEnemy(enemy: EnemyData, contextHeadingLevel: number): string {
    const rootId = this.ids.allocate(`enemy-${slug(enemy.id)}`);
    const titleId = this.ids.allocate(`${rootId}-title`);
    const rootLevel = clampHeadingLevel(contextHeadingLevel + 1);
    const header = element(
      "header",
      [["class", "structured-data__header"], ["data-region", "data-header"]],
      element(`h${rootLevel}`, [["id", titleId], ["class", "structured-data__title"]], escapeHtml(enemy.name)),
    );
    const body = element("div", [["class", "structured-data__body"], ["data-region", "data-body"]], this.renderEnemySections(enemy, rootId, rootLevel + 1).join("\n"));
    return element(
      "section",
      [
        ["id", rootId],
        ["class", "structured-data structured-data--enemy"],
        ["data-region", "structured-data"],
        ["data-data-kind", "enemy"],
        ["data-enemy-id", enemy.id],
        ["data-data-schema", "dx3rd-scenario/enemy"],
        ["data-data-version", "1"],
        ["aria-labelledby", titleId],
      ],
      `${header}\n${body}`,
    );
  }

  private renderEnemySections(enemy: EnemyData, rootId: string, headingLevel: number): string[] {
    const sections: string[] = [];
    sections.push(this.renderBasicSection(enemy, rootId, headingLevel));
    sections.push(this.renderAbilitiesSection(enemy, rootId, headingLevel));
    sections.push(this.renderEffectsSection(enemy.effects, rootId, "effects", headingLevel));
    sections.push(this.renderItemsSection(enemy.items, rootId, headingLevel));
    sections.push(this.renderLoisSection(enemy.lois, rootId, "lois", headingLevel));
    sections.push(this.renderDLoisSection(enemy.d_lois, rootId, headingLevel));
    sections.push(this.renderELoisSection(enemy.e_lois, rootId, headingLevel));
    sections.push(this.renderCombosSection(enemy, rootId, headingLevel));
    return sections;
  }

  private renderStructuredSection(
    rootId: string,
    sectionKey: string,
    headingLevel: number,
    content: string,
    title = DATA_SECTION_TITLES[sectionKey] ?? sectionKey,
  ): string {
    const sectionId = this.ids.allocate(`${rootId}-${slug(sectionKey)}`);
    const titleId = this.ids.allocate(`${sectionId}-title`);
    return element(
      "section",
      [["class", "structured-data__section"], ["data-data-section", sectionKey], ["aria-labelledby", titleId]],
      `${element(`h${clampHeadingLevel(headingLevel)}`, [["id", titleId], ["class", "structured-data__section-title"]], escapeHtml(title))}\n${content}`,
    );
  }

  private renderBasicSection(enemy: EnemyData, rootId: string, headingLevel: number): string {
    const fields: string[] = [
      this.renderDataField("aliases", "別名", this.renderStringList(enemy.aliases)),
      this.renderDataField("syndromes", "シンドローム", this.renderStringList(enemy.syndromes)),
    ];
    if (enemy.encroachment) {
      const nested: string[] = [
        this.renderDataField("rate", "率", plainDataValue(enemy.encroachment.rate)),
        this.renderDataField("level_bonus", "レベル補正", plainDataValue(enemy.encroachment.level_bonus)),
        this.renderDataField("dice_bonus", "ダイス補正", plainDataValue(enemy.encroachment.dice_bonus)),
      ];
      if (enemy.encroachment.notes !== undefined) nested.push(this.renderDataField("notes", "備考", escapeHtml(enemy.encroachment.notes)));
      fields.push(this.renderDataField("encroachment", "侵蝕率", element("dl", [["class", "data-fields"], ["data-region", "data-fields"]], nested.join("\n"))));
    }
    if (enemy.impulse !== undefined) fields.push(this.renderDataField("impulse", "衝動", escapeHtml(enemy.impulse)));
    if (enemy.notes !== undefined) fields.push(this.renderDataField("notes", "備考", escapeHtml(enemy.notes)));
    return this.renderStructuredSection(rootId, "basic", headingLevel, element("dl", [["class", "data-fields"], ["data-region", "data-fields"]], fields.join("\n")));
  }

  private renderAbilitiesSection(enemy: EnemyData, rootId: string, headingLevel: number): string {
    const childLevel = clampHeadingLevel(headingLevel + 1);
    const children = [
      this.renderAbilityListSection(rootId, "primary", childLevel, enemy.abilities.primary),
      this.renderAbilityListSection(rootId, "secondary", childLevel, enemy.abilities.secondary),
      this.renderAbilityListSection(rootId, "skills", childLevel, enemy.abilities.skills),
    ];
    return this.renderStructuredSection(rootId, "abilities", headingLevel, children.join("\n"));
  }

  private renderAbilityListSection(
    rootId: string,
    key: "primary" | "secondary" | "skills",
    headingLevel: number,
    values: readonly (PrimaryAbilityData | SecondaryAbilityData | SkillData)[],
  ): string {
    const items: string[] = [];
    values.forEach((value) => {
      const dataAttributes: Array<readonly [string, string | undefined]> = [["class", "data-list__item"], ["data-entry-id", value.id]];
      if (key === "skills") dataAttributes.push(["data-ability-id", (value as SkillData).ability_id]);
      const fields: Array<[string, string, string]> = [["name", "名称", escapeHtml(value.name)]];
      if (key === "skills") {
        const skill = value as SkillData;
        fields.push(["ability_id", "能力値ID", escapeHtml(skill.ability_id)]);
        fields.push(["value", "値", plainDataValue(skill.value)]);
      } else if (key === "primary") {
        fields.push(["value", "値", plainDataValue((value as PrimaryAbilityData).value)]);
      } else {
        const secondary = value as SecondaryAbilityData;
        if (secondary.value !== undefined) fields.push(["value", "値", plainDataValue(secondary.value)]);
        if (secondary.formula !== undefined) fields.push(["formula", "式", escapeHtml(secondary.formula)]);
      }
      items.push(element("li", dataAttributes, this.renderDataFields(fields)));
    });
    return this.renderStructuredSection(rootId, key, headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderEffectsSection(values: readonly EffectData[], rootId: string, key: "effects", headingLevel: number): string {
    const items = values.map((value) => this.renderNamedDataItem(value, ["group", "level", "description", "notes"]));
    return this.renderStructuredSection(rootId, key, headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderItemsSection(values: readonly ItemData[], rootId: string, headingLevel: number): string {
    const items = values.map((value) => this.renderNamedDataItem(value, ["category", "attack", "guard", "armor", "range", "description", "notes"]));
    return this.renderStructuredSection(rootId, "items", headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderLoisSection(values: readonly LoisData[], rootId: string, key: "lois", headingLevel: number): string {
    const items = values.map((value) => this.renderNamedDataItem(value, ["relation", "positive_emotion", "negative_emotion", "notes"]));
    return this.renderStructuredSection(rootId, key, headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderDLoisSection(values: readonly DLoisData[], rootId: string, headingLevel: number): string {
    const items = values.map((value) => this.renderNamedDataItem(value, ["alias", "description", "notes"]));
    return this.renderStructuredSection(rootId, "d-lois", headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderELoisSection(values: readonly EnemyELoisData[], rootId: string, headingLevel: number): string {
    const items = values.map((value) => this.renderNamedDataItem(value, ["count", "description", "notes"]));
    return this.renderStructuredSection(rootId, "e-lois", headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderNamedDataItem(
    value: EffectData | ItemData | LoisData | DLoisData | EnemyELoisData,
    keys: readonly string[],
  ): string {
    const fields: Array<[string, string, string]> = [];
    for (const key of keys) {
      const candidate = value[key as keyof typeof value];
      if (candidate === undefined) continue;
      fields.push([key, labelForDataKey(key), plainDataValue(candidate as string | number)]);
    }
    return element(
      "li",
      [["class", "data-list__item"], ["data-entry-id", value.id]],
      `${element("h5", [["class", "data-list__item-title"]], escapeHtml(value.name))}\n${this.renderDataFields(fields)}`,
    );
  }

  private renderCombosSection(enemy: EnemyData, rootId: string, headingLevel: number): string {
    const items = enemy.combos.map((combo) => element(
      "li",
      [["class", "data-list__item"], ["data-combo-id", combo.id]],
      this.renderComboData(combo, enemy, clampHeadingLevel(headingLevel + 1)),
    ));
    return this.renderStructuredSection(rootId, "combos", headingLevel, element("ol", [["class", "data-list"], ["data-region", "data-list"]], items.join("\n")));
  }

  private renderComboRoot(enemy: EnemyData, combo: ComboData, contextHeadingLevel: number): string {
    const rootId = this.ids.allocate(`combo-${slug(enemy.id)}-${slug(combo.id)}`);
    const titleId = this.ids.allocate(`${rootId}-title`);
    const rootLevel = clampHeadingLevel(contextHeadingLevel + 1);
    const header = element(
      "header",
      [["class", "structured-data__header"], ["data-region", "data-header"]],
      element(`h${rootLevel}`, [["id", titleId], ["class", "structured-data__title"]], escapeHtml(combo.name)),
    );
    const body = element("div", [["class", "structured-data__body"], ["data-region", "data-body"]], this.renderComboData(combo, enemy, clampHeadingLevel(rootLevel + 1)));
    return element(
      "section",
      [
        ["id", rootId],
        ["class", "structured-data structured-data--combo"],
        ["data-region", "structured-data"],
        ["data-data-kind", "combo"],
        ["data-enemy-id", enemy.id],
        ["data-combo-id", combo.id],
        ["data-data-schema", "dx3rd-scenario/enemy"],
        ["data-data-version", "1"],
        ["aria-labelledby", titleId],
      ],
      `${header}\n${body}`,
    );
  }

  private renderComboData(combo: ComboData, enemy: EnemyData, headingLevel: number): string {
    const fields: Array<[string, string, string]> = [];
    const fieldKeys = ["timing", "target", "range", "check", "attack_type", "attack_power", "uses", "description", "notes"] as const;
    for (const key of fieldKeys) {
      const value = combo[key];
      if (value === undefined) continue;
      fields.push([key, DATA_COMBO_FIELD_LABELS[key] ?? key, plainDataValue(value as string | number)]);
    }
    const effects = combo.effects.map((reference) => {
      const effect = enemy.effects.find((candidate) => candidate.id === reference.effect_id);
      if (!effect) this.fail("HTML_EFFECT_REFERENCE_MISSING", `Resolved combo effect ${reference.effect_id} is missing from the enemy data.`, undefined, "input");
      const level = reference.level ?? effect.level;
      const levelPart = level === undefined
        ? ""
        : ` <span data-field-key="level">${escapeHtml("レベル" + String(level))}</span>`;
      const effectAttributes: Array<readonly [string, string | undefined]> = [["data-effect-id", reference.effect_id]];
      return `<li${attributeText(effectAttributes)}>${escapeHtml(effect.name)}${levelPart}</li>`;
    });
    const items = combo.item_ids.map((itemId) => {
      const item = enemy.items.find((candidate) => candidate.id === itemId);
      if (!item) this.fail("HTML_ITEM_REFERENCE_MISSING", `Resolved combo item ${itemId} is missing from the enemy data.`, undefined, "input");
      const itemAttributes: Array<readonly [string, string | undefined]> = [["data-item-id", itemId]];
      return `<li${attributeText(itemAttributes)}>${escapeHtml(item.name)}</li>`;
    });
    const comboTitleId = this.ids.allocate(`combo-item-${slug(combo.id)}-title`);
    const comboData = element(
      "article",
      [["class", "combo-data"], ["data-combo-id", combo.id], ["aria-labelledby", comboTitleId]],
      `${element(`h${clampHeadingLevel(headingLevel)}`, [["id", comboTitleId], ["class", "combo-data__title"]], escapeHtml(combo.name))}\n${this.renderDataFields(fields)}\n${element("ol", [["class", "data-reference-list"], ["data-region", "effect-references"]], effects.join("\n"))}\n${element("ol", [["class", "data-reference-list"], ["data-region", "item-references"]], items.join("\n"))}`,
    );
    return comboData;
  }

  private renderDataFields(fields: readonly [string, string, string][]): string {
    const items = fields.map(([key, label, value]) => this.renderDataField(key, label, value));
    return element("dl", [["class", "data-fields"], ["data-region", "data-fields"]], items.join("\n"));
  }

  private renderDataField(key: string, label: string, value: string): string {
    return element(
      "div",
      [["class", "data-fields__item"], ["data-field-key", key]],
      `${element("dt", [], escapeHtml(label))}\n${element("dd", [], value)}`,
    );
  }

  private renderStringList(values: readonly string[]): string {
    return element("ul", [], values.map((value) => element("li", [], escapeHtml(value))).join("\n"));
  }

  private serializeParts(parts: readonly HtmlPart[]): string {
    return parts.map((part) => typeof part === "string" ? part : this.serializeSection(part)).join("\n");
  }

  private serializeSection(section: SectionModel): string {
    const attributes: Array<readonly [string, string | undefined]> = [
      ["id", section.id],
      ["class", "document-section"],
      ["data-section-id", section.id],
      ["data-section-level", String(section.level)],
      ["aria-labelledby", section.titleId],
    ];
    return element(
      "section",
      attributes,
      `${element(`h${section.level}`, [["id", section.titleId], ["class", "document-section__title"]], section.titleHtml)}${section.children.length > 0 ? `\n${this.serializeParts(section.children)}` : ""}`,
    );
  }
}

function failedResult(diagnostic: HtmlDiagnostic): HtmlRenderResult {
  return { ok: false, success: false, diagnostics: [diagnostic] };
}

function unexpectedDiagnostic(input: unknown, error: unknown): HtmlDiagnostic {
  const candidate = typeof input === "object" && input !== null ? input as { filePath?: unknown; chapterHeading?: { position?: SourcePosition } } : undefined;
  const position = candidate?.chapterHeading?.position ?? positionFallback();
  const file = typeof candidate?.filePath === "string" ? candidate.filePath : "<input>";
  return diagnosticFor(
    file,
    "HTML_RENDER_FAILED",
    error instanceof Error ? error.message : "HTML rendering failed.",
    position,
    "render",
  );
}

export function renderScenarioHtml(
  document: ScenarioDocument,
  options: HtmlRenderOptions = {},
): HtmlRenderResult {
  const rawDocument: unknown = document;
  if (!isScenarioDocument(rawDocument)) {
    const candidate = typeof rawDocument === "object" && rawDocument !== null
      ? rawDocument as { filePath?: unknown }
      : undefined;
    return failedResult(diagnosticFor(
      typeof candidate?.filePath === "string" ? candidate.filePath : "<input>",
      "HTML_INPUT_NOT_VERIFIED",
      "HTML rendering requires a successful, verified ScenarioDocument; ParseFailure and raw Markdown are not accepted.",
      positionFallback(),
      "input",
    ));
  }
  try {
    const html = new Renderer(document, options).render();
    const mode = options.mode ?? "fragment";
    const result: HtmlRenderSuccess = {
      ok: true,
      success: true,
      diagnostics: [],
      html,
      value: html,
      mode,
    };
    return result;
  } catch (error) {
    if (error instanceof RenderAbort) return failedResult(error.diagnostic);
    return failedResult(unexpectedDiagnostic(document, error));
  }
}

export function renderScenarioHtmlFragment(
  document: ScenarioDocument,
  options: Omit<HtmlRenderOptions, "mode"> = {},
): HtmlRenderResult {
  return renderScenarioHtml(document, { ...options, mode: "fragment" });
}

export function renderScenarioHtmlDocument(
  document: ScenarioDocument,
  options: Omit<HtmlRenderOptions, "mode"> = {},
): HtmlRenderResult {
  return renderScenarioHtml(document, { ...options, mode: "document" });
}

export function renderScenarioHtmlOrThrow(
  document: ScenarioDocument,
  options: HtmlRenderOptions = {},
): string {
  const result = renderScenarioHtml(document, options);
  if (!result.ok) throw new HtmlRenderError(result.diagnostics);
  return result.html;
}

export const generateScenarioHtml = renderScenarioHtml;
