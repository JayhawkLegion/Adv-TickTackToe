// Fence: classic dots-and-boxes. Grid size (boxes per side) is configurable
// via fence-settings.html; the dot grid is always one bigger than that.
const FENCE_SETTINGS_KEY = "fenceSettings";
const DEFAULT_FENCE_SETTINGS = { gridSize: 5 };

function loadFenceSettings() {
  try {
    const raw = localStorage.getItem(FENCE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_FENCE_SETTINGS };
    return { ...DEFAULT_FENCE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_FENCE_SETTINGS };
  }
}

const CELL = 56;
const MARGIN = 24;
let DOTS;
let BOXES;
let SIZE;

const boardEl = document.getElementById("fenceBoard");
const statusEl = document.getElementById("status");
const score1El = document.getElementById("score1");
const score2El = document.getElementById("score2");
const resetBtn = document.getElementById("resetBtn");

let hEdges; // hEdges[r][c]: horizontal edge between dot(r,c) and dot(r,c+1) — r: 0..DOTS-1, c: 0..BOXES-1
let vEdges; // vEdges[r][c]: vertical edge between dot(r,c) and dot(r+1,c) — r: 0..BOXES-1, c: 0..DOTS-1
let boxOwner; // boxOwner[r][c]: null | 1 | 2
let currentPlayer;
let scores;
let gameOver;

function isBoxComplete(br, bc) {
  return Boolean(hEdges[br][bc] && hEdges[br + 1][bc] && vEdges[br][bc] && vEdges[br][bc + 1]);
}

function drawEdge(type, r, c) {
  if (gameOver) return;
  if (type === "h") {
    if (hEdges[r][c]) return;
    hEdges[r][c] = currentPlayer;
  } else {
    if (vEdges[r][c]) return;
    vEdges[r][c] = currentPlayer;
  }

  const adjacentBoxes = [];
  if (type === "h") {
    if (r < BOXES) adjacentBoxes.push([r, c]);
    if (r > 0) adjacentBoxes.push([r - 1, c]);
  } else {
    if (c < BOXES) adjacentBoxes.push([r, c]);
    if (c > 0) adjacentBoxes.push([r, c - 1]);
  }

  let completedAny = false;
  adjacentBoxes.forEach(([br, bc]) => {
    if (!boxOwner[br][bc] && isBoxComplete(br, bc)) {
      boxOwner[br][bc] = currentPlayer;
      scores[currentPlayer]++;
      completedAny = true;
    }
  });

  updateScores();

  const totalBoxes = BOXES * BOXES;
  if (scores[1] + scores[2] === totalBoxes) {
    gameOver = true;
    if (scores[1] === scores[2]) {
      statusEl.textContent = "It's a tie!";
    } else {
      statusEl.textContent = `Player ${scores[1] > scores[2] ? 1 : 2} wins!`;
    }
    render();
    return;
  }

  if (!completedAny) {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    statusEl.textContent = `Player ${currentPlayer}'s turn`;
  } else {
    statusEl.textContent = `Box! Player ${currentPlayer} goes again`;
  }

  render();
}

function render() {
  let svg = `<svg viewBox="0 0 ${SIZE} ${SIZE}" class="fence-svg">`;

  for (let br = 0; br < BOXES; br++) {
    for (let bc = 0; bc < BOXES; bc++) {
      const owner = boxOwner[br][bc];
      if (!owner) continue;
      const x = MARGIN + bc * CELL;
      const y = MARGIN + br * CELL;
      const color = owner === 1 ? "var(--red-color)" : "var(--blue-color)";
      svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${color}" fill-opacity="0.15"/>`;
      svg += `<text x="${x + CELL / 2}" y="${y + CELL / 2}" class="box-label" fill="${color}" text-anchor="middle" dominant-baseline="central">${owner}</text>`;
    }
  }

  for (let r = 0; r < DOTS; r++) {
    for (let c = 0; c < BOXES; c++) {
      const x1 = MARGIN + c * CELL;
      const y1 = MARGIN + r * CELL;
      const x2 = MARGIN + (c + 1) * CELL;
      const drawn = hEdges[r][c];
      const color = drawn === 1 ? "var(--red-color)" : drawn === 2 ? "var(--blue-color)" : "var(--muted)";
      if (!drawn) {
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" class="edge-hit" data-type="h" data-r="${r}" data-c="${c}"/>`;
      }
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y1}" class="edge-line${drawn ? " drawn" : ""}" stroke="${color}" pointer-events="none"/>`;
    }
  }

  for (let r = 0; r < BOXES; r++) {
    for (let c = 0; c < DOTS; c++) {
      const x1 = MARGIN + c * CELL;
      const y1 = MARGIN + r * CELL;
      const y2 = MARGIN + (r + 1) * CELL;
      const drawn = vEdges[r][c];
      const color = drawn === 1 ? "var(--red-color)" : drawn === 2 ? "var(--blue-color)" : "var(--muted)";
      if (!drawn) {
        svg += `<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" class="edge-hit" data-type="v" data-r="${r}" data-c="${c}"/>`;
      }
      svg += `<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y2}" class="edge-line${drawn ? " drawn" : ""}" stroke="${color}" pointer-events="none"/>`;
    }
  }

  for (let r = 0; r < DOTS; r++) {
    for (let c = 0; c < DOTS; c++) {
      const x = MARGIN + c * CELL;
      const y = MARGIN + r * CELL;
      svg += `<circle cx="${x}" cy="${y}" r="4" class="dot" pointer-events="none"/>`;
    }
  }

  svg += "</svg>";
  boardEl.innerHTML = svg;
}

function updateScores() {
  score1El.textContent = scores[1];
  score2El.textContent = scores[2];
}

function newGame() {
  const gridSize = Math.max(4, Math.min(7, Number(loadFenceSettings().gridSize) || 5));
  BOXES = gridSize;
  DOTS = gridSize + 1;
  SIZE = MARGIN * 2 + CELL * (DOTS - 1);

  hEdges = Array.from({ length: DOTS }, () => Array(BOXES).fill(null));
  vEdges = Array.from({ length: BOXES }, () => Array(DOTS).fill(null));
  boxOwner = Array.from({ length: BOXES }, () => Array(BOXES).fill(null));
  currentPlayer = 1;
  scores = { 1: 0, 2: 0 };
  gameOver = false;
  statusEl.textContent = "Player 1's turn";
  render();
  updateScores();
}

boardEl.addEventListener("click", (e) => {
  const target = e.target.closest(".edge-hit");
  if (!target) return;
  drawEdge(target.dataset.type, Number(target.dataset.r), Number(target.dataset.c));
});

resetBtn.addEventListener("click", newGame);

newGame();

// --- Service worker registration for offline standalone use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
