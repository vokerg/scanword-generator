"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(root, "release", "scanword-generator-site");
const MANIFEST_NAME = "release-manifest.json";

function fail(message) {
  throw new Error(`Static release build failed: ${message}`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeAsset(asset) {
  const raw = String(asset || "").trim().split(/[?#]/, 1)[0];
  if (!raw || /^(?:[a-z]+:)?\/\//i.test(raw) || raw.startsWith("data:")) {
    fail(`remote or empty asset reference is not packageable: ${asset}`);
  }
  if (raw.includes("\\")) fail(`asset path uses backslashes: ${raw}`);
  const normalized = path.posix.normalize(raw.replace(/^\.\//, ""));
  if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
    fail(`asset escapes repository root: ${raw}`);
  }
  return normalized;
}

function parseBrowserAssets(html) {
  const scripts = [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/g)]
    .map((match) => normalizeAsset(match[1]));
  const links = [...html.matchAll(/<link\s+[^>]*href=["']([^"']+)["'][^>]*>/g)]
    .map((match) => normalizeAsset(match[1]));
  return { scripts, links };
}

function parseBulkLoaderAssets(loader) {
  const files = [...loader.matchAll(/["']([^"']+\.js)["']/g)].map((match) => match[1]);
  if (!files.length) fail("bulk lexicon loader contains no chunk files");
  return [...new Set(files)].map((file) => normalizeAsset(`bulk-lexicon/${file}`));
}

function sourceCommit() {
  const value = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  if (!/^[0-9a-f]{40}$/.test(value)) fail(`invalid source commit: ${value}`);
  return value;
}

function collectSourceAssets() {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const browser = parseBrowserAssets(html);
  if (!browser.scripts.includes("bulk-lexicon/loader.js")) fail("production page no longer loads bulk lexicon loader");
  if (!browser.links.includes("styles.css")) fail("production page no longer references styles.css");
  if (browser.scripts.includes("app.js")) fail("legacy app.js must not enter the production bundle");

  const loader = fs.readFileSync(path.join(root, "bulk-lexicon", "loader.js"), "utf8");
  const bulkChunks = parseBulkLoaderAssets(loader);
  const assets = [
    "index.html",
    ...browser.links,
    ...browser.scripts,
    ...bulkChunks,
    "bulk-lexicon/manifest.json",
  ];
  return [...new Set(assets)].sort();
}

function listFiles(directory, relative = "") {
  const absolute = path.join(directory, relative);
  const entries = fs.readdirSync(absolute, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = [];
  for (const entry of entries) {
    const child = relative ? path.posix.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(directory, child));
    else if (entry.isFile()) files.push(child);
    else fail(`release contains unsupported filesystem entry: ${child}`);
  }
  return files;
}

function manifestEntries(outputDirectory) {
  return listFiles(outputDirectory)
    .filter((file) => file !== MANIFEST_NAME)
    .sort()
    .map((file) => {
      const bytes = fs.readFileSync(path.join(outputDirectory, file));
      return { path: file, bytes: bytes.length, sha256: sha256(bytes) };
    });
}

function buildStaticRelease(outputDirectory = DEFAULT_OUTPUT) {
  const output = path.resolve(outputDirectory);
  const relativeOutput = path.relative(root, output);
  if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)) {
    fail(`output must stay inside repository checkout: ${output}`);
  }
  if (!relativeOutput.startsWith(`release${path.sep}`) && relativeOutput !== "release") {
    fail(`output must live under release/: ${relativeOutput}`);
  }

  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });

  const assets = collectSourceAssets();
  for (const asset of assets) {
    const source = path.join(root, asset);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) fail(`missing release asset: ${asset}`);
    const destination = path.join(output, asset);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }

  fs.writeFileSync(path.join(output, ".nojekyll"), "", "utf8");
  const files = manifestEntries(output);
  const bundleDigest = sha256(Buffer.from(JSON.stringify(files)));
  const manifest = {
    schemaVersion: 1,
    product: "scanword-generator",
    sourceCommit: sourceCommit(),
    entrypoint: "index.html",
    bundleDigest,
    files,
  };
  fs.writeFileSync(path.join(output, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

if (require.main === module) {
  const output = process.argv[2] ? path.resolve(root, process.argv[2]) : DEFAULT_OUTPUT;
  const manifest = buildStaticRelease(output);
  console.log(JSON.stringify({
    passed: true,
    output: path.relative(root, output).split(path.sep).join("/"),
    sourceCommit: manifest.sourceCommit,
    files: manifest.files.length,
    bundleDigest: manifest.bundleDigest,
  }));
}

module.exports = {
  MANIFEST_NAME,
  buildStaticRelease,
  collectSourceAssets,
  listFiles,
  manifestEntries,
};
