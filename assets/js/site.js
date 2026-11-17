/* Interactions for the personal site. No dependencies. */
(() => {
  "use strict";

  const root = document.documentElement;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const hasIO = "IntersectionObserver" in window;
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const fontsReady = Promise.race([document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve(), sleep(1500)]);

  /* Ambient motion (ribbons, the dot field, pulses, the role cycler) can be paused from the nav */
  const motion = {
    on: !reduceMotion && !root.classList.contains("motion-off"),
    fns: [],
    watch(fn) { this.fns.push(fn); },
  };

  /* Text scramble: characters flicker through glyphs, then lock in from left to right */
  const GLYPHS = "!<>-_\\/[]{}=+*^?#01";
  const noise = (text) => Array.from(text, (c) => (c === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join("");
  function scramble(el, to, dur) {
    const from = el.textContent;
    const len = Math.max(from.length, to.length);
    const t0 = performance.now();
    if (el._scramble) cancelAnimationFrame(el._scramble);
    return new Promise((resolve) => {
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        let out = "";
        for (let i = 0; i < len; i++) {
          const lockAt = 0.35 + 0.65 * (i / len);
          const flickerAt = 0.6 * (i / len);
          if (p >= lockAt) out += to[i] || "";
          else if (p >= flickerAt) out += to[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          else out += from[i] || "";
        }
        el.textContent = out;
        if (p < 1) el._scramble = requestAnimationFrame(step);
        else { el.textContent = to; el._scramble = 0; resolve(); }
      };
      el._scramble = requestAnimationFrame(step);
    });
  }

  /* ---------- Pause / play ---------- */
  function initMotionToggle() {
    const btn = $("#motion-toggle");
    if (!btn) return;
    const label = $(".mt-label", btn);
    const render = () => {
      const text = root.classList.contains("motion-off") ? "Play motion" : "Pause motion";
      label.textContent = text;
      btn.title = text;
    };
    render();
    btn.addEventListener("click", () => {
      const off = !root.classList.contains("motion-off");
      root.classList.toggle("motion-off", off);
      try { localStorage.setItem("motion", off ? "off" : "on"); } catch (err) { /* storage can be blocked */ }
      motion.on = !off && !reduceMotion;
      render();
      motion.fns.forEach((fn) => fn(motion.on));
    });
  }

  /* ---------- Hero entrance ---------- */
  function initEnter() {
    const go = () => root.classList.add("loaded");
    if (reduceMotion) go();
    else requestAnimationFrame(() => requestAnimationFrame(go));
  }

  /* ---------- Nav: scrolled state, progress, the section in view ---------- */
  function initNav() {
    const nav = $("#nav");
    const bar = $(".progress", nav);
    let raf = 0;
    const update = () => {
      raf = 0;
      nav.classList.toggle("scrolled", window.scrollY > 8);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (bar) bar.style.setProperty("--p", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : "0");
    };
    update();
    window.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
    window.addEventListener("resize", update);

    const links = $$(".nav-links a");
    const ind = $(".nav-ind");
    const byId = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
    let current = null, hovered = null;
    // The underline marks the section in view, and follows the cursor while it is over the links
    const placeInd = () => {
      if (!ind) return;
      const target = hovered || current;
      if (!target || !target.offsetWidth) { ind.classList.remove("on"); return; }
      ind.style.setProperty("--nx", `${target.offsetLeft}px`);
      ind.style.setProperty("--nw", String(target.offsetWidth));
      ind.classList.add("on");
    };
    if (finePointer) {
      links.forEach((a) => a.addEventListener("pointerenter", () => { hovered = a; placeInd(); }));
      const bar = $(".nav-links");
      if (bar) bar.addEventListener("pointerleave", () => { hovered = null; placeInd(); });
    }
    const setCurrent = (link) => {
      if (link === current) return;
      current = link;
      links.forEach((a) => {
        if (a === link) a.setAttribute("aria-current", "true");
        else a.removeAttribute("aria-current");
      });
      placeInd();
    };
    window.addEventListener("resize", placeInd);
    fontsReady.then(placeInd);

    // Hovering a link decodes its label. The width is held so the row doesn't shift.
    if (finePointer && !reduceMotion) {
      links.forEach((a) => {
        const text = a.textContent;
        a.setAttribute("aria-label", text);
        a.addEventListener("pointerenter", () => {
          if (a._scramble) return;
          a.style.width = `${a.getBoundingClientRect().width}px`;
          scramble(a, text, 380).then(() => { a.style.width = ""; });
        });
      });
    }

    if (!hasIO) return;
    const sections = ["work", "research", "projects", "toolkit", "about", "contact"].map((id) => document.getElementById(id)).filter(Boolean);
    const inBand = new Set();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) inBand.add(entry.target); else inBand.delete(entry.target); });
      const hit = sections.find((s) => inBand.has(s));
      if (hit) setCurrent(byId.get(hit.id) || null);
      else if (sections[0] && sections[0].getBoundingClientRect().top > window.innerHeight * 0.5) setCurrent(null);
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => io.observe(s));
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    const els = $$("[data-reveal]");
    if (reduceMotion || !hasIO) { els.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach((el) => io.observe(el));
  }

  /* Section numbers start as noise and decode when they scroll in */
  function initSecNums() {
    const nums = $$("[data-scramble]");
    if (!nums.length || reduceMotion || !hasIO) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        setTimeout(() => scramble(el, el.dataset.text, 700), 120);
      });
    }, { threshold: 0.9, rootMargin: "0px 0px -8% 0px" });
    nums.forEach((el) => {
      el.dataset.text = el.textContent;
      el.textContent = noise(el.textContent);
      io.observe(el);
    });
  }

  /* Split a heading into words that rise one at a time. Screen readers get the plain sentence. */
  function initSplit() {
    $$("[data-split]").forEach((el) => {
      const sr = document.createElement("span");
      sr.className = "sr-only";
      sr.textContent = el.innerText.replace(/\s+/g, " ").trim();
      const shown = document.createElement("span");
      shown.setAttribute("aria-hidden", "true");
      let k = 0;
      const walk = (node, into) => {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === 3) {
            child.textContent.split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(" ")); return; }
              const w = document.createElement("span");
              w.className = "w";
              const wi = document.createElement("span");
              wi.className = "wi";
              wi.textContent = part;
              wi.style.setProperty("--wi", String(k++));
              w.appendChild(wi);
              into.appendChild(w);
            });
          } else if (child.nodeType === 1) {
            const copy = child.cloneNode(false);
            into.appendChild(copy);
            walk(child, copy);
          }
        });
      };
      walk(el, shown);
      el.textContent = "";
      el.append(sr, shown);
      el.classList.add("split");
    });
  }

  /* ---------- Headline: a scripted speculative decoder (k = 3) ---------- */
  const ROUNDS = [
    { draft: ["I", "build", "ML"], keep: 3, next: "systems," },
    { draft: ["then", "I", "hope"], keep: 2, next: "measure" },
    { draft: ["if", "they", "work."], keep: 0, next: "whether" },
    { draft: ["they", "work."], keep: 1, next: "actually", em: true },
    { draft: ["work."], keep: 1, next: null },
  ];
  function initHeadline() {
    const el = $("#headline");
    const acc = $("#hl-acc");
    const replay = $("#hl-replay");
    if (!el) return;
    let runId = 0;
    async function run() {
      const id = ++runId;
      const alive = () => id === runId;
      const old = $(".hl-anim", el);
      if (old) old.remove();
      const anim = document.createElement("span");
      anim.className = "hl-anim";
      anim.setAttribute("aria-hidden", "true");
      el.appendChild(anim);
      el.classList.add("animating");
      let accepted = 0;
      let drafted = 0;
      if (acc) acc.textContent = "0 of 0";
      const addTok = (text, cls) => {
        let space = null;
        if (anim.childNodes.length) { space = document.createTextNode(" "); anim.appendChild(space); }
        const tok = document.createElement("span");
        tok.className = "tok " + cls;
        tok.textContent = text;
        tok._space = space;
        anim.appendChild(tok);
        return tok;
      };
      const removeTok = (tok) => { if (tok._space) tok._space.remove(); tok.remove(); };
      await sleep(250);
      for (const round of ROUNDS) {
        if (!alive()) return;
        const toks = [];
        for (const word of round.draft) {
          toks.push(addTok(word, "draft"));
          await sleep(55);
          if (!alive()) return;
        }
        toks.forEach((t) => t.classList.add("checking"));
        await sleep(200);
        if (!alive()) return;
        toks.forEach((t) => t.classList.remove("checking"));
        drafted += toks.length;
        toks.forEach((t, i) => {
          if (i < round.keep) { t.classList.remove("draft"); t.classList.add("ok"); accepted += 1; }
          else if (i === round.keep) t.classList.add("rej");
          else t.classList.add("gone");
        });
        if (acc) acc.textContent = `${accepted} of ${drafted}`;
        if (round.keep < toks.length) {
          await sleep(300);
          if (!alive()) return;
          toks.slice(round.keep).forEach(removeTok);
        }
        if (round.next) {
          const tok = addTok(round.next, "ok fix" + (round.em ? " em" : ""));
          setTimeout(() => tok.classList.add("settled"), 650);
        }
        await sleep(110);
      }
      if (!alive()) return;
      await sleep(700);
      el.classList.remove("animating");
      anim.remove();
    }
    if (replay) replay.addEventListener("click", run);
    let seen = false;
    try { seen = sessionStorage.getItem("hl-seen") === "1"; sessionStorage.setItem("hl-seen", "1"); } catch (err) { seen = false; }
    if (reduceMotion || seen) return;
    fontsReady.then(run);
  }

  /* The role next to the name decodes into the next one every few seconds */
  function initRoles() {
    const el = $("#role");
    if (!el || reduceMotion) return;
    const roles = (el.dataset.roles || "").split("|").filter(Boolean);
    if (roles.length < 2) return;
    let i = 0;
    setTimeout(() => {
      setInterval(() => {
        if (document.hidden || !motion.on) return;
        i = (i + 1) % roles.length;
        scramble(el, roles[i], 700);
      }, 3200);
    }, 3000);
  }

  /* ---------- Attention field: the background dot grid leans toward the cursor ---------- */
  function initField() {
    const canvas = $(".field");
    if (!canvas || reduceMotion || !finePointer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    root.classList.add("has-field");
    const GAP = 28;
    const R = 170;
    const R2 = R * R;
    let W = 0, H = 0, mx = -1e4, my = -1e4, energy = 0, lastMove = 0, raf = 0;
    function resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      const oy = -((window.scrollY * 0.3) % GAP);
      const near = [];
      ctx.fillStyle = "rgba(255, 255, 255, 0.055)";
      for (let y = oy + 1; y < H + GAP; y += GAP) {
        for (let x = 1; x < W + GAP; x += GAP) {
          const dx = x - mx;
          const dy = y - my;
          const d2 = dx * dx + dy * dy;
          if (energy > 0 && d2 < R2) near.push(x, y, d2);
          else ctx.fillRect(x - 0.55, y - 0.55, 1.1, 1.1);
        }
      }
      for (let k = 0; k < near.length; k += 3) {
        const x = near[k];
        const y = near[k + 1];
        const w = (1 - near[k + 2] / R2) ** 2 * energy;
        const px = x + (mx - x) * 0.12 * w;
        const py = y + (my - y) * 0.12 * w;
        ctx.fillStyle = `rgba(255, 106, 43, ${(0.07 + 0.75 * w).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(px, py, 0.7 + 1.8 * w, 0, 6.2832);
        ctx.fill();
      }
    }
    function loop(now) {
      raf = 0;
      if (now - lastMove > 900) energy = Math.max(0, energy - 0.04);
      draw();
      if (energy > 0) raf = requestAnimationFrame(loop);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
    window.addEventListener("pointermove", (e) => {
      if (!motion.on) return;
      mx = e.clientX;
      my = e.clientY;
      lastMove = performance.now();
      energy = Math.min(1, energy + 0.25);
      kick();
    }, { passive: true });
    document.documentElement.addEventListener("mouseleave", () => { lastMove = 0; kick(); });
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", resize);
    motion.watch((on) => { if (!on) { energy = 0; kick(); } });
    resize();
  }

  /* Cursor spotlight on boxed elements */
  function initGlow() {
    if (!finePointer) return;
    $$(".card, .lb, .bars, .flow, .op, .metrics > div").forEach((el) => {
      el.classList.add("glow");
      el.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${(e.clientX - r.left).toFixed(1)}px`);
        el.style.setProperty("--my", `${(e.clientY - r.top).toFixed(1)}px`);
      });
    });
  }

  /* ---------- Fig. 0: the forward diffusion process, computed per pixel ---------- */
  function initDiffusion() {
    const fig = $("[data-diffusion]");
    if (!fig) return;
    const frame = $(".frame", fig);
    const img = $("img", fig);
    const canvas = $("canvas", fig);
    const tOut = $("[data-t]", fig);
    const showImage = () => { img.style.animation = "none"; img.style.opacity = "1"; };
    const lock = () => { fig.classList.add("locked"); setTimeout(() => fig.classList.add("settled"), 900); };

    const T = 1000;
    const S = 0.008;
    const CELL = 12;
    const INTRO_MS = 1900;
    const PAD = 8192;
    const fbar = (t) => Math.cos(((t / T + S) / (1 + S)) * (Math.PI / 2)) ** 2;
    const f0 = fbar(0);
    const sa = new Float32Array(T + 1);
    const sb = new Float32Array(T + 1);
    for (let t = 0; t <= T; t++) {
      const ab = Math.min(1, Math.max(0, fbar(t) / f0));
      sa[t] = Math.sqrt(ab);
      sb[t] = Math.sqrt(1 - ab);
    }

    let W = 0, H = 0, ctx = null, out = null, x0 = null, eps = null, field = null, gw = 0, gh = 0;
    let colA, colB, colF, rowA, rowB, rowF;
    let running = false, ready = false, introStart = -1, fieldMax = 0;
    // Scrolling away runs the process forward: the photo diffuses back toward t = 1000
    let scrollLevel = 0, shownLevel = 0;

    function setup() {
      const w = frame.clientWidth;
      if (!w || !img.naturalWidth) return false;
      // Touch screens get a lighter canvas so scroll-driven frames stay smooth
      W = Math.round(Math.min(560, w * Math.min(window.devicePixelRatio || 1, finePointer ? 1.5 : 1)));
      H = Math.round(W * 1.25);
      canvas.width = W;
      canvas.height = H;
      ctx = canvas.getContext("2d");
      const off = document.createElement("canvas");
      off.width = W;
      off.height = H;
      const octx = off.getContext("2d");
      octx.drawImage(img, 0, 0, W, H);
      let px;
      try { px = octx.getImageData(0, 0, W, H).data; } catch (err) { return false; }
      x0 = new Float32Array(W * H * 3);
      for (let i = 0, j = 0; i < px.length; i += 4, j += 3) {
        x0[j] = px[i] / 127.5 - 1;
        x0[j + 1] = px[i + 1] / 127.5 - 1;
        x0[j + 2] = px[i + 2] / 127.5 - 1;
      }
      const n = W * H + PAD;
      eps = new Float32Array(n);
      for (let i = 0; i < n; i += 2) {
        const u = Math.random() || 1e-12;
        const v = Math.random();
        const r = Math.sqrt(-2 * Math.log(u));
        eps[i] = r * Math.cos(2 * Math.PI * v);
        if (i + 1 < n) eps[i + 1] = r * Math.sin(2 * Math.PI * v);
      }
      out = ctx.createImageData(W, H);
      for (let k = 3; k < out.data.length; k += 4) out.data[k] = 255;
      gw = Math.ceil(W / CELL) + 1;
      gh = Math.ceil(H / CELL) + 1;
      field = new Float32Array(gw * gh);
      colA = new Int32Array(W); colB = new Int32Array(W); colF = new Float32Array(W);
      for (let x = 0; x < W; x++) { const g = x / CELL; const a = Math.floor(g); colA[x] = a; colB[x] = Math.min(gw - 1, a + 1); colF[x] = g - a; }
      rowA = new Int32Array(H); rowB = new Int32Array(H); rowF = new Float32Array(H);
      for (let y = 0; y < H; y++) { const g = y / CELL; const a = Math.floor(g); rowA[y] = a * gw; rowB[y] = Math.min(gh - 1, a + 1) * gw; rowF[y] = g - a; }
      return true;
    }

    function draw(level) {
      const d = out.data;
      const off = (Math.random() * PAD) | 0;
      const useField = fieldMax > 0;
      for (let y = 0; y < H; y++) {
        const ra = rowA[y];
        const rb = rowB[y];
        const fy = rowF[y];
        for (let x = 0; x < W; x++) {
          let lvl = level;
          if (useField) {
            const a = colA[x];
            const b = colB[x];
            const fx = colF[x];
            const top = field[ra + a] + (field[ra + b] - field[ra + a]) * fx;
            const bot = field[rb + a] + (field[rb + b] - field[rb + a]) * fx;
            lvl += top + (bot - top) * fy;
            if (lvl > 1) lvl = 1;
          }
          const t = (lvl * T) | 0;
          const s1 = sa[t];
          const p = y * W + x;
          const e = sb[t] * eps[p + off];
          const j = p * 3;
          const k = p << 2;
          d[k] = (s1 * x0[j] + e + 1) * 127.5;
          d[k + 1] = (s1 * x0[j + 1] + e + 1) * 127.5;
          d[k + 2] = (s1 * x0[j + 2] + e + 1) * 127.5;
        }
      }
      ctx.putImageData(out, 0, 0);
    }

    function tick(now) {
      let level = 0;
      if (introStart >= 0) {
        const p = Math.min(1, (now - introStart) / INTRO_MS);
        level = 1 - easeInOut(p);
        if (p >= 1) { introStart = -1; lock(); }
      }
      let m = 0;
      for (let i = 0; i < field.length; i++) {
        let v = field[i] * 0.955;
        if (v < 0.003) v = 0;
        field[i] = v;
        if (v > m) m = v;
      }
      fieldMax = m;
      const lv = Math.max(level, scrollLevel);
      draw(lv);
      shownLevel = -1;
      tOut.textContent = String(Math.round(Math.min(1, lv + m) * T));
      if (introStart >= 0 || fieldMax > 0) requestAnimationFrame(tick);
      else { running = false; paintStill(scrollLevel); }
    }
    // One frame at a fixed noise level, or the clean photo at t = 0
    function paintStill(lv) {
      shownLevel = lv;
      if (lv > 0) { canvas.classList.add("on"); draw(lv); }
      else canvas.classList.remove("on");
      tOut.textContent = String(Math.round(lv * T));
    }
    const SCROLL_TOP = 140;
    let sraf = 0;
    function onScroll() {
      sraf = 0;
      if (!ready) return;
      const r = frame.getBoundingClientRect();
      scrollLevel = motion.on ? clamp01((SCROLL_TOP - r.top) / (r.height * 0.9)) : 0;
      if (running || r.bottom <= 0 || r.top >= window.innerHeight || scrollLevel === shownLevel) return;
      paintStill(scrollLevel);
    }
    function start() {
      canvas.classList.add("on");
      if (!running) { running = true; requestAnimationFrame(tick); }
    }
    function paint(clientX, clientY, strength) {
      const r = canvas.getBoundingClientRect();
      const cx = (((clientX - r.left) / r.width) * W) / CELL;
      const cy = (((clientY - r.top) / r.height) * H) / CELL;
      const R = 4.2;
      const R2 = R * R;
      const i0 = Math.max(0, Math.floor(cx - 2 * R));
      const i1 = Math.min(gw - 1, Math.ceil(cx + 2 * R));
      const j0 = Math.max(0, Math.floor(cy - 2 * R));
      const j1 = Math.min(gh - 1, Math.ceil(cy + 2 * R));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const d2 = ((i - cx) ** 2 + (j - cy) ** 2) / R2;
          const k = j * gw + i;
          field[k] = Math.min(0.8, field[k] + strength * Math.exp(-d2));
        }
      }
      fieldMax = Math.max(fieldMax, 0.01);
      start();
    }
    canvas.addEventListener("pointermove", (e) => { if (ready) paint(e.clientX, e.clientY, e.pointerType === "touch" ? 0.3 : 0.15); });
    canvas.addEventListener("pointerdown", (e) => { if (ready) paint(e.clientX, e.clientY, 0.45); });

    function begin() {
      if (reduceMotion || !setup()) { showImage(); lock(); return; }
      ready = true;
      canvas.classList.add("idle");
      introStart = performance.now();
      draw(1);
      start();
      showImage();
      window.addEventListener("scroll", () => { if (!sraf) sraf = requestAnimationFrame(onScroll); }, { passive: true });
      motion.watch(onScroll);
    }
    if (img.complete && img.naturalWidth) begin();
    else {
      img.addEventListener("load", begin, { once: true });
      img.addEventListener("error", () => { showImage(); lock(); }, { once: true });
    }
  }

  /* Portrait tilt with a moving sheen */
  function initTilt() {
    const frame = $(".portrait .frame");
    if (!frame || !finePointer || reduceMotion) return;
    let raf = 0, px = 0, py = 0;
    const apply = () => {
      raf = 0;
      frame.style.transform = `perspective(1000px) rotateY(${(px * 7).toFixed(2)}deg) rotateX(${(-py * 7).toFixed(2)}deg) scale(1.012)`;
      frame.style.setProperty("--sx", `${((px + 0.5) * 100).toFixed(1)}%`);
      frame.style.setProperty("--sy", `${((py + 0.5) * 100).toFixed(1)}%`);
    };
    frame.addEventListener("pointerenter", () => frame.classList.add("tilting"));
    frame.addEventListener("pointermove", (e) => {
      const r = frame.getBoundingClientRect();
      px = (e.clientX - r.left) / r.width - 0.5;
      py = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    });
    frame.addEventListener("pointerleave", () => { frame.classList.remove("tilting"); frame.style.transform = ""; });
  }

  /* ---------- Ribbons: drift, speed up with scrolling, follow its direction, stop under the cursor ---------- */
  function initRibbons() {
    const wrap = $(".ribbons");
    const tracks = $$(".ribbon-track");
    if (!wrap || !tracks.length) return;
    const state = tracks.map((track) => {
      const first = $(".ribbon-set", track);
      const setW = first.getBoundingClientRect().width;
      const speed = parseFloat(track.dataset.speed) || -0.5;
      return { track, first, setW, speed, x: speed > 0 ? -setW : 0 };
    });
    const fill = () => state.forEach((s) => {
      s.setW = s.first.getBoundingClientRect().width || s.setW;
      const need = Math.max(3, Math.ceil((window.innerWidth * 2.2) / Math.max(1, s.setW)) + 1);
      while (s.track.children.length < need) s.track.appendChild(s.first.cloneNode(true));
      s.x = ((s.x % s.setW) - s.setW) % s.setW;
    });
    const place = () => state.forEach((s) => { s.track.style.transform = `translate3d(${s.x.toFixed(2)}px, 0, 0)`; });
    fill();
    place();
    let rz = 0;
    window.addEventListener("resize", () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { fill(); place(); }); });
    if (reduceMotion || !hasIO) return;

    let visible = false, hover = false, raf = 0, last = 0, lastY = window.scrollY;
    let boost = 0, dir = 1, dirTarget = 1, gate = motion.on ? 1 : 0;
    const loop = (now) => {
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      const dy = window.scrollY - lastY;
      lastY = window.scrollY;
      if (dy > 0.5) dirTarget = 1;
      else if (dy < -0.5) dirTarget = -1;
      // Easing is per millisecond, so it feels the same at 60 Hz and 120 Hz
      const e = 1 - Math.pow(0.92, dt / 16.67);
      dir += (dirTarget - dir) * e;
      boost += (Math.min(6, (Math.abs(dy) / dt) * 4) - boost) * e;
      const want = motion.on && !hover ? 1 : 0;
      gate += (want - gate) * e;
      if (Math.abs(gate - want) < 0.004) gate = want;
      const k = dir * gate * (1 + boost) * dt * 0.06;
      state.forEach((s) => {
        s.x += s.speed * k;
        if (s.x <= -s.setW) s.x += s.setW;
        else if (s.x > 0) s.x -= s.setW;
      });
      place();
      raf = visible && (gate > 0 || want > 0) ? requestAnimationFrame(loop) : 0;
    };
    const kick = () => {
      if (raf || !visible) return;
      last = 0;
      lastY = window.scrollY;
      raf = requestAnimationFrame(loop);
    };
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) kick();
    }).observe(wrap);
    wrap.addEventListener("pointerenter", () => { hover = true; });
    wrap.addEventListener("pointerleave", () => { hover = false; kick(); });
    motion.watch(kick);
  }

  /* ---------- Numbers count up when they scroll in ---------- */
  function initCount() {
    const els = $$("[data-count]");
    if (!els.length || reduceMotion || !hasIO) return;
    const fmt = (v, el) => {
      const dec = Number(el.dataset.dec || 0);
      return el.dataset.sep ? v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec);
    };
    els.forEach((el) => { el.dataset.final = el.textContent; el.textContent = fmt(0, el); });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const el = entry.target;
        const target = parseFloat(el.dataset.count);
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / 1400);
          const k = 1 - Math.pow(1 - p, 4);
          el.textContent = p < 1 ? fmt(target * k, el) : el.dataset.final;
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.5 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- The giant name: fits the width, decodes from noise, lights up under the cursor ---------- */
  function initBigName() {
    const el = $("#bigname");
    if (!el) return;
    const text = el.textContent;
    const box = el.parentElement;
    const fit = () => {
      if (el._scramble) return;
      el.style.fontSize = "";
      const cs = getComputedStyle(box);
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const w = el.getBoundingClientRect().width;
      if (w > 0) el.style.fontSize = `${(parseFloat(getComputedStyle(el).fontSize) * avail * 0.97) / w}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    if (finePointer) {
      box.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--bx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty("--by", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
      box.addEventListener("pointerleave", () => el.style.setProperty("--by", "-80%"));
    }
    if (reduceMotion || !hasIO) return;
    let busy = false;
    const run = () => {
      if (busy) return;
      busy = true;
      scramble(el, text, 1500).then(() => { busy = false; });
    };
    el.textContent = noise(text);
    new IntersectionObserver(([entry]) => { if (entry.isIntersecting) run(); }, { threshold: 0.35 }).observe(el);
    el.addEventListener("pointerenter", run);
  }

  /* Primary buttons lean toward the cursor */
  function initMagnetic() {
    if (!finePointer || reduceMotion) return;
    $$(".btn-primary, #lb-batch").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        b.style.transform = `translate(${(((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(1)}px, ${(((e.clientY - r.top) / r.height - 0.5) * 6).toFixed(1)}px)`;
      });
      b.addEventListener("pointerleave", () => { b.style.transform = ""; });
    });
  }

  /* ---------- Fig. 1: a signal runs through the session monitor while it is on screen ---------- */
  function initFlow() {
    const flows = $$(".flow");
    if (!flows.length || reduceMotion || !hasIO) return;
    const seen = new Map();
    const apply = () => flows.forEach((f) => f.classList.toggle("pulsing", motion.on && seen.get(f) === true));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => seen.set(entry.target, entry.isIntersecting));
      apply();
    }, { threshold: 0.25 });
    flows.forEach((f) => io.observe(f));
    motion.watch(apply);
  }

  /* ---------- ATLAS: the pipeline runs once in view, and again on hover ---------- */
  function initPipeline() {
    const list = $("#pipeline");
    if (!list) return;
    const steps = $$("li", list);
    if (reduceMotion || !hasIO) { steps.forEach((s) => s.classList.add("done")); return; }
    let busy = false, endedAt = 0;
    async function play() {
      if (busy) return;
      busy = true;
      steps.forEach((s) => s.classList.remove("run", "done"));
      await sleep(160);
      for (const s of steps) {
        s.classList.add("run");
        await sleep(230);
        s.classList.remove("run");
        s.classList.add("done");
      }
      busy = false;
      endedAt = performance.now();
    }
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      setTimeout(play, 300);
    }, { threshold: 0.5 });
    io.observe(list);
    const card = list.closest(".card");
    if (card && finePointer) card.addEventListener("pointerenter", () => { if (endedAt && performance.now() - endedAt > 4000) play(); });
  }

  /* ---------- Fig. 2: SWE-bench leaderboard with real bootstrap redraws ---------- */
  function initLeaderboard() {
    const D = window.SWE;
    const fig = $("#lb");
    const chart = $("#lb-chart");
    if (!D || !fig || !chart) return;
    const status = $("#lb-status");
    const redrawBtn = $("#lb-redraw");
    const batchBtn = $("#lb-batch");
    const resetBtn = $("#lb-reset");
    const detailEl = $("#lb-detail");
    const ticks = $("#lb-ticks");
    const axis = $(".lb-axis", fig);

    const XMIN = 0.68;
    const XMAX = 0.84;
    const N_BATCH = 10000;
    const frac = (v) => clamp01((v - XMIN) / (XMAX - XMIN));
    const pct = (v) => (frac(v) * 100).toFixed(3) + "%";
    const share = (x) => {
      if (x >= 0.1) return `${Math.round(x * 100)}%`;
      if (x >= 0.001) return `${(x * 100).toFixed(1)}%`;
      return x > 0 ? "<0.1%" : "0%";
    };
    const n = D.nTasks;
    const START_TEXT = "Published order. Orange agents can't be told apart from #1.";
    const BATCH_LABEL = batchBtn ? batchBtn.textContent : "";

    const rows = D.rows.map((r, i) => {
      const bin = atob(r.b);
      const solved = [];
      for (let k = 0; k < n; k++) if ((bin.charCodeAt(k >> 3) >> (7 - (k & 7))) & 1) solved.push(k);
      return Object.assign({}, r, { i, solved: Int32Array.from(solved), cur: r.s, pos: i, shown: r.rank, wins: 0 });
    });
    const lead = rows[0];
    const sums = new Int32Array(rows.length);
    const counts = new Uint16Array(n);

    rows.forEach((r) => {
      const el = document.createElement("div");
      el.className = "lb-row " + (r.i === 0 ? "lead" : r.tied ? "tied" : "sep");
      el.setAttribute("role", "listitem");
      el.tabIndex = 0;
      el.style.setProperty("--i", String(r.i));
      el.innerHTML =
        '<span class="lb-rank"></span><span class="lb-name"></span>' +
        '<span class="lb-track"><span class="lb-band"></span><span class="lb-ci"></span>' +
        '<span class="lb-ghost"></span><span class="lb-mark"><span class="lb-dot"></span></span></span>' +
        '<span class="lb-first"><i></i><b></b></span>';
      $(".lb-name", el).textContent = r.name;
      const band = $(".lb-band", el);
      band.style.left = pct(lead.lo);
      band.style.width = `calc(${pct(lead.hi)} - ${pct(lead.lo)})`;
      const ci = $(".lb-ci", el);
      ci.style.left = pct(r.lo);
      ci.style.width = `calc(${pct(r.hi)} - ${pct(r.lo)})`;
      const span = frac(r.hi) - frac(r.lo);
      ci.style.setProperty("--o", span > 0 ? `${(((frac(r.s) - frac(r.lo)) / span) * 100).toFixed(1)}%` : "50%");
      $(".lb-ghost", el).style.left = pct(r.s);
      r.el = el;
      r.rankEl = $(".lb-rank", el);
      r.mark = $(".lb-mark", el);
      r.firstBar = $(".lb-first i", el);
      r.firstVal = $(".lb-first b", el);
      const show = () => detail(r);
      el.addEventListener("mouseenter", show);
      el.addEventListener("focus", show);
      el.addEventListener("click", show);
      chart.appendChild(el);
    });
    for (let v = 68; v <= 84; v += 2) {
      const s = document.createElement("span");
      s.style.left = pct(v / 100);
      s.textContent = v + "%";
      ticks.appendChild(s);
    }
    const head = document.createElement("span");
    head.className = "lb-first-head";
    head.textContent = "first";
    axis.appendChild(head);

    let mode = "published", draws = 0, batchN = 0, busy = false, runToken = 0;
    const firsts = new Set();

    function rowHeight() { return parseFloat(getComputedStyle(chart).getPropertyValue("--rh")) || 24; }
    function layout() {
      const h = rowHeight();
      chart.style.height = rows.length * h + "px";
      rows.forEach((r) => {
        r.el.style.transform = `translateY(${r.pos * h}px)`;
        r.mark.style.setProperty("--xf", frac(r.cur).toFixed(4));
        r.rankEl.textContent = String(r.shown);
        r.el.setAttribute("aria-label", `${r.shown}. ${r.name}, ${(r.cur * 100).toFixed(1)} percent`);
      });
    }
    // One redraw: resample the 500 tasks with replacement and re-score every agent on the same draw
    function sample() {
      counts.fill(0);
      for (let k = 0; k < n; k++) counts[(Math.random() * n) | 0] += 1;
      let best = -1;
      for (let a = 0; a < rows.length; a++) {
        const s = rows[a].solved;
        let t = 0;
        for (let k = 0; k < s.length; k++) t += counts[s[k]];
        sums[a] = t;
        if (t > best) best = t;
      }
      return best;
    }
    function detail(r) {
      rows.forEach((x) => x.el.classList.toggle("hl", x === r));
      const tie = r.i === 0 ? "published #1" : r.tied ? "can't be told apart from #1" : "separable from #1";
      let text = `#${r.rank} ${r.name}: ${(r.s * 100).toFixed(1)}% resolved, ` +
        `95% interval ${(r.lo * 100).toFixed(1)} to ${(r.hi * 100).toFixed(1)}, ${tie}`;
      if (mode === "redraw") text += `. This draw: ${(r.cur * 100).toFixed(1)}%, rank ${r.shown}`;
      if (mode === "batch" && batchN) text += `. First in ${share(r.wins / batchN)} of ${batchN.toLocaleString("en-US")} redraws`;
      detailEl.textContent = text;
    }
    function setBusy(on) {
      busy = on;
      redrawBtn.disabled = on;
      batchBtn.disabled = on;
      batchBtn.textContent = on ? "Running" : BATCH_LABEL;
    }
    function reset(updateStatus) {
      runToken += 1;
      setBusy(false);
      rows.forEach((r) => {
        r.cur = r.s; r.pos = r.i; r.shown = r.rank; r.wins = 0;
        r.el.classList.remove("moved-up", "moved-down");
        r.firstBar.style.setProperty("--s", "0");
        r.firstVal.textContent = "";
      });
      mode = "published"; draws = 0; batchN = 0;
      firsts.clear();
      fig.classList.remove("redrawn", "tallied");
      layout();
      if (updateStatus) { status.textContent = START_TEXT; resetBtn.hidden = true; }
    }
    function redraw() {
      if (busy) return;
      if (mode === "batch") reset(false);
      const best = sample();
      rows.forEach((r, a) => { r.cur = sums[a] / n; });
      rows.slice().sort((a, b) => b.cur - a.cur || a.i - b.i).forEach((r, p) => { r.pos = p; });
      rows.forEach((r) => {
        r.shown = 1 + rows.filter((x) => x.cur > r.cur).length;
        r.el.classList.toggle("moved-up", r.pos < r.i);
        r.el.classList.toggle("moved-down", r.pos > r.i);
      });
      const winners = rows.filter((r, a) => sums[a] === best);
      winners.forEach((w) => firsts.add(w.name));
      mode = "redraw";
      draws += 1;
      fig.classList.add("redrawn");
      fig.classList.remove("tallied");
      layout();
      const names = winners.map((w) => `<b>${esc(w.name)}</b>`);
      const who = winners.length === 1
        ? `${names[0]} comes first (published #${winners[0].rank})`
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} tie for first`;
      status.innerHTML = `Redraw ${draws}: ${who}. ${firsts.size} different agent${firsts.size === 1 ? "" : "s"} at #1 so far.`;
      resetBtn.hidden = false;
      chart.classList.remove("pulse");
      void chart.offsetWidth;
      chart.classList.add("pulse");
    }
    async function batch() {
      if (busy) return;
      reset(false);
      setBusy(true);
      const token = runToken;
      mode = "batch";
      fig.classList.add("tallied", "redrawn");
      layout();
      resetBtn.hidden = false;
      const CHUNK = 250;
      let done = 0;
      while (done < N_BATCH) {
        const end = Math.min(N_BATCH, done + CHUNK);
        for (; done < end; done++) {
          const best = sample();
          for (let a = 0; a < rows.length; a++) if (sums[a] === best) rows[a].wins += 1;
        }
        let distinct = 0;
        rows.forEach((r, a) => {
          r.mark.style.setProperty("--xf", frac(sums[a] / n).toFixed(4));
          if (r.wins) distinct += 1;
          r.firstBar.style.setProperty("--s", (r.wins / done).toFixed(4));
          r.firstVal.textContent = r.wins ? share(r.wins / done) : "0";
        });
        status.textContent = `Redraws: ${done.toLocaleString("en-US")} of ${N_BATCH.toLocaleString("en-US")} · ${distinct} different agents at #1 so far`;
        await nextFrame();
        if (token !== runToken) return;
      }
      batchN = N_BATCH;
      rows.forEach((r) => { r.cur = r.s; });
      fig.classList.remove("redrawn");
      layout();
      const distinct = rows.filter((r) => r.wins).length;
      const tops = rows.filter((r) => r.rank === 1).map((r) => share(r.wins / N_BATCH));
      const held = tops.length > 1
        ? `The ${tops.length} agents tied at #1 kept the top spot in ${tops.slice(0, -1).join(", ")} and ${tops[tops.length - 1]} of them.`
        : `The published #1 kept the top spot in ${tops[0]} of them.`;
      status.innerHTML = `${N_BATCH.toLocaleString("en-US")} redraws: <b>${distinct} different agents</b> finished first (a tie counts for each). ${held}`;
      setBusy(false);
    }
    redrawBtn.addEventListener("click", redraw);
    batchBtn.addEventListener("click", batch);
    resetBtn.addEventListener("click", () => { reset(true); redrawBtn.focus(); });
    let raf = 0;
    window.addEventListener("resize", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(layout); });
    layout();

    // Entrance: rows arrive down the list and each interval grows out of its dot
    if (reduceMotion || !hasIO) fig.classList.add("entered");
    else {
      const io = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        fig.classList.add("entered");
        // Once the rows have landed, the Redraw button pulses twice so it reads as something to press
        setTimeout(() => {
          if (draws || mode !== "published" || !motion.on) return;
          redrawBtn.classList.add("nudge");
          redrawBtn.addEventListener("animationend", () => redrawBtn.classList.remove("nudge"), { once: true });
        }, 1700);
      }, { threshold: 0.2 });
      io.observe(fig);
    }
    redrawBtn.addEventListener("click", () => redrawBtn.classList.remove("nudge"));
  }

  /* ---------- About: the opening line brightens word by word as you read it ---------- */
  function initReadAlong() {
    const el = $(".about-lead");
    if (!el || reduceMotion || !hasIO) return;
    const text = el.textContent.trim();
    const sr = document.createElement("span");
    sr.className = "sr-only";
    sr.textContent = text;
    const shown = document.createElement("span");
    shown.setAttribute("aria-hidden", "true");
    const words = text.split(/\s+/).map((w, i) => {
      if (i) shown.appendChild(document.createTextNode(" "));
      const s = document.createElement("span");
      s.className = "rw";
      s.textContent = w;
      shown.appendChild(s);
      return s;
    });
    el.textContent = "";
    el.append(sr, shown);
    el.classList.add("read-along");
    let raf = 0, near = false, lastLit = -1;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      // 0 while the line sits low on the screen, 1 once it has risen to about a third of the way down
      const p = clamp01((vh * 0.9 - r.top) / (vh * 0.55));
      const lit = Math.round(p * (words.length + 1) * 20) / 20;
      if (lit === lastLit) return;
      lastLit = lit;
      words.forEach((s, i) => { s.style.opacity = (0.2 + 0.8 * clamp01(lit - i)).toFixed(2); });
    };
    const kick = () => { if (near && !raf) raf = requestAnimationFrame(update); };
    new IntersectionObserver(([entry]) => { near = entry.isIntersecting; kick(); }, { rootMargin: "20% 0px 20% 0px" }).observe(el);
    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", kick);
    update();
  }

  /* ---------- Footer: how fast this page loaded, measured in the visitor's own browser ---------- */
  function initPerf() {
    const out = $("#perf");
    if (!out || !window.performance || !performance.getEntriesByType) return;
    const report = () => {
      const nav = performance.getEntriesByType("navigation")[0];
      if (!nav || !(nav.loadEventEnd > 0)) return;
      const files = performance.getEntriesByType("resource").length + 1;
      out.textContent = `Measured in your browser just now: loaded in ${(nav.loadEventEnd / 1000).toFixed(2)} s from ${files} files. No framework, no trackers.`;
      out.hidden = false;
    };
    if (document.readyState === "complete") setTimeout(report, 0);
    else window.addEventListener("load", () => setTimeout(report, 0), { once: true });
  }

  /* ---------- Toolkit: each skill points to where it was used ---------- */
  function initToolkit() {
    const NAMES = {
      techademy: ["techademy", "Techademy internship"],
      gwl: ["goodworklabs", "GoodWorkLabs internship"],
      luck: ["luck", "SWE-bench study"],
      spec: ["spec", "Speculative decoding study"],
      atlas: ["atlas", "ATLAS"],
      kindfeed: ["kindfeed", "Kindfeed"],
      authorship: ["authorship", "Authorship detection"],
      glidepath: ["glidepath", "Glidepath"],
    };
    const list = $("#tk-list");
    const chips = $$(".chip");
    if (!list) return;
    chips.forEach((c, i) => c.style.setProperty("--ci", String(i)));
    let shown = null;
    const show = (chip) => {
      if (chip === shown) return;
      shown = chip;
      chips.forEach((c) => c.classList.toggle("active", c === chip));
      const uses = (chip.dataset.uses || "").split(/\s+/).filter(Boolean);
      list.textContent = "";
      if (!uses.length) list.textContent = "not in a project on this page";
      else {
        uses.forEach((u, i) => {
          const [id, label] = NAMES[u];
          if (i) list.appendChild(document.createTextNode(" · "));
          const a = document.createElement("a");
          a.href = "#" + id;
          a.textContent = label;
          list.appendChild(a);
        });
      }
      if (!reduceMotion && list.animate) list.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: "ease-out" });
    };
    chips.forEach((c) => {
      c.addEventListener("mouseenter", () => show(c));
      c.addEventListener("focus", () => show(c));
      c.addEventListener("click", () => show(c));
    });
  }

  function initCopy() {
    const btn = $("#copy-email");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const email = btn.dataset.email;
      try { await navigator.clipboard.writeText(email); btn.textContent = "Copied"; } catch (err) { btn.textContent = email; }
      setTimeout(() => { btn.textContent = "Copy email"; }, 1800);
    });
  }

  initMotionToggle();
  initEnter();
  initNav();
  initSplit();
  initReveal();
  initSecNums();
  initDiffusion();
  initLeaderboard();
  initToolkit();
  initCopy();
  initHeadline();
  initRoles();
  initField();
  initGlow();
  initTilt();
  initCount();
  initMagnetic();
  initFlow();
  initPipeline();
  initReadAlong();
  initPerf();
  fontsReady.then(() => { initRibbons(); initBigName(); });

  console.log("%cHi, curious engineer.", "font: 600 14px system-ui; color: #ff6a2b");
  console.log(
    "Fig. 0 is x_t = sqrt(abar_t) x0 + sqrt(1 - abar_t) eps on a cosine schedule, computed per pixel.\n" +
    "The headline is a scripted speculative decoder with k = 3.\n" +
    "The leaderboard redraws are a real bootstrap over the 500 SWE-bench Verified tasks.\n" +
    "Say hi: pratham.bharati03@gmail.com"
  );
})();
