// Card Builder (admin): add cards to the pool, edit existing ones, and set the
// chance each rarity has of appearing when a card is drawn at random. Cards
// and chances are saved in this browser (see savePool in cards-data.js), with
// export/import to move them between devices.
const EMOJI_PICKS = [
  "🐉", "🦁", "🐯", "🐺", "🦊", "🐻", "🐼", "🐸", "🐢", "🦅", "🦉", "🐍",
  "🦈", "🐙", "🦄", "🐝", "🦋", "🐘", "🦖", "👻", "🤖", "🧙", "⚡", "🔥",
];

const statusEl = document.getElementById("status");
const chanceForm = document.getElementById("chanceForm");
const rarityTableEl = document.getElementById("rarityTable");
const chanceTotalEl = document.getElementById("chanceTotal");
const saveChancesBtn = document.getElementById("saveChancesBtn");
const packForm = document.getElementById("packForm");
const packNameInput = document.getElementById("packNameInput");
const packPriceInput = document.getElementById("packPriceInput");
const packSizeInput = document.getElementById("packSizeInput");
const packOddsTableEl = document.getElementById("packOddsTable");
const packOddsTotalEl = document.getElementById("packOddsTotal");
const packSummaryEl = document.getElementById("packSummary");
const packErrorEl = document.getElementById("packError");
const savePackBtn = document.getElementById("savePackBtn");

const formTitleEl = document.getElementById("formTitle");
const cardForm = document.getElementById("cardForm");
const previewEl = document.getElementById("cardPreview");
const nameInput = document.getElementById("cardName");
const iconInput = document.getElementById("cardIcon");
const setSelect = document.getElementById("cardSet");
const emojiPicksEl = document.getElementById("emojiPicks");
const rarityOptionsEl = document.getElementById("rarityOptions");
const formNoteEl = document.getElementById("formNote");
const formErrorEl = document.getElementById("formError");
const saveCardBtn = document.getElementById("saveCardBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const deleteCardBtn = document.getElementById("deleteCardBtn");
const sideSelects = {
  top: document.getElementById("sideTop"),
  right: document.getElementById("sideRight"),
  bottom: document.getElementById("sideBottom"),
  left: document.getElementById("sideLeft"),
};

const poolCountEl = document.getElementById("poolCount");
const poolGridEl = document.getElementById("poolGrid");
const poolSearchEl = document.getElementById("poolSearch");
const poolRarityEl = document.getElementById("poolRarity");
const poolShowingEl = document.getElementById("poolShowing");
const exportBtn = document.getElementById("exportBtn");
const importBtn = document.getElementById("importBtn");
const importFile = document.getElementById("importFile");

let editingId = null; // id of the card being edited, or null for a new card
let draft = blankDraft();

function setStatus(text) {
  statusEl.textContent = text;
}

// How many copies of each card all players on this device own.
function ownedCounts() {
  const counts = {};
  Object.values(loadCardSave().players).forEach((player) => {
    player.collection.forEach((owned) => {
      counts[owned.cardId] = (counts[owned.cardId] || 0) + 1;
    });
  });
  return counts;
}

// --- Odds tables (rarity chances and pack odds) ---
// One % per rarity (must total 100), with each rarity's card count and its
// actual chance now (rarities with no cards pass their share on). `fallback`
// gives the saved odds to show while the inputs don't add up.
function oddsEditor(tableEl, totalEl, fallback, onChange) {
  const inputs = {};
  const countCells = {};
  const actualCells = {};

  RARITY_ORDER.forEach((r) => {
    const row = document.createElement("div");
    row.className = "cc-rarity-row";
    row.style.setProperty("--rarity-color", RARITIES[r].color);

    const name = document.createElement("span");
    name.className = "cc-rarity-name";
    name.innerHTML = `<span class="cc-dot"></span>${RARITIES[r].label}`;

    const inputWrap = document.createElement("span");
    inputWrap.className = "cc-pct-input";
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "decimal";
    input.min = "0";
    input.max = "100";
    input.step = "0.1";
    input.className = "cc-input";
    input.setAttribute("aria-label", `${RARITIES[r].label} chance (%)`);
    inputWrap.appendChild(input);

    countCells[r] = document.createElement("span");
    actualCells[r] = document.createElement("span");
    actualCells[r].className = "cc-rarity-actual";
    inputs[r] = input;
    row.append(name, inputWrap, countCells[r], actualCells[r]);
    tableEl.appendChild(row);
  });

  function read() {
    return Object.fromEntries(RARITY_ORDER.map((r) => [r, Number.parseFloat(inputs[r].value)]));
  }

  // Refreshes counts, actual chances and the total; returns whether valid.
  function update() {
    const odds = read();
    const filled = RARITY_ORDER.every((r) => Number.isFinite(odds[r]) && odds[r] >= 0);
    const ok = filled && isValidChances(odds);
    const actual = effectiveChances(ok ? odds : fallback());
    RARITY_ORDER.forEach((r) => {
      const count = CARD_POOL.filter((card) => card.rarity === r).length;
      countCells[r].textContent = count;
      actualCells[r].innerHTML = count
        ? `${formatPct(actual[r])}<small>${formatPct(actual[r] / count)} per card</small>`
        : `0%<small>no cards yet</small>`;
    });
    totalEl.classList.toggle("bad", !ok);
    if (!filled) totalEl.textContent = "Enter a chance (0 or more) for every rarity.";
    else if (!ok) totalEl.textContent = `Total: ${formatPct(chancesTotal(odds))}. The chances must add up to 100%.`;
    else totalEl.textContent = "Total: 100% ✓";
    if (onChange) onChange(ok);
    return ok;
  }

  tableEl.addEventListener("input", update);
  return {
    read,
    update,
    show(odds) {
      RARITY_ORDER.forEach((r) => {
        inputs[r].value = odds[r];
      });
      update();
    },
  };
}

const chanceEditor = oddsEditor(rarityTableEl, chanceTotalEl, () => RARITY_CHANCES, (ok) => {
  saveChancesBtn.disabled = !ok;
});

chanceForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const chances = chanceEditor.read();
  if (!isValidChances(chances)) return;
  savePool(CARD_POOL, chances);
  chanceEditor.show(RARITY_CHANCES);
  setStatus("Rarity chances saved.");
});

// --- Pack settings ---
for (let n = 1; n <= PACK_LIMITS.maxSize; n++) packSizeInput.add(new Option(n, n));

function readPack() {
  return {
    ...PACKS[0],
    name: packNameInput.value.trim(),
    price: Number(packPriceInput.value),
    size: Number(packSizeInput.value),
    odds: packOddsEditor.read(),
  };
}

// Enables Save only when everything is valid, and explains what isn't.
function updatePackForm() {
  const pack = readPack();
  let problem = "";
  if (!pack.name) problem = "Give the pack a name.";
  else if (!Number.isInteger(pack.price) || pack.price < 1 || pack.price > PACK_LIMITS.maxPrice) {
    problem = `The price must be a whole number of coins from 1 to ${PACK_LIMITS.maxPrice.toLocaleString()}.`;
  }
  packErrorEl.hidden = !problem;
  packErrorEl.textContent = problem;
  savePackBtn.disabled = Boolean(problem) || !isValidPack(pack);
  if (Number.isInteger(pack.price) && pack.price > 0) {
    const fewest = Math.ceil(pack.price / COIN_REWARDS.win);
    const most = Math.ceil(pack.price / COIN_REWARDS.loss);
    packSummaryEl.textContent =
      `Games pay ${COIN_REWARDS.win} coins for a win and ${COIN_REWARDS.loss} for a loss, so one pack takes ` +
      `${fewest === most ? fewest : `${fewest}–${most}`} games.`;
  } else {
    packSummaryEl.textContent = "";
  }
}

const packOddsEditor = oddsEditor(packOddsTableEl, packOddsTotalEl, () => PACKS[0].odds, () => {
  if (packNameInput.value || packPriceInput.value) updatePackForm();
});

function showPack(pack) {
  packNameInput.value = pack.name;
  packPriceInput.value = pack.price;
  packSizeInput.value = pack.size;
  packOddsEditor.show(pack.odds);
  updatePackForm();
}

[packNameInput, packPriceInput, packSizeInput].forEach((el) => {
  el.addEventListener("input", updatePackForm);
});

packForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pack = readPack();
  if (!isValidPack(pack)) return;
  savePool(CARD_POOL, RARITY_CHANCES, [pack, ...PACKS.slice(1)]);
  showPack(PACKS[0]);
  setStatus(`Saved the ${PACKS[0].name}: ${PACKS[0].size} cards for ${PACKS[0].price} coins.`);
});

// --- Building and editing cards ---
function blankDraft() {
  return { name: "", icon: "", rarity: "common", set: "", top: 1, right: 1, bottom: 1, left: 1 };
}

function buildFormControls() {
  SIDES.forEach((side) => {
    for (let n = 1; n <= 10; n++) sideSelects[side].add(new Option(n, n));
  });
  EMOJI_PICKS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = emoji;
    btn.setAttribute("aria-label", `Use ${emoji}`);
    emojiPicksEl.appendChild(btn);
  });
  RARITY_ORDER.forEach((r) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-option cc-rarity-option";
    btn.dataset.rarity = r;
    btn.textContent = RARITIES[r].label;
    btn.style.setProperty("--rarity-color", RARITIES[r].color);
    rarityOptionsEl.appendChild(btn);
  });
}

function renderPreview() {
  previewEl.innerHTML = "";
  previewEl.appendChild(
    createCardEl({ ...draft, name: draft.name.trim() || "Name", icon: draft.icon.trim() || "❔" })
  );
  rarityOptionsEl.querySelectorAll(".cc-rarity-option").forEach((btn) => {
    btn.classList.toggle("selected", btn.dataset.rarity === draft.rarity);
  });
}

function showError(message) {
  formErrorEl.hidden = !message;
  formErrorEl.textContent = message || "";
}

// card: an existing card to edit, or null to start a new one.
function loadForm(card) {
  editingId = card ? card.id : null;
  draft = card ? { ...card, set: card.set || "" } : blankDraft();
  nameInput.value = draft.name;
  iconInput.value = draft.icon;
  setSelect.value = SETS_BY_ID[draft.set] ? draft.set : "";
  SIDES.forEach((side) => {
    sideSelects[side].value = draft[side];
  });
  showError("");

  formTitleEl.textContent = card ? `Edit card #${card.no}` : "New card";
  saveCardBtn.textContent = card ? "Save Changes" : "Add Card";
  cancelEditBtn.hidden = !card;
  deleteCardBtn.hidden = true;
  formNoteEl.textContent = "";

  if (card) {
    const owned = ownedCounts()[card.id] || 0;
    const ownedText = owned ? ` Players own ${owned} ${owned === 1 ? "copy" : "copies"}; changes apply to them too.` : "";
    if (BUILT_IN_BY_ID[card.id]) {
      formNoteEl.textContent = `Built-in card, so it can be edited but not deleted.${ownedText}`;
    } else {
      deleteCardBtn.hidden = false;
      deleteCardBtn.disabled = owned > 0;
      formNoteEl.textContent = owned
        ? `${ownedText.trim()} It can't be deleted while players own it.`
        : "No player owns this card yet, so it can still be deleted.";
    }
  }
  renderPreview();
  renderPool();
}

cardForm.addEventListener("input", (e) => {
  if (e.target === nameInput) draft.name = nameInput.value;
  else if (e.target === iconInput) draft.icon = iconInput.value;
  else return;
  renderPreview();
});

cardForm.addEventListener("change", (e) => {
  const side = SIDES.find((s) => sideSelects[s] === e.target);
  if (!side) return;
  draft[side] = Number(e.target.value);
  renderPreview();
});

emojiPicksEl.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  draft.icon = btn.textContent;
  iconInput.value = draft.icon;
  renderPreview();
});

rarityOptionsEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-rarity-option");
  if (!btn) return;
  draft.rarity = btn.dataset.rarity;
  renderPreview();
});

cardForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = draft.name.trim().replace(/\s+/g, " ");
  const icon = draft.icon.trim();
  if (!name) return showError("Give the card a name.");
  const clash = CARD_POOL.find((c) => c.id !== editingId && c.name.toLowerCase() === name.toLowerCase());
  if (clash) return showError(`There's already a card named ${clash.name} (#${clash.no}).`);
  if (!icon) return showError("Pick a picture (an emoji) for the card.");

  const fields = {
    name, icon, rarity: draft.rarity, set: setSelect.value || undefined,
    top: draft.top, right: draft.right, bottom: draft.bottom, left: draft.left,
  };
  let card;
  let pool;
  if (editingId) {
    card = { ...getCard(editingId), ...fields };
    pool = CARD_POOL.map((c) => (c.id === editingId ? card : c));
  } else {
    card = { no: nextCardNumber(), id: newId("card_"), ...fields };
    pool = [...CARD_POOL, card];
  }
  savePool(pool, RARITY_CHANCES);
  setStatus(editingId ? `Saved changes to #${card.no} ${card.name}.` : `Added #${card.no} ${card.name} to the pool.`);
  loadForm(null);
  chanceEditor.update();
  packOddsEditor.update();
});

cancelEditBtn.addEventListener("click", () => {
  loadForm(null);
  setStatus("Edit cancelled.");
});

deleteCardBtn.addEventListener("click", () => {
  const card = getCard(editingId);
  if (!card || BUILT_IN_BY_ID[card.id] || ownedCounts()[card.id]) return;
  if (!confirm(`Delete #${card.no} ${card.name} from the pool? This can't be undone.`)) return;
  savePool(CARD_POOL.filter((c) => c.id !== card.id), RARITY_CHANCES);
  setStatus(`Deleted ${card.name}.`);
  loadForm(null);
  chanceEditor.update();
  packOddsEditor.update();
});

// --- The pool ---
// Cards matching the search box (name, or #number) and the rarity / set
// filter ("rare", "custom", "set:ocean", "set:other").
function filteredPool() {
  const query = poolSearchEl.value.trim().toLowerCase().replace(/^#/, "");
  const filter = poolRarityEl.value;
  return CARD_POOL.filter((card) => {
    if (filter === "custom" && BUILT_IN_BY_ID[card.id]) return false;
    if (filter.startsWith("set:") && cardSet(card).id !== filter.slice(4)) return false;
    if (RARITIES[filter] && card.rarity !== filter) return false;
    return !query || card.name.toLowerCase().includes(query) || String(card.no) === query;
  });
}

function renderPool() {
  const owned = ownedCounts();
  const cards = filteredPool();
  poolCountEl.textContent = CARD_POOL.length;
  poolShowingEl.textContent = cards.length
    ? `Showing ${cards.length === CARD_POOL.length ? "all" : cards.length} · tap a card to edit it.`
    : "No cards match.";
  poolGridEl.innerHTML = "";
  cards.forEach((card) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cc-collect-item cc-pool-item";
    btn.classList.toggle("editing", card.id === editingId);
    btn.dataset.id = card.id;
    btn.appendChild(createCardEl(card.id));

    const caption = document.createElement("div");
    caption.className = "cc-caption";
    const kind = BUILT_IN_BY_ID[card.id] ? "Built-in" : "Custom";
    caption.innerHTML = `
      <span>#${card.no} ${escapeHtml(card.name)}</span>
      <span class="cc-muted" style="color: ${RARITIES[card.rarity].color}">${RARITIES[card.rarity].label}</span>
      <span class="cc-muted">${cardSet(card).icon} ${escapeHtml(cardSet(card).name)}</span>
      <span class="cc-muted">${kind}${owned[card.id] ? ` · owned ×${owned[card.id]}` : ""}</span>
    `;
    btn.appendChild(caption);
    poolGridEl.appendChild(btn);
  });
}

poolGridEl.addEventListener("click", (e) => {
  const btn = e.target.closest(".cc-pool-item");
  if (!btn) return;
  const card = getCard(btn.dataset.id);
  loadForm(card);
  setStatus(`Editing #${card.no} ${card.name}.`);
  formTitleEl.scrollIntoView({ behavior: "smooth", block: "start" });
});

// --- Backup ---
exportBtn.addEventListener("click", () => {
  const data = {
    app: "card-clash",
    kind: "card-pool",
    version: 1,
    exportedAt: new Date().toISOString(),
    chances: RARITY_CHANCES,
    packs: PACKS.map(cleanPack),
    cards: CARD_POOL.map(cleanCard),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "card-clash-cards.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Exported ${CARD_POOL.length} cards, the rarity chances and the pack settings.`);
});

importBtn.addEventListener("click", () => importFile.click());

// Adds new cards and updates existing ones (matched by id); never removes any.
// An existing card keeps its number; a new card whose number is taken gets
// the next free one.
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  importFile.value = "";
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    data = null;
  }
  if (!data || !Array.isArray(data.cards)) {
    setStatus("That file isn't a Card Clash card export.");
    return;
  }

  const byId = Object.fromEntries(CARD_POOL.map((card) => [card.id, card]));
  const usedNumbers = new Set(CARD_POOL.map((card) => card.no));
  let nextNumber = nextCardNumber();
  let added = 0;
  let updated = 0;
  const valid = data.cards.map(upgradeCard).filter(isValidCard).map(cleanCard);
  valid.forEach((card) => {
    const existing = byId[card.id];
    if (existing) {
      const merged = { ...card, no: existing.no };
      if (!sameCard(merged, existing)) {
        byId[card.id] = merged;
        updated++;
      }
      return;
    }
    if (usedNumbers.has(card.no)) card.no = nextNumber;
    usedNumbers.add(card.no);
    nextNumber = Math.max(...usedNumbers) + 1;
    byId[card.id] = card;
    added++;
  });

  const imported = upgradeChances(data.chances);
  const chances = isValidChances(imported) ? imported : RARITY_CHANCES;
  // Valid pack settings in the file replace the current ones.
  const packs = PACKS.map((pack) => {
    const fromFile = Array.isArray(data.packs) ? data.packs.find((p) => p && p.id === pack.id) : null;
    return isValidPack(fromFile) ? cleanPack(fromFile) : pack;
  });
  savePool(Object.values(byId), chances, packs);
  const skipped = data.cards.length - valid.length;
  setStatus(
    `Imported ${added} new and ${updated} updated cards${skipped ? `; skipped ${skipped} invalid` : ""}.`
  );
  chanceEditor.show(RARITY_CHANCES);
  showPack(PACKS[0]);
  loadForm(null);
});

poolSearchEl.addEventListener("input", renderPool);
poolRarityEl.addEventListener("change", renderPool);

buildFormControls();
// Filter options: rarities and custom cards, then each set.
const rarityGroup = document.createElement("optgroup");
rarityGroup.label = "Rarity";
RARITY_ORDER.forEach((r) => rarityGroup.append(new Option(RARITIES[r].label, r)));
rarityGroup.append(new Option("Custom cards", "custom"));
const setGroup = document.createElement("optgroup");
setGroup.label = "Set";
[...CARD_SETS, OTHER_SET].forEach((set) => setGroup.append(new Option(`${set.icon} ${set.name}`, `set:${set.id}`)));
poolRarityEl.append(rarityGroup, setGroup);

setSelect.add(new Option("No set (Other)", ""));
CARD_SETS.forEach((set) => setSelect.add(new Option(`${set.icon} ${set.name}`, set.id)));
chanceEditor.show(RARITY_CHANCES);
showPack(PACKS[0]);
loadForm(null);
