import test from "node:test";
import assert from "node:assert/strict";
import { parseDiff } from "../src/diffParser.js";
import { parseTranscript, extractClaims } from "../src/transcriptParser.js";
import { generateObjections } from "../src/objections.js";
import { buildExhibits, renderDeposition } from "../src/template.js";

const sampleDiff = [
  "diff --git a/src/app.js b/src/app.js",
  "index e69de29..b6fc4c6 100644",
  "--- a/src/app.js",
  "+++ b/src/app.js",
  "@@ -1,2 +1,2 @@",
  "-old",
  "+new",
  "",
  "diff --git a/src/utils.js b/src/utils.js",
  "new file mode 100644",
  "index 0000000..1111111",
  "--- /dev/null",
  "+++ b/src/utils.js",
  "@@ -0,0 +1,1 @@",
  "+export function helper() {}",
  "",
].join("\n");

test("buildExhibits assigns sequential labels in diff order", () => {
  const diff = parseDiff(sampleDiff);
  const exhibits = buildExhibits(diff);

  assert.equal(exhibits.get("src/app.js").label, "A");
  assert.equal(exhibits.get("src/utils.js").label, "B");
});

test("renderDeposition numbers one Q&A pair per claim", () => {
  const events = parseTranscript(
    [
      JSON.stringify({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            name: "Edit",
            input: { file_path: "src/app.js", old_string: "old", new_string: "new" },
          },
        ],
      }),
    ].join("\n"),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);
  const objections = generateObjections({ events, claims, diff });

  const doc = renderDeposition({ claims, diff, objections });

  assert.match(doc, /DEPOSITION OF THE AGENT/);
  assert.match(doc, /Q1\. Counsel: The transcript shows you invoked Edit \(edit\) on "src\/app\.js"/);
  assert.match(doc, /A1\. Witness: Yes\. I used Edit to edit "src\/app\.js"\./);
});

test("renderDeposition cites the matching exhibit for a claim the diff supports", () => {
  const events = parseTranscript(
    JSON.stringify({
      role: "assistant",
      content: [
        {
          type: "tool_use",
          name: "Edit",
          input: { file_path: "src/app.js", old_string: "old", new_string: "new" },
        },
      ],
    }),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);
  const objections = generateObjections({ events, claims, diff });

  const doc = renderDeposition({ claims, diff, objections });

  assert.match(doc, /\(See Exhibit A\.\)/);
  assert.match(doc, /EXHIBIT A — src\/app\.js \(modified\)/);
  assert.match(doc, /-old/);
  assert.match(doc, /\+new/);
});

test("renderDeposition places an OBJECTION line directly beneath the claim it contradicts", () => {
  const events = parseTranscript(
    JSON.stringify({
      role: "assistant",
      content: [{ type: "text", text: "I also updated README.md for clarity." }],
    }),
  );
  const claims = extractClaims(events);
  const diff = parseDiff("");
  const objections = generateObjections({ events, claims, diff });

  const doc = renderDeposition({ claims, diff, objections });
  const qaIndex = doc.indexOf('Q1. Counsel: The transcript shows you updated "README.md"');
  const objectionIndex = doc.indexOf("OBJECTION (claimed-untouched-file)");

  assert.ok(qaIndex >= 0);
  assert.ok(objectionIndex > qaIndex);
  assert.ok(!doc.includes("EXHIBIT"));
});

test("renderDeposition lists claim-independent objections under GENERAL OBJECTIONS", () => {
  const events = parseTranscript(
    JSON.stringify({
      role: "assistant",
      content: [{ type: "text", text: "All tests pass now." }],
    }),
  );
  const claims = extractClaims(events);
  const diff = parseDiff(sampleDiff);
  const objections = generateObjections({ events, claims, diff });

  const doc = renderDeposition({ claims, diff, objections });

  assert.match(doc, /GENERAL OBJECTIONS/);
  assert.match(doc, /OBJECTION \(unsupported-tests-pass-claim\): Claims the tests pass/);
});

test("renderDeposition produces no EXAMINATION entries or exhibits when there are no claims or diff", () => {
  const doc = renderDeposition({ claims: [], diff: { files: [] }, objections: [] });

  assert.match(doc, /DEPOSITION OF THE AGENT/);
  assert.doesNotMatch(doc, /EXHIBIT/);
  assert.doesNotMatch(doc, /GENERAL OBJECTIONS/);
});
