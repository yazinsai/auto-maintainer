import { execSync } from "node:child_process";
import { Command } from "commander";
import { syncLabels } from "./commands/labels.js";
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

const program = new Command();

program
  .name("auto-maintainer")
  .description("Scaffold an autonomous AI-powered repo maintainer")
  .version("0.1.0");

program
  .command("labels")
  .description("Sync label taxonomy to the current repo")
  .action(() => {
    console.log("Syncing labels...");
    syncLabels();
    console.log("Done.");
  });

program
  .command("init")
  .description("Scaffold auto-maintainer onto the current repo")
  .action(async () => {
    try {
      // 1. Find repo
      const repoRoot = findRepoRoot();
      console.log(`Found repo at ${repoRoot}`);

      // 2. Check gh
      const ghVersion = checkGhAvailable();
      console.log(`GitHub CLI: ${ghVersion}`);

      // 3. Resolve action SHA
      console.log("Resolving claude-code-action version...");
      let actionSha: string;
      try {
        actionSha = resolveClaudeActionSha();
        console.log(`Pinned to ${actionSha.slice(0, 12)}`);
      } catch {
        console.warn("Could not resolve claude-code-action SHA. Using placeholder.");
        actionSha = "REPLACE_WITH_SHA";
      }

      // 4. Detect CI workflow
      const ciName = await detectCiWorkflowName(repoRoot);
      console.log(`CI workflow: ${ciName}`);

      // 5. Scaffold files
      console.log("\nScaffolding files...");
      const result = scaffoldFiles(repoRoot, { claudeActionSha: actionSha, ciWorkflowName: ciName });
      for (const f of result.created) console.log(`  Created ${f}`);
      for (const f of result.skipped) console.log(`  Skipped ${f} (already exists)`);

      // 6. Sync labels
      console.log("\nSyncing labels...");
      syncLabels();

      // 7. Claude auth
      console.log("\n--- Claude Authentication ---");
      const authChoice = await promptChoice("How do you authenticate with Claude?", [
        "Anthropic API key (sk-ant-...)",
        "Claude subscription (Pro/Max/Team — auto-detected from local Claude Code)",
      ]);

      let claudeToken: string | null = null;
      let secretName: string;

      if (authChoice === 0) {
        secretName = "ANTHROPIC_API_KEY";
        claudeToken = await prompt("Paste your API key: ");
      } else {
        secretName = "CLAUDE_CODE_OAUTH_TOKEN";
        console.log("  Looking for Claude Code credentials...");
        claudeToken = extractClaudeOAuthToken();
        if (claudeToken) {
          console.log("  [ok] Found OAuth token from local Claude Code installation");
        } else {
          console.log("  [!] Could not find credentials automatically.");
          console.log("      Make sure you've signed in with `claude` at least once.");
          claudeToken = await prompt("  Or paste a token manually: ");
        }
      }

      if (claudeToken) {
        try {
          execSync(`gh secret set ${secretName}`, { input: claudeToken, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
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
          execSync(`gh secret set AUTO_MAINTAINER_PAT`, { input: pat, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          console.log("  [ok] AUTO_MAINTAINER_PAT saved");
        } catch {
          console.error("  [!] Failed to set PAT. Run manually: gh secret set AUTO_MAINTAINER_PAT");
        }
      } else {
        console.log("  [!] Skipped. Set it later: gh secret set AUTO_MAINTAINER_PAT");
      }

      // 9. Generate policy
      if (result.created.includes(".github/repo-policy.md")) {
        generatePolicy(repoRoot);
      }

      // 10. Commit and push
      console.log("\n--- Almost done ---");
      const commitAnswer = await prompt("Commit and push now? [Y/n]: ");

      if (commitAnswer.toLowerCase() !== "n") {
        try {
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
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program.parse();
