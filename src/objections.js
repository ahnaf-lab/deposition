// Deterministic rules that compare the claims extracted from a transcript
// against the parsed diff and raise "objections" where they disagree.
//
// Two rules are implemented:
//   - claimed-untouched-file: the transcript claims a file was edited,
//     written, or deleted, but the diff shows no change to that file.
//   - unsupported-tests-pass-claim: the transcript's narration asserts the
//     tests pass, but no test-running command appears anywhere in the
//     transcript's tool calls.

const MUTATING_TOOL_ACTIONS = new Set(["edit", "write", "delete"]);

const COMMAND_TOOL_NAMES = new Set([
  "Bash",
  "Shell",
  "RunCommand",
  "Exec",
  "ExecuteCommand",
]);

const COMMAND_INPUT_KEYS = ["command", "cmd", "script"];

const TEST_RUNNER_RE =
  /\b(npm\s+(run\s+)?test|yarn\s+test|pnpm\s+test|pytest|jest|mocha|vitest|go\s+test|cargo\s+test|node\s+--test|rspec|phpunit|dotnet\s+test)\b/i;

const TESTS_PASS_RE =
  /\btests?\b(?:\s+\S+){0,4}?\s+pass(?:es|ed|ing)?\b/i;

function normalizePath(filePath) {
  return filePath.replace(/^\.\//, "");
}

function diffHasFile(diff, filePath) {
  const normalized = normalizePath(filePath);
  return diff.files.some(
    (file) =>
      (file.newPath && normalizePath(file.newPath) === normalized) ||
      (file.oldPath && normalizePath(file.oldPath) === normalized),
  );
}

/**
 * Flag claims that a file was edited/written/deleted when the diff shows no
 * change to that file at all. Read-only tool calls and narration mentions
 * with no claim verb nearby are not mutation claims and are not flagged.
 */
export function findUntouchedFileClaims(claims, diff) {
  const objections = [];
  const seen = new Set();

  for (const claim of claims) {
    let verbOrAction = null;

    if (claim.type === "tool_call" && MUTATING_TOOL_ACTIONS.has(claim.action)) {
      verbOrAction = claim.action;
    } else if (claim.type === "narration" && claim.verb) {
      verbOrAction = claim.verb;
    }

    if (!verbOrAction) continue;
    if (diffHasFile(diff, claim.file)) continue;

    const key = `${claim.type}:${claim.file}:${verbOrAction}:${claim.eventIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);

    objections.push({
      rule: "claimed-untouched-file",
      claimType: claim.type,
      verbOrAction,
      file: claim.file,
      eventIndex: claim.eventIndex,
      message: `Claims to have ${verbOrAction} "${claim.file}", but the diff shows no change to that file.`,
    });
  }

  return objections;
}

function readCommand(input) {
  if (!input || typeof input !== "object") return null;
  for (const key of COMMAND_INPUT_KEYS) {
    if (typeof input[key] === "string" && input[key].length > 0) {
      return input[key];
    }
  }
  return null;
}

/**
 * True if any tool call in the transcript ran what looks like a test
 * command (e.g. `npm test`, `pytest`, `go test`).
 */
function transcriptRanTests(events) {
  for (const event of events) {
    const content = Array.isArray(event?.content) ? event.content : [];
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.type !== "tool_use" || !COMMAND_TOOL_NAMES.has(block.name)) {
        continue;
      }
      const command = readCommand(block.input);
      if (command && TEST_RUNNER_RE.test(command)) return true;
    }
  }
  return false;
}

/**
 * Flag assistant narration that claims the tests pass when no test-running
 * command appears anywhere in the transcript's tool calls.
 */
export function findUnsupportedTestsPassClaims(events) {
  const objections = [];
  if (transcriptRanTests(events)) return objections;

  events.forEach((event, eventIndex) => {
    if (event?.role !== "assistant") return;
    const content = Array.isArray(event?.content) ? event.content : [];

    for (const block of content) {
      if (!block || typeof block !== "object" || block.type !== "text") {
        continue;
      }
      const text = typeof block.text === "string" ? block.text : "";
      if (TESTS_PASS_RE.test(text)) {
        objections.push({
          rule: "unsupported-tests-pass-claim",
          eventIndex,
          text,
          message:
            "Claims the tests pass, but no test command was run anywhere in this transcript.",
        });
      }
    }
  });

  return objections;
}

/**
 * Run every deterministic objection rule and return the combined list.
 */
export function generateObjections({ events, claims, diff }) {
  return [
    ...findUntouchedFileClaims(claims, diff),
    ...findUnsupportedTestsPassClaims(events),
  ];
}
