"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const siteDirectory = path.resolve(root, process.argv[2] || "release/browser-smoke-site");
const browserBinary = process.env.SCANWORD_BROWSER_BIN;

function fail(message) {
  throw new Error(`Browser release smoke failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function contentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case ".html": return "text/html; charset=utf-8";
    case ".css": return "text/css; charset=utf-8";
    case ".js": return "text/javascript; charset=utf-8";
    case ".json": return "application/json; charset=utf-8";
    case ".svg": return "image/svg+xml; charset=utf-8";
    default: return "application/octet-stream";
  }
}

function serve(directory) {
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
      const normalized = path.posix.normalize(relative);
      if (normalized === ".." || normalized.startsWith("../") || path.posix.isAbsolute(normalized)) {
        response.writeHead(400).end("bad path");
        return;
      }
      const file = path.resolve(directory, normalized);
      if (!file.startsWith(`${directory}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": contentType(file),
        "cache-control": "no-store",
      });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}/` });
    });
  });
}

function runBrowser(url, profileDirectory) {
  return new Promise((resolve, reject) => {
    const args = [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      `--user-data-dir=${profileDirectory}`,
      "--virtual-time-budget=180000",
      "--dump-dom",
      url,
    ];
    const child = spawn(browserBinary, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const maxBytes = 32 * 1024 * 1024;

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("headless browser exceeded 240s wall-clock timeout"));
    }, 240000);

    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxBytes) {
        child.kill("SIGKILL");
        reject(new Error("browser DOM output exceeded 32 MiB"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxBytes) stderr.push(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({
        code,
        signal,
        dom: Buffer.concat(stdout).toString("utf8"),
        diagnostics: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

function openingTag(dom, id) {
  const match = dom.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`, "i"));
  assert(match, `missing browser DOM element #${id}`);
  return match[0];
}

function textContent(dom, id) {
  const match = dom.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
  assert(match, `missing browser DOM text element #${id}`);
  return match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function main() {
  assert(browserBinary, "SCANWORD_BROWSER_BIN is required");
  assert(fs.existsSync(browserBinary), `browser binary does not exist: ${browserBinary}`);
  assert(fs.existsSync(path.join(siteDirectory, "index.html")), `packaged site missing index.html: ${siteDirectory}`);
  assert(fs.existsSync(path.join(siteDirectory, "release-manifest.json")), "packaged site missing release-manifest.json");

  const profileDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "scanword-browser-"));
  const { server, url } = await serve(siteDirectory);
  let result;
  try {
    result = await runBrowser(url, profileDirectory);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(profileDirectory, { recursive: true, force: true });
  }

  assert(result.code === 0, `browser exited with code ${result.code} signal ${result.signal || "none"}\n${result.diagnostics.slice(-4000)}`);
  const dom = result.dom;
  assert(dom.includes("<html"), "browser did not emit serialized HTML");
  assert(!dom.includes("class=\"generation-error\""), "browser rendered the generation failure boundary");

  const status = textContent(dom, "generationStatus");
  assert(/\bvalid\b/i.test(status), `generation status is not valid: ${status}`);
  assert(!/generating/i.test(status), `generation did not settle: ${status}`);

  const previewTag = openingTag(dom, "preview");
  assert(/aria-busy=["']false["']/i.test(previewTag), `preview remained busy: ${previewTag}`);
  assert(/<svg\b[\s\S]*?viewBox=["']0 0 148 210["']/i.test(dom), "A5 SVG preview was not rendered in the browser");

  for (const id of ["generate", "downloadSvg", "downloadJson", "printA5"]) {
    const tag = openingTag(dom, id);
    assert(!/\sdisabled(?:\s|=|>)/i.test(tag), `#${id} remained disabled after valid generation`);
  }

  const tbody = dom.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  assert(tbody, "assigned-answer table body was not rendered");
  const answerRows = (tbody[1].match(/<tr\b/gi) || []).length;
  assert(answerRows >= 12, `browser rendered too few assigned answers: ${answerRows}`);
  assert(/class=["'][^"']*stat[^"']*["']/i.test(dom), "browser stats were not rendered");

  const manifest = JSON.parse(fs.readFileSync(path.join(siteDirectory, "release-manifest.json"), "utf8"));
  console.log(JSON.stringify({
    passed: true,
    browser: path.basename(browserBinary),
    sourceCommit: manifest.sourceCommit,
    bundleDigest: manifest.bundleDigest,
    generationStatus: status,
    answerRows,
    a5SvgRendered: true,
    exportsEnabled: true,
    previewBusy: false,
    domBytes: Buffer.byteLength(dom),
    domDigest: sha256(dom),
  }));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
