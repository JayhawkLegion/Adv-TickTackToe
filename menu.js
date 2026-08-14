const menuBtn = document.getElementById("menuBtn");
const menuDropdown = document.getElementById("menuDropdown");

function closeMenu() {
  menuDropdown.hidden = true;
  menuBtn.setAttribute("aria-expanded", "false");
}

function toggleMenu() {
  const willOpen = menuDropdown.hidden;
  menuDropdown.hidden = !willOpen;
  menuBtn.setAttribute("aria-expanded", String(willOpen));
}

menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleMenu();
});

menuDropdown.addEventListener("click", (e) => e.stopPropagation());

document.addEventListener("click", closeMenu);

const currentPage = window.location.pathname.split("/").pop() || "index.html";
menuDropdown.querySelectorAll(".menu-item").forEach((item) => {
  if (item.dataset.page === currentPage) item.classList.add("active");
});
