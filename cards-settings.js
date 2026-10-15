const noPlayerEl = document.getElementById("noPlayer");
const playerSettingsEl = document.getElementById("playerSettings");
const nameInput = document.getElementById("nameInput");
const resetPlayerBtn = document.getElementById("resetPlayerBtn");
const saveBtn = document.getElementById("saveBtn");

const save = loadCardSave();
const player = getCurrentPlayer(save);

if (player) {
  playerSettingsEl.hidden = false;
  nameInput.value = player.name;
} else {
  noPlayerEl.hidden = false;
}

resetPlayerBtn.addEventListener("click", () => {
  if (!player) return;
  if (!confirm(`Reset ${player.name}? Their collection, stats and history will be deleted.`)) return;
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
