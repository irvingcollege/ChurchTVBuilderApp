// Local test harness for the compiled Netlify function; not a deployment server.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { Readable } from "node:stream";
import handler from "../.netlify/v1/functions/ssr/ssr.mjs";
const root = resolve("dist");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost:4323");
    const path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (
      (req.method === "GET" || req.method === "HEAD") &&
      path.startsWith(root + sep)
    ) {
      try {
        if ((await stat(path)).isFile()) {
          res.setHeader(
            "Content-Type",
            types[extname(path)] || "application/octet-stream",
          );
          res.end(req.method === "HEAD" ? undefined : await readFile(path));
          return;
        }
      } catch (e) {
        if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
      }
    }
    const init = { method: req.method, headers: req.headers };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = Readable.toWeb(req);
      init.duplex = "half";
    }
    const response = await handler(new Request(url, init), {
      ip: "127.0.0.1",
      geo: {},
      requestId: "built-browser-test",
    });
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key !== "set-cookie") res.setHeader(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length) res.setHeader("Set-Cookie", cookies);
    if (response.body && req.method !== "HEAD") {
      for await (const chunk of response.body) res.write(chunk);
    }
    res.end();
  } catch (e) {
    console.error("Built test server failed:", e.name);
    res.statusCode = 500;
    res.end("Built test server error");
  }
});
server.listen(4323, "127.0.0.1", () =>
  console.log("Compiled Netlify test server ready on port 4323"),
);
