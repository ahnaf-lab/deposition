import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseDiff } from "../src/diffParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleDiff = readFileSync(
  join(__dirname, "fixtures", "sample.diff"),
  "utf8",
);

test("parseDiff returns an empty file list for empty input", () => {
  const result = parseDiff("");
  assert.deepEqual(result.files, []);
});

test("parseDiff finds all three files in the sample diff", () => {
  const { files } = parseDiff(sampleDiff);
  assert.equal(files.length, 3);
  assert.deepEqual(
    files.map((f) => f.newPath ?? f.oldPath),
    ["src/app.js", "src/utils.js", "src/old.js"],
  );
});

test("parseDiff marks added and deleted files correctly", () => {
  const { files } = parseDiff(sampleDiff);
  const [modified, added, deleted] = files;

  assert.equal(modified.status, "modified");
  assert.equal(added.status, "added");
  assert.equal(added.oldPath, null);
  assert.equal(deleted.status, "deleted");
  assert.equal(deleted.newPath, null);
});

test("parseDiff extracts hunk line changes with correct types", () => {
  const { files } = parseDiff(sampleDiff);
  const modified = files[0];

  assert.equal(modified.hunks.length, 1);
  const hunk = modified.hunks[0];
  assert.equal(hunk.oldStart, 1);
  assert.equal(hunk.newStart, 1);

  const removed = hunk.lines.filter((l) => l.type === "del");
  const added = hunk.lines.filter((l) => l.type === "add");
  assert.equal(removed.length, 1);
  assert.equal(added.length, 1);
  assert.match(removed[0].content, /if \(x\) \{/);
  assert.match(added[0].content, /if \(x != null\) \{/);
});

test("parseDiff computes addedLines and removedLines per file", () => {
  const { files } = parseDiff(sampleDiff);
  const [modified, added, deleted] = files;

  assert.equal(modified.addedLines, 1);
  assert.equal(modified.removedLines, 1);
  assert.equal(added.addedLines, 3);
  assert.equal(added.removedLines, 0);
  assert.equal(deleted.addedLines, 0);
  assert.equal(deleted.removedLines, 2);
});
