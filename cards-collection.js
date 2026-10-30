// WildFlip collection review: the current player's stats, every card they
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

// Cards not released at the player's level also show a lock and the level.
function unfoundCardEl(card) {
  const el = document.createElement("div");
  el.className = "cc-card-unfound";
  el.style.setProperty("--rarity-color", RARITIES[card.rarity].color);
  const unlock = CardRules.releaseLevel(card);
  const lock = unlock > levelInfo(player.xp).level ? `<span class="cc-unfound-lock">🔒 Lv ${unlock}</span>` : "";
  el.innerHTML = `<span class="cc-unfound-no">#${card.no}</span><span class="cc-unfound-rarity">${RARITIES[card.rarity].label}</span>${lock}`;
  return el;
}

// A card's close-up (cards-ui.js): stats, upgrades, adding it to the deck.
collectionGroupsEl.addEventListener("click", (e) => {
  const item = e.target.closest(".cc-catalog-item");
  if (item) CardCloseup.open(item.dataset.id, { playLink: true });
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
});
