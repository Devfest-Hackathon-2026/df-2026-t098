// Serves a built Angular app for the simulated native shell: `node static-server.mjs <dir> <port>`.
// Unknown paths without a file extension return index.html, like the Capacitor WebView router.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "");
const port = Number(process.argv[3]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("usage: static-server.mjs <dir> <port>");
  process.exit(1);
}

createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
  } catch {
    response.writeHead(400).end();
    return;
  }
  let file = path.join(root, pathname);
  if (file !== root && !file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  let isFile = false;
  try {
    isFile = statSync(file).isFile();
  } catch {
    /* fall through to the router fallback */
  }
  if (!isFile) {
    if (path.extname(pathname)) {
      response.writeHead(404).end();
      return;
    }
    file = path.join(root, "index.html");
  }
  response.writeHead(200, {
    "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
    "Cache-Control": "no-store",
  });
  if (request.method === "HEAD") response.end();
  else createReadStream(file).pipe(response);
}).listen(port);
