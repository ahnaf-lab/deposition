// Parses an agent session transcript (JSON Lines, one event per line) and
// extracts "claims" about which files the agent says it touched or fixed.
//
// Each transcript line is a JSON object shaped like:
//   { "role": "assistant", "content": [ { "type": "text", "text": "..." },
//                                        { "type": "tool_use", "name": "Edit",
//                                          "input": { "file_path": "src/app.js" } } ] }
// "role" may also be "user" or "tool". Lines that don't parse as JSON, or
// don't look like an event, are skipped rather than treated as fatal.

const FILE_TOOL_NAMES = new Set([
  "Edit",
  "Write",
  "Create",
  "Patch",
  "MultiEdit",
  "NotebookEdit",
  "Read",
  "Delete",
]);

const FILE_PATH_KEYS = ["file_path", "path", "filename", "file"];

const TOOL_ACTIONS = {
  Edit: "edit",
  MultiEdit: "edit",
  Patch: "edit",
  NotebookEdit: "edit",
  Write: "write",
  Create: "write",
  Read: "read",
  Delete: "delete",
};

const CLAIM_VERBS = new Set([
  "fix",
  "fixed",
  "fixes",
  "fixing",
  "add",
  "added",
  "adds",
  "adding",
  "create",
  "created",
  "creates",
  "creating",
  "remove",
  "removed",
  "removes",
  "removing",
  "delete",
  "deleted",
  "deletes",
  "deleting",
  "refactor",
  "refactored",
  "refactors",
  "refactoring",
  "update",
  "updated",
  "updates",
  "updating",
  "modify",
  "modified",
  "modifies",
  "modifying",
  "implement",
  "implemented",
  "implements",
  "implementing",
  "touch",
  "touched",
  "touches",
  "touching",
  "change",
  "changed",
  "changes",
  "changing",
  "write",
  "wrote",
  "writes",
  "writing",
  "rename",
  "renamed",
  "renames",
  "renaming",
]);

// A file-looking token: optional path segments, then a name with an extension.
const FILE_TOKEN_RE = /(?:[\w.-]+\/)*[\w-]+\.[A-Za-z0-9]{1,10}\b/g;

const VERB_LOOKBACK_WORDS = 6;

function stripTrailingPunctuation(token) {
  const stripped = token.replace(/[.,;:!?)'"]+$/, "");
  return stripped.length > 0 && /\.[A-Za-z0-9]{1,10}$/.test(stripped)
    ? stripped
    : token;
}

function stripWordPunctuation(word) {
  return word.replace(/^[('"]+|[.,;:!?)'"]+$/g, "").toLowerCase();
}

/**
 * Scan a block of narration text for "<verb> ... <file>" patterns and
 * return a list of { verb, file } claims. If no verb is found near a file
 * mention, verb is null.
 */
export function extractNarrationClaims(text) {
  const claims = [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  // Precompute which word indices look like verbs.
  const verbIndexes = [];
  words.forEach((word, i) => {
    if (CLAIM_VERBS.has(stripWordPunctuation(word))) {
      verbIndexes.push(i);
    }
  });

  words.forEach((word, i) => {
    FILE_TOKEN_RE.lastIndex = 0;
    const match = FILE_TOKEN_RE.exec(word);
    if (!match) return;
    const file = stripTrailingPunctuation(match[0]);

    let nearestVerb = null;
    let nearestDistance = Infinity;
    for (const vi of verbIndexes) {
      if (vi <= i) {
        const distance = i - vi;
        if (distance <= VERB_LOOKBACK_WORDS && distance < nearestDistance) {
          nearestVerb = stripWordPunctuation(words[vi]);
          nearestDistance = distance;
        }
      }
    }

    claims.push({ verb: nearestVerb, file });
  });

  return claims;
}

function readFilePath(input) {
  if (!input || typeof input !== "object") return null;
  for (const key of FILE_PATH_KEYS) {
    if (typeof input[key] === "string" && input[key].length > 0) {
      return input[key];
    }
  }
  if (Array.isArray(input.edits) && input.edits.length > 0) {
    return readFilePath(input.edits[0]);
  }
  return null;
}

/**
 * Parse raw transcript text (JSON Lines) into an array of event objects.
 * Malformed lines are skipped.
 */
export function parseTranscript(transcriptText) {
  const events = [];
  const lines = transcriptText.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (parsed && typeof parsed === "object") {
      events.push(parsed);
    }
  }

  return events;
}

/**
 * Extract claims from parsed transcript events.
 *
 * Returns an array of claim objects:
 *   - tool_call claims: { type: "tool_call", tool, action, file, eventIndex }
 *     one per file-editing tool invocation found in the transcript.
 *   - narration claims: { type: "narration", verb, file, eventIndex, text }
 *     one per file mention found in assistant narration text, together with
 *     the nearest preceding claim verb (or null if none was found nearby).
 */
export function extractClaims(events) {
  const claims = [];

  events.forEach((event, eventIndex) => {
    const content = Array.isArray(event?.content) ? event.content : [];

    for (const block of content) {
      if (!block || typeof block !== "object") continue;

      if (block.type === "tool_use" && FILE_TOOL_NAMES.has(block.name)) {
        const file = readFilePath(block.input);
        if (file) {
          claims.push({
            type: "tool_call",
            tool: block.name,
            action: TOOL_ACTIONS[block.name] ?? "unknown",
            file,
            eventIndex,
          });
        }
        continue;
      }

      if (block.type === "text" && event.role === "assistant") {
        const text = typeof block.text === "string" ? block.text : "";
        for (const { verb, file } of extractNarrationClaims(text)) {
          claims.push({
            type: "narration",
            verb,
            file,
            eventIndex,
            text,
          });
        }
      }
    }
  });

  return claims;
}
