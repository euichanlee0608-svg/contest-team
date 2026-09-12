/* 첫 화면 — 질문 헤드라인과 모집 중인 공모전 목록.

   시트에서 온 문자열은 전부 textContent 로만 넣는다(innerHTML 금지).
   공고 제목·요약은 외부 사이트에서 크롤해 온 값이라 신뢰할 수 없다. */
(function () {
  "use strict";

  var API = window.ContestTeamAPI;
  var listEl = document.getElementById("list");
  var stateEl = document.getElementById("list-state");
  var headlineEl = document.getElementById("headline");

  function setState(text, bad) {
    if (!stateEl) return;
    stateEl.textContent = text;
    stateEl.className = bad ? "notice notice--bad" : "notice";
    stateEl.hidden = false;
  }

  function dueLabel(c) {
    if (c.days_left === null) return "마감 미정";
    if (c.days_left === 0) return "오늘 마감";
    return "D-" + c.days_left;
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null && text !== "") n.textContent = text;
    return n;
  }

  function renderContest(c) {
    var li = el("li", "contest");

    var due = el("span", "contest__due", dueLabel(c));
    if (c.urgent) due.setAttribute("data-urgent", "1");
    li.appendChild(due);

    var body = el("div", "contest__body");

    body.appendChild(el("h3", "contest__title", c.title));

    var meta = el("p", "contest__meta");
    if (c.host) meta.appendChild(el("span", null, c.host));
    if (c.eligibility) meta.appendChild(el("span", null, c.eligibility));
    if (meta.childNodes.length) body.appendChild(meta);

    if (c.summary) body.appendChild(el("p", "contest__summary", c.summary));

    var actions = el("div", "contest__actions");

    var apply = el("a", "btn", "지원하기");
    apply.href = "./apply.html?c=" + encodeURIComponent(c.contest_id);
    actions.appendChild(apply);

    if (c.url && /^https?:\/\//i.test(c.url)) {
      var src = el("a", "contest__source", "공고 원문");
      src.href = c.url;
      src.target = "_blank";
      src.rel = "noopener noreferrer";
      actions.appendChild(src);
    }

    body.appendChild(actions);
    li.appendChild(body);
    return li;
  }

  API.headlineQuestion().then(function (q) {
    if (q && headlineEl) headlineEl.textContent = "“" + q + "”";
  });

  API.listContests().then(function (rows) {
    if (!rows.length) {
      setState("지금은 모집 중인 공모전이 없습니다. 새로 열리면 이 자리에 올라옵니다.", false);
      return;
    }
    rows.forEach(function (c) { listEl.appendChild(renderContest(c)); });
    listEl.hidden = false;
    stateEl.hidden = true;

    if (!API.isConfigured()) {
      setState("표본 데이터로 화면만 보여주는 중입니다. 실제 접수는 아직 열리지 않았습니다.", false);
    }
  }).catch(function (err) {
    setState("목록을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요. (" + err.message + ")", true);
  });
})();
