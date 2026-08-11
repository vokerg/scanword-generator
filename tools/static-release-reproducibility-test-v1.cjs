"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildStaticRelease, listFiles } = require("./build-static-release-v1.cjs");
const { verifyStaticRelease } = require("./verify-static-release-v1.cjs");

const root = path.resolve(__dirname, "..");
const left = path.join(root, "release", ".repro-a");
const right = path.join(root, "release", ".repro-b");

function fail(message) {
  throw new Error(`Static release reproducibility test failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function compareDirectories(a, b) {
  const filesA = listFiles(a).sort();
  const filesB = listFiles(b).sort();
  assert(JSON.stringify(filesA) === JSON.stringify(filesB), "independent builds produced different file lists");
  for (const file of filesA) {
    const bytesA = fs.readFileSync(path.join(a, file));
    const bytesB = fs.readFileSync(path.join(b, file));
    assert(bytesA.equals(bytesB), `independent builds differ at ${file}`);
  }
  return filesA;
}

try {
  const manifestA = buildStaticRelease(left);
  const manifestB = buildStaticRelease(right);
  const verifiedA = verifyStaticRelease(left);
  const verifiedB = verifyStaticRelease(right);
  const files = compareDirectories(left, right);

  assert(manifestA.bundleDigest === manifestB.bundleDigest, "independent bundle digests differ");
  assert(manifestA.sourceCommit === manifestB.sourceCommit, "independent source commits differ");
  assert(verifiedA.bundleDigest === verifiedB.bundleDigest, "verified bundle digests differ");

  console.log(JSON.stringify({
    passed: true,
    sourceCommit: manifestA.sourceCommit,
    files: files.length,
    payloadFiles: manifestA.files.length,
    bundleDigest: manifestA.bundleDigest,
    byteIdentical: true,
  }));
} finally {
  fs.rmSync(left, { recursive: true, force: true });
  fs.rmSync(right, { recursive: true, force: true });
}
