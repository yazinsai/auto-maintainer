import { execSync } from "node:child_process";
import { LABELS } from "../labels.js";

interface ExistingLabel {
  name: string;
  color: string;
  description: string;
}

export interface LabelSyncResult {
  created: number;
  updated: number;
  upToDate: number;
}

function getExistingLabels(): ExistingLabel[] {
  try {
    const output = execSync("gh label list --limit 200 --json name,color,description", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return JSON.parse(output || "[]");
  } catch {
    return [];
  }
}

export function syncLabels(): LabelSyncResult {
  const existing = getExistingLabels();
  const existingMap = new Map(existing.map((l) => [l.name, l]));
  const result: LabelSyncResult = { created: 0, updated: 0, upToDate: 0 };

  for (const label of LABELS) {
    const ex = existingMap.get(label.name);
    if (!ex) {
      execSync(
        `gh label create "${label.name}" --color "${label.color}" --description "${label.description}"`,
        { stdio: "pipe" }
      );
      result.created++;
    } else if (ex.description !== label.description || ex.color !== label.color) {
      execSync(
        `gh label edit "${label.name}" --color "${label.color}" --description "${label.description}"`,
        { stdio: "pipe" }
      );
      result.updated++;
    } else {
      result.upToDate++;
    }
  }

  return result;
}
