/* =========================================================
   JOYOUS PAGE
   Outside: a channel page (banner, Phu's blinking head as the
   avatar, filter chips, a grid of thumbnails).
   Inside: each item is a small game, 3D object or space to play with.
   Data comes from window.JOYOUS in assets/projects.js; each item's
   "play" picks one of the experiences in EXP below.
   ========================================================= */
(() => {
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduce = !!window.CALM;
  const THREE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  const LOTTIE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js";
  const KINDS = ["Game", "3D object", "Space", "Toy"];

  const data = () => window.JOYOUS || { items: [] };
  const items = () => data().items || [];
  const plural = k => (k === "3D object" ? "3D objects" : k === "Toy" ? "Toys" : k + "s");

  /* ---------------- channel page ---------------- */
  function card(it) {
    return `
      <a class="joy-card" href="#joyous/${esc(it.slug)}" data-route="joyous/${esc(it.slug)}" data-kind="${esc(it.kind)}">
        <span class="joy-card__thumb"><img src="${esc(it.thumb)}" alt="" loading="lazy" decoding="async"><span class="joy-card__badge">${esc(it.kind)}</span><span class="joy-card__play" aria-hidden="true">Play ▶</span></span>
        <span class="joy-card__row">
          <img class="joy-card__av" src="images/mascot/head.png" alt="" width="36" height="36">
          <span><span class="joy-card__t">${esc(it.title)}</span><span class="joy-card__m">${esc([data().name, it.year].filter(Boolean).join(" · "))}</span></span>
        </span>
      </a>`;
  }
  function channelHTML() {
    const d = data(), list = items();
    const kinds = KINDS.filter(k => list.some(it => it.kind === k));
    return `
      <div class="pg pg--joy">
        <div class="joy-banner" data-in>${d.banner ? `<img src="${esc(d.banner)}" alt="">` : ""}</div>
        <header class="joy-head" data-in>
          <button class="joy-avatar" type="button" id="joyAvatar" aria-label="Phu, say hi"></button>
          <div class="joy-head__txt">
            <h1 class="joy-head__name">${esc(d.name || "Joyous")}</h1>
            <p class="joy-head__meta"><b>${esc(d.handle || "")}</b><span>${list.length} experiences</span><span>${kinds.map(plural).join(", ")}</span></p>
            <p class="joy-head__about">${esc(d.about || "")}</p>
            <div class="joy-head__btns">
              <button class="joy-btn joy-btn--fill" type="button" data-joy-random>Play something ▶</button>
              <a class="joy-btn" href="#contact" data-route="contact">Say hi</a>
            </div>
          </div>
        </header>
        <nav class="joy-chips" data-in aria-label="Filter">
          <button type="button" class="is-on" data-joy-kind="">All</button>
          ${kinds.map(k => `<button type="button" data-joy-kind="${esc(k)}">${esc(plural(k))}</button>`).join("")}
        </nav>
        <div class="joy-grid" data-in>${list.map(card).join("")}</div>
      </div>`;
  }

  /* ---------------- detail page ---------------- */
  function detailHTML(it) {
    const list = items(), i = list.indexOf(it), next = list[(i + 1) % list.length];
    return `
      <div class="pg pg--joyd">
        <section class="joyd" aria-label="${esc(it.title)}">
          <div class="joyd__stage" id="joyStage" tabindex="0"><p class="joyd__loading">Loading…</p></div>
          <div class="joyd__hud" id="joyHud" aria-live="polite"></div>
          <a class="joyd__back" href="#joyous" data-route="joyous" data-in>← Joyous</a>
          <div class="joyd__cap" data-in>
            <p class="joyd__k">${esc(it.kind)} · ${esc(it.year)}</p>
            <h1 class="joyd__t">${esc(it.title)}</h1>
            <p class="joyd__d">${esc(it.desc)}</p>
          </div>
          ${next && next !== it ? `<a class="joyd__next" href="#joyous/${esc(next.slug)}" data-route="joyous/${esc(next.slug)}" data-in>Next · ${esc(next.title)} →</a>` : ""}
        </section>
        <section class="joy-more">
          <h2 class="joy-more__t">More from ${esc(data().name || "Joyous")}</h2>
          <div class="joy-grid">${list.filter(x => x !== it).map(card).join("")}</div>
        </section>
      </div>`;
  }

  /* ---------------- avatar: Phu's head, blinking, glancing at the cursor ---------------- */
  function avatar(box, ctx) {
    const FACES = ["open", "half", "closed", "smile1", "smile2", "smile3"], N = 21;
    const fallback = () => box.insertAdjacentHTML("beforeend", '<img src="images/mascot/head.png" alt="">');
    Promise.all([ctx.loadScript(LOTTIE_SRC, () => window.lottie), ctx.loadScript("assets/lottie/phu-head.js", () => window.PHU_HEAD)]).then(() => {
      if (!box.isConnected) return;
      const anim = window.lottie.loadAnimation({ container: box, renderer: "svg", loop: false, autoplay: false, animationData: window.PHU_HEAD });
      anim.addEventListener("DOMLoaded", () => {
        const faces = Object.fromEntries(FACES.map(f => [f, box.querySelector("#phu-f-" + f)]));
        let face = "", mood = "idle", seq = 0;
        const show = f => { if (f === face) return; face = f; FACES.forEach(k => faces[k] && (faces[k].style.display = k === f ? "" : "none")); };
        const play = (steps, done) => {
          clearTimeout(seq); let k = 0;
          const step = () => { const [f, ms] = steps[k++]; show(f); seq = k < steps.length ? setTimeout(step, ms) : (done && setTimeout(done, ms), 0); };
          step();
        };
        show("open"); box.classList.add("is-ready");
        const aim = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
        const onMove = e => {
          const r = box.getBoundingClientRect();
          aim.x = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (innerWidth * 0.5))) * 0.6;
          aim.y = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (innerHeight * 0.5))) * 0.6;
        };
        addEventListener("pointermove", onMove, { passive: true });
        const smile = on => { mood = on ? "smile" : "idle"; play(on ? [["smile1", 120], ["smile2", 240], ["smile3", 0]] : [["smile2", 160], ["smile1", 120], ["open", 0]]); };
        box.addEventListener("pointerenter", e => e.pointerType === "mouse" && smile(true));
        box.addEventListener("pointerleave", e => e.pointerType === "mouse" && smile(false));
        box.addEventListener("click", () => { smile(true); setTimeout(() => box.isConnected && !box.matches(":hover") && smile(false), 1400); });
        let blinkAt = performance.now() + 1200;
        const tick = now => {
          if (!box.isConnected) { removeEventListener("pointermove", onMove); clearTimeout(seq); anim.destroy(); return; }
          cur.x += (aim.x - cur.x) * 0.08; cur.y += (aim.y - cur.y) * 0.08;
          const col = (cur.x + 1) / 2 * (N - 1), row = Math.round((cur.y + 1) / 2 * (N - 1));
          anim.goToAndStop(row * N + Math.min(col, N - 1.001), true);
          if (mood === "idle" && now > blinkAt) {
            mood = "blink";
            // now and then a double blink
            const twice = Math.random() < 0.3;
            const b = [["half", 60], ["closed", 90], ["half", 60]];
            play([...b, ...(twice ? [["open", 120], ...b] : []), ["open", 0]], () => { mood = "idle"; blinkAt = performance.now() + 1800 + Math.random() * 2800; });
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }).catch(fallback);
  }

  function setupChannel(page, ctx) {
    const box = page.querySelector("#joyAvatar");
    if (box) avatar(box, ctx);
    const cards = [...page.querySelectorAll(".joy-card")];
    page.querySelectorAll("[data-joy-kind]").forEach(b => b.addEventListener("click", () => {
      page.querySelectorAll("[data-joy-kind]").forEach(x => x.classList.toggle("is-on", x === b));
      const k = b.dataset.joyKind, vis = cards.filter(c => !k || c.dataset.kind === k);
      cards.forEach(c => (c.hidden = !vis.includes(c)));
      if (!reduce) ctx.gsap.fromTo(vis, { opacity: 0, y: 16, filter: "blur(6px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.5, stagger: 0.04, ease: "power2.out" });
    }));
    const rnd = page.querySelector("[data-joy-random]");
    if (rnd) rnd.addEventListener("click", () => { const l = items(); const it = l[Math.floor(Math.random() * l.length)]; it && ctx.go("joyous/" + it.slug); });
  }

  /* ---------------- shared bits for the experiences ---------------- */
  function fit2d(stage) {
    const cv = document.createElement("canvas"); cv.className = "joyd__canvas"; stage.append(cv);
    const c = cv.getContext("2d"), s = { cv, c, w: 1, h: 1, dpr: 1 };
    s.resize = () => {
      s.dpr = Math.min(devicePixelRatio || 1, 2); s.w = stage.clientWidth || 1; s.h = stage.clientHeight || 1;
      cv.width = Math.round(s.w * s.dpr); cv.height = Math.round(s.h * s.dpr); c.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    };
    s.resize();
    return s;
  }
  // run fn(dt, t) every frame while the stage is on screen; returns a stopper
  function loop(stage, fn) {
    let raf = 0, last = performance.now(), dead = false;
    const f = now => {
      if (dead || !stage.isConnected) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!document.hidden) fn(dt, now / 1000);
      raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }
  function three(stage, ctx) {
    return ctx.loadScript(THREE_SRC, () => window.THREE).then(() => {
      const T = window.THREE;
      const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 1);
      renderer.domElement.className = "joyd__canvas";
      stage.append(renderer.domElement);
      const size = () => ({ w: stage.clientWidth || 1, h: stage.clientHeight || 1 });
      return { T, renderer, size };
    });
  }
  // drag to turn: returns live {dx, dy} deltas and whether the press was a click
  function dragger(el, { onDrag, onTap, onDown, onUp }) {
    let down = null, moved = 0;
    const d = e => { down = { x: e.clientX, y: e.clientY }; moved = 0; el.setPointerCapture && el.setPointerCapture(e.pointerId); onDown && onDown(e); };
    const m = e => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; moved += Math.abs(dx) + Math.abs(dy); down = { x: e.clientX, y: e.clientY }; onDrag && onDrag(dx, dy, e); };
    const u = e => { if (!down) return; down = null; if (moved < 6 && onTap) onTap(e); onUp && onUp(e); };
    el.addEventListener("pointerdown", d); el.addEventListener("pointermove", m);
    el.addEventListener("pointerup", u); el.addEventListener("pointercancel", u);
  }
  function keys(stage, fn) {
    const k = e => { if (!stage.isConnected) return removeEventListener("keydown", k); if (e.target.closest && e.target.closest("input, textarea")) return; if (fn(e)) e.preventDefault(); };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }
  const best = (key, v) => {
    try { const b = +(localStorage.getItem("joy-" + key) || 0); if (v > b) localStorage.setItem("joy-" + key, v); return Math.max(b, v || 0); } catch (e) { return v || 0; }
  };

  const EXP = {};

  /* ---------- Phu Flies: tap to flap through the gaps ---------- */
  EXP.flappy = (stage, ctx) => {
    const s = fit2d(stage), c = s.c, img = new Image(); img.src = "images/mascot/flying.png";
    let mode = "ready", y = 0, vy = 0, pipes = [], score = 0, top = best("flappy"), t0 = 0, dist = 0;
    const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8 }));
    const U = () => Math.min(s.h, s.w * 1.25);   // size unit: keeps it playable on tall phones
    const reset = () => { y = s.h * 0.45; vy = 0; pipes = []; score = 0; dist = 0; };
    reset();
    const flap = () => {
      if (mode === "over" && performance.now() - t0 < 500) return;
      if (mode !== "play") { reset(); mode = "play"; }
      vy = -0.95 * U(); ctx.sfx && ctx.sfx.tone(720, 0.07, 0.04);
    };
    stage.addEventListener("pointerdown", e => { e.preventDefault(); flap(); });
    const offKeys = keys(stage, e => (e.code === "Space" || e.code === "ArrowUp" ? (flap(), true) : false));
    const ro = new ResizeObserver(() => { const r = y / s.h; s.resize(); y = r * s.h; }); ro.observe(stage);
    const px = () => s.w * (s.w < 700 ? 0.28 : 0.34);
    const stop = loop(stage, (dt, t) => {
      const H = s.h, u = U(), W = s.w, speed = 0.36 * u, gap = Math.max(0.3 * u, 150), pw = Math.max(0.1 * u, 44), every = Math.max(0.62 * u, 260);
      if (mode !== "over") {
        // while waiting for the first tap, Phu flies himself (attract mode)
        if (mode === "ready") { const p = pipes.find(q => q.x + pw > px() - 20); const aim = p ? p.g + gap * 0.12 : H * 0.5; if (y > aim && vy > -0.1 * u) vy = -0.95 * u; }
        vy += 2.6 * u * dt; y += vy * dt; dist += speed * dt;
        if (!pipes.length || W + pw - pipes[pipes.length - 1].x >= every) pipes.push({ x: W + pw, g: H * 0.5 + (Math.random() - 0.5) * Math.min(H * 0.5, u * 0.6), done: false });
        pipes.forEach(p => (p.x -= speed * dt));
        pipes = pipes.filter(p => p.x > -pw * 2);
        const r = u * 0.045, cx = px();
        pipes.forEach(p => {
          if (mode !== "play") return;
          if (!p.done && p.x + pw < cx) { p.done = true; score++; ctx.sfx && ctx.sfx.tone(1200, 0.06, 0.04); }
          if (cx + r > p.x && cx - r < p.x + pw && (y - r < p.g - gap / 2 || y + r > p.g + gap / 2)) die();
        });
        if (mode === "play" && (y > H * 0.92 || y < -H * 0.1)) die();
        if (mode === "ready") y = Math.max(H * 0.08, Math.min(H * 0.85, y));
      } else { vy += 2.6 * u * dt; y = Math.min(H * 0.92, y + vy * dt); }

      // draw
      c.fillStyle = "#050505"; c.fillRect(0, 0, W, H);
      stars.forEach(st => {
        const x = ((st.x * W - dist * st.z * 0.3 - t * 6 * st.z) % W + W) % W;
        c.fillStyle = `rgba(255,255,255,${0.15 + 0.5 * st.z})`; c.fillRect(x, st.y * H * 0.9, 1.5 * st.z + 0.5, 1.5 * st.z + 0.5);
      });
      pipes.forEach(p => {
        c.fillStyle = "#ececec";
        const rr = Math.min(12, pw / 4);
        c.beginPath(); c.roundRect ? c.roundRect(p.x, -20, pw, p.g - gap / 2 + 20, rr) : c.rect(p.x, -20, pw, p.g - gap / 2 + 20); c.fill();
        c.beginPath(); c.roundRect ? c.roundRect(p.x, p.g + gap / 2, pw, H, rr) : c.rect(p.x, p.g + gap / 2, pw, H); c.fill();
        c.fillStyle = "#ff4b3e"; c.fillRect(p.x, p.g - gap / 2 - 10, pw, 10); c.fillRect(p.x, p.g + gap / 2, pw, 10);
      });
      c.fillStyle = "#1a1a1a"; c.fillRect(0, H * 0.94, W, H * 0.06);
      if (img.complete && img.naturalWidth) {
        const h = u * 0.17, w = h * img.naturalWidth / img.naturalHeight;
        c.save(); c.translate(px(), y); c.rotate(Math.max(-0.35, Math.min(0.6, vy / u * 0.35)));
        c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
      }
      c.textAlign = "center"; c.fillStyle = "#fff";
      c.font = `400 ${Math.round(u * 0.12)}px "JetBrains Mono", monospace`;
      if (mode !== "ready") c.fillText(String(score), W / 2, H * 0.2);
      c.font = `500 ${Math.max(14, Math.round(u * 0.026))}px "Inter Tight", sans-serif`;
      const pill = (txt, yy) => {
        const fs = Math.max(14, Math.round(u * 0.026)), tw = c.measureText(txt).width + fs * 2;
        c.fillStyle = "rgba(20,20,20,.88)"; c.beginPath(); c.roundRect ? c.roundRect(W / 2 - tw / 2, yy - fs * 1.3, tw, fs * 2.1, fs) : c.rect(W / 2 - tw / 2, yy - fs * 1.3, tw, fs * 2.1); c.fill();
        c.fillStyle = "#fff"; c.fillText(txt, W / 2, yy);
      };
      if (mode === "ready") pill(W < 600 ? "Tap to fly" : "Tap, click or press space to fly", H * (W < 600 ? 0.64 : 0.84));
      if (mode === "over") pill(`Score ${score} · best ${top} · tap to try again`, H * 0.3);
    });
    function die() { if (mode !== "play") return; mode = "over"; t0 = performance.now(); top = best("flappy", score); vy = -0.4 * U(); ctx.sfx && ctx.sfx.tone(180, 0.25, 0.06); }
    return () => { stop(); offKeys(); ro.disconnect(); };
  };

  /* ---------- Chrome Blob: a liquid metal ball to spin and poke ---------- */
  const NOISE = `
    vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;} vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
    vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);} vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
    float snoise(vec3 v){ const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
      vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx); vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g;
      vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy); vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
      i=mod289(i); vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
      float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
      vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y); vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.)); vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
      vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
      return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3))); }`;
  EXP.blob = (stage, ctx) => {
    let stop = () => {}, ro = null;
    three(stage, ctx).then(({ T, renderer, size }) => {
      if (!stage.isConnected) return renderer.dispose();
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(35, 1, 0.1, 100);
      cam.position.set(0, 0, 6.2);
      const uni = { uTime: { value: 0 }, uAmp: { value: 0.18 }, uFreq: { value: 1.3 }, uPoke: { value: 0 } };
      const mat = new T.ShaderMaterial({
        uniforms: uni,
        vertexShader: NOISE + `
          uniform float uTime, uAmp, uFreq, uPoke; varying vec3 vN, vV;
          float disp(vec3 p){ return snoise(p * uFreq + vec3(0., uTime * .35, 0.)) * uAmp + snoise(p * 2.6 + uTime * .8) * uPoke * .22; }
          vec3 bump(vec3 p){ return p + normalize(p) * disp(p); }
          void main(){
            // displace along the normal, then rebuild the normal from two nearby displaced points
            float R = length(position);
            vec3 n = normalize(position), t = normalize(cross(n, abs(n.y) > .99 ? vec3(1., 0., 0.) : vec3(0., 1., 0.))), b = cross(n, t);
            vec3 p = bump(position), pt = bump(normalize(position + t * .01) * R), pb = bump(normalize(position + b * .01) * R);
            vN = normalize(mat3(modelMatrix) * normalize(cross(pt - p, pb - p)));
            vec4 wp = modelMatrix * vec4(p, 1.); vV = normalize(cameraPosition - wp.xyz);
            gl_Position = projectionMatrix * viewMatrix * wp; }`,
        fragmentShader: `
          varying vec3 vV, vN; uniform float uTime;
          vec3 env(vec3 r){ float y = r.y;
            vec3 c = mix(vec3(.02), vec3(.9), smoothstep(-.1, .7, y));
            c += vec3(1., .45, .35) * smoothstep(.2, 0., abs(y - .05)) * .45;          // warm horizon
            c += vec3(.3, .4, 1.) * smoothstep(.5, 0., abs(r.x + .6)) * smoothstep(-.4, .3, y) * .6;   // blue window
            c += vec3(1.) * pow(max(0., dot(r, normalize(vec3(.5, .8, .4)))), 40.) * 2.;   // key light
            return c; }
          void main(){
            vec3 n = normalize(vN);
            vec3 r = reflect(-vV, n);
            float fr = pow(1. - max(0., dot(n, vV)), 3.);
            vec3 col = env(r) * vec3(.95, .96, 1.) + fr * vec3(.6, .5, 1.) * .5;
            gl_FragColor = vec4(pow(col, vec3(.9)), 1.); }`,
      });
      const ball = new T.Mesh(new T.IcosahedronGeometry(1.25, 40), mat);
      scene.add(ball);
      // floor shadow
      const sh = document.createElement("canvas"); sh.width = sh.height = 128;
      const sc = sh.getContext("2d"), gr = sc.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, "rgba(255,255,255,.22)"); gr.addColorStop(1, "rgba(255,255,255,0)"); sc.fillStyle = gr; sc.fillRect(0, 0, 128, 128);
      const glow = new T.Mesh(new T.PlaneGeometry(4, 4), new T.MeshBasicMaterial({ map: new T.CanvasTexture(sh), transparent: true, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = -1.9; scene.add(glow);
      const spin = { x: 0.3, y: 0, vx: 0, vy: 0.25 };
      let hover = 0, hoverTo = 0;
      dragger(stage, {
        onDrag: (dx, dy) => { spin.vy = dx * 0.6; spin.vx = dy * 0.6; spin.y += dx * 0.01; spin.x += dy * 0.01; },
        onTap: () => { ctx.gsap.fromTo(uni.uPoke, { value: 1.6 }, { value: 0, duration: 1.8, ease: "power2.out" }); ctx.gsap.fromTo(ball.scale, { x: 0.86, y: 1.12, z: 0.86 }, { x: 1, y: 1, z: 1, duration: 1.2, ease: "elastic.out(1, .3)" }); ctx.sfx && ctx.sfx.tone(320, 0.2, 0.05); },
      });
      stage.addEventListener("pointermove", e => { const r = stage.getBoundingClientRect(); hoverTo = 1 - Math.min(1, Math.hypot(e.clientX - r.left - r.width / 2, e.clientY - r.top - r.height / 2) / (r.height * 0.5)); });
      stage.addEventListener("pointerleave", () => (hoverTo = 0));
      const resize = () => { const { w, h } = size(); renderer.setSize(w, h); cam.aspect = w / h; cam.position.z = w / h < 0.8 ? 9 : 7; cam.updateProjectionMatrix(); };
      ro = new ResizeObserver(resize); ro.observe(stage); resize();
      stage.querySelector(".joyd__loading")?.remove();
      stop = loop(stage, (dt, t) => {
        uni.uTime.value = t;
        hover += (hoverTo - hover) * 0.06; uni.uAmp.value = 0.15 + hover * 0.1; uni.uFreq.value = 1.15 + hover * 0.35;
        spin.vy += (0.25 - spin.vy) * 0.02; spin.vx *= 0.95;
        spin.y += spin.vy * dt; spin.x += spin.vx * dt; spin.x += (0.3 - spin.x) * 0.01;
        ball.rotation.set(spin.x, spin.y, 0);
        ball.position.y = Math.sin(t * 1.2) * 0.08;
        renderer.render(scene, cam);
      });
      stop.renderer = renderer;
    }).catch(() => fail(stage));
    return () => { stop(); ro && ro.disconnect(); stop.renderer && stop.renderer.dispose(); };
  };

  /* ---------- Tiny Island: a floating island to turn around and plant trees on ---------- */
  EXP.island = (stage, ctx) => {
    let stop = () => {}, ro = null, rend = null;
    three(stage, ctx).then(({ T, renderer, size }) => {
      if (!stage.isConnected) return renderer.dispose();
      rend = renderer;
      renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(40, 1, 0.1, 200);
      scene.fog = new T.Fog(0x000000, 18, 40);
      scene.add(new T.HemisphereLight(0xdfe9ff, 0x2a1d14, 0.75));
      const sun = new T.DirectionalLight(0xfff1dc, 1.1); sun.position.set(6, 10, 4); sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 }); scene.add(sun);
      const world = new T.Group(); scene.add(world);
      const flat = c => new T.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 });
      const jitter = (geo, a) => { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (Math.random() - .5) * a, p.getY(i) + (Math.random() - .5) * a * .6, p.getZ(i) + (Math.random() - .5) * a); geo.computeVertexNormals(); return geo; };
      const top = new T.Mesh(new T.CylinderGeometry(3.2, 3, 0.5, 10, 1), flat(0x6fb35a)); top.receiveShadow = true; world.add(top);
      const dirt = new T.Mesh(jitter(new T.ConeGeometry(3, 3.6, 10, 3), 0.25), flat(0x8b6447)); dirt.rotation.x = Math.PI; dirt.position.y = -2.05; world.add(dirt);
      const rockM = flat(0x9a9a9a), trunkM = flat(0x6b4a33), leafM = [flat(0x3f9b5a), flat(0x58b26a), flat(0x2f7d4b)];
      function tree(x, z, s = 1) {
        const t = new T.Group();
        const tr = new T.Mesh(new T.CylinderGeometry(0.06, 0.09, 0.5, 6), trunkM); tr.position.y = 0.25; tr.castShadow = true; t.add(tr);
        for (let k = 0; k < 2; k++) { const l = new T.Mesh(new T.ConeGeometry(0.42 - k * 0.1, 0.7, 7), leafM[(Math.random() * 3) | 0]); l.position.y = 0.7 + k * 0.32; l.castShadow = true; t.add(l); }
        t.position.set(x, 0.25, z); t.scale.setScalar(s); t.rotation.y = Math.random() * 6; world.add(t); return t;
      }
      // a hut, a few trees and rocks
      const hut = new T.Group();
      const walls = new T.Mesh(new T.BoxGeometry(0.9, 0.6, 0.8), flat(0xf1e6d2)); walls.position.y = 0.3; walls.castShadow = true; hut.add(walls);
      const roof = new T.Mesh(new T.ConeGeometry(0.8, 0.55, 4), flat(0xff4b3e)); roof.position.y = 0.87; roof.rotation.y = Math.PI / 4; roof.castShadow = true; hut.add(roof);
      const door = new T.Mesh(new T.BoxGeometry(0.22, 0.34, 0.02), flat(0x3b2a1e)); door.position.set(0, 0.17, 0.41); hut.add(door);
      hut.position.set(-0.6, 0.25, 0.3); hut.rotation.y = 0.5; world.add(hut);
      [[1.6, -0.8, 1.1], [2.1, 0.6, 0.8], [-1.9, -1.2, 1], [0.6, -2.0, 0.9], [-2.3, 0.9, 0.7], [1.1, 1.9, 1.05]].forEach(a => tree(...a));
      [[1.2, 0.4], [-1.2, 1.9], [2.4, -1.7]].forEach(([x, z]) => { const r = new T.Mesh(new T.DodecahedronGeometry(0.22 + Math.random() * 0.15, 0), rockM); r.position.set(x, 0.32, z); r.castShadow = true; world.add(r); });
      // clouds and stars
      const clouds = new T.Group(), cloudM = new T.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 });
      for (let k = 0; k < 4; k++) {
        const cl = new T.Group();
        for (let j = 0; j < 4; j++) { const b = new T.Mesh(new T.IcosahedronGeometry(0.35 + Math.random() * 0.25, 0), cloudM); b.position.set(j * 0.45 - 0.7, Math.random() * 0.2, Math.random() * 0.3); cl.add(b); }
        const a = k / 4 * Math.PI * 2; cl.position.set(Math.cos(a) * 8, 0.6 + Math.random() * 1.6, Math.sin(a) * 8); cl.scale.setScalar(0.45); cl.userData.a = a; clouds.add(cl);
      }
      scene.add(clouds);
      const sp = new Float32Array(1500 * 3);
      for (let i = 0; i < 1500; i++) { const v = new T.Vector3().randomDirection ? new T.Vector3().randomDirection() : new T.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize(); v.multiplyScalar(30 + Math.random() * 30); sp.set([v.x, v.y, v.z], i * 3); }
      const sg = new T.BufferGeometry(); sg.setAttribute("position", new T.BufferAttribute(sp, 3));
      scene.add(new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 0.12, fog: false })));

      const orbit = { th: 0.6, ph: 1.08, r: 11, vth: 0 };
      let idle = 0, planted = 0;
      const ray = new T.Raycaster(), ndc = new T.Vector2();
      dragger(stage, {
        onDrag: (dx, dy) => { orbit.th -= dx * 0.006; orbit.vth = -dx * 0.3; orbit.ph = Math.max(0.5, Math.min(1.45, orbit.ph - dy * 0.004)); idle = 0; },
        onTap: e => {
          const r = stage.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
          ray.setFromCamera(ndc, cam);
          const hit = ray.intersectObject(top)[0];
          if (!hit || planted > 40) return;
          const p = world.worldToLocal(hit.point.clone());
          if (Math.hypot(p.x, p.z) > 2.9) return;
          const t = tree(p.x, p.z, 0.001); planted++;
          ctx.gsap.to(t.scale, { x: 0.8 + Math.random() * 0.4, y: 0.8 + Math.random() * 0.4, z: 0.8 + Math.random() * 0.4, duration: 0.9, ease: "elastic.out(1, .4)" });
          ctx.sfx && ctx.sfx.tone(520 + Math.random() * 300, 0.12, 0.05);
        },
      });
      const resize = () => { const { w, h } = size(); renderer.setSize(w, h); cam.aspect = w / h; orbit.r = w / h < 0.8 ? 16 : 11; cam.updateProjectionMatrix(); };
      ro = new ResizeObserver(resize); ro.observe(stage); resize();
      stage.querySelector(".joyd__loading")?.remove();
      stop = loop(stage, (dt, t) => {
        idle += dt;
        orbit.vth *= 0.94; orbit.th += orbit.vth * dt + (idle > 2 ? dt * 0.08 : 0);
        cam.position.set(Math.sin(orbit.ph) * Math.sin(orbit.th) * orbit.r, Math.cos(orbit.ph) * orbit.r, Math.sin(orbit.ph) * Math.cos(orbit.th) * orbit.r);
        cam.lookAt(0, -0.6, 0);
        world.position.y = Math.sin(t * 0.8) * 0.12;
        clouds.children.forEach((cl, k) => { const a = cl.userData.a + t * 0.05; cl.position.x = Math.cos(a) * 8; cl.position.z = Math.sin(a) * 8; });
        renderer.render(scene, cam);
      });
    }).catch(() => fail(stage));
    return () => { stop(); ro && ro.disconnect(); rend && rend.dispose(); };
  };

  /* ---------- Stack: drop each sliding block on the last one ---------- */
  EXP.stack = (stage, ctx) => {
    let stop = () => {}, ro = null, rend = null, offKeys = () => {};
    three(stage, ctx).then(({ T, renderer, size }) => {
      if (!stage.isConnected) return renderer.dispose();
      rend = renderer;
      const scene = new T.Scene(), H = 0.36;
      const cam = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
      scene.add(new T.AmbientLight(0xffffff, 0.55));
      const dl = new T.DirectionalLight(0xffffff, 0.7); dl.position.set(3, 8, 5); scene.add(dl);
      const hud = stage.parentElement.querySelector("#joyHud");
      let blocks = [], falling = [], moving = null, mode = "ready", score = 0, top = best("stack"), camY = 0, hue = Math.random() * 360;
      const color = n => new T.Color(`hsl(${Math.round(hue + n * 7) % 360}, 62%, 60%)`);
      const box = (w, d, n) => { const m = new T.Mesh(new T.BoxGeometry(w, H, d), new T.MeshLambertMaterial({ color: color(n) })); scene.add(m); return m; };
      const say = (html) => { if (hud) hud.innerHTML = html; };
      function reset() {
        [...blocks, ...falling].forEach(b => { scene.remove(b.m); b.m.geometry.dispose(); });
        blocks = []; falling = []; score = 0; camY = 0; hue = Math.random() * 360;
        const base = { m: box(3, 3, 0), w: 3, d: 3, x: 0, z: 0, y: 0 }; base.m.position.set(0, 0, 0);
        const foot = box(3, 3, 0); foot.scale.y = 20; foot.position.y = -H * 10.5; blocks.push(base, { m: foot, w: 3, d: 3, x: 0, z: 0, y: -99 });
        moving = null; mode = "ready";
        say(`<span>Tap or press space to start · best ${top}</span>`);
      }
      function spawn() {
        const last = blocks[0], n = score + 1, axis = n % 2 ? "x" : "z";
        const b = { m: box(last.w, last.d, n), w: last.w, d: last.d, x: last.x, z: last.z, y: n * H, axis, t: 0, dir: 1 };
        b[axis] = -4.5; b.m.position.set(b.x, b.y, b.z); moving = b;
      }
      function place() {
        if (mode === "ready") { mode = "play"; say(`<b>0</b>`); spawn(); return; }
        if (mode === "over") { reset(); return; }
        const b = moving, last = blocks[0], ax = b.axis, sz = ax === "x" ? "w" : "d";
        const delta = b[ax] - last[ax], over = last[sz] - Math.abs(delta);
        if (over <= 0) { // missed: let it fall
          falling.push({ m: b.m, v: 0, r: (Math.random() - .5) * 2 }); moving = null; mode = "over";
          top = best("stack", score); say(`<b>${score}</b><span>Best ${top} · tap to play again</span>`);
          ctx.sfx && ctx.sfx.tone(160, 0.3, 0.06); return;
        }
        const perfect = Math.abs(delta) < 0.06;
        if (perfect) b[ax] = last[ax];
        else {
          // keep the overlap, drop the part that hangs over the edge
          const cut = Math.abs(delta), side = Math.sign(delta);
          b[sz] = over; b[ax] = last[ax] + delta / 2;
          const pm = box(ax === "x" ? cut : b.w, ax === "z" ? cut : b.d, score + 1);
          pm.position.set(b.x, b.y, b.z); pm.position[ax] = b[ax] + side * (over / 2 + cut / 2);
          falling.push({ m: pm, v: 0, r: side * (ax === "x" ? -1 : 1) });
          scene.remove(b.m); b.m.geometry.dispose(); b.m = box(b.w, b.d, score + 1);
        }
        b.m.position.set(b.x, b.y, b.z);
        if (perfect) ctx.gsap.fromTo(b.m.material.emissive, { r: 0.45, g: 0.45, b: 0.45 }, { r: 0, g: 0, b: 0, duration: 0.5 });
        blocks.unshift(b); score++; moving = null;
        say(`<b>${score}</b>${perfect ? "<span>Perfect</span>" : ""}`);
        ctx.sfx && ctx.sfx.tone(perfect ? 1320 : 660 + score * 12, 0.08, 0.05);
        spawn();
      }
      stage.addEventListener("pointerdown", e => { e.preventDefault(); place(); });
      offKeys = keys(stage, e => (e.code === "Space" ? (place(), true) : false));
      const resize = () => {
        const { w, h } = size(); renderer.setSize(w, h);
        const a = w / h, v = a < 0.8 ? 10.5 : 5.8;
        Object.assign(cam, { left: -v * a, right: v * a, top: v, bottom: -v }); cam.updateProjectionMatrix();
      };
      ro = new ResizeObserver(resize); ro.observe(stage); resize();
      stage.querySelector(".joyd__loading")?.remove();
      reset();
      stop = loop(stage, (dt, t) => {
        if (moving) {
          const sp = 3.2 + Math.min(score, 30) * 0.12, ax = moving.axis;
          moving[ax] += moving.dir * sp * dt;
          if (Math.abs(moving[ax]) > 4.5) moving.dir *= -1, (moving[ax] = Math.sign(moving[ax]) * 4.5);
          moving.m.position[ax] = moving[ax];
        }
        falling.forEach(f => { f.v += 18 * dt; f.m.position.y -= f.v * dt; f.m.rotation.z += f.r * dt; });
        falling = falling.filter(f => (f.m.position.y > camY - 30 ? true : (scene.remove(f.m), f.m.geometry.dispose(), false)));
        camY += (score * H - camY) * Math.min(1, dt * 4);
        if (mode === "ready") { cam.position.set(Math.sin(t * 0.3) * 0.6 + 6, camY + 6, 6); } else cam.position.set(6, camY + 6, 6);
        cam.lookAt(0, camY - 0.5, 0);
        renderer.render(scene, cam);
      });
    }).catch(() => fail(stage));
    return () => { stop(); offKeys(); ro && ro.disconnect(); rend && rend.dispose(); };
  };

  /* ---------- Galaxy: a spiral of stars; hold to pull it in ---------- */
  EXP.galaxy = (stage, ctx) => {
    let stop = () => {}, ro = null, rend = null;
    three(stage, ctx).then(({ T, renderer, size }) => {
      if (!stage.isConnected) return renderer.dispose();
      rend = renderer;
      const scene = new T.Scene(), cam = new T.PerspectiveCamera(50, 1, 0.1, 100);
      const N = innerWidth < 760 ? 24000 : 42000, R = 5, ARMS = 4;
      const aR = new Float32Array(N), aA = new Float32Array(N), off = new Float32Array(N * 3), col = new Float32Array(N * 3), pos = new Float32Array(N * 3);
      const inner = new T.Color("#ff8a3d"), outer = new T.Color("#4b6bff"), c = new T.Color();
      for (let i = 0; i < N; i++) {
        const r = Math.pow(Math.random(), 1.6) * R, arm = (i % ARMS) / ARMS * Math.PI * 2;
        aR[i] = r; aA[i] = arm + r * 0.9;
        const sp = 0.35 * (0.3 + r * 0.25);
        const rnd = () => Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * sp * 1.6;
        off.set([rnd(), rnd() * 0.5, rnd()], i * 3);
        c.copy(inner).lerp(outer, r / R); if (Math.random() < 0.04) c.set("#ffffff");
        col.set([c.r, c.g, c.b], i * 3);
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.BufferAttribute(pos, 3));
      geo.setAttribute("aR", new T.BufferAttribute(aR, 1)); geo.setAttribute("aA", new T.BufferAttribute(aA, 1));
      geo.setAttribute("aOff", new T.BufferAttribute(off, 3)); geo.setAttribute("color", new T.BufferAttribute(col, 3));
      const uni = { uTime: { value: 0 }, uPull: { value: 0 }, uSize: { value: 44 * renderer.getPixelRatio() } };
      const mat = new T.ShaderMaterial({
        uniforms: uni, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
        vertexShader: `
          uniform float uTime, uPull, uSize; attribute float aR, aA; attribute vec3 aOff; varying vec3 vC;
          void main(){
            float r = aR * (1. - .6 * uPull);
            float a = aA + uTime * (.5 / (.4 + aR)) * (1. + 3. * uPull);
            vec3 p = vec3(cos(a) * r, 0., sin(a) * r) + aOff * (1. - .5 * uPull);
            vec4 mv = modelViewMatrix * vec4(p, 1.);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = uSize * (.2 + .25 / (.3 + aR * .2)) / -mv.z;
            vC = color * (1. + uPull * .6); }`,
        fragmentShader: `
          varying vec3 vC;
          void main(){ float d = length(gl_PointCoord - .5); float a = pow(1. - smoothstep(0., .5, d), 3.); gl_FragColor = vec4(vC * a * 1.4, 1.); }`,
      });
      const gal = new T.Points(geo, mat); scene.add(gal);
      const look = { x: 0, y: 0, tx: 0, ty: 0 };
      stage.addEventListener("pointermove", e => { const r = stage.getBoundingClientRect(); look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2; look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2; });
      const pull = on => ctx.gsap.to(uni.uPull, { value: on ? 1 : 0, duration: on ? 1.4 : 2.2, ease: on ? "power2.out" : "elastic.out(1, .5)" });
      dragger(stage, { onDown: () => pull(true), onUp: () => pull(false) });
      const resize = () => { const { w, h } = size(); renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      ro = new ResizeObserver(resize); ro.observe(stage); resize();
      stage.querySelector(".joyd__loading")?.remove();
      stop = loop(stage, (dt, t) => {
        uni.uTime.value = t;
        look.x += (look.tx - look.x) * 0.04; look.y += (look.ty - look.y) * 0.04;
        const d = cam.aspect < 0.8 ? 13 : 8.5;
        cam.position.set(look.x * 2.5, 3.6 + look.y * 2.2, d); cam.lookAt(0, 0, 0);
        gal.rotation.z = look.x * 0.12;
        renderer.render(scene, cam);
      });
    }).catch(() => fail(stage));
    return () => { stop(); ro && ro.disconnect(); rend && rend.dispose(); };
  };

  /* ---------- Ball Pit: throw a pile of little faces around ---------- */
  EXP.ballpit = (stage, ctx) => {
    const s = fit2d(stage), c = s.c;
    const PAL = ["#ff5a36", "#6c4cff", "#ffd23f", "#1ec98b", "#ececec", "#3a86ff", "#ff8fc7"];
    const unit = () => Math.min(s.w, s.h);
    let balls = [];
    const add = (x, y) => { const r = unit() * (0.035 + Math.random() * 0.05); balls.push({ x, y, vx: (Math.random() - .5) * 200, vy: 0, r, col: PAL[(Math.random() * PAL.length) | 0], blink: Math.random() * 5 }); };
    for (let i = 0; i < (s.w < 700 ? 34 : 56); i++) add(Math.random() * s.w, Math.random() * s.h * 0.6);
    const ptr = { x: s.w / 2, y: s.h / 2, vx: 0, vy: 0, held: null, t: 0 };
    const at = e => { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    stage.addEventListener("pointerdown", e => {
      e.preventDefault();
      const [x, y] = at(e); ptr.x = x; ptr.y = y; ptr.vx = ptr.vy = 0;
      ptr.held = balls.find(b => Math.hypot(b.x - x, b.y - y) < b.r * 1.15) || null;
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      if (!ptr.held) { // a puff that pushes the pile away
        balls.forEach(b => { const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1, f = Math.max(0, 1 - d / (unit() * 0.5)); b.vx += dx / d * f * 1600; b.vy += dy / d * f * 1600; });
        if (balls.length < 110) add(x, y);
        ctx.sfx && ctx.sfx.tone(240, 0.12, 0.05);
      }
    });
    stage.addEventListener("pointermove", e => {
      const [x, y] = at(e), now = performance.now(), dt = Math.max(1, now - ptr.t) / 1000;
      ptr.vx = (x - ptr.x) / dt; ptr.vy = (y - ptr.y) / dt; ptr.x = x; ptr.y = y; ptr.t = now;
    });
    const drop = () => { if (ptr.held) { ptr.held.vx = Math.max(-3000, Math.min(3000, ptr.vx)); ptr.held.vy = Math.max(-3000, Math.min(3000, ptr.vy)); ptr.held = null; } };
    stage.addEventListener("pointerup", drop); stage.addEventListener("pointercancel", drop);
    const ro = new ResizeObserver(() => s.resize()); ro.observe(stage);
    const stop = loop(stage, (dt, t) => {
      const W = s.w, H = s.h, G = 1800, sub = 3, h = dt / sub;
      for (let k = 0; k < sub; k++) {
        balls.forEach(b => {
          if (b === ptr.held) { b.vx = (ptr.x - b.x) / h * 0.4; b.vy = (ptr.y - b.y) / h * 0.4; }
          else b.vy += G * h;
          b.vx *= 0.999; b.x += b.vx * h; b.y += b.vy * h;
          if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.6; } if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.6; }
          if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.45; b.vx *= 0.98; } if (b.y < b.r - H) { b.y = b.r - H; b.vy = Math.abs(b.vy); }
        });
        for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
          const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r, d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, o = (rr - d) / 2;
          a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) { const im = -(1.5 * rv) / 2; a.vx -= im * nx; a.vy -= im * ny; b.vx += im * nx; b.vy += im * ny; }
        }
      }
      c.fillStyle = "#050505"; c.fillRect(0, 0, W, H);
      balls.forEach(b => {
        const g = c.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, "rgba(255,255,255,.55)"); g.addColorStop(0.35, b.col); g.addColorStop(1, b.col);
        c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
        // eyes follow the pointer, and blink now and then
        const ex = ptr.x - b.x, ey = ptr.y - b.y, ed = Math.hypot(ex, ey) || 1, lx = ex / ed * b.r * 0.1, ly = ey / ed * b.r * 0.1;
        const closed = ((t + b.blink) % 4.5) < 0.12;
        c.fillStyle = "#111";
        [-1, 1].forEach(sd => {
          const x = b.x + sd * b.r * 0.32 + lx, y = b.y - b.r * 0.08 + ly;
          if (closed) c.fillRect(x - b.r * 0.12, y - 1, b.r * 0.24, Math.max(1.5, b.r * 0.05));
          else { c.beginPath(); c.arc(x, y, b.r * 0.11, 0, Math.PI * 2); c.fill(); }
        });
        if (b === ptr.held) { c.beginPath(); c.arc(b.x + lx * 0.5, b.y + b.r * 0.3, b.r * 0.14, 0, Math.PI * 2); c.fill(); }
        else { c.lineWidth = Math.max(1.5, b.r * 0.06); c.strokeStyle = "#111"; c.beginPath(); c.arc(b.x + lx * 0.5, b.y + b.r * 0.18, b.r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
      });
    });
    return () => { stop(); ro.disconnect(); };
  };

  function fail(stage) {
    const l = stage.querySelector(".joyd__loading");
    if (l) l.textContent = "Couldn’t load the 3D engine. Check your connection and reload.";
  }

  /* ---------------- mount ---------------- */
  // returns a cleanup function the site calls when you leave the page
  function setup(page, route, ctx) {
    if (route === "joyous") { setupChannel(page, ctx); return () => {}; }
    const it = items().find(x => "joyous/" + x.slug === route);
    const stage = page.querySelector("#joyStage");
    if (!it || !stage) return () => {};
    const run = EXP[it.play];
    if (!run) { stage.querySelector(".joyd__loading").textContent = "This one isn’t built yet."; return () => {}; }
    // tap-only games still let a phone scroll down past the stage
    stage.style.touchAction = it.play === "flappy" || it.play === "stack" ? "pan-y" : "none";
    return run(stage, ctx) || (() => {});
  }
  const find = route => items().find(x => "joyous/" + x.slug === route);

  window.JoyousPage = { channelHTML, detailHTML, setup, find, experiences: Object.keys(EXP) };
})();
