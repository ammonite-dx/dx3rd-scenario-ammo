import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { extname, isAbsolute, join, resolve } from "node:path";

import type { Browser } from "puppeteer-core";

import { BuildFailure, buildDiagnostic } from "./diagnostics.js";
import { isWithin, repoRelativePath, resolveExistingRepoPath, resolveOutputRepoPath } from "./filesystem.js";
import type { PaperSize } from "./types.js";

const nodeRequire = createRequire(import.meta.url);

export interface VivliostyleExecutable {
  command: string;
  prefixArgs: string[];
  label: string;
}

export interface VivliostyleBuildOptions {
  rootDir: string;
  executable?: VivliostyleExecutable;
  configPath?: string;
  htmlPath: string;
  pdfPath: string;
  paper: PaperSize;
}

export interface VivliostyleArgOptions {
  prefixArgs: readonly string[];
  configRelative: string;
  browser?: string;
}

const PAPER_DIMENSIONS: Record<PaperSize, { width: string; height: string }> = {
  a5: { width: "148mm", height: "210mm" },
  a4: { width: "210mm", height: "297mm" },
};

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

function isRunnableCandidate(candidate: VivliostyleExecutable): boolean {
  return existsSync(candidate.command);
}

/**
 * Resolve only an explicitly requested external executable.
 *
 * The normal path uses the pinned Core + Puppeteer adapter below. Keeping this
 * narrow compatibility hook avoids silently consulting PATH or another local
 * project when an older caller intentionally supplies an executable.
 */
export function locateVivliostyle(rootDir: string, explicitPath?: string): VivliostyleExecutable {
  const configured = explicitPath ?? process.env.VIVLIOSTYLE_BIN;
  if (!configured) {
    throw new BuildFailure([buildDiagnostic(
      "<vivliostyle>",
      "VIVLIOSTYLE_NOT_CONFIGURED",
      "No external Vivliostyle executable is configured; the default build uses the pinned @vivliostyle/core adapter.",
      "pdf",
    )]);
  }

  const command = isAbsolute(configured) ? configured : resolve(rootDir, configured);
  const candidate: VivliostyleExecutable = { command, prefixArgs: [], label: configured };
  if (!isRunnableCandidate(candidate)) {
    throw new BuildFailure([buildDiagnostic(configured, "VIVLIOSTYLE_NOT_FOUND", "The configured Vivliostyle executable does not exist.", "pdf")]);
  }
  return candidate;
}

function chromeExecutable(): string | undefined {
  const configured = process.env.VIVLIOSTYLE_BROWSER ?? process.env.CHROME_PATH;
  if (configured) return existsSync(configured) ? configured : undefined;

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

/**
 * Keep Chrome's sandbox enabled by default. The opt-in is deliberately an
 * exact value check so unrelated environment values cannot weaken isolation.
 */
export function buildPuppeteerLaunchArgs(noSandboxValue: string | undefined): string[] {
  return noSandboxValue === "1" ? ["--no-sandbox"] : [];
}

function runExternalVivliostyle(options: VivliostyleBuildOptions, configRelative: string): void {
  const executable = options.executable;
  if (!executable) throw new Error("External Vivliostyle executable is not configured.");

  const browser = chromeExecutable();
  const args = buildVivliostyleArgs({
    prefixArgs: executable.prefixArgs,
    configRelative,
    ...(browser ? { browser } : {}),
  });

  const useCmdShell = isCmd(executable.command);
  const command = useCmdShell ? process.env.ComSpec ?? "cmd.exe" : executable.command;
  const commandArgs = useCmdShell
    ? ["/d", "/s", "/c", buildWindowsShellCommand(executable.command, args)]
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
      `${executable.label}: ${result.error.message}`,
      "pdf",
    )]);
  }
  if (result.status !== 0) {
    throw new BuildFailure([buildDiagnostic(
      configRelative,
      "VIVLIOSTYLE_FAILED",
      `${executable.label} exited with status ${String(result.status)}.`,
      "pdf",
    )]);
  }
}

function contentType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".css": return "text/css; charset=utf-8";
    case ".html": return "text/html; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".webp": return "image/webp";
    case ".woff": return "font/woff";
    case ".woff2": return "font/woff2";
    default: return "application/octet-stream";
  }
}

function sendResponse(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  response.writeHead(status, {
    "content-type": type,
    "content-length": buffer.byteLength,
    "cache-control": "no-store",
  });
  response.end(buffer);
}

function sendNotFound(response: ServerResponse): void {
  sendResponse(response, 404, "text/plain; charset=utf-8", "Not found");
}

async function handleRepositoryRequest(
  rootDir: string,
  runnerHtml: string,
  requestDiagnostics: string[],
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendResponse(response, 405, "text/plain; charset=utf-8", "Method not allowed");
    return;
  }

  let pathname: string;
  try {
    pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  } catch {
    sendResponse(response, 400, "text/plain; charset=utf-8", "Invalid URL");
    return;
  }
  requestDiagnostics.push(`${request.method ?? "?"} ${pathname}`);

  if (pathname === "/__dx3rd_vivliostyle_runner__.html") {
    const body = runnerHtml;
    if (request.method === "HEAD") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
      response.end();
    } else {
      sendResponse(response, 200, "text/html; charset=utf-8", body);
    }
    return;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    sendResponse(response, 400, "text/plain; charset=utf-8", "Invalid path");
    return;
  }
  // URL paths always start with `/`; strip only that URL separator before
  // applying the repository boundary check. On Windows, path.isAbsolute("/x")
  // is true, so checking the raw pathname would reject every valid asset.
  const relativeUrlPath = decodedPath.replace(/^[/\\]+/u, "");
  const lexicalPath = resolve(rootDir, relativeUrlPath);
  if (!isWithin(rootDir, lexicalPath) || !existsSync(lexicalPath)) {
    sendNotFound(response);
    return;
  }
  const actualPath = realpathSync(lexicalPath);
  if (!isWithin(rootDir, actualPath) || !statSync(actualPath).isFile()) {
    sendNotFound(response);
    return;
  }

  const body = readFileSync(actualPath);
  response.writeHead(200, {
    "content-type": contentType(actualPath),
    "content-length": body.byteLength,
    "cache-control": "no-store",
  });
  if (request.method === "HEAD") response.end();
  else response.end(body);
}

interface LocalRepositoryServer {
  server: Server;
  baseUrl: string;
}

async function startRepositoryServer(rootDir: string, paper: PaperSize, requestDiagnostics: string[]): Promise<LocalRepositoryServer> {
  const dimensions = PAPER_DIMENSIONS[paper];
  const runnerHtml = [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\"><title>Vivliostyle runner</title>",
    "<style>",
    "html,body{margin:0;padding:0;background:#fff}",
    `#vivliostyle-viewport{width:${dimensions.width};min-height:${dimensions.height};margin:0 auto}`,
    "</style></head><body><div id=\"vivliostyle-viewport\"></div></body></html>",
  ].join("");
  const server = createServer((request, response) => {
    void handleRepositoryRequest(rootDir, runnerHtml, requestDiagnostics, request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      sendResponse(response, 500, "text/plain; charset=utf-8", error instanceof Error ? error.message : "Request failed");
    });
  });

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", () => resolveListen());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("The local Vivliostyle server did not expose a port.");
    return {
      server,
      baseUrl: `http://127.0.0.1:${String(address.port)}`,
    };
  } catch (error) {
    server.close();
    throw error;
  }
}

async function closeRepositoryServer(server: LocalRepositoryServer): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.server.close((error) => error ? rejectClose(error) : resolveClose());
  });
}

function coreBundlePath(): string {
  return nodeRequire.resolve("@vivliostyle/core");
}

async function runVivliostyleCore(options: VivliostyleBuildOptions): Promise<void> {
  const htmlPath = resolveExistingRepoPath(options.rootDir, options.htmlPath, "staged publication HTML");
  const pdfPath = resolveOutputRepoPath(options.rootDir, options.pdfPath, "staged PDF");
  const browserPath = chromeExecutable();
  if (!browserPath) {
    const configured = process.env.VIVLIOSTYLE_BROWSER ?? process.env.CHROME_PATH;
    throw new BuildFailure([buildDiagnostic(
      configured ?? "<chrome>",
      "VIVLIOSTYLE_BROWSER_NOT_FOUND",
      configured
        ? `The configured browser does not exist: ${configured}. Set VIVLIOSTYLE_BROWSER or CHROME_PATH to a Chrome/Chromium executable.`
        : "Chrome/Chromium was not found in the standard location. Set VIVLIOSTYLE_BROWSER or CHROME_PATH.",
      "pdf",
    )]);
  }

  const bundle = readFileSync(coreBundlePath(), "utf8");
  const browserDiagnostics: string[] = [];
  const server = await startRepositoryServer(options.rootDir, options.paper, browserDiagnostics);
  let browser: Browser | undefined;
  try {
    const { default: puppeteer } = await import("puppeteer-core");
    browserDiagnostics.push("phase: launch");
    browser = await puppeteer.launch({
      executablePath: browserPath,
      headless: true,
      args: buildPuppeteerLaunchArgs(process.env.VIVLIOSTYLE_NO_SANDBOX),
    });
    browserDiagnostics.push("phase: launched");
    const page = await browser.newPage();
    browserDiagnostics.push("phase: newPage");
    page.on("pageerror", (error) => browserDiagnostics.push(`pageerror: ${error instanceof Error ? error.message : String(error)}`));
    page.on("requestfailed", (request) => browserDiagnostics.push(`requestfailed ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`));
    page.on("console", (message) => {
      if (message.type() === "error") browserDiagnostics.push(`console: ${message.text()}`);
    });
    page.setDefaultTimeout(120_000);
    browserDiagnostics.push("phase: goto-runner");
    const runnerResponse = await page.goto(`${server.baseUrl}/__dx3rd_vivliostyle_runner__.html`, { waitUntil: "load" });
    browserDiagnostics.push("phase: runner-loaded");
    if (!runnerResponse || !runnerResponse.ok()) throw new Error("The local Vivliostyle runner page could not be loaded.");

    browserDiagnostics.push("phase: inject-core");
    await page.addScriptTag({
      content: `var module = { exports: {} }; var exports = module.exports;\n${bundle}\nwindow.__dx3rdVivliostyle = module.exports;`,
    });
    browserDiagnostics.push("phase: core-injected");

    const htmlUrl = `${server.baseUrl}/${repoRelativePath(options.rootDir, htmlPath)}`;
    browserDiagnostics.push("phase: core-viewer");
    const completion = await page.evaluate(`(async () => {
      const core = window.__dx3rdVivliostyle;
      if (!core || !core.CoreViewer) throw new Error("@vivliostyle/core CoreViewer was not exposed by the pinned bundle.");
      const viewport = document.getElementById("vivliostyle-viewport");
      if (!viewport) throw new Error("Vivliostyle viewport is missing.");
      const result = await new Promise((resolve, reject) => {
        const viewer = new core.CoreViewer(
          { viewportElement: viewport, window, debug: false },
          { renderAllPages: true, pageViewMode: "singlePage", pixelRatio: 1, zoom: 1 },
        );
        viewer.addListener("readystatechange", () => {
          if (viewer.readyState === "complete") resolve({ pages: viewer.getPageSizes().length });
        });
        viewer.addListener("error", (payload) => reject(new Error(JSON.stringify(payload))));
        viewer.loadDocument(${JSON.stringify(htmlUrl)});
      });
      if (!result || result.pages < 1) throw new Error("Vivliostyle completed without any pages.");
      return result;
    })()`);
    browserDiagnostics.push("phase: core-complete");
    const pageCount = (completion as { pages?: unknown }).pages;
    if (typeof pageCount !== "number" || pageCount < 1) throw new Error("Vivliostyle completed without any pages.");

    const dimensions = PAPER_DIMENSIONS[options.paper];
    browserDiagnostics.push("phase: pdf");
    await page.pdf({
      path: pdfPath,
      width: dimensions.width,
      height: dimensions.height,
      printBackground: true,
      preferCSSPageSize: false,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });
    browserDiagnostics.push("phase: pdf-complete");
  } catch (error) {
    if (error instanceof BuildFailure) throw error;
    throw new BuildFailure([buildDiagnostic(
      options.htmlPath,
      "VIVLIOSTYLE_CORE_FAILED",
      [
        error instanceof Error ? error.message : "The Vivliostyle Core browser build failed.",
        ...browserDiagnostics,
      ].join(" "),
      "pdf",
    )]);
  } finally {
    if (browser) await browser.close();
    await closeRepositoryServer(server);
  }
}

export async function runVivliostyle(options: VivliostyleBuildOptions): Promise<void> {
  if (options.executable) {
    if (!options.configPath) {
      throw new BuildFailure([buildDiagnostic(
        "<vivliostyle>",
        "VIVLIOSTYLE_CONFIG_REQUIRED",
        "An explicit external Vivliostyle executable requires a repository-relative config path.",
        "pdf",
      )]);
    }
    const configPath = resolveExistingRepoPath(options.rootDir, options.configPath, "Vivliostyle config");
    const configRelative = repoRelativePath(options.rootDir, configPath);
    runExternalVivliostyle(options, configRelative);
    return;
  }
  await runVivliostyleCore(options);
}
