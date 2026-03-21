import { Command } from "commander";

const program = new Command();

program
  .name("repo-policy-bot")
  .description("Scaffold an autonomous AI-powered repo maintainer")
  .version("0.1.0");

program.parse();
