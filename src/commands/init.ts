import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = resolve(__dirname, "../../templates");

interface ScaffoldOptions {
  claudeActionSha: string;
  ciWorkflowName: string;
}

interface ScaffoldResult {
  created: string[];
  skipped: string[];
}

const FILES_TO_SCAFFOLD = [
  { template: "triage-agent.yml", dest: ".github/workflows/triage-agent.yml" },
  { template: "implement-agent.yml", dest: ".github/workflows/implement-agent.yml" },
  { template: "gate-runner.yml", dest: ".github/workflows/gate-runner.yml" },
  { template: "release-runner.yml", dest: ".github/workflows/release-runner.yml" },
  { template: "repo-policy.md", dest: ".github/repo-policy.md" },
  { template: "repo-policy.yml", dest: ".github/repo-policy.yml" },
];

// embedPrompt replaces a placeholder in YAML with multi-line content,
// preserving the indentation level of the placeholder line.
function embedPrompt(yaml: string, placeholder: string, promptContent: string): string {
  const lines = yaml.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const idx = line.indexOf(placeholder);
    if (idx === -1) {
      result.push(line);
      continue;
    }
    const indent = " ".repeat(idx);
    const promptLines = promptContent.split("\n");
    result.push(line.replace(placeholder, promptLines[0]));
    for (let i = 1; i < promptLines.length; i++) {
      result.push(promptLines[i] === "" ? "" : indent + promptLines[i]);
    }
  }
  return result.join("\n");
}

export function scaffoldFiles(repoRoot: string, options: ScaffoldOptions): ScaffoldResult {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const file of FILES_TO_SCAFFOLD) {
    const destPath = join(repoRoot, file.dest);
    if (existsSync(destPath)) {
      skipped.push(file.dest);
      continue;
    }

    mkdirSync(dirname(destPath), { recursive: true });
    let content = readFileSync(join(TEMPLATES_DIR, file.template), "utf-8");
    content = content.replace(/\{\{CLAUDE_ACTION_SHA\}\}/g, options.claudeActionSha);
    content = content.replace(/\{\{CI_WORKFLOW_NAME\}\}/g, options.ciWorkflowName);

    if (file.template === "triage-agent.yml") {
      const prompt = readFileSync(join(TEMPLATES_DIR, "system-prompt-triage.md"), "utf-8");
      content = embedPrompt(content, "{{SYSTEM_PROMPT_TRIAGE}}", prompt);
    }
    if (file.template === "implement-agent.yml") {
      const prompt = readFileSync(join(TEMPLATES_DIR, "system-prompt-implement.md"), "utf-8");
      content = embedPrompt(content, "{{SYSTEM_PROMPT_IMPLEMENT}}", prompt);
    }
    writeFileSync(destPath, content);
    created.push(file.dest);
  }

  return { created, skipped };
}
