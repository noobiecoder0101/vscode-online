// ONINNA — responsive card layout (ticker on large screens, scroll-reveal
// grid otherwise) + mobile nav toggle

document.addEventListener("DOMContentLoaded", () => {

  const cardsSection = document.getElementById("community_cards_sections");

  if (cardsSection) {
    // Keep a pristine copy of the original 9 cards, made once up front,
    // so either layout can be rebuilt from scratch no matter how many
    // times the viewport crosses the breakpoint later.
    const originalCards = Array.from(cardsSection.children).map(card => card.cloneNode(true));

    const mql = window.matchMedia("(min-width: 1024px)");
    let currentMode = null; // "marquee" | "grid"
    let revealObserver = null;

    function buildMarquee() {
      if (revealObserver) {
        revealObserver.disconnect();
        revealObserver = null;
      }

      cardsSection.innerHTML = "";
      const track = document.createElement("div");
      track.className = "cards-track";

      // Original set + one cloned set = seamless infinite loop at -50%
      originalCards.forEach(card => track.appendChild(card.cloneNode(true)));
      originalCards.forEach(card => track.appendChild(card.cloneNode(true)));

      cardsSection.appendChild(track);
      cardsSection.classList.add("marquee-mode");
      currentMode = "marquee";
    }

    function buildGrid() {
      cardsSection.classList.remove("marquee-mode");
      cardsSection.innerHTML = "";
      originalCards.forEach(card => cardsSection.appendChild(card.cloneNode(true)));

      const cards = cardsSection.querySelectorAll(".community-card");

      revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            setTimeout(() => entry.target.classList.add("in-view"), i * 80);
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15 });

      cards.forEach(card => {
        card.classList.add("pre-reveal"); // opt into hidden state, then reveal on scroll
        revealObserver.observe(card);
      });

      currentMode = "grid";
    }

    function syncLayout(isLargeScreen) {
      if (isLargeScreen && currentMode !== "marquee") buildMarquee();
      else if (!isLargeScreen && currentMode !== "grid") buildGrid();
    }

    syncLayout(mql.matches);
    mql.addEventListener("change", (e) => syncLayout(e.matches));
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