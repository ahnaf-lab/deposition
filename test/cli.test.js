import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, "..", "bin", "deposition.js");
const transcriptPath = join(
  __dirname,
  "fixtures",
  "sample.transcript.jsonl",
);
const diffPath = join(__dirname, "fixtures", "sample.diff");

test("CLI prints usage and exits non-zero when args are missing", async () => {
  await assert.rejects(execFileAsync("node", [binPath]));
});

test("CLI renders a deposition Q&A transcript by default", async () => {
  const { stdout } = await execFileAsync("node", [
    binPath,
    transcriptPath,
    diffPath,
  ]);

  assert.match(stdout, /DEPOSITION OF THE AGENT/);
  assert.match(stdout, /Q1\. Counsel:/);
  assert.match(stdout, /EXHIBIT A/);
});

test("CLI --json outputs claims and diff as JSON for valid input", async () => {
  const { stdout } = await execFileAsync("node", [
    binPath,
    transcriptPath,
    diffPath,
    "--json",
  ]);
  const parsed = JSON.parse(stdout);

  assert.ok(Array.isArray(parsed.claims));
  assert.ok(parsed.claims.length > 0);
  assert.ok(Array.isArray(parsed.diff.files));
  assert.equal(parsed.diff.files.length, 3);
  assert.equal(parsed.verdict.claimsExamined, parsed.claims.length);
});

test("CLI renders a VERDICT SUMMARY at the end of the deposition transcript", async () => {
  const { stdout } = await execFileAsync("node", [
    binPath,
    transcriptPath,
    diffPath,
  ]);

  assert.match(stdout, /VERDICT SUMMARY/);
  assert.match(stdout, /Claims examined: \d+/);
});
