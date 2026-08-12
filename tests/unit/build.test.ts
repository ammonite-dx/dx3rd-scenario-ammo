import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readBuildConfig } from "../../src/build/config.js";
import {
  buildStagedVivliostyleConfig,
  vivliostyleConfigStageBasePath,
} from "../../src/build/pdf.js";
import { preparePublication } from "../../src/build/publication.js";
import {
  buildVivliostyleArgs,
  buildWindowsCommandLine,
  locateVivliostyle,
} from "../../src/build/vivliostyle.js";

const rootDir = process.cwd();

describe("publication build preparation", () => {
  it("uses the explicit four-chapter order and resolves structured data", () => {
    const result = readBuildConfig(join(rootDir, "build.config.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.config.chapters).toEqual([
      "manuscripts/sample/01-opening.md",
      "manuscripts/sample/02-traces.md",
      "manuscripts/sample/03-resonance.md",
      "manuscripts/sample/04-climax.md",
    ]);

    const publication = preparePublication(rootDir, result.config, "a5", "tmp/unit-publication/sample.html");
    expect(publication.chapters).toHaveLength(4);
    expect(publication.html).toContain('data-paper="a5"');
    expect(publication.html).toContain('href="../../themes/scenario-a5/theme.css"');
    expect(publication.html).toContain('data-data-kind="enemy"');
    expect(publication.html).toContain('data-data-kind="combo"');

    const chapterPositions = ["SAMPLE-01", "SAMPLE-02", "SAMPLE-03", "SAMPLE-04"]
      .map((id) => publication.html.indexOf(`data-document-id="${id}"`));
    expect(chapterPositions.every((position) => position >= 0)).toBe(true);
    expect(chapterPositions).toEqual([...chapterPositions].sort((left, right) => left - right));
  });

  it("switches the publication theme and paper metadata to A4", () => {
    const result = readBuildConfig(join(rootDir, "build.config.json"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const publication = preparePublication(rootDir, result.config, "a4", "tmp/unit-publication/sample-a4.html");
    expect(publication.html).toContain('data-paper="a4"');
    expect(publication.html).toContain('href="../../themes/scenario-a5/theme-a4.css"');
  });
});

describe("Vivliostyle CLI argument construction", () => {
  it("passes only the explicit config and log level without duplicate build inputs", () => {
    expect(buildVivliostyleArgs({
      prefixArgs: [],
      configRelative: ".vivliostyle.config.js.123.js",
    })).toEqual([
      "build",
      "--config",
      ".vivliostyle.config.js.123.js",
      "--log-level",
      "info",
    ]);
  });

  it("adds only the executable browser option when configured", () => {
    expect(buildVivliostyleArgs({
      prefixArgs: [],
      configRelative: ".vivliostyle.config.js.123.js",
      browser: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    })).toEqual([
      "build",
      "--config",
      ".vivliostyle.config.js.123.js",
      "--log-level",
      "info",
      "--executable-browser",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ]);
  });

  it("quotes Windows .cmd arguments containing spaces", () => {
    expect(buildWindowsCommandLine("C:/tools/vivliostyle.cmd", [
      "--executable-browser",
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    ])).toBe(
      "C:/tools/vivliostyle.cmd --executable-browser \"C:/Program Files/Google/Chrome/Application/chrome.exe\"",
    );
  });

  it("resolves relative explicit executables from rootDir and preserves absolute paths", () => {
    const relative = locateVivliostyle(rootDir, "package.json");
    const absolutePath = resolve(rootDir, "package.json");
    const absolute = locateVivliostyle(rootDir, absolutePath);

    expect(relative.command).toBe(absolutePath);
    expect(absolute.command).toBe(absolutePath);
  });
});

describe("Vivliostyle staged config", () => {
  it("keeps the temporary config at root while retaining root-relative paths", () => {
    const htmlPath = join(rootDir, "generated", "html", ".publication.stage.html");
    const pdfPath = join(rootDir, "generated", "pdf", ".publication.stage.pdf");
    const themePath = join(rootDir, "themes", "scenario-a5", "theme.css");
    const workspaceDir = join(rootDir, "generated", ".vivliostyle");
    const stagedConfig = buildStagedVivliostyleConfig(
      rootDir,
      htmlPath,
      pdfPath,
      themePath,
      workspaceDir,
      "a5",
    );

    expect(vivliostyleConfigStageBasePath(rootDir)).toBe(join(rootDir, "vivliostyle.config.js"));
    expect(stagedConfig).toContain(
      '"entry": "generated/html/.publication.stage.html"',
    );
    expect(stagedConfig).toContain(
      '"theme": "themes/scenario-a5/theme.css"',
    );
    expect(stagedConfig).toContain(
      '"workspaceDir": "generated/.vivliostyle"',
    );
    expect(stagedConfig).toContain(
      '"path": "generated/pdf/.publication.stage.pdf"',
    );
  });
});
