/* =========================================================
   PHOTO PAGE
   Top: a morph slider (WebGL) that melts between the featured photos.
   Below: a drift wall, an endless tilted wall of tiles drifting past.
   Data comes from window.PHOTOS in assets/projects.js.
   ========================================================= */
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const pad = n => String(n).padStart(2, "0");
  const reduce = !!window.CALM;

  const MORPH = { duration: 1.1, intensity: 0.55, scale: 2.4, aberration: 0.35, drift: 0.4, autoplay: true, delay: 5 };
  const WALL = { tile: 260, gap: 18, tilt: 22, turn: -14, speed: 42, variance: 0.45, parallax: 0.6, lift: 64, dim: 0.55 };

  const photos = () => window.PHOTOS || [];
  const featured = () => { const f = photos().filter(p => p.featured).slice(0, 10); return f.length ? f : photos().slice(0, 10); };
  const label = p => [p.place, p.year].filter(Boolean).join(", ");

  function html() {
    const f = featured(), all = photos();
    return `
      <div class="pg pg--photo">
        <section class="morph" data-in aria-roledescription="carousel" aria-label="Featured photos" tabindex="0">
          <div class="morph__stage">
            <canvas class="morph__canvas" aria-hidden="true"></canvas>
            ${f.map((p, k) => `<img class="morph__img${k ? "" : " is-on"}" src="${esc(p.image)}" alt="${esc(p.title)}" draggable="false"${k ? ' loading="lazy"' : ""}>`).join("")}
          </div>
          <div class="morph__cap" aria-live="polite">
            <span class="morph__idx"><b>01</b>/${pad(f.length)}</span>
            <h1 class="morph__title">${esc(f[0] ? f[0].title : "")}</h1>
            <span class="morph__meta">${esc(f[0] ? label(f[0]) : "")}</span>
          </div>
          <div class="morph__ctrl">
            <button class="morph__arrow" type="button" data-morph="-1" aria-label="Previous photo">←</button>
            <div class="morph__dots">${f.map((p, k) => `<button type="button" data-dot="${k}" aria-label="Photo ${k + 1}"${k ? "" : ' aria-current="true"'}></button>`).join("")}</div>
            <button class="morph__arrow" type="button" data-morph="1" aria-label="Next photo">→</button>
          </div>
        </section>
        <header class="photo__head" data-in>
          <p class="photo__k">Photo</p>
          <h2 class="photo__t">Frames from the road</h2>
          <p class="photo__n">${pad(all.length)} photos · tap one to view it</p>
        </header>
        <section class="drift" data-in aria-label="All photos">
          <div class="drift__plane"></div>
        </section>
      </div>`;
  }

  /* ---------------- morph slider ---------------- */
  const VERT = `attribute vec2 p; varying vec2 vUv; void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
  const FRAG = `precision highp float;
    varying vec2 vUv;
    uniform sampler2D tA, tB; uniform vec2 res, sizeA, sizeB;
    uniform float prog, dir, time, intensity, scale, aberration, drift;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
      return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0., a = .5; for (int i = 0; i < 5; i++) { v += a * n(p); p *= 2.03; a *= .5; } return v; }
    vec2 cover(vec2 uv, vec2 img){ float r = (res.x / res.y) / (img.x / img.y);
      return r > 1. ? vec2(uv.x, (uv.y - .5) / r + .5) : vec2((uv.x - .5) * r + .5, uv.y); }
    vec3 tex(sampler2D t, vec2 uv, vec2 size, float ab){
      vec2 c = cover(uv, size); vec2 o = vec2(ab, 0.);
      return vec3(texture2D(t, c + o).r, texture2D(t, c).g, texture2D(t, c - o).b); }
    void main(){
      vec2 uv = vec2(vUv.x, 1. - vUv.y);
      float nz = fbm(uv * scale + vec2(time * drift * .15, 0.));
      // the wipe travels across in the slide direction, broken up by the noise
      float along = dir > 0. ? uv.x : 1. - uv.x;
      float m = smoothstep(.0, .22, prog * 1.45 - along * .45 - nz * .55 + .05);
      float wob = sin(prog * 3.14159);
      vec2 dA = vec2(dir * .12, .5) * (nz - .2) * m * intensity;
      vec2 dB = vec2(-dir * .12, -.5) * (nz - .2) * (1. - m) * intensity;
      float ab = aberration * .025 * wob * (nz - .4);
      vec3 a = tex(tA, uv + dA, sizeA, ab), b = tex(tB, uv + dB, sizeB, ab);
      gl_FragColor = vec4(mix(a, b, m), 1.);
    }`;

  function morph(root, list, gsap) {
    const canvas = root.querySelector(".morph__canvas"), imgs = [...root.querySelectorAll(".morph__img")];
    const idxEl = root.querySelector(".morph__idx b"), titleEl = root.querySelector(".morph__title"), metaEl = root.querySelector(".morph__meta");
    const dots = [...root.querySelectorAll("[data-dot]")];
    let cur = 0, busy = false, timer = null, hover = false;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
    let draw = null, texs = [];

    if (gl && list.length > 1) {
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
      const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(pr);
      if (gl.getProgramParameter(pr, gl.LINK_STATUS)) {
        gl.useProgram(pr);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const U = name => gl.getUniformLocation(pr, name);
        const u = Object.fromEntries(["tA", "tB", "res", "sizeA", "sizeB", "prog", "dir", "time", "intensity", "scale", "aberration", "drift"].map(k => [k, U(k)]));
        gl.uniform1i(u.tA, 0); gl.uniform1i(u.tB, 1);
        gl.uniform1f(u.intensity, MORPH.intensity); gl.uniform1f(u.scale, MORPH.scale); gl.uniform1f(u.aberration, MORPH.aberration); gl.uniform1f(u.drift, MORPH.drift);
        texs = list.map(() => ({ t: null, w: 1, h: 1 }));
        const upload = k => {
          const im = imgs[k], slot = texs[k];
          if (slot.t || !im.complete || !im.naturalWidth) return !!slot.t;
          slot.t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, slot.t);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
          [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          slot.w = im.naturalWidth; slot.h = im.naturalHeight; return true;
        };
        const fit = () => {
          const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect();
          canvas.width = Math.max(1, Math.round(r.width * dpr)); canvas.height = Math.max(1, Math.round(r.height * dpr));
          gl.viewport(0, 0, canvas.width, canvas.height);
        };
        draw = (a, b, p, dir) => {
          if (!upload(a) || !upload(b)) return false;
          if (canvas.width < 2) fit();
          gl.uniform2f(u.res, canvas.width, canvas.height);
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texs[a].t); gl.uniform2f(u.sizeA, texs[a].w, texs[a].h);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texs[b].t); gl.uniform2f(u.sizeB, texs[b].w, texs[b].h);
          gl.uniform1f(u.prog, p); gl.uniform1f(u.dir, dir); gl.uniform1f(u.time, performance.now() / 1000);
          gl.drawArrays(gl.TRIANGLES, 0, 3); return true;
        };
        draw.fit = fit;
        // preload every featured image so the melt never waits
        imgs.forEach(im => { im.loading = "eager"; });
      }
    }
    if (draw) root.classList.add("is-gl");

    const caption = k => {
      const p = list[k];
      idxEl.textContent = pad(k + 1); titleEl.textContent = p.title; metaEl.textContent = label(p);
      dots.forEach((d, i) => d.toggleAttribute("aria-current", i === k));
      gsap.fromTo([titleEl, metaEl], { opacity: 0, filter: "blur(8px)", y: 10 }, { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.6, stagger: 0.06, ease: "power2.out" });
    };
    const settle = k => { imgs.forEach((im, i) => im.classList.toggle("is-on", i === k)); canvas.style.opacity = 0; };

    // progress state shared by buttons, autoplay and drag
    const st = { p: 0 };
    let from = 0, to = 0, dir = 1, tween = null;
    const render = () => { if (draw && draw(from, to, st.p, dir)) canvas.style.opacity = 1; };
    function begin(next, d) {
      from = cur; to = (next + list.length) % list.length; dir = d;
      if (draw) { draw.fit(); render(); }
    }
    function finish(done) {
      tween && tween.kill();
      const target = done ? 1 : 0;
      if (!draw || reduce) { st.p = target; end(done); return; }
      tween = gsap.to(st, { p: target, duration: MORPH.duration * Math.max(0.3, Math.abs(target - st.p)), ease: "power2.inOut", onUpdate: render, onComplete: () => end(done) });
    }
    function end(done) {
      if (done) { cur = to; caption(cur); }
      settle(cur); st.p = 0; busy = false; schedule();
    }
    function go(next, d) {
      if (busy || list.length < 2) return;
      next = (next + list.length) % list.length; if (next === cur) return;
      busy = true; begin(next, d ?? (next > cur ? 1 : -1)); st.p = 0; finish(true);
    }
    function schedule() {
      clearTimeout(timer);
      if (!MORPH.autoplay || reduce || list.length < 2) return;
      timer = setTimeout(() => { if (!root.isConnected) return; if (hover || document.hidden) return schedule(); go(cur + 1, 1); }, MORPH.delay * 1000);
    }

    root.querySelectorAll("[data-morph]").forEach(b => b.addEventListener("click", () => go(cur + +b.dataset.morph, +b.dataset.morph)));
    dots.forEach(b => b.addEventListener("click", () => go(+b.dataset.dot)));
    root.addEventListener("keydown", e => { if (e.key === "ArrowRight") go(cur + 1, 1); if (e.key === "ArrowLeft") go(cur - 1, -1); });
    root.addEventListener("pointerenter", e => e.pointerType === "mouse" && (hover = true));
    root.addEventListener("pointerleave", () => (hover = false));

    // drag / swipe scrubs the melt; let go past a quarter to finish it
    const stage = root.querySelector(".morph__stage");
    let drag = null;
    stage.addEventListener("pointerdown", e => { if (busy) return; drag = { x: e.clientX, y: e.clientY, on: false, id: e.pointerId }; });
    stage.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (!drag.on) {
        if (Math.abs(e.clientY - drag.y) > Math.abs(dx) + 4) { drag = null; return; }
        if (Math.abs(dx) < 8) return;
        drag.on = true; busy = true; clearTimeout(timer); stage.setPointerCapture(drag.id);
        const d = dx < 0 ? 1 : -1; begin(cur + d, d); drag.d = d;
      }
      st.p = Math.max(0, Math.min(1, (-dx * drag.d) / (stage.clientWidth * 0.6))); render();
    });
    const release = () => { if (!drag) return; const was = drag; drag = null; if (was.on) finish(st.p > 0.25); };
    stage.addEventListener("pointerup", release); stage.addEventListener("pointercancel", release);

    if (draw) {
      let rz = 0;
      const onResize = () => { if (!root.isConnected) return removeEventListener("resize", onResize); cancelAnimationFrame(rz); rz = requestAnimationFrame(() => draw.fit()); };
      addEventListener("resize", onResize);
    }
    schedule();
  }

  /* ---------------- drift wall ---------------- */
  function wall(root, list, open) {
    const plane = root.querySelector(".drift__plane");
    const mobile = innerWidth <= 760;
    const COLS = mobile ? 4 : 6, TW = mobile ? 150 : WALL.tile, GAP = mobile ? 12 : WALL.gap;
    const SHAPES = [4 / 3, 3 / 4, 1, 4 / 5, 3 / 2, 5 / 4];
    const cols = Array.from({ length: COLS }, () => []);
    list.forEach((p, k) => cols[k % COLS].push(k));
    // each column needs enough tiles to cover the wall twice for a seamless loop
    plane.style.setProperty("--tw", TW + "px"); plane.style.setProperty("--gap", GAP + "px");
    plane.innerHTML = cols.map((ids, c) => {
      if (!ids.length) ids = [c % list.length];
      let seq = [...ids]; while (seq.length < 8) seq = seq.concat(ids);
      const tiles = seq.map(k => {
        const p = list[k], ar = SHAPES[(k + c) % SHAPES.length];
        return `<button class="drift__tile" type="button" data-photo="${k}" style="aspect-ratio:${ar}"aria-label="Open ${esc(p.title)}"><img src="${esc(p.image)}" alt="" loading="lazy" decoding="async" draggable="false"></button>`;
      }).join("");
      return `<div class="drift__col"><div class="drift__track">${tiles}${tiles.replace(/<button /g, '<button tabindex="-1" aria-hidden="true" ')}</div></div>`;
    }).join("");

    const tracks = [...plane.querySelectorAll(".drift__track")];
    const state = tracks.map((t, i) => ({ t, y: -Math.random() * 400, v: WALL.speed * (1 + (Math.random() * 2 - 1) * WALL.variance) * (i % 2 ? 1 : -1), k: 1, h: 0 }));
    const measure = () => state.forEach(s => (s.h = s.t.scrollHeight / 2));
    measure();
    plane.querySelectorAll("img").forEach(im => im.complete || im.addEventListener("load", measure, { once: true }));

    // hover: lift the tile, dim the rest, slow its column down
    let active = null;
    const setActive = el => {
      if (active === el) return;
      active && active.classList.remove("is-active"); active = el;
      plane.classList.toggle("has-active", !!el);
      if (el) el.classList.add("is-active");
      state.forEach(s => (s.hold = el && s.t.contains(el)));
    };
    plane.addEventListener("pointerover", e => e.pointerType === "mouse" && setActive(e.target.closest(".drift__tile")));
    plane.addEventListener("pointerleave", () => setActive(null));
    plane.addEventListener("focusin", e => setActive(e.target.closest(".drift__tile")));
    plane.addEventListener("focusout", () => setActive(null));
    plane.addEventListener("click", e => { const b = e.target.closest(".drift__tile"); if (b) open(+b.dataset.photo); });

    // pointer adds a damped parallax tilt to the whole plane
    const aim = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
    const onMove = e => { const r = root.getBoundingClientRect(); aim.x = ((e.clientX - r.left) / r.width - 0.5) * 2; aim.y = ((e.clientY - r.top) / r.height - 0.5) * 2; };
    root.addEventListener("pointermove", onMove, { passive: true });
    root.addEventListener("pointerleave", () => { aim.x = 0; aim.y = 0; });

    let visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(root);
    const place = () => {
      plane.style.transform = `translate(-50%, -50%) rotateX(${WALL.tilt - cur.y * 6 * WALL.parallax}deg) rotateZ(${WALL.turn + cur.x * 5 * WALL.parallax}deg)`;
      state.forEach(s => (s.t.style.transform = `translate3d(0, ${s.y}px, 0)`));
    };
    let last = performance.now();
    const tick = now => {
      if (!root.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (visible && !document.hidden) {
        cur.x += (aim.x - cur.x) * 0.06; cur.y += (aim.y - cur.y) * 0.06;
        state.forEach(s => {
          s.k += ((s.hold ? 0.08 : 1) - s.k) * 0.08;
          if (!s.h) return;
          s.y += s.v * s.k * dt;
          if (s.y <= -s.h) s.y += s.h; if (s.y > 0) s.y -= s.h;
        });
        place();
      }
      requestAnimationFrame(tick);
    };
    place();
    if (!reduce) requestAnimationFrame(tick);
  }

  function setup(page, { gsap, openPhoto }) {
    const m = page.querySelector(".morph"), w = page.querySelector(".drift");
    if (m) morph(m, featured(), gsap);
    if (w) wall(w, photos(), k => openPhoto(k, photos().map(p => ({ image: p.image, title: [p.title, label(p)].filter(Boolean).join(" — ") }))));
  }

  window.PhotoPage = { html, setup };
})();
