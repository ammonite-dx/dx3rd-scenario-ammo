import { spawnSync } from "node:child_process";

const configured = process.env.PDF_PYTHON;
const candidates = configured
  ? [{ command: configured, prefix: [] }]
  : [
      { command: "python", prefix: [] },
      { command: "python3", prefix: [] },
      { command: "py", prefix: ["-3"] },
    ];

const failures = [];
for (const candidate of candidates) {
  const probe = spawnSync(candidate.command, [...candidate.prefix, "-c", "import sys; print(sys.executable)"], {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (probe.error || probe.status !== 0) {
    const detail = probe.error?.message ?? (probe.stderr.trim() || `exit ${String(probe.status)}`);
    failures.push(`${candidate.command}: ${detail}`);
    continue;
  }

  const result = spawnSync(candidate.command, [
    ...candidate.prefix,
    "-m",
    "unittest",
    "discover",
    "-s",
    "tests/python",
    "-p",
    "test_*.py",
  ], {
    cwd: process.cwd(),
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) {
    console.error(`Python tests could not start: ${result.error.message}`);
    process.exitCode = 1;
  } else {
    process.exitCode = result.status ?? 1;
  }
  break;
}

if (process.exitCode === undefined) {
  console.error("Python 3 was not found. Install Python and requirements-pdf.txt, or set PDF_PYTHON.");
  if (failures.length > 0) console.error(failures.join("\n"));
  process.exitCode = 1;
}
