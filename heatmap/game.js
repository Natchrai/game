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
  planted: byId("planted"),
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
const mascot = createGardenMascot(byId("garden-scene"), byId("garden-mascot"), byId("mascot-toggle"));

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
  const complete = words.filter((word) => recordFor(word).best === 3).length;
  const growing = words.filter((word) => {
    const { best } = recordFor(word);
    return best > 0 && best < 3;
  }).length;

  el.mastery.textContent = `완성 ${complete}/${words.length}칸`;
  el.planted.textContent = `자라는 중 ${growing}칸`;
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
  el.submit.classList.remove("button-next");
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
    button.classList.add("changed");
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
  el.submit.classList.add("button-next");
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

el.answer.addEventListener("input", () => el.answer.setCustomValidity(""));
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
