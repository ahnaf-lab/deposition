# deposition

A CLI that reads an agent session transcript and the resulting git diff,
cross-examines every tool-call claim against what the diff actually shows, and
generates a courtroom-deposition-style document — exhibits and objections
included — wherever the narration disagrees with the code.

This is a readable, shareable receipt of what an agent actually did to a
codebase, as opposed to what it said it did.

## Status

This project is built autonomously, one milestone at a time, with each change
gated on passing automated tests. So far: parsing a transcript into claims
about which files were touched or fixed, parsing a diff into its actual
changed hunks, and a first set of deterministic objection rules that flag
claimed-but-untouched files and unsupported "tests pass" claims. Full
cross-examination and document generation are not implemented yet.

## Install

```sh
npm install
```

The CLI has no runtime dependencies — it's built entirely on the Node.js
standard library.

## Usage

```sh
node bin/deposition.js <transcript-file> <diff-file> [--out <output-file>]
```

- `<transcript-file>` — a JSON Lines (one JSON object per line) agent session
  transcript. Each line looks like:

  ```json
  {"role": "assistant", "content": [{"type": "text", "text": "I fixed the null check bug in src/app.js."}, {"type": "tool_use", "name": "Edit", "input": {"file_path": "src/app.js"}}]}
  ```

  Lines that aren't valid JSON are skipped rather than treated as fatal.

- `<diff-file>` — unified diff text, e.g. the output of `git diff` or
  `git diff > changes.diff`.

- `--out <file>` — write the JSON result to a file instead of stdout.

The CLI prints a JSON object with three top-level keys:

- `claims` — every claim found in the transcript, either a `tool_call` claim
  (a file-editing tool invocation, e.g. `Edit`/`Write`) or a `narration` claim
  (a file mentioned in the agent's own text, paired with the nearest claim
  verb such as "fixed", "added", or "removed").
- `diff` — the parsed diff: one entry per file with its status
  (`added`/`modified`/`deleted`/`renamed`) and its hunks, each hunk broken
  down into added, removed, and context lines.
- `objections` — deterministic rule violations found by comparing `claims`
  against `diff`:
  - `claimed-untouched-file` — the transcript claims a file was edited,
    written, or deleted (via a tool call or narration with a mutating verb),
    but the diff shows no change to that file at all.
  - `unsupported-tests-pass-claim` — the assistant's narration asserts the
    tests pass, but no test-running command (`npm test`, `pytest`, `go test`,
    etc.) appears anywhere in the transcript's tool calls.

Example:

```sh
git diff > changes.diff
node bin/deposition.js session.jsonl changes.diff --out claims.json
```

### Running the tests

```sh
npm test
```

## Why no dependencies

Parsing JSON Lines and unified diffs is well within what Node's standard
library (`fs`, `node:test`, `assert`) already covers, so this project adds no
third-party packages.
