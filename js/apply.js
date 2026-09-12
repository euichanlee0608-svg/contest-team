/* ─────────────────────────────────────────────────────────────
   지원 화면 — 한 화면에 질문 하나.

   왜 한 번에 하나만 보여주나: 폰에서 서술형 질문 서너 개를 한꺼번에 펼쳐 놓으면
   분량에 질려서 닫는다. 진행 표시(2 / 4)가 끝이 보인다는 신호를 준다.

   왜 계속 저장하나: 긴 글을 쓰다가 전화가 오거나 화면이 꺼지면 다 날아간다.
   그 한 번이면 지원을 포기한다. 입력할 때마다 이 브라우저에 저장하고,
   **제출이 실패해도 저장분을 절대 지우지 않는다.**
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var API = window.ContestTeamAPI;

  var stateEl = document.getElementById("state");
  var ctxEl = document.getElementById("ctx");
  var ctxTitle = document.getElementById("ctx-title");
  var ctxMeta = document.getElementById("ctx-meta");
  var ctxNote = document.getElementById("ctx-note");
  var formEl = document.getElementById("flow");
  var stepsEl = document.getElementById("steps");
  var whoEl = document.getElementById("step-who");
  var whoProgress = document.getElementById("who-progress");
  var doneEl = document.getElementById("step-done");
  var errEl = document.getElementById("submit-error");
  var submitBtn = document.getElementById("submit");

  var contestId = new URLSearchParams(location.search).get("c") || "";
  var contest = null;
  var questions = [];
  var stepNodes = [];      /* 질문 단계 DOM */
  var current = 0;         /* 0..questions.length (마지막이 신원 단계) */
  var draftKey = "ct_draft_" + contestId;
  var saveTimer = null;

  /* ── 저장 ── localStorage 가 막혀 있어도 화면은 계속 동작해야 한다. ── */
  function readDraft() {
    try {
      var raw = localStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeDraft(d) {
    try { localStorage.setItem(draftKey, JSON.stringify(d)); return true; }
    catch (e) { return false; }
  }
  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch (e) {}
  }

  function collectDraft() {
    var answers = {};
    stepNodes.forEach(function (node) {
      answers[node.dataset.qid] = node.querySelector(".sheet").value;
    });
    return {
      answers: answers,
      who: {
        name: document.getElementById("f-name").value,
        contact: document.getElementById("f-contact").value,
        affiliation: document.getElementById("f-affil").value,
      },
      saved_at: new Date().toISOString(),
    };
  }

  function scheduleSave(footEl) {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var ok = writeDraft(collectDraft());
      if (footEl) {
        footEl.textContent = ok ? "저장됨" : "이 브라우저에는 저장할 수 없습니다";
      }
    }, 400);
  }

  function setState(text, bad) {
    stateEl.textContent = text;
    stateEl.className = bad ? "notice notice--bad" : "notice";
    stateEl.hidden = false;
  }

  function dueLabel(c) {
    if (c.days_left === null) return "마감 미정";
    if (c.days_left === 0) return "오늘 마감";
    return "D-" + c.days_left;
  }

  /* ── 질문 단계 만들기 ── */
  function buildStep(q, index) {
    var sec = document.createElement("section");
    sec.className = "step";
    sec.dataset.qid = q.qid;
    sec.hidden = true;

    var prog = document.createElement("p");
    prog.className = "step__progress";
    prog.textContent = (index + 1) + " / " + (questions.length + 1);
    sec.appendChild(prog);

    var h = document.createElement("h2");
    h.className = "step__q";
    h.tabIndex = -1;
    h.textContent = q.text;
    sec.appendChild(h);

    if (q.help) {
      var help = document.createElement("p");
      help.className = "step__help";
      help.textContent = q.help;
      sec.appendChild(help);
    }

    var ta = document.createElement("textarea");
    ta.className = "sheet";
    ta.id = "sheet-" + q.qid;
    ta.setAttribute("aria-labelledby", "");
    ta.placeholder = "여기에 편하게 쓰세요. 분량보다 생각의 흐름이 궁금합니다.";
    sec.appendChild(ta);

    var foot = document.createElement("div");
    foot.className = "sheet-foot";
    var count = document.createElement("span");
    count.className = "sheet-foot__count";
    var saved = document.createElement("span");
    saved.className = "sheet-foot__saved";
    foot.appendChild(count);
    foot.appendChild(saved);
    sec.appendChild(foot);

    function refreshCount() {
      var n = ta.value.length;
      count.textContent = n + "자";
      var over = n > q.max_chars;
      count.setAttribute("data-over", over ? "1" : "0");
      if (over) count.textContent = n + "자 — " + q.max_chars + "자 안으로 줄여주세요";
    }

    function autoGrow() {
      ta.style.height = "auto";
      ta.style.height = Math.max(ta.scrollHeight, 0) + "px";
    }

    ta.addEventListener("input", function () {
      refreshCount();
      autoGrow();
      scheduleSave(saved);
    });

    var nav = document.createElement("div");
    nav.className = "step__nav";

    var prev = document.createElement("button");
    prev.type = "button";
    prev.className = "btn btn--quiet";
    prev.textContent = "이전";
    prev.addEventListener("click", function () { go(index - 1, true); });

    var next = document.createElement("button");
    next.type = "button";
    next.className = "btn";
    next.textContent = (index === questions.length - 1) ? "연락처 남기기" : "다음";
    next.addEventListener("click", function () {
      var v = ta.value.trim();
      if (!v) {
        setStepMessage(sec, "한 줄이라도 남겨주세요. 정답을 맞히는 질문이 아닙니다.");
        ta.focus();
        return;
      }
      if (v.length > q.max_chars) {
        setStepMessage(sec, q.max_chars + "자 안으로 줄여주세요.");
        ta.focus();
        return;
      }
      clearStepMessage(sec);
      go(index + 1, true);
    });

    if (index > 0) nav.appendChild(prev);
    nav.appendChild(next);
    sec.appendChild(nav);

    sec._refresh = refreshCount;
    sec._grow = autoGrow;
    return sec;
  }

  function setStepMessage(sec, text) {
    var msg = sec.querySelector(".notice");
    if (!msg) {
      msg = document.createElement("p");
      msg.className = "notice notice--bad";
      sec.insertBefore(msg, sec.querySelector(".step__nav"));
    }
    msg.textContent = text;
    msg.hidden = false;
  }
  function clearStepMessage(sec) {
    var msg = sec.querySelector(".notice");
    if (msg) msg.hidden = true;
  }

  /* ── 단계 이동 ──
     moveFocus: 사용자가 '다음/이전'을 눌러 온 경우에만 초점을 옮긴다.
     첫 로드에서 옮기면 읽기도 전에 굵은 초점 테두리가 먼저 보여 오류처럼 읽힌다. */
  function go(index, moveFocus) {
    if (index < 0 || index > questions.length) return;
    current = index;

    stepNodes.forEach(function (n, i) { n.hidden = (i !== index); });
    whoEl.hidden = (index !== questions.length);
    doneEl.hidden = true;

    var focusTarget = null;
    if (index < questions.length) {
      focusTarget = stepNodes[index].querySelector(".step__q");
      stepNodes[index]._refresh();
      stepNodes[index]._grow();
    } else {
      whoProgress.textContent = (questions.length + 1) + " / " + (questions.length + 1);
      focusTarget = document.getElementById("who-heading");
    }

    window.scrollTo(0, 0);
    /* 새 질문을 읽어 주도록 제목에 초점을 옮긴다. 입력칸에 옮기면 폰에서 키보드가
       갑자기 올라와 화면이 가려지므로 일부러 제목으로 보낸다. */
    if (moveFocus && focusTarget) focusTarget.focus();
  }

  /* ── 제출 ── */
  function onSubmit(ev) {
    ev.preventDefault();
    errEl.hidden = true;

    var name = document.getElementById("f-name").value.trim();
    var contact = document.getElementById("f-contact").value.trim();
    var affil = document.getElementById("f-affil").value.trim();

    if (!name) { showError("이름을 적어주세요."); document.getElementById("f-name").focus(); return; }
    if (!contact) { showError("연락받을 방법을 하나 적어주세요."); document.getElementById("f-contact").focus(); return; }

    var answers = [];
    var missing = -1;
    stepNodes.forEach(function (node, i) {
      var text = node.querySelector(".sheet").value.trim();
      if (!text && missing < 0) missing = i;
      answers.push({ qid: node.dataset.qid, text: text });
    });
    if (missing >= 0) {
      showError((missing + 1) + "번 질문이 비어 있습니다.");
      go(missing, true);
      return;
    }

    writeDraft(collectDraft());   /* 보내기 직전에 한 번 더. 실패해도 글은 남는다. */

    submitBtn.disabled = true;
    submitBtn.textContent = "보내는 중";

    API.submitApplication({
      contest_id: contestId,
      name: name,
      contact: contact,
      affiliation: affil,
      answers: answers,
    }).then(function () {
      clearDraft();
      stepNodes.forEach(function (n) { n.hidden = true; });
      whoEl.hidden = true;
      doneEl.hidden = false;
      window.scrollTo(0, 0);
      document.getElementById("done-heading").focus();
      /* 폰으로 즉시 알림. 지원자 정보는 싣지 않고 공모전 제목만 보낸다. */
      if (typeof window.notifyAction === "function" && contest) {
        window.notifyAction("새 지원 도착 — " + contest.title);
      }
    }).catch(function (err) {
      showError("제출하지 못했습니다. " + err.message +
                " 쓰신 답은 그대로 저장돼 있으니 잠시 뒤 다시 눌러주세요.");
    }).finally(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = "제출하기";
    });
  }

  function showError(text) {
    errEl.textContent = text;
    errEl.hidden = false;
  }

  /* ── 시작 ── */
  if (!contestId) {
    setState("어느 공모전인지 알 수 없습니다. 목록에서 다시 골라주세요.", true);
    return;
  }

  Promise.all([API.getContest(contestId), API.getQuestions(contestId)])
    .then(function (pair) {
      contest = pair[0];
      questions = pair[1];

      if (!contest) {
        setState("이미 마감됐거나 모집이 닫힌 공모전입니다. 목록에서 다른 공모전을 골라주세요.", true);
        return;
      }
      if (!questions.length) {
        setState("이 공모전은 아직 질문이 준비되지 않았습니다. 잠시 뒤에 다시 들러주세요.", true);
        return;
      }

      ctxTitle.textContent = contest.title;
      var due = document.createElement("span");
      due.textContent = dueLabel(contest);
      if (contest.urgent) due.setAttribute("data-urgent", "1");
      ctxMeta.appendChild(due);
      if (contest.host) {
        var host = document.createElement("span");
        host.textContent = contest.host;
        ctxMeta.appendChild(host);
      }
      if (contest.team_note) {
        ctxNote.textContent = contest.team_note;
        ctxNote.hidden = false;
      }
      ctxEl.hidden = false;

      questions.forEach(function (q, i) {
        var node = buildStep(q, i);
        stepNodes.push(node);
        stepsEl.appendChild(node);
      });

      /* 쓰던 글 복구 */
      var draft = readDraft();
      var restored = false;
      if (draft) {
        stepNodes.forEach(function (node) {
          var saved = draft.answers && draft.answers[node.dataset.qid];
          if (saved) { node.querySelector(".sheet").value = saved; restored = true; }
        });
        if (draft.who) {
          document.getElementById("f-name").value = draft.who.name || "";
          document.getElementById("f-contact").value = draft.who.contact || "";
          document.getElementById("f-affil").value = draft.who.affiliation || "";
        }
      }
      if (restored) {
        var note = document.createElement("span");
        note.textContent = "이전에 쓰던 답이 남아 있어 이어서 보여드립니다.";
        ctxNote.appendChild(document.createTextNode(ctxNote.textContent ? " " : ""));
        ctxNote.appendChild(note);
        ctxNote.hidden = false;
      }

      ["f-name", "f-contact", "f-affil"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", function () {
          scheduleSave(null);
        });
      });

      formEl.addEventListener("submit", onSubmit);
      document.getElementById("who-prev").addEventListener("click", function () {
        go(questions.length - 1, true);
      });

      stateEl.hidden = true;
      formEl.hidden = false;
      go(0);

      if (!API.isConfigured()) {
        setState("표본 데이터로 화면만 보여주는 중입니다. 실제 접수는 아직 열리지 않았습니다.", false);
      }
    })
    .catch(function (err) {
      setState("불러오지 못했습니다. 잠시 뒤 새로고침해 주세요. (" + err.message + ")", true);
    });
})();
