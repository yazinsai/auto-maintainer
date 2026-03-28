import express from "express";
import { getRepoStats } from "./github.js";
import { generateBadge, generateErrorBadge } from "./badge.js";
import { generateStatsPage, generateNotFoundPage } from "./stats.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Validate owner/repo params (alphanumeric, hyphens, underscores, dots)
function isValidParam(s: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(s) && s.length <= 100;
}

app.get("/badge/:owner/:repo", async (req, res) => {
  const { owner, repo } = req.params;

  if (!isValidParam(owner) || !isValidParam(repo)) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "no-cache");
    res.send(generateErrorBadge("invalid repo"));
    return;
  }

  const stats = await getRepoStats(owner, repo);

  if (!stats) {
    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "max-age=300");
    res.send(generateErrorBadge("not found"));
    return;
  }

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "max-age=300, s-maxage=300");
  res.send(generateBadge(stats.prsOpened, stats.issuesTriaged));
});

app.get("/stats/:owner/:repo", async (req, res) => {
  const { owner, repo } = req.params;

  if (!isValidParam(owner) || !isValidParam(repo)) {
    res.status(400).send("Invalid repository");
    return;
  }

  const stats = await getRepoStats(owner, repo);

  if (!stats) {
    res.status(404).send(generateNotFoundPage(owner, repo));
    return;
  }

  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "max-age=300");
  res.send(generateStatsPage(stats));
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Root redirect to auto-maintainer repo
app.get("/", (_req, res) => {
  res.redirect("https://github.com/yazinsai/auto-maintainer");
});

app.listen(PORT, () => {
  console.log(`Badge service listening on port ${PORT}`);
});
