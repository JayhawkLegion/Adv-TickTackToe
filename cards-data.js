// Card Clash shared code: the card pool, rarity chances, the flip rule, saved
// player profiles and card rendering. Loaded by every Card Clash page, after
// cards-pool.js (the built-in cards, BUILT_IN_CARDS).

const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
const RARITIES = {
  common: { label: "Common", color: "#9a9cb5" },
  rare: { label: "Rare", color: "#2dd4bf" },
  epic: { label: "Epic", color: "#c084fc" },
  legendary: { label: "Legendary", color: "#f59e0b" },
};
// Chance (%) that a randomly drawn card is of each rarity. Adjustable in the
// Card Builder; must add up to 100.
const DEFAULT_RARITY_CHANCES = { common: 70, rare: 20, epic: 8, legendary: 2 };

const SIDES = ["top", "right", "bottom", "left"];
const HAND_SIZE = 5;
const STARTER_SIZE = 5;
const MAX_DECKS = 20;
const DECK_NAME_LENGTH = 20;

// Coins: every game pays out by result, and coins buy card packs. New
// players (and players from before coins existed) start with enough for
// one pack.
const STARTING_COINS = 100;
const COIN_REWARDS = { win: 30, draw: 15, loss: 10 };

// Card packs. Each card in a pack rolls its rarity with the pack's own odds
// (%), separate from the chances used for starter cards and the computer's
// hand, then picks a card of that rarity at random. Name, price, size and
// odds can be changed in the Card Builder (saved with the pool); PACKS holds
// the current settings.
const DEFAULT_PACKS = [
  { id: "standard", name: "Standard Pack", price: 100, size: 3, odds: { common: 65, rare: 27, epic: 6, legendary: 2 } },
];
const PACK_LIMITS = { nameLength: 24, maxPrice: 100000, maxSize: 10 };
const HISTORY_LIMIT = 20;
const CARD_SAVE_KEY = "cardClashSave";
const POOL_SAVE_KEY = "cardClashPool";
const BUILT_IN_BY_ID = Object.fromEntries(BUILT_IN_CARDS.map((card) => [card.id, card]));

let CARD_POOL;
let CARDS_BY_ID;
let RARITY_CHANCES;
let PACKS;

function isValidCard(card) {
  return Boolean(
    card &&
      typeof card.id === "string" && card.id &&
      typeof card.name === "string" && card.name.trim() &&
      typeof card.icon === "string" && card.icon.trim() &&
      RARITIES[card.rarity] &&
      Number.isInteger(card.no) && card.no > 0 &&
      (card.set === undefined || typeof card.set === "string") &&
      SIDES.every((side) => Number.isInteger(card[side]) && card[side] >= 1 && card[side] <= 10)
  );
}

// Only the fields a card is made of, so nothing else ends up in saves.
function cleanCard(card) {
  const { no, id, name, icon, rarity, set, left, top, right, bottom } = card;
  return { no, id, name, icon, rarity, ...(set ? { set } : {}), left, top, right, bottom };
}

// Cards with no set, or one that doesn't exist, are listed under "Other".
const OTHER_SET = { id: "other", name: "Other", icon: "✨" };
const SETS_BY_ID = Object.fromEntries(CARD_SETS.map((set) => [set.id, set]));

function cardSet(card) {
  return SETS_BY_ID[card.set] || OTHER_SET;
}

// Built-in cards used to have animal-name ids ("dog"); they're now based on
// rarity and sides (LEGACY_CARD_IDS in cards-pool.js maps old to new).
function upgradeId(id) {
  return LEGACY_CARD_IDS[id] || id;
}

// Brings a saved or imported card up to date: old built-in ids, and "Common"
// was called "normal" before.
function upgradeCard(card) {
  if (!card || typeof card !== "object") return card;
  return { ...card, id: upgradeId(card.id), rarity: card.rarity === "normal" ? "common" : card.rarity };
}

function upgradeChances(chances) {
  if (!chances || !("normal" in chances) || "common" in chances) return chances;
  const { normal, ...rest } = chances;
  return { common: normal, ...rest };
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

function isValidPack(pack) {
  return Boolean(
    pack &&
      typeof pack.id === "string" &&
      typeof pack.name === "string" && pack.name.trim() && pack.name.trim().length <= PACK_LIMITS.nameLength &&
      Number.isInteger(pack.price) && pack.price >= 1 && pack.price <= PACK_LIMITS.maxPrice &&
      Number.isInteger(pack.size) && pack.size >= 1 && pack.size <= PACK_LIMITS.maxSize &&
      isValidChances(pack.odds)
  );
}

function cleanPack(pack) {
  const { id, name, price, size, odds } = pack;
  return { id, name: name.trim(), price, size, odds: Object.fromEntries(RARITY_ORDER.map((r) => [r, odds[r]])) };
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

// Built-in cards, overridden or extended by the saved cards. An edited
// built-in card keeps its number; a custom card whose number is taken by
// another card (e.g. after new built-in cards were added) moves to the next
// free number.
function applyPool(savedCards, chances, packs) {
  const byId = Object.fromEntries(BUILT_IN_CARDS.map((card) => [card.id, { ...card }]));
  const custom = [];
  (savedCards || []).map(upgradeCard).filter(isValidCard).map(cleanCard).forEach((card) => {
    const builtIn = BUILT_IN_BY_ID[card.id];
    // Edits saved before sets existed keep the built-in card's set.
    if (builtIn) byId[card.id] = { ...card, no: builtIn.no, set: card.set || builtIn.set };
    else custom.push(card);
  });
  const used = new Set(Object.values(byId).map((card) => card.no));
  custom.sort((a, b) => a.no - b.no).forEach((card) => {
    if (used.has(card.no)) card.no = Math.max(...used) + 1;
    used.add(card.no);
    byId[card.id] = card;
  });
  CARD_POOL = Object.values(byId).sort((a, b) => a.no - b.no);
  CARDS_BY_ID = Object.fromEntries(CARD_POOL.map((card) => [card.id, card]));
  chances = upgradeChances(chances);
  RARITY_CHANCES = isValidChances(chances) ? { ...chances } : { ...DEFAULT_RARITY_CHANCES };
  // A saved pack replaces the default with the same id; invalid ones are ignored.
  PACKS = DEFAULT_PACKS.map((def) => {
    const saved = (packs || []).find((p) => p && p.id === def.id);
    return isValidPack(saved) ? cleanPack(saved) : cleanPack(def);
  });
}

// Saves only custom cards and edited built-in cards, so later changes to the
// built-in list still reach players who never edited those cards.
function savePool(pool, chances, packs = PACKS) {
  const cards = pool.filter((card) => !BUILT_IN_BY_ID[card.id] || !sameCard(card, BUILT_IN_BY_ID[card.id]));
  localStorage.setItem(POOL_SAVE_KEY, JSON.stringify({ cards: cards.map(cleanCard), chances, packs: packs.map(cleanPack) }));
  applyPool(cards, chances, packs);
}

function loadPool() {
  const saved = loadPoolSave();
  applyPool(saved.cards, saved.chances, saved.packs);
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

// One decimal place, or two significant digits for small shares (0.047%).
function formatPct(n) {
  return `${Number(n >= 1 || n === 0 ? n.toFixed(1) : n.toPrecision(2))}%`;
}

function randomRarity(odds = RARITY_CHANCES) {
  const chances = effectiveChances(odds);
  const live = RARITY_ORDER.filter((r) => chances[r] > 0);
  let roll = Math.random() * 100;
  for (const r of live) {
    roll -= chances[r];
    if (roll < 0) return r;
  }
  return live[live.length - 1];
}

// Each draw rolls a rarity by its chance (the Card Builder's rarity chances
// unless other odds are given, e.g. a pack's), then picks a card of that
// rarity at random. Draws are independent, so duplicates are possible.
function randomCards(count, odds = RARITY_CHANCES) {
  return Array.from({ length: count }, () => {
    const rarity = randomRarity(odds);
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

// Places `cardId` for `color` and flips the opponent cards it beats. Each
// board slot records its current color and the color it was played as.
// Returns the flipped slots.
function placeCard(board, index, cardId, color) {
  const flips = findFlips(board, index, cardId, color);
  board[index] = { cardId, color, startColor: color };
  flips.forEach((i) => {
    board[i].color = color;
  });
  return flips;
}

function colorCount(board, color) {
  return board.filter((slot) => slot && slot.color === color).length;
}

// The computer player. "smart" (what the game's opponent uses) takes the move
// that flips the most cards right now, choosing randomly between equally good
// moves; "random" plays any open square with any card.
// Returns { handIndex, slot }.
const PLAY_STYLES = { smart: "Smart", random: "Random" };

function chooseMove(board, hand, color, style = "smart") {
  const moves = [];
  hand.forEach((cardId, handIndex) => {
    board.forEach((taken, slot) => {
      if (taken) return;
      const flips = style === "smart" ? findFlips(board, slot, cardId, color).length : 0;
      moves.push({ handIndex, slot, flips });
    });
  });
  const best = Math.max(...moves.map((m) => m.flips));
  const { handIndex, slot } = randomItem(moves.filter((m) => m.flips === best));
  return { handIndex, slot };
}

// --- Saved players ---
// Shape: { currentPlayerId, players: { [id]: player } } so more users can be
// added later. Each player owns a collection of card instances (duplicates
// allowed), their last chosen hand, stats, recent game history, and a
// pending card claim if they won but haven't picked their reward yet.
function emptyStats() {
  return {
    played: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, cardsClaimed: 0, flipsMade: 0,
    coinsEarned: 0, coinsSpent: 0, packsOpened: 0,
  };
}

function newId(prefix) {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeOwnedCard(cardId, source) {
  return { uid: newId("c_"), cardId, source, acquiredAt: Date.now() };
}

function normalizePlayer(player) {
  player.stats = { ...emptyStats(), ...player.stats };
  if (!Number.isFinite(player.coins)) player.coins = STARTING_COINS;
  player.cardStats = player.cardStats || {};
  player.decks = Array.isArray(player.decks)
    ? player.decks.filter((d) => d && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.uids))
    : [];
  player.collection = player.collection || [];
  player.collection.forEach((owned) => {
    owned.cardId = upgradeId(owned.cardId);
  });
  player.lastHand = player.lastHand || [];
  player.history = player.history || [];
  // Games saved before draws existed stored `won: true/false`.
  player.history.forEach((h) => {
    if (!h.result) h.result = h.won ? "win" : "loss";
    delete h.won;
    if (h.claimed) h.claimed = upgradeId(h.claimed);
  });
  if (player.pendingClaim) {
    player.pendingClaim.options = (player.pendingClaim.options || []).map(upgradeId).filter(getCard);
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
    coins: STARTING_COINS,
    cardStats: {},
    decks: [],
    lastHand: [],
    stats: emptyStats(),
    history: [],
    pendingClaim: null,
  };
  data.players[player.id] = player;
  data.currentPlayerId = player.id;
  return player;
}

// --- Saved decks ---
// A deck is a named set of 5 owned card copies (by uid) to play with later:
// { id, name, uids, createdAt, updatedAt }.

// The deck's card ids, or null if any of its copies is no longer playable.
function deckCardIds(player, deck) {
  const byUid = Object.fromEntries(playableCollection(player).map((owned) => [owned.uid, owned.cardId]));
  const ids = deck.uids.map((uid) => byUid[uid]);
  return ids.length === HAND_SIZE && ids.every(Boolean) ? ids : null;
}

function nextDeckName(player) {
  let n = player.decks.length + 1;
  while (player.decks.some((d) => d.name === `Deck ${n}`)) n++;
  return `Deck ${n}`;
}

// Creates a deck, or updates the one with `id`. Returns the deck, or null if
// the cards aren't 5 different owned copies or the deck limit is reached.
// The caller saves.
function saveDeck(player, { id, name, uids }) {
  const owned = new Set(playableCollection(player).map((o) => o.uid));
  if (uids.length !== HAND_SIZE || new Set(uids).size !== HAND_SIZE || !uids.every((u) => owned.has(u))) return null;
  const clean = name.trim().replace(/\s+/g, " ").slice(0, DECK_NAME_LENGTH);
  const existing = id && player.decks.find((d) => d.id === id);
  if (existing) {
    existing.name = clean || existing.name;
    existing.uids = [...uids];
    existing.updatedAt = Date.now();
    return existing;
  }
  if (player.decks.length >= MAX_DECKS) return null;
  const deck = { id: newId("d_"), name: clean || nextDeckName(player), uids: [...uids], createdAt: Date.now() };
  player.decks.push(deck);
  return deck;
}

function deleteDeck(player, id) {
  player.decks = player.decks.filter((d) => d.id !== id);
  if (player.lastDeckId === id) player.lastDeckId = null;
}

// Per-card record of the games a card was in the player's hand:
// { played, win, loss, draw }. A card twice in one hand counts once.
function recordCardUse(player, cardIds, result) {
  [...new Set(cardIds)].forEach((id) => {
    const stats = (player.cardStats[id] = player.cardStats[id] || { played: 0, win: 0, loss: 0, draw: 0 });
    stats.played++;
    stats[result]++;
  });
}

function cardTotal(card) {
  return SIDES.reduce((sum, side) => sum + card[side], 0);
}

// Pays a game's coins to the player; returns the amount.
function awardCoins(player, result) {
  const coins = COIN_REWARDS[result] || 0;
  player.coins += coins;
  player.stats.coinsEarned += coins;
  return coins;
}

// Buys and opens a pack: takes its price from the player's coins and adds
// its cards to their collection. Returns the drawn card ids, each marked
// `isNew` if the player had no copy before (only the first copy counts), or
// null if they can't afford it. The caller saves.
function openPack(player, pack) {
  if (player.coins < pack.price) return null;
  const ownedBefore = new Set(player.collection.map((owned) => owned.cardId));
  const cardIds = randomCards(pack.size, pack.odds);
  player.coins -= pack.price;
  player.stats.coinsSpent += pack.price;
  player.stats.packsOpened++;
  return cardIds.map((cardId) => {
    const isNew = !ownedBefore.has(cardId);
    ownedBefore.add(cardId);
    player.collection.push(makeOwnedCard(cardId, "pack"));
    return { cardId, isNew };
  });
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
// Neutral cards show their rarity as the border color; every card above
// common also gets a rarity gem in its top-left corner.
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
  const gem = card.rarity === "common" ? "" : `<span class="cc-gem" title="${rarity.label}"></span>`;
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
