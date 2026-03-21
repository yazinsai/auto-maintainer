export interface Label {
  name: string;
  color: string;
  description: string;
}

export const NAMESPACES = ["kind", "state", "risk", "resolution", "release"] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const LABELS: Label[] = [
  // kind
  { name: "kind:bug", color: "d73a4a", description: "Broken behavior, regressions, crashes" },
  { name: "kind:feature", color: "a2eeef", description: "New user-facing capability" },
  { name: "kind:ux", color: "7057ff", description: "Copy, layout, interaction, polish" },
  { name: "kind:docs", color: "0075ca", description: "README, guides, comments" },
  { name: "kind:housekeeping", color: "e4e669", description: "Refactors, cleanup, dependencies" },
  // state
  { name: "state:new", color: "ededed", description: "Not yet triaged" },
  { name: "state:needs-info", color: "fbca04", description: "Waiting for more details from reporter" },
  { name: "state:needs-repro", color: "fbca04", description: "Bug needs reproduction steps" },
  { name: "state:planned", color: "0e8a16", description: "Accepted and queued for work" },
  { name: "state:in-progress", color: "1d76db", description: "Actively being worked on" },
  { name: "state:awaiting-human", color: "cc317c", description: "Needs human decision or approval" },
  { name: "state:ready-to-merge", color: "0e8a16", description: "All checks pass, ready for merge" },
  { name: "state:done", color: "333333", description: "Completed" },
  // risk
  { name: "risk:low", color: "c2e0c6", description: "Docs, scripts, isolated code — autonomous" },
  { name: "risk:medium", color: "fef2c0", description: "Contained changes — autonomous with review" },
  { name: "risk:high", color: "f9d0c4", description: "Architecture, trust boundary — requires human" },
  // resolution
  { name: "resolution:none", color: "ededed", description: "Active, not yet resolved" },
  { name: "resolution:merged", color: "0e8a16", description: "PR merged" },
  { name: "resolution:duplicate", color: "cfd3d7", description: "Duplicate of existing issue" },
  { name: "resolution:already-fixed", color: "cfd3d7", description: "Already addressed" },
  { name: "resolution:declined", color: "e6e6e6", description: "Won't fix / won't implement" },
  { name: "resolution:out-of-scope", color: "e6e6e6", description: "Outside project scope" },
  // release
  { name: "release:none", color: "ededed", description: "No release impact" },
  { name: "release:patch", color: "c2e0c6", description: "Patch version bump" },
  { name: "release:minor", color: "fef2c0", description: "Minor version bump" },
  { name: "release:major", color: "f9d0c4", description: "Major version bump — requires human" },
];

export function getLabelsForNamespace(ns: Namespace): Label[] {
  return LABELS.filter((l) => l.name.startsWith(`${ns}:`));
}
