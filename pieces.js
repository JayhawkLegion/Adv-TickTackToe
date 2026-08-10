// Shared helpers for rendering "concentric circle" game pieces.
// A piece is {color: 'R'|'B', size: 1..sizeCount}. A cell/tray slot stack is an array of pieces.
const PIECES_PER_SIZE = 2;
const MIN_RADIUS = 14;
const MAX_RADIUS = 46;

const SETTINGS_KEY = "tttSettings";
const DEFAULT_SETTINGS = { sizeCount: 1 };

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function radiusForSize(size, sizeCount) {
  if (sizeCount <= 1) return MAX_RADIUS;
  const step = (MAX_RADIUS - MIN_RADIUS) / (sizeCount - 1);
  return MIN_RADIUS + (size - 1) * step;
}

function pieceColorVar(color) {
  return color === "R" ? "var(--red-color)" : "var(--blue-color)";
}

// Renders a stack of pieces (smallest/earliest first) as nested circle outlines.
function renderStackSVG(stack, sizeCount) {
  if (!stack.length) return "";
  const circles = stack
    .map((piece, i) => {
      const r = radiusForSize(piece.size, sizeCount);
      const isTop = i === stack.length - 1;
      const color = pieceColorVar(piece.color);
      const strokeWidth = isTop ? 7 : 4;
      const fillOpacity = isTop ? 0.18 : 0;
      return `<circle cx="50" cy="50" r="${r}" fill="${color}" fill-opacity="${fillOpacity}" stroke="${color}" stroke-width="${strokeWidth}"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 100 100" class="piece-stack">${circles}</svg>`;
}

// Renders a single loose piece (used for tray slots and the drag ghost).
function renderSinglePieceSVG(size, color, sizeCount) {
  const r = radiusForSize(size, sizeCount);
  const c = pieceColorVar(color);
  return `<svg viewBox="0 0 100 100" class="piece-stack"><circle cx="50" cy="50" r="${r}" fill="${c}" fill-opacity="0.18" stroke="${c}" stroke-width="7"/></svg>`;
}
