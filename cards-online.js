// WildFlip online: Google sign-in (Firebase Authentication), with the
// player's profile, games, packs and claims run by the WildFlip server
// (Cloud Functions, see functions/) and stored in Cloud Firestore.
//
// The server owns every profile: pages read it, and ask the server to play a
// move, open a pack or claim a card, so coins and cards can't be edited in
// the browser. Players may only rename themselves and change their saved
// decks directly (firestore.rules).
//
// A page is in online mode when this browser is signed in (remembered in
// localStorage so the page knows before Firebase loads); signing in or out
// reloads the page in the other mode. Entirely off (nothing loaded from the
// network) while WILDFLIP_FIREBASE_CONFIG (cards-cloud-config.js) is null.
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const ONLINE_KEY = "cardClashOnline"; // named before the game was WildFlip
const ONLINE_SLOW_MS = 10000;

const CardOnline = (() => {
  const enabled = typeof WILDFLIP_FIREBASE_CONFIG === "object" && WILDFLIP_FIREBASE_CONFIG !== null;
  const session = enabled ? readSession() : null;
  const active = Boolean(session);
  let fb = null; // the Firebase modules and instances, once loaded
  let user = null;
  let admin = false;
  let adminChecked = false;
  let status = enabled ? "starting" : "off";
  let detail = "";
  const listeners = [];

  function readSession() {
    try {
      const saved = JSON.parse(localStorage.getItem(ONLINE_KEY));
      return saved && typeof saved.uid === "string" ? saved : null;
    } catch {
      return null;
    }
  }

  function state() {
    return {
      enabled,
      active,
      status,
      detail,
      admin,
      adminChecked,
      user: user && { name: user.displayName || "", email: user.email || "" },
    };
  }

  function setStatus(next, text = "") {
    status = next;
    detail = text;
    listeners.forEach((fn) => fn(state()));
  }

  // Online, the card pool is the server's: until it arrives, the built-in
  // cards (never this browser's Card Builder pool).
  if (active) applyPool();

  // --- Firebase ---
  const loading = enabled ? load() : Promise.resolve(false);

  async function load() {
    try {
      const [app, auth, store, functions] = await Promise.all([
        import(`${FIREBASE_SDK}/firebase-app.js`),
        import(`${FIREBASE_SDK}/firebase-auth.js`),
        import(`${FIREBASE_SDK}/firebase-firestore.js`),
        import(`${FIREBASE_SDK}/firebase-functions.js`),
      ]);
      const fbApp = app.initializeApp(WILDFLIP_FIREBASE_CONFIG);
      fb = {
        auth,
        store,
        functions,
        authInstance: auth.getAuth(fbApp),
        db: store.getFirestore(fbApp),
        fns: functions.getFunctions(fbApp),
      };
      // Local testing against the Firebase emulators (cards-cloud-config.js).
      const emu = typeof WILDFLIP_FIREBASE_EMULATORS === "object" ? WILDFLIP_FIREBASE_EMULATORS : null;
      if (emu) {
        auth.connectAuthEmulator(fb.authInstance, `http://${emu.host}:${emu.auth}`, { disableWarnings: true });
        store.connectFirestoreEmulator(fb.db, emu.host, emu.firestore);
        functions.connectFunctionsEmulator(fb.fns, emu.host, emu.functions);
      }
      return true;
    } catch (err) {
      console.warn("WildFlip: couldn't load Firebase", err);
      if (navigator.onLine === false) setStatus("offline", "You're offline.");
      else setStatus("error", "Couldn't reach the WildFlip server.");
      return false;
    }
  }

  loading.then(async (ok) => {
    if (!ok) return;
    try {
      await fb.auth.getRedirectResult(fb.authInstance);
    } catch (err) {
      console.warn("WildFlip: redirect sign-in failed", err);
    }
    fb.auth.onAuthStateChanged(fb.authInstance, (signedIn) => {
      user = signedIn;
      // This page was opened in the other mode: switch.
      if (user && (!session || session.uid !== user.uid)) {
        localStorage.setItem(ONLINE_KEY, JSON.stringify({ uid: user.uid }));
        window.location.reload();
        return;
      }
      if (!user && session) {
        localStorage.removeItem(ONLINE_KEY);
        window.location.reload();
        return;
      }
      if (user) {
        setStatus("ready");
        startListening();
      } else {
        setStatus("signed-out");
      }
    });
  });

  // --- Signing in and out ---
  async function signIn() {
    await loading;
    if (!fb) return;
    const provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await fb.auth.signInWithPopup(fb.authInstance, provider);
    } catch (err) {
      const code = err && err.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await fb.auth.signInWithRedirect(fb.authInstance, provider);
        return;
      }
      console.warn("WildFlip: sign-in failed", err);
      setStatus("error", code === "auth/unauthorized-domain"
        ? "This site isn't on the Firebase project's authorized domains yet."
        : "Couldn't sign in. Please try again.");
    }
  }

  async function signOut() {
    await loading;
    if (fb) {
      await fb.auth.signOut(fb.authInstance);
      return;
    }
    // Firebase didn't load (offline): switch this device back to its own
    // player anyway.
    localStorage.removeItem(ONLINE_KEY);
    window.location.reload();
  }

  // --- The online store (same methods as LocalStore in cards-store.js) ---
  let profile = null;
  let profileKnown = false;
  let poolKnown = false;
  const profileListeners = [];

  function emitProfile() {
    if (!profileKnown || !poolKnown) return;
    profileListeners.forEach((fn) => fn(profile));
  }

  function startListening() {
    const { store, db } = fb;
    const slow = setTimeout(() => {
      if (!profileKnown || !poolKnown) setStatus("offline", "Can't reach the server. Check your connection.");
    }, ONLINE_SLOW_MS);
    const failed = (err) => {
      console.warn("WildFlip: online data failed", err);
      setStatus("error", "Lost the connection to the server. Reload to try again.");
    };
    // The pool first, so cards from the Card Builder are known before the
    // profile that owns them is shown.
    store.onSnapshot(store.doc(db, "config", "pool"), (snap) => {
      const data = snap.exists() ? snap.data() : {};
      applyPool(data.cards, data.chances, data.packs);
      poolKnown = true;
      emitProfile();
    }, failed);
    store.onSnapshot(store.doc(db, "players", user.uid), (snap) => {
      profile = snap.exists() ? CardRules.normalizeProfile(snap.data()) : null;
      profileKnown = true;
      clearTimeout(slow);
      if (status !== "ready") setStatus("ready");
      emitProfile();
    }, failed);
    store.getDoc(store.doc(db, "admins", user.uid)).then(
      (snap) => {
        admin = snap.exists();
      },
      () => {}
    ).finally(() => {
      adminChecked = true;
      setStatus(status, detail);
    });
  }

  // Calls a server function; its errors carry a message for the player.
  async function call(name, data = {}) {
    await loading;
    if (!fb || !user) throw new Error("You're not connected to the server.");
    try {
      const result = await fb.functions.httpsCallable(fb.fns, name)(data);
      return result.data;
    } catch (err) {
      console.warn(`WildFlip: ${name} failed`, err);
      const code = String((err && err.code) || "").replace("functions/", "");
      const shown = ["invalid-argument", "failed-precondition", "not-found", "permission-denied", "resource-exhausted"];
      throw new Error(shown.includes(code) && err.message
        ? err.message
        : "Couldn't reach the server. Check your connection and try again.");
    }
  }

  function profileRef() {
    return fb.store.doc(fb.db, "players", user.uid);
  }

  function needProfile() {
    if (!profile) throw new Error("Create a player first.");
    return profile;
  }

  // Saved decks are the player's own to change: edited on a copy and
  // written straight to the profile.
  async function writeDecks(change) {
    const copy = JSON.parse(JSON.stringify(needProfile()));
    const result = change(copy);
    await fb.store.updateDoc(profileRef(), { decks: copy.decks });
    return result;
  }

  const store = {
    mode: "online",

    profile: () => profile,

    onProfile(fn) {
      profileListeners.push(fn);
      if (profileKnown && poolKnown) fn(profile);
      return () => profileListeners.splice(profileListeners.indexOf(fn), 1);
    },

    async createProfile(name) {
      await call("createProfile", { name: cleanName(name) });
    },

    async rename(name) {
      needProfile();
      await fb.store.updateDoc(profileRef(), { name: cleanName(name) });
    },

    async reset() {
      await call("resetProfile");
    },

    async saveDeck(fields) {
      return writeDecks((copy) => {
        const deck = CardRules.saveDeck(POOL, copy, fields, newId);
        if (!deck) throw new Error("A deck needs 5 different cards from your collection.");
        return deck;
      });
    },

    async deleteDeck(id) {
      await writeDecks((copy) => CardRules.deleteDeck(copy, id));
    },

    async openPack(packId) {
      return (await call("openPack", { packId })).cards;
    },

    async claimCard(cardId) {
      return (await call("claimCard", { cardId })).owned;
    },

    async upgradeCard(copyUid, side) {
      return (await call("upgradeCard", { copyUid, side })).owned;
    },

    async startCpuMatch(uids, deckId = null) {
      return (await call("startCpuMatch", { uids, deckId })).matchId;
    },

    // { status: "waiting" } or { status: "matched", matchId }
    joinQueue(uids, deckId = null) {
      return call("joinQueue", { uids, deckId });
    },

    // { status: "left" } or, if paired meanwhile, { status: "matched", matchId }
    leaveQueue() {
      return call("leaveQueue");
    },

    // The public match plus our seat's private document (our hand, and the
    // settlement once it's over).
    watchMatch(id, fn, onError = () => {}) {
      const { store: fs, db } = fb;
      let match = null;
      let seat = null;
      let seatData = null;
      let stopSeat = null;
      const emit = () => {
        if (!match || !seatData) return;
        fn({ match, seat, hand: seatData.hand || [], settlement: seatData.settlement || null });
      };
      const stopMatch = fs.onSnapshot(fs.doc(db, "matches", id), (snap) => {
        if (!snap.exists()) {
          onError(new Error("That game doesn't exist."));
          return;
        }
        match = snap.data();
        if (!seat) {
          seat = match.seats.a.uid === user.uid ? "a" : "b";
          stopSeat = fs.onSnapshot(fs.doc(db, "matches", id, "seats", seat), (s) => {
            seatData = s.data() || {};
            emit();
          }, onError);
        }
        emit();
      }, onError);
      return () => {
        stopMatch();
        if (stopSeat) stopSeat();
      };
    },

    async playMove(matchId, copyUid, slot) {
      await call("playMove", { matchId, copyUid, slot });
    },

    async resign(matchId) {
      await call("resign", { matchId });
    },

    // { changed } — whether the server found the turn had run out.
    claimTimeout(matchId) {
      return call("claimTimeout", { matchId });
    },

    // Only admins (an admins/{uid} document) may change the online pool.
    canEditPool: () => admin,

    async savePool(data) {
      await loading;
      if (!admin) throw new Error("Only WildFlip admins can change the online card pool.");
      await fb.store.setDoc(fb.store.doc(fb.db, "config", "pool"), { ...data, updatedAt: Date.now(), updatedBy: user.uid });
    },
  };

  return {
    enabled,
    active,
    store,
    state,
    signIn,
    signOut,
    // fn(state) now and whenever the sign-in status changes.
    subscribe(fn) {
      listeners.push(fn);
      fn(state());
    },
  };
})();

// Admin-only pages (Card Builder, Simulator) show their content only to a
// signed-in admin; everyone else gets a short note instead. Hiding is for
// tidiness: the Firestore rules are what stop anyone else changing the
// online pool.
function adminOnlyPage() {
  const main = document.querySelector("main");
  const note = document.createElement("p");
  note.className = "cc-note cc-gate";
  main.insertBefore(note, main.children[1]);
  CardOnline.subscribe((s) => {
    const open = s.active && s.admin;
    main.classList.toggle("cc-locked", !open);
    note.hidden = open;
    if (!s.active) note.textContent = "This page is for WildFlip admins. Sign in with Google in Settings to use it.";
    else if (s.adminChecked) note.textContent = "This page is for WildFlip admins only.";
    else note.textContent = "Checking your access…";
  });
}

// The "Sign in with Google" button, in Google's standard style.
function googleSignInButton(label = "Sign in with Google") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "cc-google-btn";
  btn.innerHTML = `
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
    <span></span>`;
  btn.querySelector("span").textContent = label;
  btn.disabled = CardOnline.state().status === "starting";
  btn.addEventListener("click", () => CardOnline.signIn());
  return btn;
}

function signOutButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "reset-btn cc-secondary";
  btn.textContent = "Sign Out";
  btn.addEventListener("click", () => CardOnline.signOut());
  return btn;
}

// Short status for a page ("Online as Sam", "Offline"…).
function onlineStatusText(s) {
  if (s.status === "starting") return "Connecting…";
  if (s.status === "ready") return s.user ? `Online as ${s.user.name || s.user.email}` : "Online";
  if (s.status === "signed-out") return "Signed out";
  return s.detail || "Offline";
}
