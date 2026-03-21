import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncLabels } from "./labels.js";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import { execSync } from "node:child_process";
const mockExec = vi.mocked(execSync);

describe("syncLabels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates missing labels", () => {
    mockExec.mockReturnValueOnce(Buffer.from("[]"));
    syncLabels();
    expect(mockExec).toHaveBeenCalledTimes(27);
    expect(mockExec).toHaveBeenCalledWith(
      expect.stringContaining("gh label create"),
      expect.any(Object)
    );
  });

  it("skips existing labels and updates descriptions", () => {
    mockExec.mockReturnValueOnce(
      Buffer.from(JSON.stringify([
        { name: "kind:bug", color: "d73a4a", description: "Old description" },
        { name: "kind:feature", color: "a2eeef", description: "New user-facing capability" }
      ]))
    );
    syncLabels();
    const calls = mockExec.mock.calls.map((c) => String(c[0]));
    expect(calls.filter((c) => c.includes("gh label edit")).length).toBe(1);
    expect(calls.filter((c) => c.includes("gh label create")).length).toBe(24);
  });
});
