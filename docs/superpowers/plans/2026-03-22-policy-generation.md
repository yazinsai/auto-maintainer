# Policy Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate a project-specific `.github/repo-policy.md` during init by analyzing the repo with Claude Code, or printing a ready-to-paste prompt as fallback.

**Architecture:** Add 4 helper functions to `src/commands/init.ts` (detect CLI, gather context, build prompt, validate output). Add orchestration step to `src/index.ts` between PAT setup and commit/push.

**Tech Stack:** Node.js, `execSync` to shell out to `claude -p`, filesystem APIs for context gathering

---

## File Structure

**Modified files:**
- `src/commands/init.ts` — add `isClaudeCliAvailable()`, `gatherRepoContext()`, `buildPolicyPrompt()`, `validatePolicy()`, and `generatePolicy()` (orchestrator). All exported.
- `src/index.ts` — add policy generation step (step 9) between PAT setup and commit/push. Import `generatePolicy`.

**No new files.**

---

### Task 1: Add helper functions to init.ts

**Files:**
- Modify: `src/commands/init.ts` (add after `promptChoice` at line 143, before `findRepoRoot` at line 145)

- [ ] **Step 1: Add `isClaudeCliAvailable()`**

Add this exported function:

```typescript
export function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Add `gatherRepoContext()`**

Add this exported function. It builds a text summary of the repo for the prompt. Uses `find` for file tree (already established pattern in this codebase — `execSync` is used throughout). Reads README, package.json, and user CI workflows. Skips auto-maintainer workflow files.

```typescript
export function gatherRepoContext(repoRoot: string): string {
  const parts: string[] = [];

  // File tree (excluding common noise)
  try {
    const tree = execSync(
      'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" -not -path "*/.next/*" -not -path "*/vendor/*" -not -path "*/__pycache__/*" | sort | head -200',
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    parts.push("## File tree\n" + tree);
  } catch { /* skip */ }

  // File type summary (extensions and counts)
  try {
    const types = execSync(
      'find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/dist/*" | sed \'s/.*\\.//\' | sort | uniq -c | sort -rn | head -20',
      { cwd: repoRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    parts.push("## File types\n" + types);
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

  // CI workflows (skip auto-maintainer ones)
  const workflowsDir = join(repoRoot, ".github", "workflows");
  if (existsSync(workflowsDir)) {
    const skipFiles = ["triage-agent.yml", "implement-agent.yml", "gate-runner.yml", "release-runner.yml"];
    const files = readdirSync(workflowsDir).filter(f =>
      (f.endsWith(".yml") || f.endsWith(".yaml")) && !skipFiles.includes(f)
    );
    for (const file of files) {
      const content = readFileSync(join(workflowsDir, file), "utf-8");
      parts.push(`## .github/workflows/${file}\n` + content);
    }
  }

  return parts.join("\n\n");
}
```

- [ ] **Step 3: Add the prompt constant and `validatePolicy()`**

```typescript
const POLICY_PROMPT_TEMPLATE = `Analyze this repository and generate a .github/repo-policy.md file.

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
Output ONLY the markdown content, no code fences or preamble.

--- REPOSITORY CONTEXT ---
`;

const REQUIRED_HEADINGS = [
  "# Product Guardrails",
  "# Risk Classification",
  "# Decision Rules",
  "# Repo-Specific Rules",
];

export function validatePolicy(content: string): boolean {
  return REQUIRED_HEADINGS.every(h => content.includes(h));
}
```

- [ ] **Step 4: Add `generatePolicy()` orchestrator**

This is the main function called from `index.ts`. It handles both paths (Claude available vs. not).

```typescript
export function generatePolicy(repoRoot: string): boolean {
  console.log("\n--- Policy Generation ---");

  if (!isClaudeCliAvailable()) {
    // Path B: print prompt for user to paste elsewhere
    console.log("  Claude Code CLI not found. To generate project-specific rules,");
    console.log("  paste this prompt into your favorite AI coding tool:\n");
    console.log("  -------------------------------------------------------");
    console.log("  Analyze this repository and generate a .github/repo-policy.md");
    console.log("  file with these sections:");
    console.log("");
    console.log("  # Product Guardrails");
    console.log("  What this project values. Used for judgment calls.");
    console.log("");
    console.log("  # Risk Classification");
    console.log("  ## Always High Risk");
    console.log("  (list areas that should always require human review)");
    console.log("  ## Always Low Risk");
    console.log("  (list areas safe for autonomous handling)");
    console.log("");
    console.log("  # Decision Rules");
    console.log("  ## Bugs / ## Features / ## External PRs");
    console.log("");
    console.log("  # Repo-Specific Rules");
    console.log("  Anything unique to this project.");
    console.log("");
    console.log("  Read the codebase and write specific rules, not placeholders.");
    console.log("  -------------------------------------------------------");
    console.log("\n  Then replace .github/repo-policy.md with the output.");
    return false;
  }

  // Path A: auto-generate with Claude
  console.log("  Analyzing repo to generate project-specific rules...");
  try {
    const context = gatherRepoContext(repoRoot);
    const fullPrompt = POLICY_PROMPT_TEMPLATE + context;

    const output = execSync(`claude -p --no-session-persistence`, {
      input: fullPrompt,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
      cwd: repoRoot,
    }).trim();

    if (!validatePolicy(output)) {
      console.log("  [!] Generated policy missing required sections (kept template)");
      return false;
    }

    // Strip any markdown code fences Claude might wrap the output in
    let policy = output;
    if (policy.startsWith("```")) {
      policy = policy.replace(/^```\w*\n/, "").replace(/\n```$/, "");
    }

    writeFileSync(join(repoRoot, ".github", "repo-policy.md"), policy);
    console.log("  [ok] Generated project-specific policy from repo analysis");
    return true;
  } catch {
    console.log("  [!] Could not auto-generate policy (kept template). Edit .github/repo-policy.md manually.");
    return false;
  }
}
```

- [ ] **Step 5: Build and run tests**

Run: `npm run build && npm run test`
Expected: All tests pass. (Existing tests don't call `generatePolicy`, so nothing breaks.)

- [ ] **Step 6: Commit**

```bash
git add src/commands/init.ts
git commit -m "Add policy generation helpers: detect CLI, gather context, generate, validate"
```

---

### Task 2: Wire policy generation into init flow

**Files:**
- Modify: `src/index.ts:4-13` (add import) and `src/index.ts:122-142` (add step 9)

- [ ] **Step 1: Add import**

Add `generatePolicy` to the import from `./commands/init.js`:

```typescript
import {
  scaffoldFiles,
  findRepoRoot,
  checkGhAvailable,
  resolveClaudeActionSha,
  detectCiWorkflowName,
  extractClaudeOAuthToken,
  generatePolicy,
  prompt,
  promptChoice,
} from "./commands/init.js";
```

- [ ] **Step 2: Add policy generation step**

In `src/index.ts`, insert the policy generation call between the PAT section (ends at line 121) and the commit/push section (starts at line 123). Replace the current step 9 comment block:

Replace this:
```typescript
      // 9. Commit and push
      console.log("\n--- Almost done ---");
      console.log("Edit .github/repo-policy.md with your project's rules, then commit and push.");
      console.log("Or, to get started with the defaults:");
```

With this:
```typescript
      // 9. Generate policy
      if (result.created.includes(".github/repo-policy.md")) {
        generatePolicy(repoRoot);
      }

      // 10. Commit and push
      console.log("\n--- Almost done ---");
```

Remove the old "Edit .github/repo-policy.md" line and "Or, to get started with the defaults:" line since the policy is now auto-generated.

- [ ] **Step 3: Build and run tests**

Run: `npm run build && npm run test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "Wire policy generation into init flow (step 9)"
```

---

### Task 3: End-to-end test

**Files:** No code changes — manual verification.

- [ ] **Step 1: Test Path A (Claude available)**

```bash
cd /private/tmp/auto-maintainer-test
rm .github/repo-policy.md
node /Users/rock/ai/projects/auto-maintainer/bin/cli.js init
```

When prompted for auth, pick option 2 (subscription). Skip the PAT. Say no to commit.

Verify:
- "Analyzing repo to generate project-specific rules..." appears
- "[ok] Generated project-specific policy from repo analysis" appears
- `.github/repo-policy.md` contains project-specific rules (not the template placeholders)
- All 4 required headings are present

- [ ] **Step 2: Test Path B (Claude not available)**

Temporarily rename the claude binary or test in an environment without it:

```bash
PATH=/usr/bin:/bin node /Users/rock/ai/projects/auto-maintainer/bin/cli.js init
```

Verify:
- The fallback prompt is printed with the 4-section template
- ".github/repo-policy.md" keeps the scaffolded template

- [ ] **Step 3: Test idempotency (existing policy not overwritten)**

```bash
# repo-policy.md already exists from step 1
node /Users/rock/ai/projects/auto-maintainer/bin/cli.js init
```

Verify:
- "Skipped .github/repo-policy.md (already exists)" appears
- No "Policy Generation" section appears
- The existing policy file is unchanged
