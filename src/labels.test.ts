import { describe, it, expect } from "vitest";
import { LABELS, NAMESPACES, getLabelsForNamespace } from "./labels.js";

describe("label taxonomy", () => {
  it("defines 5 namespaces", () => {
    expect(NAMESPACES).toEqual(["kind", "state", "risk", "resolution", "release"]);
  });

  it("has labels for every namespace", () => {
    for (const ns of NAMESPACES) {
      const labels = getLabelsForNamespace(ns);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label.name).toMatch(new RegExp(`^${ns}:`));
        expect(label.color).toMatch(/^[0-9a-fA-F]{6}$/);
        expect(label.description).toBeTruthy();
      }
    }
  });

  it("has 26 labels total", () => {
    expect(LABELS.length).toBe(26);
  });

  it("has unique names", () => {
    const names = LABELS.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
