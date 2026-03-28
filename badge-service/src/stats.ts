import type { RepoStats, ActivityItem } from "./github.js";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function activityRow(item: ActivityItem): string {
  const icon = item.type === "pr" ? "&#9741;" : "&#9679;";
  const stateColor = item.state === "closed" ? "#a371f7" : "#3fb950";
  return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="activity-row">
    <span class="activity-icon" style="color:${stateColor}">${icon}</span>
    <span class="activity-type">${item.type === "pr" ? "PR" : "Issue"} #${item.number}</span>
    <span class="activity-title">${escapeHtml(item.title)}</span>
    <span class="activity-time">${timeAgo(item.updatedAt)}</span>
  </a>`;
}

export function generateStatsPage(stats: RepoStats): string {
  const totalActions = stats.issuesTriaged + stats.prsOpened;
  const repoUrl = `https://github.com/${stats.owner}/${stats.repo}`;

  const activitySection = stats.recentActivity.length > 0
    ? `<div class="section-title">Recent Activity</div>
    <div class="activity-list">
      ${stats.recentActivity.map(activityRow).join("\n      ")}
    </div>`
    : `<div class="activity-list">
      <div class="empty-state">No activity yet. auto-maintainer is standing by.</div>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>auto-maintainer stats for ${escapeHtml(stats.owner)}/${escapeHtml(stats.repo)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .container { max-width: 640px; margin: 0 auto; }
    .header {
      text-align: center;
      margin-bottom: 2.5rem;
    }
    .header h1 {
      font-size: 1.1rem;
      font-weight: 500;
      color: #7d8590;
      margin-bottom: 0.5rem;
    }
    .header h1 span { color: #08b9a5; font-weight: 600; }
    .repo-name {
      font-size: 1.5rem;
      font-weight: 700;
      color: #e6edf3;
    }
    .repo-name a { color: inherit; text-decoration: none; }
    .repo-name a:hover { text-decoration: underline; }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .stat-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1.25rem;
      text-align: center;
    }
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #08b9a5;
      line-height: 1;
    }
    .stat-label {
      font-size: 0.8rem;
      color: #7d8590;
      margin-top: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .section-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: #7d8590;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.75rem;
    }
    .activity-list {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      overflow: hidden;
    }
    .activity-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid #21262d;
      text-decoration: none;
      color: inherit;
      transition: background 0.15s;
    }
    .activity-row:last-child { border-bottom: none; }
    .activity-row:hover { background: #1c2128; }
    .activity-icon { font-size: 0.9rem; flex-shrink: 0; }
    .activity-type {
      font-size: 0.75rem;
      color: #7d8590;
      flex-shrink: 0;
      min-width: 4rem;
    }
    .activity-title {
      flex: 1;
      font-size: 0.85rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .activity-time {
      font-size: 0.75rem;
      color: #484f58;
      flex-shrink: 0;
    }
    .footer {
      text-align: center;
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid #21262d;
    }
    .footer a { color: #08b9a5; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
    .footer p { font-size: 0.8rem; color: #484f58; margin-top: 0.5rem; }
    .badge-embed {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 1rem;
      margin-top: 2rem;
    }
    .badge-embed .section-title { margin-bottom: 0.5rem; }
    .badge-embed code {
      display: block;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 4px;
      padding: 0.75rem;
      font-size: 0.75rem;
      color: #7d8590;
      word-break: break-all;
      white-space: pre-wrap;
    }
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #484f58;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>maintained by <span>auto-maintainer</span></h1>
      <div class="repo-name"><a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(stats.owner)}/${escapeHtml(stats.repo)}</a></div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value">${stats.issuesTriaged}</div>
        <div class="stat-label">Issues Triaged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.prsOpened}</div>
        <div class="stat-label">PRs Opened</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.prsMerged}</div>
        <div class="stat-label">PRs Merged</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${stats.issuesClosed}</div>
        <div class="stat-label">Issues Closed</div>
      </div>
    </div>

    ${activitySection}

    <div class="badge-embed">
      <div class="section-title">Add this badge to your README</div>
      <code>[![Maintained by auto-maintainer](https://am.whhite.com/badge/${escapeHtml(stats.owner)}/${escapeHtml(stats.repo)})](https://am.whhite.com/stats/${escapeHtml(stats.owner)}/${escapeHtml(stats.repo)})</code>
    </div>

    <div class="footer">
      <a href="https://github.com/yazinsai/auto-maintainer">auto-maintainer</a>
      <p>AI-powered repo maintenance. Write rules in Markdown, let AI enforce them.</p>
    </div>
  </div>
</body>
</html>`;
}

export function generateNotFoundPage(owner: string, repo: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Not Found - auto-maintainer</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      text-align: center;
    }
    h1 { font-size: 1.2rem; font-weight: 500; color: #7d8590; }
    a { color: #08b9a5; }
  </style>
</head>
<body>
  <div>
    <h1>No auto-maintainer data found for ${escapeHtml(owner)}/${escapeHtml(repo)}</h1>
    <p style="margin-top:1rem;color:#484f58">Make sure the repo is public and has <a href="https://github.com/yazinsai/auto-maintainer">auto-maintainer</a> installed.</p>
  </div>
</body>
</html>`;
}
