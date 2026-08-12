import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { readBuildConfig, defaultConfigPath } from "../build/config.js";
import { BuildFailure, buildDiagnostic, formatDiagnostics } from "../build/diagnostics.js";
import { repositoryRoot, repoRelativePath, resolveExistingRepoPath, resolveOutputRepoPath } from "../build/filesystem.js";
import { buildPdf } from "../build/pdf.js";
import { preparePublication, writePreparedHtml } from "../build/publication.js";
import type { PaperSize } from "../build/types.js";

export interface CliIO {
  stdout: (value: string) => void;
  stderr: (value: string) => void;
}

interface ParsedCli {
  command: "html" | "pdf";
  configPath: string;
  paper: PaperSize;
  outputPath?: string;
  vivliostylePath?: string;
}

const HELP = `Usage: npm run build:html -- [options]
       npm run build:pdf -- [options]

Commands:
  build html       Validate chapters and write one semantic HTML publication
  build pdf        Build the semantic HTML, then invoke the official Vivliostyle CLI

Options:
  -c, --config <path>          Ordered build configuration (default: build.config.json)
      --paper <a5|a4>          Paper/theme selection (default: a5)
  -o, --output <path>          Override the selected output path
      --vivliostyle <path>     Explicit Vivliostyle executable or .cmd path
  -h, --help                   Show this help

The configuration's chapters array is the only chapter ordering source; no glob is used.
Outputs are staged and published atomically under generated/ by default.
`;

function defaultIO(): CliIO {
  return {
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  };
}

function parsePaper(value: string): PaperSize {
  if (value === "a5" || value === "a4") return value;
  throw new BuildFailure([buildDiagnostic("<cli>", "CLI_INVALID_PAPER", `Unknown paper size: ${value}. Use a5 or a4.`, "cli")]);
}

function requireValue(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new BuildFailure([buildDiagnostic("<cli>", "CLI_OPTION_VALUE_REQUIRED", `${option} requires a value.`, "cli")]);
  }
  return value;
}

function parseArgs(args: readonly string[], rootDir: string, io: CliIO): ParsedCli | "help" {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) return "help";
  if (args[0] !== "build" || (args[1] !== "html" && args[1] !== "pdf")) {
    throw new BuildFailure([buildDiagnostic("<cli>", "CLI_COMMAND_INVALID", "Use build html or build pdf.", "cli")]);
  }

  let configPath = defaultConfigPath();
  let paper: PaperSize = "a5";
  let outputPath: string | undefined;
  let vivliostylePath: string | undefined;
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (argument === "--config" || argument === "-c") {
      configPath = requireValue(args, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--paper") {
      paper = parsePaper(requireValue(args, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--output" || argument === "-o") {
      outputPath = requireValue(args, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--vivliostyle") {
      vivliostylePath = requireValue(args, index, argument);
      index += 1;
      continue;
    }
    throw new BuildFailure([buildDiagnostic("<cli>", "CLI_UNKNOWN_OPTION", `Unknown option: ${argument}.`, "cli")]);
  }
  return {
    command: args[1] as "html" | "pdf",
    configPath,
    paper,
    ...(outputPath ? { outputPath } : {}),
    ...(vivliostylePath ? { vivliostylePath } : {}),
  };
}

function writeFailure(io: CliIO, error: unknown): number {
  const diagnostics = error instanceof BuildFailure
    ? error.diagnostics
    : [buildDiagnostic("<cli>", "CLI_UNEXPECTED_ERROR", error instanceof Error ? error.message : "Unexpected CLI failure.", "cli")];
  const text = formatDiagnostics(diagnostics);
  if (text.length > 0) io.stderr(`${text}\n`);
  return 1;
}

export function runCli(args: readonly string[], context: { cwd?: string; io?: CliIO } = {}): number {
  const io = context.io ?? defaultIO();
  const rootDir = repositoryRoot(context.cwd ?? process.cwd());
  try {
    const parsed = parseArgs(args, rootDir, io);
    if (parsed === "help") {
      io.stdout(HELP);
      return 0;
    }

    const configFile = resolveExistingRepoPath(rootDir, parsed.configPath, "Build configuration");
    const configResult = readBuildConfig(configFile);
    if (!configResult.ok) {
      io.stderr(`${formatDiagnostics(configResult.diagnostics)}\n`);
      return 1;
    }
    const config = configResult.config;
    if (parsed.command === "html") {
      const publication = preparePublication(rootDir, config, parsed.paper, parsed.outputPath);
      const result = writePreparedHtml(publication);
      io.stdout(`HTML written: ${repoRelativePath(rootDir, result.outputPath)} (${String(publication.chapters.length)} chapters, ${parsed.paper.toUpperCase()})\n`);
      return 0;
    }

    const htmlPath = resolveOutputRepoPath(rootDir, config.output.html, "HTML output");
    const publication = preparePublication(rootDir, config, parsed.paper, repoRelativePath(rootDir, htmlPath));
    const pdfPath = resolveOutputRepoPath(rootDir, parsed.outputPath ?? config.output.pdf[parsed.paper], "PDF output");
    const vivliostyleConfigPath = resolveExistingRepoPath(rootDir, config.vivliostyleConfig, "Vivliostyle config");
    const workspacePath = resolveOutputRepoPath(rootDir, config.workspaceDir, "Vivliostyle workspace");
    const result = buildPdf({
      rootDir,
      vivliostyleConfigPath: repoRelativePath(rootDir, vivliostyleConfigPath),
      workspaceDir: workspacePath,
      publication,
      pdfPath,
      paper: parsed.paper,
      ...(parsed.vivliostylePath ? { vivliostylePath: parsed.vivliostylePath } : {}),
    });
    io.stdout(`PDF written: ${repoRelativePath(rootDir, result)} (${String(publication.chapters.length)} chapters, ${parsed.paper.toUpperCase()})\n`);
    return 0;
  } catch (error) {
    return writeFailure(io, error);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = runCli(process.argv.slice(2));
}
