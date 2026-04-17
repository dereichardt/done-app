const toggleButton = document.getElementById("toggle-density");

if (toggleButton) {
  toggleButton.addEventListener("click", () => {
    document.body.classList.toggle("compact");
  });
}
