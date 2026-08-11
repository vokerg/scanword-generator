"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  MANIFEST_NAME,
  collectSourceAssets,
  manifestEntries,
} = require("./build-static-release-v1.cjs");

const root = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(`Static release verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function currentCommit() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function verifyStaticRelease(directory) {
  const output = path.resolve(directory);
  const manifestPath = path.join(output, MANIFEST_NAME);
  assert(fs.existsSync(manifestPath), `${MANIFEST_NAME} is missing`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  assert(manifest.schemaVersion === 1, `unexpected manifest schema ${manifest.schemaVersion}`);
  assert(manifest.product === "scanword-generator", `unexpected product ${manifest.product}`);
  assert(manifest.entrypoint === "index.html", `unexpected entrypoint ${manifest.entrypoint}`);
  assert(/^[0-9a-f]{40}$/.test(manifest.sourceCommit || ""), `invalid source commit ${manifest.sourceCommit}`);
  assert(manifest.sourceCommit === currentCommit(), `bundle source ${manifest.sourceCommit} does not match checked-out HEAD`);
  assert(Array.isArray(manifest.files) && manifest.files.length > 0, "manifest contains no files");

  const actual = manifestEntries(output);
  assert(JSON.stringify(actual) === JSON.stringify(manifest.files), "manifest file list/checksums do not match bundle bytes");
  const actualDigest = sha256(Buffer.from(JSON.stringify(actual)));
  assert(actualDigest === manifest.bundleDigest, `bundle digest mismatch: expected ${manifest.bundleDigest}, got ${actualDigest}`);

  const expectedPaths = [...collectSourceAssets(), ".nojekyll"].sort();
  const actualPaths = actual.map((entry) => entry.path).sort();
  assert(JSON.stringify(actualPaths) === JSON.stringify(expectedPaths), "bundle contents drifted from production runtime dependency closure");
  assert(!actualPaths.includes("app.js"), "legacy app.js entered the release bundle");
  assert(!actualPaths.some((file) => /^(?:tools|research|docs|\.github)\//.test(file)), "non-runtime repository content entered the release bundle");
  assert(actualPaths.includes("styles.css"), "styles.css is missing from the release bundle");
  assert(actualPaths.includes("bulk-lexicon/loader.js"), "bulk lexicon loader is missing from the release bundle");
  assert(actualPaths.includes("bulk-lexicon/manifest.json"), "bulk lexicon provenance manifest is missing from the release bundle");

  return {
    passed: true,
    sourceCommit: manifest.sourceCommit,
    files: actual.length,
    bytes: actual.reduce((sum, entry) => sum + entry.bytes, 0),
    bundleDigest: actualDigest,
    dependencyClosureExact: true,
  };
}

if (require.main === module) {
  const target = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, "release", "scanword-generator-site");
  console.log(JSON.stringify(verifyStaticRelease(target)));
}

module.exports = { verifyStaticRelease };
