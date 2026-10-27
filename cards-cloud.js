// Card Clash online profile: Google sign-in through Firebase Authentication,
// with the player's profile and Card Builder data kept in Cloud Firestore at
// cardClashUsers/{uid}, so the same profile can be played from any device.
//
// This browser's save stays the working copy, so the game plays the same
// offline. Every local save marks the data as changed; while signed in it's
// uploaded shortly after, or on the next page load if that didn't finish.
// On each page load the online copy is checked: if another device saved since
// this one last synced, it's downloaded and the page reloads with it. If both
// changed, the newer save wins. When a device first links to an account that
// already has a different profile online, the player chooses which to keep.
//
// Entirely off (nothing loaded from the network) while
// CARD_CLASH_FIREBASE_CONFIG (cards-cloud-config.js) is null.
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/12.19.0";
const CLOUD_META_KEY = "cardClashCloud";
const CLOUD_COLLECTION = "cardClashUsers";
const CLOUD_PUSH_DELAY_MS = 800;
const CLOUD_MAX_BYTES = 900 * 1024; // Firestore documents top out at 1 MiB
const CLOUD_SIGNED_OUT_TEXT = "Not signed in. Your profile is saved on this device only.";
const CLOUD_OFFLINE_TEXT = "Offline. Changes are kept on this device and saved online when you reconnect.";

const CardCloud = (() => {
  const enabled = typeof CARD_CLASH_FIREBASE_CONFIG === "object" && CARD_CLASH_FIREBASE_CONFIG !== null;
  let fb = null; // { auth, store, authInstance, db } once Firebase has loaded
  let user = null;
  let status = enabled ? "starting" : "off";
  let detail = "";
  let pushTimer = null;
  let syncing = null; // the sync in progress, if any
  let syncAgain = false;
  const listeners = [];

  // Where this device stands with the online copy:
  // { uid, dirty, changedAt, syncedAt } — uid is the linked account, dirty
  // means local changes not uploaded yet, changedAt is the last local save,
  // syncedAt the online version this device last uploaded or downloaded.
  function loadMeta() {
    try {
      return JSON.parse(localStorage.getItem(CLOUD_META_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveMeta(meta) {
    localStorage.setItem(CLOUD_META_KEY, JSON.stringify(meta));
  }

  function state() {
    return {
      enabled,
      status,
      detail,
      user: user && { name: user.displayName || "", email: user.email || "" },
      syncedAt: loadMeta().syncedAt || null,
    };
  }

  function setStatus(next, text = "") {
    status = next;
    detail = text;
    listeners.forEach((fn) => fn(state()));
  }

  // --- Firebase ---
  const loading = enabled ? load() : Promise.resolve(false);

  async function load() {
    try {
      const [app, auth, store] = await Promise.all([
        import(`${FIREBASE_SDK}/firebase-app.js`),
        import(`${FIREBASE_SDK}/firebase-auth.js`),
        import(`${FIREBASE_SDK}/firebase-firestore.js`),
      ]);
      const fbApp = app.initializeApp(CARD_CLASH_FIREBASE_CONFIG);
      fb = { auth, store, authInstance: auth.getAuth(fbApp), db: store.getFirestore(fbApp) };
      return true;
    } catch (err) {
      console.warn("Card Clash: couldn't load Firebase", err);
      if (navigator.onLine === false) setStatus("offline", CLOUD_OFFLINE_TEXT);
      else setStatus("error", "Couldn't reach the online service. Your profile is saved on this device.");
      return false;
    }
  }

  function profileDoc() {
    return fb.store.doc(fb.db, CLOUD_COLLECTION, user.uid);
  }

  async function readRemote() {
    const snap = await fb.store.getDoc(profileDoc());
    return snap.exists() ? snap.data() : null;
  }

  // --- Syncing ---
  // Every upload goes through here, so a newer save from another device is
  // never overwritten unseen. One sync at a time; a request during one runs
  // again after it.
  function sync() {
    if (syncing) {
      syncAgain = true;
      return syncing;
    }
    syncing = runSync().finally(() => {
      syncing = null;
      if (syncAgain) {
        syncAgain = false;
        sync();
      }
    });
    return syncing;
  }

  // Decides whether to upload, download or do nothing, then does it.
  async function runSync() {
    if (!user) return;
    setStatus("syncing", "Checking your online profile…");
    let remote;
    try {
      remote = await readRemote();
    } catch (err) {
      reportFailure(err);
      return;
    }
    const meta = loadMeta();
    const local = getCurrentPlayer(loadCardSave());
    const remoteAt = (remote && remote.updatedAt) || 0;
    const localWins = (meta.changedAt || 0) >= remoteAt;
    let action;
    if (!remote) action = local ? "push" : "none";
    else if (!local) action = "pull";
    else if (meta.uid !== user.uid) {
      // First time this device meets this account.
      action = local.id === remote.playerId ? (localWins ? "push" : "pull") : await chooseProfile(local, remote);
    } else if (remoteAt > (meta.syncedAt || 0)) {
      action = meta.dirty && localWins ? "push" : "pull";
    } else {
      action = meta.dirty ? "push" : "none";
    }

    if (action === "pull" && api.isBusy()) {
      setStatus("syncing", "Newer progress is online; it will load after this game.");
      return;
    }
    if (action === "pull") {
      pull(remote);
      return;
    }
    saveMeta({ ...loadMeta(), uid: user.uid });
    if (action === "push") await push();
    else setSaved();
  }

  function pull(remote) {
    const profile = JSON.parse(remote.profileJson);
    const data = loadCardSave();
    data.players[profile.id] = profile;
    data.currentPlayerId = profile.id;
    // Written directly, not through saveCardSave, so it isn't marked as a
    // local change to upload again.
    localStorage.setItem(CARD_SAVE_KEY, JSON.stringify(data));
    if (remote.poolJson) localStorage.setItem(POOL_SAVE_KEY, remote.poolJson);
    else localStorage.removeItem(POOL_SAVE_KEY);
    saveMeta({ uid: user.uid, dirty: false, changedAt: remote.updatedAt, syncedAt: remote.updatedAt });
    setStatus("syncing", "Loading your online profile…");
    api.onRemoteChange();
  }

  async function push() {
    const player = getCurrentPlayer(loadCardSave());
    if (!player || !user) return;
    const meta = loadMeta();
    const changedAt = meta.changedAt || Date.now();
    const profileJson = JSON.stringify(player);
    const poolJson = localStorage.getItem(POOL_SAVE_KEY);
    if (profileJson.length + (poolJson || "").length > CLOUD_MAX_BYTES) {
      setStatus("error", "Your profile is too big to save online.");
      return;
    }
    setStatus("syncing", "Saving online…");
    try {
      await fb.store.setDoc(profileDoc(), {
        app: "card-clash",
        version: 1,
        playerId: player.id,
        playerName: player.name,
        profileJson,
        poolJson: poolJson || null,
        updatedAt: changedAt,
        savedAt: fb.store.serverTimestamp(),
      });
    } catch (err) {
      reportFailure(err);
      return;
    }
    // Saves made while uploading stay marked for the next upload.
    const after = loadMeta();
    const caughtUp = after.changedAt === meta.changedAt;
    saveMeta({ ...after, uid: user.uid, syncedAt: changedAt, dirty: caughtUp ? false : after.dirty });
    if (caughtUp) setSaved();
    else schedulePush();
  }

  function schedulePush() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      if (user) sync();
    }, CLOUD_PUSH_DELAY_MS);
  }

  function setSaved() {
    setStatus("saved", "Saved online");
  }

  function reportFailure(err) {
    console.warn("Card Clash: online save failed", err);
    if (err && err.code === "permission-denied") {
      setStatus("error", "The online service refused the save. Check the Firestore rules.");
    } else {
      setStatus("offline", CLOUD_OFFLINE_TEXT);
    }
  }

  // Every local save: mark it, and upload soon if signed in.
  onLocalSave(() => {
    if (!enabled) return;
    saveMeta({ ...loadMeta(), dirty: true, changedAt: Date.now() });
    if (user && status !== "choosing") schedulePush();
  });

  window.addEventListener("online", () => {
    if (user && loadMeta().dirty) sync();
  });

  // --- Choosing between two different profiles ---
  function describe(player) {
    const cards = player.collection ? player.collection.length : 0;
    const games = player.stats ? player.stats.played || 0 : 0;
    return `${player.name}: ${games} game${games === 1 ? "" : "s"}, ${cards} cards, 🪙 ${player.coins ?? 0}`;
  }

  // Resolves "pull" (use the online profile) or "push" (keep this device's).
  function chooseProfile(local, remote) {
    let online = null;
    try {
      online = JSON.parse(remote.profileJson);
    } catch {
      return Promise.resolve("push");
    }
    setStatus("choosing", "Choose which profile to keep.");
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      dialog.className = "cc-dialog";
      dialog.innerHTML = `
        <div class="cc-closeup cc-choose">
          <h2 class="cc-closeup-title">Which profile?</h2>
          <p class="settings-hint">This Google account already has a Card Clash profile online, and this device has a different one.</p>
          <button type="button" class="cc-choice" data-choice="pull">
            <strong>Use the online profile</strong><span></span>
          </button>
          <button type="button" class="cc-choice" data-choice="push">
            <strong>Keep this device's profile</strong><span></span>
          </button>
          <p class="settings-hint">Keeping this device's profile replaces the online one. Using the online profile keeps this device's copy here too, just not as the current player.</p>
        </div>`;
      dialog.querySelector('[data-choice="pull"] span').textContent = describe(online);
      dialog.querySelector('[data-choice="push"] span').textContent = describe(local);
      const finish = (choice) => {
        dialog.close();
        dialog.remove();
        resolve(choice);
      };
      dialog.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-choice]");
        if (btn) finish(btn.dataset.choice);
      });
      // Closing without choosing (Escape) uses the online profile, which
      // loses nothing: this device's profile stays saved here.
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish("pull");
      });
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  // --- Signing in and out ---
  async function signIn() {
    if (!fb) return;
    const provider = new fb.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await fb.auth.signInWithPopup(fb.authInstance, provider);
    } catch (err) {
      const code = err && err.code;
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        if (!user) setStatus("signed-out", CLOUD_SIGNED_OUT_TEXT);
      } else if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await fb.auth.signInWithRedirect(fb.authInstance, provider);
      } else {
        console.warn("Card Clash: sign-in failed", err);
        const reason = code === "auth/unauthorized-domain"
          ? "This site isn't on the Firebase project's authorized domains yet."
          : "Couldn't sign in. Please try again.";
        setStatus("error", reason);
      }
    }
  }

  async function signOut() {
    if (!fb) return;
    clearTimeout(pushTimer);
    // Keep this device's data; it just stops being linked to the account.
    saveMeta({ ...loadMeta(), uid: null });
    await fb.auth.signOut(fb.authInstance);
  }

  // --- Start ---
  loading.then(async (ok) => {
    if (!ok) return;
    try {
      await fb.auth.getRedirectResult(fb.authInstance);
    } catch (err) {
      console.warn("Card Clash: redirect sign-in failed", err);
    }
    fb.auth.onAuthStateChanged(fb.authInstance, (signedIn) => {
      user = signedIn;
      if (user) sync();
      else setStatus("signed-out", CLOUD_SIGNED_OUT_TEXT);
    });
  });

  const api = {
    enabled,
    state,
    signIn,
    signOut,
    syncNow: () => sync(),
    // fn(state) now and whenever the sign-in or save status changes.
    subscribe(fn) {
      listeners.push(fn);
      fn(state());
    },
    // Runs after another device's newer save was downloaded.
    onRemoteChange: () => window.location.reload(),
    // Pages return true while downloading now would interrupt something (a
    // game in progress); the download is skipped and the next sync decides.
    isBusy: () => false,
  };
  return api;
})();

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
  btn.addEventListener("click", () => CardCloud.signIn());
  return btn;
}

// Short status line for a page ("Saved online · 2:31 PM").
function cloudStatusText(s) {
  if (s.status === "saved" && s.syncedAt) {
    const when = new Date(s.syncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return `Saved online · ${when}`;
  }
  if (s.status === "starting") return "Connecting…";
  return s.detail;
}
