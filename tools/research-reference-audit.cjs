#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: options.stdio || "pipe",
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function requireGit(args, options = {}) {
  return execFileSync("git", args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

const root = requireGit(["rev-parse", "--show-toplevel"]);
const manifestPath = path.join(root, "research", "archive-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const requiredRefs = Array.isArray(manifest.requiredRefs)
  ? manifest.requiredRefs
  : [];

const mainRef = manifest.mainRef || "refs/remotes/origin/main";
const mainBranch = mainRef.replace(/^refs\/remotes\/origin\//, "");
const mainFetch = runGit([
  "fetch",
  "--quiet",
  "--no-tags",
  "--depth=1000",
  "origin",
  `+refs/heads/${mainBranch}:${mainRef}`,
], { cwd: root });

const fetchedRefs = [];
for (const item of requiredRefs) {
  if (!item.ref || !item.ref.startsWith("refs/heads/")) continue;
  const branch = item.ref.slice("refs/heads/".length);
  const localRef = `refs/remotes/origin/${branch}`;
  const fetch = runGit([
    "fetch",
    "--quiet",
    "--no-tags",
    "--depth=1000",
    "origin",
    `+${item.ref}:${localRef}`,
  ], { cwd: root });
  fetchedRefs.push({
    name: item.name || branch,
    ref: item.ref,
    localRef,
    expectedCommit: item.commit || null,
    fetched: fetch.ok,
    error: fetch.ok ? null : fetch.stderr,
  });
}

const tracked = requireGit(["ls-files", "-z"], { cwd: root })
  .split("\0")
  .filter(Boolean);
const inScope = (file) => (
  file === "README.md"
  || file === "AGENTS.md"
  || file.startsWith("docs/milestones/")
  || file.startsWith("research/")
  || file.startsWith(".github/workflows/")
);
const isText = (file) => /\.(?:md|json|sh|ya?ml|txt)$/i.test(file);
const files = tracked.filter((file) => inScope(file) && isText(file));

const commitFiles = new Map();
const branchFiles = new Map();
const commitPattern = /(?<![0-9a-f])[0-9a-f]{40}(?![0-9a-f])/gi;
const branchPattern = /\b(?:r-and-d\/[A-Za-z0-9._/-]+|release\/[A-Za-z0-9._/-]+|research\/(?:archive-|closed-fill-snapshot-)[A-Za-z0-9._-]+)\b/g;

for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  for (const match of text.matchAll(commitPattern)) {
    const sha = match[0].toLowerCase();
    if (!commitFiles.has(sha)) commitFiles.set(sha, new Set());
    commitFiles.get(sha).add(file);
  }
  for (const match of text.matchAll(branchPattern)) {
    const branch = match[0].replace(/[.,;:]+$/, "");
    if (!branchFiles.has(branch)) branchFiles.set(branch, new Set());
    branchFiles.get(branch).add(file);
  }
}

const archiveRefs = fetchedRefs.filter((item) => item.fetched);
const commits = uniqueSorted(commitFiles.keys()).map((sha) => {
  const available = runGit(["cat-file", "-e", `${sha}^{commit}`], { cwd: root }).ok;
  const inMain = available && mainFetch.ok
    && runGit(["merge-base", "--is-ancestor", sha, mainRef], { cwd: root }).ok;
  const inArchives = archiveRefs
    .filter((item) => runGit(["merge-base", "--is-ancestor", sha, item.localRef], { cwd: root }).ok)
    .map((item) => item.ref);
  return {
    sha,
    files: uniqueSorted(commitFiles.get(sha)),
    available,
    inMain,
    inArchives,
  };
});

const branches = uniqueSorted(branchFiles.keys()).map((branch) => {
  const remote = runGit(["ls-remote", "--heads", "origin", `refs/heads/${branch}`], { cwd: root });
  const head = remote.ok && remote.stdout ? remote.stdout.split(/\s+/)[0] : null;
  return {
    branch,
    files: uniqueSorted(branchFiles.get(branch)),
    remoteHead: head,
    required: requiredRefs.some((item) => item.ref === `refs/heads/${branch}`),
  };
});

const requiredChecks = requiredRefs.map((item) => {
  const branch = item.ref && item.ref.startsWith("refs/heads/")
    ? item.ref.slice("refs/heads/".length)
    : null;
  const fetched = fetchedRefs.find((entry) => entry.ref === item.ref);
  const actualCommit = fetched && fetched.fetched
    ? runGit(["rev-parse", `${fetched.localRef}^{commit}`], { cwd: root }).stdout || null
    : null;
  const contains = Array.isArray(item.contains)
    ? item.contains.map((sha) => ({
      sha,
      available: runGit(["cat-file", "-e", `${sha}^{commit}`], { cwd: root }).ok,
      ancestor: fetched && fetched.fetched
        ? runGit(["merge-base", "--is-ancestor", sha, fetched.localRef], { cwd: root }).ok
        : false,
    }))
    : [];
  return {
    name: item.name || branch || item.ref,
    ref: item.ref || null,
    branch,
    expectedCommit: item.commit || null,
    actualCommit,
    refMatches: Boolean(item.commit && actualCommit === item.commit),
    contains,
  };
});

const failures = [];
if (!mainFetch.ok) {
  failures.push(`Unable to fetch main ref: ${mainFetch.stderr}`);
}
for (const check of requiredChecks) {
  if (!check.refMatches) failures.push(`${check.ref} does not resolve to ${check.expectedCommit}`);
  for (const commit of check.contains) {
    if (!commit.available || !commit.ancestor) {
      failures.push(`${commit.sha} is not preserved by ${check.ref}`);
    }
  }
}
for (const commit of commits) {
  if (!commit.available) {
    failures.push(`Documented commit ${commit.sha} is not fetchable from main or a required archive ref`);
  }
}

const report = {
  schemaVersion: 2,
  repositoryHead: requireGit(["rev-parse", "HEAD"], { cwd: root }),
  manifest: path.relative(root, manifestPath),
  scannedFiles: files.length,
  mainRef,
  mainFetched: mainFetch.ok,
  requiredChecks,
  commits,
  branches,
  failures: uniqueSorted(failures),
  passed: failures.length === 0,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
