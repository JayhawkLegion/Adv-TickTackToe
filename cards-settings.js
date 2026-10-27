const noPlayerEl = document.getElementById("noPlayer");
const playerSettingsEl = document.getElementById("playerSettings");
const nameInput = document.getElementById("nameInput");
const resetPlayerBtn = document.getElementById("resetPlayerBtn");
const resetHintEl = document.getElementById("resetHint");
const saveBtn = document.getElementById("saveBtn");
const cloudStatusEl = document.getElementById("cloudStatus");
const cloudActionsEl = document.getElementById("cloudActions");

const online = CardStore.mode === "online";
let player = null;

CardStore.onProfile((next) => {
  const first = player === null;
  player = next;
  playerSettingsEl.hidden = !player;
  noPlayerEl.hidden = Boolean(player);
  // Keep what's being typed; fill in the name the first time it's known.
  if (player && (first || document.activeElement !== nameInput)) nameInput.value = player.name;
});

if (online) {
  resetHintEl.textContent =
    `Deletes your online player's collection, coins, stats and game history. You'll pick a name again and get ` +
    `${STARTER_SIZE} new random starter cards and 🪙 ${STARTING_COINS}.`;
}

// --- Online play ---
CardOnline.subscribe((s) => {
  cloudActionsEl.innerHTML = "";
  if (!s.enabled) {
    cloudStatusEl.textContent =
      "Online play isn't switched on yet. To play other people and keep profiles online with Google sign-in, " +
      "set up the Firebase project (see ONLINE-SETUP.md).";
    return;
  }
  if (online) {
    const who = s.user && s.user.name && s.user.email ? `${s.user.name} (${s.user.email})` : s.user ? s.user.name || s.user.email : "";
    const where = s.status === "ready"
      ? "Your profile, coins and cards are kept on the Card Clash server."
      : onlineStatusText(s);
    cloudStatusEl.textContent = `${who ? `Signed in as ${who}. ` : ""}${where} ` +
      "Signing out switches back to the player saved on this device.";
    cloudActionsEl.append(signOutButton());
    return;
  }
  cloudStatusEl.textContent = s.status === "error" || s.status === "offline"
    ? onlineStatusText(s)
    : "Not signed in: you're playing with the player saved on this device. Sign in with Google to make an " +
      "online player that can play other people, from any device.";
  cloudActionsEl.append(googleSignInButton());
});

resetPlayerBtn.addEventListener("click", async () => {
  if (!player) return;
  if (!confirm(`Reset ${player.name}? Their collection, stats and history will be deleted.`)) return;
  resetPlayerBtn.disabled = true;
  try {
    await CardStore.reset();
    window.location.href = "cards.html";
  } catch (err) {
    alert(err.message);
    resetPlayerBtn.disabled = false;
  }
});

saveBtn.addEventListener("click", async () => {
  const name = cleanName(nameInput.value);
  if (player && name !== player.name) {
    saveBtn.disabled = true;
    try {
      await CardStore.rename(name);
    } catch (err) {
      alert(err.message || "Couldn't save the name. Please try again.");
      saveBtn.disabled = false;
      return;
    }
  }
  window.location.href = "cards.html";
});
