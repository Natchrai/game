"use strict";

function createGardenMascot(scene, face, toggle) {
  toggle.addEventListener("click", () => {
    const still = scene.toggleAttribute("data-still");
    toggle.textContent = still ? "무무 깨우기" : "무무 쉬기";
  });

  return {
    rest() {
      face.dataset.pose = "idle";
    },
    celebrate() {
      face.dataset.pose = "proud";
    },
  };
}
