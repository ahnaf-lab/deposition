#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import {
  parseDiff,
  parseTranscript,
  extractClaims,
  generateObjections,
} from "../src/index.js";

function usage() {
  return [
    "Usage: deposition <transcript-file> <diff-file> [--out <output-file>]",
    "",
    "  <transcript-file>  JSON Lines agent session transcript",
    "  <diff-file>        unified diff text, e.g. the output of `git diff`",
    "  --out <file>       write JSON result to a file instead of stdout",
  ].join("\n");
}

function parseArgs(argv) {
  const positional = [];
  let out = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      out = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      return { help: true };
    } else {
      positional.push(arg);
    }
  }

  return { transcriptPath: positional[0], diffPath: positional[1], out };
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

  const result = { claims, diff, objections };
  return { ok: true, result, out: args.out };
}

function main() {
  const outcome = run(process.argv.slice(2));

  if (!outcome.ok) {
    console.error(outcome.message);
    process.exitCode = 1;
    return;
  }

  const json = JSON.stringify(outcome.result, null, 2);

  if (outcome.out) {
    writeFileSync(outcome.out, json + "\n", "utf8");
  } else {
    console.log(json);
  }
}

main();
