// ONINNA — scroll-reveal cards + mobile nav toggle
// Add this to scripts/scripts.js (or link it as an extra <script> tag
// before scripts.js) — it doesn't touch anything else in that file.

document.addEventListener("DOMContentLoaded", () => {

  // ---- Scroll-reveal for .community-card ----
  const cards = document.querySelectorAll(".community-card");

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // small stagger so cards don't all pop in at once
        setTimeout(() => entry.target.classList.add("in-view"), i * 80);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  cards.forEach(card => {
    card.classList.add("pre-reveal"); // opt into the hidden state, then reveal on scroll
    io.observe(card);
  });

  // ---- Mobile nav toggle ----
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
  }

});