export interface RepoStats {
  owner: string;
  repo: string;
  issuesTriaged: number;
  prsOpened: number;
  prsMerged: number;
  issuesClosed: number;
  recentActivity: ActivityItem[];
  fetchedAt: number;
}

export interface ActivityItem {
  type: "issue" | "pr";
  number: number;
  title: string;
  state: string;
  labels: string[];
  updatedAt: string;
  url: string;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, RepoStats>();

// auto-maintainer labels that indicate the bot has touched an item
const AM_LABELS = [
  "kind:bug", "kind:feature", "kind:ux", "kind:docs", "kind:housekeeping",
  "state:new", "state:needs-info", "state:needs-repro", "state:planned",
  "state:in-progress", "state:awaiting-human", "state:ready-to-merge", "state:done",
  "risk:low", "risk:medium", "risk:high",
  "resolution:none", "resolution:merged", "resolution:duplicate",
  "resolution:already-fixed", "resolution:declined", "resolution:out-of-scope",
  "release:none", "release:patch", "release:minor", "release:major",
];

async function githubFetch(url: string): Promise<Response> {
  const headers: Record<string, string> = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "auto-maintainer-badge",
  };
  if (process.env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return fetch(url, { headers });
}

function hasAmLabels(labels: Array<{ name: string }>): boolean {
  return labels.some(l => AM_LABELS.includes(l.name));
}

async function fetchAllPages<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    const res = await githubFetch(`${baseUrl}${sep}per_page=${perPage}&page=${page}`);
    if (!res.ok) break;
    const data = await res.json() as T[];
    results.push(...data);
    if (data.length < perPage) break;
    page++;
  }

  return results;
}

export async function getRepoStats(owner: string, repo: string): Promise<RepoStats | null> {
  const key = `${owner}/${repo}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached;
  }

  try {
    // Verify repo exists
    const repoRes = await githubFetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (!repoRes.ok) return null;

    // Fetch issues and PRs with auto-maintainer labels
    const issues = await fetchAllPages<any>(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&labels=state:done`
    );

    const plannedIssues = await fetchAllPages<any>(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&labels=state:planned`
    );

    const inProgressIssues = await fetchAllPages<any>(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&labels=state:in-progress`
    );

    // Deduplicate by number
    const allItems = new Map<number, any>();
    for (const item of [...issues, ...plannedIssues, ...inProgressIssues]) {
      if (hasAmLabels(item.labels)) {
        allItems.set(item.number, item);
      }
    }

    const items = Array.from(allItems.values());
    const prs = items.filter((i: any) => i.pull_request);
    const issuesOnly = items.filter((i: any) => !i.pull_request);

    const prsMerged = prs.filter((p: any) =>
      p.labels.some((l: any) => l.name === "resolution:merged")
      || p.pull_request?.merged_at
    );

    const issuesClosed = issuesOnly.filter((i: any) => i.state === "closed");

    // Build recent activity (last 10, sorted by update time)
    const recentActivity: ActivityItem[] = items
      .sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 10)
      .map((item: any) => ({
        type: item.pull_request ? "pr" as const : "issue" as const,
        number: item.number,
        title: item.title,
        state: item.state,
        labels: item.labels.map((l: any) => l.name),
        updatedAt: item.updated_at,
        url: item.html_url,
      }));

    const stats: RepoStats = {
      owner,
      repo,
      issuesTriaged: issuesOnly.length,
      prsOpened: prs.length,
      prsMerged: prsMerged.length,
      issuesClosed: issuesClosed.length,
      recentActivity,
      fetchedAt: Date.now(),
    };

    cache.set(key, stats);
    return stats;
  } catch {
    return null;
  }
}
