// What every WildFlip page shares (loaded after cards-store.js):
//   - WildFlipNav: the bar fixed to the bottom of the screen with Home, Play,
//     Collection and Store, hidden during a game;
//   - DeckDraft: the 5 cards picked for the next game, kept on this device
//     so any page can add a card to it;
//   - CardCloseup: tap a card for a close-up with its stats and total, to
//     upgrade a copy, or to add it to the deck.

// --- Bottom navigation ---
const WildFlipNav = (() => {
  const ICONS = {
    home: "M12 3 2 12h3v8h5.5v-6h3v6H19v-8h3z",
    play: "M7 4.5v15l12.5-7.5z",
    collection: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
    store: "M7 8V7a5 5 0 0 1 10 0v1h3l-1.5 13h-13L4 8zm2 0h6V7a3 3 0 0 0-6 0z",
  };
  const LINKS = [
    { id: "home", href: "cards.html", label: "Home" },
    { id: "play", href: "cards.html#play", label: "Play" },
    { id: "collection", href: "cards-collection.html", label: "Collection" },
    { id: "store", href: "cards-packs.html", label: "Store" },
  ];
  const PAGE_ROUTES = { "cards-collection.html": "collection", "cards-packs.html": "store" };

  function page() {
    return window.location.pathname.split("/").pop() || "index.html";
  }

  // Which tab the current page is: on the game page, Home or Play by the
  // address's #play.
  function route() {
    if (page() === "cards.html") return window.location.hash === "#play" ? "play" : "home";
    return PAGE_ROUTES[page()] || null;
  }

  const nav = document.createElement("nav");
  nav.className = "cc-nav";
  nav.setAttribute("aria-label", "WildFlip");
  LINKS.forEach((link) => {
    const a = document.createElement("a");
    a.href = link.href;
    a.className = "cc-nav-item";
    a.dataset.route = link.id;
    a.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${ICONS[link.id]}"/></svg>` +
      `<span>${link.label}</span>`;
    nav.appendChild(a);
  });
  document.body.appendChild(nav);
  document.body.classList.add("cc-with-nav");

  function mark() {
    const current = route();
    nav.querySelectorAll(".cc-nav-item").forEach((a) => {
      if (a.dataset.route === current) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  // Home and Play are both the game page: switching between them there
  // changes the address without reloading, and the page hears "wildflip:route".
  nav.addEventListener("click", (e) => {
    const a = e.target.closest(".cc-nav-item");
    if (!a || page() !== "cards.html" || !["home", "play"].includes(a.dataset.route)) return;
    e.preventDefault();
    if (a.dataset.route !== route()) history.pushState(null, "", a.dataset.route === "play" ? "#play" : "cards.html");
    mark();
    window.dispatchEvent(new CustomEvent("wildflip:route", { detail: route() }));
  });
  window.addEventListener("popstate", () => {
    mark();
    if (page() === "cards.html") window.dispatchEvent(new CustomEvent("wildflip:route", { detail: route() }));
  });
  mark();

  return {
    route,
    mark,
    // Games hide the bar, so a stray tap can't leave one.
    setHidden(hidden) {
      nav.hidden = hidden;
      document.body.classList.toggle("cc-with-nav", !hidden);
    },
    // Moves the game page to Home or Play (as the nav would).
    go(to) {
      if (to !== route()) history.pushState(null, "", to === "play" ? "#play" : "cards.html");
      mark();
      window.dispatchEvent(new CustomEvent("wildflip:route", { detail: route() }));
    },
  };
})();

// --- The deck for the next game ---
// { uids, deckId }: up to HAND_SIZE copies (by uid), and the saved deck they
// came from if they still match it. Kept per player, on this device.
const DeckDraft = (() => {
  const KEY = "wildflipDeck";

  function owner(profile) {
    return `${CardStore.mode}:${profile.createdAt || ""}`;
  }

  function stored() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  }

  // Keeps only playable, different copies; drops deckId if they no longer
  // match that saved deck.
  function clean(profile, { uids, deckId }) {
    const playable = new Set(playableCollection(profile).map((o) => o.uid));
    const kept = [...new Set(uids || [])].filter((uid) => playable.has(uid)).slice(0, HAND_SIZE);
    const deck = deckId && profile.decks.find((d) => d.id === deckId);
    const same = deck && deck.uids.length === kept.length && deck.uids.every((uid) => kept.includes(uid));
    return { uids: kept, deckId: same ? deck.id : null };
  }

  function store(profile, draft) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ owner: owner(profile), ...draft }));
    } catch {
      // Storage blocked: the deck lasts until the page closes.
    }
  }

  // The player's deck: what they picked last on this device, or else the
  // hand (or saved deck) they last played, or a new player's starter cards.
  function read(profile) {
    if (!profile) return { uids: [], deckId: null };
    const saved = stored();
    if (saved && saved.owner === owner(profile)) return clean(profile, saved);
    const last = profile.decks.find((d) => d.id === profile.lastDeckId);
    const playable = playableCollection(profile);
    let draft;
    if (last) draft = clean(profile, { uids: last.uids, deckId: last.id });
    else if (profile.lastHand && profile.lastHand.length) draft = clean(profile, { uids: profile.lastHand, deckId: null });
    else draft = { uids: playable.slice(0, HAND_SIZE).map((o) => o.uid), deckId: null };
    store(profile, draft);
    return draft;
  }

  function write(profile, draft) {
    const next = clean(profile, draft);
    store(profile, next);
    window.dispatchEvent(new CustomEvent("wildflip:deck", { detail: next }));
    return next;
  }

  return { read, write };
})();

// --- Card close-up ---
// CardCloseup.open(cardId, { copyUid, deck, after }):
//   copyUid: which owned copy to show first;
//   deck: where "Add to Deck" puts the card, { label, read(), write(uids) }
//     (the saved deck draft by default; false for none);
//   after: called after the card is added to or taken out of the deck.
const CardCloseup = (() => {
  const SOURCE_LABELS = { starter: "starter cards", won: "a win", pack: "a pack" };
  const SIDE_LABELS = [["top", "Top"], ["right", "Right"], ["bottom", "Bottom"], ["left", "Left"]];

  const dialog = document.createElement("dialog");
  dialog.className = "cc-dialog";
  dialog.setAttribute("aria-labelledby", "closeupTitle");
  dialog.innerHTML = `
    <div class="cc-closeup">
      <button type="button" class="cc-closeup-x" data-close aria-label="Close">×</button>
      <div class="cc-closeup-card" data-el="card"></div>
      <h2 id="closeupTitle" class="cc-closeup-title" data-el="title"></h2>
      <p class="cc-closeup-meta" data-el="meta"></p>
      <div class="cc-upgrade-copies cc-closeup-copies" data-el="copies" role="group" aria-label="Which copy"></div>
      <dl class="cc-closeup-stats" data-el="stats"></dl>
      <p class="settings-hint" data-el="note"></p>
      <section class="cc-upgrade cc-closeup-deck" data-el="deckBox" hidden>
        <h3 class="cc-upgrade-title" data-el="deckTitle">Deck</h3>
        <p class="cc-upgrade-cost" data-el="deckText"></p>
        <div class="cc-upgrade-copies" data-el="deckSwap" role="group" aria-label="Card to swap out"></div>
        <button type="button" class="reset-btn" data-el="deckBtn"></button>
        <a href="cards.html#play" class="cc-link cc-closeup-play" data-el="playLink" hidden>Play with this deck →</a>
      </section>
      <section class="cc-upgrade" data-el="upgradeBox" hidden>
        <h3 class="cc-upgrade-title">Upgrade this copy</h3>
        <p class="settings-hint" data-el="upgradeHint"></p>
        <div class="size-options cc-upgrade-sides" data-el="sides" role="group" aria-label="Which side"></div>
        <p class="cc-upgrade-cost" data-el="cost"></p>
        <button type="button" class="reset-btn" data-el="upgradeBtn">Upgrade</button>
      </section>
      <button type="button" class="reset-btn cc-secondary" data-close>Close</button>
    </div>`;
  document.body.appendChild(dialog);
  const el = {};
  dialog.querySelectorAll("[data-el]").forEach((node) => {
    el[node.dataset.el] = node;
  });

  // The default home for "Add to Deck": the deck kept by DeckDraft.
  const draftDeck = {
    label: "your deck",
    read: () => DeckDraft.read(CardStore.profile()).uids,
    write: (uids) => DeckDraft.write(CardStore.profile(), { uids, deckId: null }),
  };

  // { cardId, copyUid, side, swapping, opts, message }
  let shown = null;
  let player = null;

  function statRow(label, value) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    el.stats.append(dt, dd);
  }

  function unfoundCardEl(card) {
    const node = document.createElement("div");
    node.className = "cc-card-unfound";
    node.style.setProperty("--rarity-color", RARITIES[card.rarity].color);
    const unlock = CardRules.releaseLevel(card);
    const lock = unlock > levelInfo(player.xp).level ? `<span class="cc-unfound-lock">🔒 Lv ${unlock}</span>` : "";
    node.innerHTML = `<span class="cc-unfound-no">#${card.no}</span><span class="cc-unfound-rarity">${RARITIES[card.rarity].label}</span>${lock}`;
    return node;
  }

  function render() {
    const card = getCard(shown.cardId);
    const rarity = RARITIES[card.rarity];
    const set = cardSet(card);
    // Most upgraded copy first, to keep building it.
    const copies = playableCollection(player)
      .filter((owned) => owned.cardId === card.id)
      .sort((a, b) => CardRules.upgradesOf(b) - CardRules.upgradesOf(a) || (a.acquiredAt || 0) - (b.acquiredAt || 0));
    let copy = copies.find((o) => o.uid === shown.copyUid);
    if (!copy && copies.length) {
      copy = copies[0];
      shown.copyUid = copy.uid;
      shown.side = null;
    }
    el.card.innerHTML = "";
    el.stats.innerHTML = "";
    el.note.textContent = "";
    el.copies.innerHTML = "";
    el.copies.hidden = copies.length < 2;

    if (!copy) {
      el.card.appendChild(unfoundCardEl(card));
      el.title.textContent = `#${card.no} · Not found yet`;
      el.meta.innerHTML = `<span style="color: ${rarity.color}">${rarity.label}</span> · ${set.icon} ${escapeHtml(set.name)}`;
      const unlock = CardRules.releaseLevel(card);
      el.note.textContent = unlock > levelInfo(player.xp).level
        ? `Unlocks at level ${unlock}. Until then it isn't in your packs, but you can win it from another player near your level.`
        : "Find it in a card pack, or capture it from an opponent and claim it after a win.";
      el.deckBox.hidden = true;
      el.upgradeBox.hidden = true;
      return;
    }

    el.card.appendChild(createCardEl(card.id, "neutral", copyLook(copy)));
    el.title.textContent = card.name;
    el.meta.innerHTML = `#${card.no} · <span style="color: ${rarity.color}">${rarity.label}</span> · ${set.icon} ${escapeHtml(set.name)}`;
    copies.forEach((o) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-hand-card";
      btn.dataset.copy = o.uid;
      btn.classList.toggle("selected", o.uid === copy.uid);
      btn.setAttribute("aria-pressed", String(o.uid === copy.uid));
      btn.appendChild(createCardEl(o.cardId, "neutral", copyLook(o)));
      el.copies.appendChild(btn);
    });

    const base = cardTotal(card);
    const ups = CardRules.upgradesOf(copy);
    const sides = CardRules.sidesOf(POOL, copy.cardId, copy.boost);
    statRow("Total value", ups ? `${base + ups} (${base} + ${ups} ▲)` : String(base));
    statRow("Sides", SIDE_LABELS.map(([side]) => sides[side]).join(" · "));
    statRow("Copies owned", copies.length);
    if (copy.strikes) statRow("Strikes on this copy", `${copy.strikes} of ${STRIKES_TO_LOSE}`);
    const stats = player.cardStats[card.id] || { played: 0, win: 0, loss: 0, draw: 0 };
    statRow("Games played", stats.played);
    statRow("Won · Lost · Drew", `${stats.win} · ${stats.loss} · ${stats.draw}`);
    statRow("Win rate", stats.played ? `${Math.round((stats.win / stats.played) * 100)}%` : "–");
    const first = copies.reduce((a, b) => ((a.acquiredAt || 0) <= (b.acquiredAt || 0) ? a : b));
    if (first.acquiredAt) {
      const when = new Date(first.acquiredAt).toLocaleDateString([], { dateStyle: "medium" });
      statRow("First found", `${when}, from ${SOURCE_LABELS[first.source] || "your collection"}`);
    }
    if (copies.length > 1) el.note.textContent = "Tap a copy above to see it, upgrade it or put it in your deck.";
    renderDeck(copy);
    renderUpgrade(copy);
  }

  // --- Add to Deck ---
  function renderDeck(copy) {
    const deck = shown.opts.deck === undefined ? draftDeck : shown.opts.deck;
    el.deckBox.hidden = !deck;
    if (!deck) return;
    const uids = deck.read();
    const byUid = new Map(playableCollection(player).map((o) => [o.uid, o]));
    const inDeck = uids.includes(copy.uid);
    const twin = uids.find((uid) => uid !== copy.uid && byUid.get(uid) && byUid.get(uid).cardId === copy.cardId);
    const full = uids.length >= HAND_SIZE;
    el.deckTitle.textContent = `${deck.label[0].toUpperCase()}${deck.label.slice(1)} (${uids.length} / ${HAND_SIZE})`;
    el.deckSwap.innerHTML = "";
    el.deckSwap.hidden = true;
    el.playLink.hidden = !shown.opts.playLink || uids.length !== HAND_SIZE;

    if (inDeck) {
      el.deckText.textContent = shown.message || `This copy is in ${deck.label}.`;
      el.deckBtn.textContent = "Remove from Deck";
      el.deckBtn.dataset.action = "remove";
      el.deckBtn.hidden = false;
    } else if (twin) {
      el.deckText.textContent = shown.message || `Another copy of ${getCard(copy.cardId).name} is in ${deck.label}.`;
      el.deckBtn.textContent = "Use This Copy Instead";
      el.deckBtn.dataset.action = "twin";
      el.deckBtn.hidden = false;
    } else if (!full) {
      el.deckText.textContent = shown.message || `${HAND_SIZE - uids.length} more card${HAND_SIZE - uids.length === 1 ? "" : "s"} to fill ${deck.label}.`;
      el.deckBtn.textContent = "Add to Deck";
      el.deckBtn.dataset.action = "add";
      el.deckBtn.hidden = false;
    } else {
      // A full deck: pick a card to swap out.
      el.deckText.textContent = shown.message || `${deck.label[0].toUpperCase()}${deck.label.slice(1)} is full. Tap a card to swap it out for this one:`;
      el.deckBtn.hidden = true;
      el.deckSwap.hidden = false;
      uids.forEach((uid) => {
        const owned = byUid.get(uid);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cc-hand-card";
        btn.dataset.swap = uid;
        btn.setAttribute("aria-label", `Swap out ${getCard(owned.cardId).name}`);
        btn.appendChild(createCardEl(owned.cardId, "neutral", copyLook(owned)));
        el.deckSwap.appendChild(btn);
      });
    }
  }

  function changeDeck(next, message) {
    const deck = shown.opts.deck === undefined ? draftDeck : shown.opts.deck;
    deck.write(next);
    shown.message = message;
    if (shown.opts.after) shown.opts.after();
    if (dialog.open) render();
  }

  el.deckBtn.addEventListener("click", () => {
    const deck = shown.opts.deck === undefined ? draftDeck : shown.opts.deck;
    const uids = deck.read();
    const uid = shown.copyUid;
    const name = getCard(shown.cardId).name;
    const action = el.deckBtn.dataset.action;
    if (action === "remove") changeDeck(uids.filter((u) => u !== uid), `${name} was taken out of ${deck.label}.`);
    else if (action === "add") changeDeck([...uids, uid], `${name} was added to ${deck.label}.`);
    else if (action === "twin") {
      const byUid = new Map(playableCollection(player).map((o) => [o.uid, o]));
      changeDeck(uids.map((u) => (byUid.get(u) && byUid.get(u).cardId === shown.cardId ? uid : u)), `This copy of ${name} is in ${deck.label} now.`);
    }
  });

  el.deckSwap.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-swap]");
    if (!btn) return;
    const deck = shown.opts.deck === undefined ? draftDeck : shown.opts.deck;
    const out = playableCollection(player).find((o) => o.uid === btn.dataset.swap);
    changeDeck(deck.read().map((u) => (u === btn.dataset.swap ? shown.copyUid : u)),
      `${getCard(shown.cardId).name} took ${out ? getCard(out.cardId).name : "a card"}'s place in ${deck.label}.`);
  });

  // --- Upgrading ---
  // Duplicates of the card pay to raise one side of the copy shown. The copy
  // keeps its upgrades until it's lost; nobody who claims the card gets them.
  function renderUpgrade(copy) {
    el.upgradeBox.hidden = false;
    const cost = CardRules.upgradeCost(copy);
    const spare = CardRules.upgradeFodder(player, copy).length;
    el.upgradeHint.textContent =
      `Use duplicates of this card to raise one side of a copy by 1: each side once, up to ${UPGRADE_MAX} upgrades, ` +
      `costing ${UPGRADE_COSTS.join(", then ")} duplicates. The upgrade stays with that copy; ` +
      "if it's lost or someone claims the card, the upgrade doesn't go with it.";

    el.sides.innerHTML = "";
    const now = CardRules.sidesOf(POOL, copy.cardId, copy.boost);
    if (shown.side && CardRules.raiseProblem(POOL, copy, shown.side)) shown.side = null;
    SIDE_LABELS.forEach(([side, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "size-option";
      btn.dataset.side = side;
      const problem = CardRules.raiseProblem(POOL, copy, side);
      btn.disabled = Boolean(problem);
      btn.title = problem;
      btn.textContent = copy.boost && copy.boost[side] ? `${label} ${now[side]} ▲` : `${label} ${now[side]} → ${now[side] + 1}`;
      btn.classList.toggle("selected", shown.side === side);
      btn.setAttribute("aria-pressed", String(shown.side === side));
      el.sides.appendChild(btn);
    });

    if (shown.upgraded) {
      el.cost.textContent = shown.upgraded;
    } else if (cost === null) {
      el.cost.textContent = `This copy has all ${UPGRADE_MAX} upgrades.`;
    } else {
      const uses = `Upgrade ${CardRules.upgradesOf(copy) + 1} of ${UPGRADE_MAX} uses ${cost} duplicate${cost === 1 ? "" : "s"}`;
      el.cost.textContent = spare >= cost
        ? `${uses}. You have ${spare} spare.`
        : `${uses}. You have ${spare} spare: collect ${cost - spare} more from packs or wins.`;
    }
    el.upgradeBtn.disabled = cost === null || spare < cost || !shown.side || shown.upgrading;
    el.upgradeBtn.textContent = shown.side ? `Upgrade ${shown.side[0].toUpperCase()}${shown.side.slice(1)}` : "Pick a side to upgrade";
  }

  el.copies.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    shown.copyUid = btn.dataset.copy;
    shown.side = null;
    shown.message = "";
    shown.upgraded = "";
    render();
  });

  el.sides.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-side]");
    if (!btn || btn.disabled) return;
    shown.side = btn.dataset.side;
    shown.upgraded = "";
    render();
  });

  el.upgradeBtn.addEventListener("click", async () => {
    if (!shown || !shown.side) return;
    const now = shown;
    const { cardId, copyUid, side } = now;
    now.upgrading = true;
    el.upgradeBtn.disabled = true;
    try {
      const owned = await CardStore.upgradeCard(copyUid, side);
      now.side = null;
      now.upgraded = `Upgraded! This ${getCard(cardId).name}'s ${side} side is now ${
        CardRules.sidesOf(POOL, cardId, owned.boost)[side]}.`;
    } catch (err) {
      now.upgraded = err.message || "Couldn't upgrade. Please try again.";
    } finally {
      now.upgrading = false;
      if (shown === now && dialog.open) render();
    }
  });

  dialog.addEventListener("click", (e) => {
    // The close buttons, or the dimmed area outside the close-up.
    if (e.target === dialog || e.target.closest("[data-close]")) dialog.close();
  });
  dialog.addEventListener("close", () => {
    shown = null;
  });

  // Keep an open close-up current (after an upgrade, a new card…).
  CardStore.onProfile((next) => {
    player = next;
    if (!player && dialog.open) dialog.close();
    else if (shown && dialog.open) render();
  });

  return {
    open(cardId, opts = {}) {
      if (!player || !getCard(cardId)) return;
      shown = { cardId, copyUid: opts.copyUid || null, side: null, opts, message: "", upgraded: "" };
      render();
      if (!dialog.open) dialog.showModal();
    },
    close() {
      if (dialog.open) dialog.close();
    },
    // Re-reads the deck (after it changed somewhere else).
    refresh() {
      if (shown && dialog.open) render();
    },
  };
})();
