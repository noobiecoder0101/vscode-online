// ONINNA — scroll-reveal cards + mobile nav toggle
// Add this to scripts/scripts.js (or link it as an extra <script> tag
// before scripts.js) — it doesn't touch anything else in that file.

document.addEventListener("DOMContentLoaded", () => {

  // ---- Community cards: ticker on large screens, scroll-reveal grid otherwise ----
  const cardsSection = document.getElementById("community_cards_sections");
  const isLargeScreen = window.matchMedia("(min-width: 1024px)").matches;

  if (cardsSection && isLargeScreen) {
    // Duplicate the card set once and put both copies in a flex track —
    // translating the track by exactly -50% loops seamlessly.
    const originalCards = Array.from(cardsSection.children);
    const track = document.createElement("div");
    track.className = "cards-track";

    originalCards.forEach(card => track.appendChild(card));
    originalCards.forEach(card => track.appendChild(card.cloneNode(true)));

    cardsSection.innerHTML = "";
    cardsSection.appendChild(track);
    cardsSection.classList.add("marquee-mode");

  } else if (cardsSection) {
    const cards = cardsSection.querySelectorAll(".community-card");

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add("in-view"), i * 80);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    cards.forEach(card => {
      card.classList.add("pre-reveal"); // opt into the hidden state, then reveal on scroll
      io.observe(card);
    });
  }

  // ---- Mobile nav toggle ----
  const menuToggle = document.getElementById("menuToggle");
  const navLinks = document.getElementById("navLinks");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", () => {
      navLinks.classList.toggle("open");
    });
  }

});