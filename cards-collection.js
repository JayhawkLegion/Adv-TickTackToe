// Card Clash collection review: the current player's stats, every card they
// own (grouped, with counts), pool cards they haven't found yet, and their
// recent games.
const titleEl = document.getElementById("collectionTitle");
const summaryEl = document.getElementById("collectionSummary");
const noPlayerEl = document.getElementById("noPlayer");
const playerInfoEl = document.getElementById("playerInfo");
const statsGridEl = document.getElementById("statsGrid");
const collectionGridEl = document.getElementById("collectionGrid");
const historyListEl = document.getElementById("historyList");

const player = getCurrentPlayer(loadCardSave());

function renderStats() {
  const s = player.stats;
  const winRate = s.played ? `${Math.round((s.wins / s.played) * 100)}%` : "–";
  const rows = [
    ["Games", s.played],
    ["Wins", s.wins],
    ["Losses", s.losses],
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

function renderCollection() {
  const counts = {};
  player.collection.forEach((owned) => {
    counts[owned.cardId] = (counts[owned.cardId] || 0) + 1;
  });

  collectionGridEl.innerHTML = "";
  [...CARD_POOL].sort((a, b) => a.no - b.no).forEach((card) => {
    const count = counts[card.id] || 0;
    const item = document.createElement("div");
    item.className = "cc-collect-item";
    item.classList.toggle("missing", !count);
    item.appendChild(createCardEl(card.id));

    const caption = document.createElement("div");
    caption.className = "cc-caption";
    caption.innerHTML = `<span>#${card.no} ${card.name}</span><span class="cc-muted">${RARITIES[card.rarity].label}</span>`;
    item.appendChild(caption);

    const badge = document.createElement("span");
    badge.className = "cc-count";
    badge.textContent = count ? `×${count}` : "Not owned";
    item.appendChild(badge);

    collectionGridEl.appendChild(item);
  });
}

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
    result.className = h.won ? "cc-win" : "cc-loss";
    result.textContent = `${h.won ? "Won" : "Lost"} ${h.score[0]}–${h.score[1]}`;
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
  const unique = new Set(player.collection.map((c) => c.cardId)).size;
  summaryEl.textContent = `${player.collection.length} cards · ${unique} of ${CARD_POOL.length} types found`;
  playerInfoEl.hidden = false;
  renderStats();
  renderCollection();
  renderHistory();
}
