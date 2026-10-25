/* ─────────────────────────────────────────────────────────────
   공모전 제안 화면(공개판 전용) — 지원서와 같은 단계형 틀에서 필수 두 단계만 쓴다.
   1) 공모전(이름·주소·이유)  2) 연락처(이름·연락처·메일)
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
  var barEl = $("progress-bar"), stepperEl = $("stepper");
  var fields = ["f-title", "f-link", "f-note", "f-name", "f-contact", "f-email"];
  var suggestId = "";
  var saveTimer = null;

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
    var d = { suggest_id: suggestId };
    fields.forEach(function (id) { d[id] = $(id).value; });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeDraft, 400);
  }

  function paint(index) {
    barEl.style.width = Math.round((index / 2) * 100) + "%";
    Array.prototype.forEach.call(stepperEl.children, function (li, i) {
      li.className = "stepper__item" + (i < index ? " is-done" : i === index ? " is-current" : "");
    });
  }

  function go(index, moveFocus) {
    whatEl.hidden = index !== 0;
    whoEl.hidden = index !== 1;
    doneEl.hidden = true;
    paint(index);
    if (moveFocus) {
      window.scrollTo(0, 0);
      /* 입력칸 대신 제목으로 — 폰에서 키보드가 올라와 화면을 가리지 않게 한다. */
      (index === 0 ? $("what-heading") : $("who-heading")).focus({ preventScroll: true });
    }
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
    go(1, true);
  });

  $("who-prev").addEventListener("click", function () { go(0, true); });

  function onSubmit(ev) {
    ev.preventDefault();
    if (!whatEl.hidden) { $("what-next").click(); return; }   /* 첫 단계에서 Enter 를 눌렀을 때 */
    if (window.Wait.isBusy(submitBtn)) return;
    errEl.hidden = true;

    var name = $("f-name").value.trim();
    var contact = $("f-contact").value.trim();
    var email = $("f-email").value.trim();
    if (!name) { showErr(errEl, "이름을 적어주세요."); $("f-name").focus(); return; }
    if (!contact) { showErr(errEl, "연락처를 하나 적어주세요."); $("f-contact").focus(); return; }
    if (!EMAIL_RE.test(email)) { showErr(errEl, "회신받을 메일 주소를 정확히 적어주세요."); $("f-email").focus(); return; }

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
      hp: $("f-website").value,
    }).then(function () {
      clearDraft();
      errEl.hidden = true;
      whatEl.hidden = true;
      whoEl.hidden = true;
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
  fields.forEach(function (id) { $(id).addEventListener("input", scheduleSave); });
  $("flow").addEventListener("submit", onSubmit);
  go(0);
})();
