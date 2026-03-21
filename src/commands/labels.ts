import { execSync } from "node:child_process";
import { LABELS } from "../labels.js";

interface ExistingLabel {
  name: string;
  color: string;
  description: string;
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

export function syncLabels(): void {
  const existing = getExistingLabels();
  const existingMap = new Map(existing.map((l) => [l.name, l]));

  for (const label of LABELS) {
    const ex = existingMap.get(label.name);
    if (!ex) {
      console.log(`  Creating ${label.name}`);
      execSync(
        `gh label create "${label.name}" --color "${label.color}" --description "${label.description}"`,
        { stdio: "pipe" }
      );
    } else if (ex.description !== label.description || ex.color !== label.color) {
      console.log(`  Updating ${label.name}`);
      execSync(
        `gh label edit "${label.name}" --color "${label.color}" --description "${label.description}"`,
        { stdio: "pipe" }
      );
    } else {
      console.log(`  Skipping ${label.name} (up to date)`);
    }
  }
}
