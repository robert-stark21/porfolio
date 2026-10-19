/* =========================================================
   RING CAROUSEL (fallback for browsers without WebGL2)
   A ring of bent project cards (vanilla port of the idea behind
   React Bits "Circular Carousel", cylinder preset).
   Drag with momentum, wheel, arrow keys, snap to the front card,
   slow drift when idle. Click the front card to open it.
   window.RingCarousel.create({ el, items, onCenter, onOpen })
     -> { center, pause(bool), go(i, instant), intro() }
   ========================================================= */
(() => {
  /* ---- tweakables ---- */
  const CFG = {
    cardWidth: 300,      // px before fitting to the screen
    aspect: 4 / 3,       // card width / height (covers are cropped to this)
    gap: 26,             // px between cards
    tilt: -5,            // deg, camera looks slightly down on the ring
    perspective: 2500,
    curve: 1,            // 0 = flat cards, 1 = cards follow the ring
    autoplay: "drift",   // "drift" | "step" | "off"
    speed: 9,            // deg per second while drifting
    interval: 3.5,       // seconds between moves when autoplay is "step"
    momentum: 0.6,       // 0..1, how far a flick coasts
    parallax: 0.3,       // 0..1, ring leans toward the cursor
    stretch: 0.5,        // 0..1, ring swells while spinning fast
    depthFade: 0.6,      // 0..1, how much far cards fade into the background
    fadeColor: "#0b0b0b",
    innerShade: 0.55,    // darkness of the card backs seen through the ring
    radius: 3,           // card corner radius
    maxScale: 1.6,       // largest zoom when fitting the ring to the screen
    mobileCard: 0.64,    // on narrow screens, front card fills this share of the width
  };

  const TILES = 8, OVERLAP = 2.5, DRAG_THRESHOLD = 5, SPRING = 118, SETTLE_SPEED = 9;
  const INTRO_MS = 1400;
  const TO_RAD = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wrap = d => ((((d + 180) % 360) + 360) % 360) - 180;
  const easeOutQuint = t => 1 - Math.pow(1 - t, 5);
  const rotX = (p, d) => { const r = d * TO_RAD, c = Math.cos(r), s = Math.sin(r); return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c]; };
  const rotY = (p, d) => { const r = d * TO_RAD, c = Math.cos(r), s = Math.sin(r); return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c]; };

  function create({ el, items, onCenter, onOpen }) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = items.length;
    const step = 360 / count;
    const cardW = CFG.cardWidth, cardH = cardW / CFG.aspect;
    const curve = clamp(CFG.curve, 0, 1);
    const n = Math.max(count, 3), pitch = cardW + CFG.gap;
    const chord = pitch / (2 * Math.sin(Math.PI / n)), arc = (n * pitch) / (2 * Math.PI);
    const radius = Math.max(chord + (arc - chord) * curve, cardW * 0.6);
    const parallax = reduce ? 0 : CFG.parallax, stretch = reduce ? 0 : CFG.stretch;
    const autoplay = reduce ? "off" : CFG.autoplay;

    // split each card into vertical strips so it can bend around the ring
    const tiles = (() => {
      const total = curve > 0.001 ? TILES : 1, len = cardW / total, bend = curve > 0.001 ? radius / curve : 0;
      return Array.from({ length: total }, (_, i) => {
        const start = i * len - (i > 0 ? OVERLAP / 2 : 0);
        const end = (i + 1) * len + (i < total - 1 ? OVERLAP / 2 : 0);
        const c = (start + end) / 2 - cardW / 2, a = bend ? c / bend : 0;
        const shift = bend ? bend * Math.sin(a) : c, sink = bend ? bend * (1 - Math.cos(a)) : 0;
        return { i, total, start, end, size: end - start, move: `translate3d(${shift}px,0,${-sink}px) rotateY(${a * 180 / Math.PI}deg)` };
      });
    })();

    el.classList.add("cc");
    el.style.setProperty("--cc-fade", CFG.fadeColor);
    el.style.setProperty("--cc-radius", CFG.radius + "px");
    el.style.setProperty("--cc-inner", (1 - clamp(CFG.innerShade, 0, 1)).toFixed(3));
    el.setAttribute("role", "region");
    el.setAttribute("aria-roledescription", "carousel");
    el.setAttribute("aria-label", "Selected work");
    const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const tileHTML = (item, t, back) => {
      const strip = back ? t.total - 1 - t.i : t.i, r = "var(--cc-radius)";
      const first = strip === 0, last = strip === t.total - 1;
      const br = `${first ? r : 0} ${last ? r : 0} ${last ? r : 0} ${first ? r : 0}`;
      const off = back ? cardW - t.end : t.start;
      return `<div class="cc__tile" style="left:${-t.size / 2}px;top:${-cardH / 2}px;width:${t.size}px;height:${cardH}px;transform:${t.move}${back ? " rotateY(180deg)" : ""}">
        <div class="cc__frame" style="height:${cardH}px;border-radius:${br}">
          <img class="cc__photo" src="${esc(item.image)}" alt="" draggable="false" decoding="async" style="left:${-off}px;width:${cardW}px;height:${cardH}px">
          ${back ? '<div class="cc__inner"></div>' : ""}<div class="cc__shade"></div>
        </div></div>`;
    };
    el.innerHTML = `<div class="cc__stage"><div class="cc__camera"><div class="cc__ring">${items.map((it, i) =>
      `<div class="cc__card" data-cc-index="${i}" role="group" aria-roledescription="slide" aria-label="${esc(it.title)}, ${i + 1} of ${count}">${
        tiles.map(t => tileHTML(it, t, false)).join("")}${tiles.map(t => tileHTML(it, t, true)).join("")}</div>`).join("")}</div></div></div>`;
    const stage = el.querySelector(".cc__stage"), camera = el.querySelector(".cc__camera"), ring = el.querySelector(".cc__ring");
    const cards = [...el.querySelectorAll(".cc__card")];

    const st = {
      angle: 0, velocity: 0, target: null, dir: -1, press: null, drag: false, hover: false,
      pointer: { inside: false, x: 0, y: 0 }, yaw: 0, pitch: 0, intro: null,
      holdUntil: 0, stepAt: 0, suppressClick: false, wheelTimer: 0, wheelAt: 0,
      fit: 1, drop: 0, last: 0, active: -1, paused: false,
    };
    let raf = 0;
    const nearest = a => Math.round(a / step) * step;

    function measure() {
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const width = rect.width * 0.94, height = rect.height * 0.92, P = CFG.perspective;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const corners = [[-cardW / 2, -cardH / 2], [cardW / 2, -cardH / 2], [-cardW / 2, cardH / 2], [cardW / 2, cardH / 2]];
      for (let a = -180; a <= 180; a += 7.5) for (const [cx, cy] of corners) {
        let p = rotX(rotY([cx, cy, radius], a), CFG.tilt);
        p = [p[0], p[1], p[2] - radius];
        if (p[2] >= P * 0.95) continue;
        const k = P / (P - p[2]);
        minX = Math.min(minX, p[0] * k); maxX = Math.max(maxX, p[0] * k);
        minY = Math.min(minY, p[1] * k); maxY = Math.max(maxY, p[1] * k);
      }
      let fit = Math.min(CFG.maxScale, width / Math.max(maxX - minX, 1), height / Math.max(maxY - minY, 1));
      // on phones the whole ring would be tiny: keep the front card big and let the sides run off screen
      if (rect.width < 760) fit = Math.min(Math.max(fit, (rect.width * CFG.mobileCard) / cardW), (height * 0.9) / cardH);
      st.fit = fit;
      const shift = -((minY + maxY) / 2) * fit;
      st.drop = (rect.height / fit) * 0.55 + cardH;
      stage.style.perspective = P + "px";
      stage.style.transform = `translate3d(0,${shift}px,0) scale(${fit})`;
    }

    function advance(dt, now) {
      if (st.intro && now - st.intro >= INTRO_MS) st.intro = null;
      const paused = st.hover || st.drag || now < st.holdUntil;
      const cruise = autoplay === "drift" && !paused && !st.intro ? CFG.speed * st.dir : 0;
      let busy = Boolean(st.intro) || st.drag;
      if (st.drag || st.intro) {
        if (!st.drag) st.velocity = 0;
      } else if (st.target !== null) {
        let rem = dt; const damp = 2 * Math.sqrt(SPRING);
        while (rem > 0) {
          const h = Math.min(rem, 1 / 240);
          st.velocity += (SPRING * (st.target - st.angle) - damp * st.velocity) * h;
          st.angle += st.velocity * h; rem -= h;
        }
        if (Math.abs(st.target - st.angle) < 0.004 && Math.abs(st.velocity) < 0.03) { st.angle = st.target; st.velocity = 0; st.target = null; }
        busy = true;
      } else {
        const tau = 0.18 + CFG.momentum * 1.5;
        st.velocity += (cruise - st.velocity) * (1 - Math.exp(-dt / tau));
        st.angle += st.velocity * dt;
        if (cruise === 0 && Math.abs(st.velocity) < SETTLE_SPEED) st.target = nearest(st.angle);
        busy = busy || cruise !== 0 || Math.abs(st.velocity) > 0.01 || st.target !== null;
      }
      if (autoplay === "step" && !paused && !st.intro) {
        if (!st.stepAt) st.stepAt = now + CFG.interval * 1000;
        if (now >= st.stepAt) { st.target = (st.target ?? nearest(st.angle)) + step * st.dir; st.stepAt = now + CFG.interval * 1000; }
        busy = true;
      } else st.stepAt = 0;
      if (now < st.holdUntil) busy = true;
      const ease = 1 - Math.exp(-dt / 0.35);
      const aimYaw = st.pointer.inside ? st.pointer.x * parallax * 9 : 0;
      const aimPitch = st.pointer.inside ? -st.pointer.y * parallax * 6 : 0;
      st.yaw += (aimYaw - st.yaw) * ease; st.pitch += (aimPitch - st.pitch) * ease;
      if (Math.abs(aimYaw - st.yaw) > 0.01 || Math.abs(aimPitch - st.pitch) > 0.01) busy = true;
      return busy;
    }

    function render(now) {
      const elapsed = st.intro ? now - st.intro : 0;
      const R = radius * (1 + stretch * 0.12 * Math.min(1, Math.abs(st.velocity) / 420));
      camera.style.transform = `translate3d(0,0,${-R}px) rotateX(${CFG.tilt + st.pitch}deg) rotateY(${st.yaw}deg)`;
      ring.style.transform = `rotateY(${st.angle}deg)`;
      for (let i = 0; i < count; i++) {
        const base = i * step, world = wrap(base + st.angle);
        let t = `rotateY(${base}deg) translateZ(${R}px)`;
        if (st.intro) {
          // cards rise into place, the front ones first
          const delay = (Math.abs(world) / 180) * 480;
          const lift = (1 - easeOutQuint(clamp((elapsed - delay) / 900, 0, 1))) * st.drop;
          if (lift) t += ` translateY(${lift}px)`;
        }
        cards[i].style.transform = t;
        const facing = Math.cos(world * TO_RAD);
        cards[i].style.setProperty("--cc-depth", (CFG.depthFade * Math.pow((1 - facing) / 2, 1.25)).toFixed(3));
      }
      const idx = ((Math.round(-st.angle / step) % count) + count) % count || 0;
      if (idx !== st.active) {
        if (st.active >= 0) cards[st.active].classList.remove("is-front");
        cards[idx].classList.add("is-front");
        st.active = idx;
        onCenter && onCenter(idx);
      }
    }

    function frame(now) {
      raf = 0;
      const dt = st.last ? Math.min((now - st.last) / 1000, 0.05) : 1 / 60;
      st.last = now;
      const busy = advance(dt, now);
      render(now);
      if (busy && !st.paused && !document.hidden) raf = requestAnimationFrame(frame);
      else st.last = 0;
    }
    const wake = () => { if (!raf && !st.paused && !document.hidden) raf = requestAnimationFrame(frame); };

    function focusIndex(i) {
      let target = -i * step;
      target += 360 * Math.round((st.angle - target) / 360);
      st.target = target; st.holdUntil = performance.now() + 2800; wake();
    }
    function stepBy(d) {
      st.target = (st.target ?? nearest(st.angle)) - d * step;
      st.holdUntil = performance.now() + 2800; st.dir = d > 0 ? -1 : 1; wake();
    }

    /* ---- input ---- */
    const perPixel = () => 180 / (Math.PI * radius * st.fit);
    addEventListener("wheel", e => {
      if (st.paused || st.intro || e.ctrlKey) return;
      if (e.target.closest && e.target.closest(".page, .cards, .lightbox, .process")) return;
      const dx = e.deltaMode === 1 ? e.deltaX * 33 : e.deltaX, dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (!d) return;
      e.preventDefault();
      const now = performance.now();
      if (Math.abs(d) >= 50 && Number.isInteger(d)) {
        // mouse wheel: one notch = one project
        if (now - st.wheelAt > 160) { stepBy(Math.sign(d)); st.wheelAt = now; }
        return;
      }
      st.target = null;
      st.angle -= d * perPixel();
      st.velocity = -d * perPixel() * 30;
      st.holdUntil = now + 1600;
      clearTimeout(st.wheelTimer);
      st.wheelTimer = setTimeout(() => { st.target = nearest(st.angle + st.velocity * 0.12); wake(); }, 140);
      wake();
    }, { passive: false });

    const updatePointer = e => {
      const r = el.getBoundingClientRect();
      st.pointer.x = clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      st.pointer.y = clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
    };
    el.addEventListener("pointerdown", e => {
      st.suppressClick = false;
      if (st.paused || e.button !== 0) return;
      st.press = { id: e.pointerId, x: e.clientX, y: e.clientY, angle: st.angle, moved: false, origin: 0, samples: [{ time: performance.now(), angle: st.angle }] };
    });
    el.addEventListener("pointermove", e => {
      if (e.pointerType === "mouse") { st.pointer.inside = true; updatePointer(e); }
      const p = st.press;
      if (!p || p.id !== e.pointerId) { wake(); return; }
      const delta = e.clientX - p.x, cross = e.clientY - p.y;
      if (!p.moved) {
        if (Math.abs(delta) < DRAG_THRESHOLD) return;
        if (Math.abs(cross) > Math.abs(delta) * 1.2 && e.pointerType !== "mouse") { st.press = null; return; }
        p.moved = true; p.origin = delta; st.drag = true; st.target = null; st.velocity = 0;
        el.classList.add("is-dragging");
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
      }
      st.angle = p.angle + (delta - p.origin) * perPixel();
      const now = performance.now();
      p.samples.push({ time: now, angle: st.angle });
      while (p.samples.length > 2 && now - p.samples[0].time > 110) p.samples.shift();
      wake();
    });
    const release = e => {
      const p = st.press;
      if (!p || p.id !== e.pointerId) return;
      st.press = null;
      if (!p.moved) return;
      st.drag = false; el.classList.remove("is-dragging"); st.suppressClick = true;
      const a = p.samples[0], b = p.samples[p.samples.length - 1], span = (b.time - a.time) / 1000;
      const v = span > 0.008 ? clamp((b.angle - a.angle) / span, -1400, 1400) : 0;
      st.velocity = v;
      if (Math.abs(v) > 60) st.dir = Math.sign(v);
      const coasting = autoplay === "drift" && !(st.hover && e.pointerType === "mouse");
      if (!coasting) st.target = Math.round((st.angle + v * (0.18 + CFG.momentum * 1.5) * 0.55) / step) * step;
      wake();
    };
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { st.hover = true; wake(); } });
    el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { st.hover = false; st.pointer.inside = false; } wake(); });
    el.addEventListener("click", e => {
      if (st.suppressClick) { st.suppressClick = false; return; }
      const card = e.target.closest("[data-cc-index]");
      if (!card || st.paused) return;
      const i = +card.dataset.ccIndex;
      // the front card opens the project, any other card spins to the front
      if (i === st.active) onOpen && onOpen(i);
      else focusIndex(i);
    });
    addEventListener("keydown", e => {
      if (st.paused || st.intro || document.querySelector(".lightbox:not([hidden]), .cards:not([hidden])")) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { stepBy(1); e.preventDefault(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { stepBy(-1); e.preventDefault(); }
      else if (e.key === "Enter" && (document.activeElement === document.body || document.activeElement === el)) onOpen && onOpen(st.active);
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; st.last = 0; } else wake(); });
    new ResizeObserver(() => { measure(); wake(); }).observe(el);

    measure();
    render(performance.now());
    wake();

    return {
      get center() { return st.active; },
      pause(p) {
        st.paused = p;
        if (p) { cancelAnimationFrame(raf); raf = 0; st.last = 0; st.drag = false; st.press = null; }
        else { measure(); wake(); }
      },
      go(i, instant) {
        if (instant || st.paused) {
          st.angle = -i * step; st.target = null; st.velocity = 0;
          st.holdUntil = performance.now() + 2800; render(performance.now());
        } else focusIndex(i);
      },
      intro() {
        if (reduce) return Promise.resolve();
        st.intro = performance.now(); st.last = 0; wake();
        return new Promise(r => setTimeout(r, INTRO_MS));
      },
    };
  }

  window.RingCarousel = { create, CFG };
})();
