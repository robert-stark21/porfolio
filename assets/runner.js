/* =========================================================
   ABOUT: the running mascot
   Driven by scrolling: as the stage scrolls up, Phu runs in from the
   left and the armour assembles onto him step by step (suit-up frames),
   while six work tools fly out of his chest and circle him. Once the
   suit is complete he keeps running on his own (armored-run loop).
   Scrolling back up takes him back through the earlier steps.
   Art: images/mascot/run/ (sprites are 8 frames of 512 x 640 in a row).
   Hover slows the tools and opens them into a loose circle.
   ========================================================= */
(() => {
  const DIR = "images/mascot/run/";
  const VER = "?v=7"; // bump when the art in images/mascot/run/ is replaced, so browsers fetch the new files
  const FW = 512, FH = 640, RUN_MS = 140, ORBIT_S = 6.4;
  const TOOLS = ["website", "wacom-tablet", "laptop", "mobile", "ux-flow", "ui-design"];
  const cache = {};
  const load = src => cache[src] || (cache[src] = new Promise((ok, no) => {
    const im = new Image(); im.decoding = "async"; im.src = DIR + src + VER;
    im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => ok(im)); im.onerror = no;
  }));

  // the track is taller than the stage: the stage stays pinned in the middle of the window while the track scrolls past
  const html = label => `<div class="runner-track" data-in><div class="runner" role="img" aria-label="${label}"><canvas aria-hidden="true"></canvas></div></div>`;

  function setup(box, { page, reduce }) {
    if (!box) return () => {};
    const cv = box.querySelector("canvas"), cx = cv.getContext("2d");
    let W = 0, H = 0, dpr = 1, imgs = null, raf = 0, last = 0, t = 0, onScreen = false, dead = false;
    let hover = 0, hoverTo = 0, spin = 0, prog = reduce ? 1 : 0, lines = 0;

    // 0 when the stage is coming up into view, 1 just before it un-pins at the end of the track
    const track = box.parentElement;
    function target() {
      if (reduce) return 1;
      const vh = innerHeight, tr = track.getBoundingClientRect(), pin = parseFloat(getComputedStyle(box).top) || 0;
      const a = vh * 0.72, b = pin - (tr.height - box.offsetHeight) * 0.92;
      return Math.max(0, Math.min(1, (a - tr.top) / (a - b)));
    }

    // the stage runs from the column to the right edge of the window, like the arrow
    function size() {
      const pr = page.getBoundingClientRect(), r = box.getBoundingClientRect();
      const w = Math.max(200, Math.round(page.clientWidth - (r.left - pr.left)));
      box.style.width = w + "px";
      dpr = Math.min(devicePixelRatio || 1, 2);
      W = w; H = box.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      draw();
    }

    const ease = x => 1 - Math.pow(1 - x, 3);
    const back = x => { const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

    function draw() {
      if (!imgs || !W) return;
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx.clearRect(0, 0, W, H);
      const mh = H * 0.86, mw = mh * FW / FH, ground = H * 0.97;
      const time = t, p = prog, auto = p > 0.985;

      // where he is along the line: quick start, eases into running on the spot near the arrow tip
      const ring = W < 600 ? 0.78 : 0.98, size = mh * 0.25;
      const x0 = -mw * 0.12, x1 = Math.max(x0, W - mw * (0.5 + ring + 0.12) - size * 0.55 - 8);
      const along = ease(p) * 0.9 + p * 0.1;
      const mx = x0 + (x1 - x0) * along;
      const my = ground - mh + Math.sin(p * Math.PI * 6) * H * 0.012;

      // which drawing: a suit-up step for each stretch of scrolling, then the armoured run plays by itself
      let sheet = imgs.suit, frame = Math.min(7, Math.max(0, Math.floor((p - 0.1) / 0.82 * 8)));
      if (reduce) sheet = null;
      else if (auto) { sheet = imgs.run; frame = Math.floor(time * 1000 / RUN_MS) % 8; }

      // speed lines behind him while he runs on the spot
      const still = reduce ? 0 : lines;
      if (still > 0) {
        cx.strokeStyle = "rgba(20,20,20," + (0.22 * still) + ")"; cx.lineWidth = 1.5; cx.lineCap = "round";
        for (let k = 0; k < 3; k++) {
          const ph = (time * 1.8 + k / 3) % 1, len = mw * (0.22 + 0.1 * (k % 2));
          const lx = mx + mw * 0.12 - ph * mw * 0.8, ly = my + mh * (0.5 + k * 0.14);
          cx.globalAlpha = Math.sin(ph * Math.PI);
          cx.beginPath(); cx.moveTo(lx, ly); cx.lineTo(lx - len, ly); cx.stroke();
        }
        cx.globalAlpha = 1;
      }

      // the tools: fly out of his chest one after another, then orbit; behind him when on the far side
      const ocx = mx + mw * 0.5, ocy = my + mh * 0.56;
      const rx = mw * (ring + 0.12 * hover), ry = mh * (0.16 + 0.2 * hover);
      const tools = TOOLS.map((n, i) => {
        const born = reduce ? 1 : Math.max(0, Math.min(1, (p - 0.3 - i * 0.07) / 0.22));
        const a = spin + i * Math.PI * 2 / TOOLS.length, depth = Math.sin(a);
        const k = back(born);
        return {
          im: imgs.tools[i], born, depth,
          x: ocx + Math.cos(a) * rx * k, y: ocy + depth * ry * k - (1 - born) * mh * 0.12,
          s: size * (0.88 + 0.12 * (depth + 1) / 2) * Math.min(1, born * 1.4),
          r: (1 - born) * (i % 2 ? 1.2 : -1.2) + Math.sin(a * 2 + i) * 0.12,
        };
      });
      const put = o => {
        if (o.born <= 0 || o.s <= 1) return;
        cx.save(); cx.translate(o.x, o.y); cx.rotate(o.r);
        cx.globalAlpha = Math.min(1, o.born * 2) * (0.75 + 0.25 * (o.depth + 1) / 2);
        cx.drawImage(o.im, -o.s / 2, -o.s / 2, o.s, o.s); cx.restore();
      };
      tools.filter(o => o.depth < 0).sort((a, b) => a.depth - b.depth).forEach(put);
      if (sheet) cx.drawImage(sheet, frame * FW, 0, FW, FH, mx, my, mw, mh);
      else cx.drawImage(imgs.still, mx, my, mw, mh);
      tools.filter(o => o.depth >= 0).sort((a, b) => a.depth - b.depth).forEach(put);
    }

    function tick(now) {
      raf = 0; if (dead || !onScreen || document.hidden) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      hover += (hoverTo - hover) * Math.min(1, dt * 5);
      t += dt; spin += dt * Math.PI * 2 / ORBIT_S * (1 - 0.7 * hover);
      prog += (target() - prog) * Math.min(1, dt * 9);
      if (Math.abs(target() - prog) < 0.001) prog = target();
      lines += ((prog > 0.985 ? 1 : 0) - lines) * Math.min(1, dt * 4);
      draw();
      raf = requestAnimationFrame(tick);
    }
    const play = () => { if (!raf && !reduce && imgs && onScreen && !dead) { last = 0; raf = requestAnimationFrame(tick); } };

    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; play(); });
    io.observe(box);
    const vis = () => { last = 0; play(); };
    document.addEventListener("visibilitychange", vis);
    addEventListener("resize", size);
    box.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") hoverTo = 1; });
    box.addEventListener("pointerleave", () => (hoverTo = 0));

    Promise.all([load("suit-up.webp"), load("armored-run.webp"), load("armored-running.webp"), ...TOOLS.map(n => load(n + ".webp"))])
      .then(([suit, run, still, ...tools]) => {
        if (dead) return;
        imgs = { suit, run, still, tools };
        prog = target(); size(); play();
      }).catch(() => track.classList.add("is-broken"));
    size();

    return () => {
      dead = true; io.disconnect(); cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", vis); removeEventListener("resize", size);
    };
  }

  window.Runner = { html, setup };
})();
