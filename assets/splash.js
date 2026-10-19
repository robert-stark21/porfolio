/* =========================================================
   SPLASH CURSOR
   Fluid smoke that follows the cursor on the home background, after the
   React Bits "Splash Cursor" (itself based on Pavel Dobryakov's WebGL fluid
   simulation). Settings are in CFG; COLOR is the smoke colour.
   ========================================================= */
(() => {
  const CFG = {
    COLOR: "#a9a9a9",
    SIM_RESOLUTION: 128, DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 3.5, VELOCITY_DISSIPATION: 2,
    PRESSURE: 0.1, PRESSURE_ITERATIONS: 20, CURL: 3,
    SPLAT_RADIUS: 0.2, SPLAT_FORCE: 6000, SHADING: true,
    INTENSITY: 0.15,            // how much colour one splat adds
  };

  function create(canvas, opts = {}) {
    const cfg = Object.assign({}, CFG, opts);
    const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
    let gl = canvas.getContext("webgl2", params);
    const isGL2 = !!gl;
    if (!gl) gl = canvas.getContext("webgl", params) || canvas.getContext("experimental-webgl", params);
    if (!gl) return null;

    let halfFloat, linear;
    if (isGL2) { gl.getExtension("EXT_color_buffer_float"); linear = gl.getExtension("OES_texture_float_linear"); }
    else { halfFloat = gl.getExtension("OES_texture_half_float"); linear = gl.getExtension("OES_texture_half_float_linear"); }
    const HF = isGL2 ? gl.HALF_FLOAT : halfFloat && halfFloat.HALF_FLOAT_OES;
    if (!HF) return null;
    if (!linear) cfg.DYE_RESOLUTION = 256, cfg.SHADING = false;
    gl.clearColor(0, 0, 0, 0);

    const supported = (internal, format) => {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, HF, null);
      const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.deleteTexture(t); gl.deleteFramebuffer(fb); return ok;
    };
    const pick = (internal, format) => {
      if (supported(internal, format)) return { internal, format };
      if (!isGL2) return null;
      if (internal === gl.R16F) return pick(gl.RG16F, gl.RG);
      if (internal === gl.RG16F) return pick(gl.RGBA16F, gl.RGBA);
      return null;
    };
    const fmt = isGL2
      ? { rgba: pick(gl.RGBA16F, gl.RGBA), rg: pick(gl.RG16F, gl.RG), r: pick(gl.R16F, gl.RED) }
      : { rgba: pick(gl.RGBA, gl.RGBA), rg: pick(gl.RGBA, gl.RGBA), r: pick(gl.RGBA, gl.RGBA) };
    if (!fmt.rgba || !fmt.rg || !fmt.r) return null;

    /* ---------- shaders ---------- */
    const compile = (type, src, keys) => {
      if (keys) src = keys.map(k => `#define ${k}\n`).join("") + src;
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const baseVert = compile(gl.VERTEX_SHADER, `precision highp float;
      attribute vec2 aPosition; varying vec2 vUv, vL, vR, vT, vB; uniform vec2 texelSize;
      void main(){ vUv = aPosition * .5 + .5; vL = vUv - vec2(texelSize.x, 0.); vR = vUv + vec2(texelSize.x, 0.);
        vT = vUv + vec2(0., texelSize.y); vB = vUv - vec2(0., texelSize.y); gl_Position = vec4(aPosition, 0., 1.); }`);
    const frag = (src, keys) => compile(gl.FRAGMENT_SHADER, src, keys);
    function Program(fs) {
      const p = gl.createProgram(); gl.attachShader(p, baseVert); gl.attachShader(p, fs);
      gl.bindAttribLocation(p, 0, "aPosition"); gl.linkProgram(p);
      const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
      return { p, u, bind() { gl.useProgram(p); } };
    }
    const P = "precision mediump float; precision mediump sampler2D;";
    const copyP = Program(frag(`${P} varying highp vec2 vUv; uniform sampler2D uTexture; void main(){ gl_FragColor = texture2D(uTexture, vUv); }`));
    const clearP = Program(frag(`${P} varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value; void main(){ gl_FragColor = value * texture2D(uTexture, vUv); }`));
    const splatP = Program(frag(`precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
      void main(){ vec2 p = vUv - point.xy; p.x *= aspectRatio; vec3 splat = exp(-dot(p, p) / radius) * color; gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + splat, 1.); }`));
    const advP = Program(frag(`precision highp float; precision highp sampler2D; varying vec2 vUv; uniform sampler2D uVelocity, uSource; uniform vec2 texelSize, dyeTexelSize; uniform float dt, dissipation;
      vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize){ vec2 st = uv / tsize - .5; vec2 iuv = floor(st); vec2 fuv = fract(st);
        vec4 a = texture2D(sam, (iuv + vec2(.5, .5)) * tsize), b = texture2D(sam, (iuv + vec2(1.5, .5)) * tsize), c = texture2D(sam, (iuv + vec2(.5, 1.5)) * tsize), d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
        return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y); }
      void main(){
      #ifdef MANUAL_FILTERING
        vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize; vec4 result = bilerp(uSource, coord, dyeTexelSize);
      #else
        vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize; vec4 result = texture2D(uSource, coord);
      #endif
        gl_FragColor = result / (1. + dissipation * dt); }`, linear ? null : ["MANUAL_FILTERING"]));
    const divP = Program(frag(`${P} varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
      void main(){ float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x, T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y; vec2 C = texture2D(uVelocity, vUv).xy;
        if (vL.x < 0.) L = -C.x; if (vR.x > 1.) R = -C.x; if (vT.y > 1.) T = -C.y; if (vB.y < 0.) B = -C.y;
        gl_FragColor = vec4(.5 * (R - L + T - B), 0., 0., 1.); }`));
    const curlP = Program(frag(`${P} varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity;
      void main(){ float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y, T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
        gl_FragColor = vec4(.5 * (R - L - T + B), 0., 0., 1.); }`));
    const vortP = Program(frag(`precision highp float; precision highp sampler2D; varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
      void main(){ float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x, T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x, C = texture2D(uCurl, vUv).x;
        vec2 force = .5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); force /= length(force) + .0001; force *= curl * C; force.y *= -1.;
        vec2 v = texture2D(uVelocity, vUv).xy + force * dt; v = min(max(v, -1000.), 1000.); gl_FragColor = vec4(v, 0., 1.); }`));
    const presP = Program(frag(`${P} varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uPressure, uDivergence;
      void main(){ float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x, d = texture2D(uDivergence, vUv).x;
        gl_FragColor = vec4((L + R + B + T - d) * .25, 0., 0., 1.); }`));
    const gradP = Program(frag(`${P} varying highp vec2 vUv, vL, vR, vT, vB; uniform sampler2D uPressure, uVelocity;
      void main(){ float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
        vec2 v = texture2D(uVelocity, vUv).xy - vec2(R - L, T - B); gl_FragColor = vec4(v, 0., 1.); }`));
    const dispP = Program(frag(`precision highp float; precision highp sampler2D; varying vec2 vUv, vL, vR, vT, vB; uniform sampler2D uTexture; uniform vec2 texelSize;
      void main(){ vec3 c = texture2D(uTexture, vUv).rgb;
      #ifdef SHADING
        vec3 lc = texture2D(uTexture, vL).rgb, rc = texture2D(uTexture, vR).rgb, tc = texture2D(uTexture, vT).rgb, bc = texture2D(uTexture, vB).rgb;
        float dx = length(rc) - length(lc), dy = length(tc) - length(bc); vec3 n = normalize(vec3(dx, dy, length(texelSize)));
        float diffuse = clamp(dot(n, vec3(0., 0., 1.)) + .7, .7, 1.); c *= diffuse;
      #endif
        float a = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c, a); }`, cfg.SHADING ? ["SHADING"] : null));

    /* ---------- geometry + targets ---------- */
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);
    const blit = target => {
      if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
      else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
    function FBO(w, h, f, filter) {
      gl.activeTexture(gl.TEXTURE0);
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, filter));
      [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE));
      gl.texImage2D(gl.TEXTURE_2D, 0, f.internal, w, h, 0, f.format, HF, null);
      const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo, w, h, tx: 1 / w, ty: 1 / h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
    }
    function Double(w, h, f, filter) {
      let a = FBO(w, h, f, filter), b = FBO(w, h, f, filter);
      return { w, h, tx: a.tx, ty: a.ty, get read() { return a; }, get write() { return b; }, swap() { const t = a; a = b; b = t; } };
    }
    const res = r => {
      let ar = gl.drawingBufferWidth / gl.drawingBufferHeight; if (ar < 1) ar = 1 / ar;
      const min = Math.round(r), max = Math.round(r * ar);
      return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: max, h: min } : { w: min, h: max };
    };
    let dye, vel, divergence, curl, pressure;
    const filter = linear ? gl.LINEAR : gl.NEAREST;
    function initTargets() {
      const s = res(cfg.SIM_RESOLUTION), d = res(cfg.DYE_RESOLUTION);
      gl.disable(gl.BLEND);
      dye = Double(d.w, d.h, fmt.rgba, filter);
      vel = Double(s.w, s.h, fmt.rg, filter);
      divergence = FBO(s.w, s.h, fmt.r, gl.NEAREST);
      curl = FBO(s.w, s.h, fmt.r, gl.NEAREST);
      pressure = Double(s.w, s.h, fmt.r, gl.NEAREST);
    }
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width === w && canvas.height === h) return false;
      canvas.width = w; canvas.height = h; return true;
    };
    resize(); initTargets();

    /* ---------- simulation ---------- */
    const hex = cfg.COLOR.replace("#", ""), base = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const color = () => base.map(c => c * cfg.INTENSITY);
    const pointer = { x: 0, y: 0, px: 0, py: 0, dx: 0, dy: 0, moved: false, down: false };
    function splat(x, y, dx, dy, c) {
      splatP.bind();
      gl.uniform1i(splatP.u.uTarget, vel.read.attach(0));
      gl.uniform1f(splatP.u.aspectRatio, canvas.width / canvas.height);
      gl.uniform2f(splatP.u.point, x, y);
      gl.uniform3f(splatP.u.color, dx, dy, 0);
      let r = cfg.SPLAT_RADIUS / 100; const ar = canvas.width / canvas.height; if (ar > 1) r *= ar;
      gl.uniform1f(splatP.u.radius, r);
      blit(vel.write); vel.swap();
      gl.uniform1i(splatP.u.uTarget, dye.read.attach(0));
      gl.uniform3f(splatP.u.color, c[0], c[1], c[2]);
      blit(dye.write); dye.swap();
    }
    function step(dt) {
      gl.disable(gl.BLEND);
      curlP.bind(); gl.uniform2f(curlP.u.texelSize, vel.tx, vel.ty); gl.uniform1i(curlP.u.uVelocity, vel.read.attach(0)); blit(curl);
      vortP.bind(); gl.uniform2f(vortP.u.texelSize, vel.tx, vel.ty); gl.uniform1i(vortP.u.uVelocity, vel.read.attach(0)); gl.uniform1i(vortP.u.uCurl, curl.attach(1));
      gl.uniform1f(vortP.u.curl, cfg.CURL); gl.uniform1f(vortP.u.dt, dt); blit(vel.write); vel.swap();
      divP.bind(); gl.uniform2f(divP.u.texelSize, vel.tx, vel.ty); gl.uniform1i(divP.u.uVelocity, vel.read.attach(0)); blit(divergence);
      clearP.bind(); gl.uniform1i(clearP.u.uTexture, pressure.read.attach(0)); gl.uniform1f(clearP.u.value, cfg.PRESSURE); blit(pressure.write); pressure.swap();
      presP.bind(); gl.uniform2f(presP.u.texelSize, vel.tx, vel.ty); gl.uniform1i(presP.u.uDivergence, divergence.attach(0));
      for (let i = 0; i < cfg.PRESSURE_ITERATIONS; i++) { gl.uniform1i(presP.u.uPressure, pressure.read.attach(1)); blit(pressure.write); pressure.swap(); }
      gradP.bind(); gl.uniform2f(gradP.u.texelSize, vel.tx, vel.ty); gl.uniform1i(gradP.u.uPressure, pressure.read.attach(0)); gl.uniform1i(gradP.u.uVelocity, vel.read.attach(1)); blit(vel.write); vel.swap();
      advP.bind(); gl.uniform2f(advP.u.texelSize, vel.tx, vel.ty);
      if (!linear) gl.uniform2f(advP.u.dyeTexelSize, vel.tx, vel.ty);
      const v = vel.read.attach(0); gl.uniform1i(advP.u.uVelocity, v); gl.uniform1i(advP.u.uSource, v);
      gl.uniform1f(advP.u.dt, dt); gl.uniform1f(advP.u.dissipation, cfg.VELOCITY_DISSIPATION); blit(vel.write); vel.swap();
      if (!linear) gl.uniform2f(advP.u.dyeTexelSize, dye.tx, dye.ty);
      gl.uniform1i(advP.u.uVelocity, vel.read.attach(0)); gl.uniform1i(advP.u.uSource, dye.read.attach(1));
      gl.uniform1f(advP.u.dissipation, cfg.DENSITY_DISSIPATION); blit(dye.write); dye.swap();
    }
    function render() {
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.clear(gl.COLOR_BUFFER_BIT);
      dispP.bind(); if (cfg.SHADING) gl.uniform2f(dispP.u.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight);
      gl.uniform1i(dispP.u.uTexture, dye.read.attach(0)); blit(null);
    }

    /* ---------- input + loop ---------- */
    let paused = false, raf = 0, last = performance.now(), idle = 0;
    const move = (cx, cy) => {
      const r = canvas.getBoundingClientRect();
      const x = (cx - r.left) / r.width, y = 1 - (cy - r.top) / r.height;
      pointer.dx = (x - pointer.x) * (r.width > r.height ? r.width / r.height : 1);
      pointer.dy = (y - pointer.y) * (r.width > r.height ? 1 : r.height / r.width);
      pointer.x = x; pointer.y = y; pointer.moved = Math.abs(pointer.dx) > 0 || Math.abs(pointer.dy) > 0;
    };
    const onMove = e => { if (paused) return; if (!pointer.seen) { pointer.seen = true; const r = canvas.getBoundingClientRect(); pointer.x = (e.clientX - r.left) / r.width; pointer.y = 1 - (e.clientY - r.top) / r.height; return; } move(e.clientX, e.clientY); wake(); };
    const onDown = e => {
      if (paused) return;
      const r = canvas.getBoundingClientRect(); pointer.x = (e.clientX - r.left) / r.width; pointer.y = 1 - (e.clientY - r.top) / r.height; pointer.seen = true;
      const c = color().map(v => v * 10);
      splat(pointer.x, pointer.y, 10 * (Math.random() - 0.5), 30 * (Math.random() - 0.5), c); wake();
    };
    addEventListener("pointermove", onMove, { passive: true });
    addEventListener("pointerdown", onDown, { passive: true });
    addEventListener("touchmove", e => { const t = e.touches[0]; if (t) onMove({ clientX: t.clientX, clientY: t.clientY }); }, { passive: true });

    function frame(now) {
      raf = 0;
      if (paused) return;
      const dt = Math.min((now - last) / 1000, 0.016666); last = now;
      if (resize()) initTargets();
      if (pointer.moved) {
        pointer.moved = false;
        splat(pointer.x, pointer.y, pointer.dx * cfg.SPLAT_FORCE, pointer.dy * cfg.SPLAT_FORCE, color());
        idle = 0;
      } else idle += dt;
      step(dt); render();
      // the smoke fades out within a couple of seconds; stop drawing once it has
      if (idle < 3) raf = requestAnimationFrame(frame);
      else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT); }
    }
    function wake() { if (!raf && !paused) { last = performance.now(); raf = requestAnimationFrame(frame); } }

    return {
      pause(v) {
        paused = !!v; canvas.style.opacity = v ? 0 : "";
        if (v && raf) { cancelAnimationFrame(raf); raf = 0; }
        if (v) pointer.seen = false;
      },
    };
  }

  window.Splash = { create, CFG };
})();
