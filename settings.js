const slider = document.getElementById("sizeCount");
const valueLabel = document.getElementById("sizeCountValue");
const preview = document.getElementById("preview");
const hintText = document.getElementById("hintText");
const saveBtn = document.getElementById("saveBtn");

function renderPreview(sizeCount) {
  valueLabel.textContent = sizeCount;

  if (sizeCount <= 1) {
    preview.innerHTML = `<div class="preview-classic">X&nbsp;&nbsp;O</div>`;
    hintText.textContent = "1 = classic X and O, click a square to play.";
    return;
  }

  const stack = [];
  for (let s = 1; s <= sizeCount; s++) {
    stack.push({ color: s % 2 === 0 ? "B" : "R", size: s });
  }
  preview.innerHTML = renderStackSVG(stack, sizeCount);
  hintText.textContent =
    "2+ switches to red vs. blue circles. Drag a circle from your tray onto any square — " +
    "an empty square accepts any size, an occupied square only accepts a bigger circle than " +
    "the one already there. Get three circles of your color in a row (any sizes) to win.";
}

slider.addEventListener("input", () => {
  renderPreview(Number(slider.value));
});

saveBtn.addEventListener("click", () => {
  saveSettings({ sizeCount: Number(slider.value) });
  window.location.href = "index.html";
});

const initial = loadSettings();
slider.value = initial.sizeCount;
renderPreview(initial.sizeCount);
