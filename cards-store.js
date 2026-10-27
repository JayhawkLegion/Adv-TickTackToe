// Where the player's profile lives and where games are played. Pages talk to
// CardStore only:
//   - signed in (cards-online.js): the profile is on the server, which runs
//     every game, pack and claim, so coins and cards can't be edited;
//   - otherwise (LocalStore below): this device's profile, with games
//     against the computer played right here.
// Both have the same methods. Actions return promises and reject with an
// Error whose message can be shown to the player.
//
// A match is seen as a "view": { match, seat, hand, settlement }, where match
// is CardRules.publicMatch (no hands), seat is the player's seat ("a" or
// "b"), hand their cards in hand ([{ uid, cardId }]) and settlement what the
// finished game changed for them (CardRules.settleForSeat), once it's over.
const LocalStore = (() => {
  const save = loadCardSave();
  const profileListeners = [];
  const matches = {}; // id → { state, settlement, listeners }

  function profile() {
    return getCurrentPlayer(save);
  }

  function commit() {
    saveCardSave(save);
    const current = profile();
    profileListeners.forEach((fn) => fn(current));
  }

  function needProfile() {
    const current = profile();
    if (!current) throw new Error("Create a player first.");
    return current;
  }

  function viewOf(m) {
    return {
      match: CardRules.publicMatch(m.state),
      seat: "a",
      hand: m.state.hands.a.map((c) => ({ ...c })),
      settlement: m.settlement,
    };
  }

  function emit(m) {
    const view = viewOf(m);
    m.listeners.forEach((fn) => fn(view));
  }

  function needMatch(id) {
    const m = matches[id];
    if (!m) throw new Error("That game isn't on this device.");
    return m;
  }

  function settleIfOver(m) {
    if (m.state.status !== "finished" || m.settlement) return;
    m.settlement = CardRules.settleForSeat(POOL, m.state, "a", needProfile());
    commit();
  }

  return {
    mode: "local",

    profile,

    // fn(profile or null) now, and after every change. Returns an unsubscribe.
    onProfile(fn) {
      profileListeners.push(fn);
      fn(profile());
      return () => profileListeners.splice(profileListeners.indexOf(fn), 1);
    },

    async createProfile(name) {
      const player = { id: newId("p_"), ...CardRules.newProfile(POOL, { name, newId }) };
      save.players[player.id] = player;
      save.currentPlayerId = player.id;
      commit();
      return player;
    },

    async rename(name) {
      needProfile().name = cleanName(name);
      commit();
    },

    async reset() {
      const current = needProfile();
      delete save.players[current.id];
      save.currentPlayerId = null;
      commit();
    },

    async saveDeck(fields) {
      const deck = CardRules.saveDeck(POOL, needProfile(), fields, newId);
      if (!deck) throw new Error("A deck needs 5 different cards from your collection.");
      commit();
      return deck;
    },

    async deleteDeck(id) {
      CardRules.deleteDeck(needProfile(), id);
      commit();
    },

    async openPack(packId) {
      const pack = PACKS.find((p) => p.id === packId);
      const cards = pack && CardRules.openPack(POOL, needProfile(), pack, { newId });
      if (!cards) throw new Error("You don't have enough coins for that pack.");
      commit();
      return cards;
    },

    async claimCard(cardId) {
      const owned = CardRules.claimCard(needProfile(), cardId, newId);
      if (!owned) throw new Error("That card can't be claimed.");
      commit();
      return owned;
    },

    // --- Games ---
    async startCpuMatch(uids, deckId = null) {
      const current = needProfile();
      const hand = CardRules.validateHand(POOL, current, uids);
      if (!hand) throw new Error(`Choose ${HAND_SIZE} different cards from your collection.`);
      current.lastHand = [...uids];
      current.lastDeckId = deckId;
      const id = newId("m_");
      const cpuHand = randomCards(HAND_SIZE).map((cardId) => ({ uid: newId("x_"), cardId }));
      const state = CardRules.newMatch({
        id,
        mode: "cpu",
        a: { uid: "me", name: current.name, hand },
        b: { uid: "cpu", name: randomItem(CPU_NAMES), hand: cpuHand },
      });
      CardRules.runCpuTurns(POOL, state);
      matches[id] = { state, settlement: null, listeners: [] };
      commit();
      return id;
    },

    // Playing other people needs the online service.
    async joinQueue() {
      throw new Error("Sign in with Google to play other people.");
    },

    async leaveQueue() {
      return { status: "left" };
    },

    // fn(view) now and after every change. Returns an unsubscribe.
    watchMatch(id, fn) {
      const m = needMatch(id);
      m.listeners.push(fn);
      fn(viewOf(m));
      return () => m.listeners.splice(m.listeners.indexOf(fn), 1);
    },

    async playMove(id, copyUid, slot) {
      const m = needMatch(id);
      const played = CardRules.playMove(POOL, m.state, "a", copyUid, slot);
      if (!played.ok) throw new Error(played.error);
      CardRules.runCpuTurns(POOL, m.state);
      settleIfOver(m);
      emit(m);
    },

    async resign(id) {
      const m = needMatch(id);
      CardRules.forfeit(m.state, "a", "resign");
      settleIfOver(m);
      emit(m);
    },

    // Turn clocks only run in games against people.
    async claimTimeout() {},

    // --- Card Builder ---
    canEditPool: () => true,

    async savePool(data) {
      localStorage.setItem(POOL_SAVE_KEY, JSON.stringify(data));
    },
  };
})();

const CardStore = CardOnline.active ? CardOnline.store : LocalStore;
