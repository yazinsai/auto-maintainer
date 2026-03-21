import { Command } from "commander";
import { syncLabels } from "./commands/labels.js";

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

program.parse();
