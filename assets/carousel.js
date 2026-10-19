/* =========================================================
   HOME CAROUSEL (flex)
   A strip of project covers seen through a lens: the middle
   stays flat, the sides bend away and split into colour.
   Vanilla WebGL2 port of the idea behind React Bits
   "Flex Carousel" (liquid preset). Falls back to the ring
   carousel (carousel-ring.js) when WebGL2 is missing.
   window.Carousel.create({ el, items, onCenter, onOpen })
     -> { center, pause(bool), go(i, instant), intro() }
   ========================================================= */
(() => {
  /* ---- tweakables ---- */
  const CFG = {
    cardHeight: 0.52,   // share of the carousel height
    gap: 14,            // px between covers
    radius: 2,          // px corner radius
    aspect: 0,          // 0 = keep each cover's own shape, or e.g. 4/3 to force one
    lensWidth: 0.74,    // flat zone in the middle, share of the width
    lensHeight: 1.18,
    tilt: 62,           // deg, angle of the lens
    roundness: 1,       // 1 = elliptical lens, 0 = boxy
    bend: 0.34,         // how far the sides warp
    reach: 0.38,        // how soft the edge of the lens is
    curl: "twist",      // "twist" (left down, right up), "rise" or "fall"
    dispersion: 0.45,   // colour split on the bent parts
    squeeze: 0.2,       // covers shrink a little while moving fast
    autoplay: false,    // or seconds between moves, e.g. 4
  };

  const TAPS = 12, PIXEL_BUDGET = 4.5e6, INTRO_S = 2.1;
  const wrap = (v, size) => ((((v + size / 2) % size) + size) % size) - size / 2;
  const clamp01 = v => Math.min(Math.max(v, 0), 1);
  const easeOutQuint = v => 1 - Math.pow(1 - clamp01(v), 5);
  const easeInOut = v => { const t = clamp01(v); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

  const CARD_VS = `#version 300 es
in vec2 position;
uniform vec4 uRect;
uniform vec2 uResolution;
out vec2 vLocal;
void main() {
  vLocal = vec2(position.x, -position.y) * uRect.zw;
  vec2 px = uRect.xy + vLocal;
  gl_Position = vec4(px.x / uResolution.x * 2.0 - 1.0, 1.0 - px.y / uResolution.y * 2.0, 0.0, 1.0);
}`;
  const CARD_FS = `#version 300 es
precision highp float;
uniform sampler2D tMap;
uniform vec2 uSize;
uniform vec2 uImage;
uniform float uRadius;
uniform float uAlpha;
uniform float uReady;
uniform float uShift;
uniform float uDpr;
uniform vec3 uPlaceholder;
in vec2 vLocal;
out vec4 fragColor;
float roundedBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
  float sd = roundedBox(vLocal, uSize * 0.5, min(uRadius, min(uSize.x, uSize.y) * 0.5));
  float mask = clamp(0.5 - sd * uDpr, 0.0, 1.0);
  vec2 local = vLocal / uSize + 0.5;
  float cardAspect = uSize.x / uSize.y;
  float imageAspect = uImage.x / max(uImage.y, 1.0);
  vec2 scale = imageAspect > cardAspect ? vec2(cardAspect / imageAspect, 1.0) : vec2(1.0, imageAspect / cardAspect);
  scale /= 1.08;
  vec2 uv = vec2(local.x, 1.0 - local.y);
  uv = (uv - 0.5) * scale + 0.5;
  uv.x += uShift * (1.0 - scale.x) * 0.5;
  vec3 color = mix(uPlaceholder, texture(tMap, uv).rgb, uReady);
  float alpha = mask * uAlpha;
  fragColor = vec4(color * alpha, alpha);
}`;
  const LENS_VS = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;
  const LENS_FS = `#version 300 es
precision highp float;
uniform sampler2D tScene;
uniform vec2 uResolution;
uniform float uDpr;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uAngle;
uniform float uExponent;
uniform float uInner;
uniform float uOuter;
uniform float uFlow;
uniform float uCurl;
uniform float uDispersion;
uniform float uStrength;
uniform float uSceneAlpha;
out vec4 fragColor;
void main() {
  vec2 frag = gl_FragCoord.xy / uDpr;
  vec2 uv = frag / uResolution;
  vec2 rel = frag - vec2(uCenter.x, uResolution.y - uCenter.y);
  float ca = cos(uAngle);
  float sa = sin(uAngle);
  vec2 local = vec2(ca * rel.x + sa * rel.y, -sa * rel.x + ca * rel.y);
  vec2 k = max(abs(local) / uHalf, vec2(1e-5));
  float nd = pow(pow(k.x, uExponent) + pow(k.y, uExponent), 1.0 / uExponent);
  vec2 grad = pow(k, vec2(uExponent - 1.0)) * sign(local) / uHalf * pow(nd, 1.0 - uExponent);
  float glen = max(length(grad), 1e-6);
  float edge = (nd - 1.0) / glen;
  vec2 outward = grad / glen;
  vec2 normal = vec2(ca * outward.x - sa * outward.y, sa * outward.x + ca * outward.y);
  vec2 along = vec2(-normal.y, normal.x);
  float t = clamp((edge + uInner) / (uInner + uOuter), 0.0, 1.0);
  float ramp = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
  float slope = 16.0 * t * t * (1.0 - t) * (1.0 - t);
  float reachX = rel.x / (uResolution.x * 0.5);
  float side = smoothstep(0.02, 0.3, abs(reachX)) * (uCurl == 0.0 ? sign(reachX) : uCurl);
  float lift = ramp * side * uFlow * uStrength;
  vec2 swirl = along * along.y * side * slope * uFlow * uStrength * 0.35;
  vec2 drift = vec2(0.0, -lift) - swirl;
  vec2 shifted = uv + drift / uResolution;
  vec2 texels = uResolution * uDpr;
  vec2 gx = dFdx(shifted);
  vec2 gy = dFdy(shifted);
  gx *= min(1.0, 3.0 / max(length(gx * texels), 1e-4));
  gy *= min(1.0, 3.0 / max(length(gy * texels), 1e-4));
  vec4 color = textureGrad(tScene, shifted, gx, gy);
  vec2 spread = vec2(0.0, side * slope * uFlow * uStrength) / uResolution * uDispersion;
  float spreadPx = length(spread * texels);
  if (color.a > 0.002 && spreadPx > 0.25) {
    vec3 base = color.rgb / color.a;
    vec3 sumColor = vec3(0.0);
    vec3 sumWeight = vec3(0.0);
    for (int i = 0; i < ${TAPS}; i++) {
      float s = (float(i) + 0.5) / float(${TAPS});
      vec4 c = textureGrad(tScene, shifted + spread * (s - 0.5), gx, gy);
      vec3 w = max(1.0 - abs(vec3(s) - vec3(0.15, 0.5, 0.85)) * 2.6, 0.0) * c.a;
      sumColor += c.rgb * (w / max(c.a, 0.002));
      sumWeight += w;
    }
    vec3 split = mix(base, sumColor / max(sumWeight, vec3(1e-4)), clamp(sumWeight * 2.0, 0.0, 1.0));
    color.rgb = mix(color.rgb, clamp(split, 0.0, 1.0) * color.a, smoothstep(0.25, 1.5, spreadPx));
  }
  fragColor = color * uSceneAlpha;
}`;

  /* ---- tiny WebGL2 helpers ---- */
  function program(gl, vs, fs) {
    const make = (type, src) => {
      const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, make(gl.VERTEX_SHADER, vs)); gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u };
  }
  function geometry(gl, prog, verts) {
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog.p, "position");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: verts.length / 2 };
  }

  function create(opts) {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false });
    if (!gl || !window.Carousel.webgl) {
      // no WebGL2: use the CSS ring instead
      return window.RingCarousel.create(opts);
    }
    const { el, items, onCenter, onOpen } = opts;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let card, lens, quad, tri;
    try {
      card = program(gl, CARD_VS, CARD_FS);
      lens = program(gl, LENS_VS, LENS_FS);
    } catch (err) {
      console.warn("Flex carousel: falling back to the ring", err);
      return window.RingCarousel.create(opts);
    }
    quad = geometry(gl, card, [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
    tri = geometry(gl, lens, [-1, -1, 3, -1, -1, 3]);

    el.classList.add("fc");
    el.setAttribute("role", "region");
    el.setAttribute("aria-roledescription", "carousel");
    el.setAttribute("aria-label", "Selected work");
    canvas.className = "fc__canvas";
    canvas.setAttribute("aria-hidden", "true");
    el.prepend(canvas);
    const live = document.createElement("p");
    live.className = "fc__live"; live.setAttribute("aria-live", "polite");
    el.append(live);

    // offscreen scene the lens samples from
    const sceneTex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    let sceneW = 2, sceneH = 2;
    function sizeScene(w, h) {
      sceneW = w; sceneH = h;
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    const aniso = gl.getExtension("EXT_texture_filter_anisotropic");

    // one texture per cover
    const slots = items.map((item, index) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
      const slot = { index, tex, aspect: 1.6, image: [1600, 1000], loaded: false, failed: false, ready: 0, color: [0.2, 0.2, 0.2] };
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        const w = img.naturalWidth || 1600, h = img.naturalHeight || 1000;
        let src = img;
        // draw SVGs (and anything huge) to a canvas first so every browser uploads them the same way
        if (/\.svg($|\?)/i.test(item.image) || w > 2400) {
          const k = Math.min(1, 2400 / w), c = document.createElement("canvas");
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          src = c;
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
        slot.image = [w, h]; slot.aspect = w / h;
        try {
          const probe = document.createElement("canvas"); probe.width = probe.height = 8;
          const ctx = probe.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, 8, 8);
          const d = ctx.getImageData(0, 0, 8, 8).data, avg = [0, 0, 0];
          for (let i = 0; i < d.length; i += 4) { avg[0] += d[i]; avg[1] += d[i + 1]; avg[2] += d[i + 2]; }
          slot.color = avg.map(v => v / 64 / 255);
        } catch (e) {}
        slot.loaded = true; dirty = true; start();
      };
      img.onerror = () => { slot.failed = true; dirty = true; start(); };
      img.src = item.image;
      return slot;
    });

    let width = 1, height = 1, dpr = 1;
    let pos = 0, vel = 0, goal = 0, mode = "spring", wheelAt = 0, stepAt = 0;
    let raf = 0, last = performance.now(), dirty = true, paused = false;
    let activeIndex = -1, interactedAt = -Infinity, autoplayAt = performance.now();
    let deform = 0, deformVel = 0, energy = 0, lastPos = 0, layout = null, hover = "";
    let instances = [];
    const pointer = { x: 0, y: 0, over: false, down: false, id: -1, startX: 0, startY: 0, startPos: 0, dragging: false, touch: false, samples: [], suppress: false };
    // the intro waits for intro(); until then the scene stays hidden
    const introState = { t: 0, running: false, done: false };

    const metrics = () => {
      // on narrow screens the middle cover must still fit inside the flat part of the lens
      const widest = Math.max(...slots.map(s => CFG.aspect || s.aspect));
      const cardH = Math.max(24, Math.min(CFG.cardHeight * height, (CFG.lensWidth * width * 0.85) / widest));
      const widths = slots.map(s => (CFG.aspect || s.aspect) * cardH);
      const centers = []; let cursor = 0;
      for (let i = 0; i < widths.length; i++) { centers.push(cursor + widths[i] / 2); cursor += widths[i] + CFG.gap; }
      return { cardH, widths, centers, loop: Math.max(cursor, 1) };
    };
    const nearest = (m, at) => {
      let best = 0, bd = Infinity;
      for (let i = 0; i < m.centers.length; i++) { const d = Math.abs(wrap(m.centers[i] - at, m.loop)); if (d < bd) { bd = d; best = i; } }
      return best;
    };
    const snapPoint = (m, at) => at + wrap(m.centers[nearest(m, at)] - at, m.loop);
    const remap = (from, to, at) => {
      const i = nearest(from, at), off = wrap(at - from.centers[i], from.loop);
      const cycles = Math.round((at - off - from.centers[i]) / from.loop);
      return cycles * to.loop + to.centers[i] + off * (to.widths[i] / from.widths[i]);
    };
    function step(m, delta) {
      let at = snapPoint(m, goal), index = nearest(m, at);
      const n = m.centers.length;
      for (let k = 0; k < Math.abs(delta); k++) {
        const next = (index + (delta > 0 ? 1 : n - 1)) % n;
        at += delta > 0 ? m.widths[index] / 2 + CFG.gap + m.widths[next] / 2 : -(m.widths[next] / 2 + CFG.gap + m.widths[index] / 2);
        index = next;
      }
      goal = at; mode = "spring"; dirty = true; start();
    }
    function goTo(m, index) {
      const i = ((index % m.centers.length) + m.centers.length) % m.centers.length;
      goal = goal + wrap(m.centers[i] - goal, m.loop); mode = "spring"; dirty = true; start();
    }

    function introEffects() {
      const t = introState.running ? introState.t : introState.done ? 1 : 0;
      if (!introState.done && !introState.running) return { sceneAlpha: 0, strength: 0, card: null };
      if (t >= 1) return { sceneAlpha: 1, strength: 1, card: null };
      return {
        sceneAlpha: 1,
        strength: easeInOut((t - 0.3) / 0.65),
        card: rel => {
          const delay = Math.min(Math.abs(rel) / (width * 0.6), 1) * 0.34;
          const local = clamp01((t - delay) / 0.6);
          return { alpha: clamp01(local * 4), y: (1 - easeOutQuint(local)) * height * 0.62, scale: 0.5 + 0.5 * easeInOut((local - 0.18) / 0.82) };
        },
      };
    }

    function resize() {
      width = Math.max(1, el.clientWidth); height = Math.max(1, el.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (width * height)));
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      sizeScene(Math.max(2, Math.round(width * dpr)), Math.max(2, Math.round(height * dpr)));
      dirty = true; start();
    }

    function frame(now) {
      raf = 0;
      if (paused) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const m = metrics(), n = slots.length;
      let animating = false;
      if (layout && layout.loop !== m.loop) {
        pos = remap(layout, m, pos); goal = remap(layout, m, goal);
        pointer.startPos = pos + (pointer.x - pointer.startX); animating = true;
      } else if (!layout) { goal = snapPoint(m, goal); pos = goal; }
      layout = m;

      if (introState.running) {
        introState.t = Math.min(1, introState.t + dt / INTRO_S);
        if (introState.t >= 1) { introState.running = false; introState.done = true; }
        animating = true;
      }
      if (mode === "wheel" && now - wheelAt > 150) { goal = snapPoint(m, goal); mode = "spring"; }
      if (!pointer.dragging) {
        const stiff = mode === "wheel" ? 80 : 55, damp = 2 * Math.sqrt(stiff);
        const steps = Math.ceil(dt / (1 / 240)), h = dt / steps;
        for (let i = 0; i < steps; i++) { vel += (stiff * (goal - pos) - damp * vel) * h; pos += vel * h; }
        if (Math.abs(goal - pos) < 0.05 && Math.abs(vel) < 0.5) { pos = goal; vel = 0; } else animating = true;
      } else animating = true;
      if (Math.abs(pos) > m.loop * 8) { const sh = Math.round(pos / m.loop) * m.loop; pos -= sh; goal -= sh; pointer.startPos -= sh; }

      const current = nearest(m, pos);
      if (current !== activeIndex) {
        activeIndex = current;
        live.textContent = `${items[current].title}, ${current + 1} of ${n}`;
        onCenter && onCenter(current);
      }
      if (CFG.autoplay && !reduce && introState.done && !pointer.over && !pointer.down && mode === "spring" &&
          Math.abs(goal - pos) < 1 && now - interactedAt > 3000 && now - autoplayAt > CFG.autoplay * 1000) {
        autoplayAt = now; step(m, 1);
      }
      if (CFG.autoplay && !reduce) animating = true;

      const travel = Math.abs(pos - lastPos) / dt; lastPos = pos;
      const eT = reduce ? 0 : Math.min(travel / 2600, 1);
      energy += (eT - energy) * (1 - Math.exp(-dt / (eT > energy ? 0.07 : 0.35)));
      if (energy > 0.001) animating = true;
      const push = Math.max(-1, Math.min(1, vel / 2200));
      deformVel += (120 * (push - deform) - 2 * Math.sqrt(120) * 0.32 * deformVel) * dt;
      deform += deformVel * dt;
      if (Math.abs(deform) > 0.0005 || Math.abs(deformVel) > 0.005) animating = true;
      for (const s of slots) if (s.loaded && s.ready < 1) { s.ready = Math.min(1, s.ready + dt / 0.45); animating = true; }

      const fx = introEffects();
      const homeX = width / 2, homeY = height / 2;
      if (dirty || animating || pointer.dragging) {
        dirty = false; instances = [];
        const shrink = 1 - clamp01(CFG.squeeze) * energy;
        const draws = [];
        for (let i = 0; i < n; i++) {
          const w = m.widths[i], baseRel = wrap(m.centers[i] - pos, m.loop);
          for (let k = -3; k <= 3; k++) {
            const rel = baseRel + k * m.loop;
            if (Math.abs(rel) - w / 2 > width + 40) continue;
            const c = fx.card ? fx.card(rel) : null;
            const x = homeX + rel, scale = shrink * (c ? c.scale : 1), alpha = c ? c.alpha : 1;
            const cw = w * scale;
            if (alpha <= 0.001 || x + cw / 2 < -40 || x - cw / 2 > width + 40) continue;
            draws.push({ i, rel, x, y: homeY + (c ? c.y : 0), cw, ch: m.cardH * scale, alpha });
          }
        }
        draws.sort((a, b) => Math.abs(b.rel) - Math.abs(a.rel));

        // pass 1: covers into the offscreen scene
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.viewport(0, 0, sceneW, sceneH);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(card.p); gl.bindVertexArray(quad.vao);
        gl.uniform2f(card.u.uResolution, width, height);
        gl.uniform1f(card.u.uDpr, dpr);
        gl.uniform1f(card.u.uRadius, CFG.radius);
        gl.uniform1i(card.u.tMap, 0);
        gl.activeTexture(gl.TEXTURE0);
        for (const d of draws) {
          const s = slots[d.i];
          gl.bindTexture(gl.TEXTURE_2D, s.tex);
          gl.uniform4f(card.u.uRect, d.x, d.y, d.cw + 2, d.ch + 2);
          gl.uniform2f(card.u.uSize, d.cw, d.ch);
          gl.uniform2f(card.u.uImage, s.image[0], s.image[1]);
          gl.uniform1f(card.u.uAlpha, d.alpha);
          gl.uniform1f(card.u.uReady, s.ready);
          gl.uniform1f(card.u.uShift, reduce ? 0 : Math.max(-1, Math.min(1, d.rel / (width * 0.75))));
          gl.uniform3f(card.u.uPlaceholder, s.color[0], s.color[1], s.color[2]);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, quad.count);
          instances.push({ index: d.i, x0: d.x - d.cw / 2, x1: d.x + d.cw / 2, y0: d.y - d.ch / 2, y1: d.y + d.ch / 2 });
        }
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.generateMipmap(gl.TEXTURE_2D);

        // pass 2: the lens bends the scene onto the screen
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.BLEND);
        gl.useProgram(lens.p); gl.bindVertexArray(tri.vao);
        let halfW = (CFG.lensWidth * width) / 2, halfH = (CFG.lensHeight * width) / 2;
        const inner = Math.max(4, CFG.reach * (halfW + halfH) * 0.5);
        gl.uniform1i(lens.u.tScene, 0);
        gl.uniform2f(lens.u.uResolution, width, height);
        gl.uniform1f(lens.u.uDpr, dpr);
        gl.uniform2f(lens.u.uCenter, homeX, homeY);
        gl.uniform2f(lens.u.uHalf, Math.max(halfW, 1), Math.max(halfH, 1));
        gl.uniform1f(lens.u.uAngle, (CFG.tilt * Math.PI) / 180);
        gl.uniform1f(lens.u.uExponent, 2 + Math.pow(1 - clamp01(CFG.roundness), 1.5) * 10);
        gl.uniform1f(lens.u.uInner, inner);
        gl.uniform1f(lens.u.uOuter, inner * 1.6);
        gl.uniform1f(lens.u.uFlow, CFG.bend * (halfW + halfH) * 0.45);
        gl.uniform1f(lens.u.uCurl, CFG.curl === "rise" ? 1 : CFG.curl === "fall" ? -1 : 0);
        gl.uniform1f(lens.u.uDispersion, CFG.dispersion * 0.12);
        gl.uniform1f(lens.u.uStrength, reduce ? 0 : fx.strength);
        gl.uniform1f(lens.u.uSceneAlpha, fx.sceneAlpha);
        gl.drawArrays(gl.TRIANGLES, 0, tri.count);
      }

      let nextHover = "";
      if (pointer.over && !pointer.dragging && introState.done) {
        const hit = instances.find(o => pointer.x >= o.x0 && pointer.x <= o.x1 && pointer.y >= o.y0 && pointer.y <= o.y1);
        if (hit) nextHover = hit.index === activeIndex ? "open" : "go";
      }
      if (nextHover !== hover) { hover = nextHover; if (hover) el.setAttribute("data-hover", hover); else el.removeAttribute("data-hover"); }

      if (animating || dirty || pointer.down || !introState.done) raf = requestAnimationFrame(frame);
    }
    function start() {
      if (raf || paused || document.hidden) return;
      last = performance.now(); raf = requestAnimationFrame(frame);
    }

    /* ---- input ---- */
    const localPoint = e => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener("pointerdown", e => {
      if (paused || (e.button !== undefined && e.button > 0)) return;
      if (introState.running) introState.t = 1;
      const [x, y] = localPoint(e);
      Object.assign(pointer, { down: true, id: e.pointerId, touch: e.pointerType === "touch", startX: x, startY: y, x, y, startPos: pos, dragging: false, samples: [{ x, t: performance.now() }] });
      interactedAt = performance.now();
      if (Math.abs(vel) > 40) { goal = pos; vel = 0; }
      dirty = true; start();
    });
    el.addEventListener("pointermove", e => {
      const [x, y] = localPoint(e);
      pointer.x = x; pointer.y = y; pointer.over = true;
      if (pointer.down && e.pointerId === pointer.id) {
        const dx = x - pointer.startX, dy = y - pointer.startY, slop = pointer.touch ? 10 : 5;
        if (!pointer.dragging) {
          if (pointer.touch && Math.abs(dy) > slop && Math.abs(dy) > Math.abs(dx)) { pointer.down = false; return; }
          if (Math.abs(dx) > slop) {
            pointer.dragging = true; pointer.startX = x; pointer.startPos = pos;
            try { el.setPointerCapture(e.pointerId); } catch (err) {}
            el.setAttribute("data-dragging", "");
          }
        }
        if (pointer.dragging) {
          pos = pointer.startPos - (x - pointer.startX); goal = pos; vel = 0;
          const now = performance.now();
          pointer.samples.push({ x, t: now });
          while (pointer.samples.length > 2 && now - pointer.samples[0].t > 100) pointer.samples.shift();
        }
      }
      dirty = true; start();
    });
    el.addEventListener("pointerup", e => {
      if (!pointer.down || e.pointerId !== pointer.id) return;
      pointer.down = false; el.removeAttribute("data-dragging");
      const m = metrics();
      interactedAt = performance.now();
      if (pointer.dragging) {
        pointer.dragging = false;
        const now = performance.now(), a = pointer.samples[0], b = pointer.samples[pointer.samples.length - 1];
        let v = 0;
        if (a && b && b.t > a.t && now - b.t < 70) v = -((b.x - a.x) / (b.t - a.t)) * 1000;
        vel = v;
        const landing = snapPoint(m, pos + v * 0.32);
        goal = landing;
        if (Math.abs(v) > 400 && Math.abs(landing - pos) < 1) step(m, v > 0 ? 1 : -1);
        mode = "spring"; start();
        return;
      }
      const [x, y] = localPoint(e);
      const hit = instances.find(o => x >= o.x0 && x <= o.x1 && y >= o.y0 && y <= o.y1);
      if (!hit) return;
      // the middle cover opens the project, any other slides to the middle
      if (hit.index === activeIndex) onOpen && onOpen(hit.index);
      else { goal = snapPoint(m, pos + ((hit.x0 + hit.x1) / 2 - width / 2)); mode = "spring"; start(); }
    });
    el.addEventListener("pointerleave", () => { pointer.over = false; dirty = true; start(); });
    el.addEventListener("pointercancel", () => {
      pointer.down = false; pointer.dragging = false; el.removeAttribute("data-dragging");
      goal = snapPoint(metrics(), pos); mode = "spring"; start();
    });
    addEventListener("wheel", e => {
      if (paused || e.ctrlKey) return;
      if (e.target.closest && e.target.closest(".page, .cards, .lightbox, .process, .smenu")) return;
      let dx = e.deltaX, dy = e.deltaY;
      if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) { dx = dy; dy = 0; }
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? height : 1;
      const d = (Math.abs(dx) > Math.abs(dy) ? dx : dy) * unit;
      if (!d) return;
      e.preventDefault();
      if (introState.running) introState.t = 1;
      interactedAt = performance.now();
      if (Math.abs(d) >= 50 && Number.isInteger(e.deltaY) && !e.deltaX) {
        // mouse wheel: one notch = one project
        if (interactedAt - stepAt > 160) { step(metrics(), Math.sign(d)); stepAt = interactedAt; }
        return;
      }
      goal += Math.max(-120, Math.min(120, d)) * 1.25;
      mode = "wheel"; wheelAt = performance.now(); start();
    }, { passive: false });
    addEventListener("keydown", e => {
      if (paused || document.querySelector(".lightbox:not([hidden]), .cards:not([hidden]), .smenu[data-open]")) return;
      const m = metrics();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); interactedAt = performance.now(); step(m, 1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); interactedAt = performance.now(); step(m, -1); }
      else if (e.key === "Home") { e.preventDefault(); goTo(m, 0); }
      else if (e.key === "End") { e.preventDefault(); goTo(m, slots.length - 1); }
      else if (e.key === "Enter" && (document.activeElement === document.body || document.activeElement === el)) onOpen && onOpen(activeIndex);
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) start(); });
    canvas.addEventListener("webglcontextlost", e => e.preventDefault());
    new ResizeObserver(resize).observe(el);
    resize();

    return {
      get center() { return Math.max(0, activeIndex); },
      pause(p) {
        paused = p;
        if (p) { cancelAnimationFrame(raf); raf = 0; pointer.down = pointer.dragging = false; }
        else {
          // arriving on home without the intro (deep link): just show the covers
          if (!introState.running && !introState.done) introState.done = true;
          dirty = true; start();
        }
      },
      go(i, instant) {
        const m = metrics();
        goTo(m, i);
        if (instant || paused) { pos = goal; vel = 0; }
      },
      intro() {
        introState.t = reduce ? 1 : 0; introState.running = !reduce; introState.done = reduce;
        dirty = true; start();
        return new Promise(r => setTimeout(r, reduce ? 0 : INTRO_S * 1000));
      },
    };
  }

  window.Carousel = { create, CFG, webgl: true };
})();
