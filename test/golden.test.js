// Golden tests: each fixture pair's transcript + diff must render to the
// exact deposition markdown checked in alongside it. Unlike the other unit
// tests, which assert on individual pieces, these catch any change to the
// combined rendering of claims, exhibits, objection placement, or the
// verdict summary.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseDiff,
  parseTranscript,
  extractClaims,
  generateObjections,
  renderDeposition,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const goldenDir = join(__dirname, "fixtures", "golden");

function renderFixture(name) {
  const transcriptText = readFileSync(
    join(goldenDir, `${name}.transcript.jsonl`),
    "utf8",
  );
  const diffText = readFileSync(join(goldenDir, `${name}.diff`), "utf8");

  const events = parseTranscript(transcriptText);
  const claims = extractClaims(events);
  const diff = parseDiff(diffText);
  const objections = generateObjections({ events, claims, diff });

  return renderDeposition({ claims, diff, objections });
}

function readGolden(name) {
  return readFileSync(join(goldenDir, `${name}.deposition.txt`), "utf8");
}

const FIXTURES = ["clean", "untouched", "tests-pass"];

for (const name of FIXTURES) {
  test(`golden: ${name} fixture renders exactly as expected`, () => {
    assert.equal(renderFixture(name), readGolden(name));
  });
}

test("golden: clean fixture has no objections of any kind", () => {
  const output = readGolden("clean");
  assert.doesNotMatch(output, /OBJECTION/);
  assert.doesNotMatch(output, /GENERAL OBJECTIONS/);
});

test("golden: untouched fixture sustains a claimed-untouched-file objection per bad claim", () => {
  const output = readGolden("untouched");
  const matches = output.match(/OBJECTION \(claimed-untouched-file\)/g) ?? [];
  assert.equal(matches.length, 2);
  assert.match(output, /Total objections sustained: 2/);
});

test("golden: tests-pass fixture raises exactly one general objection", () => {
  const output = readGolden("tests-pass");
  assert.match(output, /GENERAL OBJECTIONS/);
  assert.match(output, /OBJECTION \(unsupported-tests-pass-claim\)/);
  assert.match(
    output,
    /Additional objections sustained \(not tied to a specific claim\): 1/,
  );
});
