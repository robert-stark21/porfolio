/* =========================================================
   SITE BEHAVIOUR
   intro loader · carousel hookup · blur text swaps · nav ·
   click-to-copy email · page transitions · inner pages · sound
   Content lives in assets/projects.js.
   ========================================================= */
(() => {
  const { SITE, PROJECTS, PLAYGROUND } = window;
  const g = window.gsap;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, "0");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const reduce = !!window.CALM;
  // project galleries can hold short videos (mp4/webm): they loop muted on the page, with a .jpg of the same name as the still
  const isVid = src => /\.(mp4|webm|mov)$/i.test(src || "");
  const vidPoster = src => src.replace(/\.(mp4|webm|mov)$/i, ".jpg");

  // cubic-bezier easing for GSAP (no plugin needed)
  function bez(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
    const dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      let t = x;
      for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5 || Math.abs(d) < 1e-6) break; t -= e / d; }
      return Y(Math.min(1, Math.max(0, t)));
    };
  }
  const EASE_COVER = bez(.77, 0, .18, 1);
  const EASE_REVEAL = bez(.9, 0, .58, 1);

  /* ---------------- sound (off until the visitor turns it on) ---------------- */
  const sfx = {
    on: false, ctx: null, lastScroll: 0,
    ac() { return (this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)()); },
    tone(freq, dur, vol) {
      if (!this.on) return;
      try {
        const a = this.ac(), o = a.createOscillator(), gn = a.createGain();
        o.type = "triangle"; o.frequency.value = freq;
        gn.gain.setValueAtTime(vol, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
        o.connect(gn).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
      } catch (e) {}
    },
    noise(dur, vol) {
      if (!this.on) return;
      try {
        const a = this.ac(), len = a.sampleRate * dur, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const s = a.createBufferSource(), f = a.createBiquadFilter(), gn = a.createGain();
        f.type = "bandpass"; f.frequency.value = 1400; gn.gain.value = vol;
        s.buffer = buf; s.connect(f).connect(gn).connect(a.destination); s.start();
      } catch (e) {}
    },
    tick() { this.tone(2200, 0.04, 0.4 * 0.08); },
    page() { this.noise(0.35, 0.5); },
    scroll() { const t = performance.now(); if (t - this.lastScroll < 120) return; this.lastScroll = t; this.tone(900, 0.06, 0.5 * 0.08); },
  };
  document.addEventListener("pointerover", e => { const el = e.target.closest("[data-sfx], a, button"); if (el && !el.contains(e.relatedTarget)) sfx.tick(); });

  /* ---------------- blur swap: sharp → blur → new text → sharp ---------------- */
  function blurSwap(el, html, { blur = 10, out = 0.2, gap = 0.14, back = 0.85 } = {}) {
    if (!el) return;
    if (reduce || !g) { el.innerHTML = html; return; }
    g.killTweensOf(el);
    g.to(el, {
      filter: `blur(${blur}px)`, duration: out, ease: "power2.out",
      onComplete() { el.innerHTML = html; g.to(el, { filter: "blur(0px)", duration: back, delay: gap, ease: "power2.out" }); },
    });
  }

  /* ---------------- clock ---------------- */
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: SITE.timezone, hour: "2-digit", minute: "2-digit" });
  function tick() { const t = fmt.format(new Date()); $$("[data-clock]").forEach(el => { if (el.textContent !== t) el.textContent = t; }); }
  tick(); setInterval(tick, 10000);
  $$("[data-year]").forEach(el => (el.textContent = new Date().getFullYear()));
  $$("[data-email]").forEach(el => (el.textContent = SITE.email));
  $("#reel").href = SITE.showreel;

  /* ---------------- toast ---------------- */
  const toast = $("#toast");
  function say(msg) { toast.textContent = msg; toast.classList.add("is-on"); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove("is-on"), 1800); }

  /* ---------------- background music (SITE.music), looped with Web Audio so there is no gap ---------------- */
  const music = {
    vol: 0.32, buf: null, loading: null, src: null, gain: null, at: 0, offset: 0,
    load() {
      if (!SITE.music) return Promise.reject();
      return (this.loading = this.loading || fetch(SITE.music).then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => sfx.ac().decodeAudioData(b, ok, no))).then(buf => (this.buf = buf)));
    },
    play() {
      const a = sfx.ac(); a.resume && a.resume();
      this.load().then(buf => {
        if (!sfx.on || this.src) return;
        this.gain = this.gain || a.createGain(); this.gain.connect(a.destination);
        const s = a.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(this.gain);
        this.gain.gain.cancelScheduledValues(a.currentTime); this.gain.gain.setValueAtTime(0, a.currentTime);
        this.gain.gain.linearRampToValueAtTime(this.vol, a.currentTime + 1.6);
        s.start(0, this.offset % buf.duration); this.src = s; this.at = a.currentTime - this.offset;
      }).catch(() => {});
    },
    stop() {
      if (!this.src) return;
      const a = sfx.ac(), s = this.src, g = this.gain.gain; this.src = null;
      this.offset = (a.currentTime - this.at) % this.buf.duration;   // pick up where it left off next time
      g.cancelScheduledValues(a.currentTime); g.setValueAtTime(g.value, a.currentTime); g.linearRampToValueAtTime(0, a.currentTime + 0.6);
      s.stop(a.currentTime + 0.65);
    },
  };

  /* ---------------- audio toggle: music + interface sounds ---------------- */
  const audioBtn = $("#audio");
  function setAudio(on, quiet) {
    sfx.on = on; audioBtn.setAttribute("aria-pressed", on);
    blurSwap($("[data-audio-label]"), on ? "On" : "Off", { blur: 8 });
    try { localStorage.setItem("audio", on ? "on" : "off"); } catch (e) {}
    if (on) music.play(); else music.stop();
    if (!quiet) sfx.tone(660, 0.12, 0.06);
  }
  audioBtn.addEventListener("click", () => setAudio(!sfx.on));
  // remembered "on": browsers only allow sound after a tap or key press, so start on the first one
  let wantAudio = false;
  try { wantAudio = localStorage.getItem("audio") === "on"; } catch (e) {}
  if (wantAudio) {
    const first = e => {
      ["pointerdown", "keydown"].forEach(t => removeEventListener(t, first, true));
      if (!sfx.on && !(e.target.closest && e.target.closest("#audio"))) setAudio(true, true);
    };
    ["pointerdown", "keydown"].forEach(t => addEventListener(t, first, true));
  }
  // pause while the tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (!sfx.ctx) return;
    if (document.hidden) sfx.ctx.suspend && sfx.ctx.suspend(); else if (sfx.on) sfx.ctx.resume && sfx.ctx.resume();
  });

  /* ---------------- email: crossfading label + wiping underline ---------------- */
  const inq = $(".inquiry"), mail = $("#mail");
  const states = Object.fromEntries($$("[data-state]", inq).map(s => [s.dataset.state, s]));
  let stateNow = "idle", copiedTimer = 0, lineIdx = 0;
  function setState(name) {
    if (name === stateNow) return;
    const a = states[stateNow], b = states[name]; stateNow = name;
    a.classList.remove("is-on"); b.classList.add("is-on");
    if (reduce) return;
    g.to(a, { opacity: 0, filter: "blur(8px)", duration: 0.25, ease: "power2.in", overwrite: true });
    g.fromTo(b, { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.25, ease: "power2.out", overwrite: true });
  }
  function wipe() {
    if (reduce) return;
    const lines = $$(".uline i", inq), cur = lines[lineIdx], nxt = lines[1 - lineIdx]; lineIdx = 1 - lineIdx;
    g.fromTo(cur, { xPercent: 0 }, { xPercent: 120, duration: 0.9, ease: "power3.out", overwrite: true });
    g.fromTo(nxt, { xPercent: -120 }, { xPercent: 0, duration: 0.9, delay: 0.08, ease: "power3.out", overwrite: true });
  }
  g.set($$(".uline i", inq)[1], { xPercent: -120 });
  mail.addEventListener("pointerenter", () => { wipe(); if (stateNow !== "done") setState("hover"); });
  mail.addEventListener("pointerleave", () => { wipe(); if (stateNow !== "done") setState("idle"); });
  async function copyEmail(fromEl) {
    try { await navigator.clipboard.writeText(SITE.email); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents(fromEl); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      say("Selected — press Ctrl/Cmd + C"); return false;
    }
    return true;
  }
  mail.addEventListener("click", async () => {
    if (await copyEmail($("[data-email]", mail))) {
      setState("done"); sfx.tone(1320, 0.1, 0.06);
      clearTimeout(copiedTimer); copiedTimer = setTimeout(() => setState(mail.matches(":hover") ? "hover" : "idle"), 3000);
    }
  });

  /* ---------------- menu: staggered panel, blurred siblings, walking arrow ---------------- */
  const menu = $("#menu"), panel = $("#menuPanel"), layers = $$(".smenu__layer", menu);
  const navList = $("#navList"), arrow = $("#navArrow"), toggle = $("#navToggle");
  const navText = $("#navText"), navIcon = $("#navIcon");
  const navLinks = $$("a", navList), navLabels = $$(".smenu__label", navList);
  const socials = $$(".smenu__socials li, .smenu__k", panel);
  navList.addEventListener("pointerenter", () => navList.classList.add("is-hovering"));
  navList.addEventListener("pointerleave", () => navList.classList.remove("is-hovering"));
  let menuOpen = false, menuTl = null;
  g.set([...layers, panel], { xPercent: -100 });
  g.set(navIcon.children[1], { rotate: 90 });

  // Menu / Close rolls through a few lines, like a slot machine
  function rollLabel(opening) {
    const seq = opening ? ["Menu", "Close", "Menu", "Close"] : ["Close", "Menu", "Close", "Menu"];
    navText.innerHTML = seq.map(t => `<span>${t}</span>`).join("");
    g.fromTo(navText, { yPercent: 0 }, { yPercent: -((seq.length - 1) / seq.length) * 100, duration: reduce ? 0 : 0.5 + seq.length * 0.07, ease: "power4.out" });
  }
  function openMenu() {
    if (menuOpen) return; menuOpen = true;
    menu.setAttribute("data-open", ""); panel.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true"); toggle.setAttribute("aria-label", "Close menu");
    rollLabel(true); sfx.page();
    g.to(navIcon, { rotate: 225, duration: reduce ? 0 : 0.8, ease: "power4.out", overwrite: "auto" });
    menuTl && menuTl.kill();
    g.set(navLabels, { yPercent: 140, rotate: 10 });
    g.set(navLinks, { "--num": 0 });
    g.set(socials, { y: 25, opacity: 0 });
    g.set(arrow, { opacity: 0 });
    const tl = menuTl = g.timeline();
    if (reduce) { tl.set([...layers, panel], { xPercent: 0 }).set(navLabels, { yPercent: 0, rotate: 0 }).set(socials, { y: 0, opacity: 1 }).set(arrow, { opacity: 1 }).set(navLinks, { "--num": 1 }); return; }
    layers.forEach((l, i) => tl.fromTo(l, { xPercent: -100 }, { xPercent: 0, duration: 0.5, ease: "power4.out" }, i * 0.07));
    const at = (layers.length - 1) * 0.07 + 0.08;
    tl.fromTo(panel, { xPercent: -100 }, { xPercent: 0, duration: 0.65, ease: "power4.out" }, at);
    tl.to(navLabels, { yPercent: 0, rotate: 0, duration: 1, ease: "power4.out", stagger: 0.1 }, at + 0.1);
    tl.to(navLinks, { "--num": 1, duration: 0.6, ease: "power2.out", stagger: 0.08 }, at + 0.2);
    tl.add(() => placeArrow(activeNav, false), at + 0.1);
    tl.to(arrow, { opacity: 1, duration: 0.5, ease: "power2.out" }, at + 0.45);
    tl.to(socials, { y: 0, opacity: 1, duration: 0.55, ease: "power3.out", stagger: 0.06 }, at + 0.3);
  }
  function closeMenu(delay = 0) {
    if (!menuOpen) return; menuOpen = false;
    toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open menu");
    panel.setAttribute("aria-hidden", "true");
    const run = () => {
      menuTl && menuTl.kill();
      rollLabel(false);
      g.to(navIcon, { rotate: 0, duration: reduce ? 0 : 0.35, ease: "power3.inOut", overwrite: "auto" });
      menuTl = g.to([...layers.slice().reverse(), panel], {
        xPercent: -100, duration: reduce ? 0 : 0.32, ease: "power3.in", overwrite: "auto",
        onComplete: () => menu.removeAttribute("data-open"),
      });
    };
    if (delay && !reduce) g.delayedCall(delay, run); else run();
  }
  toggle.addEventListener("click", () => (menuOpen ? closeMenu() : openMenu()));
  // click outside the panel closes it
  document.addEventListener("pointerdown", e => {
    if (menuOpen && !panel.contains(e.target) && !toggle.contains(e.target)) closeMenu();
  });

  // the arrow sits right before the active item; on change it walks row by row
  let activeNav = 0;
  const ARROW_GAP = 14, SHIFT = 48;
  function rowY(i) {
    const a = navLinks[i], top = a.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
    return top + a.offsetHeight / 2 - arrow.getBoundingClientRect().height / 2;
  }
  function arrowX() { return navList.getBoundingClientRect().left - panel.getBoundingClientRect().left - 2; }
  function placeArrow(i, animate) {
    navLinks.forEach((a, k) => a.classList.toggle("is-active", k === i));
    if (!animate || reduce || !menuOpen) {
      g.set(arrow, { x: arrowX(), y: rowY(i) });
      navLinks.forEach((a, k) => g.set(a, { x: k === i ? SHIFT : 0 }));
      activeNav = i; return 0;
    }
    const from = activeNav, dir = Math.sign(i - from) || 1, steps = Math.abs(i - from);
    const tl = g.timeline();
    g.to(navLinks[from], { x: 0, duration: 0.22, ease: "power2.out" });
    for (let s = 1; s <= steps; s++) {
      const k = from + dir * s, at = (s - 1) * 0.16;
      tl.to(arrow, { y: rowY(k), duration: 0.24, ease: "power3.out" }, at);
      if (k !== i) {
        tl.to(navLinks[k], { x: SHIFT * 0.6, duration: 0.14, ease: "power2.out" }, at);
        tl.to(navLinks[k], { x: 0, duration: 0.18, ease: "power2.out" }, at + 0.12);
      } else tl.to(navLinks[k], { x: SHIFT, duration: 0.28, ease: "power3.out" }, at);
    }
    activeNav = i;
    return Math.min(0.7, steps * 0.16 + 0.28);
  }
  addEventListener("resize", () => placeArrow(activeNav, false));
  const NAV_INDEX = { home: 0, about: 1, playground: 2, photo: 3, joyous: 4, contact: 5 };
  const navOf = key => NAV_INDEX[key] ?? (key.startsWith("joyous") ? NAV_INDEX.joyous : 0);

  /* ---------------- home UI ---------------- */
  $("#countTot").textContent = "/" + pad(PROJECTS.length);
  const metaF = Object.fromEntries($$("[data-f]").map(el => [el.dataset.f, el]));
  let homeIdx = 0;
  function onCenter(i) {
    const p = PROJECTS[i];
    homeIdx = i;
    blurSwap($("#countCur"), pad(i + 1), { blur: 10 });
    Object.entries(metaF).forEach(([k, el]) => blurSwap(el, esc(p[k] || "—"), { blur: k === "title" ? 12 : 8 }));
    $$("#swatches i").forEach((s, k) => (s.style.backgroundColor = p.palette[k] || ""));
    $("#openProject").href = "#" + p.slug;
    sfx.scroll();
  }
  $("#openProject").addEventListener("click", e => { e.preventDefault(); go(PROJECTS[homeIdx].slug); });

  // the carousel fills whatever space the info block leaves
  const info = $("#info");
  new ResizeObserver(() => { if (info.offsetHeight) document.documentElement.style.setProperty("--info-h", info.offsetHeight + 16 + "px"); }).observe(info);

  /* ---------------- carousel ---------------- */
  const stack = window.Carousel.create({
    el: $("#stage"), items: PROJECTS,
    onCenter, onOpen: i => go(PROJECTS[i].slug),
  });

  /* ---------------- pages ---------------- */
  const page = $("#page");
  function projectHTML(p) {
    const i = PROJECTS.indexOf(p), next = PROJECTS[(i + 1) % PROJECTS.length];
    const words = p.title.split(" ");
    const half = Math.ceil(words.length / 2);
    const rec = (p.recognition && p.recognition.length ? p.recognition : ["—"]).map(esc).join("<br>");
    return `
      <article class="pg proj" aria-labelledby="projTitle">
        <aside class="proj__info">
          <dl>
            <div class="row" data-in><dt>About</dt><dd class="proj__about">${esc(p.about || p.desc)}</dd></div>
            ${p.team ? `<div class="row" data-in><dt>Team</dt><dd>${esc(p.team)}</dd></div>` : ""}
            ${p.role ? `<div class="row" data-in><dt>Role</dt><dd>${esc(p.role)}</dd></div>` : ""}
            ${p.launch ? `<div class="row" data-in><dt>Launch</dt><dd>${esc(p.launch)}</dd></div>` : ""}
            <div class="row" data-in><dt>Recognition</dt><dd>${rec}</dd></div>
          </dl>
          ${p.url ? `<a class="proj__visit" data-in href="${esc(p.url)}" target="_blank" rel="noopener">Visit site <span aria-hidden="true">→</span></a>` : ""}
        </aside>
        <p class="proj__scroll" data-in>Scroll</p>

        <div class="proj__media" data-media>
          ${p.gallery.map((src, k) => isVid(src)
            ? `<button type="button" class="shot shot--video" id="shot-${k}" data-zoom="${k}" aria-label="Play video ${k + 1} with sound"><video src="${src}" poster="${vidPoster(src)}" muted loop playsinline autoplay preload="metadata" width="1280" height="536"></video><span class="shot__play" aria-hidden="true">▶ Play with sound</span></button>`
            : `<button type="button" class="shot" id="shot-${k}" data-zoom="${k}" aria-label="Enlarge image ${k + 1}"><img src="${src}" alt="${esc(p.title)}, image ${k + 1}" width="1600" height="1000"></button>`).join("")}
        </div>
        <h1 class="proj__title${p.title.length > 22 ? " proj__title--long" : ""}" id="projTitle" data-in><span>${esc(words.slice(0, half).join(" "))}</span>${words.length > 1 ? ` <span>${esc(words.slice(half).join(" "))}</span>` : ""}</h1>

        <nav class="proj__mini" data-mini aria-label="Jump to image">
          ${p.gallery.map((src, k) => `<button type="button" data-shot="${k}" aria-label="Go to image ${k + 1}"><img src="${isVid(src) ? vidPoster(src) : src}" alt="" width="1600" height="1000"></button>`).join("")}
        </nav>

        <a class="next" href="#${next.slug}" data-route="${next.slug}">
          <span class="next__k">Next project</span>
          <strong class="next__name">${esc(next.title)}</strong>
        </a>
      </article>`;
  }
  // About page content: window.ABOUT in projects.js (edited in the dashboard's About tab)
  // the starting text, used until the dashboard has saved an About section
  const ABOUT = window.ABOUT || {"title": ["UX/UI, graphic &", "motion designer."], "titleMobile": ["UX/UI,", "graphic &", "motion", "designer."], "hint": "Move your cursor around", "lead": "I’m Phu, a designer in Ho Chi Minh City. For seven years I’ve helped startups, studios and cultural brands turn complex ideas into clear interfaces, sharp visual systems and motion that carries a story.", "columns": [{"title": "UX/UI", "items": ["Product & app design", "Websites", "Design systems", "Prototyping"]}, {"title": "Graphic", "items": ["Brand identity", "Logo & type", "Packaging", "Posters & print"]}, {"title": "Motion", "items": ["Brand motion", "UI animation", "Title sequences", "3D & loops"]}], "experience": [{"role": "Freelance designer", "years": "2023 — Now"}, {"role": "Senior designer, Studio name", "years": "2021 — 2023"}, {"role": "UI/UX designer, Company name", "years": "2019 — 2021"}], "portrait": "images/portrait.svg", "approach": [{"title": "Clarity first", "text": "Every screen, mark and frame has one job. I cut until it does that job well."}], "process": [{"title": "Listen", "text": "Kick-off, goals, audience and constraints."}, {"title": "Research", "text": "Competitors, references, user interviews where they help."}, {"title": "Direction", "text": "Two or three visual and UX routes, one recommendation."}, {"title": "Design", "text": "Flows, UI, identity system and key screens."}, {"title": "Motion", "text": "Transitions, micro-interactions and brand animation."}, {"title": "Prototype", "text": "Clickable prototype and testing with real people."}, {"title": "Handoff", "text": "Specs, assets and support during build."}]};
  const lines = v => (Array.isArray(v) ? v : String(v || "").split("\n")).map(x => String(x).trim()).filter(Boolean);
  function aboutHTML() {
    const A = ABOUT, td = lines(A.title), tm = lines(A.titleMobile).length ? lines(A.titleMobile) : td;
    const cols = (A.columns || []).filter(c => c.title || (c.items || []).length);
    const exp = (A.experience || []).filter(x => x.role || x.company || x.years);
    return `
      <div class="pg split">
        <section class="ahero" data-in>
          <h1 class="ahero__title" aria-label="${esc(td.join(" "))}">
            ${td.map(l => `<span class="ahero__line ahero__line--d" aria-hidden="true">${esc(l)}</span>`).join("")}
            ${tm.map(l => `<span class="ahero__line ahero__line--m" aria-hidden="true">${esc(l)}</span>`).join("")}
          </h1>
          <div class="mascot">
            <button class="mascot__head" id="mascotHead" type="button" aria-label="${esc((SITE.name || "Phu").split(" ")[0])}, say hi"></button>
          </div>
          ${A.hint ? `<p class="mascot__hint">${esc(A.hint)}</p>` : ""}
        </section>
        <p class="split__side" data-in>About</p>
        <div>
          ${String(A.lead || "").split(/\n\s*\n/).map(t => t.trim()).filter(Boolean).map(t => `<p class="lead" data-in>${esc(t).replace(/\n/g, "<br>")}</p>`).join("")}
          ${cols.length ? `<div class="cols" data-in>${cols.map(c => `<div><h3>${esc(c.title || "")}</h3><ul>${(c.items || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>` : ""}
          ${exp.length ? `<ul class="exp" data-in>${exp.map(x => `<li><span class="exp__role">${esc(x.role || "")}</span><span class="exp__co">${esc(x.company || "")}</span><span class="exp__yr">${esc(x.years || "")}</span></li>`).join("")}</ul>` : ""}
          ${(A.approach || []).length || (A.process || []).length ? `<button class="process-open" type="button" data-in data-process>Process &amp; Approach ↗</button>` : ""}
          ${A.runner !== false && window.Runner ? Runner.html(`${esc((SITE.name || "Phu").split(" ")[0])} running while his armour assembles, with his design tools circling him`)
            : A.portrait ? `<img class="portrait" data-in src="${esc(A.portrait)}" alt="Portrait of ${esc(SITE.name || "")}" width="900" height="1125">` : ""}
        </div>
      </div>`;
  }
  function playHTML() {
    const items = PLAYGROUND.map((p, k) => `<button class="mz__item" type="button" data-lb-open="${k}" aria-label="Open ${esc(p.title)}"><img src="${p.image}" alt="${esc(p.title)}" decoding="async"></button>`);
    return `
      <div class="pg pg--play">
        <div class="play__side" data-in>
          <p class="play__count">${pad(PLAYGROUND.length)}</p>
          <p>Side experiments, loops, type studies and things made for fun between projects.</p>
        </div>
        <div class="mz">${items.join("")}</div>
      </div>`;
  }

  /* ---------------- about: Phu's head looks at the cursor (Lottie rig) ---------------- */
  // assets/lottie/phu-head.json is a 21 x 21 grid of look directions: frame = row * 21 + col.
  const LOOK_N = 21, LOTTIE_SRC = "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js";
  const FACES = ["open", "half", "closed", "smile1", "smile2", "smile3"];
  function loadScript(src, ok) {
    if (ok()) return Promise.resolve();
    return new Promise((res, rej) => { const sc = document.createElement("script"); sc.src = src; sc.onload = res; sc.onerror = rej; document.head.append(sc); });
  }
  // stretch each title line to the full width of the About hero
  function fitHero() {
    const title = $(".ahero__title", page);
    if (!title) return;
    const w = title.clientWidth;
    title.querySelectorAll(".ahero__line").forEach(l => {
      if (!l.offsetParent) return;
      l.style.fontSize = "100px";
      l.style.fontSize = (100 * w / l.offsetWidth).toFixed(2) + "px";
    });
  }
  addEventListener("resize", fitHero);
  document.fonts && document.fonts.ready.then(fitHero);

  let heroRO = null;
  function setupMascot() {
    fitHero();
    heroRO && heroRO.disconnect();
    const ht = $(".ahero__title", page);
    if (ht && window.ResizeObserver) { heroRO = new ResizeObserver(fitHero); heroRO.observe(ht); }
    const box = $("#mascotHead", page);
    if (!box) return;
    Promise.all([loadScript(LOTTIE_SRC, () => window.lottie), loadScript("assets/lottie/phu-head.js", () => window.PHU_HEAD)]).then(() => {
      if (!box.isConnected) return;
      const anim = window.lottie.loadAnimation({ container: box, renderer: "svg", loop: false, autoplay: false, animationData: window.PHU_HEAD });
      anim.addEventListener("DOMLoaded", () => run(anim));
    }).catch(() => box.insertAdjacentHTML("beforeend", '<img src="images/mascot/head.png" alt="">'));

    function run(anim) {
      const faces = Object.fromEntries(FACES.map(f => [f, box.querySelector("#phu-f-" + f)]));
      let face = "";
      const show = f => { if (f === face) return; face = f; FACES.forEach(k => faces[k] && (faces[k].style.display = k === f ? "" : "none")); };
      show("open");
      box.classList.add("is-ready");

      // where to look: the cursor (or finger); drift around on its own when idle
      const aim = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
      let lastMove = 0;
      const onMove = e => {
        const r = box.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
        aim.x = Math.max(-1, Math.min(1, (e.clientX - cx) / (innerWidth * 0.38)));
        aim.y = Math.max(-1, Math.min(1, (e.clientY - cy) / (innerHeight * 0.38)));
        lastMove = performance.now();
      };
      addEventListener("pointermove", onMove, { passive: true });
      addEventListener("pointerdown", onMove, { passive: true });

      // blink every 2–5 s; smile while hovered or tapped
      let mood = "idle", blinkAt = performance.now() + 2000 + Math.random() * 3000, seq = null;
      const play = (steps, done) => {
        seq && seq.kill(); seq = g.timeline({ onComplete: done });
        let t = 0; steps.forEach(([f, ms]) => { seq.call(show, [f], t); t += ms / 1000; });
      };
      const smile = on => {
        mood = on ? "smile" : "idle";
        if (on) play([["smile1", 140], ["smile2", 300], ["smile3", 0]]);
        else play([["smile2", 180], ["smile1", 140], ["open", 0]], () => (blinkAt = performance.now() + 2000 + Math.random() * 3000));
      };
      box.addEventListener("pointerenter", e => e.pointerType === "mouse" && smile(true));
      box.addEventListener("pointerleave", e => e.pointerType === "mouse" && smile(false));
      box.addEventListener("click", () => { if (mood === "smile") smile(false); else { smile(true); g.delayedCall(1.4, () => mood === "smile" && !box.matches(":hover") && smile(false)); } sfx.tone(880, 0.08, 0.05); });

      let raf = 0;
      const tick = now => {
        if (!box.isConnected) { removeEventListener("pointermove", onMove); removeEventListener("pointerdown", onMove); seq && seq.kill(); anim.destroy(); return; }
        if (now - lastMove > 3500 && !reduce) {
          // idle: look around slowly
          const t = now / 1000;
          aim.x = Math.sin(t * 0.5) * 0.55; aim.y = Math.sin(t * 0.37 + 1) * 0.35;
        }
        const k = reduce ? 1 : 0.12;
        cur.x += (aim.x - cur.x) * k; cur.y += (aim.y - cur.y) * k;
        const col = (cur.x + 1) / 2 * (LOOK_N - 1), row = Math.round((cur.y + 1) / 2 * (LOOK_N - 1));
        anim.goToAndStop(row * LOOK_N + Math.min(col, LOOK_N - 1.001), true);
        if (mood === "idle" && now > blinkAt && !reduce) {
          mood = "blink";
          play([["half", 65], ["closed", 90], ["half", 65], ["open", 0]], () => { mood = "idle"; blinkAt = performance.now() + 2000 + Math.random() * 3000; });
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
  }

  function resolve(route) {
    if (!route || route === "home" || route === "work") return { key: "home" };
    if (route === "about") return { key: "about", label: "About", html: aboutHTML };
    if (route === "playground") return { key: "playground", label: "Playground", html: playHTML };
    if (route === "photo" && window.PhotoPage) return { key: "photo", label: "Photo", html: PhotoPage.html };
    if (route === "joyous" && window.JoyousPage) return { key: "joyous", label: "Joyous", html: JoyousPage.channelHTML };
    const joy = window.JoyousPage && route.startsWith("joyous/") && JoyousPage.find(route);
    if (joy) return { key: route, label: joy.title, html: () => JoyousPage.detailHTML(joy) };
    const p = PROJECTS.find(x => x.slug === route);
    return p ? { key: route, label: p.title, html: () => projectHTML(p), project: p } : { key: "home" };
  }

  function enterPage() {
    if (reduce || page.hidden) return;
    g.fromTo($$("[data-in]", page), { opacity: 0, filter: "blur(12px)", y: 18 },
      { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.7, ease: "power2.out", stagger: 0.08 });
    const media = $("[data-media]", page);
    if (media) g.fromTo(media, { y: innerHeight, filter: "blur(10px)" }, { y: 0, filter: "blur(0px)", duration: 1.6, ease: "power4.out" });
    const mini = $("[data-mini]", page);
    if (mini) g.fromTo(mini, { x: 400 }, { x: 0, duration: 1.6, delay: 0.1, ease: "power4.out" });
  }

  // fluid smoke on the home background
  const splash = !reduce && window.Splash ? Splash.create($("#splash")) : null;

  let leavePage = null;   // cleanup for pages that run their own loops (Joyous)
  function mount(r) {
    leavePage && leavePage(); leavePage = null;
    document.body.classList.toggle("is-dark", r.key === "home" || r.key === "photo" || r.key.startsWith("joyous"));
    splash && splash.pause(r.key !== "home");
    if (r.key === "home") {
      page.hidden = true; page.innerHTML = ""; stack.pause(false); $("#stage").style.visibility = "";
      $(".home").hidden = false;
      return;
    }
    page.innerHTML = r.html(); page.hidden = false; page.scrollTop = 0;
    $(".home").hidden = true; stack.pause(true); $("#stage").style.visibility = "hidden";
    page.focus({ preventScroll: true });
    if (r.project) {
      // keep the stack centred on the project you opened
      stack.go(PROJECTS.indexOf(r.project));
      const shots = $$(".shot", page), minis = $$("[data-shot]", page);
      minis.forEach(b => b.addEventListener("click", () => shots[+b.dataset.shot].scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" })));
      // highlight the thumbnail of the image nearest the middle of the screen
      const sync = () => {
        const mid = innerHeight / 2; let best = 0, bd = Infinity;
        shots.forEach((s, k) => { const r = s.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = k; } });
        minis.forEach((b, k) => b.classList.toggle("is-on", k === best));
      };
      // the big title blurs and fades out over the first half screen of scrolling
      const tLines = $$("#projTitle span", page);
      const blurTitle = () => {
        const k = Math.min(1, page.scrollTop / (innerHeight * 0.5));
        tLines.forEach(l => { l.style.filter = k ? `blur(${(k * 18).toFixed(1)}px)` : ""; l.style.opacity = (1 - k).toFixed(3); l.style.transform = k ? `translateY(${(-k * 0.12).toFixed(3)}em)` : ""; });
      };
      if (!reduce) page.addEventListener("scroll", () => requestAnimationFrame(blurTitle), { passive: true });
      page.addEventListener("scroll", () => requestAnimationFrame(sync), { passive: true }); sync();
      // the fixed side columns step aside when "Next project" comes up
      const side = [$(".proj__info", page), $(".proj__mini", page), $(".proj__scroll", page)];
      new IntersectionObserver(([e]) => {
        g.to(side, { opacity: e.isIntersecting ? 0 : 1, filter: e.isIntersecting ? "blur(8px)" : "blur(0px)", duration: 0.4, ease: "power2.out", overwrite: "auto" });
        side.forEach(el => (el.style.pointerEvents = e.isIntersecting ? "none" : ""));
      }, { root: page, threshold: 0.2 }).observe($(".next", page));
      const items = r.project.gallery.map((src, k) => ({ image: src, title: `${r.project.title} — ${pad(k + 1)}` }));
      shots.forEach(b => b.addEventListener("click", () => { openBox(lb); showLb(+b.dataset.zoom, false, items, true); }));
    }
    if (r.key === "playground") setupPlayground();
    if (r.key === "about") { setupMascot(); if (window.Runner) leavePage = Runner.setup($(".runner", page), { page, reduce }); }
    if (r.key.startsWith("joyous")) leavePage = JoyousPage.setup(page, r.key, { gsap: g, sfx, go, loadScript });
    if (r.key === "photo") PhotoPage.setup(page, { gsap: g, openPhoto: (k, list) => { openBox(lb); showLb(k, false, list); } });
    const pb = $("[data-process]", page); if (pb) pb.addEventListener("click", openProcess);
  }

  const veil = $("#veil"), veilPanel = $(".veil__panel", veil), veilLabel = $("#veilLabel");
  let routeNow = "home", busy = false;
  g.set(veilPanel, { y: 0, yPercent: 100 });
  function go(route, { instant = false } = {}) {
    if (route === "contact") {
      const wasOpen = menuOpen, w = placeArrow(NAV_INDEX.contact, wasOpen);
      closeMenu(w * 0.8);
      if (wasOpen && !reduce) g.delayedCall(w * 0.8 + 0.15, openCards); else openCards();
      return;
    }
    closeProcess();
    const r = resolve(route);
    const navI = navOf(r.key);
    if (busy || r.key === routeNow) { if (menuOpen) closeMenu(placeArrow(navI, true) * 0.8); return; }
    const walk = placeArrow(navI, !instant);
    closeMenu(instant || reduce ? 0 : walk * 0.6 + 0.8);
    try { history.replaceState(null, "", r.key === "home" ? location.pathname + location.search : "#" + r.key); } catch (e) {}
    routeNow = r.key;
    if (instant || reduce) { mount(r); if (!instant) enterPage(); return; }

    busy = true; sfx.page();
    veilLabel.textContent = r.label || "Selected work";
    veil.classList.add("is-on");
    const tl = g.timeline({ delay: walk * 0.6, onComplete: () => { veil.classList.remove("is-on"); busy = false; } });
    tl.set(veilPanel, { y: 0, yPercent: 100, scaleY: 1, transformOrigin: "50% 0%" })
      .set(veilLabel, { opacity: 0, clipPath: "inset(0% 0 0 0)" })
      .to(veilPanel, { yPercent: 0, duration: 0.8, ease: EASE_COVER })
      .to(veilLabel, { opacity: 1, duration: 0.8, ease: "none" }, 0.35)
      .add(() => mount(r), 1.15)
      .set(veilPanel, { transformOrigin: "50% 100%" }, 1.3)
      .add(enterPage, 1.45)
      .to(veilPanel, { scaleY: 0, duration: 1.1, ease: EASE_REVEAL }, 1.3)
      .to(veilLabel, { clipPath: "inset(100% 0 0 0)", duration: 1.1, ease: EASE_REVEAL }, 1.3);
  }
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-route]");
    if (!a) return;
    e.preventDefault(); go(a.dataset.route);
  });
  addEventListener("keydown", e => {
    if (!lb.hidden) {
      if (e.key === "Escape") closeBox(lb);
      if (e.key === "ArrowRight") showLb(lbIdx + 1, true);
      if (e.key === "ArrowLeft") showLb(lbIdx - 1, true);
      e.stopImmediatePropagation(); return;
    }
    if (e.key !== "Escape") return;
    if (menuOpen) closeMenu();
    else if (!reelBox.hidden) closeBox(reelBox);
    else if (processEl) closeProcess();
    else if (cardsOpen) closeCards();
    else if (routeNow.startsWith("joyous/")) go("joyous");
    else if (routeNow !== "home") go("home");
  }, true);

  /* ---------------- drag helper (contact cards, process card) ---------------- */
  function draggable(el) {
    let st = null;
    el.addEventListener("pointerdown", e => {
      if (e.target.closest("a, button")) return;
      st = { x: e.clientX, y: e.clientY, gx: g.getProperty(el, "x"), gy: g.getProperty(el, "y") };
      el.setPointerCapture(e.pointerId);
      el.parentNode && el.parentNode.appendChild(el); // bring to front
    });
    el.addEventListener("pointermove", e => { if (st) g.set(el, { x: st.gx + e.clientX - st.x, y: st.gy + e.clientY - st.y }); });
    el.addEventListener("pointerup", () => (st = null));
  }

  /* ---------------- contact cards ---------------- */
  const cards = $("#cards"), cardEls = $$(".card", cards);
  const CARD_ROT = [-2, 3];
  cardEls.forEach(draggable);
  let cardsOpen = false;
  function openCards() {
    if (cardsOpen) return; cardsOpen = true;
    closeMenu();
    cards.hidden = false; sfx.page();
    cardEls.forEach((c, k) => g.fromTo(c, { x: 0, y: innerHeight * 1.1, rotation: 0 },
      { y: 0, rotation: CARD_ROT[k], duration: reduce ? 0 : 0.9, delay: k * 0.08, ease: "power3.out" }));
  }
  function closeCards() {
    if (!cardsOpen) return; cardsOpen = false;
    placeArrow(navOf(routeNow), false);
    g.to(cardEls, { y: innerHeight * 1.2, rotation: 0, duration: reduce ? 0 : 1.15, ease: "power3.out", stagger: 0.05, onComplete: () => (cards.hidden = true) });
  }
  $("[data-cards-close]").addEventListener("click", closeCards);
  $$("[data-copy-mail]").forEach(b => b.addEventListener("click", async () => { if (await copyEmail(b)) { say("Copied " + SITE.email); sfx.tone(1320, 0.1, 0.06); } }));

  /* ---------------- process card (about) ---------------- */
  let processEl = null;
  function openProcess() {
    if (processEl) return;
    processEl = document.createElement("section");
    processEl.className = "process"; processEl.setAttribute("aria-label", "Process and approach");
    processEl.innerHTML = `
      <div class="card__bar"><span>Process &amp; Approach</span><button type="button" data-process-close>Close ×</button></div>
      ${(ABOUT.approach || []).length ? `<h3>Approach</h3>
      <table>${ABOUT.approach.map((r, k) => `<tr><td>A${k + 1}</td><td>${esc(r.title || "")}</td><td>${esc(r.text || "")}</td></tr>`).join("")}</table>` : ""}
      ${(ABOUT.approach || []).length && (ABOUT.process || []).length ? `<p class="amp">&amp;</p>` : ""}
      ${(ABOUT.process || []).length ? `<h3>Process</h3>
      <table>${ABOUT.process.map((r, k) => `<tr><td>P${k + 1}</td><td>${esc(r.title || "")}</td><td>${esc(r.text || "")}</td></tr>`).join("")}</table>` : ""}`;
    document.body.appendChild(processEl);
    draggable(processEl);
    $("[data-process-close]", processEl).addEventListener("click", closeProcess);
    g.fromTo(processEl, { y: innerHeight, rotation: 0 }, { y: 0, rotation: -2, duration: reduce ? 0 : 0.9, ease: "power3.out" });
  }
  function closeProcess() {
    if (!processEl) return;
    const el = processEl; processEl = null;
    g.to(el, { y: innerHeight * 1.2, rotation: 0, duration: reduce ? 0 : 1.15, ease: "power3.out", onComplete: () => el.remove() });
  }

  /* ---------------- lightbox + showreel ---------------- */
  const EASE_LB = bez(.22, 1, .36, 1);
  const lb = $("#lightbox"), lbMedia = $("#lbMedia"), reelBox = $("#reelBox"), reelMedia = $("#reelMedia");
  let lbIdx = 0, lbList = PLAYGROUND;
  function showLb(i, swap, list, fly) {
    if (list) lbList = list;
    lbIdx = (i + lbList.length) % lbList.length;
    const it = lbList[lbIdx];
    const put = () => {
      lbMedia.innerHTML = `${isVid(it.image) ? `<video src="${it.image}" controls autoplay playsinline></video>` : `<img src="${it.image}" alt="${esc(it.title)}">`}<figcaption>${esc(it.title)} · ${pad(lbIdx + 1)}/${pad(lbList.length)}</figcaption>`;
      if (fly && !reduce) // project images arrive like a card thrown onto the table
        g.fromTo(lbMedia, { opacity: 1, filter: "blur(0px)", scale: 1, y: innerHeight * 1.2, rotation: -38 }, { y: 0, rotation: 0, duration: 1, ease: "power4.out" });
      else
        g.fromTo(lbMedia, { opacity: 0, filter: "blur(7px)", scale: 0.975, y: 0, rotation: 0 }, { opacity: 1, filter: "blur(0px)", scale: 1, duration: reduce ? 0 : (swap ? 0.16 : 0.42), ease: EASE_LB });
    };
    if (swap) g.to(lbMedia, { opacity: 0, duration: 0.15, ease: "power1.in", onComplete: put }); else put();
  }
  function openBox(box) { box.hidden = false; g.fromTo(box, { opacity: 0 }, { opacity: 1, duration: reduce ? 0 : 0.26, ease: "power1.out" }); }
  function closeBox(box) {
    g.to(box, { opacity: 0, duration: reduce ? 0 : 0.15, ease: "power1.in", onComplete: () => { box.hidden = true; if (box === reelBox) reelMedia.innerHTML = '<span class="spinner" aria-hidden="true"></span>'; } });
  }
  $$("[data-lb-close]").forEach(b => b.addEventListener("click", () => closeBox(b.closest(".lightbox"))));
  $$("[data-lb]").forEach(b => b.addEventListener("click", () => showLb(lbIdx + +b.dataset.lb, true)));
  [lb, reelBox].forEach(box => box.addEventListener("click", e => { if (e.target === box) closeBox(box); }));
  let lbTouch = null;
  lb.addEventListener("touchstart", e => (lbTouch = e.touches[0].clientX), { passive: true });
  lb.addEventListener("touchend", e => { if (lbTouch === null) return; const dx = e.changedTouches[0].clientX - lbTouch; if (Math.abs(dx) > 40) showLb(lbIdx + (dx < 0 ? 1 : -1), true); lbTouch = null; });

  $("#reel").addEventListener("click", e => {
    e.preventDefault(); openBox(reelBox);
    const src = SITE.showreel;
    const html = !src ? `<img src="images/showreel.svg" alt="Showreel placeholder" width="1920" height="1080"><p class="reel-note">Add your showreel in assets/projects.js (SITE.showreel)</p>`
      : /\.(mp4|webm|mov)$/i.test(src) ? `<video src="${src}" autoplay controls playsinline></video>`
      : `<iframe src="${src}" allow="autoplay; fullscreen" allowfullscreen title="Showreel"></iframe>`;
    setTimeout(() => { reelMedia.innerHTML = html; g.fromTo(reelMedia.children, { opacity: 0, filter: "blur(7px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.42, ease: EASE_LB }); }, reduce ? 0 : 450);
  });

  // masonry (after reactbits.dev/components/masonry): each image drops into the shortest column at its own height
  function setupPlayground() {
    const box = $(".mz", page), items = $$(".mz__item", page);
    if (!box) return;
    items.forEach(b => b.addEventListener("click", () => { openBox(lb); showLb(+b.dataset.lbOpen, false, PLAYGROUND); }));
    if (!reduce) items.forEach(b => {
      b.addEventListener("pointerenter", e => e.pointerType === "mouse" && g.to(b, { scale: 0.95, duration: 0.6, ease: "power3.out" }));
      b.addEventListener("pointerleave", () => g.to(b, { scale: 1, duration: 0.6, ease: "power3.out" }));
    });
    const ratios = items.map(() => 1);
    const columns = w => (w >= 1100 ? 4 : w >= 620 ? 3 : 2);
    let shown = false;
    function layout() {
      const w = box.clientWidth, n = columns(w), gap = innerWidth <= 760 ? 6 : 10;
      const cw = (w - gap * (n - 1)) / n, hs = Array(n).fill(0);
      items.forEach((el, k) => {
        const c = hs.indexOf(Math.min(...hs)), x = c * (cw + gap), y = hs[c], h = cw * ratios[k];
        hs[c] += h + gap;
        g.set(el, { width: cw, height: h });
        if (!shown && !reduce) // rise in from below the screen, blurred, one after another
          g.fromTo(el, { x, y: y + innerHeight * 0.7, opacity: 0, filter: "blur(10px)" },
            { y, opacity: 1, filter: "blur(0px)", duration: 0.8, delay: 0.35 + k * 0.05, ease: "power3.out" });
        else if (!shown) g.set(el, { x, y, opacity: 1 });
        else g.to(el, { x, y, duration: 0.6, ease: "power3.out", overwrite: "auto" });
      });
      box.style.height = Math.max(0, Math.max(...hs) - gap) + "px";
      shown = true;
    }
    Promise.all($$("img", box).map((im, k) => (im.complete ? Promise.resolve() : new Promise(r => (im.onload = im.onerror = r)))
      .then(() => { if (im.naturalWidth) ratios[k] = im.naturalHeight / im.naturalWidth; }))).then(() => {
      if (!box.isConnected) return;
      layout();
      let last = box.clientWidth;
      const ro = new ResizeObserver(() => {
        if (!box.isConnected) return ro.disconnect();
        if (box.clientWidth !== last) { last = box.clientWidth; layout(); }
      });
      ro.observe(box);
    });
  }

  /* ---------------- intro ---------------- */
  const loader = $("#loader"), push = $(".loader__push", loader), count = $("#loaderCount");
  const nameHTML = `<p class="loader__name"><span>${esc(SITE.name.split(" ")[0])}</span><span>${esc(SITE.name.split(" ").slice(1).join(" "))}</span></p>`;
  push.innerHTML = nameHTML;
  $(".loader__top", loader).innerHTML = nameHTML;
  $(".loader__bottom", loader).innerHTML = nameHTML;

  function revealUI() {
    document.body.classList.remove("is-loading");
    if (reduce) return;
    g.fromTo([".count", ".info__main > *", ".meta > div", ".info__foot", ".chrome > *"], { opacity: 0, filter: "blur(10px)", y: 12 },
      { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.8, delay: 0.35, stagger: 0.04, ease: "power2.out" });
  }

  // flying Phu (images/mascot/flying.png): every upward boost opens the curtain one step
  const FLY = { src: "images/mascot/flying.png", up: 0.42, down: 0.78 };
  const STEPS = [0.24, 0.5, 0.76, 1];   // how far the curtain is open after each boost
  const jumper = $("#jumper", loader), curtains = $$(".loader__curtain", loader);
  function loadImage(src) {
    return new Promise(res => { const im = new Image(); im.onload = im.onerror = () => res(im); im.src = src; });
  }

  function startIntro() {
    const deep = resolve(location.hash.slice(1));
    placeArrow(navOf(deep.key), false);
    if (reduce) { loader.remove(); revealUI(); if (deep.key !== "home") go(deep.key, { instant: true }); return; }

    // what the curtain waits for: the home covers
    const covers = PROJECTS.map(p => p.image);
    let loaded = 0;
    covers.forEach(src => loadImage(src).then(() => loaded++));
    const ready = () => loaded / covers.length;

    const shown = { p: 0, n: 0 };
    const paint = () => {
      g.set(curtains[0], { xPercent: -100 * shown.p });
      g.set(curtains[1], { xPercent: 100 * shown.p });
      count.textContent = Math.round(shown.n);
    };
    let step = 0, finished = false, flyTl = null, startedAt = performance.now();

    function openStep() {
      // never run ahead of the loading, unless it is taking far too long
      const late = performance.now() - startedAt > 9000;
      if (step < STEPS.length && (ready() >= STEPS[step] * 0.999 || late)) {
        const to = STEPS[step++];
        g.to(shown, { p: to, n: to * 100, duration: 0.62, ease: "power3.out", onUpdate: paint });
      }
    }
    function fly() {
      // hover: a quick boost up, then a slow drift down, swaying a little
      flyTl = g.timeline({ onComplete: () => (step >= STEPS.length ? land() : fly()) });
      flyTl.call(openStep)
        .to(jumper, { y: -22, rotation: -1.5, scaleY: 1.02, duration: FLY.up, ease: "power2.out" })
        .to(jumper, { y: 10, rotation: 1.2, scaleY: 1, duration: FLY.down, ease: "sine.inOut" });
    }
    function land() {
      if (finished) return; finished = true;
      flyTl && flyTl.kill();
      g.to(shown, { p: 1, n: 100, duration: 0.3, ease: "power2.out", onUpdate: paint });
      const tl = g.timeline({ delay: 0.3 });
      // take off: dip, then shoot up out of the frame
      tl.to(jumper, { y: 24, rotation: 0, duration: 0.22, ease: "power2.out" })
        .to(jumper, { y: () => -innerHeight, opacity: 0, filter: "blur(8px)", scaleY: 1.12, duration: 0.6, ease: "power3.in" })
        .add(() => {
          loader.classList.add("is-split");
          if (deep.key !== "home") go(deep.key, { instant: true });
          else stack.intro();
          revealUI();
        }, "+=0.15")
        .to(".loader__top", { y: "-100vh", duration: 1, ease: "power2.inOut" })
        .to(".loader__bottom", { y: "100vh", duration: 1, ease: "power2.inOut" }, "<")
        .add(() => loader.remove());
    }

    paint();
    loadImage(FLY.src).then(() => {
      jumper.style.backgroundImage = `url("${FLY.src}")`;
      g.fromTo(jumper, { opacity: 0, y: 40 }, { opacity: 1, y: 10, duration: 0.5, ease: "power2.out", onComplete: fly });
    });
    loader.addEventListener("click", () => { step = STEPS.length; land(); }, { once: true });
  }
  (document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]) : Promise.resolve()).then(startIntro);
})();
