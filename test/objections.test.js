import test from "node:test";
import assert from "node:assert/strict";
import { parseTranscript, extractClaims } from "../src/transcriptParser.js";
import { parseDiff } from "../src/diffParser.js";
import {
  findUntouchedFileClaims,
  findUnsupportedTestsPassClaims,
  generateObjections,
} from "../src/objections.js";

const sampleDiff = [
  "diff --git a/src/app.js b/src/app.js",
  "index e69de29..b6fc4c6 100644",
  "--- a/src/app.js",
  "+++ b/src/app.js",
  "@@ -1,2 +1,2 @@",
  "-old",
  "+new",
  "",
].join("\n");

test("findUntouchedFileClaims flags a tool_call claim for a file absent from the diff", () => {
  const events = parseTranscript(
    [
      JSON.stringify({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Edit",
            input: { file_path: "src/missing.js", old_string: "a", new_string: "b" },
          },
        ],
      }),
    ].join("\n"),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);

  const objections = findUntouchedFileClaims(claims, diff);
  assert.equal(objections.length, 1);
  assert.equal(objections[0].rule, "claimed-untouched-file");
  assert.equal(objections[0].file, "src/missing.js");
  assert.equal(objections[0].verbOrAction, "edit");
});

test("findUntouchedFileClaims does not flag a file that the diff actually changed", () => {
  const events = parseTranscript(
    [
      JSON.stringify({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Edit",
            input: { file_path: "src/app.js", old_string: "a", new_string: "b" },
          },
        ],
      }),
    ].join("\n"),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);

  assert.deepEqual(findUntouchedFileClaims(claims, diff), []);
});

test("findUntouchedFileClaims does not flag read-only tool calls or verbless mentions", () => {
  const events = parseTranscript(
    [
      JSON.stringify({
        role: "assistant",
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "src/missing.js" } },
          { type: "text", text: "See src/also-missing.js for details." },
        ],
      }),
    ].join("\n"),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);

  assert.deepEqual(findUntouchedFileClaims(claims, diff), []);
});

test("findUntouchedFileClaims flags a narration claim with a mutating verb for an untouched file", () => {
  const events = parseTranscript(
    JSON.stringify({
      role: "assistant",
      content: [{ type: "text", text: "I also updated README.md for clarity." }],
    }),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);

  const objections = findUntouchedFileClaims(claims, diff);
  assert.equal(objections.length, 1);
  assert.equal(objections[0].claimType, "narration");
  assert.equal(objections[0].verbOrAction, "updated");
  assert.equal(objections[0].file, "README.md");
});

test("findUnsupportedTestsPassClaims flags a tests-pass claim with no test command in the transcript", () => {
  const events = parseTranscript(
    JSON.stringify({
      role: "assistant",
      content: [{ type: "text", text: "All tests pass now." }],
    }),
  );

  const objections = findUnsupportedTestsPassClaims(events);
  assert.equal(objections.length, 1);
  assert.equal(objections[0].rule, "unsupported-tests-pass-claim");
  assert.equal(objections[0].eventIndex, 0);
});

test("findUnsupportedTestsPassClaims does not flag the claim when a test command was run", () => {
  const events = parseTranscript(
    [
      JSON.stringify({
        role: "assistant",
        content: [
          { type: "tool_use", name: "Bash", input: { command: "npm test" } },
          { type: "text", text: "All tests pass now." },
        ],
      }),
    ].join("\n"),
  );

  assert.deepEqual(findUnsupportedTestsPassClaims(events), []);
});

test("findUnsupportedTestsPassClaims ignores narration with no tests-pass claim", () => {
  const events = parseTranscript(
    JSON.stringify({
      role: "assistant",
      content: [{ type: "text", text: "I updated the helper function." }],
    }),
  );

  assert.deepEqual(findUnsupportedTestsPassClaims(events), []);
});

test("generateObjections combines both rules", () => {
  const transcriptText = [
    JSON.stringify({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "Edit",
          input: { file_path: "src/missing.js", old_string: "a", new_string: "b" },
        },
        { type: "text", text: "All tests pass now." },
      ],
    }),
  ].join("\n");

  const events = parseTranscript(transcriptText);
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);

  const objections = generateObjections({ events, claims, diff });
  const rules = objections.map((o) => o.rule).sort();
  assert.deepEqual(rules, ["claimed-untouched-file", "unsupported-tests-pass-claim"]);
});
