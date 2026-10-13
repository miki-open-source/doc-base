import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(
  process.env.TEST_OUTPUT_DIRECTORY ??
    path.resolve(import.meta.dirname, "../dist"),
);
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url, "http://localhost").pathname,
    );
    const target = path.resolve(root, "." + pathname);
    if (target !== root && !target.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    const file = path.extname(target)
      ? target
      : path.join(target, "index.html");
    const data = await readFile(file);
    const types = {
      ".html": "text/html",
      ".json": "application/json",
      ".js": "text/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
    };
    response.setHeader(
      "Content-Type",
      types[path.extname(file)] ?? "application/octet-stream",
    );
    response.end(data);
  } catch {
    response.writeHead(404).end("Not found");
  }
}).listen(4399, "127.0.0.1");
