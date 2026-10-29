// Card Builder (admin): add cards to the pool, edit existing ones, and set the
// chance each rarity has of appearing when a card is drawn at random. Cards
// and chances are saved in this browser, or signed in, in the online pool
// that every player uses, which only admins may change (see savePool in
// cards-data.js). Export/import moves them between devices.
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
const packLevelInput = document.getElementById("packLevelInput");
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

const online = CardStore.mode === "online";
let wasReadOnly = false; // the forms are locked (see applyAccess)

// How many copies of each card the players on this device own (signed in,
// only your own online player: other players' collections are private).
function ownedCounts() {
  const counts = {};
  const players = online ? [CardStore.profile()].filter(Boolean) : Object.values(loadCardSave().players);
  players.forEach((player) => {
    player.collection.forEach((owned) => {
      counts[owned.cardId] = (counts[owned.cardId] || 0) + 1;
    });
  });
  return counts;
}

// Saves the pool and reports how it went (online saves take a moment).
function save(cards, chances, packs, doneText) {
  if (!CardStore.canEditPool()) return;
  if (online) setStatus("Saving…");
  savePool(cards, chances, packs).then(
    () => setStatus(doneText),
    (err) => setStatus(`Not saved: ${err.message || "please try again."}`)
  );
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
  save(CARD_POOL, chances, PACKS, "Rarity chances saved.");
  chanceEditor.show(RARITY_CHANCES);
});

// --- Pack settings ---
for (let n = 1; n <= PACK_LIMITS.maxSize; n++) packSizeInput.add(new Option(n, n));

// The pack being edited (an id from PACKS); tabs above the form switch it.
let packId = PACKS[0].id;

function currentPack() {
  return PACKS.find((p) => p.id === packId) || PACKS[0];
}

function readPack() {
  return {
    ...currentPack(),
    name: packNameInput.value.trim(),
    price: Number(packPriceInput.value),
    size: Number(packSizeInput.value),
    level: Number(packLevelInput.value),
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
  } else if (!Number.isInteger(pack.level) || pack.level < 1 || pack.level > MAX_LEVEL) {
    problem = `The unlock level must be a whole number from 1 to ${MAX_LEVEL}.`;
  }
  packErrorEl.hidden = !problem;
  packErrorEl.textContent = problem;
  savePackBtn.disabled = Boolean(problem) || !isValidPack(pack);
  if (Number.isInteger(pack.price) && pack.price > 0) {
    const games = (r) => {
      const fewest = Math.ceil(pack.price / r.win);
      const most = Math.ceil(pack.price / r.loss);
      return fewest === most ? `${fewest}` : `${fewest}–${most}`;
    };
    packSummaryEl.textContent =
      `Games against the computer pay ${rewardText("cpu")}, and against other players ${rewardText("live")}, ` +
      `so one pack takes ${games(COIN_REWARDS.cpu)} computer games or ${games(COIN_REWARDS.live)} games against people.`;
  } else {
    packSummaryEl.textContent = "";
  }
}

const packOddsEditor = oddsEditor(packOddsTableEl, packOddsTotalEl, () => currentPack().odds, () => {
  if (packNameInput.value || packPriceInput.value) updatePackForm();
});

const packTabsEl = document.getElementById("packTabs");

function renderPackTabs() {
  packTabsEl.innerHTML = "";
  PACKS.forEach((p) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "size-option";
    btn.dataset.pack = p.id;
    btn.textContent = p.name;
    btn.classList.toggle("selected", p.id === packId);
    btn.setAttribute("aria-pressed", String(p.id === packId));
    packTabsEl.appendChild(btn);
  });
}

packTabsEl.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-pack]");
  if (!btn || btn.disabled) return;
  packId = btn.dataset.pack;
  showPack(currentPack());
});

function showPack(pack) {
  packId = pack.id;
  renderPackTabs();
  packNameInput.value = pack.name;
  packPriceInput.value = pack.price;
  packSizeInput.value = pack.size;
  packLevelInput.value = pack.level;
  packOddsEditor.show(pack.odds);
  updatePackForm();
  if (online) applyAccess();
}

[packNameInput, packPriceInput, packSizeInput, packLevelInput].forEach((el) => {
  el.addEventListener("input", updatePackForm);
});

packForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const pack = readPack();
  if (!isValidPack(pack)) return;
  save(CARD_POOL, RARITY_CHANCES, PACKS.map((p) => (p.id === pack.id ? pack : p)),
    `Saved the ${pack.name}: ${pack.size} cards for ${pack.price} coins.`);
  showPack(currentPack());
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
    const who = online ? "You own" : "Players own";
    const ownedText = owned ? ` ${who} ${owned} ${owned === 1 ? "copy" : "copies"}; changes apply to them too.` : "";
    if (BUILT_IN_BY_ID[card.id]) {
      formNoteEl.textContent = `Built-in card, so it can be edited but not deleted.${ownedText}`;
    } else {
      deleteCardBtn.hidden = false;
      deleteCardBtn.disabled = owned > 0;
      formNoteEl.textContent = owned
        ? `${ownedText.trim()} It can't be deleted while ${online ? "you own" : "players own"} it.`
        : online
          ? "You don't own this card, so it can be deleted. Other players who own it keep it saved, but can't play it unless it's added back."
          : "No player owns this card yet, so it can still be deleted.";
    }
  }
  renderPreview();
  renderPool();
  if (online) applyAccess();
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
  save(pool, RARITY_CHANCES, PACKS, editingId ? `Saved changes to #${card.no} ${card.name}.` : `Added #${card.no} ${card.name} to the pool.`);
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
  save(CARD_POOL.filter((c) => c.id !== card.id), RARITY_CHANCES, PACKS, `Deleted ${card.name}.`);
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
    app: "wildflip",
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
  link.download = "wildflip-cards.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus(`Exported ${CARD_POOL.length} cards, the rarity chances and the pack settings.`);
});

importBtn.addEventListener("click", () => {
  if (CardStore.canEditPool()) importFile.click();
});

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
    setStatus("That file isn't a WildFlip card export.");
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
  const skipped = data.cards.length - valid.length;
  save(Object.values(byId), chances, packs,
    `Imported ${added} new and ${updated} updated cards${skipped ? `; skipped ${skipped} invalid` : ""}.`);
  chanceEditor.show(RARITY_CHANCES);
  showPack(currentPack());
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
showPack(currentPack());
loadForm(null);

// --- Online: the shared pool ---
// Signed in, this page edits the online pool, so only admins may save; it
// also follows changes to it (another admin, another device).
const poolNoteEl = document.getElementById("poolNote");

// Signed out (this browser's pool) or an admin: editable. Otherwise the
// forms stay locked; once admin access is confirmed they're reset and open.
function applyAccess() {
  const readOnly = online && !CardStore.canEditPool();
  if (readOnly || wasReadOnly) {
    document.querySelectorAll("#chanceForm, #packForm, #cardForm").forEach((form) => {
      [...form.elements].forEach((el) => {
        // The pack tabs stay usable so every pack's settings can be seen.
        if (!el.dataset.pack) el.disabled = readOnly;
      });
    });
    importBtn.disabled = readOnly;
  }
  const opened = wasReadOnly && !readOnly;
  wasReadOnly = readOnly;
  if (opened) {
    chanceEditor.show(RARITY_CHANCES);
    showPack(currentPack());
    loadForm(null);
  }
}

if (online) {
  CardOnline.subscribe((s) => {
    poolNoteEl.hidden = false;
    if (s.admin) {
      poolNoteEl.textContent = "You're signed in as an admin: changes here go to the online card pool and reach every player.";
    } else if (s.adminChecked) {
      poolNoteEl.textContent = "You're signed in, so this is the online card pool every player uses. Only WildFlip admins can change it.";
    } else {
      poolNoteEl.textContent = "This is the online card pool every player uses. Checking whether you can change it…";
    }
    applyAccess();
  });
  let poolSeen = false;
  CardStore.onProfile(() => {
    // The first call is the pool this page has had since it loaded.
    if (poolSeen) {
      if (!editingId) chanceEditor.show(RARITY_CHANCES);
      renderPool();
    }
    poolSeen = true;
    applyAccess();
  });
}

adminOnlyPage();
