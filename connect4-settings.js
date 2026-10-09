const C4_SETTINGS_KEY = "connect4Settings";
const DEFAULT_C4_SETTINGS = { columns: 7, rows: 6 };

function loadC4Settings() {
  try {
    const raw = localStorage.getItem(C4_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_C4_SETTINGS };
    return { ...DEFAULT_C4_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_C4_SETTINGS };
  }
}

function saveC4Settings(settings) {
  localStorage.setItem(C4_SETTINGS_KEY, JSON.stringify(settings));
}

const colOptions = document.getElementById("colOptions");
const rowOptions = document.getElementById("rowOptions");
const colsLabel = document.getElementById("colsLabel");
const rowsLabel = document.getElementById("rowsLabel");
const preview = document.getElementById("preview");
const saveBtn = document.getElementById("saveBtn");

let { columns, rows } = loadC4Settings();

function markSelected(container, value) {
  container.querySelectorAll(".size-option").forEach((btn) => {
    btn.classList.toggle("selected", Number(btn.dataset.value) === value);
  });
}

function renderPreview() {
  colsLabel.textContent = columns;
  rowsLabel.textContent = rows;
  markSelected(colOptions, columns);
  markSelected(rowOptions, rows);

  const cell = 20;
  const margin = 6;
  const w = margin * 2 + cell * columns;
  const h = margin * 2 + cell * rows;
  let svg = `<svg viewBox="0 0 ${w} ${h}">`;
  svg += `<rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="var(--c4-frame)"/>`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cx = margin + c * cell + cell / 2;
      const cy = margin + r * cell + cell / 2;
      svg += `<circle cx="${cx}" cy="${cy}" r="${cell * 0.38}" fill="var(--bg)"/>`;
    }
  }
  svg += "</svg>";
  preview.innerHTML = svg;
}

colOptions.addEventListener("click", (e) => {
  const btn = e.target.closest(".size-option");
  if (!btn) return;
  columns = Number(btn.dataset.value);
  renderPreview();
});

rowOptions.addEventListener("click", (e) => {
  const btn = e.target.closest(".size-option");
  if (!btn) return;
  rows = Number(btn.dataset.value);
  renderPreview();
});

saveBtn.addEventListener("click", () => {
  saveC4Settings({ columns, rows });
  window.location.href = "connect4.html";
});

renderPreview();
