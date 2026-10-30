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
changed hunks, a first set of deterministic objection rules that flag
claimed-but-untouched files and unsupported "tests pass" claims, a
deposition template that renders the claims, diff, and objections as a
courtroom-style Q&A transcript with exhibits, and a closing verdict summary
tallying how many claims were sustained versus overruled.

## Install

```sh
npm install
```

The CLI has no runtime dependencies — it's built entirely on the Node.js
standard library.

## Usage

```sh
node bin/deposition.js <transcript-file> <diff-file> [--out <output-file>] [--json]
```

- `<transcript-file>` — a JSON Lines (one JSON object per line) agent session
  transcript. Each line looks like:

  ```json
  {"role": "assistant", "content": [{"type": "text", "text": "I fixed the null check bug in src/app.js."}, {"type": "tool_use", "name": "Edit", "input": {"file_path": "src/app.js"}}]}
  ```

  Lines that aren't valid JSON are skipped rather than treated as fatal.

- `<diff-file>` — unified diff text, e.g. the output of `git diff` or
  `git diff > changes.diff`.

- `--out <file>` — write the result to a file instead of stdout.

- `--json` — print the raw `claims`/`diff`/`objections` data as JSON instead
  of the deposition transcript.

By default the CLI renders a courtroom-deposition-style Q&A transcript:

- One numbered question-and-answer pair per claim found in the transcript —
  a `tool_call` claim (a file-editing tool invocation, e.g. `Edit`/`Write`)
  or a `narration` claim (a file mentioned in the agent's own text, paired
  with the nearest claim verb such as "fixed", "added", or "removed").
- An `EXHIBIT` block per file the diff actually changed, quoting its hunks,
  cross-referenced from any Q&A pair about that file.
- `OBJECTION` lines placed directly beneath the claim they contradict (or
  under a trailing `GENERAL OBJECTIONS` section when an objection isn't tied
  to one specific claim), raised by these deterministic rules:
  - `claimed-untouched-file` — the transcript claims a file was edited,
    written, or deleted (via a tool call or narration with a mutating verb),
    but the diff shows no change to that file at all.
  - `unsupported-tests-pass-claim` — the assistant's narration asserts the
    tests pass, but no test-running command (`npm test`, `pytest`, `go test`,
    etc.) appears anywhere in the transcript's tool calls.
- A closing `VERDICT SUMMARY` tallying how many claims were sustained (the
  diff contradicts them) versus overruled (the diff doesn't contradict
  them), plus any claim-independent objections sustained on top of that.

Example:

```sh
git diff > changes.diff
node bin/deposition.js session.jsonl changes.diff --out deposition.txt
```

Pass `--json` to get the same `claims`, `diff`, and `objections` data as a
JSON object instead, e.g. for feeding into another tool.

### Running the tests

```sh
npm test
```

## Why no dependencies

Parsing JSON Lines and unified diffs is well within what Node's standard
library (`fs`, `node:test`, `assert`) already covers, so this project adds no
third-party packages.
