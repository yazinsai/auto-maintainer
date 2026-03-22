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

export function extractClaudeOAuthToken(): string | null {
  const platform = process.platform;

  if (platform === "darwin") {
    // macOS: token stored in Keychain under "Claude Code-credentials"
    try {
      const raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      const data = JSON.parse(raw);
      return data?.claudeAiOauth?.accessToken || null;
    } catch {
      return null;
    }
  }

  if (platform === "linux") {
    // Linux: token stored in ~/.claude/credentials.json or via secret-tool
    const homedir = process.env.HOME || "";
    const credPath = join(homedir, ".claude", "credentials.json");
    if (existsSync(credPath)) {
      try {
        const data = JSON.parse(readFileSync(credPath, "utf-8"));
        return data?.claudeAiOauth?.accessToken || null;
      } catch {
        return null;
      }
    }

    // Try secret-tool (GNOME Keyring)
    try {
      const raw = execSync(
        'secret-tool lookup service "Claude Code-credentials"',
        { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      ).trim();
      const data = JSON.parse(raw);
      return data?.claudeAiOauth?.accessToken || null;
    } catch {
      return null;
    }
  }

  return null;
}

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

export function isClaudeCliAvailable(): boolean {
  try {
    execSync("claude --version", { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

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

const POLICY_PROMPT_TEMPLATE = `You are a technical writer. Based on the repository context below, output a markdown document with exactly these 4 sections. Output ONLY the raw markdown — no explanation, no code fences, no preamble, no summary. Start your response with "# Product Guardrails".

# Product Guardrails
What this project values. The triage agent uses these bullet points to make judgment calls about what to accept, decline, or escalate.

# Risk Classification
## Always High Risk
List areas that should always require human review.
## Always Low Risk
List areas safe for autonomous handling.

# Decision Rules
## Bugs
How to handle bug reports.
## Features
How to handle feature requests.
## External PRs
How to handle PRs from outside contributors.

# Repo-Specific Rules
Anything unique to this project — modules to protect, naming conventions, etc.

Write specific rules based on what you see in the repository context. Every rule must be real and relevant — no placeholders.

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

    const output = execSync("claude -p --no-session-persistence", {
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
