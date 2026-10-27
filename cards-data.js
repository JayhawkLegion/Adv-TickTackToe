// Card Clash browser code shared by every page: the card pool in use, this
// device's saves, and card rendering. The rules themselves (flips, scoring,
// rewards, packs, strikes) are in cards-rules.js as CardRules, which the
// server runs too. Loaded after cards-pool.js and cards-rules.js.
const {
  RARITY_ORDER, RARITIES, DEFAULT_RARITY_CHANCES, SIDES, HAND_SIZE, STARTER_SIZE, MAX_DECKS, DECK_NAME_LENGTH,
  HISTORY_LIMIT, STARTING_COINS, COIN_REWARDS, STRIKES_TO_LOSE, TURN_SECONDS, MAX_TIMEOUTS, SCORING, DEFAULT_PACKS,
  PACK_LIMITS, CPU_NAMES, PLAY_STYLES, BUILT_IN_BY_ID, OTHER_SET, SETS_BY_ID,
  isValidCard, cleanCard, sameCard, upgradeCard, upgradeChances, chancesTotal, isValidChances, isValidPack,
  cleanPack, cardSet, cardTotal, randomItem, colorCount, otherSeat, emptyStats, cleanName,
} = CardRules;

const CARD_SAVE_KEY = "cardClashSave";
const POOL_SAVE_KEY = "cardClashPool";

// --- The card pool ---
// POOL is what CardRules functions take; the others are its parts, kept as
// globals for the pages. Offline it's this browser's Card Builder pool;
// signed in, the online pool (applied by cards-online.js).
let POOL;
let CARD_POOL;
let CARDS_BY_ID;
let RARITY_CHANCES;
let PACKS;

function applyPool(savedCards, chances, packs) {
  POOL = CardRules.buildPool(savedCards, chances, packs);
  CARD_POOL = POOL.cards;
  CARDS_BY_ID = POOL.byId;
  RARITY_CHANCES = POOL.chances;
  PACKS = POOL.packs;
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

function loadPool() {
  const saved = loadPoolSave();
  applyPool(saved.cards, saved.chances, saved.packs);
}

loadPool();

// Saves the Card Builder's pool: in this browser offline, or online for an
// admin (CardStore decides). It applies on this page right away; the
// returned promise settles when the save is done.
function savePool(cards, chances, packs = PACKS) {
  const data = CardRules.poolSaveData(cards, chances, packs);
  applyPool(data.cards, data.chances, data.packs);
  return CardStore.savePool(data);
}

function getCard(id) {
  return CARDS_BY_ID[id];
}

function nextCardNumber() {
  return Math.max(0, ...CARD_POOL.map((card) => card.no)) + 1;
}

// The real chance of each rarity right now: a tier with no cards in the pool
// can't be drawn, so its share is spread over the tiers that have cards.
function effectiveChances(chances = RARITY_CHANCES, cards = CARD_POOL) {
  return CardRules.effectiveChances(chances, cards);
}

// One decimal place, or two significant digits for small shares (0.047%).
function formatPct(n) {
  return `${Number(n >= 1 || n === 0 ? n.toFixed(1) : n.toPrecision(2))}%`;
}

function randomCards(count, odds = RARITY_CHANCES) {
  return CardRules.randomCards(POOL, count, odds);
}

// The rules on a bare board (the simulator and the game screen's previews).
function placeCard(board, index, cardId, color) {
  return CardRules.placeCard(POOL, board, index, cardId, color);
}

function findFlips(board, index, cardId, color) {
  return CardRules.findFlips(POOL, board, index, cardId, color);
}

function chooseMove(board, hand, color, style = "smart") {
  return CardRules.chooseMove(POOL, board, hand, color, style);
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// --- Profiles (the signed-in player's online profile, or this device's) ---
function playableCollection(profile) {
  return CardRules.playableCollection(POOL, profile);
}

function sortedCollection(profile) {
  return playableCollection(profile).sort(
    (a, b) => getCard(a.cardId).no - getCard(b.cardId).no || a.acquiredAt - b.acquiredAt
  );
}

// The deck's card ids, or null if any of its copies is no longer playable.
function deckCardIds(profile, deck) {
  return CardRules.deckCardIds(POOL, profile, deck);
}

function nextDeckName(profile) {
  return CardRules.nextDeckName(profile);
}

// Card ids the player owns at least one copy of.
function ownedCardIds(profile) {
  return new Set(profile.collection.map((owned) => owned.cardId));
}

// --- This device's saves ---
// { currentPlayerId, players: { [id]: profile } }, so more players could be
// added later. Used offline and when not signed in.
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
  Object.values(data.players).forEach((player) => {
    CardRules.normalizeProfile(player);
    // A claim for a card no longer in the pool can't be taken.
    if (player.pendingClaim) {
      player.pendingClaim.options = player.pendingClaim.options.filter(getCard);
      if (!player.pendingClaim.options.length) player.pendingClaim = null;
    }
  });
  return data;
}

function saveCardSave(data) {
  localStorage.setItem(CARD_SAVE_KEY, JSON.stringify(data));
}

function getCurrentPlayer(data) {
  return data.players[data.currentPlayerId] || null;
}

// --- Rendering ---
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

// `cardOrId` is a card id or a card object (the Card Builder previews unsaved
// cards). color: "red" | "blue" for a card in play, "neutral" otherwise.
// Neutral cards show their rarity as the border color; every card above
// common also gets a rarity gem in its top-left corner. `strikes` (an owned
// copy's) shows as marks along the bottom edge.
function createCardEl(cardOrId, color = "neutral", strikes = 0) {
  const card = typeof cardOrId === "string" ? getCard(cardOrId) : cardOrId;
  const rarity = RARITIES[card.rarity];
  const el = document.createElement("div");
  el.className = `cc-card ${color}`;
  el.dataset.rarity = card.rarity;
  el.style.setProperty("--rarity-color", rarity.color);
  el.setAttribute("role", "img");
  const struck = strikes ? `, ${strikeText(strikes)}` : "";
  el.setAttribute(
    "aria-label",
    `${card.name}, ${rarity.label}: top ${card.top}, right ${card.right}, bottom ${card.bottom}, left ${card.left}${struck}`
  );
  const gem = card.rarity === "common" ? "" : `<span class="cc-gem" title="${rarity.label}"></span>`;
  el.innerHTML = `
    ${gem}
    <span class="cc-num cc-top">${card.top}</span>
    <span class="cc-num cc-left">${card.left}</span>
    <span class="cc-face"><span class="cc-icon">${escapeHtml(card.icon)}</span><span class="cc-name">${escapeHtml(card.name)}</span></span>
    <span class="cc-num cc-right">${card.right}</span>
    <span class="cc-num cc-bottom">${card.bottom}</span>
  `;
  if (strikes) el.appendChild(strikeMarksEl(strikes));
  return el;
}

function strikeText(strikes) {
  return `${strikes} of ${STRIKES_TO_LOSE} strikes`;
}

// One mark per strike, out of STRIKES_TO_LOSE.
function strikeMarksEl(strikes) {
  const marks = document.createElement("span");
  marks.className = "cc-strikes";
  marks.title = strikeText(strikes);
  for (let i = 0; i < STRIKES_TO_LOSE; i++) {
    const mark = document.createElement("span");
    mark.className = i < strikes ? "cc-strike on" : "cc-strike";
    marks.appendChild(mark);
  }
  return marks;
}

// The "NEW" tag for a card the player has no copy of yet. Its parent needs
// position: relative.
function newBadgeEl() {
  const badge = document.createElement("span");
  badge.className = "cc-new-badge";
  badge.textContent = "NEW";
  return badge;
}

// "3 coins for a win and 1 for a loss" for a game mode ("cpu" or "live"). Scoring
// by the board alone (9 squares) can't tie, so draws only show otherwise.
function rewardText(mode) {
  const r = COIN_REWARDS[mode];
  return SCORING === "board"
    ? `${r.win} coins for a win and ${r.loss} for a loss`
    : `${r.win} coins for a win, ${r.draw} for a draw and ${r.loss} for a loss`;
}

// 75 → "1:15"
function formatClock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
