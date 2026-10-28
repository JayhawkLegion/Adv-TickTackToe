// WildFlip simulator: the computer plays your side against the computer
// opponent, either one game you watch move by move or many games at once with
// a summary of the results. Uses the same rules, card draws and computer
// player as the real game (cards-data.js) and never saves anything.
const watchStatusEl = document.getElementById("watchStatus");
const runStatusEl = document.getElementById("runStatus");
const youCardsEl = document.getElementById("youCards");
const oppLevelEl = document.getElementById("oppLevel");
const youStyleEl = document.getElementById("youStyle");
const oppStyleEl = document.getElementById("oppStyle");
const firstSideEl = document.getElementById("firstSide");
const savedHandEl = document.getElementById("savedHand");

const speedOptionsEl = document.getElementById("speedOptions");
const watchBtn = document.getElementById("watchBtn");
const stopBtn = document.getElementById("stopBtn");
const watchAreaEl = document.getElementById("watchArea");
const oppSideEl = document.getElementById("oppSide");
const youSideEl = document.getElementById("youSide");
const oppLabelEl = document.getElementById("oppLabel");
const youLabelEl = document.getElementById("youLabel");
const oppScoreEl = document.getElementById("oppScore");
const youScoreEl = document.getElementById("youScore");
const oppHandEl = document.getElementById("oppHand");
const youHandEl = document.getElementById("youHand");
const boardEl = document.getElementById("simBoard");

const countOptionsEl = document.getElementById("countOptions");
const runBtn = document.getElementById("runBtn");
const resultsEl = document.getElementById("results");
const resultsTitleEl = document.getElementById("resultsTitle");
const outcomeBarEl = document.getElementById("outcomeBar");
const outcomeLegendEl = document.getElementById("outcomeLegend");
const kpisEl = document.getElementById("kpis");
const strengthRowsEl = document.getElementById("strengthRows");
const strengthNoteEl = document.getElementById("strengthNote");

const FLIP_MS = 500;
const OUTCOMES = [
  { key: "win", label: "Win" },
  { key: "draw", label: "Draw" },
  { key: "loss", label: "Loss" },
];

let player = null;
let speedMs = 900;
let gameCount = 1000;
let watch = null; // the game being watched
let running = false; // a batch of games is running

// Move-by-move narration, shown just above the board being watched.
function setStatus(text, color) {
  watchStatusEl.textContent = text;
  watchStatusEl.dataset.color = color || "";
}

function pct(part, whole) {
  return whole ? `${Number(((part / whole) * 100).toFixed(1))}%` : "–";
}

function other(side) {
  return side === "you" ? "opp" : "you";
}

// --- Setup ---
// Hands are lists of { cardId, boost } (boost: an owned copy's upgrades).
function handOf(copies) {
  return copies.map((o) => ({ cardId: o.cardId, ...(o.boost ? { boost: o.boost } : {}) }));
}

function copiesFor(uids) {
  const byUid = new Map(playableCollection(player).map((owned) => [owned.uid, owned]));
  return uids.map((uid) => byUid.get(uid)).filter(Boolean);
}

function savedHand() {
  if (!player) return null;
  const copies = copiesFor(player.lastHand);
  return copies.length === HAND_SIZE ? handOf(copies) : null;
}

// The fixed hand for "My saved hand" or one of the player's saved decks
// ("deck:<id>"); null for the random choices.
function fixedHand() {
  const value = youCardsEl.value;
  if (value === "saved") return savedHand();
  if (value.startsWith("deck:")) {
    const deck = player.decks.find((d) => d.id === value.slice(5));
    return deck && deckCardIds(player, deck) ? handOf(copiesFor(deck.uids)) : null;
  }
  return null;
}

// "random", or the level whose computer opponent to play (like the game).
function opponentLevel() {
  return oppLevelEl.value === "random" ? null : Number(oppLevelEl.value);
}

function setupLevels() {
  const mine = player ? levelInfo(player.xp).level : 1;
  const levels = [...new Set([1, 3, 5, 10, 15, 20, 30, mine])].sort((a, b) => a - b);
  const current = oppLevelEl.value;
  oppLevelEl.innerHTML = "";
  levels.forEach((level) => {
    oppLevelEl.add(new Option(`Like the game: level ${level}${level === mine && player ? " (yours)" : ""}`, String(level)));
  });
  oppLevelEl.add(new Option("Random cards from the pool", "random"));
  oppLevelEl.value = current && [...oppLevelEl.options].some((o) => o.value === current) ? current : String(mine);
}

function setupOptions() {
  const oldDecks = youCardsEl.querySelector("optgroup");
  if (oldDecks) oldDecks.remove();
  const saved = savedHand();
  const owned = player ? playableCollection(player).length : 0;
  youCardsEl.querySelector('[value="saved"]').disabled = !saved;
  youCardsEl.querySelector('[value="collection"]').disabled = owned < HAND_SIZE;
  if (!saved) youCardsEl.value = owned >= HAND_SIZE ? "collection" : "pool";
  const decks = player ? player.decks.filter((deck) => deckCardIds(player, deck)) : [];
  if (decks.length) {
    const group = document.createElement("optgroup");
    group.label = "My decks";
    decks.forEach((deck) => group.append(new Option(`Deck: ${deck.name}`, `deck:${deck.id}`)));
    youCardsEl.append(group);
  }
  setupLevels();
  renderSavedHand();
}

function renderSavedHand() {
  const hand = fixedHand();
  savedHandEl.hidden = !hand;
  savedHandEl.innerHTML = "";
  (hand || []).forEach((card) => {
    const wrap = document.createElement("div");
    wrap.className = "cc-hand-card";
    wrap.appendChild(createCardEl(card.cardId, "neutral", { boost: card.boost }));
    savedHandEl.appendChild(wrap);
  });
}

youCardsEl.addEventListener("change", renderSavedHand);

function shuffled(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// The two hands, who goes first and how each side plays, for one game.
function newSetup() {
  let you = fixedHand();
  if (!you && youCardsEl.value === "collection") you = handOf(shuffled(playableCollection(player)).slice(0, HAND_SIZE));
  if (!you) you = randomCards(HAND_SIZE).map((cardId) => ({ cardId }));
  const first = firstSideEl.value === "coin" ? (Math.random() < 0.5 ? "you" : "opp") : firstSideEl.value;
  // Like the game: the computer mirrors your hand, upgraded for its level.
  const level = opponentLevel();
  const difficulty = level ? CardRules.cpuDifficulty(level) : null;
  const opp = difficulty
    ? CardRules.cpuHand(POOL, you, difficulty, { newId })
    : randomCards(HAND_SIZE).map((cardId) => ({ cardId }));
  return {
    hands: { you, opp },
    first,
    styles: { you: youStyleEl.value, opp: oppStyleEl.value },
    mistakes: difficulty ? difficulty.mistakes : 0,
  };
}

function newGame(setup) {
  return {
    board: Array(9).fill(null),
    hands: { you: [...setup.hands.you], opp: [...setup.hands.opp] },
    color: { [setup.first]: "red", [other(setup.first)]: "blue" },
    turn: setup.first,
    styles: setup.styles,
    mistakes: setup.mistakes,
  };
}

// The side's move, with the computer's mistakes for the opponent.
function pickMove(game, side) {
  return chooseMove(game.board, game.hands[side], game.color[side], game.styles[side], side === "opp" ? game.mistakes : 0);
}

// Each side's score, by the game's own scoring rule (CardRules.scoreBoard).
function scores(game) {
  const s = CardRules.scoreBoard(game.board, { a: game.hands.you, b: game.hands.opp }, { a: game.color.you, b: game.color.opp });
  return { you: s.a, opp: s.b };
}

function playTurn(game) {
  const side = game.turn;
  const move = pickMove(game, side);
  const [card] = game.hands[side].splice(move.handIndex, 1);
  const flips = placeCard(game.board, move.slot, card.cardId, game.color[side], card.boost);
  game.turn = other(side);
  return { side, cardId: card.cardId, slot: move.slot, flips };
}

const isOver = (game) => game.board.every(Boolean);

// --- Watching one game ---
function renderWatchBoard(placed = null, flipped = []) {
  boardEl.innerHTML = "";
  watch.game.board.forEach((slot, i) => {
    const cell = document.createElement("div");
    cell.className = "cc-slot";
    cell.setAttribute("role", "gridcell");
    if (slot) {
      const flipping = flipped.includes(i);
      const before = slot.color === "red" ? "blue" : "red";
      const card = createCardEl(slot.cardId, flipping ? before : slot.color, { boost: slot.boost });
      if (i === placed) card.classList.add("cc-placed");
      if (flipping) {
        card.classList.add("cc-flipping");
        setTimeout(() => card.classList.replace(before, slot.color), FLIP_MS / 2);
      }
      cell.appendChild(card);
    }
    boardEl.appendChild(cell);
  });
}

function renderWatchHands() {
  const { game } = watch;
  [["you", youHandEl], ["opp", oppHandEl]].forEach(([side, handEl]) => {
    handEl.innerHTML = "";
    handEl.classList.toggle("waiting", game.turn !== side || isOver(game));
    game.hands[side].forEach((card, i) => {
      const wrap = document.createElement("div");
      wrap.className = "cc-hand-card";
      wrap.classList.toggle("selected", watch.pick && watch.pick.side === side && watch.pick.handIndex === i);
      wrap.appendChild(createCardEl(card.cardId, game.color[side], { boost: card.boost }));
      handEl.appendChild(wrap);
    });
  });
  const s = scores(game);
  youScoreEl.textContent = s.you;
  oppScoreEl.textContent = s.opp;
}

function sideName(side) {
  return side === "you" ? "Your side" : "The opponent";
}

function startWatch() {
  stopWatch();
  const setup = newSetup();
  watch = { game: newGame(setup), pick: null, timer: null };
  const { game } = watch;
  watchAreaEl.hidden = false;
  youLabelEl.textContent = `🤖 ${player ? player.name : "You"} (${PLAY_STYLES[game.styles.you]})`;
  const level = opponentLevel();
  oppLabelEl.textContent = `🤖 Opponent (${PLAY_STYLES[game.styles.opp]}${level ? `, level ${level}` : ""})`;
  youSideEl.dataset.color = game.color.you;
  oppSideEl.dataset.color = game.color.opp;
  renderWatchBoard();
  renderWatchHands();
  setStatus(`${sideName(game.turn)} goes first as Red.`, "red");
  watchBtn.textContent = "Watch Another";
  stopBtn.hidden = false;
  watchAreaEl.scrollIntoView({ behavior: "smooth", block: "start" });
  watch.timer = setTimeout(watchStep, speedMs);
}

// Shows which card the side picked, then plays it.
function watchStep() {
  const { game } = watch;
  const side = game.turn;
  const move = pickMove(game, side);
  watch.pick = { side, handIndex: move.handIndex };
  renderWatchHands();
  watch.timer = setTimeout(() => {
    const [card] = game.hands[side].splice(move.handIndex, 1);
    const { cardId } = card;
    const flips = placeCard(game.board, move.slot, cardId, game.color[side], card.boost);
    game.turn = other(side);
    watch.pick = null;
    renderWatchBoard(move.slot, flips);
    renderWatchHands();
    const flipText = flips.length ? ` and flipped ${flips.length} card${flips.length > 1 ? "s" : ""}` : "";
    setStatus(`${sideName(side)} played ${getCard(cardId).name}${flipText}.`, game.color[side]);
    if (isOver(game)) {
      watch.timer = setTimeout(finishWatch, FLIP_MS + 300);
    } else {
      watch.timer = setTimeout(watchStep, speedMs);
    }
  }, Math.max(200, speedMs / 2));
}

function finishWatch() {
  const s = scores(watch.game);
  if (s.you > s.opp) setStatus(`Your side wins ${s.you}–${s.opp}.`, watch.game.color.you);
  else if (s.you < s.opp) setStatus(`The opponent wins ${s.opp}–${s.you}.`, watch.game.color.opp);
  else setStatus(`It's a draw, ${s.you}–${s.opp}.`);
  stopBtn.hidden = true;
}

function stopWatch() {
  if (!watch) return;
  clearTimeout(watch.timer);
  stopBtn.hidden = true;
}

watchBtn.addEventListener("click", () => {
  if (!running) startWatch();
});

stopBtn.addEventListener("click", () => {
  stopWatch();
  setStatus("Stopped.");
});

speedOptionsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".size-option");
  if (!btn) return;
  speedMs = Number(btn.dataset.speed);
  speedOptionsEl.querySelectorAll(".size-option").forEach((b) => b.classList.toggle("selected", b === btn));
});

// --- Many games ---
// The total of a hand's numbers, upgrades included.
function handStrength(hand) {
  return CardRules.handPower(POOL, hand);
}

function countRares(hand) {
  return hand.filter((card) => getCard(card.cardId).rarity !== "common").length;
}

function playWholeGame() {
  const setup = newSetup();
  const game = newGame(setup);
  while (!isOver(game)) playTurn(game);
  const s = scores(game);
  return {
    result: s.you > s.opp ? "win" : s.you < s.opp ? "loss" : "draw",
    scores: s,
    youFirst: setup.first === "you",
    strength: { you: handStrength(setup.hands.you), opp: handStrength(setup.hands.opp) },
    rares: { you: countRares(setup.hands.you), opp: countRares(setup.hands.opp) },
  };
}

function emptyTally() {
  const group = () => ({ games: 0, win: 0 });
  return {
    games: 0, win: 0, draw: 0, loss: 0,
    first: group(), second: group(),
    stronger: group(), even: group(), weaker: group(),
    score: { you: 0, opp: 0 }, strength: { you: 0, opp: 0 }, rares: { you: 0, opp: 0 },
  };
}

function record(tally, g) {
  const won = g.result === "win" ? 1 : 0;
  tally.games++;
  tally[g.result]++;
  const turnGroup = tally[g.youFirst ? "first" : "second"];
  turnGroup.games++;
  turnGroup.win += won;
  const diff = g.strength.you - g.strength.opp;
  const handGroup = tally[diff > 0 ? "stronger" : diff < 0 ? "weaker" : "even"];
  handGroup.games++;
  handGroup.win += won;
  ["you", "opp"].forEach((side) => {
    tally.score[side] += g.scores[side];
    tally.strength[side] += g.strength[side];
    tally.rares[side] += g.rares[side];
  });
}

// Runs in small batches so the page stays responsive and shows progress.
function runGames(count) {
  running = true;
  stopWatch();
  runBtn.disabled = true;
  watchBtn.disabled = true;
  const tally = emptyTally();
  const describe = setupSummary();
  const batch = () => {
    const end = Math.min(count, tally.games + 250);
    while (tally.games < end) record(tally, playWholeGame());
    runStatusEl.textContent = `Running games… ${tally.games.toLocaleString()} of ${count.toLocaleString()}`;
    if (tally.games < count) {
      setTimeout(batch, 0);
      return;
    }
    running = false;
    runBtn.disabled = false;
    watchBtn.disabled = false;
    runStatusEl.textContent = `Finished ${count.toLocaleString()} games.`;
    showResults(tally, describe);
  };
  batch();
}

function setupSummary() {
  const option = youCardsEl.options[youCardsEl.selectedIndex];
  const cards = option.value.startsWith("deck:") ? option.text : option.text.toLowerCase();
  const first = { coin: "coin toss", you: "your side always first", opp: "opponent always first" }[firstSideEl.value];
  return `Your side: ${cards}, ${PLAY_STYLES[youStyleEl.value]}. Opponent: random cards, ${PLAY_STYLES[oppStyleEl.value]}. ${first[0].toUpperCase()}${first.slice(1)}.`;
}

function showResults(t, describe) {
  resultsEl.hidden = false;
  resultsTitleEl.textContent = `${t.games.toLocaleString()} games. ${describe}`;

  // Win / draw / loss share: one stacked bar, labelled in place when the
  // segment is wide enough, with a legend and a tooltip on each segment.
  outcomeBarEl.innerHTML = "";
  outcomeLegendEl.innerHTML = "";
  outcomeBarEl.setAttribute(
    "aria-label",
    OUTCOMES.map((o) => `${o.label} ${pct(t[o.key], t.games)}`).join(", ")
  );
  OUTCOMES.forEach((o) => {
    const share = t[o.key] / t.games;
    const text = `${o.label}: ${t[o.key].toLocaleString()} games (${pct(t[o.key], t.games)})`;
    if (share > 0) {
      const seg = document.createElement("div");
      seg.className = `cc-outcome-seg cc-outcome-${o.key}`;
      seg.style.flexGrow = share;
      seg.title = text;
      if (share >= 0.14) seg.textContent = `${o.label} ${pct(t[o.key], t.games)}`;
      outcomeBarEl.appendChild(seg);
    }
    const item = document.createElement("span");
    item.className = "cc-legend-item";
    item.innerHTML = `<span class="cc-swatch cc-outcome-${o.key}"></span>`;
    item.append(text);
    outcomeLegendEl.appendChild(item);
  });

  const tiles = [
    ["Your side won", pct(t.win, t.games)],
    ["Won going first", pct(t.first.win, t.first.games)],
    ["Won going second", pct(t.second.win, t.second.games)],
    ["Average score", `${(t.score.you / t.games).toFixed(1)}–${(t.score.opp / t.games).toFixed(1)}`],
  ];
  kpisEl.innerHTML = "";
  tiles.forEach(([label, value]) => {
    const tile = document.createElement("div");
    tile.className = "score";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    tile.append(labelEl, valueEl);
    kpisEl.appendChild(tile);
  });

  strengthRowsEl.innerHTML = "";
  [["stronger", "Stronger"], ["even", "Even"], ["weaker", "Weaker"]].forEach(([key, label]) => {
    const row = document.createElement("tr");
    [label, t[key].games.toLocaleString(), pct(t[key].win, t[key].games)].forEach((value, i) => {
      const cell = document.createElement(i === 0 ? "th" : "td");
      if (i === 0) cell.scope = "row";
      cell.textContent = value;
      row.appendChild(cell);
    });
    strengthRowsEl.appendChild(row);
  });
  strengthNoteEl.textContent =
    `Hand strength is the total of all the numbers on a hand's 5 cards. ` +
    `Average: your side ${(t.strength.you / t.games).toFixed(1)}, opponent ${(t.strength.opp / t.games).toFixed(1)}. ` +
    `Rare-or-better cards per hand: your side ${(t.rares.you / t.games).toFixed(2)}, opponent ${(t.rares.opp / t.games).toFixed(2)}.`;
}

countOptionsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".size-option");
  if (!btn) return;
  gameCount = Number(btn.dataset.count);
  countOptionsEl.querySelectorAll(".size-option").forEach((b) => b.classList.toggle("selected", b === btn));
});

runBtn.addEventListener("click", () => {
  if (!running) runGames(gameCount);
});

Object.entries(PLAY_STYLES).forEach(([key, label]) => {
  youStyleEl.add(new Option(label, key));
  oppStyleEl.add(new Option(label, key));
});
// Signed in, the player's hands and decks arrive from the server; until
// then only the random choices are offered.
let profileSeen = false;
CardStore.onProfile((next) => {
  player = next;
  if (!profileSeen) {
    profileSeen = true;
    setupOptions();
  }
});
if (!profileSeen) setupOptions();
