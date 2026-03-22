# Simplify Setup Experience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npx auto-maintainer init` a one-command setup that asks 2-3 questions and handles everything — no manual GitHub App creation, no hunting for tokens.

**Architecture:** Replace the GitHub App requirement with a PAT for workflow chaining. Inline Claude auth setup into the `init` command. Auto-commit and offer to push.

**Tech Stack:** Node.js, Commander, GitHub CLI (`gh`), GitHub Actions YAML templates

---

## Summary of Changes

The current setup requires users to:
1. Run `npx auto-maintainer init`
2. Manually create a GitHub App (go to settings page, configure permissions, generate private key, install on repo)
3. Set 2 secrets (`RPB_APP_ID`, `RPB_APP_PRIVATE_KEY`)
4. Open a separate Claude Code session, run `/install-github-app` or `claude setup-token`
5. Come back and commit/push workflow files

The new setup will be:
1. Run `npx auto-maintainer init`
2. Answer: "API key or Claude subscription?" → paste key or token
3. Answer: "Paste a GitHub PAT" (with a direct link to create one with the right scopes)
4. Init sets secrets, commits, and pushes. Done.

## File Structure

**Modified files:**
- `templates/triage-agent.yml` — replace GitHub App token generation with PAT
- `templates/implement-agent.yml` — same
- `templates/gate-runner.yml` — same
- `templates/release-runner.yml` — same
- `src/index.ts` — replace print-only auth instructions with interactive prompts that set secrets, add auto-commit/push. This file contains the `init` command's action handler (lines 66-121).
- `src/commands/init.ts` — add prompt helper functions (note: `createInterface` is already imported at line 5)
- `src/workflows.test.ts` — update assertions from `RPB_APP_ID` to `AUTO_MAINTAINER_PAT`
- `src/commands/init.test.ts` — no changes needed (tests `scaffoldFiles`, not interactive flow)
- `README.md` — update setup instructions

**No new files.**

---

### Task 1: Replace GitHub App token with PAT in workflow templates

All four workflow templates currently have a `generate-token` job that uses `actions/create-github-app-token`. Replace this with direct PAT usage via `AUTO_MAINTAINER_PAT` secret.

**Files:**
- Modify: `templates/triage-agent.yml`
- Modify: `templates/implement-agent.yml`
- Modify: `templates/gate-runner.yml`
- Modify: `templates/release-runner.yml`
- Modify: `src/workflows.test.ts`

- [ ] **Step 1: Update `triage-agent.yml`**

Remove the `generate-token` job (lines 25-35). Remove `needs: generate-token` from the `triage` job. Replace `${{ needs.generate-token.outputs.token }}` with `${{ secrets.AUTO_MAINTAINER_PAT }}` in the `github_token` field (line 68).

Result:
```yaml
jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      ...
      - name: Run triage agent
        uses: "anthropics/claude-code-action@..."
        with:
          ...
          github_token: "${{ secrets.AUTO_MAINTAINER_PAT }}"
```

- [ ] **Step 2: Update `implement-agent.yml`**

Remove `generate-token` job (lines 17-30). Move the `if` condition from `generate-token` to the `implement` job. Replace two token references:
1. `github_token` in the claude-code-action step (line 61): `${{ secrets.AUTO_MAINTAINER_PAT }}`
2. `GH_TOKEN` in the "Create PR" step (line 68): `${{ secrets.AUTO_MAINTAINER_PAT }}`

```yaml
jobs:
  implement:
    if: >-
      github.event.label.name == 'state:planned'
      && !contains(toJSON(github.event.issue.labels.*.name), 'risk:high')
    runs-on: ubuntu-latest
    steps:
      ...
      - name: Run implement agent
        uses: "anthropics/claude-code-action@..."
        with:
          ...
          github_token: "${{ secrets.AUTO_MAINTAINER_PAT }}"
        env:
          ...
      - name: Create PR if commits were pushed
        env:
          GH_TOKEN: "${{ secrets.AUTO_MAINTAINER_PAT }}"
        run: |
          ...
```

- [ ] **Step 3: Update `gate-runner.yml`**

Remove `generate-token` job (lines 22-32). Remove `needs: generate-token` from `gate-check`. Replace two `GH_TOKEN` references:
1. "Determine PRs to check" step (line 44): `GH_TOKEN: "${{ secrets.AUTO_MAINTAINER_PAT }}"`
2. "Run gate checks" step (line 56): `GH_TOKEN: "${{ secrets.AUTO_MAINTAINER_PAT }}"`

- [ ] **Step 4: Update `release-runner.yml`**

Remove `generate-token` job (lines 18-29). Move the `if` condition (`github.event.workflow_run.conclusion == 'success'`) to the `release` job. Replace `GH_TOKEN` reference (line 43): `GH_TOKEN: "${{ secrets.AUTO_MAINTAINER_PAT }}"`.

- [ ] **Step 5: Update workflow tests**

In `src/workflows.test.ts`, replace the test at lines 57-63:

```typescript
it("all workflows reference PAT secret", () => {
  for (const name of ["triage-agent.yml", "implement-agent.yml", "gate-runner.yml", "release-runner.yml"]) {
    const content = readFileSync(resolve(templatesDir, name), "utf-8");
    expect(content).toContain("AUTO_MAINTAINER_PAT");
    expect(content).not.toContain("RPB_APP_ID");
    expect(content).not.toContain("RPB_APP_PRIVATE_KEY");
  }
});
```

- [ ] **Step 6: Run tests**

Run: `npm run build && npm run test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add templates/triage-agent.yml templates/implement-agent.yml templates/gate-runner.yml templates/release-runner.yml src/workflows.test.ts
git commit -m "Replace GitHub App token with PAT in all workflows"
```

---

### Task 2: Make `init` command interactive — inline auth setup

Replace the "print instructions and hope the user follows them" approach with an interactive flow that asks questions and sets secrets directly. The bulk of this work is in `src/index.ts` (the init action handler, lines 66-121) with helper functions added to `src/commands/init.ts`.

**Files:**
- Modify: `src/commands/init.ts` — add prompt helpers (note: `createInterface` already imported at line 5)
- Modify: `src/index.ts` — replace auth instruction printing with interactive flow, add auto-commit/push

- [ ] **Step 1: Add prompt helper functions to `src/commands/init.ts`**

Add and export these functions. Reuse the existing `createInterface` import (line 5). Note: readline `question()` does not mask input, which is acceptable since `gh secret set --body` is the alternative and that also shows in shell history. Users who want masking can set secrets manually.

```typescript
export async function prompt(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function promptChoice(question: string, choices: string[]): Promise<number> {
  console.log(question);
  choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  const answer = await prompt("Choice: ");
  const idx = parseInt(answer, 10) - 1;
  return idx >= 0 && idx < choices.length ? idx : 0;
}
```

Also export `prompt` and `promptChoice` so `index.ts` can import them.

- [ ] **Step 2: Replace auth sections in `src/index.ts` init action**

Import `prompt` and `promptChoice` from `./commands/init.js`. Also fix the init command description from `"Scaffold repo-policy-bot onto the current repo"` to `"Scaffold auto-maintainer onto the current repo"`.

Replace lines 67-110 (the "Workflow Chaining Setup" and "Claude Authentication" print blocks) with this interactive flow:

```typescript
// 7. Claude auth
console.log("\n--- Claude Authentication ---");
const authChoice = await promptChoice("How do you authenticate with Claude?", [
  "Anthropic API key (sk-ant-...)",
  "Claude subscription token (run `claude setup-token` first)",
]);

const secretName = authChoice === 0 ? "ANTHROPIC_API_KEY" : "CLAUDE_CODE_OAUTH_TOKEN";
const claudeToken = await prompt(`Paste your ${authChoice === 0 ? "API key" : "token"}: `);

if (claudeToken) {
  try {
    execSync(`gh secret set ${secretName} --body "${claudeToken}"`, { stdio: "pipe" });
    console.log(`  [ok] ${secretName} saved`);
  } catch {
    console.error(`  [!] Failed to set ${secretName}. Run manually: gh secret set ${secretName}`);
  }
} else {
  console.log(`  [!] Skipped. Set it later: gh secret set ${secretName}`);
}

// 8. GitHub PAT
console.log("\n--- GitHub PAT ---");
console.log("auto-maintainer needs a GitHub token to trigger workflows and merge PRs.");
console.log("Create one at: https://github.com/settings/tokens/new?scopes=repo,workflow&description=auto-maintainer");
const pat = await prompt("Paste your PAT: ");

if (pat) {
  try {
    execSync(`gh secret set AUTO_MAINTAINER_PAT --body "${pat}"`, { stdio: "pipe" });
    console.log("  [ok] AUTO_MAINTAINER_PAT saved");
  } catch {
    console.error("  [!] Failed to set PAT. Run manually: gh secret set AUTO_MAINTAINER_PAT");
  }
} else {
  console.log("  [!] Skipped. Set it later: gh secret set AUTO_MAINTAINER_PAT");
}
```

**Important:** Pass the secret value via `--body` flag to `gh secret set` to avoid interactive prompts. The value is passed in a shell command — escape or use `execSync` with `input` option to avoid shell injection. Prefer using `execSync` with `input` option:

```typescript
execSync(`gh secret set ${secretName}`, { input: claudeToken, stdio: ["pipe", "pipe", "pipe"] });
```

- [ ] **Step 3: Add auto-commit and push**

After the secrets section, replace the "Setup Summary" / "Next steps" block with:

```typescript
// 9. Commit and push
console.log("\n--- Almost done ---");
console.log("Edit .github/repo-policy.md with your project's rules, then commit and push.");
console.log("Or, to get started with the defaults:");
const commitAnswer = await prompt("Commit and push now? [Y/n]: ");

if (commitAnswer.toLowerCase() !== "n") {
  try {
    // Add only the files we scaffolded
    const allFiles = [...result.created];
    execSync(`git add ${allFiles.map(f => `"${f}"`).join(" ")}`, { cwd: repoRoot, stdio: "pipe" });
    execSync('git commit -m "Add auto-maintainer workflows"', { cwd: repoRoot, stdio: "pipe" });
    execSync("git push", { cwd: repoRoot, stdio: "pipe" });
    console.log("  [ok] Committed and pushed");
  } catch (e) {
    console.error(`  [!] Git failed: ${e instanceof Error ? e.message : e}`);
    console.log("  Commit manually: git add .github/ && git commit -m 'Add auto-maintainer' && git push");
  }
}

console.log("\nDone! Open an issue to see the triage agent in action.");
```

Note: We add only the specific files from `result.created`, not `git add .github/` broadly.

- [ ] **Step 4: Run tests**

Run: `npm run build && npm run test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts src/index.ts
git commit -m "Make init interactive: inline auth setup, auto-commit/push"
```

---

### Task 3: Update README and cleanup

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Simplify the setup section**

Replace the "Setup details" / "What you'll need" section (lines 124-143) with:

```markdown
## Setup details

### What you'll need

1. **A GitHub PAT** — the CLI gives you a direct link to create one with the right scopes.
2. **Claude access** — either an Anthropic API key or a Claude subscription token (from `claude setup-token`).

The `init` command handles everything: it asks for your credentials, sets up GitHub secrets, scaffolds workflows, commits, and pushes. You just edit your policy file.

### CLI commands

\`\`\`bash
# Full setup — walks you through everything
npx auto-maintainer init

# Re-sync labels (safe to re-run anytime)
npx auto-maintainer labels
\`\`\`
```

Remove all references to GitHub Apps, `RPB_APP_ID`, `RPB_APP_PRIVATE_KEY`, `claude setup-ci`, and the manual secret setup instructions.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README: simplified setup instructions"
```

---

### Task 4: End-to-end test on the test repo

**Files:** No code changes — verification task.

- [ ] **Step 1: Clean up test repo**

Remove the previously scaffolded workflow files from `yazinsai/auto-maintainer-test`:
```bash
cd /tmp/auto-maintainer-test
rm -f .github/workflows/triage-agent.yml .github/workflows/implement-agent.yml .github/workflows/gate-runner.yml .github/workflows/release-runner.yml .github/repo-policy.md .github/repo-policy.yml
git add -u && git commit -m "Clean up for re-test" && git push
```

- [ ] **Step 2: Run the new `init` flow**

```bash
cd /tmp/auto-maintainer-test
node /Users/rock/ai/projects/auto-maintainer/bin/cli.js init
```

Walk through the interactive prompts. Verify:
- Claude auth secret gets set (check with `gh secret list`)
- PAT secret gets set
- Files get committed and pushed

- [ ] **Step 3: Verify workflows appear on GitHub**

Check the Actions tab on the repo. All 4 workflows should be listed.

- [ ] **Step 4: Trigger triage**

Open an issue: "The divide function doesn't handle division by zero"

Verify the triage agent:
- Runs (check Actions tab)
- Labels the issue appropriately
- Adds a comment with analysis

- [ ] **Step 5: Trigger implementation**

Add `state:planned` label to the issue (or wait for triage to do it).

Verify the implement agent:
- Creates a branch
- Makes the fix
- Opens a PR

- [ ] **Step 6: Verify gate runner**

Add `state:ready-to-merge` label to the PR.

Verify:
- Gate runner checks CI status
- If CI passes, merges the PR

- [ ] **Step 7: Verify release runner**

After merge, check if a release is created (requires `release:patch` or similar label on the PR).
