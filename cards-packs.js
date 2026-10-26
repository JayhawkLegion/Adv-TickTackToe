// Card Clash packs: spend coins on a pack, then turn its cards over one by
// one (or all at once). The pack's cards are added to the collection and
// saved as soon as it's bought, so leaving mid-reveal loses nothing.
const statusEl = document.getElementById("status");
const noPlayerEl = document.getElementById("noPlayer");
const shopEl = document.getElementById("shop");
const coinBalanceEl = document.getElementById("coinBalance");
const offerEl = document.getElementById("offer");
const packNameEl = document.getElementById("packName");
const packSizeEl = document.getElementById("packSize");
const buyBtn = document.getElementById("buyBtn");
const buyHintEl = document.getElementById("buyHint");
const oddsRowsEl = document.getElementById("oddsRows");
const oddsNoteEl = document.getElementById("oddsNote");

const openingEl = document.getElementById("opening");
const openingArtEl = document.getElementById("openingArt");
const packCardsEl = document.getElementById("packCards");
const openHintEl = document.getElementById("openHint");
const revealAllBtn = document.getElementById("revealAllBtn");
const againBtn = document.getElementById("againBtn");
const doneBtn = document.getElementById("doneBtn");

const TEAR_MS = 700;
const REVEAL_STAGGER_MS = 280;

const save = loadCardSave();
const player = getCurrentPlayer(save);
const pack = PACKS[0];
let drawn = []; // the open pack's cards: { cardId, isNew, revealed }

const OFFER_STATUS = "Spend coins on packs of random cards.";

function setStatus(text) {
  statusEl.textContent = text;
}

// --- The pack for sale ---
function renderOffer() {
  coinBalanceEl.textContent = player.coins.toLocaleString();
  packNameEl.textContent = pack.name;
  packSizeEl.textContent = `${pack.size} cards`;
  buyBtn.textContent = `Open a Pack (🪙 ${pack.price})`;
  const short = pack.price - player.coins;
  buyBtn.disabled = short > 0;
  buyHintEl.textContent = short > 0
    ? `You need ${short} more coins. Games pay ${COIN_REWARDS.win} for a win, ${COIN_REWARDS.draw} for a draw and ${COIN_REWARDS.loss} for a loss.`
    : `${pack.size} random cards for ${pack.price} coins.`;

  // The real chance now: rarities with no cards yet can't be drawn, so their
  // share goes to the others (same rule as every random draw).
  const actual = effectiveChances(pack.odds);
  oddsRowsEl.innerHTML = "";
  RARITY_ORDER.forEach((r) => {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.innerHTML = `<span class="cc-rarity-name" style="--rarity-color: ${RARITIES[r].color}"><span class="cc-dot"></span>${RARITIES[r].label}</span>`;
    const chance = document.createElement("td");
    chance.textContent = actual[r] ? formatPct(actual[r]) : "–";
    row.append(name, chance);
    oddsRowsEl.appendChild(row);
  });
  const empty = RARITY_ORDER.filter((r) => pack.odds[r] > 0 && !actual[r]);
  oddsNoteEl.textContent = empty.length
    ? `${empty.map((r) => `${RARITIES[r].label} (${pack.odds[r]}%)`).join(" and ")} ` +
      `${empty.length > 1 ? "have" : "has"} no cards yet, so ${empty.length > 1 ? "their share goes" : "its share goes"} to the other rarities.`
    : "";
}

// --- Opening ---
function buyPack() {
  buyBtn.disabled = true;
  againBtn.hidden = true;
  const result = openPack(player, pack);
  if (!result) {
    renderOffer();
    return;
  }
  saveCardSave(save);
  drawn = result.map((card) => ({ ...card, revealed: false }));
  coinBalanceEl.textContent = player.coins.toLocaleString();
  setStatus(`Opening your ${pack.name}…`);

  offerEl.hidden = true;
  openingEl.hidden = false;
  openingArtEl.hidden = false;
  openingArtEl.classList.remove("cc-pack-tear");
  void openingArtEl.offsetWidth; // restart the animation
  openingArtEl.classList.add("cc-pack-tear");
  packCardsEl.innerHTML = "";
  openHintEl.hidden = true;
  revealAllBtn.hidden = true;
  againBtn.hidden = true;
  doneBtn.hidden = true;
  setTimeout(dealCards, TEAR_MS);
}

buyBtn.addEventListener("click", buyPack);

function dealCards() {
  openingArtEl.hidden = true;
  drawn.forEach((card, i) => {
    const slot = document.createElement("button");
    slot.type = "button";
    slot.className = "cc-pack-slot";
    slot.dataset.index = i;
    slot.setAttribute("aria-label", `Card ${i + 1}, face down. Tap to turn over.`);
    slot.style.animationDelay = `${i * 90}ms`;
    slot.innerHTML = `<div class="cc-card-back"><span>?</span></div>`;
    packCardsEl.appendChild(slot);
  });
  openHintEl.hidden = false;
  revealAllBtn.hidden = false;
  setStatus(`Tap each card to turn it over.`);
}

function reveal(i) {
  const card = drawn[i];
  if (!card || card.revealed) return;
  card.revealed = true;
  const def = getCard(card.cardId);
  const slot = packCardsEl.querySelector(`[data-index="${i}"]`);
  slot.disabled = true;
  slot.setAttribute("aria-label", `${def.name}, ${RARITIES[def.rarity].label}${card.isNew ? ", new" : ""}`);
  slot.innerHTML = "";
  const cardEl = createCardEl(card.cardId);
  cardEl.classList.add("cc-flipping");
  if (def.rarity !== "common") cardEl.classList.add("cc-glow");
  slot.appendChild(cardEl);
  if (card.isNew) {
    const badge = document.createElement("span");
    badge.className = "cc-new-badge";
    badge.textContent = "NEW";
    slot.appendChild(badge);
  }
  const caption = document.createElement("span");
  caption.className = "cc-caption";
  caption.innerHTML = `<span>${escapeHtml(def.name)}</span><span class="cc-muted" style="color: ${RARITIES[def.rarity].color}">${RARITIES[def.rarity].label}</span>`;
  slot.appendChild(caption);
  if (drawn.every((c) => c.revealed)) finishOpening();
}

function finishOpening() {
  const newCount = drawn.filter((c) => c.isNew).length;
  const rares = drawn.filter((c) => getCard(c.cardId).rarity !== "common").length;
  const parts = [`${drawn.length} cards added to your collection`];
  if (newCount) parts.push(`${newCount} new`);
  if (rares) parts.push(`${rares} ${rares === 1 ? "is" : "are"} rare or better`);
  setStatus(`${parts.join(" · ")}.`);
  openHintEl.hidden = true;
  revealAllBtn.hidden = true;
  doneBtn.hidden = false;
  againBtn.hidden = player.coins < pack.price;
  againBtn.textContent = `Open Another (🪙 ${pack.price})`;
}

packCardsEl.addEventListener("click", (e) => {
  const slot = e.target.closest(".cc-pack-slot");
  if (slot) reveal(Number(slot.dataset.index));
});

revealAllBtn.addEventListener("click", () => {
  revealAllBtn.hidden = true;
  drawn.forEach((card, i) => {
    if (!card.revealed) setTimeout(() => reveal(i), i * REVEAL_STAGGER_MS);
  });
});

againBtn.addEventListener("click", buyPack);

doneBtn.addEventListener("click", () => {
  openingEl.hidden = true;
  offerEl.hidden = false;
  setStatus(OFFER_STATUS);
  renderOffer();
});

if (!player) {
  noPlayerEl.hidden = false;
} else {
  shopEl.hidden = false;
  setStatus(OFFER_STATUS);
  renderOffer();
}
