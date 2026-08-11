"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { verifyStaticRelease } = require("./verify-static-release-v1.cjs");

const root = path.resolve(__dirname, "..");

function fail(message) {
  throw new Error(`Static release HTTP smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

async function run(target) {
  const directory = path.resolve(target);
  const verified = verifyStaticRelease(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, "release-manifest.json"), "utf8"));

  const server = http.createServer((request, response) => {
    try {
      const rawPath = decodeURIComponent(new URL(request.url, "http://release.local").pathname);
      const relative = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
      const absolute = path.resolve(directory, relative);
      if (absolute !== directory && !absolute.startsWith(`${directory}${path.sep}`)) {
        response.writeHead(400).end("bad path");
        return;
      }
      if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentType(relative),
        "cache-control": "no-store",
      });
      response.end(fs.readFileSync(absolute));
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  const base = `http://127.0.0.1:${address.port}/`;
  let checked = 0;
  try {
    const rootResponse = await fetch(base);
    assert(rootResponse.status === 200, `root returned ${rootResponse.status}`);
    assert((rootResponse.headers.get("content-type") || "").startsWith("text/html"), "root is not served as HTML");
    const rootBytes = Buffer.from(await rootResponse.arrayBuffer());
    assert(rootBytes.equals(fs.readFileSync(path.join(directory, "index.html"))), "root bytes differ from packaged index.html");

    for (const entry of manifest.files) {
      if (entry.path === ".nojekyll") continue;
      const response = await fetch(new URL(entry.path, base));
      assert(response.status === 200, `${entry.path} returned ${response.status}`);
      const expectedType = contentType(entry.path).split(";", 1)[0];
      assert((response.headers.get("content-type") || "").startsWith(expectedType), `${entry.path} has unexpected content type`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert(bytes.equals(fs.readFileSync(path.join(directory, entry.path))), `${entry.path} bytes changed over HTTP`);
      checked += 1;
    }

    const missing = await fetch(new URL("missing-release-asset.txt", base));
    assert(missing.status === 404, `missing asset returned ${missing.status}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log(JSON.stringify({
    passed: true,
    sourceCommit: verified.sourceCommit,
    bundleDigest: verified.bundleDigest,
    rootEntrypoint: true,
    assetsChecked: checked,
    missingAsset404: true,
  }));
}

const target = process.argv[2] ? path.resolve(root, process.argv[2]) : path.join(root, "release", "scanword-generator-site");
run(target).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
