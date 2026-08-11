"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { verifyStaticRelease } = require("./verify-static-release-v1.cjs");

const root = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(`Static release archive build failed: ${message}`);
}

function assertInsideRelease(target, label) {
  const absolute = path.resolve(target);
  const releaseRoot = path.join(root, "release");
  if (absolute !== releaseRoot && !absolute.startsWith(`${releaseRoot}${path.sep}`)) {
    fail(`${label} must live under release/: ${absolute}`);
  }
  return absolute;
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildStaticReleaseArchive(siteDirectory, archivePath) {
  const site = assertInsideRelease(siteDirectory, "site directory");
  const archive = assertInsideRelease(archivePath, "archive path");
  if (!archive.endsWith(".tar.gz")) fail(`archive must end with .tar.gz: ${archive}`);
  const verified = verifyStaticRelease(site);
  const tarPath = `${archive}.tar.tmp`;

  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.rmSync(archive, { force: true });
  fs.rmSync(tarPath, { force: true });

  try {
    execFileSync("tar", [
      "--sort=name",
      "--mtime=@0",
      "--owner=0",
      "--group=0",
      "--numeric-owner",
      "--format=ustar",
      "--mode=u+rwX,go+rX,go-w",
      "-C", site,
      "-cf", tarPath,
      ".",
    ], { cwd: root, stdio: "pipe", maxBuffer: 32 * 1024 * 1024 });

    const compressed = execFileSync("gzip", ["-n", "-9", "-c", tarPath], {
      cwd: root,
      encoding: null,
      maxBuffer: 64 * 1024 * 1024,
    });
    fs.writeFileSync(archive, compressed);
  } finally {
    fs.rmSync(tarPath, { force: true });
  }

  const bytes = fs.readFileSync(archive);
  return {
    passed: true,
    sourceCommit: verified.sourceCommit,
    bundleDigest: verified.bundleDigest,
    archive: path.relative(root, archive).split(path.sep).join("/"),
    archiveBytes: bytes.length,
    archiveSha256: sha256(bytes),
  };
}

if (require.main === module) {
  const site = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, "release", "scanword-generator-site");
  const archive = process.argv[3] ? path.resolve(root, process.argv[3]) : path.join(root, "release", "scanword-generator-site.tar.gz");
  console.log(JSON.stringify(buildStaticReleaseArchive(site, archive)));
}

module.exports = { buildStaticReleaseArchive };
