import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { settings as readSettings } from "../lib/security.mjs";
import { database } from "../lib/database.mjs";
import { authentication } from "../lib/auth.mjs";
import { mailer } from "../lib/mail.mjs";
import { createHandler } from "../lib/handler.mjs";
const settings = readSettings(),
  db = database(settings.databaseUrl),
  send = mailer(settings),
  auth = authentication({ settings, db, send }),
  handle = createHandler({ settings, db, send, auth });
const root = resolve(new URL("../public", import.meta.url).pathname);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, settings.origin);
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      const request = new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(!["GET", "HEAD"].includes(req.method)
          ? { body: req, duplex: "half" }
          : {}),
      });
      const response = await handle(request);
      const bytes = Buffer.from(await response.arrayBuffer());
      const headers = Object.fromEntries(response.headers);
      delete headers["set-cookie"];
      res.writeHead(response.status, {
        ...headers,
        ...(response.headers.getSetCookie().length
          ? { "set-cookie": response.headers.getSetCookie() }
          : {}),
      });
      res.end(bytes);
    } else {
      const path = resolve(
        root,
        "." +
          (["/", "/app", "/invite"].includes(url.pathname)
            ? "/index.html"
            : url.pathname === "/participant"
              ? "/participant.html"
              : url.pathname.startsWith("/p/")
                ? "/intake.html"
                : url.pathname),
      );
      if (!path.startsWith(root + "/")) {
        res.writeHead(404).end();
        return;
      }
      const bytes = await readFile(path);
      res.writeHead(200, {
        "content-type": types[extname(path)] || "application/octet-stream",
        "x-content-type-options": "nosniff",
        "content-security-policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'",
      });
      res.end(bytes);
    }
  } catch (e) {
    if (!res.headersSent) res.writeHead(e.code === "ENOENT" ? 404 : 500);
    res.end("Request unavailable.");
  }
});
server.listen(new URL(settings.origin).port || 4344, "127.0.0.1", () =>
  console.log(`Charity OS: ${settings.origin}`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      process.exit(0);
    }),
  );
