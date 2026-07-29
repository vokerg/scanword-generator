"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const manifestPath = path.resolve(
  __dirname,
  "..",
  "research",
  "exact-allocator-acceleration",
  "seed-manifest-v1.json",
);

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function deriveSeed(manifest, split, oneBasedIndex) {
  assert(Number.isInteger(oneBasedIndex) && oneBasedIndex > 0, "seed index must be a positive integer");
  const digest = crypto
    .createHash("sha256")
    .update(`${manifest.namespace}:${split}:${oneBasedIndex}`)
    .digest("hex")
    .slice(0, 16);
  return `p12-${split}-${String(oneBasedIndex).padStart(3, "0")}-${digest}`;
}

function materialize(manifest = readManifest()) {
  const splits = {};
  for (const split of manifest.canonicalOrder) {
    const count = Number(manifest.splits[split] || 0);
    assert(Number.isInteger(count) && count > 0, `invalid seed count for ${split}`);
    splits[split] = Array.from({ length: count }, (_unused, index) => deriveSeed(manifest, split, index + 1));
  }
  return splits;
}

function canonicalDigest(manifest, splits) {
  const input = manifest.canonicalOrder
    .flatMap((split) => splits[split].map((seed) => `${split}:${seed}`))
    .join("\n") + "\n";
  return crypto.createHash("sha256").update(input).digest("hex");
}

function validate(manifest = readManifest()) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, "frozen-before-optimization");
  const splits = materialize(manifest);
  const digest = canonicalDigest(manifest, splits);
  assert.equal(digest, manifest.manifestDigestSha256, "Phase 12 seed manifest digest changed");
  const seen = new Set();
  for (const split of manifest.canonicalOrder) {
    for (const seed of splits[split]) {
      assert(!seen.has(seed), `duplicate Phase 12 seed: ${seed}`);
      seen.add(seed);
    }
  }
  return { manifest, splits, digest, total: seen.size };
}

if (require.main === module) {
  const validated = validate();
  const requestedSplit = process.argv[2];
  if (requestedSplit && requestedSplit !== "--json") {
    assert(validated.splits[requestedSplit], `unknown seed split: ${requestedSplit}`);
    process.stdout.write(`${validated.splits[requestedSplit].join("\n")}\n`);
  } else if (requestedSplit === "--json") {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: validated.manifest.schemaVersion,
      sourceBaseline: validated.manifest.sourceBaseline,
      manifestDigestSha256: validated.digest,
      splits: validated.splits,
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      sourceBaseline: validated.manifest.sourceBaseline,
      manifestDigestSha256: validated.digest,
      counts: Object.fromEntries(validated.manifest.canonicalOrder.map((split) => [split, validated.splits[split].length])),
      total: validated.total,
    })}\n`);
  }
}

module.exports = {
  manifestPath,
  readManifest,
  deriveSeed,
  materialize,
  canonicalDigest,
  validate,
};
