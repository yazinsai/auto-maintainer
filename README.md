# auto-maintainer

Your repo gets issues, PRs, and bug reports. You triage them, review code, merge the good stuff, close the noise, and cut releases. It's important work — but most of it follows rules you could write down.

**auto-maintainer** lets you write those rules down, then runs them for you. It drops four GitHub Actions workflows into your repo that handle triage, code review, bug fixes, and releases automatically — all powered by Claude.

You stay in control through a plain-English policy file that lives in your repo. The bot reads it on every run.

## How it works

```
  Issue opened          PR opened           CI passes            Merge to main
       │                    │                   │                     │
       ▼                    ▼                   ▼                     ▼
  ┌─────────┐         ┌─────────┐         ┌───────────┐       ┌─────────────┐
  │ Triage  │         │ Triage  │         │   Gate    │       │  Release    │
  │ Agent   │         │ Agent   │         │  Runner   │       │  Runner     │
  │         │         │         │         │           │       │             │
  │ Labels, │         │ Reviews │         │ Checks    │       │ Bumps       │
  │ sorts,  │         │ code,   │         │ gates,    │       │ version,    │
  │ closes  │         │ labels  │         │ merges    │       │ tags,       │
  │ dupes   │         │         │         │           │       │ releases    │
  └────┬────┘         └─────────┘         └───────────┘       └─────────────┘
       │
       ▼ (if risk:low or risk:medium)
  ┌──────────┐
  │ Implement│
  │ Agent    │
  │          │
  │ Writes   │
  │ the fix, │
  │ opens PR │
  └──────────┘
```

**Triage Agent** reads every new issue and PR. It classifies them (bug? feature? docs?), assesses risk, checks for duplicates, and decides what to do — all based on your policy file. Read-only; can't touch your code.

**Implementation Agent** picks up issues marked `state:planned` and actually writes the fix. Creates a branch, makes changes, opens a PR. Only runs on low/medium risk items. High-risk work stays for humans.

**Gate Runner** watches for PRs marked ready to merge. Checks that CI passes, no one's blocking, and all labels are in order. If everything looks good, it merges. No AI involved — pure logic.

**Release Runner** fires after merges. Looks at which PRs landed since the last tag, reads their `release:*` labels, and cuts the appropriate semver release. Also pure logic.

## Get started

Run this inside any git repo:

```bash
npx auto-maintainer init
```

The CLI will:
1. Drop four workflow files into `.github/workflows/`
2. Create a starter policy file at `.github/repo-policy.md`
3. Set up 26 labels across 5 namespaces
4. Walk you through authentication setup

Then edit `.github/repo-policy.md` to match your project, commit, push, and you're live.

### What you'll need

**A GitHub App** (or PAT) for workflow chaining — when the Triage Agent labels an issue, that label needs to trigger the Implementation Agent. GitHub blocks this with the default token, so you need an App. The CLI walks you through it.

**Claude access** — either:
- A Claude subscription (Pro, Max, or Team) via `claude setup-ci`
- An Anthropic API key

## Your policy file

This is the only file you need to write. It's plain Markdown at `.github/repo-policy.md`:

```markdown
# Product Guardrails
- Privacy by default
- Simplicity over features

# Risk Classification
## Always High Risk
- Changes to authentication
- Database migrations

## Always Low Risk
- Documentation-only changes
- Test-only changes

# Decision Rules
## Bugs
- Fix if reproducible or obvious from code
- Close as duplicate if already tracked

## Features
- Accept if it benefits most users
- Decline if complexity is disproportionate

# Repo-Specific Rules
- Treat changes to billing as risk:high
```

The agents read this on every run. Change the policy, and behavior changes on the next trigger. No workflow edits needed.

## Labels

auto-maintainer uses a fixed set of 26 labels across 5 namespaces. Every issue and PR gets exactly one label from each namespace. The Triage Agent applies and maintains them automatically.

| Namespace | Labels |
|-----------|--------|
| **kind** | `bug` `feature` `ux` `docs` `housekeeping` |
| **state** | `new` `needs-info` `needs-repro` `planned` `in-progress` `awaiting-human` `ready-to-merge` `done` |
| **risk** | `low` `medium` `high` |
| **resolution** | `none` `merged` `duplicate` `already-fixed` `declined` `out-of-scope` |
| **release** | `none` `patch` `minor` `major` |

`risk:high` and `release:major` always require human approval. Everything else can be handled autonomously.

## CLI

```bash
# Set up everything
npx auto-maintainer init

# Sync labels (safe to re-run)
npx auto-maintainer labels
```

## Cost

Each Triage Agent run costs roughly $0.01–0.05 in API credits (or uses your subscription). Implementation runs cost more since they do real work — budget accordingly for active repos. You can control costs by adjusting `--max-turns` and `--model` in the workflow files.

## Security

- **Privilege separation** — Triage Agent is read-only. It can label and comment but can't push code. Implementation Agent has write access but only triggers on trusted label events, never on raw user input.
- **No shell access for triage** — the Triage Agent can't run Bash commands. It uses only file search tools and GitHub's API.
- **Action pinning** — workflows pin `claude-code-action` to a specific commit SHA, not a mutable tag.
- **Adversarial defense** — both agents check for prompt injection and social engineering before acting. Suspicious content gets escalated to `state:awaiting-human`.

## License

MIT
