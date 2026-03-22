import { execSync } from "node:child_process";
import { Command } from "commander";
import { syncLabels } from "./commands/labels.js";
import {
  scaffoldFiles,
  findRepoRoot,
  checkGhAvailable,
  resolveClaudeActionSha,
  detectCiWorkflowName,
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
  .description("Scaffold repo-policy-bot onto the current repo")
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

      // 7. Workflow chaining auth
      console.log("\n--- Workflow Chaining Setup ---");
      console.log("Workflows need a GitHub App or PAT to trigger each other.");
      console.log("Option 1 (recommended): Create a GitHub App");
      console.log("  -> https://github.com/settings/apps/new");
      console.log("  -> Permissions: Issues (R/W), Pull Requests (R/W), Contents (R/W)");
      console.log("  -> After creating, run:");
      console.log("    gh secret set RPB_APP_ID");
      console.log("    gh secret set RPB_APP_PRIVATE_KEY");
      console.log("Option 2: Use a Personal Access Token");
      console.log("  -> Create a fine-grained PAT with issues, pull_requests, contents write access");
      console.log("  -> Run: gh secret set RPB_PAT");

      // Check if secrets exist
      try {
        const secrets = execSync("gh secret list", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        const hasApp = secrets.includes("RPB_APP_ID") && secrets.includes("RPB_APP_PRIVATE_KEY");
        const hasPat = secrets.includes("RPB_PAT");
        if (hasApp) console.log("  [ok] GitHub App credentials found");
        else if (hasPat) console.log("  [ok] PAT found");
        else console.log("  [!] No workflow chaining credentials found yet");
      } catch {
        console.log("  [!] Could not check secrets (not authenticated with gh?)");
      }

      // 8. Claude auth
      console.log("\n--- Claude Authentication ---");
      console.log("Option 1: Claude subscription (Pro/Max/Team)");
      console.log("  -> Run: claude setup-ci");
      console.log("  -> This stores CLAUDE_CODE_OAUTH_TOKEN as a repo secret");
      console.log("Option 2: Anthropic API key");
      console.log("  -> Run: gh secret set ANTHROPIC_API_KEY");

      // Check
      try {
        const secrets = execSync("gh secret list", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
        const hasOauth = secrets.includes("CLAUDE_CODE_OAUTH_TOKEN");
        const hasApiKey = secrets.includes("ANTHROPIC_API_KEY");
        if (hasOauth) console.log("  [ok] Claude OAuth token found");
        else if (hasApiKey) console.log("  [ok] Anthropic API key found");
        else console.log("  [!] No Claude credentials found yet");
      } catch {
        // already warned above
      }

      // 9. Summary
      console.log("\n--- Setup Summary ---");
      console.log(`Files scaffolded: ${result.created.length} created, ${result.skipped.length} skipped`);
      console.log("Labels: synced");
      console.log("\nNext steps:");
      console.log("1. Set up workflow chaining auth (GitHub App or PAT)");
      console.log("2. Set up Claude auth (subscription or API key)");
      console.log("3. Edit .github/repo-policy.md with your project's guidelines");
      console.log("4. Commit and push the workflow files");
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program.parse();
