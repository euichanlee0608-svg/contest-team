/* ─────────────────────────────────────────────────────────────
   공모전 제안 화면(공개판 전용) — 지원서와 같은 질문을 그대로 쓴다(js/qsteps.js 공유).
   1) 공모전(이름·주소·이유)  2) 공통 항목 4개 + 시트 [문항] 탭의 공통 서술형  3) 연락처(이름·연락처·메일)
   사진은 받지 않는다. 쓰던 글은 이 브라우저에 저장하고, 제출이 실패해도 지우지 않는다.
   같은 suggest_id 로 다시 보내면 서버가 한 건으로 합치므로 응답이 늦어 다시 눌러도 중복되지 않는다.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var API = window.ContestTeamAPI;
  var DRAFT_KEY = "ct_suggest_draft";
  var EMAIL_RE = /^[^\s@,<>;"']+@[^\s@,<>;"']+\.[^\s@,<>;"']+$/;

  function $(id) { return document.getElementById(id); }
  var whatEl = $("step-what"), whoEl = $("step-who"), doneEl = $("step-done");
  var whatErr = $("what-error"), errEl = $("submit-error"), submitBtn = $("submit");
  var barEl = $("progress-bar"), stepperEl = $("stepper"), stepsEl = $("steps");
  var fields = ["f-title", "f-link", "f-note", "f-name", "f-contact", "f-email"];
  var suggestId = "";
  var saveTimer = null;
  var steps = [];            /* 질문 단계. 전체 위치는 공모전(0) → steps[i] = i+1 → 연락처 = steps.length+1 */
  var loaded = null;         /* 질문 불러오기 Promise (한 번만) */
  var draftAnswers = {};
  var parts = window.QSteps.create({
    go: function (i, f) { go(i + 1, f); },
    scheduleSave: function () { scheduleSave(); },
    onFirstPrev: function () { go(0, true); },
  });
  var PROFILE = window.QSteps.PROFILE;
  var MAX_ANSWERS = 10;

  function newId() {
    return (window.crypto && window.crypto.randomUUID)
      ? window.crypto.randomUUID()
      : "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function readDraft() {
    try { var raw = localStorage.getItem(DRAFT_KEY); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function writeDraft() {
    var d = { suggest_id: suggestId, answers: {} };
    fields.forEach(function (id) { d[id] = $(id).value; });
    if (steps.length) steps.forEach(function (st) { d.answers[st.qid] = st.dump(); });
    else d.answers = draftAnswers;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, 400);
  }

  function last() { return steps.length + 1; }

  function paint(index) {
    barEl.style.width = Math.round((index / (last() + 1)) * 100) + "%";
    Array.prototype.forEach.call(stepperEl.children, function (li, i) {
      li.className = "stepper__item" + (i < index ? " is-done" : i === index ? " is-current" : "");
    });
  }

  function buildStepper() {
    stepperEl.textContent = "";
    ["공모전"].concat(steps.map(function (st) { return st.short; }), ["연락처"]).forEach(function (label) {
      var li = document.createElement("li");
      li.className = "stepper__item";
      li.textContent = label;
      stepperEl.appendChild(li);
    });
  }

  function go(index, moveFocus) {
    if (index < 0 || index > last()) return;
    whatEl.hidden = index !== 0;
    steps.forEach(function (st, i) { st.node.hidden = (i + 1 !== index); });
    whoEl.hidden = index !== last();
    doneEl.hidden = true;
    paint(index);
    if (moveFocus) {
      window.scrollTo(0, 0);
      /* 입력칸 대신 제목으로 — 폰에서 키보드가 올라와 화면을 가리지 않게 한다. */
      var target = index === 0 ? $("what-heading")
        : index === last() ? $("who-heading")
        : steps[index - 1].node.querySelector(".step__q");
      if (target) target.focus({ preventScroll: true });
    }
  }

  /* 질문은 첫 단계를 쓰는 동안 뒤에서 불러온다. 다음을 눌렀을 때 아직이면 그때 기다린다. */
  function loadQuestions() {
    if (loaded) return loaded;
    loaded = API.getQuestions("").then(function (questions) {
      if (PROFILE.length + questions.length > MAX_ANSWERS) {
        throw new Error("질문 설정이 접수 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요.");
      }
      PROFILE.forEach(function (def, i) { steps.push(parts.choice(def, i)); });
      questions.forEach(function (q, i) { steps.push(parts.text(q, PROFILE.length + i)); });
      steps.forEach(function (st, i) {
        st.node.querySelector(".step__progress").textContent = (i + 2) + " / " + (steps.length + 2);
        stepsEl.appendChild(st.node);
        st.restore(draftAnswers[st.qid]);
      });
      steps[steps.length - 1].node.querySelector('[data-role="next"]').textContent = "연락처 남기기";
      $("what-progress").textContent = "1 / " + (steps.length + 2);
      $("who-progress").textContent = (steps.length + 2) + " / " + (steps.length + 2);
      var first = steps[0].node.querySelector(".step__q");
      var intro = document.createElement("p");
      intro.className = "step__help";
      intro.textContent = "제안하신 공모전을 함께 한다고 생각하고 답해주세요. 아래 질문은 모집 지원서와 같습니다.";
      first.insertAdjacentElement("afterend", intro);
      buildStepper();
    }).catch(function (err) {
      loaded = null;          /* 실패는 기억하지 않는다 — 다시 누르면 다시 불러온다 */
      throw err;
    });
    return loaded;
  }

  function showErr(el, text) {
    el.textContent = text;
    el.className = "notice notice--bad";
    el.hidden = false;
  }

  /* 'www.example.com/…' 처럼 앞을 빼고 붙여넣는 경우가 흔해서 https:// 를 붙여준다. */
  function normalizeLink(v) {
    v = v.trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v)) return v;
    if (/^[^\s\/]+\.[^\s\/]+/.test(v)) return "https://" + v;
    return null;
  }

  $("what-next").addEventListener("click", function () {
    whatErr.hidden = true;
    if (!$("f-title").value.trim()) {
      showErr(whatErr, "공모전 이름을 적어주세요.");
      $("f-title").focus();
      return;
    }
    var link = normalizeLink($("f-link").value);
    if (link === null) {
      showErr(whatErr, "공고 주소는 https:// 로 시작하는 주소로 적어주세요. 없으면 비워두셔도 됩니다.");
      $("f-link").focus();
      return;
    }
    $("f-link").value = link;
    writeDraft();
    var nextBtn = $("what-next");
    var release = window.Wait.press(nextBtn, "질문을 불러오는 중");
    if (!release) return;
    loadQuestions().then(function () {
      go(1, true);
    }).catch(function (err) {
      showErr(whatErr, "질문을 불러오지 못했습니다. " + err.message + " 잠시 뒤 다시 눌러주세요.");
    }).finally(release);
  });

  $("who-prev").addEventListener("click", function () { go(last() - 1, true); });

  function onSubmit(ev) {
    ev.preventDefault();
    if (!whatEl.hidden) { $("what-next").click(); return; }   /* 첫 단계에서 Enter 를 눌렀을 때 */
    if (whoEl.hidden) return;                                  /* 질문 단계의 Enter 는 제출이 아니다 */
    if (window.Wait.isBusy(submitBtn)) return;
    errEl.hidden = true;

    var name = $("f-name").value.trim();
    var contact = $("f-contact").value.trim();
    var email = $("f-email").value.trim();
    if (!name) { showErr(errEl, "이름을 적어주세요."); $("f-name").focus(); return; }
    if (!contact) { showErr(errEl, "연락처를 하나 적어주세요."); $("f-contact").focus(); return; }
    if (!EMAIL_RE.test(email)) { showErr(errEl, "회신받을 메일 주소를 정확히 적어주세요."); $("f-email").focus(); return; }

    for (var i = 0; i < steps.length; i++) {
      var msg = steps[i].validate();
      if (msg) { go(i + 1, true); parts.message(steps[i].node, msg); return; }
    }
    var answers = steps.map(function (st) { return { qid: st.qid, text: st.value() }; });

    writeDraft();   /* 보내기 직전에 한 번 더. 실패해도 글은 남는다. */

    var release = window.Wait.press(submitBtn, "보내는 중");
    var stopHint = window.Wait.status(errEl, [
      [0, "제안을 보내는 중입니다."],
      [4, "응답이 조금 늦습니다. 다시 누르지 않아도 계속 보내는 중입니다."],
      [10, "평소보다 오래 걸립니다. 쓴 내용은 이 기기에 저장돼 있어 창을 닫아도 잃지 않습니다."],
    ]);
    errEl.className = "notice";

    API.submitSuggestion({
      suggest_id: suggestId,
      title: $("f-title").value.trim(),
      link: $("f-link").value.trim(),
      note: $("f-note").value.trim(),
      name: name,
      contact: contact,
      email: email,
      answers: answers,
      hp: $("f-website").value,
    }).then(function () {
      clearDraft();
      errEl.hidden = true;
      whatEl.hidden = true;
      whoEl.hidden = true;
      steps.forEach(function (st) { st.node.hidden = true; });
      doneEl.hidden = false;
      barEl.style.width = "100%";
      Array.prototype.forEach.call(stepperEl.children, function (li) { li.className = "stepper__item is-done"; });
      window.scrollTo(0, 0);
      $("done-heading").focus({ preventScroll: true });
    }).catch(function (err) {
      showErr(errEl, "보내지 못했습니다. " + err.message + " 쓴 내용은 저장돼 있으니 잠시 뒤 다시 눌러주세요.");
    }).finally(function () {
      stopHint();
      release();
    });
  }

  var draft = readDraft();
  suggestId = (draft && draft.suggest_id) || newId();
  if (draft) fields.forEach(function (id) { if (draft[id]) $(id).value = draft[id]; });
  if (draft && draft.answers) draftAnswers = draft.answers;
  fields.forEach(function (id) { $(id).addEventListener("input", scheduleSave); });
  $("flow").addEventListener("submit", onSubmit);
  buildStepper();
  go(0);
  loadQuestions().catch(function () { /* 다음을 누를 때 다시 시도하고 그때 안내한다 */ });
})();
