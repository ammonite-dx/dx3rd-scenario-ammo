import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

import { BuildFailure, buildDiagnostic } from "./diagnostics.js";
import { normalizeSlashes, repoRelativePath, resolveExistingRepoPath } from "./filesystem.js";
import type { PaperSize } from "./types.js";

export interface VivliostyleExecutable {
  command: string;
  prefixArgs: string[];
  label: string;
}

export interface VivliostyleBuildOptions {
  rootDir: string;
  executable: VivliostyleExecutable;
  inputHtml: string;
  outputPdf: string;
  themePath: string;
  configPath: string;
  paper: PaperSize;
}

export interface VivliostyleArgOptions {
  prefixArgs: readonly string[];
  configRelative: string;
  themeRelative: string;
  inputRelative: string;
  outputRelative: string;
  paper: PaperSize;
  browser?: string;
}

export function buildVivliostyleArgs(options: VivliostyleArgOptions): string[] {
  const args = [...options.prefixArgs, "build"];
  if (options.configRelative !== "vivliostyle.config.js") {
    args.push("--config", options.configRelative);
  }
  args.push(
    "--log-level",
    "info",
    "--output",
    options.outputRelative,
    "--format",
    "pdf",
    "--size",
    options.paper.toUpperCase(),
    "--single-doc",
    "--theme",
    options.themeRelative,
  );
  if (options.browser) args.push("--executable-browser", options.browser);
  args.push(options.inputRelative);
  return args;
}

function executableCandidates(rootDir: string): VivliostyleExecutable[] {
  const candidates: VivliostyleExecutable[] = [];
  const configured = process.env.VIVLIOSTYLE_BIN;
  if (configured) candidates.push({ command: configured, prefixArgs: [], label: configured });

  const binName = process.platform === "win32" ? "vivliostyle.cmd" : "vivliostyle";
  candidates.push({ command: join(rootDir, "node_modules", ".bin", binName), prefixArgs: [], label: "root node_modules/.bin/vivliostyle" });
  candidates.push({ command: "vivliostyle", prefixArgs: [], label: "vivliostyle on PATH" });
  return candidates;
}

function isRunnableCandidate(candidate: VivliostyleExecutable): boolean {
  return candidate.command === "vivliostyle" || existsSync(candidate.command);
}

export function locateVivliostyle(rootDir: string, explicitPath?: string): VivliostyleExecutable {
  if (explicitPath) {
    const candidate: VivliostyleExecutable = { command: explicitPath, prefixArgs: [], label: explicitPath };
    if (!isRunnableCandidate(candidate)) {
      throw new BuildFailure([buildDiagnostic(explicitPath, "VIVLIOSTYLE_NOT_FOUND", "The configured Vivliostyle executable does not exist.", "pdf")]);
    }
    return candidate;
  }
  const candidate = executableCandidates(rootDir).find(isRunnableCandidate);
  if (!candidate) {
    throw new BuildFailure([buildDiagnostic(
      "<vivliostyle>",
      "VIVLIOSTYLE_NOT_FOUND",
      "Vivliostyle CLI was not found. Install the official @vivliostyle/cli package or set VIVLIOSTYLE_BIN.",
      "pdf",
    )]);
  }
  return candidate;
}

function chromeExecutable(): string | undefined {
  const configured = process.env.VIVLIOSTYLE_BROWSER ?? process.env.CHROME_PATH;
  if (configured && existsSync(configured)) return configured;
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
      ]
    : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return candidates.find((candidate) => candidate.length > 0 && existsSync(candidate));
}

function isCmd(command: string): boolean {
  return process.platform === "win32" && /\.(?:cmd|bat)$/iu.test(command);
}

export function runVivliostyle(options: VivliostyleBuildOptions): void {
  const configPath = resolveExistingRepoPath(options.rootDir, options.configPath, "Vivliostyle config");
  const configRelative = repoRelativePath(options.rootDir, configPath);
  const themeRelative = repoRelativePath(options.rootDir, options.themePath);
  const inputRelative = repoRelativePath(options.rootDir, options.inputHtml);
  const outputRelative = repoRelativePath(options.rootDir, options.outputPdf);
  const browser = chromeExecutable();
  const args = buildVivliostyleArgs({
    prefixArgs: options.executable.prefixArgs,
    configRelative,
    themeRelative,
    inputRelative,
    outputRelative,
    paper: options.paper,
    ...(browser ? { browser } : {}),
  });

  const result = spawnSync(options.executable.command, args, {
    cwd: options.rootDir,
    encoding: "utf8",
    shell: isCmd(options.executable.command),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    throw new BuildFailure([buildDiagnostic(
      "<vivliostyle>",
      "VIVLIOSTYLE_EXEC_FAILED",
      `${options.executable.label}: ${result.error.message}`,
      "pdf",
    )]);
  }
  if (result.status !== 0) {
    throw new BuildFailure([buildDiagnostic(
      configRelative,
      "VIVLIOSTYLE_FAILED",
      `${options.executable.label} exited with status ${String(result.status)}.`,
      "pdf",
    )]);
  }
}
