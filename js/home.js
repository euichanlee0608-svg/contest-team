/* 첫 화면 — 랜딩 아래의 모집 중인 공모전 목록.

   시트에서 온 문자열은 전부 textContent 로만 넣는다(innerHTML 금지).
   공고 제목·요약은 외부 사이트에서 크롤해 온 값이라 신뢰할 수 없다. */
(function () {
  "use strict";

  var API = window.ContestTeamAPI;
  var listEl = document.getElementById("list");
  var stateEl = document.getElementById("list-state");
  var countEl = document.getElementById("board-count");

  function setState(text, bad) {
    stateEl.textContent = text;
    stateEl.className = bad ? "notice notice--bad" : "notice";
    stateEl.hidden = false;
  }

  function dueLabel(c) {
    if (c.days_left === 0) return "오늘 마감";
    return "D-" + c.days_left;
  }

  function dateLabel(c) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.deadline || "");
    return m ? Number(m[2]) + "월 " + Number(m[3]) + "일까지" : "";
  }

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null && text !== "") n.textContent = text;
    return n;
  }

  function renderContest(c, i) {
    var li = el("li", "card");
    li.setAttribute("data-reveal", "");
    li.style.setProperty("--i", String(i % 3));

    var top = el("div", "card__top");
    var due = el("span", "badge", dueLabel(c));
    if (c.urgent) due.setAttribute("data-urgent", "1");
    top.appendChild(due);
    var date = dateLabel(c);
    if (date) top.appendChild(el("span", "card__date", date));
    li.appendChild(top);

    li.appendChild(el("h3", "card__title", c.title));
    if (c.eligibility) li.appendChild(el("p", "card__elig", c.eligibility));
    if (c.team_note) li.appendChild(el("p", "card__note", c.team_note));
    else if (c.summary) li.appendChild(el("p", "card__summary", c.summary));

    var actions = el("div", "card__actions");
    var apply = el("a", "card__apply", "지원하기");
    apply.href = "./apply.html?c=" + encodeURIComponent(c.contest_id);
    actions.appendChild(apply);

    if (c.url && /^https?:\/\//i.test(c.url)) {
      var src = el("a", "card__source", "공고 원문");
      src.href = c.url;
      src.target = "_blank";
      src.rel = "noopener noreferrer";
      actions.appendChild(src);
    }
    li.appendChild(actions);
    return li;
  }

  API.listContests().then(function (rows) {
    if (!rows.length) {
      setState("지금은 모집 중인 프로젝트가 없습니다. 새로 열리면 이 자리에 올라옵니다.", false);
      return;
    }
    rows.forEach(function (c, i) {
      var node = renderContest(c, i);
      listEl.appendChild(node);
      window.CTMotion.observe(node);
    });
    countEl.textContent = rows.length + "건";
    countEl.hidden = false;
    listEl.hidden = false;
    stateEl.hidden = true;

    if (!API.isConfigured()) {
      setState("표본 데이터로 화면만 보여주는 중입니다. 실제 접수는 아직 열리지 않았습니다.", false);
    } else if (API.isStale()) {
      setState("서버 응답이 늦어 최근에 불러온 목록을 보여드립니다. 지원서는 정상적으로 접수됩니다.", false);
    }
  }).catch(function (err) {
    setState("목록을 불러오지 못했습니다. (" + err.message + ") ", true);
    var again = el("button", "btn btn--ghost", "다시 불러오기");
    again.type = "button";
    again.style.marginLeft = "0.5rem";
    again.addEventListener("click", function () { location.reload(); });
    stateEl.appendChild(again);
  });
})();
