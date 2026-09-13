/* 움직임 — 스크롤하면 요소가 올라오고, 내리면 머리말 막대에 바탕이 깔린다.
   움직임 줄이기를 켠 사람과 IntersectionObserver 가 없는 브라우저에는 바로 보여준다.
   (<html class="js"> 가 없으면 CSS 가 숨기지도 않으므로 스크립트가 죽어도 내용은 보인다.) */
(function () {
  "use strict";

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var io = (!reduce && "IntersectionObserver" in window)
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.classList.add("is-in");
          io.unobserve(e.target);
        });
      }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 })
    : null;

  function observe(node) {
    if (io) io.observe(node);
    else node.classList.add("is-in");
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-reveal]"), observe);

  var nav = document.querySelector(".nav");
  function onScroll() {
    if (nav) nav.classList.toggle("is-scrolled", window.scrollY > 12);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  window.CTMotion = { observe: observe };
})();
