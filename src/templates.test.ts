import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(__dirname, "../templates");

describe("system prompt templates", () => {
  it("triage prompt contains required sections", () => {
    const content = readFileSync(resolve(templatesDir, "system-prompt-triage.md"), "utf-8");
    expect(content).toContain("state:new");
    expect(content).toContain("state:done");
    expect(content).toContain("risk:high");
    expect(content).toContain("rpb-last-action");
    expect(content).toContain("last-reviewed");
    expect(content).toContain("adversarial");
    expect(content).toContain("fork");
    expect(content).toContain("repo-policy.md");
  });

  it("implement prompt contains required sections", () => {
    const content = readFileSync(resolve(templatesDir, "system-prompt-implement.md"), "utf-8");
    expect(content).toContain("bot/");
    expect(content).toContain("state:in-progress");
    expect(content).toContain("Fixes #");
    expect(content).toContain("rpb-last-action");
    expect(content).toContain("adversarial");
  });
});
