// WildFlip: a 3x3 board card game against the computer or, signed in,
// another player. A coin toss picks who goes first; the first player is Red,
// the other Blue. Placing a card flips every touching enemy card whose
// facing number is lower than the placed card's number on that side. When
// all 9 squares are full the player with more cards in their color wins, and
// may claim a copy of one of the opponent's cards that ended in their color.
//
// The rules run in CardStore (on this device, or on the server when signed
// in). This page sends the player's moves and shows a match's moves one by
// one as they come in.
const CPU_THINK_MS = 900;
const CPU_SHOW_PICK_MS = 450;
const FLIP_MS = 500;
const QUEUE_PING_MS = 20000; // while waiting, check in (and look for a match) this often
const QUEUE_FALLBACK_MS = 30000; // then offer a game against the computer
const TIMEOUT_GRACE_MS = 2000; // the server's clock decides when a turn ran out
const TIMEOUT_RETRY_MS = 3000;

const statusEl = document.getElementById("status");
const views = {
  setup: document.getElementById("setupView"),
  home: document.getElementById("homeView"),
  deck: document.getElementById("deckView"),
  queue: document.getElementById("queueView"),
  play: document.getElementById("playView"),
};

const setupForm = document.getElementById("setupForm");
const setupNoteEl = document.getElementById("setupNote");
const nameInput = document.getElementById("nameInput");

const deckNameEl = document.getElementById("deckName");
const deckRecordEl = document.getElementById("deckRecord");
const deckCoinsEl = document.getElementById("deckCoins");
const deckNoticeEl = document.getElementById("deckNotice");
const deckGridEl = document.getElementById("deckGrid");
const rarityFilterEl = document.getElementById("rarityFilter");
const sortSelect = document.getElementById("sortSelect");
const pickTabsEl = document.getElementById("pickTabs");
const cardsTabEl = document.getElementById("cardsTab");
const decksTabEl = document.getElementById("decksTab");
const savedDeckCountEl = document.getElementById("savedDeckCount");
const editingNoteEl = document.getElementById("editingNote");
const saveDeckRowEl = document.getElementById("saveDeckRow");
const deckNameInput = document.getElementById("deckNameInput");
const saveDeckBtn = document.getElementById("saveDeckBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const noDecksEl = document.getElementById("noDecks");
const savedDeckListEl = document.getElementById("savedDeckList");
const playBarEl = document.getElementById("playBar");
const playBtn = document.getElementById("playBtn");
const findBtn = document.getElementById("findBtn");
const homeDeckEl = document.getElementById("homeDeck");
const homeDeckTitleEl = document.getElementById("homeDeckTitle");
const pickDeckEl = document.getElementById("pickDeck");

const queueTextEl = document.getElementById("queueText");
const cpuInsteadBtn = document.getElementById("cpuInsteadBtn");
const cancelQueueBtn = document.getElementById("cancelQueueBtn");

const oppSideEl = document.getElementById("oppSide");
const youSideEl = document.getElementById("youSide");
const oppLabelEl = document.getElementById("oppLabel");
const youLabelEl = document.getElementById("youLabel");
const oppScoreEl = document.getElementById("oppScore");
const youScoreEl = document.getElementById("youScore");
const oppTimerEl = document.getElementById("oppTimer");
const youTimerEl = document.getElementById("youTimer");
const oppHandEl = document.getElementById("oppHand");
const youHandEl = document.getElementById("youHand");
const boardEl = document.getElementById("ccBoard");
const resignBtn = document.getElementById("resignBtn");

const resultPanelEl = document.getElementById("resultPanel");
const resultScoreEl = document.getElementById("resultScore");
const resultCoinsEl = document.getElementById("resultCoins");
const resultXpEl = document.getElementById("resultXp");
const deckLevelEl = document.getElementById("deckLevel");
const deckXpBarEl = document.getElementById("deckXpBar");
const deckXpEl = document.getElementById("deckXp");
const resultStrikesEl = document.getElementById("resultStrikes");
const packsLink = document.getElementById("packsLink");
const resultTextEl = document.getElementById("resultText");
const claimChoicesEl = document.getElementById("claimChoices");
const claimBtn = document.getElementById("claimBtn");
const againBtn = document.getElementById("againBtn");

let profile = null;
let profileKnown = false;
let view = null;
let busy = false; // starting a game, claiming… (buttons wait)
let selectedUids = []; // cards picked for the next hand (the deck, kept by DeckDraft)
let pickTab = "cards"; // "cards" or "decks"
let selectedDeckId = null; // saved deck chosen for the next hand
let editingDeckId = null; // saved deck being changed on the Cards tab
let beforeEdit = null; // the deck to go back to if that edit is cancelled
let rarityFilter = "all"; // which of the player's cards the Cards tab shows
let cardSort = "number"; // see CARD_SORTS
let queue = null; // looking for a player: { hand, started, tick, ping }
let game = null; // the match on screen (see openMatch)
let claimPick = null;

function setStatus(text, color) {
  statusEl.textContent = text;
  statusEl.dataset.color = color || "";
}

function showView(name) {
  view = name;
  Object.entries(views).forEach(([key, el]) => {
    el.hidden = key !== name;
  });
  playBarEl.hidden = name !== "home" && name !== "deck";
  // The bottom bar hides while looking for a player or during a game; it's
  // back once the game is over.
  updateNav();
}

function updateNav() {
  WildFlipNav.setHidden(view === "queue" || (view === "play" && resultPanelEl.hidden));
}

const online = CardStore.mode === "online";

// --- How to play ---
document.getElementById("scoreRule").textContent = SCORING === "board"
  ? "When all 9 squares are full, the player with more cards in their color on the board wins. With 9 squares there's always a winner."
  : "When all 9 squares are full, each player scores the cards in their color on the board plus any card still in their hand. The higher score wins; a tie is a draw.";
document.getElementById("strikeRule").textContent =
  `Against other players, lose and each of your cards that ended in the winner's color gets a strike. ` +
  `A card's ${STRIKES_TO_LOSE === 3 ? "third" : `${STRIKES_TO_LOSE}th`} strike removes that copy from your collection. ` +
  "Games against the computer never cost you cards.";
document.getElementById("clockRule").textContent =
  `Against other players each turn has ${TURN_SECONDS} seconds. When time runs out the computer plays for you, ` +
  `and running out ${MAX_TIMEOUTS === 2 ? "twice" : `${MAX_TIMEOUTS} times`} in a row forfeits the game.`;
document.getElementById("levelRule").textContent =
  "Every finished game earns experience (XP), more for a win and more against people. As your level rises, " +
  "the computer makes fewer mistakes and gets more boosts. It plays low common cards boosted (gold numbers) to " +
  "match yours, so a card you claim from it is always a plain low common. Rarer cards come from packs and from " +
  "beating other players. Levels also unlock cards: stronger Rares as you climb, the first Epic cards (and the " +
  "Apex Pack) at level 5, and Legendary cards at level 10. Packs hold fewer commons at higher levels.";
document.getElementById("upgradeRule").textContent =
  `Upgrade a card from its close-up in Collection: use duplicate copies to raise one side of a copy by 1 ` +
  `(each side once, up to ${UPGRADE_MAX} upgrades). Upgrades stay with that copy; a card someone claims ` +
  "from you never carries them.";
document.getElementById("coinRule").textContent =
  `Every game earns coins: against the computer ${rewardText("cpu")}; against another player ${rewardText("live")}. ` +
  "Spend them on card packs.";

// --- Menu ---
// How to Play opens the rules on Home; admins also get their tools.
document.getElementById("rulesMenuItem").addEventListener("click", (e) => {
  e.preventDefault();
  if (!profile || (view !== "home" && view !== "deck")) return;
  if (view !== "home") WildFlipNav.go("home");
  const rules = document.getElementById("rulesBox");
  rules.open = true;
  rules.scrollIntoView({ behavior: "smooth", block: "start" });
  closeMenu(); // menu.js
});
CardOnline.subscribe((s) => {
  document.querySelectorAll(".cc-admin-item").forEach((item) => {
    item.hidden = !(s.active && s.admin);
  });
});

// --- Online status ---
const setupCloudEl = document.getElementById("setupCloud");
const setupCloudTextEl = document.getElementById("setupCloudText");
const setupCloudActionsEl = document.getElementById("setupCloudActions");
const cloudBadgeEl = document.getElementById("cloudBadge");

CardOnline.subscribe((s) => {
  cloudBadgeEl.hidden = !s.enabled;
  cloudBadgeEl.textContent = online ? `☁️ ${onlineStatusText(s)}` : "☁️ Sign in to play online";

  setupCloudEl.hidden = !s.enabled;
  setupCloudActionsEl.innerHTML = "";
  if (online) {
    const who = s.user ? s.user.name || s.user.email : "your Google account";
    setupCloudTextEl.textContent =
      `Signed in as ${who}. Your online player is separate from any player saved on this device, which you can still play when signed out.`;
    setupCloudActionsEl.append(signOutButton());
    if (!nameInput.value && s.user && s.user.name) nameInput.value = s.user.name.split(" ")[0];
  } else {
    setupCloudTextEl.textContent = "Want to play other people, on any device? Sign in to make an online player.";
    setupCloudActionsEl.append(googleSignInButton());
  }
  if (view === "deck" || view === "home") updatePlayButtons();
  // Online but the profile can't load: say why, and how to play anyway.
  if (online && !profileKnown && (s.status === "offline" || s.status === "error")) {
    setStatus(`${onlineStatusText(s)} Online play needs a connection; sign out in Settings to play on this device.`);
  }
});

// --- New player ---
function showSetup() {
  showView("setup");
  setupNoteEl.textContent = online
    ? `Pick a name for your online player. You'll start with ${STARTER_SIZE} random cards and 🪙 ${STARTING_COINS}.`
    : `Enter your name to create your player. You'll start with ${STARTER_SIZE} random cards.`;
  setStatus("Welcome! Who's playing?");
  nameInput.focus();
}

// The new profile arrives through CardStore.onProfile, which opens the deck.
setupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  run(() => CardStore.createProfile(cleanName(nameInput.value)), "Creating your player…");
});

// Runs an action, keeping buttons off meanwhile and showing its error.
async function run(action, pendingText) {
  if (busy) return;
  busy = true;
  if (pendingText) setStatus(pendingText);
  if (view === "deck" || view === "home") updatePlayButtons();
  try {
    await action();
  } catch (err) {
    console.warn("WildFlip:", err);
    setStatus(err.message || "Something went wrong. Please try again.");
  } finally {
    busy = false;
    if (view === "deck" || view === "home") updatePlayButtons();
  }
}

// --- Home and Play ---
// Home shows the player and their deck; Play is where the deck is chosen.
// Both have the play buttons. The bottom bar switches between them.
function showDeck(notice) {
  loadDeck();
  if (WildFlipNav.route() === "play") showPlay(notice);
  else showHome(notice);
}

function showHome(notice) {
  showView("home");
  // Wake the online server now, so the game starts without a cold-start wait.
  CardStore.warmUp();
  renderProfileBar();
  deckNoticeEl.hidden = !notice;
  deckNoticeEl.textContent = notice || "";
  // New players are offered the tour until they've taken it or played.
  let toured = true;
  try {
    toured = Boolean(localStorage.getItem("wildflipTourDone"));
  } catch {
    // Storage blocked: don't nag.
  }
  if (!toured && !profile.stats.played) {
    deckNoticeEl.hidden = false;
    if (notice) deckNoticeEl.append(" ");
    deckNoticeEl.append("New to WildFlip? ");
    const link = document.createElement("a");
    link.href = "cards-tour.html";
    link.className = "cc-link";
    link.textContent = "Take the 2-minute tour";
    deckNoticeEl.append(link, ".");
  }
  renderHome();
}

function showPlay(notice) {
  showView("deck");
  CardStore.warmUp();
  editingDeckId = null;
  showPickTab(selectedDeckId ? "decks" : "cards");
  if (notice) setStatus(notice);
}

// The deck as last picked (DeckDraft), or the last hand played.
function loadDeck() {
  const draft = DeckDraft.read(profile);
  selectedUids = draft.uids;
  selectedDeckId = draft.deckId;
}

// Keeps the picked cards for the next visit and the other pages.
function saveDraft() {
  if (editingDeckId) return; // a saved deck being edited isn't the deck in play
  const next = DeckDraft.write(profile, { uids: selectedUids, deckId: selectedDeckId });
  selectedDeckId = next.deckId;
}

function renderHome() {
  const deck = profile.decks.find((d) => d.id === selectedDeckId);
  homeDeckTitleEl.textContent = deck ? `Your deck: ${deck.name}` : `Your deck (${selectedUids.length} / ${HAND_SIZE})`;
  renderDeckStrip(homeDeckEl);
  if (playableCollection(profile).length < HAND_SIZE) setStatus(`You need at least ${HAND_SIZE} cards to play.`);
  else if (selectedUids.length === HAND_SIZE) setStatus(`Ready, ${profile.name}? Pick who to play.`);
  else setStatus(`Your deck needs ${HAND_SIZE} cards. Tap Play to choose them.`);
  updatePlayButtons();
}

// The deck's cards, with an empty slot for each one still to pick.
function renderDeckStrip(container) {
  container.innerHTML = "";
  selectedUids.forEach((uid) => {
    const owned = copyOf(uid);
    if (!owned) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cc-hand-card";
    btn.dataset.uid = uid;
    btn.setAttribute("aria-label", `${getCard(owned.cardId).name}: close-up`);
    btn.appendChild(createCardEl(owned.cardId, "neutral", copyLook(owned)));
    container.appendChild(btn);
  });
  for (let i = selectedUids.length; i < HAND_SIZE; i++) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "cc-hand-card cc-empty-slot";
    empty.dataset.empty = "1";
    empty.setAttribute("aria-label", "Empty: choose a card");
    empty.innerHTML = "<span>+</span>";
    container.appendChild(empty);
  }
}

// Home's deck opens Play to change it. On Play, tapping a card in the deck
// takes it out, and an empty slot points to the cards below.
homeDeckEl.addEventListener("click", (e) => {
  if (e.target.closest(".cc-hand-card")) WildFlipNav.go("play");
});

pickDeckEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-hand-card");
  if (!btn) return;
  if (btn.dataset.empty) deckGridEl.scrollIntoView({ behavior: "smooth", block: "start" });
  else toggleCard(btn.dataset.uid);
});

// Picks a card for the deck, or takes it out.
function toggleCard(uid) {
  if (selectedUids.includes(uid)) {
    selectedUids = selectedUids.filter((u) => u !== uid);
  } else if (selectedUids.length < HAND_SIZE) {
    selectedUids.push(uid);
  }
  selectedDeckId = null; // hand-picked cards are no longer a saved deck
  saveDraft();
  renderDeck();
}

function refreshDeck() {
  if (view === "home") renderHome();
  else if (view === "deck") {
    if (pickTab === "decks" && !selectedDeckId) showPickTab("cards");
    else renderDeck();
  }
}

// Another page (or tab) changed the deck.
window.addEventListener("wildflip:deck", (e) => {
  if (!profile || editingDeckId) return;
  const { uids, deckId } = e.detail;
  if (uids.join() === selectedUids.join() && deckId === selectedDeckId) return;
  selectedUids = [...uids];
  selectedDeckId = deckId;
  refreshDeck();
});

// The bottom bar's Home and Play.
window.addEventListener("wildflip:route", (e) => {
  if (!profile || view === "setup" || view === "queue") return;
  if (view === "play") {
    // Leaving a finished game (an active one has no bottom bar).
    if (game && game.latest && game.latest.match.status === "active") return;
    closeMatch();
    if (profile.pendingClaim) {
      showPendingClaim();
      setStatus("Pick your card first: you won it!");
      return;
    }
  }
  if (e.detail === "play") showPlay();
  else showHome();
  window.scrollTo(0, 0);
});

function renderProfileBar() {
  deckNameEl.textContent = profile.name;
  const { wins, losses, draws } = profile.stats;
  const record = draws ? `${wins}W – ${losses}L – ${draws}D` : `${wins}W – ${losses}L`;
  deckRecordEl.textContent = `${record} · ${playableCollection(profile).length} cards`;
  const { level, into, needed } = levelInfo(profile.xp);
  deckLevelEl.textContent = `Level ${level}`;
  deckXpBarEl.hidden = needed === null;
  deckXpBarEl.firstElementChild.style.width = needed ? `${(into / needed) * 100}%` : "100%";
  deckXpBarEl.setAttribute("aria-valuemax", String(needed || 1));
  deckXpBarEl.setAttribute("aria-valuenow", String(needed ? into : 1));
  deckXpBarEl.setAttribute("aria-label", `Level ${level} progress`);
  deckXpEl.textContent = needed === null ? `${profile.xp.toLocaleString()} XP` : `${into} / ${needed} XP`;
  deckCoinsEl.textContent = profile.coins.toLocaleString();
}

function showPickTab(tab) {
  pickTab = tab;
  pickTabsEl.querySelectorAll("[role=tab]").forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle("selected", on);
    btn.setAttribute("aria-selected", String(on));
  });
  cardsTabEl.hidden = tab !== "cards";
  decksTabEl.hidden = tab !== "decks";
  renderDeck();
}

pickTabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[role=tab]");
  if (btn) showPickTab(btn.dataset.tab);
});

// An owned copy by uid (for its strikes and upgrades).
function copyOf(uid) {
  return profile && profile.collection.find((o) => o.uid === uid);
}

function renderDeck() {
  savedDeckCountEl.textContent = profile.decks.length;
  // Copies that were lost (third strike) drop out of the hand.
  const playable = new Set(playableCollection(profile).map((o) => o.uid));
  selectedUids = selectedUids.filter((uid) => playable.has(uid));
  renderDeckStrip(pickDeckEl);
  if (pickTab === "decks") {
    renderSavedDecks();
    return;
  }
  renderRarityFilter();
  deckGridEl.innerHTML = "";
  sortedCollection(profile, cardSort).forEach((owned) => {
    if (rarityFilter !== "all" && getCard(owned.cardId).rarity !== rarityFilter) return;
    const btn = document.createElement("button");
    btn.className = "cc-pick";
    btn.dataset.uid = owned.uid;
    const picked = selectedUids.includes(owned.uid);
    btn.classList.toggle("selected", picked);
    btn.setAttribute("aria-pressed", String(picked));
    btn.appendChild(createCardEl(owned.cardId, "neutral", copyLook(owned)));
    deckGridEl.appendChild(btn);
  });

  const count = selectedUids.length;
  const editing = profile.decks.find((d) => d.id === editingDeckId);
  editingNoteEl.hidden = !editing;
  if (editing) editingNoteEl.textContent = `Editing "${editing.name}": change its cards or name, then tap Save Deck.`;
  // Saving needs a full hand; a new deck also needs room in the deck list.
  saveDeckRowEl.hidden = count !== HAND_SIZE && !editing;
  saveDeckBtn.textContent = editing ? "Save Deck" : "Save as Deck";
  saveDeckBtn.disabled = count !== HAND_SIZE || (!editing && profile.decks.length >= MAX_DECKS);
  cancelEditBtn.hidden = !editing;
  if (!editing && document.activeElement !== deckNameInput) deckNameInput.placeholder = nextDeckName(profile);

  if (playableCollection(profile).length < HAND_SIZE) {
    setStatus(`You need at least ${HAND_SIZE} cards to play.`);
  } else if (!editing && count === HAND_SIZE && profile.decks.length >= MAX_DECKS) {
    setStatus(`Hand ready. You have the most decks you can save (${MAX_DECKS}).`);
  } else if (count === HAND_SIZE && !editing) {
    setStatus("Your deck is ready. Tap a card to take it out, or play!");
  } else {
    setStatus(`Choose ${HAND_SIZE} cards for your deck: ${count} / ${HAND_SIZE}`);
  }
  updatePlayButtons();
}

// Filter chips for the rarities the player owns ("All" plus each), shown
// once there's more than one. Picked cards stay picked while filtered out.
function renderRarityFilter() {
  const owned = raritiesOf(playableCollection(profile).map((o) => getCard(o.cardId)));
  if (!owned.includes(rarityFilter)) rarityFilter = "all";
  rarityFilterEl.hidden = owned.length < 2;
  rarityFilterEl.innerHTML = "";
  ["all", ...owned].forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-option";
    btn.dataset.rarity = r;
    btn.textContent = r === "all" ? "All" : RARITIES[r].label;
    if (r !== "all") btn.style.setProperty("--rarity-color", RARITIES[r].color);
    btn.classList.toggle("selected", r === rarityFilter);
    btn.setAttribute("aria-pressed", String(r === rarityFilter));
    rarityFilterEl.appendChild(btn);
  });
}

rarityFilterEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-rarity]");
  if (!btn) return;
  rarityFilter = btn.dataset.rarity;
  renderDeck();
});

sortSelect.addEventListener("change", () => {
  cardSort = sortSelect.value;
  renderDeck();
});

// The hand to play with: { uids, deckId }, or null if none is ready.
function chosenHand() {
  if (view === "deck" && pickTab === "decks") {
    const deck = profile.decks.find((d) => d.id === selectedDeckId && deckCardIds(profile, d));
    return deck ? { uids: [...deck.uids], deckId: deck.id } : null;
  }
  if (editingDeckId || selectedUids.length !== HAND_SIZE) return null;
  return { uids: [...selectedUids], deckId: selectedDeckId };
}

function updatePlayButtons() {
  const ready = Boolean(chosenHand());
  playBtn.disabled = !ready || busy;
  findBtn.hidden = !CardOnline.enabled;
  // Signed out, the button signs in instead.
  findBtn.textContent = online ? "Find a Player" : "Sign In to Play People";
  findBtn.disabled = busy || (online && !ready);
}

// --- Saved decks ---
function renderSavedDecks() {
  noDecksEl.hidden = profile.decks.length > 0;
  savedDeckListEl.innerHTML = "";
  profile.decks.forEach((deck) => {
    const ids = deckCardIds(profile, deck);
    const row = document.createElement("div");
    row.className = "cc-deck-row";
    row.classList.toggle("selected", deck.id === selectedDeckId);
    row.dataset.id = deck.id;

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "cc-deck-pick";
    pick.dataset.action = "pick";
    pick.disabled = !ids;
    pick.setAttribute("aria-pressed", String(deck.id === selectedDeckId));
    const head = document.createElement("span");
    head.className = "cc-deck-head";
    const name = document.createElement("strong");
    name.textContent = deck.name;
    const info = document.createElement("span");
    info.className = "cc-muted";
    if (ids) {
      const cards = ids.map(getCard);
      const strength = cards.reduce((sum, card) => sum + cardTotal(card), 0);
      const better = rarityCounts(cards);
      info.textContent = `Strength ${strength}${better ? ` · ${better}` : ""}`;
    } else {
      info.textContent = "A card in this deck is missing";
    }
    head.append(name, info);
    const cardsRow = document.createElement("span");
    cardsRow.className = "cc-deck-cards";
    if (ids) deck.uids.forEach((uid, i) => cardsRow.appendChild(createCardEl(ids[i], "neutral", copyLook(copyOf(uid)))));
    pick.append(head, cardsRow);

    const actions = document.createElement("span");
    actions.className = "cc-deck-actions";
    [["edit", "Edit"], ["delete", "Delete"]].forEach(([action, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cc-link-btn";
      btn.dataset.action = action;
      btn.textContent = label;
      btn.setAttribute("aria-label", `${label} ${deck.name}`);
      actions.appendChild(btn);
    });
    row.append(pick, actions);
    savedDeckListEl.appendChild(row);
  });

  const chosen = profile.decks.find((d) => d.id === selectedDeckId);
  if (chosen) setStatus(`Deck "${chosen.name}" chosen. Pick who to play when you're ready.`);
  else if (profile.decks.length) setStatus("Pick one of your saved decks.");
  else setStatus("You haven't saved any decks yet.");
  updatePlayButtons();
}

savedDeckListEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  const row = e.target.closest(".cc-deck-row");
  if (!btn || !row) return;
  const deck = profile.decks.find((d) => d.id === row.dataset.id);
  if (!deck) return;
  if (btn.dataset.action === "pick") {
    selectedDeckId = deck.id;
    selectedUids = [...deck.uids];
    saveDraft();
    renderDeck();
  } else if (btn.dataset.action === "edit") {
    // Open the deck's cards on the Cards tab to change them or the name.
    beforeEdit = { uids: [...selectedUids], deckId: selectedDeckId };
    editingDeckId = deck.id;
    selectedDeckId = null;
    selectedUids = [...deck.uids];
    deckNameInput.value = deck.name;
    showPickTab("cards");
  } else if (btn.dataset.action === "delete") {
    if (!confirm(`Delete the deck "${deck.name}"? Its cards stay in your collection.`)) return;
    if (selectedDeckId === deck.id) {
      selectedDeckId = null;
      saveDraft();
    }
    run(() => CardStore.deleteDeck(deck.id));
  }
});

saveDeckBtn.addEventListener("click", () => {
  const wasEditing = Boolean(editingDeckId);
  run(async () => {
    const deck = await CardStore.saveDeck({ id: editingDeckId, name: deckNameInput.value, uids: selectedUids });
    editingDeckId = null;
    selectedDeckId = deck.id;
    saveDraft();
    deckNameInput.value = "";
    renderDeck();
    setStatus(wasEditing ? `Saved changes to "${deck.name}".` : `Saved "${deck.name}". It's in My Decks.`);
  });
});

cancelEditBtn.addEventListener("click", () => {
  editingDeckId = null;
  deckNameInput.value = "";
  if (beforeEdit) {
    selectedUids = beforeEdit.uids;
    selectedDeckId = beforeEdit.deckId;
    beforeEdit = null;
    saveDraft();
  }
  showPickTab("decks");
});

deckGridEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-pick");
  if (btn) toggleCard(btn.dataset.uid);
});

playBtn.addEventListener("click", () => {
  const hand = chosenHand();
  if (!hand) return;
  run(async () => {
    const id = await CardStore.startCpuMatch(hand.uids, hand.deckId);
    openMatch(id, true);
  }, "Starting a game…");
});

findBtn.addEventListener("click", () => {
  if (!online) {
    CardOnline.signIn();
    return;
  }
  const hand = chosenHand();
  if (hand) startQueue(hand);
});

// --- Find a Player ---
// Waits in the queue (checking in every QUEUE_PING_MS, which also looks for
// someone to play) until the server pairs us: our profile's activeMatch is
// then set, or joining returns the match right away.
function startQueue(hand) {
  showView("queue");
  setStatus("Find a Player");
  cpuInsteadBtn.hidden = true;
  queue = { hand, started: Date.now() };
  queue.tick = setInterval(() => {
    updateQueueText();
    CardStore.warmUp(); // so the first move doesn't wait for the server to wake
  }, 1000);
  queue.ping = setInterval(pingQueue, QUEUE_PING_MS);
  updateQueueText();
  pingQueue();
}

function updateQueueText() {
  if (!queue) return;
  const waited = Date.now() - queue.started;
  const clock = formatClock(Math.floor(waited / 1000));
  if (waited >= QUEUE_FALLBACK_MS) {
    cpuInsteadBtn.hidden = false;
    queueTextEl.textContent = `No one's free yet (${clock}). Keep waiting, or play the computer instead.`;
  } else {
    queueTextEl.textContent = `Looking for another player… ${clock}`;
  }
}

async function pingQueue() {
  const waiting = queue;
  if (!waiting) return;
  try {
    const joined = await CardStore.joinQueue(waiting.hand.uids, waiting.hand.deckId);
    if (queue === waiting && joined.status === "matched") enterMatch(joined.matchId);
  } catch (err) {
    if (queue !== waiting) return;
    stopQueue();
    showDeck();
    setStatus(err.message || "Couldn't join the queue. Please try again.");
  }
}

function stopQueue() {
  if (!queue) return;
  clearInterval(queue.tick);
  clearInterval(queue.ping);
  queue = null;
}

function enterMatch(id) {
  stopQueue();
  openMatch(id, true);
}

// Leaves the queue; resolves to a match id if we were paired meanwhile.
async function leaveQueue() {
  stopQueue();
  const left = await CardStore.leaveQueue();
  return left.status === "matched" ? left.matchId : null;
}

cancelQueueBtn.addEventListener("click", () => {
  const hand = queue && queue.hand;
  run(async () => {
    const matchId = await leaveQueue();
    if (matchId) openMatch(matchId, true);
    else {
      showDeck();
      if (hand) setStatus("Stopped looking for a player.");
    }
  });
});

cpuInsteadBtn.addEventListener("click", () => {
  const hand = queue && queue.hand;
  if (!hand) return;
  run(async () => {
    const matchId = (await leaveQueue()) || (await CardStore.startCpuMatch(hand.uids, hand.deckId));
    openMatch(matchId, true);
  }, "Starting a game…");
});

// --- The match on screen ---
// game: { id, fresh, latest (the newest view), seat, opp, colors, live,
//   oppName, board (as shown so far), shown (moves shown), pending (our move,
//   shown before the server confirmed it), animating, selected (hand index),
//   oppPick, note (said before the next turn message), resultShown }
function openMatch(id, fresh) {
  closeMatch();
  showView("play");
  resultPanelEl.hidden = true;
  updateNav();
  boardEl.hidden = false;
  oppSideEl.hidden = false;
  youSideEl.hidden = false;
  resignBtn.hidden = true;
  boardEl.innerHTML = "";
  oppHandEl.innerHTML = "";
  youHandEl.innerHTML = "";
  oppLabelEl.textContent = "";
  youLabelEl.textContent = "";
  oppScoreEl.textContent = "";
  youScoreEl.textContent = "";
  setStatus("Loading the game…");
  game = {
    id, fresh, latest: null, board: Array(9).fill(null), shown: 0, pending: null, animating: false,
    selected: null, oppPick: null, note: "", resultShown: false, timeoutAsked: null,
  };
  game.clock = setInterval(() => {
    updateClocks();
    // Keeps the server awake through a long think (warmUp waits a few
    // minutes between pings).
    CardStore.warmUp();
  }, 250);
  try {
    game.unwatch = CardStore.watchMatch(id, onMatchView, (err) => matchFailed(id, err));
  } catch (err) {
    matchFailed(id, err);
  }
}

function closeMatch() {
  if (!game) return;
  if (game.unwatch) game.unwatch();
  clearInterval(game.clock);
  clearTimeout(game.wait);
  game = null;
}

function matchFailed(id, err) {
  if (!game || game.id !== id) return;
  console.warn("WildFlip: couldn't load the game", err);
  closeMatch();
  showDeck();
  setStatus("Couldn't load that game.");
}

function onMatchView(v) {
  if (!game) return;
  const first = !game.latest;
  game.latest = v;
  if (first) setUpMatch(v);
  else pump();
}

function setUpMatch({ match, seat }) {
  game.seat = seat;
  game.opp = otherSeat(seat);
  game.colors = match.colors;
  game.live = match.mode === "live";
  game.oppName = match.seats[game.opp].name;
  // The computer's level is the player's: it plays to their experience.
  oppLabelEl.textContent = game.live ? `👤 ${game.oppName}` : `🤖 ${game.oppName}${match.cpu ? ` · Lv ${match.cpu.level}` : ""}`;
  youLabelEl.textContent = match.seats[seat].name;
  oppSideEl.dataset.color = game.colors[game.opp];
  youSideEl.dataset.color = game.colors[seat];

  if (!game.fresh) {
    // Back to a game already under way: show where it stands.
    match.moves.forEach((move) => applyMove(game.board, move));
    game.shown = match.moves.length;
    renderBoard();
    pump();
    return;
  }
  renderBoard();
  const youFirst = match.first === seat;
  game.note = youFirst
    ? "Coin toss: you go first as Red!"
    : `Coin toss: ${game.oppName} goes first as Red. You're Blue.`;
  renderSides();
  setStatus(game.note, game.colors[match.first]);
  // Give the coin toss a moment before the first move shows.
  game.animating = true;
  game.wait = setTimeout(() => {
    game.animating = false;
    pump();
  }, youFirst ? 0 : CPU_THINK_MS);
}

function applyMove(board, move) {
  const color = game.colors[move.seat];
  board[move.slot] = { cardId: move.cardId, color, seat: move.seat, ...(move.boost ? { boost: move.boost } : {}) };
  move.flips.forEach((i) => {
    board[i].color = color;
  });
}

function rebuildBoard() {
  game.board = Array(9).fill(null);
  game.latest.match.moves.slice(0, game.shown).forEach((move) => applyMove(game.board, move));
}

// Shows the next move not on screen yet, one at a time; once caught up,
// shows whose turn it is, or the result.
function pump() {
  if (!game || game.animating || !game.latest) return;
  const { match } = game.latest;
  if (game.shown < match.moves.length) {
    const move = match.moves[game.shown];
    if (game.pending && move.seat === game.seat) {
      // Our own move, already on the board since we played it.
      const same = move.slot === game.pending.slot && move.cardId === game.pending.cardId;
      game.pending = null;
      game.shown++;
      if (!same) {
        rebuildBoard();
        renderBoard();
      }
      pump();
      return;
    }
    showMove(move);
    return;
  }
  renderTurn();
  if (match.status === "finished") showFinished();
}

function showMove(move) {
  const theirs = move.seat !== game.seat;
  game.animating = true;
  const place = () => {
    applyMove(game.board, move);
    game.shown++;
    game.oppPick = null;
    renderBoard(move.slot, move.flips);
    renderSides();
    game.note = moveNote(move);
    game.wait = setTimeout(() => {
      game.animating = false;
      pump();
    }, FLIP_MS);
  };
  if (theirs && !game.live && !move.auto) {
    // The computer "thinks", then lifts the card it's about to play.
    const lead = game.note ? `${game.note} ` : "";
    game.note = "";
    setStatus(`${lead}${game.oppName} is thinking…`, game.colors[game.opp]);
    renderSides();
    // Time already spent waiting for the server counts as thinking time.
    const waited = game.sentAt ? Date.now() - game.sentAt : 0;
    game.sentAt = 0;
    game.wait = setTimeout(() => {
      game.oppPick = oppHandCount() - 1;
      renderHand("opp");
      game.wait = setTimeout(place, CPU_SHOW_PICK_MS);
    }, Math.max(0, CPU_THINK_MS - waited));
  } else {
    place();
  }
}

function moveNote(move) {
  const n = move.flips.length;
  const cards = `${n} card${n === 1 ? "" : "s"}`;
  if (move.seat === game.seat) {
    const auto = move.auto ? "Time ran out, so the computer played for you. " : "";
    return n ? `${auto}You flipped ${cards}!` : auto.trim();
  }
  const auto = move.auto ? `${game.oppName} ran out of time, so the computer played for them. ` : "";
  return n ? `${auto}${game.oppName} flipped ${n} of your cards.` : auto.trim();
}

function isMyTurn() {
  const { match } = game.latest;
  return match.status === "active" && match.turn === game.seat && !game.pending && !game.animating &&
    game.shown === match.moves.length;
}

// Our cards in hand, less any already on the board (the hand and the board
// can arrive separately) and one we've played that isn't confirmed yet.
function myHand() {
  const played = new Set(game.latest.match.board.filter((s) => s && s.seat === game.seat).map((s) => s.copyUid));
  return game.latest.hand.filter((c) => !played.has(c.uid) && (!game.pending || c.uid !== game.pending.uid));
}

function oppHandCount() {
  return HAND_SIZE - game.latest.match.moves.slice(0, game.shown).filter((m) => m.seat === game.opp).length;
}

function renderTurn() {
  const { match } = game.latest;
  const myTurn = isMyTurn();
  if (myTurn && myHand().length === 1) game.selected = 0;
  renderSides();
  boardEl.classList.toggle("placing", myTurn);
  resignBtn.hidden = match.status !== "active";
  if (match.status !== "active") return;
  const lead = game.note ? `${game.note} ` : "";
  // While our move is on its way the note stays for the opponent's reply.
  if (!game.pending) game.note = "";
  if (myTurn) {
    setStatus(`${lead}${game.selected === null ? "Your turn: pick a card, then a square." : "Now tap an empty square."}`, game.colors[game.seat]);
  } else {
    const waiting = game.live ? `Waiting for ${game.oppName}…` : `${game.oppName} is thinking…`;
    setStatus(`${lead}${waiting}`, game.colors[game.opp]);
  }
}

function renderSides() {
  renderHand("you");
  renderHand("opp");
  youScoreEl.textContent = colorCount(game.board, game.colors[game.seat]);
  oppScoreEl.textContent = colorCount(game.board, game.colors[game.opp]);
}

function renderHand(side) {
  const mine = side === "you";
  const handEl = mine ? youHandEl : oppHandEl;
  const color = game.colors[mine ? game.seat : game.opp];
  const { match } = game.latest;
  handEl.innerHTML = "";
  handEl.classList.toggle("waiting", mine ? !isMyTurn() : match.turn !== game.opp);
  if (mine) {
    const myTurn = isMyTurn();
    myHand().forEach((c, i) => {
      const btn = document.createElement("button");
      btn.className = "cc-hand-card";
      btn.dataset.index = i;
      const picked = game.selected === i;
      btn.classList.toggle("selected", picked);
      btn.disabled = !myTurn;
      btn.setAttribute("aria-pressed", String(picked));
      const copy = copyOf(c.uid);
      btn.appendChild(createCardEl(c.cardId, color, { strikes: copy ? copy.strikes : 0, boost: c.boost }));
      handEl.appendChild(btn);
    });
    return;
  }
  // The opponent's cards stay hidden until they're played.
  for (let i = 0; i < oppHandCount(); i++) {
    const wrap = document.createElement("div");
    wrap.className = "cc-hand-card";
    wrap.classList.toggle("selected", game.oppPick === i);
    wrap.appendChild(hiddenCardEl(color));
    handEl.appendChild(wrap);
  }
}

function hiddenCardEl(color) {
  const el = document.createElement("div");
  el.className = `cc-card-hidden ${color}`;
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Face-down card");
  return el;
}

function renderBoard(placed = null, flipped = []) {
  const { match } = game.latest;
  const won = match.status === "finished" && match.result.winner === game.seat;
  boardEl.innerHTML = "";
  game.board.forEach((slot, i) => {
    const btn = document.createElement("button");
    btn.className = "cc-slot";
    btn.dataset.index = i;
    btn.setAttribute("role", "gridcell");
    btn.setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, Column ${(i % 3) + 1}`);
    if (slot) {
      btn.disabled = true;
      const flipping = flipped.includes(i);
      const other = slot.color === "red" ? "blue" : "red";
      // A flipping card shows its old color until the flip's midpoint.
      const card = createCardEl(slot.cardId, flipping ? other : slot.color, { boost: slot.boost });
      if (i === placed) card.classList.add("cc-placed");
      if (flipping) {
        card.classList.add("cc-flipping");
        setTimeout(() => card.classList.replace(other, slot.color), FLIP_MS / 2);
      }
      if (won && slot.seat === game.opp && slot.color === game.colors[game.seat]) btn.classList.add("cc-claimable");
      btn.appendChild(card);
    }
    boardEl.appendChild(btn);
  });
}

youHandEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-hand-card");
  if (!btn || btn.disabled || !game || !isMyTurn()) return;
  game.selected = Number(btn.dataset.index);
  renderHand("you");
  setStatus("Now tap an empty square.", game.colors[game.seat]);
});

boardEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-slot");
  if (!btn || btn.disabled || !game || !isMyTurn()) return;
  const card = myHand()[game.selected];
  if (!card) {
    setStatus("Pick a card from your hand first.", game.colors[game.seat]);
    return;
  }
  playMine(card, Number(btn.dataset.index));
});

// Shows our move straight away, then sends it; the server's version of the
// match replaces it when it arrives (or it's taken back if refused).
async function playMine(card, slot) {
  const id = game.id;
  const color = game.colors[game.seat];
  const flips = findFlips(game.board, slot, card.cardId, color, card.boost);
  game.pending = { slot, cardId: card.cardId, uid: card.uid };
  game.sentAt = Date.now();
  game.selected = null;
  applyMove(game.board, { seat: game.seat, slot, cardId: card.cardId, flips, ...(card.boost ? { boost: card.boost } : {}) });
  renderBoard(slot, flips);
  game.note = moveNote({ seat: game.seat, flips });
  renderTurn();
  try {
    await CardStore.playMove(id, card.uid, slot);
  } catch (err) {
    if (!game || game.id !== id || !game.pending) return;
    game.pending = null;
    game.note = "";
    rebuildBoard();
    renderBoard();
    renderTurn();
    setStatus(err.message || "That move didn't go through. Please try again.", color);
  }
}

resignBtn.addEventListener("click", () => {
  if (!game || !game.latest || game.latest.match.status !== "active") return;
  const strikes = game.live ? " Your cards in their color will get strikes." : "";
  if (!confirm(`Resign this game? It counts as a loss.${strikes}`)) return;
  const id = game.id;
  CardStore.resign(id).catch((err) => {
    if (game && game.id === id) setStatus(err.message || "Couldn't resign. Please try again.");
  });
});

// Live games: each player's turn clock. When one runs out (by the server's
// clock, give or take), either player's page asks the server to act on it.
function updateClocks() {
  if (!game || !game.latest) return;
  const { match } = game.latest;
  const ticking = match.mode === "live" && match.status === "active" && Boolean(match.turnDeadline);
  youTimerEl.hidden = !ticking || match.turn !== game.seat;
  oppTimerEl.hidden = !ticking || match.turn !== game.opp;
  if (!ticking) return;
  const left = Math.max(0, Math.ceil((match.turnDeadline - Date.now()) / 1000));
  const timerEl = match.turn === game.seat ? youTimerEl : oppTimerEl;
  timerEl.textContent = `⏱ ${formatClock(left)}`;
  timerEl.classList.toggle("cc-low", left <= 10);
  if (Date.now() < match.turnDeadline + TIMEOUT_GRACE_MS || game.timeoutAsked === match.turnDeadline) return;
  const id = game.id;
  const deadline = match.turnDeadline;
  game.timeoutAsked = deadline;
  CardStore.claimTimeout(id)
    .then((r) => (r && r.changed ? null : Promise.reject(new Error("not yet"))))
    .catch(() => {
      setTimeout(() => {
        if (game && game.id === id && game.timeoutAsked === deadline) game.timeoutAsked = null;
      }, TIMEOUT_RETRY_MS);
    });
}

// --- End of game ---
function showFinished() {
  const { match, settlement } = game.latest;
  boardEl.classList.remove("placing");
  resignBtn.hidden = true;
  youTimerEl.hidden = true;
  oppTimerEl.hidden = true;
  if (!settlement) {
    setStatus("Saving the result…");
    return;
  }
  if (game.resultShown) return;
  game.resultShown = true;
  renderBoard();

  const [mine, theirs] = settlement.scores;
  const opp = game.oppName;
  const { reason } = match.result;
  const color = settlement.result === "win" ? game.colors[game.seat] : settlement.result === "loss" ? game.colors[game.opp] : "";
  let text;
  if (settlement.result === "win") {
    if (reason === "resign") text = `${opp} resigned. You win! 🎉`;
    else if (reason === "timeout") text = `${opp} ran out of time. You win! 🎉`;
    else text = `You win ${mine}–${theirs}! 🎉`;
  } else if (settlement.result === "loss") {
    if (reason === "resign") text = `You resigned. ${opp} wins.`;
    else if (reason === "timeout") text = `You ran out of time, so ${opp} wins.`;
    else text = `${opp} wins ${theirs}–${mine}.`;
  } else {
    text = `It's a draw, ${mine}–${theirs}.`;
  }
  setStatus(text, color);
  resultScoreEl.textContent = `You ${mine} · ${opp} ${theirs}`;
  resultScoreEl.hidden = false;
  game.coins = settlement.coins;
  game.settled = settlement;
  renderStrikes(settlement.strikes);
  showResult(settlement.result, settlement.strikes, match.id);
  renderResultCoins();
}

// The coins the game paid, and the new total once the profile has it.
function renderResultCoins() {
  if (!game || game.coins === undefined) return;
  if (game.awaitingProfile) {
    resultCoinsEl.hidden = true;
    resultXpEl.hidden = true;
    return;
  }
  resultCoinsEl.textContent = `🪙 +${game.coins} coin${game.coins === 1 ? "" : "s"} · ${profile.coins.toLocaleString()} total`;
  resultCoinsEl.hidden = false;
  renderResultXp();
}

// "Unlocked: 134 Rare cards and the Apex Pack. " for reaching `level`.
function unlockedText(level) {
  const counts = {};
  CARD_POOL.filter((card) => CardRules.releaseLevel(card) === level).forEach((card) => {
    counts[card.rarity] = (counts[card.rarity] || 0) + 1;
  });
  const parts = RARITY_ORDER.filter((r) => counts[r]).map((r) => `${counts[r]} ${RARITIES[r].label} cards`);
  PACKS.filter((pack) => pack.level === level).forEach((pack) => parts.push(`the ${pack.name}`));
  if (!parts.length) return "";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `Unlocked: ${list}! `;
}

// XP from the game, and the level it leaves the player at. (A game you
// resign or run out of time in earns none.)
function renderResultXp() {
  const settled = game.settled;
  if (!settled || settled.xp === undefined) {
    resultXpEl.hidden = true;
    return;
  }
  const { level, into, needed } = levelInfo(profile.xp);
  const progress = needed === null ? "top level" : `${into} / ${needed} XP to level ${level + 1}`;
  resultXpEl.textContent = settled.levelUp
    ? `⭐ +${settled.xp} XP · Level up! You're level ${settled.level}. ${unlockedText(settled.level)}` +
      "The computer will play you a little harder."
    : `⭐ +${settled.xp} XP · Level ${level} · ${progress}`;
  resultXpEl.classList.toggle("cc-level-up", Boolean(settled.levelUp));
  resultXpEl.hidden = false;
}

// Our cards that took a strike, with how many they have now.
function renderStrikes(strikes) {
  resultStrikesEl.innerHTML = "";
  resultStrikesEl.hidden = !strikes.length;
  if (!strikes.length) return;
  const head = document.createElement("p");
  head.className = "cc-note";
  head.textContent = `Strikes for your cards that ended in ${game.oppName}'s color:`;
  const row = document.createElement("div");
  row.className = "cc-hand";
  strikes.forEach((s) => {
    const item = document.createElement("div");
    item.className = "cc-hand-card cc-struck";
    item.classList.toggle("cc-lost", s.removed);
    item.appendChild(createCardEl(s.cardId, "neutral", Math.min(s.strikes, STRIKES_TO_LOSE)));
    const caption = document.createElement("span");
    caption.className = "cc-caption";
    caption.textContent = s.removed ? "Lost" : `Strike ${s.strikes} of ${STRIKES_TO_LOSE}`;
    item.appendChild(caption);
    row.appendChild(item);
  });
  resultStrikesEl.append(head, row);
}

// `matchId`: the game just shown. Online, the profile (coins, the card to
// claim) can arrive a moment after the game's result; until it has this
// game in its history, the reward waits.
function showResult(result, strikes = [], matchId = null) {
  oppSideEl.hidden = true;
  youSideEl.hidden = true;
  resultPanelEl.hidden = false;
  updateNav();
  claimPick = null;

  const caughtUp = !matchId || (profile.history[0] && profile.history[0].matchId === matchId);
  if (game) game.awaitingProfile = caughtUp ? null : { result, strikes, matchId };
  if (!caughtUp) {
    resultTextEl.textContent = "Saving your result…";
    claimChoicesEl.innerHTML = "";
    claimBtn.hidden = true;
    againBtn.hidden = true;
    packsLink.hidden = true;
    return;
  }

  if (profile.pendingClaim) {
    const plain = game && !game.live && game.latest.match.cpu && game.latest.match.cpu.upgrades
      ? " (Claimed cards come without the computer's upgrades.)"
      : "";
    resultTextEl.textContent = `Pick one of ${profile.pendingClaim.opponent}'s cards you captured to add to your collection:${plain}`;
    renderClaimChoices();
    againBtn.hidden = true;
    packsLink.hidden = true;
    return;
  }
  const lost = strikes.filter((s) => s.removed).length;
  const messages = {
    win: `None of ${game ? game.oppName : "your opponent"}'s cards ended in your color, so there's no card to claim this time.`,
    loss: !game || !game.live
      ? "Better luck next time. Games against the computer never cost you cards."
      : strikes.length
        ? `${lost ? `${lost === 1 ? "One card" : `${lost} cards`} reached ${STRIKES_TO_LOSE} strikes and left your collection. ` : ""}` +
          `A card's ${STRIKES_TO_LOSE === 3 ? "third" : `${STRIKES_TO_LOSE}th`} strike removes it.`
        : "Better luck next time. None of your cards ended in their color, so no strikes.",
    draw: "No cards change hands on a draw.",
  };
  resultTextEl.textContent = messages[result];
  claimChoicesEl.innerHTML = "";
  claimBtn.hidden = true;
  showNextButtons();
}

// Play Again, plus a way to the packs when the player can afford one.
function showNextButtons() {
  const pack = PACKS[0];
  againBtn.hidden = false;
  packsLink.hidden = profile.coins < pack.price;
  packsLink.textContent = `Open a Pack (🪙 ${pack.price})`;
}

function renderClaimChoices() {
  const owned = ownedCardIds(profile);
  claimChoicesEl.innerHTML = "";
  profile.pendingClaim.options.forEach((cardId) => {
    const btn = document.createElement("button");
    btn.className = "cc-hand-card";
    btn.dataset.cardId = cardId;
    btn.classList.toggle("selected", claimPick === cardId);
    btn.setAttribute("aria-pressed", String(claimPick === cardId));
    btn.appendChild(createCardEl(cardId));
    if (!owned.has(cardId)) {
      btn.appendChild(newBadgeEl());
      btn.setAttribute("aria-label", `${getCard(cardId).name}, new`);
    }
    claimChoicesEl.appendChild(btn);
  });
  claimBtn.hidden = false;
  claimBtn.disabled = !claimPick || busy;
}

claimChoicesEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-hand-card[data-card-id]");
  if (!btn || !profile.pendingClaim || busy) return;
  claimPick = btn.dataset.cardId;
  renderClaimChoices();
});

claimBtn.addEventListener("click", async () => {
  const cardId = claimPick;
  if (!profile.pendingClaim || !cardId) return;
  claimBtn.disabled = true;
  let claimed = false;
  await run(async () => {
    await CardStore.claimCard(cardId);
    claimed = true;
    claimPick = null;
    const wrap = document.createElement("div");
    wrap.className = "cc-hand-card cc-claimed";
    wrap.appendChild(createCardEl(cardId));
    claimChoicesEl.innerHTML = "";
    claimChoicesEl.appendChild(wrap);
    resultTextEl.textContent = `${getCard(cardId).name} was added to your collection!`;
    claimBtn.hidden = true;
    showNextButtons();
  });
  if (!claimed && profile.pendingClaim) renderClaimChoices();
});

againBtn.addEventListener("click", () => {
  closeMatch();
  if (WildFlipNav.route() !== "play") history.pushState(null, "", "#play");
  WildFlipNav.mark();
  showDeck();
});

// A win whose reward wasn't picked yet (e.g. the page was reloaded) is shown
// before anything else so the card isn't lost.
function showPendingClaim() {
  closeMatch();
  showView("play");
  boardEl.hidden = true;
  resultScoreEl.hidden = true;
  resultCoinsEl.hidden = true;
  resultXpEl.hidden = true;
  resultStrikesEl.hidden = true;
  setStatus("You won your last game!", "");
  showResult("win");
}

// --- Start, and keeping up with the profile ---
function start() {
  if (!profile) showSetup();
  else if (profile.activeMatch) openMatch(profile.activeMatch, false);
  else if (profile.pendingClaim) showPendingClaim();
  else showDeck();
}

function onProfile(next) {
  const first = !profileKnown;
  profileKnown = true;
  profile = next;
  if (first) {
    start();
    return;
  }
  if (!profile) {
    stopQueue();
    closeMatch();
    showSetup();
  } else if (view === "setup") {
    showDeck(`Welcome, ${profile.name}! Here are your ${STARTER_SIZE} starter cards.`);
  } else if (view === "home") {
    renderProfileBar();
    renderHome();
  } else if (view === "deck") {
    renderDeck();
  } else if (view === "queue") {
    if (profile.activeMatch) enterMatch(profile.activeMatch);
  } else if (view === "play") {
    const waiting = game && game.awaitingProfile;
    if (waiting) showResult(waiting.result, waiting.strikes, waiting.matchId);
    renderResultCoins();
  }
}

if (online) setStatus("Loading your profile…");
CardStore.onProfile(onProfile);

// --- Service worker registration for offline standalone use ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
