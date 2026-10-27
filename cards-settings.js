const noPlayerEl = document.getElementById("noPlayer");
const playerSettingsEl = document.getElementById("playerSettings");
const nameInput = document.getElementById("nameInput");
const resetPlayerBtn = document.getElementById("resetPlayerBtn");
const saveBtn = document.getElementById("saveBtn");
const cloudStatusEl = document.getElementById("cloudStatus");
const cloudActionsEl = document.getElementById("cloudActions");

const save = loadCardSave();
const player = getCurrentPlayer(save);

if (player) {
  playerSettingsEl.hidden = false;
  nameInput.value = player.name;
} else {
  noPlayerEl.hidden = false;
}

// --- Online profile ---
function actionButton(label, onClick, secondary = true) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `reset-btn${secondary ? " cc-secondary" : ""}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

CardCloud.subscribe((s) => {
  cloudActionsEl.innerHTML = "";
  if (!s.enabled) {
    cloudStatusEl.textContent =
      "Online saving isn't switched on yet. To save profiles online with Google sign-in, add your Firebase " +
      "project's config to cards-cloud-config.js (the steps are at the top of that file).";
    return;
  }
  if (s.user) {
    const who = s.user.name && s.user.email ? `${s.user.name} (${s.user.email})` : s.user.name || s.user.email;
    cloudStatusEl.textContent = `Signed in as ${who}. ${cloudStatusText(s)}`;
    cloudActionsEl.append(
      actionButton("Save Now", () => CardCloud.syncNow()),
      actionButton("Sign Out", () => CardCloud.signOut())
    );
    return;
  }
  if (s.status === "starting") cloudStatusEl.textContent = "Connecting…";
  else if (s.status === "error") cloudStatusEl.textContent = s.detail;
  else cloudStatusEl.textContent = `${s.detail} Sign in with Google to save your profile online and play it on any device.`;
  const btn = googleSignInButton();
  btn.disabled = s.status === "starting";
  cloudActionsEl.append(btn);
});

resetPlayerBtn.addEventListener("click", () => {
  if (!player) return;
  const online = CardCloud.state().user ? " Your online profile will be replaced by the new player you create." : "";
  if (!confirm(`Reset ${player.name}? Their collection, stats and history will be deleted.${online}`)) return;
  delete save.players[player.id];
  save.currentPlayerId = null;
  saveCardSave(save);
  window.location.href = "cards.html";
});

saveBtn.addEventListener("click", () => {
  if (player) {
    player.name = cleanName(nameInput.value);
    saveCardSave(save);
  }
  window.location.href = "cards.html";
});
