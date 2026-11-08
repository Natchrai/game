"use strict";

function createGardenMascot(scene, face, toggle) {
  const hit = document.getElementById("mascot-hit");
  const board = scene.querySelector(".garden-board");
  const quiz = scene.querySelector(".quiz");
  const header = document.querySelector(".topbar");
  let phase = "study";
  let sky;
  let stars = [];
  let scrollPosition = 0;
  const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setLabel(sleeping) {
    const label = sleeping ? "무무 깨우기" : "무무 쉬기";
    toggle.textContent = label;
    hit.setAttribute("aria-label", label);
    hit.setAttribute("aria-pressed", String(sleeping));
  }

  function floatStars() {
    const marks = [...board.querySelectorAll("button.cell .milestone")];
    sky = document.createElement("div");
    sky.className = "dream-sky";
    sky.setAttribute("aria-hidden", "true");
    document.body.append(sky);
    const columns = Math.max(1, Math.ceil(Math.sqrt(marks.length * 2)));
    const rows = Math.max(1, Math.ceil(marks.length / columns));
    const slots = marks.map((_, index) => index);
    for (let index = slots.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [slots[index], slots[other]] = [slots[other], slots[index]];
    }
    stars = marks.map((mark, index) => {
      const origin = mark.getBoundingClientRect();
      const star = document.createElement("div");
      star.className = "dream-star";
      const size = 15 + Math.random() * 18;
      const slot = slots[index];
      star.style.left = `${5 + ((slot % columns + .2 + Math.random() * .6) / columns) * 90}%`;
      star.style.top = `${5 + ((Math.floor(slot / columns) + .2 + Math.random() * .6) / rows) * 90}%`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      star.style.setProperty("--twinkle-time", `${1.6 + Math.random() * 2.5}s`);
      star.style.setProperty("--twinkle-delay", `${-Math.random() * 4}s`);
      const copy = mark.cloneNode(true);
      copy.setAttribute("class", "dream-mark");
      copy.style.color = getComputedStyle(mark).color;
      star.append(copy);
      sky.append(star);
      const destination = star.getBoundingClientRect();
      const dx = origin.left + origin.width / 2 - destination.left - size / 2;
      const dy = origin.top + origin.height / 2 - destination.top - size / 2;
      const sway = (Math.random() - .5) * 120;
      const rise = star.animate([
        { transform: `translate(${dx}px, ${dy}px) scale(.5)`, opacity: 0 },
        { transform: `translate(${dx * .65 + sway}px, ${dy * .55}px) scale(1.1)`, opacity: 1, offset: .5 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ], { duration: reducedMotion() ? 1 : 1200 + Math.random() * 900, delay: reducedMotion() ? 0 : Math.random() * 650, easing: "ease-in-out", fill: "both" });
      rise.finished.then(() => {
        if (phase !== "rest") return;
        star.animate([
          { transform: "translate(0, 0)" },
          { transform: `translate(${(Math.random() - .5) * 16}px, -8px)` },
          { transform: "translate(0, 0)" },
        ], { duration: 3000 + Math.random() * 3000, iterations: reducedMotion() ? 0 : Infinity, easing: "ease-in-out" });
      }).catch(() => {});
      return star;
    });
    scene.setAttribute("data-stars-away", "");
  }

  function sleep() {
    phase = "rest";
    scrollPosition = window.scrollY;
    document.activeElement?.blur();
    scene.dispatchEvent(new Event("garden-rest"));
    document.body.setAttribute("data-garden-rest", "");
    scene.setAttribute("data-still", "");
    header.inert = true;
    quiz.inert = true;
    board.inert = true;
    setLabel(true);
    window.dispatchEvent(new Event("resize"));
    requestAnimationFrame(() => {
      if (phase === "rest") floatStars();
    });
  }

  async function wake() {
    phase = "waking";
    hit.disabled = toggle.disabled = true;
    await Promise.all(stars.map((star) => {
      const transform = getComputedStyle(star).transform;
      star.getAnimations().forEach((animation) => animation.cancel());
      star.style.transform = transform;
      return star.animate([
        { opacity: 1, filter: "brightness(1)" },
        { opacity: 1, filter: "brightness(2.4)", offset: .3 },
        { opacity: 0, filter: "brightness(1.4)" },
      ], { duration: reducedMotion() ? 1 : 350 + Math.random() * 400, delay: reducedMotion() ? 0 : Math.random() * 650, fill: "forwards" }).finished.catch(() => {});
    }));
    sky?.remove();
    sky = undefined;
    stars = [];
    scene.removeAttribute("data-stars-away");
    scene.removeAttribute("data-still");
    document.body.removeAttribute("data-garden-rest");
    header.inert = quiz.inert = board.inert = false;
    setLabel(false);
    hit.disabled = toggle.disabled = false;
    phase = "study";
    window.scrollTo({ top: scrollPosition, behavior: "instant" });
    hit.focus({ preventScroll: true });
  }

  function switchScene() {
    if (phase === "study") sleep();
    else if (phase === "rest") wake();
  }
  hit.addEventListener("click", switchScene);
  toggle.addEventListener("click", switchScene);

  return {
    rest() { face.dataset.pose = "idle"; },
    celebrate() { face.dataset.pose = "proud"; },
  };
}
