/* =========================================================
   DASHBOARD API ON VERCEL (Node, no packages)
   The same API as server.js, but Vercel has no disk to save to, so every
   save is a commit to the GitHub repo, and the push redeploys the site.

   Set these in Vercel > Project > Settings > Environment Variables:
     ADMIN_PASSWORD  the dashboard password
     GITHUB_TOKEN    a fine-grained token with "Contents: Read and write"
                     on this repo only
     GITHUB_REPO     optional, default robert-stark21/porfolio
     GITHUB_BRANCH   optional, default main

   Uploads become git blobs right away; they are added to the repo in the
   same commit as the next save, so one save = one deploy.
   ========================================================= */
const crypto = require("crypto");

const REPO = process.env.GITHUB_REPO || "robert-stark21/porfolio";
const BRANCH = process.env.GITHUB_BRANCH || "main";
const TOKEN = process.env.GITHUB_TOKEN || "";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const KEYS = ["SITE", "ABOUT", "PROJECTS", "PLAYGROUND", "PHOTOS", "JOYOUS"];
const UPLOAD_EXT = ["jpg", "jpeg", "png", "webp", "gif", "avif", "mp3", "m4a", "ogg", "wav", "mp4", "webm"];
const MAX_BODY = 4.4 * 1024 * 1024; // Vercel refuses request bodies over 4.5MB

const send = (res, code, body, extra = {}) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  res.end(JSON.stringify(body));
};
const readBody = (req, limit) => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on("data", c => { n += c.length; if (n > limit) { no(Object.assign(new Error("File too large for the online dashboard (about 4MB max)"), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on("end", () => ok(Buffer.concat(chunks))); req.on("error", no);
});

/* ---------------- password + session cookie ---------------- */
const SECRET = crypto.createHash("sha256").update("adm|" + PASSWORD + "|" + TOKEN).digest();
const sign = v => crypto.createHmac("sha256", SECRET).update(v).digest("hex");
function authed(req) {
  if (!PASSWORD) return false;
  const m = /(?:^|;\s*)adm=([0-9]+)\.([0-9a-f]{64})/.exec(req.headers.cookie || ""); if (!m) return false;
  if (Date.now() / 1000 - +m[1] > 30 * 86400) return false;
  return crypto.timingSafeEqual(Buffer.from(sign(m[1])), Buffer.from(m[2]));
}
const cookie = () => { const ts = String(Math.floor(Date.now() / 1000)); return `adm=${ts}.${sign(ts)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${30 * 86400}`; };
const samePw = pw => {
  const a = crypto.createHash("sha256").update(String(pw)).digest(), b = crypto.createHash("sha256").update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
};

/* ---------------- GitHub ---------------- */
async function gh(path, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "portfolio-dashboard", "X-GitHub-Api-Version": "2022-11-28", ...(opts.body ? { "Content-Type": "application/json" } : {}) },
  });
  if (r.status === 404 && opts.allow404) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`GitHub: ${j.message || r.status}`), { status: r.status === 409 || r.status === 422 ? 409 : 502 });
  return j;
}
const encPath = p => p.split("/").map(encodeURIComponent).join("/");
const getFile = p => gh(`/contents/${encPath(p)}?ref=${encodeURIComponent(BRANCH)}`, { allow404: true });
const blob = (buf) => gh("/git/blobs", { method: "POST", body: JSON.stringify({ content: buf.toString("base64"), encoding: "base64" }) });

function projectsJS(c) {
  const head = `/* =========================================================
   PROJECT DATA. Written by the dashboard from data/content.json:
   edit content in admin.html (changes made here by hand are read back
   into the dashboard the next time it opens, then saved over).
   ========================================================= */\n`;
  return head + KEYS.filter(k => c[k] != null).map(k => `window.${k} = ${JSON.stringify(c[k], null, 2)};\n`).join("\n");
}

/* ---------------- API: /api/?r=... ---------------- */
module.exports = async (req, res) => {
  try {
    const q = new URL(req.url, "http://x").searchParams, r = q.get("r"), post = req.method === "POST";
    if (post && req.headers["x-admin"] !== "1") return send(res, 403, { error: "Missing header" });
    const ready = !!(PASSWORD && TOKEN);

    if (r === "status") return send(res, 200, { ok: true, server: "vercel", hasPassword: ready, authed: ready && authed(req), canSetup: false, keys: KEYS });

    if (r === "login" && post) {
      if (!ready) return send(res, 409, { error: "Set ADMIN_PASSWORD and GITHUB_TOKEN in Vercel first" });
      let pw = "";
      try { pw = JSON.parse((await readBody(req, 1e4)).toString() || "{}").password; } catch (e) {}
      if (typeof pw !== "string" || !samePw(pw)) { await new Promise(t => setTimeout(t, 900)); return send(res, 401, { error: "Wrong password" }); }
      return send(res, 200, { ok: true }, { "Set-Cookie": cookie() });
    }
    if (r === "logout" && post) return send(res, 200, { ok: true }, { "Set-Cookie": "adm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0" });

    if (!ready || !authed(req)) return send(res, 401, { error: "Please sign in" });

    // the latest content in the repo (newer than this deploy when a save is still building)
    if (r === "content" && !post) {
      const f = await getFile("data/content.json");
      const content = f ? JSON.parse(Buffer.from(f.content, "base64").toString("utf8")) : null;
      return send(res, 200, { content, sha: f ? f.sha : null, contentMtime: 0, projectsMtime: 0 });
    }

    if (r === "upload" && post) {
      // base like "images/photo/photo" -> images/photo/photo-01.webp (first number free in the repo and in this session)
      const base = q.get("base") || "", ext = (q.get("ext") || "").toLowerCase();
      if (!/^(images|audio)(\/[a-z0-9_-]+)+$/.test(base) || !UPLOAD_EXT.includes(ext)) return send(res, 400, { error: "Bad file name or type" });
      const taken = new Set((q.get("pending") || "").split(",").filter(Boolean));
      const buf = await readBody(req, MAX_BODY);
      if (!buf.length) return send(res, 400, { error: "Empty file" });
      let n = 1, rel;
      do { rel = `${base}-${String(n++).padStart(2, "0")}.${ext}`; } while (taken.has(rel) || await getFile(rel));
      const b = await blob(buf);
      return send(res, 200, { ok: true, path: rel, sha: b.sha });
    }

    if (r === "save" && post) {
      const body = JSON.parse((await readBody(req, MAX_BODY)).toString());
      const c = body && body.content;
      if (!c || typeof c !== "object" || !Array.isArray(c.PROJECTS)) return send(res, 400, { error: "Bad content" });
      const clean = Object.fromEntries(KEYS.filter(k => c[k] != null).map(k => [k, c[k]]));
      // refuse to overwrite a newer save (another tab, or a push from the computer)
      const cur = await getFile("data/content.json");
      if (body.base && cur && cur.sha !== body.base) return send(res, 409, { error: "The content changed since this page was opened. Reload the dashboard, then make the change again." });
      const ups = (Array.isArray(body.uploads) ? body.uploads : []).filter(u => u && /^(images|audio)\/[a-z0-9_\/.-]+$/.test(u.path) && !u.path.includes("..") && /^[0-9a-f]{40}$/.test(u.sha));
      const [cj, pj] = await Promise.all([blob(Buffer.from(JSON.stringify(clean, null, 2))), blob(Buffer.from(projectsJS(clean)))]);
      for (let tries = 0; ; tries++) {
        const ref = await gh(`/git/ref/heads/${encodeURIComponent(BRANCH)}`);
        const head = await gh(`/git/commits/${ref.object.sha}`);
        const tree = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: head.tree.sha, tree: [
          { path: "data/content.json", mode: "100644", type: "blob", sha: cj.sha },
          { path: "assets/projects.js", mode: "100644", type: "blob", sha: pj.sha },
          ...ups.map(u => ({ path: u.path, mode: "100644", type: "blob", sha: u.sha })),
        ] }) });
        const commit = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message: "Update content from the online dashboard", tree: tree.sha, parents: [ref.object.sha] }) });
        try {
          await gh(`/git/refs/heads/${encodeURIComponent(BRANCH)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
          return send(res, 200, { ok: true, sha: cj.sha });
        } catch (e) { if (e.status !== 409 || tries >= 2) throw e; } // the branch moved: try again on top of it
      }
    }
    return send(res, 404, { error: "Unknown request" });
  } catch (e) {
    return send(res, e.status || 500, { error: e.message || "Server error" });
  }
};
