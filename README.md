# repo-policy-bot

Scaffold an autonomous AI-powered repo maintainer onto any GitHub repository. One command drops in four GitHub Actions workflows that handle issue triage, PR review, bug fixes, and releases — all driven by a plain-English policy file you own and version-control.

## Quick start

```bash
npx repo-policy-bot init
```

Run this inside any git repository. The CLI resolves the latest `claude-code-action` SHA, detects your CI workflow, and writes six files under `.github/`. No global install required.

## Prerequisites

**GitHub App** — `claude-code-action` uses GitHub App authentication for workflow chaining (the Triage Agent can trigger the Implementation Agent). Create a GitHub App with the required permissions and add its credentials as repository secrets (`APP_ID`, `APP_PRIVATE_KEY`).

**Claude auth** — one of:
- `ANTHROPIC_API_KEY` repo secret (API key billing)
- `CLAUDE_CODE_OAUTH_TOKEN` repo secret (Claude Pro/Max subscription)

See the [claude-code-action docs](https://github.com/anthropics/claude-code-action) for full secret setup.

## How it works

Four workflows are installed. The first two are AI-powered; the last two are pure logic.

### 1. Triage Agent (read-only privilege)
Triggers on `issues.opened`, `pull_request.opened/synchronize`, and `issue_comment.created`. Reads `.github/repo-policy.md` and applies the label taxonomy, posts review comments, and transitions state. Cannot push code.

### 2. Implementation Agent (write privilege)
Triggers when an issue is labeled `state:planned`. Creates a `bot/{issue-number}-{slug}` branch, implements the fix, opens a PR, and iterates on review feedback until the Triage Agent marks it `state:ready-to-merge`.

### 3. Gate Runner (pure logic)
Triggers on `pull_request_review` and workflow completion events. Checks four gates: CI passing, `state:ready-to-merge` label present, `risk:high` absent, human approval present (if required). Auto-merges when all gates pass.

### 4. Release Runner (pure logic)
Triggers on pushes to the default branch. Examines `release:*` labels on merged PRs since the last tag, determines the SemVer bump, creates a changelog, and cuts the release.

## Policy file

`.github/repo-policy.md` — plain Markdown, four sections:

```markdown
# Product Guardrails
- Privacy by default
- Simplicity over features

# Risk Classification
## Always High Risk
- Changes to authentication or authorization
- Database migration changes

## Always Low Risk
- Documentation-only changes
- Test-only changes

# Decision Rules
## Bugs
- Fix if reproducible or obvious from code inspection
- Close as duplicate if an existing issue covers it

## Features
- Accept if it benefits most users
- Decline if it adds disproportionate complexity

## External PRs
- The idea matters, the exact code doesn't

# Repo-Specific Rules
- Treat changes to the billing module as risk:high
```

The agents read this file on every run. Edit it to tune behavior without touching the workflows.

## Machine config

`.github/repo-policy.yml` — parsed by the Gate Runner and Release Runner:

```yaml
# squash (default), merge, or rebase
merge_strategy: squash

# Must match the `name:` field in your CI workflow YAML
ci_workflow_name: "Build and Test"

# Branch to release from (default: repo's default branch)
# release_branch: main
```

## Label taxonomy

Every issue and PR gets exactly one label from each of the five namespaces. Labels are applied by the Triage Agent and updated as work progresses.

### kind
| Label | Meaning |
|---|---|
| `kind:bug` | Broken behavior, regressions, crashes |
| `kind:feature` | New user-facing capability |
| `kind:ux` | Copy, layout, interaction, polish |
| `kind:docs` | README, guides, comments |
| `kind:housekeeping` | Refactors, cleanup, dependencies |

### state
| Label | Meaning |
|---|---|
| `state:new` | Not yet triaged |
| `state:needs-info` | Waiting for more details from reporter |
| `state:needs-repro` | Bug needs reproduction steps |
| `state:planned` | Accepted and queued for work |
| `state:in-progress` | Actively being worked on |
| `state:awaiting-human` | Needs human decision or approval |
| `state:ready-to-merge` | All checks pass, ready for merge |
| `state:done` | Completed |

### risk
| Label | Meaning |
|---|---|
| `risk:low` | Docs, scripts, isolated code — autonomous |
| `risk:medium` | Contained changes — autonomous with review |
| `risk:high` | Architecture, trust boundary — requires human |

### resolution
| Label | Meaning |
|---|---|
| `resolution:none` | Active, not yet resolved |
| `resolution:merged` | PR merged |
| `resolution:duplicate` | Duplicate of existing issue |
| `resolution:already-fixed` | Already addressed |
| `resolution:declined` | Won't fix / won't implement |
| `resolution:out-of-scope` | Outside project scope |

### release
| Label | Meaning |
|---|---|
| `release:none` | No release impact |
| `release:patch` | Patch version bump |
| `release:minor` | Minor version bump |
| `release:major` | Major version bump — requires human |

## CLI commands

```bash
# Scaffold all files into the current repo
npx repo-policy-bot init

# Create or sync labels on the current repo (requires gh CLI)
npx repo-policy-bot labels
```

`labels` is idempotent — safe to re-run. It creates missing labels and updates colors/descriptions on existing ones.

## Cost

Each AI workflow run invokes the Claude API (or uses subscription credits). Typical costs:

- **Triage Agent** — 1–5 API turns per event, ~$0.01–$0.05 per issue or PR
- **Implementation Agent** — up to 50 turns by default, cost scales with code size

To control spend, set `max_turns` in the workflow YAML and choose your model via the `model` input (e.g., `claude-haiku-4-5` for lower cost, `claude-opus-4-5` for complex reasoning).

## Security

**Privilege separation** — the Triage Agent has read-only repo permissions. It cannot push code, modify workflows, or merge PRs. Only the Implementation Agent has write access, and it operates on isolated branches.

**No Bash for triage** — the Triage Agent uses only GitHub API tools. It cannot run arbitrary shell commands.

**Action pinning** — `init` resolves the current `claude-code-action` release to a full commit SHA and pins the workflow `uses:` line to that SHA. This prevents supply-chain attacks from mutable tags.

**Adversarial defense** — both agents scan issue bodies, PR bodies, commit messages, and comments for prompt injection, social engineering, and policy-bypass language before acting. Suspicious content is escalated to `state:awaiting-human` rather than executed.
