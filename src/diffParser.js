// Parses unified diff text (e.g. the output of `git diff`) into a
// structured list of files and hunks.

const DIFF_HEADER_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const OLD_FILE_RE = /^--- (?:a\/(.+)|\/dev\/null)$/;
const NEW_FILE_RE = /^\+\+\+ (?:b\/(.+)|\/dev\/null)$/;
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

function startNewFile(oldPath, newPath) {
  return {
    oldPath,
    newPath,
    status: "modified",
    hunks: [],
  };
}

function finalizeFile(file) {
  if (file.oldPath === null && file.newPath !== null) {
    file.status = "added";
  } else if (file.oldPath !== null && file.newPath === null) {
    file.status = "deleted";
  } else if (
    file.oldPath !== null &&
    file.newPath !== null &&
    file.oldPath !== file.newPath
  ) {
    file.status = "renamed";
  }
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.type === "add") added += 1;
      else if (line.type === "del") removed += 1;
    }
  }
  file.addedLines = added;
  file.removedLines = removed;
  return file;
}

/**
 * Parse unified diff text into { files: [...] }.
 * Each file has oldPath, newPath, status, hunks, addedLines, removedLines.
 * Each hunk has header, oldStart, oldLines, newStart, newLines, lines.
 */
export function parseDiff(diffText) {
  const files = [];
  if (!diffText || diffText.trim() === "") {
    return { files };
  }

  const lines = diffText.split("\n");
  let currentFile = null;
  let currentHunk = null;

  for (const rawLine of lines) {
    const headerMatch = DIFF_HEADER_RE.exec(rawLine);
    if (headerMatch) {
      if (currentFile) files.push(finalizeFile(currentFile));
      currentFile = startNewFile(headerMatch[1], headerMatch[2]);
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      // Content before any "diff --git" line is not a file diff we track.
      continue;
    }

    const oldFileMatch = OLD_FILE_RE.exec(rawLine);
    if (oldFileMatch) {
      currentFile.oldPath = oldFileMatch[1] ?? null;
      continue;
    }

    const newFileMatch = NEW_FILE_RE.exec(rawLine);
    if (newFileMatch) {
      currentFile.newPath = newFileMatch[1] ?? null;
      continue;
    }

    const hunkMatch = HUNK_HEADER_RE.exec(rawLine);
    if (hunkMatch) {
      const [, oldStart, oldLines, newStart, newLines, context] = hunkMatch;
      currentHunk = {
        header: rawLine,
        oldStart: Number(oldStart),
        oldLines: oldLines === undefined ? 1 : Number(oldLines),
        newStart: Number(newStart),
        newLines: newLines === undefined ? 1 : Number(newLines),
        context: context.trim(),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) {
      // Metadata lines like "index abc123..def456 100644" or "Binary files differ".
      continue;
    }

    if (rawLine.startsWith("+")) {
      currentHunk.lines.push({ type: "add", content: rawLine.slice(1) });
    } else if (rawLine.startsWith("-")) {
      currentHunk.lines.push({ type: "del", content: rawLine.slice(1) });
    } else if (rawLine.startsWith(" ")) {
      currentHunk.lines.push({ type: "context", content: rawLine.slice(1) });
    } else if (rawLine === "\\ No newline at end of file") {
      // Ignore marker lines; they don't represent a changed line.
    } else if (rawLine === "") {
      currentHunk.lines.push({ type: "context", content: "" });
    }
  }

  if (currentFile) files.push(finalizeFile(currentFile));

  return { files };
}
