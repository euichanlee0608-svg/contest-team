/* ─────────────────────────────────────────────────────────────
   지원 화면 — 한 화면에 한 가지만 묻는다.

   순서: 공통 항목 4개(역할·목표 수준·강점·시간과 회의) → 시트 [문항] 탭의 서술형(있으면) → 연락처.
   공통 항목은 고르는 방식이라 폰에서도 부담이 적고, 답은 qid 별로 쪼개 보낸다(SPEC 5장).

   왜 계속 저장하나: 쓰다가 전화가 오거나 화면이 꺼지면 다 날아간다.
   그 한 번이면 지원을 포기한다. 입력할 때마다 이 브라우저에 저장하고,
   **제출이 실패해도 저장분을 절대 지우지 않는다.**
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var API = window.ContestTeamAPI;
  var PROFILE = window.QSteps.PROFILE;

  /* GAS 지원 탭의 답변 칸은 I~R 열 개다(SPEC 3장). 공통 항목 4개를 쓰므로 시트 문항은 6개까지. */
  var MAX_ANSWERS = 10;

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
  var stepperEl = document.getElementById("stepper");
  var barEl = document.getElementById("progress-bar");

  var contestId = new URLSearchParams(location.search).get("c") || "";
  var contest = null;
  var steps = [];          /* {qid, short, node, validate(), value(), dump(), restore(d)} */
  var current = 0;         /* 0..steps.length (마지막이 연락처 단계) */
  var draftKey = "ct_draft_" + contestId;
  var saveTimer = null;
  var parts = window.QSteps.create({
    go: function (i, f) { go(i, f); },
    scheduleSave: function (f) { scheduleSave(f); },
  });
  var el = parts.el, buildChoiceStep = parts.choice, buildTextStep = parts.text, setStepMessage = parts.message;

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
    steps.forEach(function (s) { answers[s.qid] = s.dump(); });
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
      if (footEl) footEl.textContent = ok ? "저장됨" : "이 브라우저에는 저장할 수 없습니다";
    }, 400);
  }

  function setState(text, bad) {
    stateEl.textContent = text;
    stateEl.className = bad ? "notice notice--bad" : "notice";
    stateEl.hidden = false;
  }

  function dueLabel(c) {
    if (c.days_left === 0) return "오늘 마감";
    return "D-" + c.days_left;
  }

  function total() { return steps.length + 1; }

  /* ── 진행 표시 ── */
  function buildStepper() {
    steps.concat([{ short: "연락처" }]).forEach(function (s, i) {
      var li = el("li", "stepper__item", s.short);
      li.dataset.index = String(i);
      stepperEl.appendChild(li);
    });
  }

  function paintProgress(index) {
    barEl.style.width = Math.round((index / total()) * 100) + "%";
    Array.prototype.forEach.call(stepperEl.children, function (li, i) {
      li.className = "stepper__item" + (i < index ? " is-done" : i === index ? " is-current" : "");
    });
  }

  /* ── 단계 이동 ──
     moveFocus: 사용자가 '다음/이전'을 눌러 온 경우에만 초점을 옮긴다.
     첫 로드에서 옮기면 읽기도 전에 굵은 초점 테두리가 먼저 보여 오류처럼 읽힌다. */
  function go(index, moveFocus) {
    if (index < 0 || index > steps.length) return;
    current = index;

    steps.forEach(function (s, i) { s.node.hidden = (i !== index); });
    whoEl.hidden = (index !== steps.length);
    doneEl.hidden = true;
    paintProgress(index);

    var focusTarget = index < steps.length
      ? steps[index].node.querySelector(".step__q")
      : document.getElementById("who-heading");
    if (index === steps.length) whoProgress.textContent = total() + " / " + total();

    if (moveFocus) {
      stateEl.hidden = true;      /* '이어서 보여드립니다' 안내는 첫 이동에서 거둔다 */
      window.scrollTo(0, 0);
      /* 입력칸에 초점을 주면 폰에서 키보드가 올라와 화면을 가리므로 제목으로 보낸다. */
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
  }

  /* ── 제출 ── */
  function onSubmit(ev) {
    ev.preventDefault();
    if (window.Wait.isBusy(submitBtn)) return;
    errEl.hidden = true;

    var name = document.getElementById("f-name").value.trim();
    var contact = document.getElementById("f-contact").value.trim();
    var affil = document.getElementById("f-affil").value.trim();

    if (!name) { showError("이름을 적어주세요."); document.getElementById("f-name").focus(); return; }
    if (!contact) { showError("연락받을 방법을 하나 적어주세요."); document.getElementById("f-contact").focus(); return; }

    for (var i = 0; i < steps.length; i++) {
      var msg = steps[i].validate();
      if (msg) {
        go(i, true);
        setStepMessage(steps[i].node, msg);
        return;
      }
    }
    var answers = steps.map(function (s) { return { qid: s.qid, text: s.value() }; });

    writeDraft(collectDraft());   /* 보내기 직전에 한 번 더. 실패해도 글은 남는다. */

    var release = window.Wait.press(submitBtn, "보내는 중");
    var stopHint = window.Wait.status(errEl, [
      [0, "지원서를 보내는 중입니다."],
      [4, "응답이 조금 늦습니다. 다시 누르지 않아도 계속 보내는 중입니다."],
      [10, "평소보다 오래 걸립니다. 글은 이 기기에 저장돼 있어 창을 닫아도 잃지 않습니다."],
    ]);
    errEl.className = "notice";

    API.submitApplication({
      contest_id: contestId,
      name: name,
      contact: contact,
      affiliation: affil,
      answers: answers,
    }).then(function () {
      clearDraft();
      errEl.hidden = true;
      stateEl.hidden = true;
      steps.forEach(function (s) { s.node.hidden = true; });
      whoEl.hidden = true;
      doneEl.hidden = false;
      barEl.style.width = "100%";
      Array.prototype.forEach.call(stepperEl.children, function (li) { li.className = "stepper__item is-done"; });
      window.scrollTo(0, 0);
      document.getElementById("done-heading").focus({ preventScroll: true });
      /* 폰으로 즉시 알림. 지원자 정보는 싣지 않고 공모전 제목만 보낸다. */
      if (typeof window.notifyAction === "function" && contest) {
        window.notifyAction("새 지원 도착 — " + contest.title);
      }
    }).catch(function (err) {
      showError("제출하지 못했습니다. " + err.message +
                " 고른 답과 쓴 글은 그대로 저장돼 있으니 잠시 뒤 다시 눌러주세요.");
    }).finally(function () {
      stopHint();
      release();
    });
  }

  function showError(text) {
    errEl.textContent = text;
    errEl.className = "notice notice--bad";
    errEl.hidden = false;
  }

  /* ── 시작 ── */
  if (!contestId) {
    setState("어느 프로젝트인지 알 수 없습니다. 목록에서 다시 골라주세요.", true);
    return;
  }

  var stopLoad = window.Wait.status(stateEl, [
    [0, "지원서를 불러오는 중입니다."],
    [4, "서버를 깨우는 중입니다. 보통 5~10초 걸립니다."],
    [10, "평소보다 오래 걸립니다. 다시 누르지 않아도 계속 불러오는 중입니다."],
  ]);
  Promise.all([API.getContest(contestId), API.getQuestions(contestId)])
    .then(function (pair) {
      stopLoad();
      contest = pair[0];
      var questions = pair[1];

      if (!contest) {
        setState("이미 마감됐거나 모집이 닫힌 프로젝트입니다. 목록에서 다른 프로젝트를 골라주세요.", true);
        return;
      }
      if (PROFILE.length + questions.length > MAX_ANSWERS) {
        setState("문항 설정이 접수 한도를 넘어 지금은 제출할 수 없습니다. 링크를 보내준 사람에게 알려주세요.", true);
        return;
      }

      ctxTitle.textContent = contest.title;
      var due = el("span", "due", dueLabel(contest));
      if (contest.urgent) due.setAttribute("data-urgent", "1");
      ctxMeta.appendChild(due);
      if (contest.url && /^https?:\/\//i.test(contest.url)) {
        var src = el("a", "ctx__source", "공고 원문");
        src.href = contest.url;
        src.target = "_blank";
        src.rel = "noopener noreferrer";
        ctxMeta.appendChild(src);
      }
      if (contest.team_note) {
        ctxNote.textContent = contest.team_note;
        ctxNote.hidden = false;
      }
      ctxEl.hidden = false;

      PROFILE.forEach(function (def, i) { steps.push(buildChoiceStep(def, i)); });
      questions.forEach(function (q, i) { steps.push(buildTextStep(q, PROFILE.length + i)); });
      steps.forEach(function (s, i) {
        s.node.querySelector(".step__progress").textContent = (i + 1) + " / " + total();
        stepsEl.appendChild(s.node);
      });
      /* 마지막 질문 단계의 '다음'은 연락처로 간다는 걸 글자로 알려준다 */
      steps[steps.length - 1].node.querySelector('[data-role="next"]').textContent = "연락처 남기기";
      buildStepper();

      /* 쓰던 답 복구 */
      var draft = readDraft();
      var restored = false;
      if (draft && draft.answers) {
        steps.forEach(function (s) {
          if (s.restore(draft.answers[s.qid])) restored = true;
        });
        if (draft.who) {
          document.getElementById("f-name").value = draft.who.name || "";
          document.getElementById("f-contact").value = draft.who.contact || "";
          document.getElementById("f-affil").value = draft.who.affiliation || "";
        }
      }
      if (restored) {
        setState("이전에 고르던 답이 남아 있어 이어서 보여드립니다.", false);
      } else {
        stateEl.hidden = true;
      }

      ["f-name", "f-contact", "f-affil"].forEach(function (id) {
        document.getElementById(id).addEventListener("input", function () { scheduleSave(null); });
      });

      formEl.addEventListener("submit", onSubmit);
      document.getElementById("who-prev").addEventListener("click", function () {
        go(steps.length - 1, true);
      });

      formEl.hidden = false;
      go(0);

      if (!API.isConfigured()) {
        setState("표본 데이터로 화면만 보여주는 중입니다. 실제 접수는 아직 열리지 않았습니다.", false);
      }
    })
    .catch(function (err) {
      stopLoad();
      setState("불러오지 못했습니다. 잠시 뒤 새로고침해 주세요. (" + err.message + ")", true);
    });
})();
