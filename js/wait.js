/* 대기 신호 — 사용자가 '기다리는 중'과 '내 터치가 안 먹힘'을 구분하게 한다.
   1) 누른 즉시: 버튼이 눌림 상태(is-busy)로 바뀌고 글자가 진행형이 된다. 같은 버튼은 다시 눌러도 무시한다.
   2) 기다리는 동안: 얇은 선이 계속 움직이고, 경과 초에 맞춰 문구가 바뀐다(실측 초만 쓴다, 가짜 퍼센트 없음).
   3) 오래 걸리면: "다시 누르지 않아도 된다"를 글로 말한다. */
(function (root) {
  "use strict";

  var LIST_STEPS = [
    [0, "목록을 불러오는 중입니다."],
    [4, "서버를 깨우는 중입니다. 보통 5~10초 걸립니다."],
    [10, "평소보다 오래 걸립니다. 다시 누르지 않아도 계속 불러오는 중입니다."],
  ];

  function status(el, steps) {
    var t0 = Date.now();
    var secEl = document.createElement("span");
    secEl.className = "wait__sec";
    secEl.setAttribute("aria-hidden", "true");
    var current = -1;

    el.classList.add("is-waiting");
    el.setAttribute("role", "status");
    el.setAttribute("aria-busy", "true");
    el.hidden = false;

    function tick() {
      var s = Math.floor((Date.now() - t0) / 1000);
      var idx = 0;
      for (var i = 0; i < steps.length; i++) if (s >= steps[i][0]) idx = i;
      if (idx !== current) {
        current = idx;
        el.textContent = steps[idx][1];
        el.appendChild(secEl);
      }
      secEl.textContent = s >= 4 ? " " + s + "초" : "";
    }
    tick();
    var timer = setInterval(tick, 1000);

    return function stop() {
      clearInterval(timer);
      el.classList.remove("is-waiting");
      el.removeAttribute("aria-busy");
      el.removeAttribute("role");
    };
  }

  function press(btn, busyLabel) {
    if (btn.getAttribute("aria-busy") === "true") return null;
    var idle = btn.textContent;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("is-busy");
    btn.textContent = busyLabel;
    return function release() {
      btn.removeAttribute("aria-busy");
      btn.classList.remove("is-busy");
      btn.textContent = idle;
    };
  }

  function isBusy(btn) { return btn.getAttribute("aria-busy") === "true"; }

  root.Wait = { status: status, press: press, isBusy: isBusy, LIST_STEPS: LIST_STEPS };
})(window);
