/* =========================================================
   PORTFOLIO SERVER (Node.js, no packages needed)
   Serves the site and gives the dashboard a small API so it can
   save straight into the project:
     data/content.json   the content database (what the dashboard edits)
     assets/projects.js  rebuilt from it on every save (what the site reads)
     images/, audio/     uploads
   Run:  node server.js        (port 3000, or PORT=8080 node server.js)
   The same API exists in PHP (api/index.php) for shared hosting.
   ========================================================= */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PORT = +process.env.PORT || 3000;
const DATA = path.join(ROOT, "data");
const DB = path.join(DATA, "content.json");
// a .php file so a PHP host runs it (and shows nothing) instead of handing out the password hash
const AUTH = path.join(DATA, "auth.php");
const AUTH_HEAD = "<?php http_response_code(404); exit; ?>\n";
const BACKUPS = path.join(DATA, "backups");
const PROJECTS_JS = path.join(ROOT, "assets", "projects.js");
const KEEP_BACKUPS = 20;
const MAX_UPLOAD = 60 * 1024 * 1024;
const UPLOAD_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "mp3", "m4a", "ogg", "wav", "mp4", "webm"];
const KEYS = ["SITE", "ABOUT", "PROJECTS", "PLAYGROUND", "PHOTOS", "JOYOUS"];
const TYPES = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", avif: "image/avif", ico: "image/x-icon",
  mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", wav: "audio/wav", mp4: "video/mp4", webm: "video/webm",
  woff2: "font/woff2", woff: "font/woff", txt: "text/plain; charset=utf-8", md: "text/plain; charset=utf-8",
};

/* ---------------- helpers ---------------- */
const send = (res, code, body, type = "application/json; charset=utf-8", extra = {}) => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, limit) => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on("data", c => { n += c.length; if (n > limit) { no(new Error("Too large")); req.destroy(); } else chunks.push(c); });
  req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", no);
});
const mtime = f => { try { return fs.statSync(f).mtimeMs / 1000; } catch (e) { return 0; } };
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { return null; } };
const readAuth = () => { try { return JSON.parse(fs.readFileSync(AUTH, "utf8").replace(AUTH_HEAD, "")); } catch (e) { return null; } };
const writeAtomic = (f, data) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + ".tmp"; fs.writeFileSync(t, data); fs.renameSync(t, f); };
// on your own computer only (a proxy in front of a host also connects from 127.0.0.1, so forwarded requests never count)
const isLocal = req => !req.headers["x-forwarded-for"] && !req.headers["x-real-ip"] && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

/* ---------------- password + session cookie ---------------- */
// PBKDF2-SHA256 so the PHP version can read the same data/auth.php
const hashPw = (pw, salt) => crypto.pbkdf2Sync(pw, Buffer.from(salt, "hex"), 120000, 32, "sha256").toString("hex");
const sign = (secret, v) => crypto.createHmac("sha256", Buffer.from(secret, "hex")).update(v).digest("hex");
function authed(req) {
  const a = readAuth(); if (!a) return false;
  const m = /(?:^|;\s*)adm=([0-9]+)\.([0-9a-f]{64})/.exec(req.headers.cookie || ""); if (!m) return false;
  if (Date.now() / 1000 - +m[1] > 30 * 86400) return false;
  const want = sign(a.secret, m[1]);
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(m[2]));
}
const cookie = (secret) => { const ts = String(Math.floor(Date.now() / 1000)); return `adm=${ts}.${sign(secret, ts)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${30 * 86400}`; };

/* ---------------- projects.js from the database ---------------- */
function projectsJS(c) {
  const head = `/* =========================================================
   PROJECT DATA. Written by the dashboard from data/content.json:
   edit content in admin.html (changes made here by hand are read back
   into the dashboard the next time it opens, then saved over).
   ========================================================= */\n`;
  return head + KEYS.filter(k => c[k] != null).map(k => `window.${k} = ${JSON.stringify(c[k], null, 2)};\n`).join("\n");
}
function backup() {
  if (!fs.existsSync(DB)) return;
  fs.mkdirSync(BACKUPS, { recursive: true });
  fs.copyFileSync(DB, path.join(BACKUPS, `content-${new Date().toISOString().replace(/[:.]/g, "-")}.json`));
  const old = fs.readdirSync(BACKUPS).filter(f => f.startsWith("content-")).sort();
  old.slice(0, Math.max(0, old.length - KEEP_BACKUPS)).forEach(f => fs.unlinkSync(path.join(BACKUPS, f)));
}

/* ---------------- API: /api/?r=... ---------------- */
async function api(req, res, q) {
  const r = q.get("r"), post = req.method === "POST";
  // writes need the custom header (a form on another site cannot send it)
  if (post && req.headers["x-admin"] !== "1") return send(res, 403, { error: "Missing header" });
  const a = readAuth();

  if (r === "status") return send(res, 200, { ok: true, server: "node", hasPassword: !!a, authed: authed(req), canSetup: !a && isLocal(req), keys: KEYS });

  if (r === "setup" && post) {
    if (a) return send(res, 409, { error: "A password is already set" });
    if (!isLocal(req)) return send(res, 403, { error: "Set the password on your own computer first (start.bat), then upload the data folder." });
    const { password } = JSON.parse(await readBody(req, 1e4) || "{}");
    if (!password || password.length < 8) return send(res, 400, { error: "Use at least 8 characters" });
    const salt = crypto.randomBytes(16).toString("hex"), secret = crypto.randomBytes(32).toString("hex");
    writeAtomic(AUTH, AUTH_HEAD + JSON.stringify({ v: 1, salt, hash: hashPw(password, salt), secret }, null, 2));
    return send(res, 200, { ok: true }, undefined, { "Set-Cookie": cookie(secret) });
  }
  if (r === "login" && post) {
    if (!a) return send(res, 409, { error: "No password yet" });
    const { password } = JSON.parse(await readBody(req, 1e4) || "{}");
    const ok = typeof password === "string" && crypto.timingSafeEqual(Buffer.from(hashPw(password, a.salt)), Buffer.from(a.hash));
    if (!ok) { await new Promise(t => setTimeout(t, 900)); return send(res, 401, { error: "Wrong password" }); }
    return send(res, 200, { ok: true }, undefined, { "Set-Cookie": cookie(a.secret) });
  }
  if (r === "logout" && post) return send(res, 200, { ok: true }, undefined, { "Set-Cookie": "adm=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });

  if (r === "content" && !post) return send(res, 200, { content: readJSON(DB), contentMtime: mtime(DB), projectsMtime: mtime(PROJECTS_JS) });

  if (!authed(req)) return send(res, 401, { error: "Please sign in" });

  if (r === "save" && post) {
    const body = JSON.parse(await readBody(req, 20 * 1024 * 1024));
    const c = body && body.content;
    if (!c || typeof c !== "object" || !Array.isArray(c.PROJECTS)) return send(res, 400, { error: "Bad content" });
    const clean = Object.fromEntries(KEYS.filter(k => c[k] != null).map(k => [k, c[k]]));
    backup();
    writeAtomic(DB, JSON.stringify(clean, null, 2));
    writeAtomic(PROJECTS_JS, projectsJS(clean));
    return send(res, 200, { ok: true, contentMtime: mtime(DB) });
  }
  if (r === "upload" && post) {
    // base like "images/photo/photo" → images/photo/photo-01.webp (first free number)
    const base = q.get("base") || "", ext = (q.get("ext") || "").toLowerCase();
    if (!/^(images|audio)(\/[a-z0-9_-]+)+$/.test(base) || !UPLOAD_EXT.includes(ext)) return send(res, 400, { error: "Bad file name or type" });
    const buf = await readBody(req, MAX_UPLOAD);
    if (!buf.length) return send(res, 400, { error: "Empty file" });
    let n = 1, rel;
    do { rel = `${base}-${String(n++).padStart(2, "0")}.${ext}`; } while (fs.existsSync(path.join(ROOT, rel)));
    writeAtomic(path.join(ROOT, rel), buf);
    return send(res, 200, { ok: true, path: rel });
  }
  return send(res, 404, { error: "Unknown request" });
}

/* ---------------- static files ---------------- */
function serveFile(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, "");
  if (!rel || rel.endsWith("/")) rel += "index.html";
  const file = path.normalize(path.join(ROOT, rel));
  // keep the database, passwords and server code private
  if (!file.startsWith(ROOT + path.sep) || /^(data|\.git|node_modules|api)([\\/]|$)/.test(path.relative(ROOT, file)) || /^server\.js$/.test(rel)) return send(res, 404, "Not found", TYPES.txt);
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, "Not found", TYPES.txt);
    const type = TYPES[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (range) { // lets audio and video seek
      const start = range[1] ? +range[1] : 0, end = range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes", "Cache-Control": /\.(html|js|css|json)$/.test(file) ? "no-cache" : "public, max-age=3600" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  try {
    if (u.pathname === "/api/" || u.pathname === "/api" || u.pathname === "/api/index.php") return await api(req, res, u.searchParams);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method not allowed", TYPES.txt);
    serveFile(req, res, u.pathname);
  } catch (e) {
    send(res, 500, { error: e.message || "Server error" });
  }
}).listen(PORT, () => console.log(`Portfolio running at http://localhost:${PORT}/  ·  dashboard: http://localhost:${PORT}/admin.html`));
