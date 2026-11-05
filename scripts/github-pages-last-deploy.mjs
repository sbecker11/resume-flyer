#!/usr/bin/env node
/**
 * Report the last date/time the GitHub Pages site was successfully updated.
 *
 * Walks the repo's most recent deployments to the "github-pages" environment
 * (newest first) via the GitHub REST API and reports the first one that reached
 * a "success" status — i.e. the last time the site actually went live. This is
 * the same Deployments API GitHub Actions' `deploy-pages` action writes to, so
 * it reflects reality even if a later deployment is still in progress or failed.
 *
 * Usage:
 *   node scripts/github-pages-last-deploy.mjs
 *   node scripts/github-pages-last-deploy.mjs --repo owner/name
 *   node scripts/github-pages-last-deploy.mjs --tz America/Denver
 *   node scripts/github-pages-last-deploy.mjs --json
 *
 *   npm run pages:last-deploy
 *
 * Defaults to this repo's "origin" remote. Public repos need no token; set
 * GITHUB_TOKEN or GH_TOKEN for private repos or to avoid the unauthenticated
 * rate limit (60 requests/hour).
 *
 * Exit codes: 0 found a successful deployment · 1 none found / API error · 2 usage error
 */
import path from 'path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'url';
import { reportError } from '../modules/utils/errorReporting.mjs';

const GITHUB_API = 'https://api.github.com';
const DEFAULT_ENVIRONMENT = 'github-pages';
const DEFAULT_LIMIT = 10;

const USAGE = 'Usage: node scripts/github-pages-last-deploy.mjs [--repo owner/name] [--tz IANA/Zone] [--limit N] [--json]';

/**
 * @param {string[]} argv
 * @returns {{ repo: string|null, tz: string|null, limit: number, json: boolean, help: boolean }}
 */
export function parseArgs(argv) {
  const out = { repo: null, tz: null, limit: DEFAULT_LIMIT, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--repo') {
      out.repo = argv[++i] ?? null;
      if (!out.repo) throw new Error('--repo requires owner/name');
    } else if (a.startsWith('--repo=')) {
      out.repo = a.slice('--repo='.length) || null;
    } else if (a === '--tz') {
      out.tz = argv[++i] ?? null;
      if (!out.tz) throw new Error('--tz requires an IANA zone name');
    } else if (a.startsWith('--tz=')) {
      out.tz = a.slice('--tz='.length) || null;
    } else if (a === '--limit') {
      const n = parseInt(argv[++i], 10);
      if (!Number.isFinite(n) || n < 1) throw new Error('--limit requires a positive integer');
      out.limit = n;
    } else if (a === '--json') {
      out.json = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    } else {
      throw new Error(`Unknown argument: ${a}`);
    }
  }
  return out;
}

/**
 * Parse "owner/repo" from a git remote URL — handles the HTTPS form (with or
 * without embedded credentials or a ".git" suffix) and the SSH form.
 * @param {string} remoteUrl
 * @returns {{ owner: string, repo: string }}
 */
export function parseOwnerRepoFromRemoteUrl(remoteUrl) {
  const cleaned = String(remoteUrl || '').trim();
  const match = cleaned.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/);
  if (!match) {
    throw new Error(`Could not parse owner/repo from remote URL: ${remoteUrl}`);
  }
  return { owner: match[1], repo: match[2] };
}

/**
 * Human-readable relative time, e.g. "5 minutes ago", "2 hours ago", "just now".
 * @param {Date} from
 * @param {Date} [to]
 */
export function formatRelativeTime(from, to = new Date()) {
  const diffMs = to.getTime() - from.getTime();
  const abs = Math.abs(diffMs);
  const suffix = diffMs >= 0 ? 'ago' : 'from now';
  const units = [
    ['year', 365 * 24 * 3600 * 1000],
    ['month', 30 * 24 * 3600 * 1000],
    ['day', 24 * 3600 * 1000],
    ['hour', 3600 * 1000],
    ['minute', 60 * 1000],
    ['second', 1000],
  ];
  for (const [name, ms] of units) {
    const count = Math.floor(abs / ms);
    if (count >= 1) return `${count} ${name}${count === 1 ? '' : 's'} ${suffix}`;
  }
  return 'just now';
}

/**
 * First "success" entry in a deployment's statuses (GitHub returns them newest-first).
 * @param {{ state: string, created_at: string, environment_url?: string, target_url?: string }[]} statuses
 * @returns {{ createdAt: string, environmentUrl: string|null, targetUrl: string|null } | null}
 */
export function pickLatestSuccessStatus(statuses) {
  if (!Array.isArray(statuses)) return null;
  const success = statuses.find((s) => s && s.state === 'success');
  if (!success) return null;
  return {
    createdAt: success.created_at,
    environmentUrl: success.environment_url || null,
    targetUrl: success.target_url || null,
  };
}

/** @param {typeof fetch} fetchImpl @param {string} url @param {string|null} token */
async function githubGet(fetchImpl, url, token) {
  const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetchImpl(url, { headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${url} -> ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Walk the repo's most recent deployments to `environment` (newest first) and return
 * the first one with a "success" status.
 * @param {typeof fetch} fetchImpl
 * @param {{ owner: string, repo: string, environment?: string, limit?: number, token?: string|null }} opts
 * @returns {Promise<{ sha: string, ref: string, success: { createdAt: string, environmentUrl: string|null, targetUrl: string|null } } | null>}
 */
export async function findLastSuccessfulPagesDeployment(fetchImpl, {
  owner, repo, environment = DEFAULT_ENVIRONMENT, limit = DEFAULT_LIMIT, token = null,
}) {
  const deployments = await githubGet(
    fetchImpl,
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/deployments?environment=${encodeURIComponent(environment)}&per_page=${limit}`,
    token,
  );
  for (const deployment of deployments) {
    const statuses = await githubGet(
      fetchImpl,
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/deployments/${deployment.id}/statuses?per_page=30`,
      token,
    );
    const success = pickLatestSuccessStatus(statuses);
    if (success) return { sha: deployment.sha, ref: deployment.ref, success };
  }
  return null;
}

/**
 * Best-effort: the deployed commit's subject line and author. Never throws — this is
 * supplementary display data, not required to answer "when"; documented optional path.
 * @param {typeof fetch} fetchImpl
 * @param {{ owner: string, repo: string, sha: string, token?: string|null }} opts
 * @returns {Promise<{ subject: string, authorName: string|null, authorDate: string|null } | null>}
 */
export async function fetchCommitSummary(fetchImpl, { owner, repo, sha, token = null }) {
  try {
    const commit = await githubGet(
      fetchImpl,
      `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}`,
      token,
    );
    const subject = String(commit?.commit?.message || '').split('\n')[0];
    return {
      subject,
      authorName: commit?.commit?.author?.name || null,
      authorDate: commit?.commit?.author?.date || null,
    };
  } catch (error) {
    reportError(error, '[github-pages-last-deploy] Failed to fetch commit summary (optional)', 'Continuing without commit details');
    return null;
  }
}

/**
 * @param {string[]} argv
 * @param {{ log?: (line: string) => void, error?: (line: string) => void, fetchImpl?: typeof fetch,
 *           getRemoteUrl?: () => string, env?: Record<string, string|undefined>, now?: () => Date }} [io]
 * @returns {Promise<number>} exit code
 */
export async function runCli(argv, io = {}) {
  const log = io.log ?? ((line) => console.log(line));
  const errorLog = io.error ?? ((line) => console.error(line));
  const fetchImpl = io.fetchImpl ?? fetch;
  const getRemoteUrl = io.getRemoteUrl
    ?? (() => execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8' }));
  const env = io.env ?? process.env;
  const now = io.now ?? (() => new Date());

  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    reportError(error, '[github-pages-last-deploy] Invalid arguments');
    errorLog(USAGE);
    return 2;
  }
  if (args.help) {
    log(USAGE);
    return 0;
  }

  let owner;
  let repo;
  if (args.repo) {
    const parts = args.repo.split('/');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errorLog(`--repo must be "owner/name", got: ${args.repo}`);
      return 2;
    }
    [owner, repo] = parts;
  } else {
    let remoteUrl;
    try {
      remoteUrl = getRemoteUrl();
    } catch (error) {
      reportError(error, '[github-pages-last-deploy] Could not read git remote "origin"', 'Pass --repo owner/name instead');
      return 2;
    }
    try {
      ({ owner, repo } = parseOwnerRepoFromRemoteUrl(remoteUrl));
    } catch (error) {
      reportError(error, '[github-pages-last-deploy] Could not determine owner/repo');
      errorLog(USAGE);
      return 2;
    }
  }

  const token = (env.GITHUB_TOKEN || env.GH_TOKEN || '').trim() || null;

  let result;
  try {
    result = await findLastSuccessfulPagesDeployment(fetchImpl, { owner, repo, limit: args.limit, token });
  } catch (error) {
    reportError(error, `[github-pages-last-deploy] Failed to query GitHub API for ${owner}/${repo}`);
    return 1;
  }

  if (!result) {
    errorLog(`No successful "${DEFAULT_ENVIRONMENT}" deployment found for ${owner}/${repo} (checked the ${args.limit} most recent deployment(s)).`);
    errorLog('Is GitHub Pages enabled, and has the "Deploy to GitHub Pages" workflow run at least once?');
    return 1;
  }

  const commitSummary = await fetchCommitSummary(fetchImpl, { owner, repo, sha: result.sha, token });
  const deployedAt = new Date(result.success.createdAt);
  const relative = formatRelativeTime(deployedAt, now());

  if (args.json) {
    log(JSON.stringify({
      repo: `${owner}/${repo}`,
      deployedAt: result.success.createdAt,
      relative,
      ref: result.ref,
      sha: result.sha,
      environmentUrl: result.success.environmentUrl,
      runUrl: result.success.targetUrl,
      commit: commitSummary,
    }, null, 2));
    return 0;
  }

  log(`GitHub Pages — ${owner}/${repo}`);
  log(`  Last deployed:   ${deployedAt.toISOString()} UTC (${relative})`);
  if (args.tz) {
    try {
      const local = deployedAt.toLocaleString('en-US', { timeZone: args.tz, dateStyle: 'medium', timeStyle: 'long' });
      log(`  (${args.tz}): ${local}`);
    } catch (error) {
      reportError(error, `[github-pages-last-deploy] Invalid --tz "${args.tz}"`, 'Skipping local time line');
    }
  }
  log(`  Branch / commit: ${result.ref} @ ${result.sha.slice(0, 7)}`);
  if (commitSummary?.subject) log(`  Commit message:  ${commitSummary.subject}`);
  if (result.success.environmentUrl) log(`  Site URL:        ${result.success.environmentUrl}`);
  if (result.success.targetUrl) log(`  Workflow run:    ${result.success.targetUrl}`);

  return 0;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  runCli(process.argv.slice(2))
    .then((code) => { process.exitCode = code; })
    .catch((error) => {
      reportError(error, '[github-pages-last-deploy] Unhandled failure');
      process.exitCode = 1;
    });
}
