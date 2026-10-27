// Card Clash rules, shared by the browser and the server (Cloud Functions), so
// both play by exactly the same code. Nothing here touches the page or
// storage: the card pool, randomness (rng) and id maker are passed in.
//
// In the browser this is a plain script that defines the global CardRules,
// loaded after cards-pool.js; in Node it's a module (require) that loads
// cards-pool.js itself.
const CardRules = (() => {
  const POOL_DATA = typeof BUILT_IN_CARDS !== "undefined"
    ? { BUILT_IN_CARDS, CARD_SETS, LEGACY_CARD_IDS }
    : require("./cards-pool.js");

  const RARITY_ORDER = ["common", "rare", "epic", "legendary"];
  const RARITIES = {
    common: { label: "Common", color: "#9a9cb5" },
    rare: { label: "Rare", color: "#2dd4bf" },
    epic: { label: "Epic", color: "#c084fc" },
    legendary: { label: "Legendary", color: "#f59e0b" },
  };
  // Chance (%) that a randomly drawn card (new players' starter cards) is of
  // each rarity. Adjustable in the Card Builder; totals 100. Epics come from
  // the Apex Pack (and from beating players who own them), so random draws
  // are common and rare only. The computer's hand copies the player's cards
  // instead (cpuHand).
  const DEFAULT_RARITY_CHANCES = { common: 78, rare: 22, epic: 0, legendary: 0 };

  const SIDES = ["top", "right", "bottom", "left"];
  const HAND_SIZE = 5;
  const STARTER_SIZE = 5;
  const MAX_DECKS = 20;
  const DECK_NAME_LENGTH = 20;
  const NAME_LENGTH = 20;
  const HISTORY_LIMIT = 20;

  // Coins: new players start with enough for one pack; every game pays out
  // by result, much more against live players than against the computer.
  const STARTING_COINS = 100;
  const COIN_REWARDS = {
    cpu: { win: 3, draw: 2, loss: 1 },
    live: { win: 30, draw: 15, loss: 10 },
  };

  // Strikes (live games only): a card of the losing player that ends the game
  // in the winner's color gets a strike; at 3 strikes that copy is removed.
  const STRIKES_TO_LOSE = 3;

  // Live games: seconds per turn. When time runs out the computer plays a
  // move for that player; two timeouts in a row forfeit the game.
  const TURN_SECONDS = 60;
  const MAX_TIMEOUTS = 2;

  // Scoring: the cards in your color on the board, out of 9, so there's
  // always a winner. (Counting the second player's unplayed card as well
  // turned the first player's 5-4 wins into draws: in simulation the first
  // player won 24% and the second 46%; board only is 54% / 46%.)
  const SCORING = "board";

  // Card packs: each card rolls its rarity with the pack's own odds. The
  // Standard Pack is common and rare only; the Apex Pack adds a 20% epic
  // chance per card, keeping the Standard Pack's 70:30 common-to-rare mix
  // for the rest.
  const DEFAULT_PACKS = [
    { id: "standard", name: "Standard Pack", price: 100, size: 3, odds: { common: 70, rare: 30, epic: 0, legendary: 0 } },
    { id: "apex", name: "Apex Pack", price: 500, size: 5, odds: { common: 56, rare: 24, epic: 20, legendary: 0 } },
  ];
  const PACK_LIMITS = { nameLength: 24, maxPrice: 100000, maxSize: 10 };

  // Upgrades: duplicates of a card can be spent to raise one side of one copy
  // by 1. Each side can be raised once, up to UPGRADE_MAX upgrades per copy;
  // the nth upgrade uses UPGRADE_COSTS[n - 1] duplicates. An upgrade belongs
  // to that copy alone: a lost copy loses it, and a claimed card is always
  // plain.
  const UPGRADE_MAX = 3;
  const UPGRADE_COSTS = [1, 2, 3];
  const SIDE_LIMIT = 10;

  // Experience: every finished game earns XP (none for a game you resign or
  // forfeit). Going from level n to n + 1 takes LEVEL_XP_STEP × n XP, so
  // levels come more slowly as they rise.
  const XP_REWARDS = {
    cpu: { win: 10, draw: 7, loss: 5 },
    live: { win: 20, draw: 15, loss: 10 },
  };
  const LEVEL_XP_STEP = 50;
  const MAX_LEVEL = 50;

  // The computer's difficulty by the player's level: early levels it makes
  // mistakes (the chance of a random move instead of its best), then its
  // cards get upgrades: one more every CPU_LEVELS_PER_UPGRADE levels.
  const CPU_MISTAKES = [0.4, 0.3, 0.2, 0.1];
  const CPU_LEVELS_PER_UPGRADE = 2;
  // Its cards copy the rarity of the player's and total the same or up to
  // this much less, so a win never claims anything stronger than you brought.
  const CPU_MIRROR_RANGE = 2;

  // Find a Player pairs players whose levels and hand strength (the total of
  // the hand's numbers, upgrades included) are close; the allowed gaps widen
  // every MATCH_WIDEN_MS that either player has waited.
  const MATCH_LEVEL_GAP = 3;
  const MATCH_POWER_GAP = 8;
  const MATCH_WIDEN_MS = 10000;

  const CPU_NAMES = [
    "Robo Rex", "Captain Byte", "Pixel Pete", "Glitch", "Turbo Tess",
    "Sir Circuit", "Nova-9", "Chip", "Widget", "Bolt",
  ];
  const PLAY_STYLES = { smart: "Smart", random: "Random" };

  const { BUILT_IN_CARDS: BUILT_IN, CARD_SETS: SETS, LEGACY_CARD_IDS: LEGACY } = POOL_DATA;
  const BUILT_IN_BY_ID = Object.fromEntries(BUILT_IN.map((card) => [card.id, card]));
  const OTHER_SET = { id: "other", name: "Other", icon: "✨" };
  const SETS_BY_ID = Object.fromEntries(SETS.map((set) => [set.id, set]));

  // --- Cards and the pool ---
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

  function sameCard(a, b) {
    return JSON.stringify(cleanCard(a)) === JSON.stringify(cleanCard(b));
  }

  // Built-in cards used to have animal-name ids ("dog"), and "Common" was
  // called "normal".
  function upgradeId(id) {
    return LEGACY[id] || id;
  }

  function upgradeCard(card) {
    if (!card || typeof card !== "object") return card;
    return { ...card, id: upgradeId(card.id), rarity: card.rarity === "normal" ? "common" : card.rarity };
  }

  function upgradeChances(chances) {
    if (!chances || !("normal" in chances) || "common" in chances) return chances;
    const { normal, ...rest } = chances;
    return { common: normal, ...rest };
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

  // The playable pool: built-in cards, overridden or extended by the Card
  // Builder's saved cards, plus the rarity chances and pack settings. An
  // edited built-in card keeps its number; a custom card whose number is
  // taken moves to the next free one.
  function buildPool(savedCards, chances, packs) {
    const byId = Object.fromEntries(BUILT_IN.map((card) => [card.id, { ...card }]));
    const custom = [];
    (savedCards || []).map(upgradeCard).filter(isValidCard).map(cleanCard).forEach((card) => {
      const builtIn = BUILT_IN_BY_ID[card.id];
      if (builtIn) byId[card.id] = { ...card, no: builtIn.no, set: card.set || builtIn.set };
      else custom.push(card);
    });
    const used = new Set(Object.values(byId).map((card) => card.no));
    custom.sort((a, b) => a.no - b.no).forEach((card) => {
      if (used.has(card.no)) card.no = Math.max(...used) + 1;
      used.add(card.no);
      byId[card.id] = card;
    });
    const cards = Object.values(byId).sort((a, b) => a.no - b.no);
    const upgraded = upgradeChances(chances);
    return {
      cards,
      byId: Object.fromEntries(cards.map((card) => [card.id, card])),
      chances: isValidChances(upgraded) ? { ...upgraded } : { ...DEFAULT_RARITY_CHANCES },
      // A saved pack replaces the default with the same id; invalid ones are ignored.
      packs: DEFAULT_PACKS.map((def) => {
        const saved = (packs || []).find((p) => p && p.id === def.id);
        return isValidPack(saved) ? cleanPack(saved) : cleanPack(def);
      }),
    };
  }

  // What gets saved for a pool: only custom and edited built-in cards, so
  // later changes to the built-in list still reach everyone.
  function poolSaveData(cards, chances, packs) {
    return {
      cards: cards.filter((card) => !BUILT_IN_BY_ID[card.id] || !sameCard(card, BUILT_IN_BY_ID[card.id])).map(cleanCard),
      chances,
      packs: packs.map(cleanPack),
    };
  }

  function cardSet(card) {
    return SETS_BY_ID[card.set] || OTHER_SET;
  }

  function cardTotal(card) {
    return SIDES.reduce((sum, side) => sum + card[side], 0);
  }

  // --- Random draws ---
  function randomItem(list, rng = Math.random) {
    return list[Math.floor(rng() * list.length)];
  }

  // The real chance of each rarity: a rarity with no cards can't be drawn, so
  // its share is spread over the others.
  function effectiveChances(odds, cards) {
    const live = RARITY_ORDER.filter((r) => cards.some((card) => card.rarity === r));
    const total = live.reduce((sum, r) => sum + odds[r], 0);
    const result = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
    live.forEach((r) => {
      result[r] = total > 0 ? (odds[r] / total) * 100 : 100 / live.length;
    });
    return result;
  }

  function randomRarity(pool, odds, rng = Math.random) {
    const chances = effectiveChances(odds, pool.cards);
    const live = RARITY_ORDER.filter((r) => chances[r] > 0);
    let roll = rng() * 100;
    for (const r of live) {
      roll -= chances[r];
      if (roll < 0) return r;
    }
    return live[live.length - 1];
  }

  // Each draw rolls a rarity (with `odds`, the pool's rarity chances by
  // default), then picks a card of that rarity. Duplicates are possible.
  function randomCards(pool, count, odds = pool.chances, rng = Math.random) {
    return Array.from({ length: count }, () => {
      const rarity = randomRarity(pool, odds, rng);
      return randomItem(pool.cards.filter((card) => card.rarity === rarity), rng).id;
    });
  }

  // --- Board rules ---
  // Slots are indexed row * 3 + col. A placed card compares each side with
  // the facing side of its neighbour.
  const NEIGHBORS = [
    { dr: -1, dc: 0, side: "top", facing: "bottom" },
    { dr: 1, dc: 0, side: "bottom", facing: "top" },
    { dr: 0, dc: -1, side: "left", facing: "right" },
    { dr: 0, dc: 1, side: "right", facing: "left" },
  ];

  // A card's numbers with a copy's upgrades ({ top: 1 }) added.
  function sidesOf(pool, cardId, boost) {
    const card = pool.byId[cardId];
    if (!boost) return card;
    const sides = {};
    SIDES.forEach((side) => {
      sides[side] = card[side] + (boost[side] || 0);
    });
    return sides;
  }

  // Slots of opponent cards that flip when `cardId` (with `boost`, its
  // upgrades) is placed at `index` by `color`: each touching enemy card whose
  // facing number is lower.
  function findFlips(pool, board, index, cardId, color, boost) {
    const card = sidesOf(pool, cardId, boost);
    const row = Math.floor(index / 3);
    const col = index % 3;
    const flips = [];
    NEIGHBORS.forEach(({ dr, dc, side, facing }) => {
      const r = row + dr;
      const c = col + dc;
      if (r < 0 || r > 2 || c < 0 || c > 2) return;
      const other = board[r * 3 + c];
      if (!other || other.color === color) return;
      if (sidesOf(pool, other.cardId, other.boost)[facing] < card[side]) flips.push(r * 3 + c);
    });
    return flips;
  }

  // Places a card and flips what it beats. `extra` (who played it, its
  // upgrades as `boost`) is kept on the board slot. Returns the flipped slots.
  function placeCard(pool, board, index, cardId, color, extra = {}) {
    const flips = findFlips(pool, board, index, cardId, color, extra.boost);
    board[index] = { cardId, color, startColor: color, ...extra };
    flips.forEach((i) => {
      board[i].color = color;
    });
    return flips;
  }

  function colorCount(board, color) {
    return board.filter((slot) => slot && slot.color === color).length;
  }

  // The computer player. "smart" (the game's opponent) takes the move that
  // flips the most cards now, choosing randomly between equals; "random"
  // plays any open square. With `mistakes` (0-1) a smart player sometimes
  // plays at random. `hand` lists card ids or { cardId, boost }. Returns
  // { handIndex, slot }.
  function chooseMove(pool, board, hand, color, style = "smart", rng = Math.random, mistakes = 0) {
    const smart = style === "smart" && !(mistakes > 0 && rng() < mistakes);
    const moves = [];
    hand.forEach((entry, handIndex) => {
      const { cardId, boost } = typeof entry === "string" ? { cardId: entry } : entry;
      board.forEach((taken, slot) => {
        if (taken) return;
        const flips = smart ? findFlips(pool, board, slot, cardId, color, boost).length : 0;
        moves.push({ handIndex, slot, flips });
      });
    });
    const best = Math.max(...moves.map((m) => m.flips));
    const { handIndex, slot } = randomItem(moves.filter((m) => m.flips === best), rng);
    return { handIndex, slot };
  }

  // Each color's score for a finished (or forfeited) board.
  function scoreBoard(board, hands, colors) {
    const scores = {};
    Object.keys(colors).forEach((seat) => {
      scores[seat] = colorCount(board, colors[seat]) + (SCORING === "board" ? 0 : hands[seat].length);
    });
    return scores;
  }

  // --- Matches ---
  // A match between seats "a" and "b". Seat b is the computer ("cpu") in
  // games against the computer. The full state holds both hands; players
  // only ever see publicMatch() plus their own hand.
  //
  // { id, mode: "cpu"|"live", status: "active"|"finished",
  //   seats: { a: { uid, name }, b: { uid, name } }, colors: { a, b },
  //   first, turn, board: [9 × null | { cardId, color, startColor, seat, copyUid }],
  //   hands: { a: [{ uid, cardId }], b }, startHands, moves: [{ seat, slot, cardId, flips, auto }],
  //   timeouts: { a, b }, turnDeadline, result, createdAt, updatedAt }
  function otherSeat(seat) {
    return seat === "a" ? "b" : "a";
  }

  // `cpu` is the computer's difficulty (cpuDifficulty) in games against it.
  function newMatch({ id, mode, a, b, cpu = null, rng = Math.random, now = Date.now() }) {
    const first = rng() < 0.5 ? "a" : "b";
    const state = {
      id,
      mode,
      status: "active",
      seats: { a: { uid: a.uid, name: a.name }, b: { uid: b.uid, name: b.name } },
      colors: { [first]: "red", [otherSeat(first)]: "blue" },
      first,
      turn: first,
      board: Array(9).fill(null),
      hands: { a: a.hand.map((c) => ({ ...c })), b: b.hand.map((c) => ({ ...c })) },
      startHands: { a: a.hand.map((c) => c.cardId), b: b.hand.map((c) => c.cardId) },
      moves: [],
      timeouts: { a: 0, b: 0 },
      cpu,
      turnDeadline: null,
      result: null,
      createdAt: now,
      updatedAt: now,
    };
    setDeadline(state, now);
    return state;
  }

  function isCpuSeat(state, seat) {
    return state.seats[seat].uid === "cpu";
  }

  function setDeadline(state, now) {
    state.turnDeadline = state.mode === "live" && state.status === "active" ? now + TURN_SECONDS * 1000 : null;
  }

  // Plays the card `copyUid` from `seat`'s hand on `slot`. Returns
  // { ok: true, move } or { ok: false, error }.
  function playMove(pool, state, seat, copyUid, slot, { now = Date.now(), auto = false } = {}) {
    if (state.status !== "active") return { ok: false, error: "The game is over." };
    if (state.turn !== seat) return { ok: false, error: "It's not your turn." };
    if (!Number.isInteger(slot) || slot < 0 || slot > 8 || state.board[slot]) {
      return { ok: false, error: "That square isn't free." };
    }
    const handIndex = state.hands[seat].findIndex((c) => c.uid === copyUid);
    if (handIndex === -1) return { ok: false, error: "That card isn't in your hand." };
    const [card] = state.hands[seat].splice(handIndex, 1);
    const color = state.colors[seat];
    const boost = card.boost ? { boost: card.boost } : {};
    const flips = placeCard(pool, state.board, slot, card.cardId, color, { seat, copyUid: card.uid, ...boost });
    const move = { seat, slot, cardId: card.cardId, flips, ...boost, ...(auto ? { auto: true } : {}) };
    state.moves.push(move);
    if (!auto) state.timeouts[seat] = 0;
    state.updatedAt = now;
    if (state.board.every(Boolean)) finishByBoard(state, now);
    else {
      state.turn = otherSeat(seat);
      setDeadline(state, now);
    }
    return { ok: true, move };
  }

  // The computer chooses and plays a move for `seat`: the computer's own turn
  // (with its difficulty's mistakes), or a player who ran out of time.
  function autoMove(pool, state, seat, { now = Date.now(), rng = Math.random, auto = false } = {}) {
    const hand = state.hands[seat];
    const mistakes = !auto && isCpuSeat(state, seat) && state.cpu ? state.cpu.mistakes : 0;
    const { handIndex, slot } = chooseMove(pool, state.board, hand, state.colors[seat], "smart", rng, mistakes);
    return playMove(pool, state, seat, hand[handIndex].uid, slot, { now, auto });
  }

  // Plays the computer's turns until it's a person's turn or the game ends.
  function runCpuTurns(pool, state, opts = {}) {
    while (state.status === "active" && isCpuSeat(state, state.turn)) autoMove(pool, state, state.turn, opts);
  }

  // A live game whose turn clock ran out: the computer moves for the player;
  // their second timeout in a row forfeits. Returns true if anything changed.
  function handleTimeout(pool, state, { now = Date.now(), rng = Math.random } = {}) {
    if (state.status !== "active" || state.mode !== "live" || !state.turnDeadline || now < state.turnDeadline) return false;
    const seat = state.turn;
    state.timeouts[seat]++;
    if (state.timeouts[seat] >= MAX_TIMEOUTS) {
      forfeit(state, seat, "timeout", now);
      return true;
    }
    autoMove(pool, state, seat, { now, rng, auto: true });
    return true;
  }

  function forfeit(state, seat, reason = "resign", now = Date.now()) {
    if (state.status !== "active") return false;
    const winner = otherSeat(seat);
    state.status = "finished";
    state.turn = null;
    state.turnDeadline = null;
    state.result = { winner, scores: scoreBoard(state.board, state.hands, state.colors), reason, forfeiter: seat };
    state.updatedAt = now;
    return true;
  }

  function finishByBoard(state, now) {
    const scores = scoreBoard(state.board, state.hands, state.colors);
    let winner = null;
    if (scores.a > scores.b) winner = "a";
    else if (scores.b > scores.a) winner = "b";
    state.status = "finished";
    state.turn = null;
    state.turnDeadline = null;
    state.result = { winner, scores, reason: "board" };
    state.updatedAt = now;
  }

  function resultFor(state, seat) {
    if (!state.result) return null;
    if (state.result.winner === null) return "draw";
    return state.result.winner === seat ? "win" : "loss";
  }

  // What both players may see: everything except the hands (just their sizes).
  function publicMatch(state) {
    const { hands, startHands, ...rest } = state;
    return { ...rest, handCounts: { a: hands.a.length, b: hands.b.length } };
  }

  // --- Profiles ---
  // { name, coins, collection: [{ uid, cardId, source, acquiredAt, strikes }],
  //   stats, cardStats, history, pendingClaim, decks, lastHand, lastDeckId }
  function emptyStats() {
    return {
      played: 0, wins: 0, losses: 0, draws: 0, currentStreak: 0, bestStreak: 0, cardsClaimed: 0, flipsMade: 0,
      coinsEarned: 0, coinsSpent: 0, packsOpened: 0, cardsLost: 0, upgrades: 0,
    };
  }

  function cleanName(raw) {
    return String(raw || "").trim().replace(/\s+/g, " ").slice(0, NAME_LENGTH) || "Player";
  }

  function makeOwnedCard(cardId, source, newId, now = Date.now()) {
    return { uid: newId("c_"), cardId, source, acquiredAt: now, strikes: 0 };
  }

  function newProfile(pool, { name, newId, rng = Math.random, now = Date.now() }) {
    return {
      name: cleanName(name),
      createdAt: now,
      coins: STARTING_COINS,
      xp: 0,
      collection: randomCards(pool, STARTER_SIZE, pool.chances, rng).map((cardId) => makeOwnedCard(cardId, "starter", newId, now)),
      stats: emptyStats(),
      cardStats: {},
      history: [],
      pendingClaim: null,
      decks: [],
      lastHand: [],
      lastDeckId: null,
    };
  }

  // Fills in anything an older save is missing; returns the profile.
  function normalizeProfile(profile) {
    profile.stats = { ...emptyStats(), ...profile.stats };
    if (!Number.isFinite(profile.coins)) profile.coins = STARTING_COINS;
    // Players from before experience existed get XP for the games they'd
    // played, as if against the computer.
    if (!Number.isFinite(profile.xp)) {
      const { wins, losses, draws } = profile.stats;
      profile.xp = wins * XP_REWARDS.cpu.win + losses * XP_REWARDS.cpu.loss + draws * XP_REWARDS.cpu.draw;
    }
    profile.cardStats = profile.cardStats || {};
    profile.decks = Array.isArray(profile.decks)
      ? profile.decks.filter((d) => d && typeof d.id === "string" && typeof d.name === "string" && Array.isArray(d.uids))
      : [];
    profile.collection = Array.isArray(profile.collection) ? profile.collection : [];
    profile.collection.forEach((owned) => {
      owned.cardId = upgradeId(owned.cardId);
      if (!Number.isInteger(owned.strikes)) owned.strikes = 0;
    });
    profile.lastHand = Array.isArray(profile.lastHand) ? profile.lastHand : [];
    profile.history = Array.isArray(profile.history) ? profile.history : [];
    profile.history.forEach((h) => {
      if (!h.result) h.result = h.won ? "win" : "loss";
      delete h.won;
      if (h.claimed) h.claimed = upgradeId(h.claimed);
    });
    if (profile.pendingClaim) {
      profile.pendingClaim.options = (profile.pendingClaim.options || []).map(upgradeId);
      if (!profile.pendingClaim.options.length) profile.pendingClaim = null;
    }
    return profile;
  }

  // Owned copies whose card exists in the pool (unknown ones stay saved).
  function playableCollection(pool, profile) {
    return profile.collection.filter((owned) => Object.hasOwn(pool.byId, owned.cardId));
  }

  // A hand of 5 different playable copies the player owns, as
  // [{ uid, cardId, boost? }], or null.
  function validateHand(pool, profile, uids) {
    if (!Array.isArray(uids) || uids.length !== HAND_SIZE || new Set(uids).size !== HAND_SIZE) return null;
    const byUid = new Map(playableCollection(pool, profile).map((o) => [o.uid, o]));
    if (!uids.every((uid) => byUid.has(uid))) return null;
    return uids.map((uid) => {
      const owned = byUid.get(uid);
      return { uid, cardId: owned.cardId, ...(upgradesOf(owned) ? { boost: { ...owned.boost } } : {}) };
    });
  }

  // The total of a hand's numbers, upgrades included.
  function handPower(pool, hand) {
    return hand.reduce((sum, c) => sum + cardTotal(sidesOf(pool, c.cardId, c.boost)), 0);
  }

  // --- Upgrades ---
  function upgradesOf(copy) {
    return copy.boost ? Object.values(copy.boost).reduce((sum, n) => sum + n, 0) : 0;
  }

  // Why `side` of a copy ({ cardId, boost }) can't be raised, or "".
  function raiseProblem(pool, copy, side) {
    if (!SIDES.includes(side)) return "Pick a side to upgrade.";
    if (upgradesOf(copy) >= UPGRADE_MAX) return `This copy already has all ${UPGRADE_MAX} upgrades.`;
    if (copy.boost && copy.boost[side]) return "That side has already been upgraded.";
    if (sidesOf(pool, copy.cardId, copy.boost)[side] >= SIDE_LIMIT) return `That side is already ${SIDE_LIMIT}.`;
    return "";
  }

  // Duplicates the next upgrade of `copy` uses, or null at the limit.
  function upgradeCost(copy) {
    return UPGRADE_COSTS[upgradesOf(copy)] ?? null;
  }

  // The player's spare copies of the same card that an upgrade of `copy` can
  // use, best to give up first: plain copies only, those outside saved decks
  // first, then the most struck, then the newest.
  function upgradeFodder(profile, copy) {
    const inDecks = new Set(profile.decks.flatMap((d) => d.uids));
    return profile.collection
      .filter((o) => o.uid !== copy.uid && o.cardId === copy.cardId && !upgradesOf(o))
      .sort((a, b) => inDecks.has(a.uid) - inDecks.has(b.uid) || (b.strikes || 0) - (a.strikes || 0) || b.acquiredAt - a.acquiredAt);
  }

  // Raises `side` of the player's copy `copyUid` by 1, using up duplicates.
  // Returns { owned, used: [uids] } or { error }.
  function upgradeCopy(pool, profile, copyUid, side) {
    const owned = playableCollection(pool, profile).find((o) => o.uid === copyUid);
    if (!owned) return { error: "That card isn't in your collection." };
    const problem = raiseProblem(pool, owned, side);
    if (problem) return { error: problem };
    const cost = upgradeCost(owned);
    const fodder = upgradeFodder(profile, owned);
    if (fodder.length < cost) {
      return { error: `This upgrade uses ${cost} duplicate${cost === 1 ? "" : "s"} of the card; you have ${fodder.length}.` };
    }
    const used = new Set(fodder.slice(0, cost).map((o) => o.uid));
    profile.collection = profile.collection.filter((o) => !used.has(o.uid));
    profile.lastHand = profile.lastHand.filter((uid) => !used.has(uid));
    owned.boost = { ...(owned.boost || {}), [side]: ((owned.boost && owned.boost[side]) || 0) + 1 };
    profile.stats.upgrades++;
    return { owned, used: [...used] };
  }

  // --- Experience and the computer's difficulty ---
  // Total XP needed to reach `level`.
  function xpForLevel(level) {
    return (LEVEL_XP_STEP * (level - 1) * level) / 2;
  }

  function levelFor(xp) {
    let level = 1;
    while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
    return level;
  }

  // { level, into: XP into this level, needed: XP this level takes (null at the top) }
  function levelProgress(xp) {
    const level = levelFor(xp);
    const start = xpForLevel(level);
    return { level, into: xp - start, needed: level < MAX_LEVEL ? xpForLevel(level + 1) - start : null };
  }

  // How the computer plays someone of `level`: { level, mistakes, upgrades }.
  function cpuDifficulty(level) {
    return {
      level,
      mistakes: CPU_MISTAKES[level - 1] || 0,
      upgrades: Math.min(Math.floor((level - 1) / CPU_LEVELS_PER_UPGRADE), HAND_SIZE * UPGRADE_MAX),
    };
  }

  // The computer's hand against the player's `hand`: for each of the
  // player's cards, a random card of the same rarity whose plain total is the
  // same or up to CPU_MIRROR_RANGE less, then the difficulty's upgrades, one
  // at a time on a random card and side. [{ uid, cardId, boost? }]
  function cpuHand(pool, hand, difficulty, { newId, rng = Math.random }) {
    const cards = hand.map((c) => {
      const base = pool.byId[c.cardId];
      const total = cardTotal(base);
      const lower = pool.cards.filter((card) => card.rarity === base.rarity && cardTotal(card) <= total);
      const top = Math.max(...lower.map(cardTotal));
      const picks = lower.filter((card) => cardTotal(card) >= top - CPU_MIRROR_RANGE);
      return { uid: newId("x_"), cardId: picks.length ? randomItem(picks, rng).id : base.id };
    });
    for (let i = 0; i < difficulty.upgrades; i++) {
      const options = [];
      cards.forEach((card, index) => {
        SIDES.forEach((side) => {
          if (!raiseProblem(pool, card, side)) options.push({ index, side });
        });
      });
      if (!options.length) break;
      const { index, side } = randomItem(options, rng);
      cards[index].boost = { ...(cards[index].boost || {}), [side]: 1 };
    }
    return cards;
  }

  // How well two waiting players match (lower is better), or null if they're
  // too far apart yet. Each is { level, power, since }.
  function matchGap(a, b, now = Date.now()) {
    const widen = Math.floor(Math.max(now - a.since, now - b.since, 0) / MATCH_WIDEN_MS);
    const levels = Math.abs(a.level - b.level);
    const power = Math.abs(a.power - b.power);
    if (levels > MATCH_LEVEL_GAP + widen || power > MATCH_POWER_GAP + widen * 3) return null;
    return levels * 10 + power;
  }

  // --- Saved decks: a named set of 5 owned copies (by uid) ---
  function deckCardIds(pool, profile, deck) {
    const hand = validateHand(pool, profile, deck.uids);
    return hand ? hand.map((c) => c.cardId) : null;
  }

  function nextDeckName(profile) {
    let n = profile.decks.length + 1;
    while (profile.decks.some((d) => d.name === `Deck ${n}`)) n++;
    return `Deck ${n}`;
  }

  // Creates a deck or updates the one with `id`; returns it, or null if the
  // cards aren't 5 different owned copies or the deck limit is reached.
  function saveDeck(pool, profile, { id, name, uids }, newId, now = Date.now()) {
    if (!validateHand(pool, profile, uids)) return null;
    const clean = String(name || "").trim().replace(/\s+/g, " ").slice(0, DECK_NAME_LENGTH);
    const existing = id && profile.decks.find((d) => d.id === id);
    if (existing) {
      existing.name = clean || existing.name;
      existing.uids = [...uids];
      existing.updatedAt = now;
      return existing;
    }
    if (profile.decks.length >= MAX_DECKS) return null;
    const deck = { id: newId("d_"), name: clean || nextDeckName(profile), uids: [...uids], createdAt: now };
    profile.decks.push(deck);
    return deck;
  }

  function deleteDeck(profile, id) {
    profile.decks = profile.decks.filter((d) => d.id !== id);
    if (profile.lastDeckId === id) profile.lastDeckId = null;
  }

  // --- After a game ---
  // Applies a finished match to one player's profile: coins, XP, stats,
  // per-card results, history, strikes (live losses) and the winner's card
  // claim. A player who resigned or ran out of time earns no coins or XP.
  // Returns what changed, for the result screen:
  // { result, coins, xp, level, levelUp, scores: [mine, theirs],
  //   strikes: [{ copyUid, cardId, strikes, removed }], claimOptions }
  function settleForSeat(pool, state, seat, profile, now = Date.now()) {
    const result = resultFor(state, seat);
    const opp = otherSeat(seat);
    const color = state.colors[seat];
    const oppColor = state.colors[opp];
    const stats = profile.stats;
    stats.played++;
    stats.flipsMade += state.moves.filter((m) => m.seat === seat).reduce((sum, m) => sum + m.flips.length, 0);
    if (result === "win") {
      stats.wins++;
      stats.currentStreak++;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
    } else {
      if (result === "loss") stats.losses++;
      else stats.draws++;
      stats.currentStreak = 0;
    }
    const forfeited = state.result.forfeiter === seat;
    const coins = forfeited ? 0 : COIN_REWARDS[state.mode][result];
    profile.coins += coins;
    stats.coinsEarned += coins;
    const xp = forfeited ? 0 : XP_REWARDS[state.mode][result];
    const levelBefore = levelFor(profile.xp);
    profile.xp += xp;
    const level = levelFor(profile.xp);

    [...new Set(state.startHands[seat])].forEach((id) => {
      const s = (profile.cardStats[id] = profile.cardStats[id] || { played: 0, win: 0, loss: 0, draw: 0 });
      s.played++;
      s[result]++;
    });

    // Strikes: in a live loss, each of this player's cards that ended in the
    // winner's color.
    const strikes = [];
    if (state.mode === "live" && result === "loss") {
      state.board.forEach((slot) => {
        if (!slot || slot.seat !== seat || slot.color !== oppColor) return;
        const owned = profile.collection.find((o) => o.uid === slot.copyUid);
        if (!owned) return;
        owned.strikes = (owned.strikes || 0) + 1;
        const removed = owned.strikes >= STRIKES_TO_LOSE;
        strikes.push({ copyUid: owned.uid, cardId: owned.cardId, strikes: owned.strikes, removed });
      });
      const gone = new Set(strikes.filter((s) => s.removed).map((s) => s.copyUid));
      if (gone.size) {
        profile.collection = profile.collection.filter((o) => !gone.has(o.uid));
        profile.lastHand = profile.lastHand.filter((uid) => !gone.has(uid));
        stats.cardsLost += gone.size;
      }
    }

    // The winner may claim a copy of one opponent card that ended in their color.
    const claimOptions = result === "win"
      ? [...new Set(state.board.filter((s) => s && s.seat === opp && s.color === color).map((s) => s.cardId))]
      : [];
    profile.pendingClaim = claimOptions.length
      ? { at: now, matchId: state.id, opponent: state.seats[opp].name, options: claimOptions }
      : null;

    const scores = state.result.scores;
    profile.history.unshift({
      at: now,
      matchId: state.id,
      mode: state.mode,
      opponent: state.seats[opp].name,
      result,
      score: [scores[seat], scores[opp]],
      wentFirst: state.first === seat,
      reason: state.result.reason,
      coins,
      xp,
      strikes: strikes.length,
      lost: strikes.filter((s) => s.removed).length,
      claimed: null,
    });
    profile.history = profile.history.slice(0, HISTORY_LIMIT);
    return {
      result, coins, xp, level, levelUp: level > levelBefore, scores: [scores[seat], scores[opp]], strikes, claimOptions,
    };
  }

  // Takes the claimed card from the player's pending claim; returns the new
  // owned copy, or null if it isn't one of the options.
  function claimCard(profile, cardId, newId, now = Date.now()) {
    const claim = profile.pendingClaim;
    if (!claim || !claim.options.includes(cardId)) return null;
    const owned = makeOwnedCard(cardId, "won", newId, now);
    profile.collection.push(owned);
    profile.stats.cardsClaimed++;
    const entry = profile.history.find((h) => h.at === claim.at);
    if (entry) entry.claimed = cardId;
    profile.pendingClaim = null;
    return owned;
  }

  // Buys and opens a pack. Returns the drawn cards, each { cardId, isNew }
  // (new = no copy owned before; only the first copy counts), or null if the
  // player can't afford it.
  function openPack(pool, profile, pack, { newId, rng = Math.random, now = Date.now() }) {
    if (profile.coins < pack.price) return null;
    const ownedBefore = new Set(profile.collection.map((owned) => owned.cardId));
    const cardIds = randomCards(pool, pack.size, pack.odds, rng);
    profile.coins -= pack.price;
    profile.stats.coinsSpent += pack.price;
    profile.stats.packsOpened++;
    return cardIds.map((cardId) => {
      const isNew = !ownedBefore.has(cardId);
      ownedBefore.add(cardId);
      profile.collection.push(makeOwnedCard(cardId, "pack", newId, now));
      return { cardId, isNew };
    });
  }

  return {
    RARITY_ORDER, RARITIES, DEFAULT_RARITY_CHANCES, SIDES, HAND_SIZE, STARTER_SIZE, MAX_DECKS, DECK_NAME_LENGTH,
    NAME_LENGTH, HISTORY_LIMIT, STARTING_COINS, COIN_REWARDS, STRIKES_TO_LOSE, TURN_SECONDS, MAX_TIMEOUTS, SCORING,
    DEFAULT_PACKS, PACK_LIMITS, CPU_NAMES, PLAY_STYLES, BUILT_IN_BY_ID, OTHER_SET, SETS_BY_ID, CARD_SETS: SETS,
    UPGRADE_MAX, UPGRADE_COSTS, SIDE_LIMIT, XP_REWARDS, MAX_LEVEL, CPU_MIRROR_RANGE,
    sidesOf, handPower, upgradesOf, raiseProblem, upgradeCost, upgradeFodder, upgradeCopy,
    xpForLevel, levelFor, levelProgress, cpuDifficulty, cpuHand, matchGap,
    isValidCard, cleanCard, sameCard, upgradeId, upgradeCard, upgradeChances, chancesTotal, isValidChances,
    isValidPack, cleanPack, buildPool, poolSaveData, cardSet, cardTotal,
    randomItem, effectiveChances, randomRarity, randomCards,
    findFlips, placeCard, colorCount, chooseMove, scoreBoard,
    otherSeat, newMatch, isCpuSeat, playMove, autoMove, runCpuTurns, handleTimeout, forfeit, resultFor, publicMatch,
    emptyStats, cleanName, makeOwnedCard, newProfile, normalizeProfile, playableCollection, validateHand,
    deckCardIds, nextDeckName, saveDeck, deleteDeck, settleForSeat, claimCard, openPack,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CardRules;
