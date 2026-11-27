// GitHub: link an engagement to its repository so clients see real progress (commits, pull
// requests, releases) in the portal. Uses a fine-grained token with read-only access.
import { getJson } from './http.js';

export const githubConfigured = () => Boolean(process.env.GITHUB_TOKEN);
export const repoOk = (r) => /^[\w.-]+\/[\w.-]+$/.test(String(r || ''));
const gh = (path) => getJson(`https://api.github.com${path}`, { label: 'GitHub',
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'hipcastle-agency' } });

export async function repoActivity(repo) {
  if (!githubConfigured()) throw Object.assign(new Error('Add GITHUB_TOKEN to read repositories.'), { status: 400 });
  if (!repoOk(repo)) throw Object.assign(new Error('Use owner/name for the repository'), { status: 400 });
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [info, commits, pulls, releases] = await Promise.all([
    gh(`/repos/${repo}`), gh(`/repos/${repo}/commits?since=${since}&per_page=100`), gh(`/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=10`), gh(`/repos/${repo}/releases?per_page=5`),
  ]);
  return {
    repo, default_branch: info.default_branch, pushed_at: info.pushed_at, private: info.private,
    commits_30d: commits.length,
    recent_commits: commits.slice(0, 8).map((c) => ({ sha: c.sha.slice(0, 7), message: String(c.commit?.message || '').split('\n')[0].slice(0, 120), author: c.commit?.author?.name, date: c.commit?.author?.date })),
    pull_requests: pulls.map((p) => ({ number: p.number, title: p.title.slice(0, 120), state: p.merged_at ? 'merged' : p.state, updated_at: p.updated_at })),
    releases: releases.map((r) => ({ name: r.name || r.tag_name, tag: r.tag_name, published_at: r.published_at })),
  };
}
