import { Command } from "commander";
import { syncLabels } from "./commands/labels.js";
import { scaffoldFiles } from "./commands/init.js";

const program = new Command();

program
  .name("repo-policy-bot")
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
    const result = scaffoldFiles(process.cwd(), {
      claudeActionSha: "TODO",
      ciWorkflowName: "CI",
    });
    for (const f of result.created) console.log(`  Created ${f}`);
    for (const f of result.skipped) console.log(`  Skipped ${f} (already exists)`);
  });

program.parse();
