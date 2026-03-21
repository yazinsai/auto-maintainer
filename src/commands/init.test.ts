import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scaffoldFiles } from "./init.js";

describe("scaffoldFiles", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "rpb-test-"));
  });

  it("creates all workflow and config files", () => {
    const result = scaffoldFiles(tempDir, {
      claudeActionSha: "abc123def456",
      ciWorkflowName: "CI",
    });

    expect(result.created).toContain(".github/workflows/triage-agent.yml");
    expect(result.created).toContain(".github/workflows/implement-agent.yml");
    expect(result.created).toContain(".github/workflows/gate-runner.yml");
    expect(result.created).toContain(".github/workflows/release-runner.yml");
    expect(result.created).toContain(".github/repo-policy.md");
    expect(result.created).toContain(".github/repo-policy.yml");
    expect(result.skipped.length).toBe(0);
  });

  it("replaces template placeholders", () => {
    scaffoldFiles(tempDir, {
      claudeActionSha: "abc123def456",
      ciWorkflowName: "My CI",
    });

    const triage = readFileSync(
      join(tempDir, ".github/workflows/triage-agent.yml"),
      "utf-8"
    );
    expect(triage).toContain("abc123def456");
    expect(triage).not.toContain("{{CLAUDE_ACTION_SHA}}");

    const release = readFileSync(
      join(tempDir, ".github/workflows/release-runner.yml"),
      "utf-8"
    );
    expect(release).toContain("My CI");
    expect(release).not.toContain("{{CI_WORKFLOW_NAME}}");
  });

  it("skips existing files", () => {
    scaffoldFiles(tempDir, { claudeActionSha: "abc123", ciWorkflowName: "CI" });
    const result = scaffoldFiles(tempDir, { claudeActionSha: "abc123", ciWorkflowName: "CI" });
    expect(result.skipped.length).toBe(6);
    expect(result.created.length).toBe(0);
  });
});
