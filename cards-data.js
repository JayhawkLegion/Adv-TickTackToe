// Card Clash shared code: the card pool, rarity chances, the flip rule, saved
// player profiles and card rendering. Loaded by every Card Clash page.

// The cards the game ships with. More cards are added from the Card Builder
// (cards-admin.html); those, and any edits to these, are saved in the browser
// and merged on top of this list. `no` is the card number and sets order.
const BUILT_IN_CARDS = [
  { no: 1, id: "dog", name: "Dog", icon: "🐶", rarity: "normal", left: 1, top: 2, right: 3, bottom: 2 },
  { no: 2, id: "cat", name: "Cat", icon: "🐱", rarity: "normal", left: 2, top: 3, right: 1, bottom: 2 },
  { no: 3, id: "sparrow", name: "Sparrow", icon: "🐦", rarity: "normal", left: 3, top: 1, right: 1, bottom: 2 },
  { no: 4, id: "fish", name: "Fish", icon: "🐟", rarity: "normal", left: 1, top: 1, right: 2, bottom: 3 },
  { no: 5, id: "mouse", name: "Mouse", icon: "🐭", rarity: "normal", left: 2, top: 2, right: 2, bottom: 1 },
];

const RARITY_ORDER = ["normal", "rare", "epic", "legendary"];
const RARITIES = {
  normal: { label: "Normal", color: "#9a9cb5" },
  rare: { label: "Rare", color: "#2dd4bf" },
  epic: { label: "Epic", color: "#c084fc" },
  legendary: { label: "Legendary", color: "#f59e0b" },
};
// Chance (%) that a randomly drawn card is of each rarity. Adjustable in the
// Card Builder; must add up to 100.
const DEFAULT_RARITY_CHANCES = { normal: 70, rare: 20, epic: 8, legendary: 2 };

const SIDES = ["top", "right", "bottom", "left"];
const HAND_SIZE = 5;
const STARTER_SIZE = 5;
const HISTORY_LIMIT = 20;
const CARD_SAVE_KEY = "cardClashSave";
const POOL_SAVE_KEY = "cardClashPool";
const BUILT_IN_BY_ID = Object.fromEntries(BUILT_IN_CARDS.map((card) => [card.id, card]));

let CARD_POOL;
let CARDS_BY_ID;
let RARITY_CHANCES;

function isValidCard(card) {
  return Boolean(
    card &&
      typeof card.id === "string" && card.id &&
      typeof card.name === "string" && card.name.trim() &&
      typeof card.icon === "string" && card.icon.trim() &&
      RARITIES[card.rarity] &&
      Number.isInteger(card.no) && card.no > 0 &&
      SIDES.every((side) => Number.isInteger(card[side]) && card[side] >= 1 && card[side] <= 10)
  );
}

// Only the fields a card is made of, so nothing else ends up in saves.
function cleanCard(card) {
  const { no, id, name, icon, rarity, left, top, right, bottom } = card;
  return { no, id, name, icon, rarity, left, top, right, bottom };
}

function sameCard(a, b) {
  return JSON.stringify(cleanCard(a)) === JSON.stringify(cleanCard(b));
}

function chancesTotal(chances) {
  return RARITY_ORDER.reduce((sum, r) => sum + chances[r], 0);
}

function isValidChances(chances) {
  return Boolean(
    chances &&
      RARITY_ORDER.every((r) => typeof chances[r] === "number" && chances[r] >= 0) &&
      Math.abs(chancesTotal(chances) - 100) < 0.01
  );
}

function loadPoolSave() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(POOL_SAVE_KEY));
  } catch {
    saved = null;
  }
  return saved && typeof saved === "object" ? saved : {};
}

// Built-in cards, overridden or extended by the saved cards.
function applyPool(savedCards, chances) {
  const byId = Object.fromEntries(BUILT_IN_CARDS.map((card) => [card.id, { ...card }]));
  (savedCards || []).filter(isValidCard).forEach((card) => {
    byId[card.id] = cleanCard(card);
  });
  CARD_POOL = Object.values(byId).sort((a, b) => a.no - b.no);
  CARDS_BY_ID = Object.fromEntries(CARD_POOL.map((card) => [card.id, card]));
  RARITY_CHANCES = isValidChances(chances) ? { ...chances } : { ...DEFAULT_RARITY_CHANCES };
}

// Saves only custom cards and edited built-in cards, so later changes to the
// built-in list still reach players who never edited those cards.
function savePool(pool, chances) {
  const cards = pool.filter((card) => !BUILT_IN_BY_ID[card.id] || !sameCard(card, BUILT_IN_BY_ID[card.id]));
  localStorage.setItem(POOL_SAVE_KEY, JSON.stringify({ cards: cards.map(cleanCard), chances }));
  applyPool(cards, chances);
}

function loadPool() {
  const saved = loadPoolSave();
  applyPool(saved.cards, saved.chances);
}

loadPool();

function getCard(id) {
  return CARDS_BY_ID[id];
}

function nextCardNumber() {
  return Math.max(0, ...CARD_POOL.map((card) => card.no)) + 1;
}

function randomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// The real chance of each rarity right now: a tier with no cards in the pool
// can't be drawn, so its share is spread over the tiers that have cards.
function effectiveChances(chances = RARITY_CHANCES, pool = CARD_POOL) {
  const live = RARITY_ORDER.filter((r) => pool.some((card) => card.rarity === r));
  const total = live.reduce((sum, r) => sum + chances[r], 0);
  const result = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  live.forEach((r) => {
    result[r] = total > 0 ? (chances[r] / total) * 100 : 100 / live.length;
  });
  return result;
}

function randomRarity() {
  const chances = effectiveChances();
  const live = RARITY_ORDER.filter((r) => chances[r] > 0);
  let roll = Math.random() * 100;
  for (const r of live) {
    roll -= chances[r];
    if (roll < 0) return r;
  }
  return live[live.length - 1];
}

// Each draw rolls a rarity by its chance, then picks a card of that rarity at
// random. Draws are independent, so duplicates are possible.
function randomCards(count) {
  return Array.from({ length: count }, () => {
    const rarity = randomRarity();
    return randomItem(CARD_POOL.filter((card) => card.rarity === rarity)).id;
  });
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
  player.collection = player.collection || [];
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

// Owned cards whose card still exists in the pool. Unknown cards stay in the
// save (so nothing is lost if the pool fails to load) but are left out here.
function playableCollection(player) {
  return player.collection.filter((owned) => getCard(owned.cardId));
}

function sortedCollection(player) {
  return playableCollection(player).sort(
    (a, b) => getCard(a.cardId).no - getCard(b.cardId).no || a.acquiredAt - b.acquiredAt
  );
}

function cleanName(raw) {
  return raw.trim().replace(/\s+/g, " ").slice(0, 20) || "Player";
}

// --- Rendering ---
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// `cardOrId` is a card id or a card object (the Card Builder previews unsaved
// cards). color: "red" | "blue" for a card in play, "neutral" otherwise.
// Neutral cards show their rarity as the border color; every non-normal card
// also gets a rarity gem in its top-left corner.
function createCardEl(cardOrId, color = "neutral") {
  const card = typeof cardOrId === "string" ? getCard(cardOrId) : cardOrId;
  const rarity = RARITIES[card.rarity];
  const el = document.createElement("div");
  el.className = `cc-card ${color}`;
  el.dataset.rarity = card.rarity;
  el.style.setProperty("--rarity-color", rarity.color);
  el.setAttribute("role", "img");
  el.setAttribute(
    "aria-label",
    `${card.name}, ${rarity.label}: top ${card.top}, right ${card.right}, bottom ${card.bottom}, left ${card.left}`
  );
  const gem = card.rarity === "normal" ? "" : `<span class="cc-gem" title="${rarity.label}"></span>`;
  el.innerHTML = `
    ${gem}
    <span class="cc-num cc-top">${card.top}</span>
    <span class="cc-num cc-left">${card.left}</span>
    <span class="cc-face"><span class="cc-icon">${escapeHtml(card.icon)}</span><span class="cc-name">${escapeHtml(card.name)}</span></span>
    <span class="cc-num cc-right">${card.right}</span>
    <span class="cc-num cc-bottom">${card.bottom}</span>
  `;
  return el;
}
