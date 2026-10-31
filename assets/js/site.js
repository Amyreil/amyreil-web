(() => {
  gsap.registerPlugin(ScrollTrigger);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isHome = !!document.getElementById("hero");

  function splitTextElement(element) {
    function processNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (!text.trim()) return document.createTextNode(text);
        const fragment = document.createDocumentFragment();
        for (const seg of text.split(/(\s+)/)) {
          if (!seg) continue;
          if (/^\s+$/.test(seg)) {
            fragment.appendChild(document.createTextNode(seg));
          } else {
            const span = document.createElement("span");
            span.className = "w";
            span.textContent = seg;
            fragment.appendChild(span);
          }
        }
        return fragment;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName.toLowerCase() === "br") return node.cloneNode(true);
        const clone = node.cloneNode(false);
        Array.from(node.childNodes).forEach((child) => {
          const processed = processNode(child);
          if (processed) clone.appendChild(processed);
        });
        return clone;
      }
      return node.cloneNode(true);
    }
    const childNodes = Array.from(element.childNodes);
    element.innerHTML = "";
    childNodes.forEach((child) => {
      const res = processNode(child);
      if (res) element.appendChild(res);
    });
  }
  document.querySelectorAll(".split").forEach(splitTextElement);

  const heroEl = document.getElementById("hero");

  /* Live hero field: perspective-projected orbits, dust and shards over the plate */
  (() => {
    const canvas = document.getElementById("heroScene");
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx || !heroEl) return;

    const small = matchMedia("(max-width: 760px)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, small ? 2 : 1.75);
    const TAU = Math.PI * 2;
    const rand = (a, b) => a + Math.random() * (b - a);
    let W = 0,
      H = 0,
      focal = 0,
      cx = 0,
      cy = 0;
    let raf = 0,
      running = false,
      last = 0,
      t = 0,
      startAt = 0;
    let yaw = 0,
      pitch = 0,
      targetYaw = 0,
      targetPitch = 0;

    const dot = document.createElement("canvas");
    dot.width = dot.height = 32;
    const dotCtx = dot.getContext("2d");
    const dotGradient = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
    dotGradient.addColorStop(0, "rgba(255,255,255,1)");
    dotGradient.addColorStop(0.25, "rgba(196,224,255,0.9)");
    dotGradient.addColorStop(0.62, "rgba(61,134,255,0.24)");
    dotGradient.addColorStop(1, "rgba(61,134,255,0)");
    dotCtx.fillStyle = dotGradient;
    dotCtx.fillRect(0, 0, 32, 32);

    const dust = Array.from({ length: small ? 240 : 460 }, () => ({
      x: rand(-6.6, 6.6),
      y: rand(-2.7, 3.1),
      z: rand(-2.8, 2.8),
      s: rand(0.7, 2.4),
      a: rand(0.16, 0.7),
      v: rand(0.05, 0.15),
      ph: rand(0, TAU),
    }));
    const bokeh = Array.from({ length: small ? 5 : 10 }, () => ({
      x: rand(-6.4, 6.4),
      y: rand(-2, 3),
      z: rand(1.4, 3.2),
      s: rand(24, 52),
      a: rand(0.03, 0.07),
      v: rand(0.02, 0.05),
      ph: rand(0, TAU),
    }));
    const embers = Array.from({ length: small ? 16 : 28 }, () => ({
      x: rand(-0.9, 0.9),
      y: rand(-1.7, 1.2),
      z: rand(-0.5, 0.9),
      s: rand(2, 4.8),
      alpha: rand(0.35, 0.9),
      v: rand(0.12, 0.34),
      sway: rand(0.05, 0.22),
      ph: rand(0, TAU),
    }));

    const halo = document.createElement("canvas");
    halo.width = halo.height = 128;
    const haloCtx = halo.getContext("2d");
    const haloGradient = haloCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    haloGradient.addColorStop(0, "rgba(61,134,255,0)");
    haloGradient.addColorStop(0.3, "rgba(61,134,255,0.1)");
    haloGradient.addColorStop(0.52, "rgba(86,156,255,0.22)");
    haloGradient.addColorStop(0.75, "rgba(61,134,255,0.06)");
    haloGradient.addColorStop(1, "rgba(61,134,255,0)");
    haloCtx.fillStyle = haloGradient;
    haloCtx.fillRect(0, 0, 128, 128);

    const rayLayer = document.createElement("canvas");
    const rayCtx = rayLayer.getContext("2d");
    const RAY_SCALE = 0.4;

    function resize() {
      const rect = heroEl.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rayLayer.width = Math.max(1, Math.round(W * RAY_SCALE));
      rayLayer.height = Math.max(1, Math.round(H * RAY_SCALE));
      focal = H * 1.05;
      cx = W / 2;

      const actions = document
        .querySelector(".hero-actions")
        ?.getBoundingClientRect();
      const plate = document
        .querySelector(".hero-media img")
        ?.getBoundingClientRect();
      const actionsBottom = actions ? actions.bottom - rect.top : 0;
      const head = plate
        ? plate.top - rect.top + plate.height * 0.566
        : H * 0.66;
      cy = Math.max(head, actionsBottom + 70);
    }

    function project(x, y, z) {
      const cosY = Math.cos(yaw),
        sinY = Math.sin(yaw);
      let rx = x * cosY + z * sinY;
      let rz = -x * sinY + z * cosY;
      const cosP = Math.cos(pitch),
        sinP = Math.sin(pitch);
      const ry = y * cosP - rz * sinP;
      rz = y * sinP + rz * cosP;
      const d = rz + 7;
      if (d < 0.7) return null;
      const s = focal / d;
      return { x: cx + rx * s, y: cy - ry * s, s, d };
    }

    function drawAura(ramp) {
      const pulse = 0.78 + 0.22 * Math.sin(t * 1.1);
      const size = H * 0.95;
      ctx.globalAlpha = 0.68 * ramp * pulse;
      ctx.drawImage(halo, cx - size / 2, cy - size / 2, size, size);
      ctx.globalAlpha = 1;

      rayCtx.setTransform(1, 0, 0, 1, 0, 0);
      rayCtx.clearRect(0, 0, rayLayer.width, rayLayer.height);
      rayCtx.setTransform(RAY_SCALE, 0, 0, RAY_SCALE, 0, 0);
      rayCtx.filter = "blur(4px)";
      const originY = cy - H * 0.02;
      const len = H * 1.05;
      for (let i = -2; i <= 2; i++) {
        const ang = i * 0.26 + Math.sin(t * 0.22 + i * 1.7) * 0.025;
        const endX = cx + Math.sin(ang) * len;
        const endY = originY - Math.cos(ang) * len;
        const spread = 44 + Math.abs(i) * 16;
        const grad = rayCtx.createLinearGradient(cx, originY, endX, endY);
        grad.addColorStop(0, "rgba(86,156,255,0)");
        grad.addColorStop(0.4, `rgba(86,156,255,${0.07 - Math.abs(i) * 0.01})`);
        grad.addColorStop(1, "rgba(86,156,255,0)");
        rayCtx.fillStyle = grad;
        rayCtx.beginPath();
        rayCtx.moveTo(cx - 14, originY);
        rayCtx.lineTo(cx + 14, originY);
        rayCtx.lineTo(endX + spread, endY);
        rayCtx.lineTo(endX - spread, endY);
        rayCtx.closePath();
        rayCtx.fill();
      }
      rayCtx.filter = "none";
      ctx.globalAlpha = 0.95 * ramp;
      ctx.drawImage(rayLayer, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    function drawHorizon(ramp) {
      const segs = 90;
      const yBase = -1.72;
      for (let i = 0; i < segs; i++) {
        const x1 = -7 + (i / segs) * 14;
        const x2 = -7 + ((i + 1) / segs) * 14;
        const wob = (x) =>
          yBase +
          Math.sin(x * 0.9 + t * 0.5) * 0.12 +
          Math.cos(x * 1.7 - t * 0.3) * 0.05;
        const p1 = project(x1, wob(x1), -0.6);
        const p2 = project(x2, wob(x2), -0.6);
        if (!p1 || !p2) continue;
        const fade = Math.pow(Math.cos((x1 / 7) * 1.35), 2);
        const depth = Math.max(0.12, Math.min(1, 1.4 - p1.d / 9));
        ctx.strokeStyle = `rgba(86,156,255,${0.4 * fade * depth * ramp})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(58,120,255,${0.1 * fade * depth * ramp})`;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }
    }

    function draw(now) {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      if (!reduce) t += dt;
      yaw += (targetYaw - yaw) * Math.min(1, dt * 2.6);
      pitch += (targetPitch - pitch) * Math.min(1, dt * 2.6);
      const ramp = startAt ? Math.min(1, (now - startAt) / 1600) : 1;
      const eased = 1 - Math.pow(1 - ramp, 3);
      const grow = 0.72 + 0.28 * eased;
      const scrollShift = Math.min(1.4, window.scrollY / Math.max(1, H)) * 0.24;
      const basePitch = pitch + scrollShift;
      const savedPitch = pitch;
      pitch = basePitch;

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      drawAura(eased);
      drawHorizon(eased);

      for (const e of embers) {
        if (!reduce) {
          e.y += e.v * dt;
          if (e.y > 1.4) {
            e.y = -1.8;
            e.x = rand(-0.9, 0.9);
            e.z = rand(-0.5, 0.9);
          }
        }
        const x = e.x * grow + Math.sin(t * 0.7 + e.ph) * e.sway;
        const q = project(x, e.y * grow, e.z);
        if (!q) continue;
        const depth = Math.max(0.2, Math.min(1, 0.25 + (8.5 - q.d) * 0.34));
        const flicker = 0.55 + 0.45 * Math.sin(t * 2.1 + e.ph * 1.9);
        const size = Math.max(1.2, e.s * (q.s / (focal / 7)) * 0.8);
        ctx.globalAlpha = e.alpha * depth * flicker * eased;
        ctx.drawImage(dot, q.x - size / 2, q.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;

      for (const p of dust) {
        if (!reduce) {
          p.y += p.v * dt;
          if (p.y > 3.1) p.y = -2.7;
        }
        const q = project(p.x + Math.sin(t * 0.25 + p.ph) * 0.12, p.y, p.z);
        if (!q) continue;
        const depth = Math.max(0.2, Math.min(1, 1.45 - q.d / 10));
        const size = Math.max(1, p.s * q.s * 0.02);
        ctx.globalAlpha = p.a * depth * eased;
        ctx.drawImage(dot, q.x - size / 2, q.y - size / 2, size, size);
      }
      for (const b of bokeh) {
        if (!reduce) {
          b.y += b.v * dt;
          if (b.y > 3.2) b.y = -2;
        }
        const q = project(b.x, b.y, b.z);
        if (!q) continue;
        const size = b.s * (q.s / (focal / 7));
        ctx.globalAlpha = b.a * eased;
        ctx.drawImage(dot, q.x - size / 2, q.y - size / 2, size, size);
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      pitch = savedPitch;
    }

    function loop(now) {
      if (!running) return;
      if (!startAt) startAt = now;
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    function startLoop() {
      if (running || reduce) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
    function stopLoop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    resize();
    canvas.classList.add("is-live");

    if (reduce) {
      startAt = performance.now() - 2000;
      draw(performance.now());
    } else {
      window.addEventListener(
        "pointermove",
        (e) => {
          targetYaw = ((e.clientX / window.innerWidth) * 2 - 1) * 0.16;
          targetPitch = ((e.clientY / window.innerHeight) * 2 - 1) * 0.06;
        },
        { passive: true },
      );
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) =>
              entry.isIntersecting ? startLoop() : stopLoop(),
            );
          },
          { threshold: 0 },
        ).observe(heroEl);
      } else {
        startLoop();
      }
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) stopLoop();
        else startLoop();
      });
    }

    let resizeTimer = 0;
    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resize();
        if (reduce) {
          startAt = performance.now() - 2000;
          draw(performance.now());
        }
      }, 120);
    };
    window.addEventListener("resize", onResize, { passive: true });
  })();

  const lenis = new Lenis({
    duration: reduce ? 0.1 : 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: !reduce,
    wheelMultiplier: 0.95,
  });
  const scrollDuration = reduce ? 0 : 1.2;
  window.__amyreilLenis = lenis;
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const href = anchor.getAttribute("href");
      if (href && href !== "#") {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          lenis.scrollTo(target, { offset: -84, duration: scrollDuration });
        }
      }
    });
  });

  const nav = document.querySelector(".nav");
  const syncNav = () => nav?.classList.toggle("is-solid", window.scrollY > 32);
  syncNav();
  window.addEventListener("scroll", syncNav, { passive: true });
  lenis.on("scroll", ({ scroll }) => {
    if (nav) nav.classList.toggle("is-solid", scroll > 32);
  });

  const menuBtn = document.querySelector(".menu-btn");
  const mobileMenu = document.getElementById("mobileMenu");
  const menuClose = document.querySelector(".menu-close");
  let menuOpen = false;

  function openMenu() {
    if (!mobileMenu || !menuBtn) return;
    menuOpen = true;
    mobileMenu.classList.add("is-open");
    mobileMenu.setAttribute("aria-hidden", "false");
    menuBtn.setAttribute("aria-expanded", "true");
    lenis.stop();
    setTimeout(() => menuClose?.focus(), 60);
  }
  function closeMenu(restoreFocus = true) {
    if (!mobileMenu || !menuBtn) return;
    menuOpen = false;
    mobileMenu.classList.remove("is-open");
    mobileMenu.setAttribute("aria-hidden", "true");
    menuBtn.setAttribute("aria-expanded", "false");
    lenis.start();
    if (restoreFocus) menuBtn.focus();
  }
  menuBtn?.addEventListener("click", openMenu);
  menuClose?.addEventListener("click", () => closeMenu());
  mobileMenu?.querySelectorAll("[data-menu-link]").forEach((link) => {
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");
      closeMenu(false);
      if (href && href.startsWith("#")) {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          setTimeout(
            () =>
              lenis.scrollTo(target, { offset: -84, duration: scrollDuration }),
            50,
          );
        }
      }
    });
  });
  mobileMenu
    ?.querySelector(".open-modal")
    ?.addEventListener("click", () => closeMenu(false));
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menuOpen) closeMenu();
    if (e.key === "Tab" && menuOpen && mobileMenu) {
      const focusables = [...mobileMenu.querySelectorAll("a[href], button")];
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
  window.matchMedia("(min-width: 861px)").addEventListener("change", (e) => {
    if (e.matches && menuOpen) closeMenu(false);
  });

  if (isHome) {
    lenis.stop();
    if (!reduce) {
      gsap.set(".hero-title .w", {
        opacity: 0,
        yPercent: 38,
        rotateX: -74,
        transformPerspective: 900,
        transformOrigin: "50% 100%",
        filter: "blur(10px)",
      });
      gsap.set(".hero-sub, .hero-actions", { opacity: 0, y: 16 });
      gsap.set(".nav", { opacity: 0 });
    }

    const introTL = gsap.timeline({
      paused: true,
      onComplete: () => {
        document.body.classList.remove("intro");
        lenis.start();
        setupScroll();
      },
    });

    if (!reduce) {
      introTL
        .to(".nav", { opacity: 1, duration: 0.5, ease: "power3.out" })
        .to(
          ".hero-title .w",
          {
            opacity: 1,
            yPercent: 0,
            rotateX: 0,
            filter: "blur(0px)",
            duration: 1.05,
            stagger: 0.075,
            ease: "power4.out",
          },
          "-=0.3",
        )
        .to(
          ".hero-sub, .hero-actions",
          { opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: "power3.out" },
          "-=0.6",
        );
    }

    const preloader = document.getElementById("preloader");
    const startIntro = () => {
      if (preloader) {
        preloader.classList.add("fade-out");
        setTimeout(() => preloader.remove(), 300);
      }
      if (reduce) {
        document.body.classList.remove("intro");
        lenis.start();
        setupScroll();
      } else {
        introTL.play();
      }
    };

    if (new URLSearchParams(location.search).has("loader")) {
      // keep loader visible for inspection
    } else if (reduce) {
      startIntro();
    } else {
      setTimeout(startIntro, 180);
    }
  } else {
    document.body.classList.remove("intro");
    lenis.start();
    setupScroll();
  }

  function setupScroll() {
    if (reduce) {
      ScrollTrigger.refresh();
      return;
    }

    if (isHome) {
      gsap.to(".hero-media img", {
        yPercent: 7,
        ease: "none",
        scrollTrigger: {
          trigger: "#hero",
          start: "top top",
          end: "bottom top",
          scrub: true,
        },
      });
    }

    document.querySelectorAll(".reveal").forEach((el) => {
      gsap.from(el, {
        opacity: 0,
        y: 18,
        duration: 0.75,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: el, start: "top 88%" },
      });
    });

    document.querySelectorAll(".split").forEach((title) => {
      if (title.closest("#hero")) return;
      gsap.from(title.querySelectorAll(".w"), {
        opacity: 0,
        y: 20,
        duration: 0.8,
        stagger: 0.05,
        ease: "power3.out",
        scrollTrigger: { trigger: title, start: "top 85%" },
      });
    });

    /* Section copy joins the page as it enters, so the handoff between sections is not abrupt. */
    const copyGroups = document.querySelectorAll(
      ".detail-copy, .principle-copy, .loop-tools, .loop-head .lead, .work-head > p, .founders-head p, .note-list, .product-cta-grid > div, .teaser-grid > div, .contact-inner > p, .contact-actions, .more-products-grid",
    );
    copyGroups.forEach((group) => {
      const items = group.children.length
        ? Array.from(group.children)
        : [group];
      gsap.from(items, {
        opacity: 0,
        y: 14,
        duration: 0.7,
        stagger: 0.06,
        ease: "power2.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: group, start: "top 88%" },
      });
    });

    const journey = document.getElementById("loopJourney");
    if (journey) {
      gsap.from(journey.children, {
        opacity: 0,
        y: 22,
        duration: 0.85,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: journey, start: "top 84%" },
      });
    }

    if (isHome) {
      gsap.from(".choice", {
        opacity: 0,
        y: 40,
        duration: 0.9,
        stagger: 0.12,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: ".choice-grid", start: "top 82%" },
      });

      gsap.from(".principle-collage", {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: ".principle-grid", start: "top 85%" },
      });

      gsap.from(".cap-item", {
        opacity: 0,
        y: 20,
        duration: 0.6,
        stagger: 0.07,
        ease: "power2.out",
        clearProps: "transform,opacity",
        scrollTrigger: { trigger: ".cap-list", start: "top 85%" },
      });

      gsap.to("#ctaImg", {
        yPercent: 8,
        ease: "none",
        scrollTrigger: {
          trigger: "#cta",
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }

    ScrollTrigger.refresh();
  }

  window.addEventListener("load", () => ScrollTrigger.refresh());

  const stepItems = Array.from(document.querySelectorAll(".step-item"));
  const stagePanels = Array.from(document.querySelectorAll(".stage-panel"));
  const stageBar = document.querySelector(".stage-bar i");
  const stageCount = document.querySelector(".stage-count");

  function activateStep(index, animate = true) {
    stepItems.forEach((el, i) => {
      const on = i === index;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
      el.tabIndex = on ? 0 : -1;
    });
    stagePanels.forEach((el, i) =>
      el.classList.toggle("is-active", i === index),
    );
    if (stageBar)
      stageBar.style.width = `${((index + 1) / stepItems.length) * 100}%`;
    if (stageCount)
      stageCount.textContent = `0${index + 1} / 0${stepItems.length}`;
    if (animate && window.gsap && stagePanels[index] && !reduce) {
      gsap.fromTo(
        stagePanels[index],
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" },
      );
    }
    if (animate && window.innerWidth <= 900) {
      const stage = document.querySelector(".stage");
      if (stage) {
        const r = stage.getBoundingClientRect();
        const visible =
          Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 80);
        if (visible < r.height * 0.6)
          lenis.scrollTo(stage, { offset: -80, duration: 0.8 });
      }
    }
  }

  if (stepItems.length) {
    stepItems.forEach((el, i) => {
      el.addEventListener("click", () => activateStep(i));
      el.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") {
          e.preventDefault();
          const next = (i + 1) % stepItems.length;
          stepItems[next].focus();
          activateStep(next);
        }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
          e.preventDefault();
          const prev = (i - 1 + stepItems.length) % stepItems.length;
          stepItems[prev].focus();
          activateStep(prev);
        }
      });
    });
    activateStep(0, false);
  }

  const btnAccordion = document.getElementById("btnViewAccordion");
  const btnDiagram = document.getElementById("btnViewDiagram");
  const journeyEl = document.getElementById("loopJourney");
  const diagramView = document.getElementById("loopDiagramView");
  if (btnAccordion && btnDiagram && journeyEl && diagramView) {
    btnAccordion.addEventListener("click", () => {
      btnAccordion.classList.add("is-active");
      btnAccordion.setAttribute("aria-pressed", "true");
      btnDiagram.classList.remove("is-active");
      btnDiagram.setAttribute("aria-pressed", "false");
      diagramView.classList.remove("is-visible");
      journeyEl.style.display = "grid";
      ScrollTrigger.refresh();
    });
    btnDiagram.addEventListener("click", () => {
      btnDiagram.classList.add("is-active");
      btnDiagram.setAttribute("aria-pressed", "true");
      btnAccordion.classList.remove("is-active");
      btnAccordion.setAttribute("aria-pressed", "false");
      journeyEl.style.display = "none";
      diagramView.classList.add("is-visible");
      ScrollTrigger.refresh();
    });
  }

  /* Shared contact dialog, injected once so every page has a working CTA. */
  if (
    !document.getElementById("contactModal") &&
    document.querySelector(".open-modal")
  ) {
    const host = document.createElement("div");
    host.innerHTML = `
          <div class="modal-overlay" id="contactModal" role="dialog" aria-modal="true" aria-labelledby="contactModalTitle">
            <div class="modal-card">
              <button class="modal-close" type="button" aria-label="Close dialog">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
              <h3 id="contactModalTitle">Start a conversation.</h3>
              <p>Tell us what you're building, or which product you'd like to see. We reply within one working day.</p>

              <form class="modal-form" id="contactForm">
                <div class="form-group">
                  <label for="cName">Your name</label>
                  <input class="form-input" id="cName" name="name" type="text" autocomplete="name" placeholder="Jane Doe" required>
                </div>
                <div class="form-group">
                  <label for="cEmail">Work email</label>
                  <input class="form-input" id="cEmail" name="email" type="email" autocomplete="email" spellcheck="false" placeholder="jane@company.com" required>
                </div>
                <div class="form-group">
                  <label for="cNeed">What can we help with?</label>
                  <select class="form-select" id="cNeed" name="service" required>
                    <option value="SaaS Product Development">SaaS product development</option>
                    <option value="Web & App Development">Web and app development</option>
                    <option value="AI Automation Services">AI automation</option>
                    <option value="UI/UX Design & Prototyping">Interface design and prototyping</option>
                    <option value="Data Analytics & Chatbots">Data analytics and chatbots</option>
                    <option value="Workflow Improvement">Workflow improvement</option>
                    <option value="AmyLearn live demo">AmyLearn live demo</option>
                    <option value="HotelEase for my hotel">HotelEase for my hotel</option>
                    <option value="Internship application">Internship application</option>
                    <option value="General Inquiry">General partnership or other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="cProject">Tell us about the challenge</label>
                  <textarea class="form-textarea" id="cProject" name="message" autocomplete="off" spellcheck="true" placeholder="What problem are you trying to solve?" required></textarea>
                </div>
                <input class="honey" type="text" name="_honey" id="cHoney" tabindex="-1" autocomplete="off" aria-hidden="true">
                <button class="btn" type="submit" id="submitBtn">Send message</button>
                <p class="form-error" id="formError" role="alert" hidden>
                  We couldn't send that just now. Try again, or email <a href="mailto:contact@amyreil.online">contact@amyreil.online</a> directly.
                </p>
                <p class="form-note">We use these details only to reply. See our <a href="/privacy">privacy policy</a>.</p>
              </form>
            </div>
          </div>`;
    document.body.appendChild(host.firstElementChild);
  }

  const contactModal = document.getElementById("contactModal");
  const modalCard = contactModal
    ? contactModal.querySelector(".modal-card")
    : null;
  let lastFocus = null;

  function openModal(service) {
    if (!contactModal) return;
    lastFocus = document.activeElement;
    contactModal.classList.add("active");
    const select = document.getElementById("cNeed");
    if (service && select) select.value = service;
    lenis.stop();
    setTimeout(() => document.getElementById("cName")?.focus(), 80);
  }
  function closeModal() {
    if (!contactModal) return;
    contactModal.classList.remove("active");
    lenis.start();
    if (lastFocus && !lastFocus.closest("#mobileMenu")) lastFocus.focus();
    else menuBtn?.focus();
  }
  document.querySelectorAll(".open-modal").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openModal(btn.dataset.service);
    }),
  );
  contactModal?.addEventListener("click", (e) => {
    if (e.target === contactModal || e.target.closest(".modal-close"))
      closeModal();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
    if (
      e.key === "Tab" &&
      contactModal &&
      contactModal.classList.contains("active") &&
      modalCard
    ) {
      const focusables = modalCard.querySelectorAll(
        "button, input, select, textarea, a[href]",
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  /* The contact form posts to FormSubmit, which relays it to the studio inbox.
         The first submission sends a one-time activation email to the destination address. */
  const contactForm = document.getElementById("contactForm");
  if (contactForm) {
    const modalTitle = document.getElementById("contactModalTitle");
    const modalIntro = contactModal
      ? contactModal.querySelector(".modal-card > p")
      : null;
    const formMarkup = contactForm.innerHTML;
    const titleText = modalTitle ? modalTitle.textContent : "";
    const introText = modalIntro ? modalIntro.textContent : "";
    const FORM_ENDPOINT =
      "https://formsubmit.co/ajax/connect.bikram9632@gmail.com";

    const showSuccess = () => {
      if (modalTitle) modalTitle.textContent = "Message sent.";
      if (modalIntro)
        modalIntro.textContent = "Thanks. We'll reply within one working day.";
      contactForm.innerHTML = `
            <div class="form-success" aria-live="polite">
              <p>If you need us sooner, write to <a href="mailto:contact@amyreil.online">contact@amyreil.online</a>.</p>
              <button class="btn" type="button" data-close-modal>Done</button>
            </div>`;
      contactForm
        .querySelector("[data-close-modal]")
        ?.addEventListener("click", closeModal);
    };

    const resetForm = (e) => {
      if (!contactForm.querySelector(".form-success")) return;
      contactForm.innerHTML = formMarkup;
      if (modalTitle) modalTitle.textContent = titleText;
      if (modalIntro) modalIntro.textContent = introText;
      const service = e?.currentTarget?.dataset?.service;
      const select = document.getElementById("cNeed");
      if (service && select) select.value = service;
    };
    document
      .querySelectorAll(".open-modal")
      .forEach((btn) => btn.addEventListener("click", resetForm));

    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById("submitBtn");
      const formError = document.getElementById("formError");
      if (!submitBtn || submitBtn.disabled) return;
      const data = new FormData(contactForm);
      if (String(data.get("_honey") || "").trim()) return;
      const email = String(data.get("email") || "").trim();
      const service = String(data.get("service") || "").trim();
      const payload = {
        name: String(data.get("name") || "").trim(),
        email,
        service,
        message: String(data.get("message") || "").trim(),
        _replyto: email,
        _subject: `Website inquiry: ${service}`,
        _template: "table",
        _captcha: "false",
      };
      if (formError) formError.hidden = true;
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending…";
      try {
        const res = await fetch(FORM_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = await res.json().catch(() => null);
        if (!res.ok || !result || String(result.success) === "false")
          throw new Error("Form service rejected the message");
        showSuccess();
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send message";
        if (formError) formError.hidden = false;
      }
    });
  }

  /* Social holders start inert; paste a real URL into href and they act as normal links. */
  document.querySelectorAll("[data-social]").forEach((link) => {
    if (link.getAttribute("href") !== "#") return;
    link.setAttribute("aria-disabled", "true");
    link.title = `${link.dataset.social} link coming soon`;
    link.addEventListener("click", (e) => e.preventDefault());
  });
})();
