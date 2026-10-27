// Card Clash collection review: the current player's stats, every card they
// own (grouped, with counts), pool cards they haven't found yet, and their
// recent games.
const titleEl = document.getElementById("collectionTitle");
const summaryEl = document.getElementById("collectionSummary");
const noPlayerEl = document.getElementById("noPlayer");
const playerInfoEl = document.getElementById("playerInfo");
const statsGridEl = document.getElementById("statsGrid");
const collectionGroupsEl = document.getElementById("collectionGroups");
const showMissingEl = document.getElementById("showMissing");
const groupByEl = document.getElementById("groupBy");
const rarityFilterEl = document.getElementById("rarityFilter");
const cardDialog = document.getElementById("cardDialog");
const closeupCardEl = document.getElementById("closeupCard");
const closeupTitleEl = document.getElementById("closeupTitle");
const closeupMetaEl = document.getElementById("closeupMeta");
const closeupStatsEl = document.getElementById("closeupStats");
const closeupNoteEl = document.getElementById("closeupNote");
const closeupCloseBtn = document.getElementById("closeupClose");
const upgradeBoxEl = document.getElementById("upgradeBox");
const upgradeHintEl = document.getElementById("upgradeHint");
const upgradeCopiesEl = document.getElementById("upgradeCopies");
const upgradeSidesEl = document.getElementById("upgradeSides");
const upgradeCostEl = document.getElementById("upgradeCost");
const upgradeBtn = document.getElementById("upgradeBtn");

const SOURCE_LABELS = { starter: "starter cards", won: "a win", pack: "a pack" };
const historyListEl = document.getElementById("historyList");

const RESULT_LABELS = {
  win: ["Won", "cc-win"],
  loss: ["Lost", "cc-loss"],
  draw: ["Drew", "cc-draw"],
};

let player = null;

function renderStats() {
  const s = player.stats;
  const winRate = s.played ? `${Math.round((s.wins / s.played) * 100)}%` : "–";
  const rows = [
    ["Games", s.played],
    ["Wins", s.wins],
    ["Losses", s.losses],
    ["Draws", s.draws],
    ["Win rate", winRate],
    ["Win streak", s.currentStreak],
    ["Best streak", s.bestStreak],
    ["Level", levelInfo(player.xp).level],
    ["XP", player.xp.toLocaleString()],
    ["Cards won", s.cardsClaimed],
    ["Cards lost", s.cardsLost],
    ["Cards flipped", s.flipsMade],
    ["Coins", player.coins.toLocaleString()],
    ["Coins earned", s.coinsEarned.toLocaleString()],
    ["Packs opened", s.packsOpened],
    ["Upgrades made", s.upgrades],
  ];
  statsGridEl.innerHTML = "";
  rows.forEach(([label, value]) => {
    const tile = document.createElement("div");
    tile.className = "score";
    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    const valueEl = document.createElement("strong");
    valueEl.textContent = value;
    tile.append(labelEl, valueEl);
    statsGridEl.appendChild(tile);
  });
}

let groupBy = "set";
let rarityFilter = "all";

// "All" plus each rarity the pool has cards of.
function renderRarityFilter() {
  const rarities = raritiesOf(CARD_POOL);
  if (!rarities.includes(rarityFilter)) rarityFilter = "all";
  rarityFilterEl.innerHTML = "";
  ["all", ...rarities].forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-option";
    btn.dataset.rarity = r;
    btn.textContent = r === "all" ? "All rarities" : RARITIES[r].label;
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
  renderRarityFilter();
  renderCollection();
});

// The groups the collection is shown in: each set (and "Other" for cards
// without one), or each rarity.
function collectionGroups() {
  const pool = rarityFilter === "all" ? CARD_POOL : CARD_POOL.filter((card) => card.rarity === rarityFilter);
  if (groupBy === "rarity") {
    return RARITY_ORDER.map((r) => ({
      label: RARITIES[r].label,
      color: RARITIES[r].color,
      cards: pool.filter((card) => card.rarity === r),
    }));
  }
  return [...CARD_SETS, OTHER_SET].map((set) => ({
    label: `${set.icon} ${set.name}`,
    cards: pool.filter((card) => cardSet(card).id === set.id),
  }));
}

// Owned cards by set or rarity, each group with how many of its cards the
// player has found. Cards they don't own are shown only on request, since
// the pool runs to hundreds of cards.
function renderCollection() {
  const counts = {};
  playableCollection(player).forEach((owned) => {
    counts[owned.cardId] = (counts[owned.cardId] || 0) + 1;
  });

  collectionGroupsEl.innerHTML = "";
  collectionGroups().forEach(({ label, color, cards }) => {
    if (!cards.length) return;
    const found = cards.filter((card) => counts[card.id]).length;
    collectionGroupsEl.appendChild(groupHeading(label, color, found, cards.length));

    const shown = showMissingEl.checked ? cards : cards.filter((card) => counts[card.id]);
    if (!shown.length) {
      const none = document.createElement("p");
      none.className = "cc-muted cc-none";
      none.textContent = "None found yet.";
      collectionGroupsEl.appendChild(none);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "cc-grid cc-collection";
    shown.forEach((card) => grid.appendChild(collectionItem(card, counts[card.id] || 0)));
    collectionGroupsEl.appendChild(grid);
  });
}

// Group name, "found / total" and a progress meter.
function groupHeading(label, color, found, total) {
  const head = document.createElement("div");
  head.className = "cc-group-head";
  const title = document.createElement("h3");
  title.className = "cc-rarity-heading";
  if (color) title.style.color = color;
  title.textContent = label;
  const count = document.createElement("span");
  count.className = "cc-group-count";
  count.textContent = found === total ? `✓ Complete · ${total}` : `${found} / ${total}`;
  const meter = document.createElement("div");
  meter.className = "cc-meter";
  meter.setAttribute("role", "progressbar");
  meter.setAttribute("aria-label", `${label}: ${found} of ${total} found`);
  meter.setAttribute("aria-valuemin", "0");
  meter.setAttribute("aria-valuemax", String(total));
  meter.setAttribute("aria-valuenow", String(found));
  const fill = document.createElement("span");
  fill.style.width = `${(found / total) * 100}%`;
  if (found) fill.style.minWidth = "4px"; // a first find still shows
  meter.appendChild(fill);
  head.append(title, count, meter);
  return head;
}

// A card in the catalog. Cards not found yet show only their number and an
// outline in their rarity's color; nothing else about them is revealed.
function collectionItem(card, count) {
  const item = document.createElement("button");
  item.type = "button";
  item.className = "cc-collect-item cc-catalog-item";
  item.classList.toggle("missing", !count);
  item.dataset.id = card.id;
  const rarity = RARITIES[card.rarity];
  item.appendChild(count ? createCardEl(card.id) : unfoundCardEl(card));

  // An unfound card's outline already shows its number and rarity.
  if (count) {
    const caption = document.createElement("div");
    caption.className = "cc-caption";
    caption.innerHTML = `<span>#${card.no} ${escapeHtml(card.name)}</span><span class="cc-muted" style="color: ${rarity.color}">${rarity.label}</span>`;
    item.appendChild(caption);
  }

  const badge = document.createElement("span");
  badge.className = "cc-count";
  // ▲ marks a card with an upgraded copy.
  const upgraded = count && playableCollection(player).some((o) => o.cardId === card.id && CardRules.upgradesOf(o));
  badge.textContent = count ? `×${count}${upgraded ? " ▲" : ""}` : "Not found";
  item.appendChild(badge);
  item.setAttribute("aria-label", count ? `${card.name}, ${count} owned` : `Card number ${card.no}, ${rarity.label}, not found yet`);
  return item;
}

function unfoundCardEl(card) {
  const el = document.createElement("div");
  el.className = "cc-card-unfound";
  el.style.setProperty("--rarity-color", RARITIES[card.rarity].color);
  el.innerHTML = `<span class="cc-unfound-no">#${card.no}</span><span class="cc-unfound-rarity">${RARITIES[card.rarity].label}</span>`;
  return el;
}

// --- Close-up ---
function statRow(label, value) {
  const dt = document.createElement("dt");
  dt.textContent = label;
  const dd = document.createElement("dd");
  dd.textContent = value;
  closeupStatsEl.append(dt, dd);
}

// The card in the close-up, and the copy and side chosen to upgrade.
let closeup = null;

function showCloseup(cardId) {
  const card = getCard(cardId);
  if (!card) return;
  if (!closeup || closeup.cardId !== cardId) closeup = { cardId, copyUid: null, side: null };
  const rarity = RARITIES[card.rarity];
  const set = cardSet(card);
  const copies = playableCollection(player).filter((owned) => owned.cardId === card.id);
  closeupCardEl.innerHTML = "";
  closeupStatsEl.innerHTML = "";
  closeupNoteEl.textContent = "";
  upgradeBoxEl.hidden = !copies.length;

  if (!copies.length) {
    closeupCardEl.appendChild(unfoundCardEl(card));
    closeupTitleEl.textContent = `#${card.no} · Not found yet`;
    closeupMetaEl.innerHTML = `<span style="color: ${rarity.color}">${rarity.label}</span> · ${set.icon} ${escapeHtml(set.name)}`;
    closeupNoteEl.textContent = "Find it in a card pack, or capture it from an opponent and claim it after a win.";
  } else {
    closeupCardEl.appendChild(createCardEl(card.id));
    closeupTitleEl.textContent = card.name;
    closeupMetaEl.innerHTML = `#${card.no} · <span style="color: ${rarity.color}">${rarity.label}</span> · ${set.icon} ${escapeHtml(set.name)}`;
    const stats = player.cardStats[card.id] || { played: 0, win: 0, loss: 0, draw: 0 };
    statRow("Total (all 4 sides)", cardTotal(card));
    statRow("Copies owned", copies.length);
    const struck = copies.map((owned) => owned.strikes || 0).filter(Boolean);
    if (struck.length) {
      statRow("Strikes", `${struck.sort((a, b) => b - a).map((n) => `${n} of ${STRIKES_TO_LOSE}`).join(", ")}` +
        `${struck.length < copies.length ? `; ${copies.length - struck.length} with none` : ""}`);
    }
    statRow("Games played", stats.played);
    statRow("Won · Lost · Drew", `${stats.win} · ${stats.loss} · ${stats.draw}`);
    statRow("Win rate", stats.played ? `${Math.round((stats.win / stats.played) * 100)}%` : "–");
    const first = copies.reduce((a, b) => (a.acquiredAt <= b.acquiredAt ? a : b));
    if (first.acquiredAt) {
      const when = new Date(first.acquiredAt).toLocaleDateString([], { dateStyle: "medium" });
      statRow("First found", `${when}, from ${SOURCE_LABELS[first.source] || "your collection"}`);
    }
    if (!stats.played) closeupNoteEl.textContent = "Play it in a game to start its win / loss record.";
    renderUpgrade(copies);
  }
  if (!cardDialog.open) cardDialog.showModal();
}

// --- Upgrading ---
// Pick a copy (when there's more than one) and a side; duplicates of the card
// pay for it. The copy keeps its upgrades until it's lost; nobody who claims
// the card gets them.
function renderUpgrade(copies) {
  // Default to the most upgraded copy, to keep building it.
  const byUpgrades = [...copies].sort((a, b) => CardRules.upgradesOf(b) - CardRules.upgradesOf(a) || a.acquiredAt - b.acquiredAt);
  let copy = copies.find((o) => o.uid === closeup.copyUid);
  if (!copy) {
    copy = byUpgrades[0];
    closeup.copyUid = copy.uid;
    closeup.side = null;
  }
  const cost = CardRules.upgradeCost(copy);
  const spare = CardRules.upgradeFodder(player, copy).length;
  upgradeHintEl.textContent =
    `Use duplicates of this card to raise one side of a copy by 1: each side once, up to ${UPGRADE_MAX} upgrades, ` +
    `costing ${UPGRADE_COSTS.join(", then ")} duplicates. The upgrade stays with that copy; ` +
    "if it's lost or someone claims the card, the upgrade doesn't go with it.";

  upgradeCopiesEl.innerHTML = "";
  upgradeCopiesEl.hidden = copies.length < 2;
  byUpgrades.forEach((o) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cc-hand-card";
    btn.dataset.uid = o.uid;
    btn.classList.toggle("selected", o.uid === copy.uid);
    btn.setAttribute("aria-pressed", String(o.uid === copy.uid));
    btn.appendChild(createCardEl(o.cardId, "neutral", copyLook(o)));
    upgradeCopiesEl.appendChild(btn);
  });

  upgradeSidesEl.innerHTML = "";
  const now = CardRules.sidesOf(POOL, copy.cardId, copy.boost);
  [["top", "Top"], ["right", "Right"], ["bottom", "Bottom"], ["left", "Left"]].forEach(([side, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-option";
    btn.dataset.side = side;
    const problem = CardRules.raiseProblem(POOL, copy, side);
    btn.disabled = Boolean(problem);
    btn.title = problem;
    btn.textContent = copy.boost && copy.boost[side] ? `${label} ${now[side]} ▲` : `${label} ${now[side]} → ${now[side] + 1}`;
    btn.classList.toggle("selected", closeup.side === side && !problem);
    btn.setAttribute("aria-pressed", String(closeup.side === side));
    upgradeSidesEl.appendChild(btn);
  });
  if (closeup.side && CardRules.raiseProblem(POOL, copy, closeup.side)) closeup.side = null;

  if (cost === null) {
    upgradeCostEl.textContent = `This copy has all ${UPGRADE_MAX} upgrades.`;
  } else {
    const uses = `Upgrade ${CardRules.upgradesOf(copy) + 1} of ${UPGRADE_MAX} uses ${cost} duplicate${cost === 1 ? "" : "s"}`;
    upgradeCostEl.textContent = spare >= cost
      ? `${uses}. You have ${spare} spare.`
      : `${uses}. You have ${spare} spare: collect ${cost - spare} more from packs or wins.`;
  }
  upgradeBtn.disabled = cost === null || spare < cost || !closeup.side;
  upgradeBtn.textContent = closeup.side ? `Upgrade ${closeup.side[0].toUpperCase()}${closeup.side.slice(1)}` : "Pick a side to upgrade";
}

upgradeCopiesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-uid]");
  if (!btn) return;
  closeup.copyUid = btn.dataset.uid;
  closeup.side = null;
  showCloseup(closeup.cardId);
});

upgradeSidesEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-side]");
  if (!btn || btn.disabled) return;
  closeup.side = btn.dataset.side;
  showCloseup(closeup.cardId);
});

upgradeBtn.addEventListener("click", async () => {
  if (!closeup || !closeup.side) return;
  upgradeBtn.disabled = true;
  const { cardId, copyUid, side } = closeup;
  try {
    const owned = await CardStore.upgradeCard(copyUid, side);
    closeup.side = null;
    upgradeCostEl.textContent = `Upgraded! This ${getCard(cardId).name}'s ${side} side is now ${
      CardRules.sidesOf(POOL, cardId, owned.boost)[side]}.`;
  } catch (err) {
    upgradeCostEl.textContent = err.message || "Couldn't upgrade. Please try again.";
    upgradeBtn.disabled = false;
  }
});


collectionGroupsEl.addEventListener("click", (e) => {
  const item = e.target.closest(".cc-catalog-item");
  if (item) showCloseup(item.dataset.id);
});

closeupCloseBtn.addEventListener("click", () => cardDialog.close());
cardDialog.addEventListener("close", () => {
  closeup = null;
});

// Tapping the dimmed area outside the close-up closes it too.
cardDialog.addEventListener("click", (e) => {
  if (e.target === cardDialog) cardDialog.close();
});

showMissingEl.addEventListener("change", renderCollection);

groupByEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".size-option");
  if (!btn) return;
  groupBy = btn.dataset.group;
  groupByEl.querySelectorAll(".size-option").forEach((b) => {
    b.classList.toggle("selected", b === btn);
    b.setAttribute("aria-pressed", String(b === btn));
  });
  renderCollection();
});

function renderHistory() {
  historyListEl.innerHTML = "";
  if (!player.history.length) {
    const li = document.createElement("li");
    li.className = "cc-muted";
    li.textContent = "No games played yet.";
    historyListEl.appendChild(li);
    return;
  }
  player.history.forEach((h) => {
    const li = document.createElement("li");
    const result = document.createElement("strong");
    const [label, className] = RESULT_LABELS[h.result];
    result.className = className;
    // A resigned or timed-out game has no final score.
    result.textContent = h.reason && h.reason !== "board" ? label : `${label} ${h.score[0]}–${h.score[1]}`;
    const detail = document.createElement("span");
    const claimed = h.claimed ? ` · claimed ${getCard(h.claimed)?.name ?? h.claimed}` : "";
    const lost = h.lost ? ` · lost ${h.lost} card${h.lost === 1 ? "" : "s"}` : "";
    // Who forfeited follows from the result: the loser.
    const quitter = h.result === "win" ? "they" : "you";
    const how = h.reason === "resign" ? ` (${quitter} resigned)` : h.reason === "timeout" ? ` (${quitter} ran out of time)` : "";
    detail.textContent = ` vs ${h.mode === "live" ? "👤 " : ""}${h.opponent}${how}${claimed}${lost}`;
    const when = document.createElement("span");
    when.className = "cc-muted cc-when";
    when.textContent = new Date(h.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    li.append(result, detail, when);
    historyListEl.appendChild(li);
  });
}

if (CardStore.mode === "online") summaryEl.textContent = "Loading your profile…";
CardStore.onProfile((next) => {
  player = next;
  noPlayerEl.hidden = Boolean(player);
  playerInfoEl.hidden = !player;
  if (!player) {
    summaryEl.textContent = "";
    return;
  }
  titleEl.textContent = `${player.name}'s Collection`;
  const collection = playableCollection(player);
  const unique = new Set(collection.map((c) => c.cardId)).size;
  summaryEl.textContent = `${collection.length} cards · ${unique} of ${CARD_POOL.length} types found`;
  renderStats();
  renderRarityFilter();
  renderCollection();
  renderHistory();
  // Keep an open close-up current (e.g. after an upgrade).
  if (cardDialog.open && closeup) {
    const note = upgradeCostEl.textContent;
    showCloseup(closeup.cardId);
    if (/^Upgraded!/.test(note)) upgradeCostEl.textContent = note;
  }
});
