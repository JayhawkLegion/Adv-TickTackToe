// WildFlip packs: spend coins on a pack, then turn its cards over one by
// one (or all at once). The pack's cards are added to the collection as soon
// as it's bought (by the server when signed in), so leaving mid-reveal loses
// nothing. Every pack in PACKS is for sale, each with its own odds.
const statusEl = document.getElementById("status");
const noPlayerEl = document.getElementById("noPlayer");
const shopEl = document.getElementById("shop");
const coinBalanceEl = document.getElementById("coinBalance");
const offersEl = document.getElementById("offers");

const openingEl = document.getElementById("opening");
const openingArtEl = document.getElementById("openingArt");
const openingIconEl = document.getElementById("openingIcon");
const packCardsEl = document.getElementById("packCards");
const openHintEl = document.getElementById("openHint");
const revealAllBtn = document.getElementById("revealAllBtn");
const againBtn = document.getElementById("againBtn");
const doneBtn = document.getElementById("doneBtn");

const TEAR_MS = 700;
const REVEAL_STAGGER_MS = 280;
// Each pack's picture; packs added later get the paw.
const PACK_ICONS = { standard: "🐾", apex: "💎" };

let player = null;
let pack = PACKS[0]; // the pack being opened
let drawn = []; // the open pack's cards: { cardId, isNew, revealed }
let buying = false;

const OFFER_STATUS = "Spend coins on packs of random cards.";

function setStatus(text) {
  statusEl.textContent = text;
}

function packIcon(p) {
  return PACK_ICONS[p.id] || "🐾";
}

// --- The packs for sale ---
function renderOffers() {
  coinBalanceEl.textContent = player.coins.toLocaleString();
  offersEl.innerHTML = "";
  PACKS.forEach((p) => offersEl.appendChild(offerEl(p)));
  if (!doneBtn.hidden) againBtn.hidden = player.coins < pack.price;
}

function offerEl(p) {
  const section = document.createElement("section");
  section.className = "cc-pack-offer";

  const art = document.createElement("div");
  art.className = "cc-pack-art";
  art.dataset.pack = p.id;
  art.setAttribute("aria-hidden", "true");
  art.innerHTML = `
    <span class="cc-pack-brand">WildFlip</span>
    <span class="cc-pack-icon">${packIcon(p)}</span>
    <span class="cc-pack-name">${escapeHtml(p.name)}</span>
    <span class="cc-pack-size">${p.size} cards</span>`;

  const buy = document.createElement("button");
  buy.type = "button";
  buy.className = "reset-btn";
  buy.dataset.buy = p.id;
  buy.textContent = `Open ${p.name} (🪙 ${p.price.toLocaleString()})`;
  const short = p.price - player.coins;
  buy.disabled = short > 0 || buying;

  const hint = document.createElement("p");
  hint.className = "settings-hint";
  hint.textContent = short > 0
    ? `You need ${short.toLocaleString()} more coins. Games against the computer pay ${rewardText("cpu")}; ` +
      `against other players, ${rewardText("live")}.`
    : `${p.size} random cards for ${p.price.toLocaleString()} coins.`;

  // The real chance now: rarities with no cards yet can't be drawn, so their
  // share goes to the others (same rule as every random draw).
  const actual = effectiveChances(p.odds);
  const table = document.createElement("table");
  table.className = "cc-sim-table cc-odds-table";
  table.innerHTML = `
    <caption>Chance for each card in the pack</caption>
    <thead><tr><th scope="col">Rarity</th><th scope="col">Chance</th></tr></thead>`;
  const rows = document.createElement("tbody");
  RARITY_ORDER.filter((r) => p.odds[r] > 0 || actual[r] > 0).forEach((r) => {
    const row = document.createElement("tr");
    const name = document.createElement("th");
    name.scope = "row";
    name.innerHTML = `<span class="cc-rarity-name" style="--rarity-color: ${RARITIES[r].color}"><span class="cc-dot"></span>${RARITIES[r].label}</span>`;
    const chance = document.createElement("td");
    chance.textContent = actual[r] ? formatPct(actual[r]) : "–";
    row.append(name, chance);
    rows.appendChild(row);
  });
  table.appendChild(rows);

  section.append(art, buy, hint, table);
  const empty = RARITY_ORDER.filter((r) => p.odds[r] > 0 && !actual[r]);
  if (empty.length) {
    const note = document.createElement("p");
    note.className = "settings-hint";
    note.textContent =
      `${empty.map((r) => `${RARITIES[r].label} (${p.odds[r]}%)`).join(" and ")} ` +
      `${empty.length > 1 ? "have" : "has"} no cards yet, so ${empty.length > 1 ? "their share goes" : "its share goes"} to the other rarities.`;
    section.appendChild(note);
  }
  return section;
}

offersEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-buy]");
  const chosen = btn && PACKS.find((p) => p.id === btn.dataset.buy);
  if (chosen) buyPack(chosen);
});

// --- Opening ---
async function buyPack(chosen) {
  if (buying) return;
  buying = true;
  offersEl.querySelectorAll("[data-buy]").forEach((btn) => {
    btn.disabled = true;
  });
  againBtn.disabled = true;
  let result;
  try {
    result = await CardStore.openPack(chosen.id);
  } catch (err) {
    setStatus(err.message || "Couldn't open the pack. Please try again.");
    return;
  } finally {
    buying = false;
    againBtn.disabled = false;
    renderOffers();
  }
  pack = chosen;
  drawn = result.map((card) => ({ ...card, revealed: false }));
  setStatus(`Opening your ${pack.name}…`);

  offersEl.hidden = true;
  openingEl.hidden = false;
  openingArtEl.dataset.pack = pack.id;
  openingIconEl.textContent = packIcon(pack);
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
  if (card.isNew) slot.appendChild(newBadgeEl());
  const caption = document.createElement("span");
  caption.className = "cc-caption";
  caption.innerHTML = `<span>${escapeHtml(def.name)}</span><span class="cc-muted" style="color: ${RARITIES[def.rarity].color}">${RARITIES[def.rarity].label}</span>`;
  slot.appendChild(caption);
  if (drawn.every((c) => c.revealed)) finishOpening();
}

function finishOpening() {
  const newCount = drawn.filter((c) => c.isNew).length;
  const parts = [`${drawn.length} cards added to your collection`];
  if (newCount) parts.push(`${newCount} new`);
  const better = rarityCounts(drawn.map((c) => getCard(c.cardId)));
  if (better) parts.push(better);
  setStatus(`${parts.join(" · ")}.`);
  openHintEl.hidden = true;
  revealAllBtn.hidden = true;
  doneBtn.hidden = false;
  againBtn.hidden = player.coins < pack.price;
  againBtn.textContent = `Open Another (🪙 ${pack.price.toLocaleString()})`;
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

againBtn.addEventListener("click", () => buyPack(pack));

doneBtn.addEventListener("click", () => {
  openingEl.hidden = true;
  offersEl.hidden = false;
  setStatus(OFFER_STATUS);
  renderOffers();
});

// The profile (and, online, the pack settings) can change while the page is
// open; the shop keeps up.
let shown = false;
if (CardStore.mode === "online") setStatus("Loading your profile…");
CardStore.onProfile((next) => {
  player = next;
  // Online, an admin can change the packs while this page is open.
  pack = PACKS.find((p) => p.id === pack.id) || PACKS[0];
  noPlayerEl.hidden = Boolean(player);
  shopEl.hidden = !player;
  if (!player) {
    setStatus("");
    return;
  }
  if (!shown) {
    shown = true;
    setStatus(OFFER_STATUS);
  }
  renderOffers();
});
