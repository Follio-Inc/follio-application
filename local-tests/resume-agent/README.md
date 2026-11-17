# Resume Agent — local file-based harness

Runs the Resume Agent's analysis, scoring and grounding against fixture files.
**No Docker, no PostgreSQL, no Clerk, no Follio website**, and by default no
OpenAI call.

```bash
npx tsx local-tests/resume-agent/run.ts            # readable summary
npx tsx local-tests/resume-agent/run.ts --json     # full JSON to stdout
npx tsx local-tests/resume-agent/run.ts --out r.json
npx tsx local-tests/resume-agent/run.ts --live     # real requirement extraction
```

Nothing in this folder is imported by the app, and nothing here writes to a
resume — there is no database and no apply path to reach.

## What runs for real

Every function below is the production one, called directly:

| Step                                         | Function               | Needs                      |
| -------------------------------------------- | ---------------------- | -------------------------- |
| Resume → facts                               | `buildEditFacts`       | nothing                    |
| Editable refs (`S`, `E1.2`)                  | `toResumeLinesView`    | nothing                    |
| Requirement match, keyword coverage, writing | `evaluateResume`       | nothing                    |
| Anti-invention checks                        | `groundAssistantEdits` | nothing                    |
| Posting → requirements                       | `readJobRequirements`  | **OpenAI** (`--live` only) |

Requirement extraction is the single step that needs a model. Offline,
`sample-requirements.json` stands in for it, so runs are deterministic and
free. Everything else — including the scoring and all the safety checks — is
plain code with no network and no Prisma.

## Files

| File                         | What it is                                                      |
| ---------------------------- | --------------------------------------------------------------- |
| `sample-resume.json`         | Fictional resume, shaped as `EditSourceProfile`                 |
| `sample-job-description.txt` | Posting with requirements the resume meets and some it does not |
| `sample-requirements.json`   | Offline stand-in for the extractor                              |
| `sample-edits.json`          | Proposed rewrites, honest and dishonest, for grounding          |
| `run.ts`                     | The runner                                                      |

Fixtures are validated with Zod on load, so a typo gives a pointed message
instead of an `undefined` deep inside the scorer.

## Editing the fixtures

**Bullets must be plain strings with `bulletsHtml: null` to be rewritable.**
`readBullets` marks a role read-only when `bulletsHtml` holds nested lists or
no `<li>` items at all; such a role exposes no `E{n}.{m}` refs, so the agent
can read it but cannot propose on it. The runner prints the editable-bullet
count and warns when a role is read-only — if propose mode ever returns
"nothing saved" against a real resume, check this first.

In `sample-edits.json`, `expect` is a note to the reader. The runner prints
the real outcome beside it; where the two disagree, the code is right.

## What the sample run shows

Against the bundled fixtures:

- **Match**: Python, PostgreSQL, On-call and Payments are found on the resume.
  Kubernetes, Terraform and Kafka are reported missing. GraphQL comes back
  `related` via REST APIs — a near miss, not a claim of experience.
- **Grounding**, 7 proposed → 3 kept, 1 dropped, 3 ignored:
  - `S` — kept. Adds only PostgreSQL, which the resume shows.
  - `E1.1` — **dropped**. Adds Kubernetes, which appears nowhere.
  - `E1.2` — kept with `[__]`. The invented "500" is blanked for the user to fill.
  - `E1.4` — ignored. The rewrite would lose the "12" the line already states.
  - `E2.1` — ignored. Identical to the line already there.
  - `E9.1` — ignored. No such line.
  - `E2.3` — kept. Ordinary rewording is fine; the checks police named things
    (tools, numbers, titles), not vocabulary.

Two of those cases only read correctly after the code disproved the note I had
written beside them. That is the harness working.

## Limits

- Requirement extraction is the only model-backed step, so an offline run
  depends on `sample-requirements.json` being an honest stand-in. Use `--live`
  to check it against the real extractor.
- Grounding is lexical, not semantic — it compares words, so a true statement
  phrased in words the resume never uses can still be dropped.
- This exercises the agent's _tools_, not the tool-calling loop, the API
  route, auth, or rate limiting. Those need the full stack and are covered by
  `__tests__/agents/`.

---

# Live agent demo (`live-agent.ts`)

`run.ts` above exercises the agent's _logic_ with no model. This runs the
**real agent loop against a real OpenAI model**, with the model choosing which
tools to call.

```bash
npx tsx local-tests/resume-agent/live-agent.ts --check               # no API call
npx tsx local-tests/resume-agent/live-agent.ts --live                # propose mode
npx tsx local-tests/resume-agent/live-agent.ts --live --mode analyze # analyze mode
```

There is **no mocked-model fallback**. Without `OPENAI_API_KEY` the run fails
with a clear error rather than quietly producing a fake transcript.

## Production vs test-only

| Piece                                                                                | Source                                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Tool-calling loop, budget, progress, telemetry                                       | production `runAgent`                                        |
| Instructions                                                                         | production `resumeAgent` / `resumeProposeAgent`              |
| Result contract                                                                      | production `resumeAgentResultSchema`, `submit_resume_result` |
| `analyze_job_description`                                                            | production tool, unmodified (needs no database)              |
| Resume pinning                                                                       | production `pinnedToSelectedResume`                          |
| Scoring, line view, grounding                                                        | production functions, called inside the adapters             |
| `get_resume`, `score_resume_against_jd`, `read_resume_lines`, `propose_resume_edits` | **test-only** adapters over `sample-resume.json`             |
| Edit session storage                                                                 | **test-only**, in memory                                     |
| Tool-call recording                                                                  | **test-only** wrapper that delegates and changes nothing     |

## Why there is a bootstrap file

`live-agent.ts` only sets `DATABASE_URL` to a dead local address and then
dynamically imports `live-agent-impl.ts`. It has to: `runAgent` writes one
`AgentRun` telemetry row through Prisma, and this repo's `.env` currently
points at a **hosted** database. Claiming the variable before Prisma is
constructed keeps that write off the hosted database — dotenv does not
overwrite variables that are already set. `.env` is never modified. The
preflight prints the effective database target so you can see the guard held.

`persistAgentRun` catches its own failures, so the dead address costs nothing
but a logged Prisma error.

## Output

A live run writes four files to `local-tests/resume-agent/output/`:
`live-agent-transcript.json` (tool calls in order, inputs, outputs, progress
events, token usage), `live-agent-analysis.json` (the structured result),
`live-agent-proposals.json` (what the model submitted, what grounding did with
it), and `live-agent-report.md`.

## What this does not prove

Ownership checks, the API route, Clerk auth, rate limiting, and the real
`ResumeEditSession` write are all absent — there is no database and no second
user. Those are covered by `__tests__/agents/`. This demo proves the model
drives the real loop, calls the real tools, and that grounding governs what it
is allowed to propose.
