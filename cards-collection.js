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
const historyListEl = document.getElementById("historyList");

const RESULT_LABELS = {
  win: ["Won", "cc-win"],
  loss: ["Lost", "cc-loss"],
  draw: ["Drew", "cc-draw"],
};

const player = getCurrentPlayer(loadCardSave());

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
    ["Cards won", s.cardsClaimed],
    ["Cards flipped", s.flipsMade],
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

// Owned cards grouped by rarity, with how many of each rarity's cards the
// player has found. Cards they don't own are shown only on request, since
// the pool runs to hundreds of cards.
function renderCollection() {
  const counts = {};
  playableCollection(player).forEach((owned) => {
    counts[owned.cardId] = (counts[owned.cardId] || 0) + 1;
  });

  collectionGroupsEl.innerHTML = "";
  RARITY_ORDER.forEach((rarity) => {
    const cards = CARD_POOL.filter((card) => card.rarity === rarity);
    if (!cards.length) return;
    const found = cards.filter((card) => counts[card.id]).length;
    const heading = document.createElement("h3");
    heading.className = "cc-rarity-heading";
    heading.style.color = RARITIES[rarity].color;
    heading.textContent = `${RARITIES[rarity].label} · ${found} of ${cards.length}`;
    collectionGroupsEl.appendChild(heading);

    const shown = showMissingEl.checked ? cards : cards.filter((card) => counts[card.id]);
    if (!shown.length) {
      const none = document.createElement("p");
      none.className = "cc-muted cc-none";
      none.textContent = `No ${RARITIES[rarity].label.toLowerCase()} cards yet.`;
      collectionGroupsEl.appendChild(none);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "cc-grid cc-collection";
    shown.forEach((card) => grid.appendChild(collectionItem(card, counts[card.id] || 0)));
    collectionGroupsEl.appendChild(grid);
  });
}

function collectionItem(card, count) {
  const item = document.createElement("div");
  item.className = "cc-collect-item";
  item.classList.toggle("missing", !count);
  item.appendChild(createCardEl(card.id));

  const caption = document.createElement("div");
  caption.className = "cc-caption";
  caption.innerHTML = `<span>#${card.no} ${escapeHtml(card.name)}</span><span class="cc-muted" style="color: ${RARITIES[card.rarity].color}">${RARITIES[card.rarity].label}</span>`;
  item.appendChild(caption);

  const badge = document.createElement("span");
  badge.className = "cc-count";
  badge.textContent = count ? `×${count}` : "Not owned";
  item.appendChild(badge);
  return item;
}

showMissingEl.addEventListener("change", renderCollection);

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
    result.textContent = `${label} ${h.score[0]}–${h.score[1]}`;
    const detail = document.createElement("span");
    const claimed = h.claimed ? ` · claimed ${getCard(h.claimed)?.name ?? h.claimed}` : "";
    detail.textContent = ` vs ${h.opponent}${claimed}`;
    const when = document.createElement("span");
    when.className = "cc-muted cc-when";
    when.textContent = new Date(h.at).toLocaleString([], { dateStyle: "short", timeStyle: "short" });
    li.append(result, detail, when);
    historyListEl.appendChild(li);
  });
}

if (!player) {
  noPlayerEl.hidden = false;
} else {
  titleEl.textContent = `${player.name}'s Collection`;
  const collection = playableCollection(player);
  const unique = new Set(collection.map((c) => c.cardId)).size;
  summaryEl.textContent = `${collection.length} cards · ${unique} of ${CARD_POOL.length} types found`;
  playerInfoEl.hidden = false;
  renderStats();
  renderCollection();
  renderHistory();
}
