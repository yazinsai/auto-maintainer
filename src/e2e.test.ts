import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldFiles } from "./commands/init.js";
import { parse } from "yaml";

describe("e2e: full scaffold", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "rpb-e2e-"));
    mkdirSync(join(tempDir, ".git"));
  });

  it("produces a complete, valid scaffold", () => {
    const result = scaffoldFiles(tempDir, {
      claudeActionSha: "a1b2c3d4e5f6",
      ciWorkflowName: "Build and Test",
    });

    expect(result.created.length).toBe(6);
    expect(result.skipped.length).toBe(0);

    // All workflow files are valid YAML (including after prompt embedding)
    for (const wf of ["triage-agent.yml", "implement-agent.yml", "gate-runner.yml", "release-runner.yml"]) {
      const content = readFileSync(join(tempDir, ".github/workflows", wf), "utf-8");
      // Must not contain unresolved placeholders
      expect(content).not.toContain("{{CLAUDE_ACTION_SHA}}");
      expect(content).not.toContain("{{CI_WORKFLOW_NAME}}");
      expect(content).not.toContain("{{SYSTEM_PROMPT_TRIAGE}}");
      expect(content).not.toContain("{{SYSTEM_PROMPT_IMPLEMENT}}");
      // Must parse as valid YAML
      const parsed = parse(content);
      expect(parsed.name).toBeTruthy();
      expect(parsed.on).toBeTruthy();
    }

    // AI workflows have embedded system prompt content
    const triageYml = readFileSync(join(tempDir, ".github/workflows/triage-agent.yml"), "utf-8");
    expect(triageYml).toContain("adversarial");
    const implYml = readFileSync(join(tempDir, ".github/workflows/implement-agent.yml"), "utf-8");
    expect(implYml).toContain("bot/");

    // Policy file has expected sections
    const policy = readFileSync(join(tempDir, ".github/repo-policy.md"), "utf-8");
    expect(policy).toContain("Product Guardrails");
    expect(policy).toContain("Risk Classification");

    // Machine config has values
    const config = readFileSync(join(tempDir, ".github/repo-policy.yml"), "utf-8");
    const parsedConfig = parse(config);
    expect(parsedConfig.merge_strategy).toBe("squash");
    expect(parsedConfig.ci_workflow_name).toBe("Build and Test");

    // Idempotent
    const result2 = scaffoldFiles(tempDir, {
      claudeActionSha: "a1b2c3d4e5f6",
      ciWorkflowName: "Build and Test",
    });
    expect(result2.created.length).toBe(0);
    expect(result2.skipped.length).toBe(6);
  });
});
