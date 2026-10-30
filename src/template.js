// Renders claims, the parsed diff, and objections as a courtroom
// deposition-style Q&A transcript: one numbered question-and-answer pair per
// claim, EXHIBIT blocks quoting the diff hunks for files the diff actually
// changed, and OBJECTION lines wherever a claim and the diff disagree.

const EXHIBIT_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function exhibitLabelFor(index) {
  if (index < EXHIBIT_LABELS.length) return EXHIBIT_LABELS[index];
  return `A${index - EXHIBIT_LABELS.length + 1}`;
}

function normalizePath(filePath) {
  return filePath.replace(/^\.\//, "");
}

function filePathOf(file) {
  return file.newPath ?? file.oldPath;
}

/**
 * Assign an exhibit label (A, B, C, ...) to each file in the diff, in the
 * order the files appear in the diff. Both the old and new path of a
 * renamed file map to the same exhibit, so a claim naming either resolves.
 */
export function buildExhibits(diff) {
  const exhibits = new Map();
  diff.files.forEach((file, index) => {
    const exhibit = { label: exhibitLabelFor(index), file };
    if (file.newPath) exhibits.set(normalizePath(file.newPath), exhibit);
    if (file.oldPath) exhibits.set(normalizePath(file.oldPath), exhibit);
  });
  return exhibits;
}

function lineMarker(type) {
  if (type === "add") return "+";
  if (type === "del") return "-";
  return " ";
}

function formatHunk(hunk) {
  const lines = [hunk.header];
  for (const line of hunk.lines) {
    lines.push(`${lineMarker(line.type)}${line.content}`);
  }
  return lines.join("\n");
}

function formatExhibit(exhibit) {
  const { label, file } = exhibit;
  const header = `EXHIBIT ${label} — ${filePathOf(file)} (${file.status})`;
  const rule = "-".repeat(header.length);
  const body = file.hunks.map(formatHunk).join("\n");
  return [header, rule, body, rule].join("\n");
}

function claimAction(claim) {
  return claim.type === "tool_call" ? claim.action : claim.verb;
}

function objectionMatchesClaim(objection, claim) {
  return (
    objection.claimType === claim.type &&
    objection.eventIndex === claim.eventIndex &&
    normalizePath(objection.file) === normalizePath(claim.file) &&
    objection.verbOrAction === claimAction(claim)
  );
}

function describeClaim(claim) {
  if (claim.type === "tool_call") {
    return `invoked ${claim.tool} (${claim.action}) on "${claim.file}"`;
  }
  return claim.verb
    ? `${claim.verb} "${claim.file}"`
    : `mentioned "${claim.file}"`;
}

function answerFor(claim) {
  if (claim.type === "tool_call") {
    return `Yes. I used ${claim.tool} to ${claim.action} "${claim.file}".`;
  }
  return `Yes. In my own words: "${claim.text}"`;
}

function renderQA(claim, number, exhibits, objections) {
  const lines = [
    `Q${number}. Counsel: The transcript shows you ${describeClaim(claim)}. Is that accurate?`,
    `A${number}. Witness: ${answerFor(claim)}`,
  ];

  const exhibit = exhibits.get(normalizePath(claim.file));
  if (exhibit) {
    lines.push(`(See Exhibit ${exhibit.label}.)`);
  }

  for (const objection of objections) {
    if (objectionMatchesClaim(objection, claim)) {
      lines.push(`OBJECTION (${objection.rule}): ${objection.message}`);
    }
  }

  return lines.join("\n");
}

function renderGeneralObjections(objections, claims) {
  const unmatched = objections.filter(
    (objection) => !claims.some((claim) => objectionMatchesClaim(objection, claim)),
  );
  if (unmatched.length === 0) return null;

  const lines = ["GENERAL OBJECTIONS", "-".repeat(19)];
  for (const objection of unmatched) {
    lines.push(`OBJECTION (${objection.rule}): ${objection.message}`);
  }
  return lines.join("\n");
}

/**
 * Render a full deposition document: one numbered Q&A pair per claim found
 * in the transcript, an EXHIBIT block per file the diff actually changed,
 * and objections placed directly beneath the claim they contradict (or
 * under a trailing "GENERAL OBJECTIONS" section when they aren't tied to a
 * specific claim, e.g. an unsupported "tests pass" assertion).
 */
export function renderDeposition({ claims, diff, objections }) {
  const exhibits = buildExhibits(diff);
  const sections = [
    "DEPOSITION OF THE AGENT",
    "=".repeat(24),
    "",
    "EXAMINATION",
    "-".repeat(11),
  ];

  claims.forEach((claim, i) => {
    sections.push("");
    sections.push(renderQA(claim, i + 1, exhibits, objections));
  });

  const uniqueExhibits = new Set(exhibits.values());
  if (uniqueExhibits.size > 0) {
    sections.push("");
    sections.push("EXHIBITS");
    sections.push("-".repeat(8));
    for (const exhibit of uniqueExhibits) {
      sections.push("");
      sections.push(formatExhibit(exhibit));
    }
  }

  const general = renderGeneralObjections(objections, claims);
  if (general) {
    sections.push("");
    sections.push(general);
  }

  return `${sections.join("\n")}\n`;
}
