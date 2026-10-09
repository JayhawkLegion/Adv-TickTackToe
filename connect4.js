// Connect 4: two players take turns dropping chips into a column; the chip
// falls to the lowest empty slot. Four in a row (any direction) wins.
// Board size is configurable via connect4-settings.html.
const C4_SETTINGS_KEY = "connect4Settings";
const DEFAULT_C4_SETTINGS = { columns: 7, rows: 6 };
const COLUMN_CHOICES = [5, 6, 7, 8, 9, 10];
const ROW_CHOICES = [4, 5, 6, 7, 8, 9];

function loadC4Settings() {
  try {
    const raw = localStorage.getItem(C4_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_C4_SETTINGS };
    return { ...DEFAULT_C4_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_C4_SETTINGS };
  }
}

const PLAYER_NAMES = { 1: "Red", 2: "Yellow" };
const DIRECTIONS = [
  [0, 1], // horizontal
  [1, 0], // vertical
  [1, 1], // diagonal down-right
  [1, -1], // diagonal down-left
];

const boardEl = document.getElementById("c4Board");
const statusEl = document.getElementById("status");
const scoreRedEl = document.getElementById("scoreRed");
const scoreYellowEl = document.getElementById("scoreYellow");
const scoreDrawEl = document.getElementById("scoreDraw");
const resetBtn = document.getElementById("resetBtn");

let COLS;
let ROWS;
let grid; // grid[r][c]: null | 1 | 2, row 0 is the top
let cellEls; // cellEls[r][c]: the slot element
let columnEls;
let currentPlayer;
let movesMade;
let gameOver;
let starter = 1; // loser of the last game (or alternating on a draw) goes first next
const scores = { 1: 0, 2: 0, draw: 0 };

function setStatus(text, player) {
  statusEl.textContent = text;
  statusEl.dataset.player = player || "";
}

function buildBoard() {
  boardEl.innerHTML = "";
  boardEl.style.setProperty("--c4-cols", COLS);
  boardEl.style.setProperty("--c4-rows", ROWS);
  cellEls = Array.from({ length: ROWS }, () => Array(COLS));
  columnEls = [];

  for (let c = 0; c < COLS; c++) {
    const col = document.createElement("button");
    col.className = "c4-column";
    col.dataset.col = c;
    col.setAttribute("aria-label", `Drop in column ${c + 1}`);
    for (let r = 0; r < ROWS; r++) {
      const slot = document.createElement("div");
      slot.className = "c4-slot";
      col.appendChild(slot);
      cellEls[r][c] = slot;
    }
    boardEl.appendChild(col);
    columnEls.push(col);
  }
}

function lowestEmptyRow(c) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (!grid[r][c]) return r;
  }
  return -1;
}

function findWin(r, c) {
  const player = grid[r][c];
  for (const [dr, dc] of DIRECTIONS) {
    const line = [[r, c]];
    for (const sign of [1, -1]) {
      let rr = r + dr * sign;
      let cc = c + dc * sign;
      while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && grid[rr][cc] === player) {
        line.push([rr, cc]);
        rr += dr * sign;
        cc += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

function updateScores() {
  scoreRedEl.textContent = scores[1];
  scoreYellowEl.textContent = scores[2];
  scoreDrawEl.textContent = scores.draw;
}

function updateColumnStates() {
  columnEls.forEach((col, c) => {
    col.disabled = gameOver || lowestEmptyRow(c) === -1;
  });
}

function dropChip(c) {
  if (gameOver) return;
  const r = lowestEmptyRow(c);
  if (r === -1) return;

  grid[r][c] = currentPlayer;
  movesMade++;

  const chip = document.createElement("div");
  chip.className = `c4-chip p${currentPlayer} dropping`;
  // Fall from just above the board down to the landing row.
  chip.style.setProperty("--fall", r + 1);
  cellEls[r][c].appendChild(chip);
  chip.addEventListener("animationend", () => chip.classList.remove("dropping"), { once: true });

  const win = findWin(r, c);
  if (win) {
    gameOver = true;
    scores[currentPlayer]++;
    win.forEach(([wr, wc]) => cellEls[wr][wc].classList.add("win"));
    setStatus(`${PLAYER_NAMES[currentPlayer]} wins!`, currentPlayer);
    starter = currentPlayer === 1 ? 2 : 1;
  } else if (movesMade === ROWS * COLS) {
    gameOver = true;
    scores.draw++;
    setStatus("Board full. It's a draw!");
    starter = starter === 1 ? 2 : 1;
  } else {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    setStatus(`${PLAYER_NAMES[currentPlayer]}'s turn`, currentPlayer);
  }

  boardEl.dataset.player = gameOver ? "" : currentPlayer;
  updateScores();
  updateColumnStates();
}

function clampChoice(value, choices, fallback) {
  const n = Number(value);
  return choices.includes(n) ? n : fallback;
}

function newGame() {
  const settings = loadC4Settings();
  COLS = clampChoice(settings.columns, COLUMN_CHOICES, DEFAULT_C4_SETTINGS.columns);
  ROWS = clampChoice(settings.rows, ROW_CHOICES, DEFAULT_C4_SETTINGS.rows);

  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  currentPlayer = starter;
  movesMade = 0;
  gameOver = false;
  buildBoard();
  boardEl.dataset.player = currentPlayer;
  setStatus(`${PLAYER_NAMES[currentPlayer]}'s turn`, currentPlayer);
  updateScores();
  updateColumnStates();
}

boardEl.addEventListener("click", (e) => {
  const col = e.target.closest(".c4-column");
  if (!col || col.disabled) return;
  dropChip(Number(col.dataset.col));
});

resetBtn.addEventListener("click", newGame);

newGame();

// --- Service worker registration for offline standalone use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
