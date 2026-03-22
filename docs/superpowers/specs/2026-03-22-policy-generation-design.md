# Policy Generation During Init — Design Spec

## Goal

Auto-generate a project-specific `.github/repo-policy.md` during `npx auto-maintainer init` so users get meaningful rules out of the box instead of a placeholder template.

## When It Runs

After scaffolding files, syncing labels, and setting up Claude auth — but before the commit/push step. Only runs when the policy file was freshly created in this init run — checked via `result.created.includes(".github/repo-policy.md")` (exact string match, not partial). Never overwrites an existing policy.

Note: `repo-policy.yml` (the machine-readable merge strategy config) is out of scope for generation. It contains CI workflow name and merge method — not policy rules. The generator only touches `repo-policy.md`.

## Two Paths

### Path A: Claude Code is installed

1. Gather repo context programmatically (no tool access for Claude):
   - File tree (`find . -type f | head -200`, excluding node_modules, .git, etc.)
   - README.md content (if exists, first 500 lines)
   - package.json content (if exists)
   - CI workflow files (if exist)
   - Source file extensions and counts
2. Build a prompt that includes:
   - The gathered context
   - The 4-section template structure with descriptions of what each section means
   - Instructions to write specific, project-relevant rules — not generic placeholders
3. Run `claude -p "<prompt>"` with no `--allowedTools` (pure text in, text out), with a 60-second timeout
4. Validate the output contains all 4 section headings:
   - `# Product Guardrails`
   - `# Risk Classification`
   - `# Decision Rules`
   - `# Repo-Specific Rules`
5. If valid: overwrite `.github/repo-policy.md` with the generated content
6. If invalid or any error: keep the scaffolded template, print a warning
7. Print: `[ok] Generated project-specific policy from repo analysis`

### Path B: Claude Code is not installed

1. Print a ready-to-paste prompt to the terminal:
   ```
   --- Policy Generation ---
   To generate project-specific rules, paste this prompt into your
   favorite AI coding tool (Claude Code, Cursor, Codex, etc.):

   ┌─────────────────────────────────────────────────────────────┐
   │ Analyze this repository and generate a .github/repo-policy.md
   │ file with these sections:
   │
   │ # Product Guardrails
   │ What this project values. Used for judgment calls.
   │
   │ # Risk Classification
   │ ## Always High Risk
   │ (list areas that should always require human review)
   │ ## Always Low Risk
   │ (list areas safe for autonomous handling)
   │
   │ # Decision Rules
   │ ## Bugs
   │ ## Features
   │ ## External PRs
   │
   │ # Repo-Specific Rules
   │ Anything unique to this project.
   │
   │ Read the codebase and write specific rules, not placeholders.
   └─────────────────────────────────────────────────────────────┘

   Then replace .github/repo-policy.md with the output.
   ```
2. Keep the scaffolded template as-is

## Detecting Claude Code Availability

```typescript
function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}
```

## Context Gathering

Build context as a string, not by giving Claude tool access. This avoids security concerns about free repo read access and keeps the call simple (text in, text out).

```typescript
function gatherRepoContext(repoRoot: string): string {
  const parts: string[] = [];

  // File tree (excluding common noise)
  try {
    const tree = execSync(
      'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.next/*" | head -200',
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    parts.push("## File tree\n" + tree);
  } catch { /* skip */ }

  // README
  const readmePath = join(repoRoot, "README.md");
  if (existsSync(readmePath)) {
    const content = readFileSync(readmePath, "utf-8").split("\n").slice(0, 500).join("\n");
    parts.push("## README.md\n" + content);
  }

  // package.json
  const pkgPath = join(repoRoot, "package.json");
  if (existsSync(pkgPath)) {
    parts.push("## package.json\n" + readFileSync(pkgPath, "utf-8"));
  }

  // CI workflows
  const workflowsDir = join(repoRoot, ".github", "workflows");
  if (existsSync(workflowsDir)) {
    const files = readdirSync(workflowsDir).filter(f => f.endsWith(".yml") || f.endsWith(".yaml"));
    for (const file of files) {
      // Skip auto-maintainer workflows
      if (["triage-agent.yml", "implement-agent.yml", "gate-runner.yml", "release-runner.yml"].includes(file)) continue;
      const content = readFileSync(join(workflowsDir, file), "utf-8");
      parts.push(`## .github/workflows/${file}\n` + content);
    }
  }

  return parts.join("\n\n");
}
```

## The Prompt

```
Analyze this repository and generate a .github/repo-policy.md file.

The policy file must have exactly these 4 top-level sections:

# Product Guardrails
What this project values. The triage agent uses these to make judgment calls about what to accept, decline, or escalate.

# Risk Classification
## Always High Risk
Areas that should always require human review.
## Always Low Risk
Areas safe for autonomous handling.

# Decision Rules
## Bugs
How to handle bug reports.
## Features
How to handle feature requests.
## External PRs
How to handle PRs from outside contributors.

# Repo-Specific Rules
Anything unique to this project — modules to protect, naming conventions, etc.

Write specific rules based on what you see in the codebase. Do not use placeholder text like "Example:" — every rule should be real and relevant to this project.

--- REPOSITORY CONTEXT ---
{context}
```

## Validation

Check that the output contains all 4 required headings. If any are missing, discard and keep the template.

```typescript
const REQUIRED_HEADINGS = [
  "# Product Guardrails",
  "# Risk Classification",
  "# Decision Rules",
  "# Repo-Specific Rules",
];

function validatePolicy(content: string): boolean {
  return REQUIRED_HEADINGS.every(h => content.includes(h));
}
```

## Error Handling

Any failure during policy generation (claude not authenticated, timeout, invalid output, any exception) silently falls back to keeping the scaffolded template. The init flow continues normally. A brief message is printed:

```
  [!] Could not auto-generate policy (kept template). Edit .github/repo-policy.md manually.
```

## Flow Position in Init

```
1. Find repo
2. Check gh
3. Resolve action SHA
4. Detect CI workflow
5. Scaffold files
6. Sync labels
7. Claude auth
8. GitHub PAT
9. [NEW] Generate policy (if repo-policy.md was just created)
10. Commit and push
```

Generation happens after auth so we know the user has a working Claude setup (Path A) or doesn't (Path B). It happens before commit/push so the generated policy gets included.

## Files Modified

- `src/commands/init.ts` — add `isClaudeCliAvailable()`, `gatherRepoContext()`, `generatePolicy()`, `validatePolicy()`
- `src/index.ts` — add policy generation step between PAT setup and commit/push
- No template changes needed
- No test changes needed (existing tests use `scaffoldFiles` directly, not the interactive flow)

## What This Does NOT Do

- Does not add a separate `policy` command (YAGNI — can add later if needed)
- Does not add a review/approval step (policy is in git, easy to edit)
- Does not give Claude tool access (context is gathered programmatically)
- Does not overwrite existing policies on re-runs
- Does not touch the implement agent's prompt (separate scope)
