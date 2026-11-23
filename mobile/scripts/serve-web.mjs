// Serves the web build of the app (`npm run export:web` → dist/) next to a
// Kampus server, the way the two will sit together when the site moves to this
// code: pages from dist/, /api from the server. For looking at the app in a
// browser and for the screen tests; not used in production.
//   node scripts/serve-web.mjs [port] [server]   (default 8090, http://localhost:3000)
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";

const port = Number(process.argv[2] ?? 8090);
const upstream = new URL(process.argv[3] ?? "http://localhost:3000");
const root = path.resolve(import.meta.dirname, "..", "dist");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".svg": "image/svg+xml",
};

http
  .createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (url.pathname.startsWith("/api/")) {
      const proxied = http.request(
        {
          host: upstream.hostname,
          port: upstream.port || 80,
          path: url.pathname + url.search,
          method: req.method,
          // The server compares a request's Origin with the host it was asked on (the
          // lesson room's sync does), so it is told the address the browser used.
          headers: {
            ...req.headers,
            host: upstream.host,
            "x-forwarded-host": req.headers.host ?? upstream.host,
          },
        },
        (answer) => {
          res.writeHead(answer.statusCode ?? 502, answer.headers);
          answer.pipe(res);
        },
      );
      proxied.on("error", () => {
        res.writeHead(502).end();
      });
      req.pipe(proxied);
      return;
    }
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      // Every page of the app is the same file; the app reads the address itself.
      file = path.join(root, "index.html");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  })
  .listen(port, () =>
    console.log(`Kampus app on http://localhost:${port}, API from ${upstream.origin}`),
  );
