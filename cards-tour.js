// WildFlip tour: a guided walkthrough for new players. It shows how coins
// are earned, opens a pack, saves a deck, plays a scripted practice game
// (the same for everyone, against the 5 weakest cards, with every move
// pointed out), claims a card, looks at the catalog and upgrades a card.
//
// Everything here is make-believe: nothing is saved to the player's
// profile. It uses the built-in cards, so Card Builder edits can't change
// the script.
const TOUR_DONE_KEY = "wildflipTourDone";
const TOUR = CardRules.buildPool();
const byNo = (no) => TOUR.cards[no - 1];

// The cards in the story: starter cards (one is a Fly, so claiming the
// computer's Fly makes a duplicate), the pack, the deck and the computer.
const STARTERS = [3, 7, 40, 55, 60].map(byNo);
const PACK = [70, 150, 81].map(byNo);
const DECK = [81, 150, 70, 55, 60].map(byNo);
const CPU = [1, 2, 3, 4, 5].map(byNo); // the 5 weakest cards
const DUPLICATE = byNo(3);
const CPU_NAME = "Pixel Pete";
const PACK_PRICE = 100;

// The practice game, move by move (you go first, as Red). It ends 9–0 and
// captures the computer's Fly.
const SCRIPT = [
  { who: "you", no: 60, slot: 4 },
  { who: "cpu", no: 2, slot: 1 },
  { who: "you", no: 150, slot: 7 },
  { who: "cpu", no: 3, slot: 6 },
  { who: "you", no: 70, slot: 2 },
  { who: "cpu", no: 1, slot: 0 },
  { who: "you", no: 55, slot: 3 },
  { who: "cpu", no: 4, slot: 5 },
  { who: "you", no: 81, slot: 8 },
];
const SQUARES = ["top-left", "top-middle", "top-right", "middle-left", "center", "middle-right",
  "bottom-left", "bottom-middle", "bottom-right"];
const CPU_DELAY_MS = 1300;

const coachTitleEl = document.getElementById("coachTitle");
const coachTextEl = document.getElementById("coachText");
const stageEl = document.getElementById("stage");
const dotsEl = document.getElementById("tourDots");
const backBtn = document.getElementById("backBtn");
const nextBtn = document.getElementById("nextBtn");

let step = 0;
let timers = [];

function coach(title, text) {
  coachTitleEl.textContent = title;
  coachTextEl.innerHTML = text;
}

function say(text) {
  coachTextEl.innerHTML = text;
}

function ready(on = true) {
  nextBtn.disabled = !on;
}

function later(fn, ms) {
  timers.push(setTimeout(fn, ms));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cardEl(card, color = "neutral", opts) {
  return createCardEl(card, color, opts);
}

const strong = (text) => `<strong>${escapeHtml(text)}</strong>`;

// --- The steps ---
const STEPS = [
  {
    title: "Welcome to WildFlip!",
    next: "Start the Tour",
    show() {
      coach("Welcome to WildFlip!",
        "Collect animal cards, then flip your opponent's cards on a 3×3 board. This 2-minute tour shows you everything " +
        "with practice cards. Nothing here changes your real collection.");
      const box = el("div", "cc-tour-welcome");
      const logo = el("img", "cc-tour-logo");
      logo.src = "icons/wildflip.svg";
      logo.alt = "";
      const list = el("ul", "cc-tour-list");
      ["How to get coins", "How to open a card pack", "How to save a deck", "Your first game, move by move",
        "Claiming a card after a win", "The catalog", "Upgrading a card"].forEach((t) => list.appendChild(el("li", "", t)));
      box.append(logo, list);
      stageEl.appendChild(box);
      ready();
    },
  },
  {
    title: "Coins",
    show() {
      coach("Coins",
        `You start with ${strong(`🪙 ${PACK_PRICE}`)}. Every game you finish pays coins, and you spend them on card packs.`);
      const wallet = el("div", "cc-wallet");
      wallet.innerHTML = `🪙 <strong>${PACK_PRICE}</strong> coins`;
      const table = el("table", "cc-sim-table cc-tour-table");
      table.innerHTML = `
        <caption>Coins for each game</caption>
        <thead><tr><th scope="col">Against</th><th scope="col">Win</th><th scope="col">Loss</th></tr></thead>
        <tbody>
          <tr><th scope="row">🤖 The computer</th><td>${COIN_REWARDS.cpu.win}</td><td>${COIN_REWARDS.cpu.loss}</td></tr>
          <tr><th scope="row">👤 Another player</th><td>${COIN_REWARDS.live.win}</td><td>${COIN_REWARDS.live.loss}</td></tr>
        </tbody>`;
      const note = el("p", "settings-hint",
        "Sign in with Google (in Settings) to play other people. Resigning or running out of time earns nothing.");
      stageEl.append(wallet, table, note);
      ready();
    },
  },
  {
    title: "Open a card pack",
    show() {
      coach("Open a card pack",
        `Packs are on the ${strong("🪙 Packs")} page. Tap ${strong("Open Standard Pack")} to spend your coins.`);
      ready(false);
      const wallet = el("div", "cc-wallet");
      wallet.innerHTML = `🪙 <strong>${PACK_PRICE}</strong> coins`;
      const art = el("div", "cc-pack-art");
      art.dataset.pack = "standard";
      art.innerHTML = `<span class="cc-pack-brand">WildFlip</span><span class="cc-pack-icon">🐾</span>
        <span class="cc-pack-name">Standard Pack</span><span class="cc-pack-size">${PACK.length} cards</span>`;
      const buy = el("button", "reset-btn cc-tour-hint", `Open Standard Pack (🪙 ${PACK_PRICE})`);
      buy.type = "button";
      const cards = el("div", "cc-pack-cards");
      stageEl.append(wallet, art, buy, cards);
      buy.addEventListener("click", () => {
        buy.remove();
        art.classList.add("cc-pack-tear");
        wallet.innerHTML = "🪙 <strong>0</strong> coins";
        say("The coins are spent and the cards are yours. Tap each card to turn it over.");
        later(() => {
          art.remove();
          let left = PACK.length;
          PACK.forEach((card, i) => {
            const slot = el("button", "cc-pack-slot cc-tour-hint");
            slot.type = "button";
            slot.style.animationDelay = `${i * 90}ms`;
            slot.innerHTML = `<div class="cc-card-back"><span>?</span></div>`;
            slot.addEventListener("click", () => {
              slot.disabled = true;
              slot.classList.remove("cc-tour-hint");
              slot.innerHTML = "";
              const face = cardEl(card);
              face.classList.add("cc-flipping");
              if (card.rarity !== "common") face.classList.add("cc-glow");
              slot.append(face, newBadgeEl());
              const cap = el("span", "cc-caption");
              cap.innerHTML = `<span>${escapeHtml(card.name)}</span><span class="cc-muted" style="color: ${RARITIES[card.rarity].color}">${RARITIES[card.rarity].label}</span>`;
              slot.appendChild(cap);
              left--;
              if (!left) {
                say(`${strong("NEW")} marks cards you didn't have yet. The ${strong(PACK[1].name)} is a ${strong("Rare")}: ` +
                  "rarer cards have bigger numbers and a colored gem in the corner.");
                ready();
              }
            });
            cards.appendChild(slot);
          });
        }, 700);
      });
    },
  },
  {
    title: "Save a deck",
    show() {
      coach("Save a deck",
        `Before each game you choose ${strong("5 cards")} for your hand. Tap the 5 glowing cards, your strongest, to pick them.`);
      ready(false);
      const picked = new Set();
      const grid = el("div", "cc-grid");
      const best = new Set(DECK.map((c) => c.id));
      [...STARTERS, ...PACK].forEach((card) => {
        const btn = el("button", "cc-pick");
        btn.type = "button";
        btn.appendChild(cardEl(card));
        if (best.has(card.id)) btn.classList.add("cc-tour-hint");
        btn.addEventListener("click", () => {
          if (!best.has(card.id)) {
            say(`For this practice game, pick the glowing cards. Bigger numbers flip more cards; the ${strong(card.name)} is one of your weaker ones.`);
            return;
          }
          if (picked.has(card.id)) picked.delete(card.id);
          else picked.add(card.id);
          btn.classList.toggle("selected", picked.has(card.id));
          btn.classList.toggle("cc-tour-hint", !picked.has(card.id));
          if (picked.size === DECK.length) showSave();
          else say(`Picked ${picked.size} of 5. Tap the rest of the glowing cards.`);
        });
        grid.appendChild(btn);
      });
      const saveRow = el("div", "cc-save-deck");
      saveRow.hidden = true;
      const name = el("input", "cc-input");
      name.value = "My First Deck";
      name.setAttribute("aria-label", "Deck name");
      const save = el("button", "reset-btn cc-secondary cc-tour-hint", "Save as Deck");
      save.type = "button";
      saveRow.append(name, save);
      const saved = el("div", "cc-deck-list");
      stageEl.append(grid, saveRow, saved);

      function showSave() {
        saveRow.hidden = false;
        say(`That's a full hand. Give it a name and tap ${strong("Save as Deck")} so you can pick it again with one tap.`);
      }
      save.addEventListener("click", () => {
        saveRow.hidden = true;
        grid.hidden = true;
        const row = el("div", "cc-deck-row selected");
        const head = el("span", "cc-deck-head");
        head.append(el("strong", "", name.value.trim() || "My First Deck"),
          el("span", "cc-muted", `Strength ${DECK.reduce((s, c) => s + cardTotal(c), 0)} · 1 rare`));
        const cardsRow = el("span", "cc-deck-cards");
        DECK.forEach((c) => cardsRow.appendChild(cardEl(c)));
        const pick = el("div", "cc-deck-pick");
        pick.append(head, cardsRow);
        row.appendChild(pick);
        saved.appendChild(row);
        say(`Saved! Your decks are on the ${strong("My Decks")} tab. Next time, choose the deck and tap ${strong("Play the Computer")}.`);
        ready();
      });
    },
  },
  {
    title: "Your first game",
    next: "Claim Your Prize",
    show() {
      playPracticeGame();
    },
  },
  {
    title: "Claim a card",
    show() {
      coach("Claim a card",
        `You won, so you get ${strong(`🪙 +${COIN_REWARDS.cpu.win} coins`)} and ${strong(`⭐ +${XP_REWARDS.cpu.win} XP`)}, ` +
        `and you may keep a copy of one of ${CPU_NAME}'s cards that ended in your color. Cards you don't own yet say ` +
        `${strong("NEW")}. Pick the ${strong(DUPLICATE.name)}: you already have one, and two copies let you upgrade it.`);
      ready(false);
      const choices = el("div", "cc-hand cc-tour-claim");
      const owned = new Set([...STARTERS, ...PACK].map((c) => c.id));
      const options = SCRIPT.filter((m) => m.who === "cpu").map((m) => byNo(m.no));
      options.forEach((card) => {
        const btn = el("button", "cc-hand-card");
        btn.type = "button";
        btn.appendChild(cardEl(card));
        if (!owned.has(card.id)) btn.appendChild(newBadgeEl());
        if (card.id === DUPLICATE.id) btn.classList.add("cc-tour-hint");
        btn.addEventListener("click", () => {
          if (card.id !== DUPLICATE.id) {
            say(`The ${strong(card.name)} would be new to you, a fine pick in a real game. For this tour, take the glowing ${strong(DUPLICATE.name)}.`);
            return;
          }
          choices.innerHTML = "";
          const got = el("div", "cc-hand-card cc-claimed");
          got.appendChild(cardEl(card));
          choices.appendChild(got);
          say(`The ${strong(DUPLICATE.name)} joined your collection, so now you have two. ` +
            "Claimed cards always come plain, without any upgrades the other player gave theirs.");
          ready();
        });
        choices.appendChild(btn);
      });
      stageEl.appendChild(choices);
    },
  },
  {
    title: "The catalog",
    show() {
      coach("The catalog",
        `${strong("Collection & Stats")} lists every card, grouped by set. Cards you haven't found show only their number ` +
        "and rarity. Tap a card you own for a close-up.");
      ready(false);
      const set = cardSet(DUPLICATE);
      const inSet = TOUR.cards.filter((c) => cardSet(c).id === set.id && c.rarity === "common");
      const mine = [...STARTERS, ...PACK, DUPLICATE];
      const count = (c) => mine.filter((m) => m.id === c.id).length;
      const head = el("div", "cc-group-head");
      head.append(el("h3", "cc-rarity-heading", `${set.icon} ${set.name}`),
        el("span", "cc-group-count", `${inSet.filter(count).length} / ${inSet.length} commons`));
      const grid = el("div", "cc-grid cc-collection");
      const closeup = el("div", "cc-tour-closeup");
      inSet.forEach((card) => {
        const item = el("button", "cc-collect-item cc-catalog-item");
        item.type = "button";
        const n = count(card);
        item.classList.toggle("missing", !n);
        if (n) {
          item.appendChild(cardEl(card));
          item.appendChild(el("span", "cc-count", `×${n}`));
          if (card.id === DUPLICATE.id) item.classList.add("cc-tour-hint");
        } else {
          const outline = el("div", "cc-card-unfound");
          outline.style.setProperty("--rarity-color", RARITIES[card.rarity].color);
          outline.innerHTML = `<span class="cc-unfound-no">#${card.no}</span><span class="cc-unfound-rarity">${RARITIES[card.rarity].label}</span>`;
          item.append(outline, el("span", "cc-count", "Not found"));
        }
        item.addEventListener("click", () => {
          if (!n) {
            say(`Card #${card.no} isn't found yet. Find it in a pack, or win it from an opponent.`);
            return;
          }
          item.classList.remove("cc-tour-hint");
          closeup.innerHTML = "";
          closeup.append(cardEl(card), el("p", "cc-note",
            `${card.name} · ${RARITIES[card.rarity].label} · total ${cardTotal(card)} · ${n} cop${n === 1 ? "y" : "ies"} owned`));
          say(`The close-up shows a card's total, how many copies you own, and how it's done in your games. ` +
            `With duplicates you'll also find ${strong("Upgrade a copy")} here.`);
          ready();
        });
        grid.appendChild(item);
      });
      stageEl.append(head, grid, closeup);
    },
  },
  {
    title: "Upgrade a card",
    show() {
      coach("Upgrade a card",
        `You have two ${strong(DUPLICATE.name)} cards. Use one as a duplicate to raise a side of the other by 1. ` +
        `Pick the side to upgrade: the ${strong("right")} side is a good choice, since it's already its biggest number.`);
      ready(false);
      const copies = el("div", "cc-hand cc-tour-copies");
      const keep = el("div", "cc-hand-card");
      const spare = el("div", "cc-hand-card");
      keep.appendChild(cardEl(DUPLICATE));
      spare.appendChild(cardEl(DUPLICATE));
      copies.append(keep, spare);
      const sides = el("div", "size-options cc-upgrade-sides");
      let chosen = null;
      const btn = el("button", "reset-btn", "Pick a side to upgrade");
      btn.type = "button";
      btn.disabled = true;
      [["top", "Top"], ["right", "Right"], ["bottom", "Bottom"], ["left", "Left"]].forEach(([side, label]) => {
        const b = el("button", `size-option${side === "right" ? " cc-tour-hint" : ""}`,
          `${label} ${DUPLICATE[side]} → ${DUPLICATE[side] + 1}`);
        b.type = "button";
        b.dataset.side = side;
        b.addEventListener("click", () => {
          chosen = side;
          sides.querySelectorAll(".size-option").forEach((x) => {
            x.classList.toggle("selected", x === b);
            x.classList.remove("cc-tour-hint");
          });
          btn.disabled = false;
          btn.textContent = `Upgrade ${label} (uses 1 duplicate)`;
          btn.classList.add("cc-tour-hint");
        });
        sides.appendChild(b);
      });
      const cost = el("p", "cc-upgrade-cost",
        `Upgrades cost ${UPGRADE_COSTS.join(", then ")} duplicates. Each side can be raised once, up to ${UPGRADE_MAX} per copy.`);
      stageEl.append(copies, sides, cost, btn);
      btn.addEventListener("click", () => {
        if (!chosen) return;
        spare.remove();
        keep.innerHTML = "";
        keep.classList.add("cc-claimed");
        keep.appendChild(cardEl(DUPLICATE, "neutral", { boost: { [chosen]: 1 } }));
        sides.remove();
        btn.remove();
        say(`Upgraded! The gold ${strong(String(DUPLICATE[chosen] + 1))} is your upgrade. It belongs to this copy only: ` +
          "if the card is lost, or someone wins a copy of it from you, the upgrade doesn't go with it. " +
          "Upgrades let you grow stronger with the cards you love.");
        ready();
      });
    },
  },
  {
    title: "You're ready!",
    next: "Play WildFlip",
    show() {
      coach("You're ready!",
        "That's everything. A few more tips:");
      const list = el("ul", "cc-tour-list");
      [
        "Every game earns XP. As your level rises, the computer plays better and its cards get upgrades, It plays low commons boosted with gold numbers, so cards you win from it are always low commons. For rarer cards, open packs and play other people.",
        "Against other players (Find a Player, once signed in), a card that ends a lost game in the winner's color gets a strike. Three strikes and that copy is gone.",
        "How to play, under the Play buttons, has all the rules. You can take this tour again from there.",
      ].forEach((t) => list.appendChild(el("li", "", t)));
      stageEl.appendChild(list);
      try {
        localStorage.setItem(TOUR_DONE_KEY, "1");
      } catch {
        // The tour works without remembering it was finished.
      }
      ready();
    },
  },
];

// --- The practice game ---
// The script decides every move. Your moves wait for you to tap the card
// and square it points out; the computer's follow by themselves.
function playPracticeGame() {
  ready(false);
  const board = Array(9).fill(null);
  const hand = [...DECK];
  let cpuLeft = CPU.length;
  let turn = 0;
  let selected = null;

  const opp = el("div", "cc-side");
  opp.dataset.color = "blue";
  const oppBar = el("div", "cc-bar");
  const oppScore = el("strong", "cc-score", "0");
  oppBar.append(el("span", "cc-who", `🤖 ${CPU_NAME}`), oppScore);
  const oppHand = el("div", "cc-hand");
  opp.append(oppBar, oppHand);
  const boardEl = el("div", "cc-board");
  const you = el("div", "cc-side");
  you.dataset.color = "red";
  const youHand = el("div", "cc-hand");
  const youBar = el("div", "cc-bar");
  const youScore = el("strong", "cc-score", "0");
  youBar.append(el("span", "cc-who", "You"), youScore);
  you.append(youHand, youBar);
  stageEl.append(opp, boardEl, you);

  const move = () => SCRIPT[turn];

  function render(placed = null, flipped = []) {
    oppHand.innerHTML = "";
    for (let i = 0; i < cpuLeft; i++) {
      const wrap = el("div", "cc-hand-card");
      wrap.appendChild(el("div", "cc-card-hidden blue"));
      oppHand.appendChild(wrap);
    }
    boardEl.innerHTML = "";
    const m = move();
    board.forEach((slot, i) => {
      const cell = el("button", "cc-slot");
      cell.type = "button";
      cell.dataset.index = i;
      cell.setAttribute("aria-label", `${SQUARES[i]} square`);
      if (slot) {
        cell.disabled = true;
        const flipping = flipped.includes(i);
        const other = slot.color === "red" ? "blue" : "red";
        const c = cardEl(TOUR.byId[slot.cardId], flipping ? other : slot.color);
        if (i === placed) c.classList.add("cc-placed");
        if (flipping) {
          c.classList.add("cc-flipping");
          later(() => c.classList.replace(other, slot.color), 250);
        }
        cell.appendChild(c);
      } else if (m && m.who === "you" && selected !== null && i === m.slot) {
        cell.classList.add("cc-tour-hint");
      }
      boardEl.appendChild(cell);
    });
    boardEl.classList.toggle("placing", Boolean(m && m.who === "you" && selected !== null));
    youHand.innerHTML = "";
    hand.forEach((card, i) => {
      const btn = el("button", "cc-hand-card");
      btn.type = "button";
      btn.dataset.index = i;
      btn.disabled = !(m && m.who === "you");
      btn.classList.toggle("selected", selected === i);
      if (m && m.who === "you" && selected === null && card.no === m.no) btn.classList.add("cc-tour-hint");
      btn.appendChild(cardEl(card, "red"));
      youHand.appendChild(btn);
    });
    youHand.classList.toggle("waiting", !(m && m.who === "you"));
    youScore.textContent = colorCount(board, "red");
    oppScore.textContent = colorCount(board, "blue");
  }

  // "Its right 3 beats the Ant's left 1" for each flip.
  function explain(card, slot, flips) {
    return flips.map((f) => {
      const other = TOUR.byId[board[f].cardId];
      const d = f - slot;
      const [mine, theirs] = d === -3 ? ["top", "bottom"] : d === 3 ? ["bottom", "top"] : d === -1 ? ["left", "right"] : ["right", "left"];
      // A card of yours the computer had flipped comes back.
      return board[f].seat === "you"
        ? `its ${mine} ${card[mine]} beats your ${other.name}'s ${theirs} ${other[theirs]}, winning it back`
        : `its ${mine} ${card[mine]} beats the ${other.name}'s ${theirs} ${other[theirs]}`;
    }).join(", and ");
  }

  function place(m) {
    const card = byNo(m.no);
    const color = m.who === "you" ? "red" : "blue";
    const flips = CardRules.placeCard(TOUR, board, m.slot, card.id, color, { seat: m.who });
    if (m.who === "you") hand.splice(hand.findIndex((c) => c.no === m.no), 1);
    else cpuLeft--;
    turn++;
    selected = null;
    render(m.slot, flips);
    return { card, flips };
  }

  function yourTurn() {
    const m = move();
    const card = byNo(m.no);
    const first = turn === 0;
    say(`${first ? "A coin toss decides who starts: you go first, so your cards are <span class=\"cc-red-text\">Red</span>. " : ""}` +
      `Tap the glowing ${strong(card.name)} in your hand.`);
    render();
  }

  function afterYours({ card, flips }) {
    const m = SCRIPT[turn - 1];
    const how = flips.length
      ? `You flipped ${flips.length} card${flips.length === 1 ? "" : "s"}: ${explain(card, m.slot, flips)}.`
      : "Nothing to flip yet. A card flips only when a touching enemy card's facing number is lower.";
    if (turn >= SCRIPT.length) {
      finish(how);
      return;
    }
    say(`${how} Now ${CPU_NAME} plays…`);
    later(cpuTurn, CPU_DELAY_MS + (flips.length ? 600 : 0));
  }

  function cpuTurn() {
    const m = move();
    const { card, flips } = place(m);
    const how = flips.length
      ? `${CPU_NAME} played the ${strong(card.name)} and flipped ${flips.length === 1 ? "one of your cards" : `${flips.length} of your cards`}: ` +
        `${explain(card, m.slot, flips)}. Don't worry, you can flip ${flips.length === 1 ? "it" : "them"} back!`
      : `${CPU_NAME} played the ${strong(card.name)} on the ${SQUARES[m.slot]} square.`;
    later(() => {
      const next = byNo(move().no);
      say(`${how} Your turn: tap the glowing ${strong(next.name)}.`);
      render();
    }, 500);
  }

  function finish(how) {
    const red = colorCount(board, "red");
    say(`${how} The board is full: ${strong(`${red}–${9 - red}`)}, you win! 🎉 Whoever has more cards in their color ` +
      `wins. ${CPU_NAME} keeps one card unplayed, and it doesn't count.`);
    ready();
  }

  youHand.addEventListener("click", (e) => {
    const btn = e.target.closest(".cc-hand-card");
    const m = move();
    if (!btn || !m || m.who !== "you") return;
    const card = hand[Number(btn.dataset.index)];
    if (card.no !== m.no) {
      say(`Try the glowing ${strong(byNo(m.no).name)} for this move. Each move in the practice game is planned to show you a trick.`);
      return;
    }
    selected = Number(btn.dataset.index);
    say(`Now tap the glowing ${strong(SQUARES[m.slot])} square.`);
    render();
  });

  boardEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".cc-slot");
    const m = move();
    if (!cell || cell.disabled || !m || m.who !== "you" || selected === null) return;
    if (Number(cell.dataset.index) !== m.slot) {
      say(`Try the glowing ${strong(SQUARES[m.slot])} square for this move.`);
      return;
    }
    afterYours(place(m));
  });

  coach("Your first game",
    `${CPU_NAME} has 5 cards, face down until played. Take turns placing a card on an empty square. When you place a ` +
    "card, any touching enemy card with a lower number on the facing side flips to your color.");
  later(yourTurn, 2200);
  render();
}

// --- Moving between steps ---
function show(index) {
  timers.forEach(clearTimeout);
  timers = [];
  step = index;
  stageEl.innerHTML = "";
  const s = STEPS[step];
  s.show();
  backBtn.hidden = step === 0;
  nextBtn.textContent = s.next || "Next";
  dotsEl.innerHTML = "";
  STEPS.forEach((_, i) => {
    const dot = el("span", `cc-tour-dot${i === step ? " on" : i < step ? " done" : ""}`);
    dotsEl.appendChild(dot);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

nextBtn.addEventListener("click", () => {
  if (step === STEPS.length - 1) window.location.href = "cards.html";
  else show(step + 1);
});

backBtn.addEventListener("click", () => {
  if (step > 0) show(step - 1);
});

show(0);
