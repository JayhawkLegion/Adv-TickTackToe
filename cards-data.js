// Card Clash shared code: the card pool, the flip rule, saved player profiles
// and card rendering. Loaded by cards.html, cards-collection.html and
// cards-settings.html.

// Every card that can exist in the game. Add new cards here; `no` is the card
// number and sets display order. Everything is "normal" for now — rare, epic
// and legendary cards get added to RARITIES and the pool later.
const CARD_POOL = [
  { no: 1, id: "dog", name: "Dog", icon: "🐶", rarity: "normal", left: 1, top: 2, right: 3, bottom: 2 },
  { no: 2, id: "cat", name: "Cat", icon: "🐱", rarity: "normal", left: 2, top: 3, right: 1, bottom: 2 },
  { no: 3, id: "sparrow", name: "Sparrow", icon: "🐦", rarity: "normal", left: 3, top: 1, right: 1, bottom: 2 },
  { no: 4, id: "fish", name: "Fish", icon: "🐟", rarity: "normal", left: 1, top: 1, right: 2, bottom: 3 },
  { no: 5, id: "mouse", name: "Mouse", icon: "🐭", rarity: "normal", left: 2, top: 2, right: 2, bottom: 1 },
];

const RARITIES = {
  normal: { label: "Normal" },
};

const HAND_SIZE = 5;
const STARTER_SIZE = 5;
const HISTORY_LIMIT = 20;
const CARD_SAVE_KEY = "cardClashSave";

const CARDS_BY_ID = Object.fromEntries(CARD_POOL.map((card) => [card.id, card]));

function getCard(id) {
  return CARDS_BY_ID[id];
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Independent draws from the pool, so duplicates are possible.
function randomCards(count, rarity = "normal") {
  const pool = CARD_POOL.filter((card) => card.rarity === rarity);
  return Array.from({ length: count }, () => randomItem(pool).id);
}

// --- Rules ---
// Board slots are indexed row * 3 + col. A placed card compares each of its
// sides with the facing side of the neighbouring card.
const NEIGHBORS = [
  { dr: -1, dc: 0, side: "top", facing: "bottom" },
  { dr: 1, dc: 0, side: "bottom", facing: "top" },
  { dr: 0, dc: -1, side: "left", facing: "right" },
  { dr: 0, dc: 1, side: "right", facing: "left" },
];

// Slots of the opponent's cards that flip when `cardId` is placed at `index`
// by `color`: any adjacent enemy card whose touching number is lower.
function findFlips(board, index, cardId, color) {
  const card = getCard(cardId);
  const row = Math.floor(index / 3);
  const col = index % 3;
  const flips = [];
  NEIGHBORS.forEach(({ dr, dc, side, facing }) => {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r > 2 || c < 0 || c > 2) return;
    const other = board[r * 3 + c];
    if (!other || other.color === color) return;
    if (getCard(other.cardId)[facing] < card[side]) flips.push(r * 3 + c);
  });
  return flips;
}

// --- Saved players ---
// Shape: { currentPlayerId, players: { [id]: player } } so more users can be
// added later. Each player owns a collection of card instances (duplicates
// allowed), their last chosen hand, stats, recent game history, and a
// pending card claim if they won but haven't picked their reward yet.
function emptyStats() {
  return { played: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, cardsClaimed: 0, flipsMade: 0 };
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeOwnedCard(cardId, source) {
  return { uid: newId("c_"), cardId, source, acquiredAt: Date.now() };
}

function normalizePlayer(player) {
  player.stats = { ...emptyStats(), ...player.stats };
  player.collection = (player.collection || []).filter((owned) => getCard(owned.cardId));
  player.lastHand = player.lastHand || [];
  player.history = player.history || [];
  // Games saved before draws existed stored `won: true/false`.
  player.history.forEach((h) => {
    if (!h.result) h.result = h.won ? "win" : "loss";
    delete h.won;
  });
  if (player.pendingClaim) {
    player.pendingClaim.options = (player.pendingClaim.options || []).filter(getCard);
    if (!player.pendingClaim.options.length) player.pendingClaim = null;
  }
}

function loadCardSave() {
  let data = null;
  try {
    data = JSON.parse(localStorage.getItem(CARD_SAVE_KEY));
  } catch {
    data = null;
  }
  if (!data || typeof data !== "object" || !data.players) {
    data = { currentPlayerId: null, players: {} };
  }
  Object.values(data.players).forEach(normalizePlayer);
  return data;
}

function saveCardSave(data) {
  localStorage.setItem(CARD_SAVE_KEY, JSON.stringify(data));
}

function getCurrentPlayer(data) {
  return data.players[data.currentPlayerId] || null;
}

function createPlayer(data, name) {
  const player = {
    id: newId("p_"),
    name,
    createdAt: Date.now(),
    collection: randomCards(STARTER_SIZE).map((cardId) => makeOwnedCard(cardId, "starter")),
    lastHand: [],
    stats: emptyStats(),
    history: [],
    pendingClaim: null,
  };
  data.players[player.id] = player;
  data.currentPlayerId = player.id;
  return player;
}

function sortedCollection(player) {
  return [...player.collection].sort(
    (a, b) => getCard(a.cardId).no - getCard(b.cardId).no || a.acquiredAt - b.acquiredAt
  );
}

function cleanName(raw) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 20) || "Player";
}

// --- Rendering ---
// color: "red" | "blue" for a card in play, "neutral" in collections.
function createCardEl(cardId, color = "neutral") {
  const card = getCard(cardId);
  const el = document.createElement("div");
  el.className = `cc-card ${color}`;
  el.dataset.rarity = card.rarity;
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    `${card.name}: top ${card.top}, right ${card.right}, bottom ${card.bottom}, left ${card.left}`
  );
  el.innerHTML = `
    <span class="cc-num cc-top">${card.top}</span>
    <span class="cc-num cc-left">${card.left}</span>
    <span class="cc-face"><span class="cc-icon">${card.icon}</span><span class="cc-name">${card.name}</span></span>
    <span class="cc-num cc-right">${card.right}</span>
    <span class="cc-num cc-bottom">${card.bottom}</span>
  `;
  return el;
}
