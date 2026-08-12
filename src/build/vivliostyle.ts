import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, resolve } from "node:path";

import { BuildFailure, buildDiagnostic } from "./diagnostics.js";
import { normalizeSlashes, repoRelativePath, resolveExistingRepoPath } from "./filesystem.js";

export interface VivliostyleExecutable {
  command: string;
  prefixArgs: string[];
  label: string;
}

export interface VivliostyleBuildOptions {
  rootDir: string;
  executable: VivliostyleExecutable;
  configPath: string;
}

export interface VivliostyleArgOptions {
  prefixArgs: readonly string[];
  configRelative: string;
  browser?: string;
}

export function buildVivliostyleArgs(options: VivliostyleArgOptions): string[] {
  const args = [...options.prefixArgs, "build"];
  args.push(
    "--config",
    options.configRelative,
    "--log-level",
    "info",
  );
  if (options.browser) args.push("--executable-browser", options.browser);
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
    const command = isAbsolute(explicitPath) ? explicitPath : resolve(rootDir, explicitPath);
    const candidate: VivliostyleExecutable = { command, prefixArgs: [], label: explicitPath };
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

function quoteWindowsCmdArg(value: string): string {
  if (!/[\s"&|<>()^]/u.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function buildWindowsCommandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map(quoteWindowsCmdArg).join(" ");
}

export function buildWindowsShellCommand(command: string, args: readonly string[]): string {
  return `call ${buildWindowsCommandLine(command, args)}`;
}

export function runVivliostyle(options: VivliostyleBuildOptions): void {
  const configPath = resolveExistingRepoPath(options.rootDir, options.configPath, "Vivliostyle config");
  const configRelative = repoRelativePath(options.rootDir, configPath);
  const browser = chromeExecutable();
  const args = buildVivliostyleArgs({
    prefixArgs: options.executable.prefixArgs,
    configRelative,
    ...(browser ? { browser } : {}),
  });

  const useCmdShell = isCmd(options.executable.command);
  const command = useCmdShell ? process.env.ComSpec ?? "cmd.exe" : options.executable.command;
  const commandArgs = useCmdShell
    ? ["/d", "/s", "/c", buildWindowsShellCommand(options.executable.command, args)]
    : args;
  const result = spawnSync(command, commandArgs, {
    cwd: options.rootDir,
    encoding: "utf8",
    shell: false,
    windowsVerbatimArguments: useCmdShell,
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
