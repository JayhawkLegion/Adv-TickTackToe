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

let board = Array(9).fill(null);
let currentPlayer = "X";
let gameOver = false;
const scores = { X: 0, O: 0, draw: 0 };

function checkWinner() {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line };
    }
  }
  if (board.every((cell) => cell !== null)) {
    return { winner: "draw", line: null };
  }
  return null;
}

function render() {
  const cells = boardEl.querySelectorAll(".cell");
  cells.forEach((cell, i) => {
    cell.textContent = board[i] || "";
    cell.className = "cell";
    if (board[i]) cell.classList.add(board[i].toLowerCase());
    cell.disabled = Boolean(board[i]) || gameOver;
  });
}

function handleCellClick(e) {
  const index = Number(e.currentTarget.dataset.index);
  if (board[index] || gameOver) return;

  board[index] = currentPlayer;
  const result = checkWinner();

  if (result) {
    gameOver = true;
    render();
    if (result.winner === "draw") {
      scores.draw++;
      statusEl.textContent = "It's a draw!";
    } else {
      scores[result.winner]++;
      statusEl.textContent = `Player ${result.winner} wins!`;
      result.line.forEach((i) => {
        boardEl.children[i].classList.add("win");
      });
    }
    updateScoreboard();
    return;
  }

  currentPlayer = currentPlayer === "X" ? "O" : "X";
  statusEl.textContent = `Player ${currentPlayer}'s turn`;
  render();
}

function updateScoreboard() {
  scoreXEl.textContent = scores.X;
  scoreOEl.textContent = scores.O;
  scoreDrawEl.textContent = scores.draw;
}

function resetRound() {
  board = Array(9).fill(null);
  currentPlayer = "X";
  gameOver = false;
  statusEl.textContent = `Player ${currentPlayer}'s turn`;
  render();
}

boardEl.querySelectorAll(".cell").forEach((cell) => {
  cell.addEventListener("click", handleCellClick);
});
resetBtn.addEventListener("click", resetRound);

render();

// --- PWA install banner (iOS Safari has no install prompt API, so hint manually) ---
const installBanner = document.getElementById("installBanner");
const dismissBanner = document.getElementById("dismissBanner");
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
const bannerDismissed = localStorage.getItem("installBannerDismissed") === "true";

if (isIOS && !isStandalone && !bannerDismissed) {
  installBanner.hidden = false;
}

dismissBanner.addEventListener("click", () => {
  installBanner.hidden = true;
  localStorage.setItem("installBannerDismissed", "true");
});

// --- Service worker registration for offline standalone use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
