// WildFlip server: Cloud Functions that own every signed-in player's
// profile and run every online game, using the same rules as the browser
// (cards-rules.js, copied into shared/ before deploying; see
// scripts/copy-shared.js).
//
// Firestore:
//   players/{uid}            the profile (only these functions write it, apart
//                            from the player's name and saved decks)
//   matches/{id}             a game as both players see it (no hands)
//   matches/{id}/seats/{a|b} one player's hand, and their result once it's over
//   queue/{uid}              a player waiting in Find a Player
//   config/pool              the Card Builder's cards, chances and packs
//   admins/{uid}             present for players who may edit config/pool
const crypto = require("node:crypto");
const { onCall, HttpsError } = require("firebase-functions/https");
const { onSchedule } = require("firebase-functions/scheduler");
const { setGlobalOptions } = require("firebase-functions/options");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const CardRules = require("./shared/cards-rules.js");

// A full CPU per instance, serving many requests at once: moves don't wait
// for one another, and fewer instances have to start up ("cold starts").
setGlobalOptions({ region: "us-central1", maxInstances: 10, cpu: 1, memory: "512MiB", concurrency: 80 });
initializeApp();
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

const POOL_CACHE_MS = 60 * 1000; // Card Builder changes reach the server within a minute
const QUEUE_TTL_MS = 60 * 1000; // a waiting player checks in every 20 seconds
const QUEUE_SCAN = 20; // waiting players looked at per join

const players = db.collection("players");
const matches = db.collection("matches");
const queue = db.collection("queue");

function newId(prefix) {
  return prefix + crypto.randomBytes(9).toString("base64url");
}

// A ping from the game page to wake a sleeping function before it's needed.
function isWarmUp(req) {
  return Boolean(req.data && req.data.warm === true);
}

function needUid(req) {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in to play online.");
  return req.auth.uid;
}

function fail(code, message) {
  throw new HttpsError(code, message);
}

// --- The card pool ---
let poolCache = null;

async function getPool() {
  if (poolCache && Date.now() - poolCache.at < POOL_CACHE_MS) return poolCache.pool;
  const snap = await db.doc("config/pool").get();
  const data = snap.exists ? snap.data() : {};
  poolCache = { at: Date.now(), pool: CardRules.buildPool(data.cards, data.chances, data.packs) };
  return poolCache.pool;
}

// --- Profiles ---
async function readProfile(tx, uid) {
  const ref = players.doc(uid);
  const snap = await tx.get(ref);
  return { ref, data: snap.exists ? CardRules.normalizeProfile(snap.data()) : null };
}

async function needProfile(tx, uid) {
  const profile = await readProfile(tx, uid);
  if (!profile.data) fail("failed-precondition", "Create a player first.");
  return profile;
}

function writeProfile(tx, profile, now = Date.now()) {
  profile.data.updatedAt = now;
  tx.set(profile.ref, profile.data);
}

// The player's game still under way, if any.
async function activeMatchId(tx, profile) {
  const id = profile.data && profile.data.activeMatch;
  if (!id) return null;
  const snap = await tx.get(matches.doc(id));
  return snap.exists && snap.data().status === "active" ? id : null;
}

// --- Matches ---
// The full match (CardRules state) from its public document and both seats.
async function readMatch(tx, matchId) {
  if (typeof matchId !== "string" || !matchId) fail("invalid-argument", "Which game?");
  const ref = matches.doc(matchId);
  const [pub, a, b] = await Promise.all([
    tx.get(ref),
    tx.get(ref.collection("seats").doc("a")),
    tx.get(ref.collection("seats").doc("b")),
  ]);
  if (!pub.exists || !a.exists || !b.exists) fail("not-found", "That game doesn't exist.");
  const { uids, handCounts, ...rest } = pub.data();
  const state = {
    ...rest,
    hands: { a: a.data().hand, b: b.data().hand },
    startHands: { a: a.data().startHand, b: b.data().startHand },
  };
  return { ref, state };
}

function writeMatch(tx, ref, state, settlements = {}) {
  tx.set(ref, { ...CardRules.publicMatch(state), uids: [state.seats.a.uid, state.seats.b.uid] });
  ["a", "b"].forEach((seat) => {
    tx.set(ref.collection("seats").doc(seat), {
      uid: state.seats[seat].uid,
      hand: state.hands[seat],
      startHand: state.startHands[seat],
      settlement: settlements[seat] || null,
    });
  });
}

function seatOf(state, uid) {
  if (state.seats.a.uid === uid) return "a";
  if (state.seats.b.uid === uid) return "b";
  return fail("permission-denied", "That isn't your game.");
}

// The people in a match (not the computer), read before any write.
async function readSeatProfiles(tx, state) {
  const people = ["a", "b"].filter((seat) => !CardRules.isCpuSeat(state, seat));
  const read = await Promise.all(people.map((seat) => readProfile(tx, state.seats[seat].uid)));
  return Object.fromEntries(people.map((seat, i) => [seat, read[i]]));
}

// Saves a match after a change; if it just ended, settles it for each
// player (coins, stats, strikes, card claim) and frees them for a new game.
// The profiles are only read then, which keeps every other move quick.
async function saveMatch(tx, pool, ref, state, now) {
  const settlements = {};
  if (state.status === "finished") {
    const profiles = await readSeatProfiles(tx, state);
    Object.entries(profiles).forEach(([seat, profile]) => {
      if (!profile.data) return; // reset their profile mid-game
      settlements[seat] = CardRules.settleForSeat(pool, state, seat, profile.data, now);
      if (profile.data.activeMatch === state.id) profile.data.activeMatch = null;
      writeProfile(tx, profile, now);
    });
  }
  writeMatch(tx, ref, state, settlements);
}

// Runs fn(tx, pool, match) on a match in a transaction.
async function withMatch(matchId, fn) {
  const pool = await getPool();
  return db.runTransaction(async (tx) => fn(tx, pool, await readMatch(tx, matchId)));
}

function needHand(pool, profile, uids) {
  const hand = CardRules.validateHand(pool, profile, uids);
  if (!hand) fail("invalid-argument", `Choose ${CardRules.HAND_SIZE} different cards from your collection.`);
  return hand;
}

function cleanDeckId(deckId) {
  return typeof deckId === "string" ? deckId.slice(0, 64) : null;
}

// --- Profile actions ---
exports.createProfile = onCall(async (req) => {
  const uid = needUid(req);
  const pool = await getPool();
  return db.runTransaction(async (tx) => {
    const profile = await readProfile(tx, uid);
    if (profile.data) return { created: false };
    const now = Date.now();
    profile.data = { ...CardRules.newProfile(pool, { name: (req.data || {}).name, newId, now }), uid, activeMatch: null };
    writeProfile(tx, profile, now);
    return { created: true };
  });
});

exports.resetProfile = onCall(async (req) => {
  const uid = needUid(req);
  const pool = await getPool();
  return db.runTransaction(async (tx) => {
    const profile = await needProfile(tx, uid);
    if (await activeMatchId(tx, profile)) fail("failed-precondition", "Finish or resign your game first.");
    const now = Date.now();
    profile.data = {
      ...CardRules.newProfile(pool, { name: profile.data.name, newId, now }),
      uid,
      activeMatch: null,
    };
    writeProfile(tx, profile, now);
    tx.delete(queue.doc(uid));
    return { reset: true };
  });
});

exports.openPack = onCall(async (req) => {
  const uid = needUid(req);
  const pool = await getPool();
  const pack = pool.packs.find((p) => p.id === (req.data || {}).packId);
  if (!pack) fail("not-found", "That pack isn't for sale.");
  return db.runTransaction(async (tx) => {
    const profile = await needProfile(tx, uid);
    const problem = CardRules.packProblem(profile.data, pack);
    if (problem) fail("failed-precondition", problem);
    const cards = CardRules.openPack(pool, profile.data, pack, { newId });
    writeProfile(tx, profile);
    return { cards };
  });
});

// Raises one side of a copy by 1, using duplicates of the card. Not while a
// game is under way, since the copies might be in it.
exports.upgradeCard = onCall(async (req) => {
  const uid = needUid(req);
  const { copyUid, side } = req.data || {};
  const pool = await getPool();
  return db.runTransaction(async (tx) => {
    const profile = await needProfile(tx, uid);
    if (await activeMatchId(tx, profile)) fail("failed-precondition", "Finish your game before upgrading cards.");
    const upgraded = CardRules.upgradeCopy(pool, profile.data, copyUid, side);
    if (upgraded.error) fail("failed-precondition", upgraded.error);
    writeProfile(tx, profile);
    return { owned: upgraded.owned, used: upgraded.used };
  });
});

exports.claimCard = onCall(async (req) => {
  const uid = needUid(req);
  return db.runTransaction(async (tx) => {
    const profile = await needProfile(tx, uid);
    const owned = CardRules.claimCard(profile.data, (req.data || {}).cardId, newId);
    if (!owned) fail("failed-precondition", "That card can't be claimed.");
    writeProfile(tx, profile);
    return { owned };
  });
});

// --- Games against the computer ---
exports.startCpuMatch = onCall(async (req) => {
  if (isWarmUp(req)) return { warm: true };
  const uid = needUid(req);
  const { uids, deckId } = req.data || {};
  const pool = await getPool();
  return db.runTransaction(async (tx) => {
    const profile = await needProfile(tx, uid);
    // A game already under way is picked up again instead.
    const active = await activeMatchId(tx, profile);
    if (active) return { matchId: active, resumed: true };
    const hand = needHand(pool, profile.data, uids);
    const now = Date.now();
    const ref = matches.doc();
    // The computer mirrors the hand (never stronger cards), upgraded for the
    // player's level.
    const cpu = CardRules.cpuDifficulty(CardRules.levelFor(profile.data.xp));
    const state = CardRules.newMatch({
      id: ref.id,
      mode: "cpu",
      a: { uid, name: profile.data.name, hand },
      b: { uid: "cpu", name: CardRules.randomItem(CardRules.CPU_NAMES), hand: CardRules.cpuHand(pool, hand, cpu, { newId }) },
      cpu,
      now,
    });
    CardRules.runCpuTurns(pool, state, { now });
    writeMatch(tx, ref, state);
    Object.assign(profile.data, { activeMatch: ref.id, lastHand: [...uids], lastDeckId: cleanDeckId(deckId) });
    writeProfile(tx, profile, now);
    tx.delete(queue.doc(uid));
    return { matchId: ref.id };
  });
});

// --- Find a Player ---
// Joining (and each check-in while waiting) pairs the player with the
// closest match in level and hand strength among those waiting
// (CardRules.matchGap, which allows wider gaps the longer anyone waits);
// otherwise they wait in the queue. Turn order is a coin toss.
exports.joinQueue = onCall(async (req) => {
  if (isWarmUp(req)) return { warm: true };
  const uid = needUid(req);
  const { uids, deckId } = req.data || {};
  const pool = await getPool();
  return db.runTransaction(async (tx) => {
    const profile = await needProfile(tx, uid);
    const active = await activeMatchId(tx, profile);
    if (active) return { status: "matched", matchId: active };
    const hand = needHand(pool, profile.data, uids);
    const now = Date.now();
    const mine = await tx.get(queue.doc(uid));
    const waiting = await tx.get(queue.orderBy("createdAt").limit(QUEUE_SCAN));
    const me = {
      level: CardRules.levelFor(profile.data.xp),
      power: CardRules.handPower(pool, hand),
      since: mine.exists ? mine.data().createdAt : now,
    };
    const candidates = waiting.docs
      .map((doc) => {
        const entry = doc.data();
        if (entry.uid === uid || entry.expiresAt < now) return null;
        const gap = CardRules.matchGap(me, { level: entry.level || 1, power: entry.power || 0, since: entry.createdAt }, now);
        return gap === null ? null : { doc, entry, gap };
      })
      .filter(Boolean)
      .sort((x, y) => x.gap - y.gap || x.entry.createdAt - y.entry.createdAt);

    for (const { doc, entry } of candidates) {
      const other = await readProfile(tx, entry.uid);
      const otherHand = other.data && CardRules.validateHand(pool, other.data, entry.hand.map((c) => c.uid));
      if (!otherHand || other.data.activeMatch) continue;
      const ref = matches.doc();
      const state = CardRules.newMatch({
        id: ref.id,
        mode: "live",
        a: { uid: entry.uid, name: other.data.name, hand: otherHand },
        b: { uid, name: profile.data.name, hand },
        now,
      });
      writeMatch(tx, ref, state);
      other.data.activeMatch = ref.id;
      writeProfile(tx, other, now);
      Object.assign(profile.data, { activeMatch: ref.id, lastHand: [...uids], lastDeckId: cleanDeckId(deckId) });
      writeProfile(tx, profile, now);
      tx.delete(doc.ref);
      tx.delete(queue.doc(uid));
      return { status: "matched", matchId: ref.id };
    }

    tx.set(queue.doc(uid), {
      uid,
      hand,
      level: me.level,
      power: me.power,
      createdAt: me.since,
      expiresAt: now + QUEUE_TTL_MS,
    });
    Object.assign(profile.data, { lastHand: [...uids], lastDeckId: cleanDeckId(deckId) });
    writeProfile(tx, profile, now);
    return { status: "waiting" };
  });
});

exports.leaveQueue = onCall(async (req) => {
  const uid = needUid(req);
  return db.runTransaction(async (tx) => {
    const profile = await readProfile(tx, uid);
    const active = await activeMatchId(tx, profile);
    if (active) return { status: "matched", matchId: active };
    tx.delete(queue.doc(uid));
    return { status: "left" };
  });
});

// --- Playing ---
exports.playMove = onCall(async (req) => {
  if (isWarmUp(req)) return { warm: true };
  const uid = needUid(req);
  const { matchId, copyUid, slot } = req.data || {};
  return withMatch(matchId, async (tx, pool, { ref, state }) => {
    const now = Date.now();
    const played = CardRules.playMove(pool, state, seatOf(state, uid), copyUid, slot, { now });
    if (!played.ok) fail("failed-precondition", played.error);
    CardRules.runCpuTurns(pool, state, { now });
    await saveMatch(tx, pool, ref, state, now);
    return { ok: true };
  });
});

exports.resign = onCall(async (req) => {
  const uid = needUid(req);
  return withMatch((req.data || {}).matchId, async (tx, pool, { ref, state }) => {
    const now = Date.now();
    if (!CardRules.forfeit(state, seatOf(state, uid), "resign", now)) return { ok: false };
    await saveMatch(tx, pool, ref, state, now);
    return { ok: true };
  });
});

// Either player may ask once a live game's turn clock has run out: the
// computer moves for the player whose turn it was, or forfeits their game
// after timeouts in a row.
exports.claimTimeout = onCall(async (req) => {
  const uid = needUid(req);
  return withMatch((req.data || {}).matchId, async (tx, pool, { ref, state }) => {
    seatOf(state, uid);
    const now = Date.now();
    if (!CardRules.handleTimeout(pool, state, { now })) return { changed: false };
    await saveMatch(tx, pool, ref, state, now);
    return { changed: true };
  });
});

// Every minute: turn clocks that ran out with nobody there to claim them,
// and queue entries whose players stopped checking in.
exports.sweep = onSchedule("every 1 minutes", async () => {
  const now = Date.now();
  const due = await matches.where("turnDeadline", "<", now).limit(50).get();
  for (const doc of due.docs) {
    try {
      await withMatch(doc.id, async (tx, pool, { ref, state }) => {
        const at = Date.now();
        if (CardRules.handleTimeout(pool, state, { now: at })) await saveMatch(tx, pool, ref, state, at);
      });
    } catch (err) {
      console.error("sweep: match", doc.id, err);
    }
  }
  const stale = await queue.where("expiresAt", "<", now).limit(200).get();
  if (!stale.empty) {
    const batch = db.batch();
    stale.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
});
