"use strict";

const grades = [1, 2, 3, 4, 5, 6];
const roundSize = 5;
const storageKey = "heatmap-garden-v1";
const defaults = bundledWords.map(([word, meaning], index) => ({
  id: word,
  grade: Math.floor(index / 100) + 1,
  word,
  meaning,
}));

const byId = (id) => document.getElementById(id);
const el = {
  grades: byId("grades"),
  questionArea: byId("question-area"),
  meaning: byId("meaning"),
  answerForm: byId("answer-form"),
  answer: byId("answer"),
  submit: byId("submit-answer"),
  retryAnswer: byId("retry-answer"),
  message: byId("quiz-message"),
  feedback: byId("feedback"),
  results: byId("results"),
  resultDetail: byId("result-detail"),
  newRound: byId("new-round"),
  mastery: byId("mastery"),
  milestoneCounts: [byId("count-1"), byId("count-2"), byId("count-3")],
  track: byId("mastery-track"),
  fill: byId("mastery-fill"),
  grid: byId("garden-grid"),
  tileDetail: byId("tile-detail"),
  tileWord: byId("tile-word"),
  tileMeaning: byId("tile-meaning"),
  storageMessage: byId("storage-message"),
  addWord: byId("add-word"),
  dialog: byId("word-dialog"),
  closeDialog: byId("close-dialog"),
  wordForm: byId("word-form"),
  wordGrade: byId("word-grade"),
  wordError: byId("word-error"),
};

function loadProgress() {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey));
    if (data && grades.includes(data.grade) && Array.isArray(data.customWords) && data.records) {
      return data;
    }
  } catch {
    // A fresh game can still run when storage is unavailable.
  }
  return { grade: 1, customWords: [], records: {} };
}

const progress = loadProgress();
let words = [];
let round;
let selectedTile;
let questionTile;
const tiles = new Map();
let finishReward;
const mascot = createGardenMascot(byId("garden-scene"), byId("garden-mascot"), byId("mascot-toggle"));
byId("garden-scene").addEventListener("garden-rest", () => finishReward?.());

let soundContext;
let soundOutput;
const soundToggle = byId("sound-toggle");
function updateSoundButton() {
  const enabled = progress.soundEnabled !== false;
  soundToggle.setAttribute("aria-pressed", String(enabled));
  soundToggle.title = enabled ? "소리 끄기" : "소리 켜기";
  if (soundOutput) soundOutput.gain.setValueAtTime(enabled ? .18 : 0, soundContext.currentTime);
}
function prepareSound() {
  if (progress.soundEnabled === false) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!soundContext) {
      soundContext = new AudioContext();
      soundOutput = soundContext.createGain();
      soundOutput.gain.value = .18;
      soundOutput.connect(soundContext.destination);
    }
    if (soundContext.state === "suspended") soundContext.resume().catch(() => {});
  } catch {
    // Audio support is optional; the reward still works without it.
  }
}
function playStarChime() {
  if (progress.soundEnabled === false || soundContext?.state !== "running") return;
  const now = soundContext.currentTime;
  // A soft, ascending bell with a short shimmering overtone.
  [1046.5, 1568, 2093].forEach((frequency, index) => {
    const start = now + index * .055;
    const oscillator = soundContext.createOscillator();
    const envelope = soundContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(.5 / (index + 1), start + .008);
    envelope.gain.exponentialRampToValueAtTime(.001, start + .65);
    oscillator.connect(envelope);
    envelope.connect(soundOutput);
    oscillator.start(start);
    oscillator.stop(start + .7);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  });
}
function playStarLanding(delay = 0) {
  if (progress.soundEnabled === false || soundContext?.state !== "running") return;
  const now = soundContext.currentTime + delay;
  // A dry card-on-card slap: broad, papery contact over a muted body.
  const duration = .085;
  const buffer = soundContext.createBuffer(1, Math.ceil(soundContext.sampleRate * duration), soundContext.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
  const contact = soundContext.createBufferSource();
  contact.buffer = buffer;
  const filter = soundContext.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2600;
  filter.Q.value = .65;
  const snap = soundContext.createGain();
  snap.gain.setValueAtTime(0, now);
  snap.gain.linearRampToValueAtTime(.9, now + .0015);
  snap.gain.exponentialRampToValueAtTime(.1, now + .018);
  snap.gain.exponentialRampToValueAtTime(.001, now + .075);
  contact.connect(filter);
  filter.connect(snap);
  snap.connect(soundOutput);
  contact.start(now);
  contact.stop(now + duration);
  contact.onended = () => { contact.disconnect(); filter.disconnect(); snap.disconnect(); };
  [[420, 180, .32, .045], [1150, 650, .1, .022]].forEach(([from, to, volume, duration]) => {
    const oscillator = soundContext.createOscillator();
    const envelope = soundContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(volume, now + .004);
    envelope.gain.exponentialRampToValueAtTime(.001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(soundOutput);
    oscillator.start(now);
    oscillator.stop(now + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
  });
}
soundToggle.addEventListener("click", () => {
  progress.soundEnabled = progress.soundEnabled === false;
  updateSoundButton();
  prepareSound();
  saveProgress();
});
updateSoundButton();

function saveProgress() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(progress));
  } catch {
    el.storageMessage.textContent = "이 브라우저에서는 기록을 저장할 수 없어요.";
    el.storageMessage.hidden = false;
  }
}

function recordFor(word) {
  return Object.hasOwn(progress.records, word.id)
    ? progress.records[word.id]
    : { streak: 0, best: 0, review: false };
}

function shuffled(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function questionMeaning(word) {
  const normalize = (meaning) => meaning.replace(/[~～\s]/g, "");
  const spelling = word.word.toLowerCase();
  const meaning = normalize(word.meaning);
  const similar = words.filter((other) => other !== word && normalize(other.meaning) === meaning);
  if (!similar.length) return word.meaning;

  const sameLength = similar.filter((other) => other.word.length === spelling.length);
  let prefix = spelling[0];
  while (prefix.length < spelling.length - 1
    && sameLength.some((other) => other.word.toLowerCase().startsWith(prefix))) {
    prefix = spelling.slice(0, prefix.length + 1);
  }
  return `${word.meaning} (${prefix}… ${spelling.length}자)`;
}

function updateStats() {
  const counts = [0, 0, 0, 0];
  for (const word of words) counts[recordFor(word).best]++;
  const complete = counts[3];

  el.mastery.textContent = `완성 ${complete}/${words.length}칸`;
  el.milestoneCounts.forEach((count, index) => {
    count.textContent = counts[index + 1];
  });
  el.track.setAttribute("aria-valuemax", words.length);
  el.track.setAttribute("aria-valuenow", complete);
  el.fill.style.width = `${complete / words.length * 100}%`;
}

function paintTile(button, word) {
  const { best } = recordFor(word);
  button.className = `cell level-${best}`;
  button.classList.toggle("selected", word === selectedTile);
  button.replaceChildren();
  if (best > 0) {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const mark = document.createElementNS(svgNamespace, "svg");
    mark.setAttribute("class", "milestone");
    mark.setAttribute("viewBox", "0 0 24 24");
    mark.setAttribute("aria-hidden", "true");
    const shape = document.createElementNS(svgNamespace, "use");
    shape.setAttribute("href", `#mark-${best}`);
    mark.append(shape);
    button.append(mark);
  }
  button.setAttribute("aria-label", `${word.meaning}, ${best === 3 ? "완성" : `${best}단계`}`);
}

// Keep the reward above the board so its glow never gets clipped by a cell.
function celebrateTile(button) {
  finishReward?.();
  prepareSound();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const playReward = () => { playStarChime(); playStarLanding(.18); };
    if (soundContext?.state === "suspended") {
      soundContext.resume().then(playReward).catch(() => {});
    } else playReward();
    return;
  }

  const reward = document.createElement("div");
  reward.className = "star-reward";
  reward.setAttribute("aria-hidden", "true");
  const star = button.querySelector(".milestone").cloneNode(true);
  star.setAttribute("class", "reward-star");
  reward.append(star);
  for (let index = 0; index < 6; index++) {
    const sparkle = document.createElement("span");
    sparkle.className = "reward-sparkle";
    sparkle.style.setProperty("--angle", `${index * 60 + 15}deg`);
    sparkle.style.setProperty("--delay", `${index % 3 * 55}ms`);
    reward.append(sparkle);
  }
  document.body.append(reward);
  button.classList.add("receiving");
  let frame;
  let started;
  const cleanup = () => {
    cancelAnimationFrame(frame);
    reward.remove();
    button.classList.remove("receiving");
    if (finishReward === cleanup) finishReward = undefined;
  };
  finishReward = cleanup;
  const playAppearance = () => {
    if (finishReward === cleanup && button.isConnected) playStarChime();
  };
  if (soundContext?.state === "suspended") {
    soundContext.resume().then(playAppearance).catch(() => {});
  } else playAppearance();
  const animate = (now) => {
    started ??= now;
    const elapsed = now - started;
    const rect = button.getBoundingClientRect();
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0;
    const top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth;
    const targetX = rect.left + rect.width / 2;
    const targetY = rect.top + rect.height / 2;
    const originX = Math.max(left + 48, Math.min(left + width - 48, targetX + (targetX > left + width / 2 ? -65 : 65)));
    const originY = Math.max(top + 55, targetY - 90);
    const travel = Math.max(0, Math.min(1, (elapsed - 400) / 650));
    const ease = travel * travel * (3 - 2 * travel);
    const x = originX + (targetX - originX) * ease;
    const y = originY + (targetY - originY) * ease - Math.sin(travel * Math.PI) * 28;
    const landingScale = rect.width * (button.classList.contains("level-1") ? .55 : .9) / 80;
    const pop = Math.min(1, elapsed / 200);
    const scale = (1 - (1 - pop) ** 3) * (1 + Math.sin(pop * Math.PI) * .18) * (1 - ease + ease * landingScale);
    reward.style.transform = `translate3d(${x - 40}px, ${y - 40}px, 0) scale(${scale}) rotate(${-18 * (1 - ease)}deg)`;
    if (elapsed < 1050 && button.isConnected) {
      frame = requestAnimationFrame(animate);
    } else {
      cleanup();
      if (button.isConnected) {
        playStarLanding();
        button.classList.remove("changed");
        void button.offsetWidth;
        button.classList.add("changed");
      }
    }
  };
  frame = requestAnimationFrame(animate);
}

function markQuestionTile(tile) {
  questionTile?.removeAttribute("data-question");
  questionTile?.removeAttribute("aria-current");
  questionTile = tile;
  questionTile?.setAttribute("data-question", "");
  questionTile?.setAttribute("aria-current", "true");
}

function showTile(word) {
  selectedTile = word;
  for (const [id, button] of tiles) {
    button.classList.toggle("selected", id === word.id);
    button.tabIndex = id === word.id ? 0 : -1;
  }
  el.tileWord.textContent = word.word;
  el.tileMeaning.textContent = word.meaning;
  el.tileDetail.hidden = false;
}

function renderGarden() {
  finishReward?.();
  selectedTile = undefined;
  tiles.clear();
  const fragment = document.createDocumentFragment();
  words.forEach((word, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = index === 0 ? 0 : -1;
    paintTile(button, word);
    button.addEventListener("click", () => showTile(word));
    button.addEventListener("keydown", (event) => {
      const columns = getComputedStyle(el.grid).gridTemplateColumns.split(" ").length;
      const destinations = {
        ArrowRight: index + 1,
        ArrowLeft: index - 1,
        ArrowDown: index + columns,
        ArrowUp: index - columns,
        Home: 0,
        End: words.length - 1,
      };
      if (!Object.hasOwn(destinations, event.key)) return;
      event.preventDefault();
      const next = words[destinations[event.key]];
      if (next) {
        showTile(next);
        tiles.get(next.id).focus();
      }
    });
    tiles.set(word.id, button);
    fragment.append(button);
  });
  el.grid.replaceChildren(fragment);
  syncGardenCellSize();
  const currentWord = round?.questions[round.index];
  markQuestionTile(currentWord ? tiles.get(currentWord.id) : undefined);
  el.tileDetail.hidden = true;
  updateStats();
}

function startRound(focusAnswer = false) {
  const pool = shuffled(words);
  const reviews = pool.filter((word) => recordFor(word).review).slice(0, 2);
  const fresh = pool.filter((word) => !Object.hasOwn(progress.records, word.id)).slice(0, 2);
  const growing = pool.filter((word) => {
    const { best, review } = recordFor(word);
    return best > 0 && best < 3 && !review;
  }).slice(0, 2);
  const practicing = pool.filter((word) => recordFor(word).best < 3);
  const questions = [...new Set([...reviews, ...fresh, ...growing, ...practicing, ...pool])].slice(0, roundSize);

  round = { questions: shuffled(questions), index: 0, correct: 0, grown: 0, phase: "question" };
  el.questionArea.hidden = false;
  el.results.hidden = true;
  renderQuestion(focusAnswer);
}

function renderQuestion(focusAnswer) {
  const word = round.questions[round.index];

  round.phase = "question";
  mascot.rest();
  markQuestionTile(tiles.get(word.id));
  el.tileDetail.hidden = true;
  el.meaning.textContent = questionMeaning(word);
  el.retryAnswer.hidden = true;
  el.answer.removeAttribute("aria-describedby");
  el.message.tabIndex = -1;
  el.message.scrollTop = 0;
  el.feedback.replaceChildren();
  el.answer.value = "";
  el.answer.setCustomValidity("");
  el.answerForm.noValidate = false;
  el.submit.firstChild.textContent = "정답 확인 ";
  if (focusAnswer) el.answer.focus({ preventScroll: true });
}

function enteredAnswer() {
  return el.answer.value.trim().toLowerCase();
}

function gradeAnswer() {
  if (round.phase !== "question" || el.questionArea.hidden) return;

  const answer = enteredAnswer();
  if (!answer) {
    el.answer.setCustomValidity("영어 단어를 입력해 주세요.");
    el.answer.reportValidity();
    return;
  }

  const word = round.questions[round.index];
  const correct = answer === word.word.toLowerCase();
  const record = recordFor(word);
  const oldBest = record.best;
  round.phase = correct ? "checked" : "retry";

  if (correct) {
    record.streak = Math.min(record.streak + 1, 3);
    record.best = Math.max(record.best, record.streak);
    round.correct++;
  } else {
    record.streak = 0;
  }
  record.review = !correct;
  progress.records[word.id] = record;
  saveProgress();

  const grown = record.best > oldBest;
  const button = tiles.get(word.id);
  paintTile(button, word);
  if (grown) {
    round.grown++;
    celebrateTile(button);
    mascot.celebrate();
  }
  updateStats();

  if (!correct) {
    showRetry(word, "보고 한 번 써 보세요.");
    return;
  }
  const growthMessages = ["", "정답! 둥근 삼각형이 생겼어요.", "정답! 네 갈래 별이 생겼어요.", "정답! 둥근 별을 완성했어요!"];
  const message = document.createElement("strong");
  message.textContent = grown ? growthMessages[record.best] : "정답! 오늘도 한 번 더 기억했어요.";
  el.feedback.replaceChildren(message);

  el.message.tabIndex = 0;
  el.message.scrollTop = 0;
  el.answerForm.noValidate = true;
  el.submit.firstChild.textContent = round.index + 1 === round.questions.length ? "결과 보기 " : "다음 문제 ";
  if (document.activeElement !== el.answer) el.submit.focus({ preventScroll: true });
}

function showRetry(word, instruction) {
  el.retryAnswer.textContent = word.word;
  el.retryAnswer.hidden = false;
  el.answer.setAttribute("aria-describedby", "retry-answer");
  el.feedback.textContent = instruction;
  el.message.tabIndex = 0;
  el.message.scrollTop = 0;
  el.answer.value = "";
  el.answer.setCustomValidity("");
  el.submit.firstChild.textContent = "다시 확인 ";
  el.answer.focus({ preventScroll: true });
}

function checkRetry() {
  const word = round.questions[round.index];
  if (enteredAnswer() !== word.word.toLowerCase()) {
    showRetry(word, "철자를 보고 다시 써 보세요.");
    return;
  }
  round.phase = "checked";
  nextQuestion();
}

function syncGardenCellSize() {
  const cell = el.grid.firstElementChild;
  if (!cell) return;
  // Use the untransformed width, including its border, for an exact square.
  const width = parseFloat(getComputedStyle(cell).width);
  if (!Number.isFinite(width) || width <= 0) return;
  const size = `${width}px`;
  if (el.grid.style.getPropertyValue("--cell-size") !== size) {
    el.grid.style.setProperty("--cell-size", size);
  }
}

function keepQuizControlsVisible() {
  const viewport = window.visualViewport;
  const main = el.questionArea.closest("main");
  const coveredHeight = document.documentElement.clientHeight - viewport.height;
  const keyboardOpen = document.activeElement === el.answer
    && Math.abs(viewport.scale - 1) < 0.01 && coveredHeight > 120;
  main.toggleAttribute("data-keyboard", keyboardOpen);
  syncGardenCellSize();
  if (!keyboardOpen) {
    main.style.removeProperty("--keyboard-view");
    return;
  }

  main.style.setProperty("--keyboard-view", `${viewport.height}px`);
  const top = viewport.offsetTop + 8;
  const bottom = viewport.offsetTop + viewport.height - 8;
  const scene = byId("garden-scene").getBoundingClientRect();
  const quiz = el.questionArea.getBoundingClientRect();
  const controls = [scene, quiz].find((area) => area.height <= bottom - top)
    ?? el.answerForm.getBoundingClientRect();
  const adjustment = controls.bottom > bottom ? controls.bottom - bottom : Math.min(0, controls.top - top);
  if (adjustment) window.scrollBy({ top: adjustment, behavior: "instant" });
}

function nextQuestion() {
  if (round.phase !== "checked") return;
  round.index++;
  if (round.index < round.questions.length) {
    renderQuestion(true);
    return;
  }
  markQuestionTile();
  el.tileDetail.hidden = true;
  mascot.rest();
  el.questionArea.hidden = true;
  el.results.hidden = false;
  el.resultDetail.textContent = `${round.questions.length}문제 중 ${round.correct}문제를 맞혔어요. ${round.grown ? `정원에서 ${round.grown}칸에 새 모양이 생겼어요!` : "연습한 단어를 다음 판에서 또 만나 봐요."}`;
  el.newRound.focus({ preventScroll: true });
}

function selectGrade(grade) {
  progress.grade = grade;
  words = [...defaults, ...progress.customWords].filter((word) => word.grade === grade);
  for (const button of el.grades.children) {
    button.setAttribute("aria-pressed", Number(button.dataset.grade) === grade);
  }
  renderGarden();
  startRound();
  saveProgress();
}

for (const grade of grades) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "button button-plain grade";
  button.dataset.grade = grade;
  button.setAttribute("aria-label", `${grade}학년`);
  const unit = document.createElement("span");
  unit.className = "grade-unit";
  unit.textContent = "학년";
  button.append(String(grade), unit);
  button.addEventListener("click", () => {
    if (progress.grade !== grade) selectGrade(grade);
  });
  el.grades.append(button);
  el.wordGrade.add(new Option(`${grade}학년`, grade));
}

document.addEventListener("click", (event) => {
  if (event.target.closest("#garden-grid button.cell")) return;
  el.tileDetail.hidden = true;
  if (selectedTile) tiles.get(selectedTile.id)?.classList.remove("selected");
  selectedTile = undefined;
});

el.answer.addEventListener("input", () => el.answer.setCustomValidity(""));
if (window.visualViewport) {
  let viewportFrame;
  const checkViewport = () => {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = requestAnimationFrame(keepQuizControlsVisible);
  };
  window.visualViewport.addEventListener("resize", checkViewport);
  el.answer.addEventListener("focus", checkViewport);
  el.answer.addEventListener("blur", checkViewport);
}
el.answer.addEventListener("keydown", (event) => {
  if (round.phase === "checked" && event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    nextQuestion();
  }
});
el.answer.addEventListener("beforeinput", (event) => {
  if (round.phase === "checked") event.preventDefault();
});
el.submit.addEventListener("pointerdown", (event) => {
  if (document.activeElement === el.answer) event.preventDefault();
});
el.answerForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (round.phase === "checked") nextQuestion();
  else if (round.phase === "retry") checkRetry();
  else gradeAnswer();
});
el.newRound.addEventListener("click", () => startRound(true));

el.addWord.addEventListener("click", () => {
  el.wordForm.reset();
  el.wordError.textContent = "";
  el.wordGrade.value = progress.grade;
  el.dialog.showModal();
});
el.closeDialog.addEventListener("click", () => el.dialog.close());
el.wordForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(el.wordForm);
  const grade = Number(form.get("grade"));
  const word = form.get("word").trim().toLowerCase();
  const meaning = form.get("meaning").trim();
  if (!/^[a-z]+(?:[-' ][a-z]+)*$/.test(word) || !meaning) {
    el.wordError.textContent = "영어 단어와 한국어 뜻을 입력해 주세요.";
    return;
  }
  if ([...defaults, ...progress.customWords].some((entry) => entry.grade === grade && entry.word === word)) {
    el.wordError.textContent = "이 학년 정원에 이미 있는 단어예요.";
    return;
  }
  const entry = { id: `custom:${grade}:${word}`, grade, word, meaning };
  progress.customWords.push(entry);
  el.dialog.close();
  if (progress.grade === grade) {
    words.push(entry);
    renderGarden();
    saveProgress();
  } else {
    selectGrade(grade);
  }
  showTile(entry);
});

selectGrade(progress.grade);

// Keyboard layout changes can change columns without changing the grid width.
window.addEventListener("resize", syncGardenCellSize);
if (window.ResizeObserver) {
  const gardenSizeObserver = new ResizeObserver(syncGardenCellSize);
  gardenSizeObserver.observe(el.grid);
}
