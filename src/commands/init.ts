import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { createInterface } from "node:readline";

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

export function findRepoRoot(): string {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Not inside a git repository. Run this command from within a repo.");
    }
    dir = parent;
  }
}

export function checkGhAvailable(): string {
  try {
    const output = execSync("gh --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    const match = output.match(/gh version [\d.]+/);
    return match ? match[0] : output.trim().split("\n")[0];
  } catch {
    throw new Error("GitHub CLI (gh) not found. Install it from https://cli.github.com/");
  }
}

export function resolveClaudeActionSha(): string {
  const tag = execSync(
    "gh api repos/anthropics/claude-code-action/releases/latest --jq '.tag_name'",
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();

  const refOutput = execSync(
    `gh api repos/anthropics/claude-code-action/git/ref/tags/${tag} --jq '.object.type,.object.sha'`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  ).trim();

  const [objectType, sha] = refOutput.split("\n");

  if (objectType === "tag") {
    // Annotated tag — follow to the underlying commit
    const commitSha = execSync(
      `gh api repos/anthropics/claude-code-action/git/tags/${sha} --jq '.object.sha'`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    ).trim();
    return commitSha;
  }

  return sha;
}

export async function detectCiWorkflowName(repoRoot: string): Promise<string> {
  const workflowsDir = join(repoRoot, ".github", "workflows");
  if (!existsSync(workflowsDir)) {
    console.warn("  No .github/workflows directory found. Defaulting CI workflow name to \"CI\".");
    return "CI";
  }

  const files = readdirSync(workflowsDir).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml")
  );

  const workflows: { file: string; name: string }[] = [];
  for (const file of files) {
    const content = readFileSync(join(workflowsDir, file), "utf-8");
    const match = content.match(/^name:\s*['"]?(.+?)['"]?\s*$/m);
    if (match) {
      workflows.push({ file, name: match[1] });
    }
  }

  if (workflows.length === 0) {
    console.warn("  No named workflows found. Defaulting CI workflow name to \"CI\".");
    return "CI";
  }

  if (workflows.length === 1) {
    return workflows[0].name;
  }

  // Multiple workflows — ask the user to pick
  console.log("\nMultiple workflows detected:");
  for (let i = 0; i < workflows.length; i++) {
    console.log(`  ${i + 1}. ${workflows[i].name} (${workflows[i].file})`);
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question("Which workflow is your CI? [number]: ", (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });

  const idx = parseInt(answer, 10) - 1;
  if (idx >= 0 && idx < workflows.length) {
    return workflows[idx].name;
  }

  console.warn(`  Invalid selection "${answer}". Using first workflow.`);
  return workflows[0].name;
}
