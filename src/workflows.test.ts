import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, "../templates");

function readWorkflow(name: string) {
  const content = readFileSync(resolve(templatesDir, name), "utf-8");
  return parse(content);
}

describe("workflow templates", () => {
  it("triage-agent.yml is valid YAML with expected triggers", () => {
    const wf = readWorkflow("triage-agent.yml");
    expect(wf.name).toBeTruthy();
    expect(wf.on.issues).toBeTruthy();
    expect(wf.on.pull_request_target).toBeTruthy();
    expect(wf.on.issue_comment).toBeTruthy();
    expect(wf.on.pull_request_review).toBeTruthy();
    expect(wf.on.pull_request_review_comment).toBeTruthy();
    expect(wf.permissions.contents).toBe("read");
  });

  it("implement-agent.yml triggers only on issues labeled", () => {
    const wf = readWorkflow("implement-agent.yml");
    expect(wf.on.issues.types).toContain("labeled");
    expect(wf.on.pull_request_target).toBeUndefined();
    expect(wf.on.pull_request).toBeUndefined();
    expect(wf.permissions.contents).toBe("write");
  });

  it("gate-runner.yml has no claude-code-action step", () => {
    const wf = readWorkflow("gate-runner.yml");
    const yaml = readFileSync(resolve(templatesDir, "gate-runner.yml"), "utf-8");
    expect(yaml).not.toContain("claude-code-action");
    expect(wf.on.pull_request_target).toBeTruthy();
    expect(wf.on.check_run).toBeTruthy();
    expect(wf.on.status).toBeDefined();
    expect(wf.on.pull_request_review).toBeTruthy();
  });

  it("release-runner.yml triggers on workflow_run", () => {
    const wf = readWorkflow("release-runner.yml");
    expect(wf.on.workflow_run).toBeTruthy();
  });

  it("all AI workflows use pinned action SHA placeholder", () => {
    for (const name of ["triage-agent.yml", "implement-agent.yml"]) {
      const content = readFileSync(resolve(templatesDir, name), "utf-8");
      expect(content).toContain("{{CLAUDE_ACTION_SHA}}");
    }
  });

  it("all workflows reference canonical App secret names", () => {
    for (const name of ["triage-agent.yml", "implement-agent.yml", "gate-runner.yml", "release-runner.yml"]) {
      const content = readFileSync(resolve(templatesDir, name), "utf-8");
      expect(content).toContain("RPB_APP_ID");
      expect(content).toContain("RPB_APP_PRIVATE_KEY");
    }
  });

  it("AI workflows have system prompt placeholders", () => {
    const triage = readFileSync(resolve(templatesDir, "triage-agent.yml"), "utf-8");
    expect(triage).toContain("{{SYSTEM_PROMPT_TRIAGE}}");
    const impl = readFileSync(resolve(templatesDir, "implement-agent.yml"), "utf-8");
    expect(impl).toContain("{{SYSTEM_PROMPT_IMPLEMENT}}");
  });

  it("AI workflows support both auth methods", () => {
    for (const name of ["triage-agent.yml", "implement-agent.yml"]) {
      const content = readFileSync(resolve(templatesDir, name), "utf-8");
      expect(content).toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(content).toContain("ANTHROPIC_API_KEY");
    }
  });
});
