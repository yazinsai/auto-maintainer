import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { syncLabels } from "./commands/labels.js";
import {
  scaffoldFiles,
  findRepoRoot,
  checkGhAvailable,
  resolveClaudeActionSha,
  detectCiWorkflowName,
  extractClaudeOAuthToken,
  generatePolicy,
} from "./commands/init.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));

const program = new Command();

program
  .name("auto-maintainer")
  .description("Scaffold an autonomous AI-powered repo maintainer")
  .version(pkg.version);

program
  .command("labels")
  .description("Sync label taxonomy to the current repo")
  .action(() => {
    p.intro(pc.bgCyan(pc.black(" auto-maintainer ")));
    const s = p.spinner();
    s.start("Syncing labels");
    const result = syncLabels((current, total) => {
      s.message(`Syncing labels (${current}/${total})`);
    });
    const parts: string[] = [];
    if (result.created > 0) parts.push(`${result.created} created`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.upToDate > 0) parts.push(`${result.upToDate} up to date`);
    s.stop(`Labels synced — ${parts.join(", ")}`);
    p.outro(pc.green("Done!"));
  });

program
  .command("init")
  .description("Scaffold auto-maintainer onto the current repo")
  .action(async () => {
    p.intro(pc.bgCyan(pc.black(` auto-maintainer v${pkg.version} `)));

    try {
      // 1. Find repo
      const repoRoot = findRepoRoot();
      const repoName = repoRoot.split("/").pop() || repoRoot;

      // 2. Check gh
      const ghVersion = checkGhAvailable();
      p.log.info(`${pc.green("Found repo:")} ${repoName}  ${pc.dim(`(${ghVersion})`)}`);

      // 3. Resolve action SHA
      const shaSpinner = p.spinner();
      shaSpinner.start("Resolving claude-code-action version");
      let actionSha: string;
      try {
        actionSha = resolveClaudeActionSha();
        shaSpinner.stop(`Pinned to ${pc.cyan(actionSha.slice(0, 12))}`);
      } catch {
        shaSpinner.error("Could not resolve SHA — using placeholder");
        actionSha = "REPLACE_WITH_SHA";
      }

      // 4. Detect CI workflow
      const ciName = await detectCiWorkflowName(repoRoot);
      if (ciName === "CI") {
        p.log.warn(
          `No CI workflow found — using placeholder.\n` +
          pc.dim("  The release runner won't trigger until you have a CI workflow.\n") +
          pc.dim("  Set ci_workflow_name in .github/repo-policy.yml when ready.")
        );
      } else {
        p.log.success(`CI workflow: ${pc.cyan(ciName)}`);
      }

      // 5. Scaffold files
      const scaffoldSpinner = p.spinner();
      scaffoldSpinner.start("Scaffolding workflow files");
      const result = scaffoldFiles(repoRoot, { claudeActionSha: actionSha, ciWorkflowName: ciName });
      scaffoldSpinner.stop("Workflows scaffolded");

      if (result.created.length > 0) {
        for (const f of result.created) {
          p.log.success(`Created ${pc.cyan(f)}`);
        }
      }
      if (result.skipped.length > 0) {
        p.log.message(pc.dim(`${result.skipped.length} file(s) already exist — skipped`));
      }

      // 6. Sync labels
      const labelSpinner = p.spinner();
      labelSpinner.start("Syncing labels");
      const labelResult = syncLabels((current, total) => {
        labelSpinner.message(`Syncing labels (${current}/${total})`);
      });
      const labelParts: string[] = [];
      if (labelResult.created > 0) labelParts.push(`${labelResult.created} created`);
      if (labelResult.updated > 0) labelParts.push(`${labelResult.updated} updated`);
      if (labelResult.upToDate > 0) labelParts.push(`${labelResult.upToDate} up to date`);
      labelSpinner.stop(`Labels synced — ${labelParts.join(", ")}`);

      // 7. Claude auth
      const authChoice = await p.select({
        message: "How do you authenticate with Claude?",
        options: [
          { value: "api_key", label: "Anthropic API key", hint: "sk-ant-..." },
          { value: "oauth", label: "Claude subscription", hint: "Pro/Max/Team — auto-detected" },
        ],
      });

      if (p.isCancel(authChoice)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      let claudeToken: string | null = null;
      let secretName: string;

      if (authChoice === "api_key") {
        secretName = "ANTHROPIC_API_KEY";
        const key = await p.password({
          message: "Paste your API key:",
        });
        if (p.isCancel(key)) {
          p.cancel("Setup cancelled.");
          process.exit(0);
        }
        claudeToken = key;
      } else {
        secretName = "CLAUDE_CODE_OAUTH_TOKEN";
        const authSpinner = p.spinner();
        authSpinner.start("Looking for Claude Code credentials");
        claudeToken = extractClaudeOAuthToken();
        if (claudeToken) {
          authSpinner.stop("Found OAuth token from local Claude Code");
        } else {
          authSpinner.error("Could not find credentials automatically");
          p.log.warn("Make sure you've signed in with `claude` at least once.");
          const manualToken = await p.password({
            message: "Or paste a token manually:",
          });
          if (p.isCancel(manualToken)) {
            p.cancel("Setup cancelled.");
            process.exit(0);
          }
          claudeToken = manualToken;
        }
      }

      if (claudeToken) {
        try {
          execSync(`gh secret set ${secretName}`, { input: claudeToken, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          p.log.success(`${pc.cyan(secretName)} saved as repo secret`);
        } catch {
          p.log.error(`Failed to set ${secretName}. Run manually: ${pc.dim(`gh secret set ${secretName}`)}`);
        }
      } else {
        p.log.warn(`Skipped. Set it later: ${pc.dim(`gh secret set ${secretName}`)}`);
      }

      // 8. GitHub PAT
      p.log.message(
        `auto-maintainer needs a GitHub token to trigger workflows and merge PRs.\n` +
        pc.dim("Create one at: https://github.com/settings/tokens/new?scopes=repo,workflow&description=auto-maintainer")
      );

      const pat = await p.password({
        message: "Paste your GitHub PAT:",
      });

      if (p.isCancel(pat)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      if (pat) {
        try {
          execSync("gh secret set AUTO_MAINTAINER_PAT", { input: pat, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
          p.log.success(`${pc.cyan("AUTO_MAINTAINER_PAT")} saved as repo secret`);
        } catch {
          p.log.error(`Failed to set PAT. Run manually: ${pc.dim("gh secret set AUTO_MAINTAINER_PAT")}`);
        }
      } else {
        p.log.warn(`Skipped. Set it later: ${pc.dim("gh secret set AUTO_MAINTAINER_PAT")}`);
      }

      // 9. Generate policy
      if (result.created.includes(".github/repo-policy.md")) {
        generatePolicy(repoRoot);
      }

      // 10. Commit and push
      const shouldCommit = await p.confirm({
        message: "Commit and push now?",
        initialValue: true,
      });

      if (p.isCancel(shouldCommit)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      if (shouldCommit) {
        const pushSpinner = p.spinner();
        pushSpinner.start("Committing and pushing");
        try {
          const allFiles = [...result.created];
          execSync(`git add ${allFiles.map(f => `"${f}"`).join(" ")}`, { cwd: repoRoot, stdio: "pipe" });
          execSync('git commit -m "Add auto-maintainer workflows"', { cwd: repoRoot, stdio: "pipe" });
          execSync("git push", { cwd: repoRoot, stdio: "pipe" });
          pushSpinner.stop("Committed and pushed");
        } catch (e) {
          pushSpinner.error("Git push failed");
          p.log.warn(`Commit manually: ${pc.dim("git add .github/ && git commit -m 'Add auto-maintainer' && git push")}`);
        }
      }

      p.log.success(pc.bold("You're all set! Open an issue to see auto-maintainer in action."));
      p.log.message("");
      p.log.message(pc.dim("  I built this because maintaining repos was eating my weekends."));
      p.log.message(pc.dim("  I hope it makes your life easier, as it did mine!"));
      p.log.message(pc.dim("                   — 𝓎𝒶𝓏𝒾𝓃"));
      p.log.message("");
      p.log.message(`  ${pc.dim("Hit a snag?")} ${pc.cyan("https://github.com/yazinsai/auto-maintainer/issues/new")}`);
      p.outro("🎉 Happy shipping!");
    } catch (err) {
      p.cancel(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program.parse();
