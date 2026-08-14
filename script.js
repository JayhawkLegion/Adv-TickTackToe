const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const resetBtn = document.getElementById("resetBtn");
const scoreXEl = document.getElementById("scoreX");
const scoreOEl = document.getElementById("scoreO");
const scoreDrawEl = document.getElementById("scoreDraw");
const scoreLabel1El = document.getElementById("scoreLabel1");
const scoreLabel2El = document.getElementById("scoreLabel2");
const traysEl = document.getElementById("trays");
const trayREl = document.getElementById("trayR");
const trayBEl = document.getElementById("trayB");
const traySlotsREl = document.getElementById("traySlotsR");
const traySlotsBEl = document.getElementById("traySlotsB");

let activeSizeCount = 1;
let isAdvanced = false;
let board = Array.from({ length: 9 }, () => []);
let currentPlayer = "X";
let gameOver = false;
let trays = null;
let selectedPiece = null;
let dragState = null;
let suppressNextClick = false;

const scores = { p1: 0, p2: 0, draw: 0 };

function topOf(stack) {
  return stack.length ? stack[stack.length - 1] : null;
}

function colorName(c) {
  return c === "R" ? "Red" : "Blue";
}

// Guarantee enough pieces to fill every board cell even if neither player ever
// covers an existing piece: the first player may need up to 5 placements
// (cells 1,3,5,7,9 of a 9-cell board), so pad the smallest size if needed.
const MIN_TOTAL_PIECES = 5;

function buildTray(sizeCount) {
  const tray = {};
  let total = 0;
  for (let s = 1; s <= sizeCount; s++) {
    tray[s] = PIECES_PER_SIZE;
    total += PIECES_PER_SIZE;
  }
  while (total < MIN_TOTAL_PIECES) {
    tray[1]++;
    total++;
  }
  return tray;
}

function hasLegalMove(color) {
  const pieces = trays[color];
  const sizes = Object.keys(pieces)
    .map(Number)
    .filter((s) => pieces[s] > 0);
  if (sizes.length === 0) return false;
  const maxAvailable = Math.max(...sizes);
  for (let i = 0; i < 9; i++) {
    const top = topOf(board[i]);
    if (!top || maxAvailable > top.size) return true;
  }
  return false;
}

function canPlace(idx, size) {
  const top = topOf(board[idx]);
  return !top || size > top.size;
}

function checkWinner() {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const ta = topOf(board[a]);
    const tb = topOf(board[b]);
    const tc = topOf(board[c]);
    if (ta && tb && tc && ta.color === tb.color && ta.color === tc.color) {
      return { winner: ta.color, line };
    }
  }
  if (isAdvanced) {
    if (!hasLegalMove("R") && !hasLegalMove("B")) {
      return { winner: "draw", line: null };
    }
  } else if (board.every((stack) => stack.length > 0)) {
    return { winner: "draw", line: null };
  }
  return null;
}

function render() {
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach((cell, i) => {
    const stack = board[i];
    cell.className = "cell";
    if (!isAdvanced) {
      const top = topOf(stack);
      cell.textContent = top ? top.color : "";
      if (top) cell.classList.add(top.color.toLowerCase());
      cell.disabled = Boolean(top) || gameOver;
    } else {
      cell.textContent = "";
      cell.innerHTML = renderStackSVG(stack, activeSizeCount);
      cell.disabled = gameOver;
    }
  });
}

function renderTrays() {
  if (!isAdvanced) return;
  trayREl.classList.toggle("active-tray", currentPlayer === "R" && !gameOver);
  trayBEl.classList.toggle("active-tray", currentPlayer === "B" && !gameOver);
  renderTraySlots(traySlotsREl, "R");
  renderTraySlots(traySlotsBEl, "B");
}

function renderTraySlots(container, color) {
  container.innerHTML = "";
  for (let size = 1; size <= activeSizeCount; size++) {
    const count = trays[color][size];
    const btn = document.createElement("button");
    btn.className = "tray-slot";
    btn.dataset.size = String(size);
    btn.dataset.color = color;
    btn.disabled = count <= 0 || gameOver || color !== currentPlayer;
    btn.innerHTML =
      renderSinglePieceSVG(size, color, activeSizeCount) +
      `<span class="slot-count">${count}</span>`;
    btn.addEventListener("pointerdown", onTraySlotPointerDown);
    container.appendChild(btn);
  }
}

function updateScoreboard() {
  scoreXEl.textContent = scores.p1;
  scoreOEl.textContent = scores.p2;
  scoreDrawEl.textContent = scores.draw;
}

function afterPlacement() {
  render();
  renderTrays();
  const result = checkWinner();
  if (result) {
    gameOver = true;
    if (result.winner === "draw") {
      scores.draw++;
      statusEl.textContent = "It's a draw!";
    } else {
      const isP1 = result.winner === "X" || result.winner === "R";
      if (isP1) scores.p1++;
      else scores.p2++;
      statusEl.textContent = isAdvanced
        ? `${colorName(result.winner)} wins!`
        : `Player ${result.winner} wins!`;
      result.line.forEach((i) => boardEl.children[i].classList.add("win"));
    }
    updateScoreboard();
    return;
  }
  advanceTurn();
  render();
  renderTrays();
}

function advanceTurn() {
  if (!isAdvanced) {
    currentPlayer = currentPlayer === "X" ? "O" : "X";
    statusEl.textContent = `Player ${currentPlayer}'s turn`;
    return;
  }
  const other = currentPlayer === "R" ? "B" : "R";
  if (hasLegalMove(other)) {
    currentPlayer = other;
    statusEl.textContent = `${colorName(currentPlayer)}'s turn`;
  } else {
    statusEl.textContent = `${colorName(other)} has no legal moves — turn passes back to ${colorName(currentPlayer)}`;
  }
}

function handleClassicClick(idx) {
  if (board[idx].length) return;
  board[idx] = [{ color: currentPlayer, size: 1 }];
  afterPlacement();
}

function commitPlacement(idx, color, size) {
  trays[color][size]--;
  board[idx] = [...board[idx], { color, size }];
  afterPlacement();
}

function onCellClick(e) {
  if (gameOver) return;
  const idx = Number(e.currentTarget.dataset.index);
  if (!isAdvanced) {
    handleClassicClick(idx);
    return;
  }
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  if (!selectedPiece) return;
  const { color, size } = selectedPiece;
  if (canPlace(idx, size)) {
    clearSelection();
    commitPlacement(idx, color, size);
  } else {
    flashInvalid(idx);
    clearSelection();
  }
}

function flashInvalid(idx) {
  const cell = boardEl.children[idx];
  cell.classList.add("invalid-shake");
  setTimeout(() => cell.classList.remove("invalid-shake"), 300);
}

function highlightValidCells(size) {
  boardEl.querySelectorAll(".cell").forEach((cell, i) => {
    if (canPlace(i, size)) cell.classList.add("valid-drop");
  });
}

function clearHighlights() {
  boardEl.querySelectorAll(".cell").forEach((cell) => cell.classList.remove("valid-drop"));
}

function clearSelection() {
  selectedPiece = null;
  document.querySelectorAll(".tray-slot.selected").forEach((b) => b.classList.remove("selected"));
  clearHighlights();
}

function positionGhost(ghost, x, y) {
  ghost.style.left = `${x}px`;
  ghost.style.top = `${y}px`;
}

function onTraySlotPointerDown(e) {
  const btn = e.currentTarget;
  const color = btn.dataset.color;
  const size = Number(btn.dataset.size);
  if (gameOver || color !== currentPlayer || btn.disabled) return;
  e.preventDefault();

  clearSelection();

  const ghost = document.createElement("div");
  ghost.className = "drag-ghost";
  ghost.innerHTML = renderSinglePieceSVG(size, color, activeSizeCount);
  document.body.appendChild(ghost);
  positionGhost(ghost, e.clientX, e.clientY);

  dragState = { color, size, ghost, moved: false, startX: e.clientX, startY: e.clientY, sourceBtn: btn };
  highlightValidCells(size);

  window.addEventListener("pointermove", onDragPointerMove);
  window.addEventListener("pointerup", onDragPointerUp);
}

function onDragPointerMove(e) {
  if (!dragState) return;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  if (Math.hypot(dx, dy) > 6) dragState.moved = true;
  positionGhost(dragState.ghost, e.clientX, e.clientY);
}

function onDragPointerUp(e) {
  if (!dragState) return;
  const { color, size, ghost, moved, sourceBtn } = dragState;
  window.removeEventListener("pointermove", onDragPointerMove);
  window.removeEventListener("pointerup", onDragPointerUp);
  ghost.remove();

  const target = document.elementFromPoint(e.clientX, e.clientY);
  const cellEl = target && target.closest && target.closest(".cell");

  dragState = null;

  if (cellEl) {
    clearHighlights();
    const idx = Number(cellEl.dataset.index);
    suppressNextClick = true;
    setTimeout(() => {
      suppressNextClick = false;
    }, 50);
    if (canPlace(idx, size)) {
      commitPlacement(idx, color, size);
    } else {
      flashInvalid(idx);
    }
    return;
  }

  if (!moved) {
    selectedPiece = { color, size };
    sourceBtn.classList.add("selected");
    return;
  }

  clearHighlights();
}

function resetRound() {
  const settings = loadSettings();
  activeSizeCount = Math.max(1, Math.min(6, Number(settings.sizeCount) || 1));
  isAdvanced = activeSizeCount > 1;
  board = Array.from({ length: 9 }, () => []);
  gameOver = false;
  selectedPiece = null;
  dragState = null;

  if (isAdvanced) {
    currentPlayer = "R";
    trays = { R: buildTray(activeSizeCount), B: buildTray(activeSizeCount) };
    traysEl.hidden = false;
    scoreLabel1El.textContent = "Red wins";
    scoreLabel2El.textContent = "Blue wins";
    statusEl.textContent = "Red's turn";
  } else {
    currentPlayer = "X";
    trays = null;
    traysEl.hidden = true;
    scoreLabel1El.textContent = "X wins";
    scoreLabel2El.textContent = "O wins";
    statusEl.textContent = "Player X's turn";
  }

  render();
  renderTrays();
}

boardEl.querySelectorAll(".cell").forEach((cell) => {
  cell.addEventListener("click", onCellClick);
});
resetBtn.addEventListener("click", resetRound);

resetRound();

// --- Service worker registration for offline standalone use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
