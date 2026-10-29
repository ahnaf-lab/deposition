import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parseTranscript,
  extractClaims,
  extractNarrationClaims,
} from "../src/transcriptParser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleTranscript = readFileSync(
  join(__dirname, "fixtures", "sample.transcript.jsonl"),
  "utf8",
);

test("parseTranscript skips invalid JSON lines and blank lines", () => {
  const events = parseTranscript(sampleTranscript);
  // 5 valid JSON lines; "not valid json at all" is skipped.
  assert.equal(events.length, 5);
});

test("parseTranscript preserves event order and roles", () => {
  const events = parseTranscript(sampleTranscript);
  assert.deepEqual(
    events.map((e) => e.role),
    ["user", "assistant", "assistant", "tool", "assistant"],
  );
});

test("extractNarrationClaims pairs the nearest preceding verb with a file", () => {
  const claims = extractNarrationClaims(
    "I fixed the null check bug in src/app.js.",
  );
  assert.equal(claims.length, 1);
  assert.equal(claims[0].verb, "fixed");
  assert.equal(claims[0].file, "src/app.js");
});

test("extractNarrationClaims handles multiple files with different verbs", () => {
  const claims = extractNarrationClaims(
    "I added a new helper in src/utils.js and updated README.md for clarity.",
  );
  assert.equal(claims.length, 2);
  assert.equal(claims[0].verb, "added");
  assert.equal(claims[0].file, "src/utils.js");
  assert.equal(claims[1].verb, "updated");
  assert.equal(claims[1].file, "README.md");
});

test("extractNarrationClaims returns null verb when no claim verb is nearby", () => {
  const claims = extractNarrationClaims("See src/app.js for details.");
  assert.equal(claims.length, 1);
  assert.equal(claims[0].verb, null);
  assert.equal(claims[0].file, "src/app.js");
});

test("extractClaims finds tool_call claims from Edit and Write tool uses", () => {
  const events = parseTranscript(sampleTranscript);
  const claims = extractClaims(events);
  const toolCalls = claims.filter((c) => c.type === "tool_call");

  assert.equal(toolCalls.length, 2);
  assert.equal(toolCalls[0].tool, "Edit");
  assert.equal(toolCalls[0].action, "edit");
  assert.equal(toolCalls[0].file, "src/app.js");
  assert.equal(toolCalls[1].tool, "Write");
  assert.equal(toolCalls[1].action, "write");
  assert.equal(toolCalls[1].file, "src/utils.js");
});

test("extractClaims finds narration claims only from assistant text", () => {
  const events = parseTranscript(sampleTranscript);
  const claims = extractClaims(events);
  const narration = claims.filter((c) => c.type === "narration");

  const files = narration.map((c) => c.file);
  assert.ok(files.includes("src/app.js"));
  assert.ok(files.includes("src/utils.js"));
  assert.ok(files.includes("README.md"));

  // The "Please fix the null check bug." user message has no file mention
  // and should not produce a narration claim, and user-role text is ignored
  // even when it does mention a file.
  const userClaims = narration.filter(
    (c) => events[c.eventIndex].role === "user",
  );
  assert.equal(userClaims.length, 0);
});
