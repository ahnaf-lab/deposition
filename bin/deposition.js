#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import {
  parseDiff,
  parseTranscript,
  extractClaims,
  generateObjections,
  renderDeposition,
  tallyVerdicts,
} from "../src/index.js";

function usage() {
  return [
    "Usage: deposition <transcript-file> <diff-file> [--out <output-file>] [--json]",
    "",
    "  <transcript-file>  JSON Lines agent session transcript",
    "  <diff-file>        unified diff text, e.g. the output of `git diff`",
    "  --out <file>       write the result to a file instead of stdout",
    "  --json             print the raw claims/diff/objections JSON instead",
    "                     of the deposition Q&A transcript",
  ].join("\n");
}

function parseArgs(argv) {
  const positional = [];
  let out = null;
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else {
      positional.push(arg);
    }
  }

  return { transcriptPath: positional[0], diffPath: positional[1], out, json };
}

export function run(argv) {
  const args = parseArgs(argv);

  if (args.help || !args.transcriptPath || !args.diffPath) {
    return { ok: false, message: usage() };
  }

  let transcriptText;
  let diffText;

  try {
    transcriptText = readFileSync(args.transcriptPath, "utf8");
  } catch (err) {
    return {
      ok: false,
      message: `Could not read transcript file "${args.transcriptPath}": ${err.message}`,
    };
  }

  try {
    diffText = readFileSync(args.diffPath, "utf8");
  } catch (err) {
    return {
      ok: false,
      message: `Could not read diff file "${args.diffPath}": ${err.message}`,
    };
  }

  const events = parseTranscript(transcriptText);
  const claims = extractClaims(events);
  const diff = parseDiff(diffText);
  const objections = generateObjections({ events, claims, diff });

  const output = args.json
    ? `${JSON.stringify(
        { claims, diff, objections, verdict: tallyVerdicts(claims, objections) },
        null,
        2,
      )}\n`
    : renderDeposition({ claims, diff, objections });

  return { ok: true, output, out: args.out };
}

function main() {
  const outcome = run(process.argv.slice(2));

  if (!outcome.ok) {
    console.error(outcome.message);
    process.exitCode = 1;
    return;
  }

  if (outcome.out) {
    writeFileSync(outcome.out, outcome.output, "utf8");
  } else {
    process.stdout.write(outcome.output);
  }
}

main();
