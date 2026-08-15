const FENCE_SETTINGS_KEY = "fenceSettings";
const DEFAULT_FENCE_SETTINGS = { gridSize: 5 };

function loadFenceSettings() {
  try {
    const raw = localStorage.getItem(FENCE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_FENCE_SETTINGS };
    return { ...DEFAULT_FENCE_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_FENCE_SETTINGS };
  }
}

function saveFenceSettings(settings) {
  localStorage.setItem(FENCE_SETTINGS_KEY, JSON.stringify(settings));
}

const sizeOptions = document.getElementById("sizeOptions");
const sizeLabel = document.getElementById("sizeLabel");
const preview = document.getElementById("preview");
const saveBtn = document.getElementById("saveBtn");

let selectedSize = loadFenceSettings().gridSize;

function renderPreview(gridSize) {
  sizeLabel.textContent = `${gridSize} x ${gridSize}`;

  sizeOptions.querySelectorAll(".size-option").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.size) === gridSize);
  });

  const dots = gridSize + 1;
  const cell = 20;
  const margin = 10;
  const size = margin * 2 + cell * (dots - 1);
  let svg = `<svg viewBox="0 0 ${size} ${size}">`;
  for (let r = 0; r < dots; r++) {
    for (let c = 0; c < dots; c++) {
      const x = margin + c * cell;
      const y = margin + r * cell;
      svg += `<circle cx="${x}" cy="${y}" r="2.5" fill="var(--text)"/>`;
    }
  }
  svg += "</svg>";
  preview.innerHTML = svg;
}

sizeOptions.addEventListener("click", (e) => {
  const btn = e.target.closest(".size-option");
  if (!btn) return;
  selectedSize = Number(btn.dataset.size);
  renderPreview(selectedSize);
});

saveBtn.addEventListener("click", () => {
  saveFenceSettings({ gridSize: selectedSize });
  window.location.href = "fence.html";
});

renderPreview(selectedSize);
