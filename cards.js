// Card Clash: you vs. a randomly generated computer player on a 3x3 board.
// A coin toss picks who goes first; the first player is Red, the other Blue.
// Placing a card flips every touching enemy card whose facing number is lower
// than the placed card's number on that side. When all 9 squares are full,
// each side scores its cards on the board plus its unplayed card, if any; the
// higher score wins (5–5 is a draw), and a winning player may claim one of
// the opponent's cards that ended up in their color.
const CPU_NAMES = [
  "Robo Rex", "Captain Byte", "Pixel Pete", "Glitch", "Turbo Tess",
  "Sir Circuit", "Nova-9", "Chip", "Widget", "Bolt",
];
const CPU_THINK_MS = 900;
const CPU_SHOW_PICK_MS = 450;
const FLIP_MS = 500;

const statusEl = document.getElementById("status");
const views = {
  setup: document.getElementById("setupView"),
  deck: document.getElementById("deckView"),
  play: document.getElementById("playView"),
};

const setupForm = document.getElementById("setupForm");
const nameInput = document.getElementById("nameInput");

const deckNameEl = document.getElementById("deckName");
const deckRecordEl = document.getElementById("deckRecord");
const deckNoticeEl = document.getElementById("deckNotice");
const deckGridEl = document.getElementById("deckGrid");
const playBtn = document.getElementById("playBtn");

const cpuSideEl = document.getElementById("cpuSide");
const youSideEl = document.getElementById("youSide");
const cpuLabelEl = document.getElementById("cpuLabel");
const youLabelEl = document.getElementById("youLabel");
const cpuScoreEl = document.getElementById("cpuScore");
const youScoreEl = document.getElementById("youScore");
const cpuHandEl = document.getElementById("cpuHand");
const youHandEl = document.getElementById("youHand");
const boardEl = document.getElementById("ccBoard");

const resultPanelEl = document.getElementById("resultPanel");
const resultScoreEl = document.getElementById("resultScore");
const resultTextEl = document.getElementById("resultText");
const claimChoicesEl = document.getElementById("claimChoices");
const claimBtn = document.getElementById("claimBtn");
const againBtn = document.getElementById("againBtn");

const save = loadCardSave();
let player = getCurrentPlayer(save);
let selectedUids = []; // cards picked for the next hand
let game = null;
let claimPick = null;

function setStatus(text, color) {
  statusEl.textContent = text;
  statusEl.dataset.color = color || "";
}

function showView(name) {
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
}

function otherColor(color) {
  return color === "red" ? "blue" : "red";
}

// --- New player ---
function showSetup() {
  showView("setup");
  setStatus("Welcome! Who's playing?");
  nameInput.focus();
}

setupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  player = createPlayer(save, cleanName(nameInput.value));
  saveCardSave(save);
  showDeck(`Welcome, ${player.name}! Here are your 5 starter cards.`);
});

// --- Choose a hand ---
function showDeck(notice) {
  showView("deck");
  deckNameEl.textContent = player.name;
  const collection = playableCollection(player);
  const { wins, losses, draws } = player.stats;
  deckRecordEl.textContent = `${wins}W – ${losses}L – ${draws}D · ${collection.length} cards`;
  deckNoticeEl.hidden = !notice;
  deckNoticeEl.textContent = notice || "";

  const owned = new Set(collection.map((c) => c.uid));
  selectedUids = player.lastHand.filter((uid) => owned.has(uid)).slice(0, HAND_SIZE);
  if (collection.length === HAND_SIZE) selectedUids = collection.map((c) => c.uid);
  renderDeck();
}

function renderDeck() {
  deckGridEl.innerHTML = "";
  sortedCollection(player).forEach((owned) => {
    const btn = document.createElement("button");
    btn.className = "cc-pick";
    btn.dataset.uid = owned.uid;
    const picked = selectedUids.includes(owned.uid);
    btn.classList.toggle("selected", picked);
    btn.setAttribute("aria-pressed", String(picked));
    btn.appendChild(createCardEl(owned.cardId));
    deckGridEl.appendChild(btn);
  });

  const count = selectedUids.length;
  playBtn.disabled = count !== HAND_SIZE;
  if (playableCollection(player).length < HAND_SIZE) {
    setStatus(`You need at least ${HAND_SIZE} cards to play.`);
  } else {
    setStatus(`Choose ${HAND_SIZE} cards for your hand: ${count} / ${HAND_SIZE}`);
  }
}

deckGridEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-pick");
  if (!btn) return;
  const uid = btn.dataset.uid;
  if (selectedUids.includes(uid)) {
    selectedUids = selectedUids.filter((u) => u !== uid);
  } else if (selectedUids.length < HAND_SIZE) {
    selectedUids.push(uid);
  }
  renderDeck();
});

playBtn.addEventListener("click", () => {
  if (selectedUids.length !== HAND_SIZE) return;
  player.lastHand = [...selectedUids];
  saveCardSave(save);
  startGame();
});

// --- Playing ---
function startGame() {
  const byUid = Object.fromEntries(player.collection.map((c) => [c.uid, c.cardId]));
  const youFirst = Math.random() < 0.5;
  game = {
    board: Array(9).fill(null), // { cardId, color, startColor }
    hands: { you: selectedUids.map((uid) => byUid[uid]), cpu: randomCards(HAND_SIZE) },
    color: { you: youFirst ? "red" : "blue", cpu: youFirst ? "blue" : "red" },
    turn: youFirst ? "you" : "cpu",
    cpuName: randomItem(CPU_NAMES),
    selected: null,
    cpuPick: null,
    flipsMade: 0,
    over: false,
  };

  showView("play");
  resultPanelEl.hidden = true;
  boardEl.hidden = false;
  cpuSideEl.hidden = false;
  youSideEl.hidden = false;
  cpuLabelEl.textContent = `🤖 ${game.cpuName}`;
  youLabelEl.textContent = player.name;
  cpuSideEl.dataset.color = game.color.cpu;
  youSideEl.dataset.color = game.color.you;
  renderBoard();
  beginTurn(
    youFirst
      ? "Coin toss: you go first as Red! Pick a card, then a square."
      : `Coin toss: ${game.cpuName} goes first as Red. You're Blue.`
  );
}

function renderBoard(placed = null, flipped = []) {
  boardEl.innerHTML = "";
  game.board.forEach((slot, i) => {
    const btn = document.createElement("button");
    btn.className = "cc-slot";
    btn.dataset.index = i;
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, Column ${(i % 3) + 1}`);
    if (slot) {
      btn.disabled = true;
      const flipping = flipped.includes(i);
      // A flipping card shows its old color until the flip's midpoint.
      const card = createCardEl(slot.cardId, flipping ? otherColor(slot.color) : slot.color);
      if (i === placed) card.classList.add("cc-placed");
      if (flipping) {
        card.classList.add("cc-flipping");
        setTimeout(() => card.classList.replace(otherColor(slot.color), slot.color), FLIP_MS / 2);
      }
      if (game.over && slot.startColor === game.color.cpu && slot.color === game.color.you) {
        btn.classList.add("cc-claimable");
      }
      btn.appendChild(card);
    }
    boardEl.appendChild(btn);
  });
}

function renderHand(side) {
  const handEl = side === "you" ? youHandEl : cpuHandEl;
  const yourTurn = side === "you" && game.turn === "you" && !game.over;
  handEl.innerHTML = "";
  handEl.classList.toggle("waiting", game.turn !== side);
  game.hands[side].forEach((cardId, i) => {
    const wrap = document.createElement(side === "you" ? "button" : "div");
    wrap.className = "cc-hand-card";
    const picked = side === "you" ? game.selected === i : game.cpuPick === i;
    wrap.classList.toggle("selected", picked);
    if (side === "you") {
      wrap.dataset.index = i;
      wrap.disabled = !yourTurn;
      wrap.setAttribute("aria-pressed", String(picked));
    }
    wrap.appendChild(createCardEl(cardId, game.color[side]));
    handEl.appendChild(wrap);
  });
}

// Each side scores its cards on the board plus the cards still in its hand,
// so the scores start at 5–5 and always add up to 10. At the end the player
// who went second has one unplayed card, which still counts.
function scoreFor(side) {
  const onBoard = game.board.filter((slot) => slot && slot.color === game.color[side]).length;
  const inHand = game.hands[side].length;
  return { onBoard, inHand, total: onBoard + inHand };
}

function renderScores() {
  youScoreEl.textContent = scoreFor("you").total;
  cpuScoreEl.textContent = scoreFor("cpu").total;
}

function beginTurn(message) {
  if (game.turn === "you" && game.hands.you.length === 1) game.selected = 0;
  game.cpuPick = null;
  renderHand("you");
  renderHand("cpu");
  renderScores();
  boardEl.classList.toggle("placing", game.turn === "you");

  if (game.turn === "you") {
    setStatus(message || "Your turn: pick a card, then a square.", game.color.you);
  } else {
    setStatus(message || `${game.cpuName} is thinking…`, game.color.cpu);
    setTimeout(cpuTurn, message ? CPU_THINK_MS * 1.5 : CPU_THINK_MS);
  }
}

function playCard(side, handIndex, slotIndex) {
  const color = game.color[side];
  const [cardId] = game.hands[side].splice(handIndex, 1);
  const flips = findFlips(game.board, slotIndex, cardId, color);
  game.board[slotIndex] = { cardId, color, startColor: color };
  flips.forEach((i) => {
    game.board[i].color = color;
  });
  if (side === "you") game.flipsMade += flips.length;
  game.selected = null;

  renderBoard(slotIndex, flips);

  if (game.board.every(Boolean)) {
    game.turn = null;
    renderHand("you");
    renderHand("cpu");
    renderScores();
    boardEl.classList.remove("placing");
    setTimeout(finishGame, FLIP_MS + 300);
    return;
  }

  game.turn = side === "you" ? "cpu" : "you";
  let message = null;
  if (flips.length && side === "you") {
    message = `You flipped ${flips.length} card${flips.length > 1 ? "s" : ""}! ${game.cpuName} is thinking…`;
  } else if (flips.length) {
    message = `${game.cpuName} flipped ${flips.length} of your cards. Your turn.`;
  }
  beginTurn(message);
}

// The computer takes the move that flips the most cards right now, choosing
// randomly between equally good moves.
function cpuTurn() {
  if (!game || game.over || game.turn !== "cpu") return;
  const moves = [];
  game.hands.cpu.forEach((cardId, h) => {
    game.board.forEach((slot, i) => {
      if (!slot) moves.push({ h, i, flips: findFlips(game.board, i, cardId, game.color.cpu).length });
    });
  });
  const best = Math.max(...moves.map((m) => m.flips));
  const move = randomItem(moves.filter((m) => m.flips === best));

  game.cpuPick = move.h;
  renderHand("cpu");
  setTimeout(() => playCard("cpu", move.h, move.i), CPU_SHOW_PICK_MS);
}

youHandEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-hand-card");
  if (!btn || btn.disabled || !game || game.turn !== "you") return;
  game.selected = Number(btn.dataset.index);
  renderHand("you");
  setStatus("Now tap an empty square.", game.color.you);
});

boardEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-slot");
  if (!btn || btn.disabled || !game || game.over || game.turn !== "you") return;
  if (game.selected === null) {
    setStatus("Pick a card from your hand first.", game.color.you);
    return;
  }
  playCard("you", game.selected, Number(btn.dataset.index));
});

// --- End of game ---
function finishGame() {
  game.over = true;
  const you = scoreFor("you");
  const cpu = scoreFor("cpu");
  const yours = you.total;
  const theirs = cpu.total;
  let result = "draw";
  if (yours > theirs) result = "win";
  else if (yours < theirs) result = "loss";
  const won = result === "win";
  const at = Date.now();

  const stats = player.stats;
  stats.played++;
  stats.flipsMade += game.flipsMade;
  if (won) {
    stats.wins++;
    stats.currentStreak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
  } else {
    if (result === "loss") stats.losses++;
    else stats.draws++;
    stats.currentStreak = 0;
  }

  player.history.unshift({
    at,
    opponent: game.cpuName,
    result,
    score: [yours, theirs],
    wentFirst: game.color.you === "red",
    claimed: null,
  });
  player.history = player.history.slice(0, HISTORY_LIMIT);

  // Opponent cards that finished in your color are the ones you can claim.
  const options = won
    ? [...new Set(
        game.board
          .filter((slot) => slot.startColor === game.color.cpu && slot.color === game.color.you)
          .map((slot) => slot.cardId)
      )]
    : [];
  player.pendingClaim = options.length ? { at, opponent: game.cpuName, options } : null;
  saveCardSave(save);

  renderBoard();
  if (result === "win") {
    setStatus(`You win ${yours}–${theirs}! 🎉`, game.color.you);
  } else if (result === "loss") {
    setStatus(`${game.cpuName} wins ${theirs}–${yours}.`, game.color.cpu);
  } else {
    setStatus(`It's a draw, ${yours}–${theirs}.`);
  }
  const describe = (name, s) => (s.inHand ? `${name} ${s.total} (${s.onBoard} on board + ${s.inHand} in hand)` : `${name} ${s.total}`);
  resultScoreEl.textContent = `${describe("You", you)} · ${describe(game.cpuName, cpu)}`;
  resultScoreEl.hidden = false;
  showResult(result);
}

function showResult(result) {
  cpuSideEl.hidden = true;
  youSideEl.hidden = true;
  resultPanelEl.hidden = false;
  claimPick = null;

  if (player.pendingClaim) {
    resultTextEl.textContent = `Pick one of ${player.pendingClaim.opponent}'s cards you captured to add to your collection:`;
    renderClaimChoices();
    againBtn.hidden = true;
  } else {
    const messages = {
      win: `None of ${game.cpuName}'s cards ended in your color, so there's no card to claim this time.`,
      loss: "Better luck next time. You never lose your own cards.",
      draw: "No cards change hands on a draw.",
    };
    resultTextEl.textContent = messages[result];
    claimChoicesEl.innerHTML = "";
    claimBtn.hidden = true;
    againBtn.hidden = false;
  }
}

function renderClaimChoices() {
  claimChoicesEl.innerHTML = "";
  player.pendingClaim.options.forEach((cardId) => {
    const btn = document.createElement("button");
    btn.className = "cc-hand-card";
    btn.dataset.cardId = cardId;
    btn.classList.toggle("selected", claimPick === cardId);
    btn.setAttribute("aria-pressed", String(claimPick === cardId));
    btn.appendChild(createCardEl(cardId));
    claimChoicesEl.appendChild(btn);
  });
  claimBtn.hidden = false;
  claimBtn.disabled = !claimPick;
}

claimChoicesEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-hand-card");
  if (!btn || !player.pendingClaim) return;
  claimPick = btn.dataset.cardId;
  renderClaimChoices();
});

claimBtn.addEventListener("click", () => {
  const claim = player.pendingClaim;
  if (!claim || !claimPick) return;
  player.collection.push(makeOwnedCard(claimPick, "won"));
  player.stats.cardsClaimed++;
  const entry = player.history.find((h) => h.at === claim.at);
  if (entry) entry.claimed = claimPick;
  player.pendingClaim = null;
  saveCardSave(save);

  const card = getCard(claimPick);
  const wrap = document.createElement("div");
  wrap.className = "cc-hand-card cc-claimed";
  wrap.appendChild(createCardEl(claimPick));
  claimChoicesEl.innerHTML = "";
  claimChoicesEl.appendChild(wrap);
  resultTextEl.textContent = `${card.name} was added to your collection!`;
  claimBtn.hidden = true;
  againBtn.hidden = false;
});

againBtn.addEventListener("click", () => {
  game = null;
  showDeck();
});

// A win whose reward wasn't picked yet (e.g. the page was reloaded) is shown
// before anything else so the card isn't lost.
function showPendingClaim() {
  showView("play");
  boardEl.hidden = true;
  resultScoreEl.hidden = true;
  setStatus("You won your last game!", "");
  showResult("win");
}

if (!player) {
  showSetup();
} else if (player.pendingClaim) {
  showPendingClaim();
} else {
  showDeck();
}

// --- Service worker registration for offline standalone use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
