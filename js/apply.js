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

  /* GAS 지원 탭의 답변 칸은 I~M 다섯 개다(SPEC 3장). 공통 항목 4개를 쓰므로 시트 문항은 1개까지. */
  var MAX_ANSWERS = 5;

  /* 공통 항목. qid 는 시트 [지원] 탭 H열에 그대로 남는다 — 바꾸면 이전 지원과 열 의미가 어긋난다. */
  var PROFILE = [
    {
      qid: "p_role", short: "역할",
      title: "이 팀에서 어떤 자리를 맡고 싶으세요?",
      help: "가장 가까운 하나를 골라주세요. 진행하면서 바뀌어도 괜찮습니다.",
      groups: [{ type: "radio", layout: "cards", required: "하나를 골라주세요.", options: [
        { label: "방향을 잡고 끌고 가기", desc: "문제를 정하고 일정을 짜서, 팀이 끝까지 가게 만듭니다." },
        { label: "정해진 방향을 실제로 만들기", desc: "아이디어를 받아 구현·실험·제작으로 완성합니다." },
        { label: "근거를 모으고 분석하기", desc: "자료 조사와 데이터 분석으로 주장에 힘을 싣습니다." },
        { label: "결과를 보여주는 형태로 다듬기", desc: "기획서·PPT·발표로 심사위원에게 전달합니다." },
        { label: "팀에 비는 자리 채우기", desc: "아직 정하지 않았고, 필요한 곳을 맡겠습니다." },
      ] }],
    },
    {
      qid: "p_goal", short: "목표 수준",
      title: "이번 공모전, 어느 정도로 임하고 싶으세요?",
      help: "정답은 없습니다. 팀 안에서 기대치가 어긋나는 게 가장 힘들어서 미리 여쭙니다.",
      groups: [{ type: "radio", layout: "cards", required: "하나를 골라주세요.", options: [
        { label: "수상권을 노린다", desc: "진심으로 상을 목표로 하고, 그만큼 시간을 씁니다." },
        { label: "제대로 된 프로젝트 하나", desc: "상보다 끝까지 완성해서 포트폴리오에 남기는 게 목표입니다." },
        { label: "가볍게 경험 삼아", desc: "부담 없이 과정 자체를 겪어보고 싶습니다." },
      ] }],
    },
    {
      qid: "p_strength", short: "강점",
      title: "자신 있는 것을 모두 골라주세요.",
      help: "잘하는 것, 해본 것 모두 괜찮습니다.",
      groups: [{ type: "checkbox", layout: "chips", required: "하나 이상 골라주세요.", options: [
        { label: "기획서·보고서 작성" }, { label: "PPT·시각자료" }, { label: "발표" },
        { label: "개발·코딩" }, { label: "데이터 분석" }, { label: "하드웨어·시제품 제작" },
        { label: "디자인(UI·그래픽)" }, { label: "리서치·자료 조사" }, { label: "일정·협업 관리" },
      ] }],
      extra: { label: "관련 경험을 짧게 적어주세요", hint: "선택 사항", max: 500,
               placeholder: "예: ○○ 공모전에서 발표 담당, 교내 해커톤에서 백엔드 구현" },
    },
    {
      qid: "p_avail", short: "시간·회의",
      title: "시간은 얼마나 낼 수 있고, 어떻게 만나는 게 편하세요?",
      help: "대략이면 충분합니다. 회의 일정을 잡을 때 참고합니다.",
      groups: [
        { type: "radio", layout: "chips", label: "한 주에 쓸 수 있는 시간", key: "시간",
          required: "쓸 수 있는 시간을 골라주세요.", options: [
          { label: "주 3시간 이하" }, { label: "주 3~7시간" }, { label: "주 7~15시간" }, { label: "주 15시간 이상" },
        ] },
        { type: "radio", layout: "chips", label: "회의 방식", key: "회의",
          required: "회의 방식을 골라주세요.", options: [
          { label: "대면이 좋아요" }, { label: "비대면이 좋아요" }, { label: "둘 다 괜찮아요" },
        ] },
      ],
    },
  ];

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

  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined && text !== null && text !== "") n.textContent = text;
    return n;
  }

  function dueLabel(c) {
    if (c.days_left === null) return "마감 미정";
    if (c.days_left === 0) return "오늘 마감";
    return "D-" + c.days_left;
  }

  function total() { return steps.length + 1; }

  /* ── 단계 뼈대: 진행 표시 + 질문 + 도움말 ── */
  function shell(index, title, help) {
    var sec = el("section", "step");
    sec.hidden = true;
    sec.appendChild(el("p", "step__progress", (index + 1) + " / " + (PROFILE.length + 1)));
    var h = el("h2", "step__q", title);
    h.tabIndex = -1;
    sec.appendChild(h);
    if (help) sec.appendChild(el("p", "step__help", help));
    return sec;
  }

  function addNav(sec, index, validate) {
    var nav = el("div", "step__nav");
    if (index > 0) {
      var prev = el("button", "btn btn--ghost", "이전");
      prev.type = "button";
      prev.addEventListener("click", function () { go(index - 1, true); });
      nav.appendChild(prev);
    }
    var next = el("button", "btn", "다음");
    next.type = "button";
    next.dataset.role = "next";
    next.addEventListener("click", function () {
      var msg = validate();
      if (msg) { setStepMessage(sec, msg); return; }
      clearStepMessage(sec);
      go(index + 1, true);
    });
    nav.appendChild(next);
    sec.appendChild(nav);
  }

  /* ── 고르는 단계(공통 항목) ── */
  function buildChoiceStep(def, index) {
    var sec = shell(index, def.title, def.help);
    var saved = el("span", "sheet-foot__saved");

    var groups = def.groups.map(function (g, gi) {
      var fs = el("fieldset", "choices");
      var legend = el("legend", g.label ? "choices__legend" : "sr-only", g.label || def.title);
      fs.appendChild(legend);
      var list = el("div", "choices__list choices__list--" + g.layout);
      g.options.forEach(function (o) {
        var lab = el("label", "choice");
        var input = document.createElement("input");
        input.type = g.type;
        input.name = def.qid + "_" + gi;
        input.value = o.label;
        input.addEventListener("change", function () {
          clearStepMessage(sec);
          scheduleSave(saved);
        });
        var body = el("span", "choice__body");
        body.appendChild(el("span", "choice__label", o.label));
        if (o.desc) body.appendChild(el("span", "choice__desc", o.desc));
        lab.appendChild(input);
        lab.appendChild(body);
        list.appendChild(lab);
      });
      fs.appendChild(list);
      sec.appendChild(fs);
      return { def: g, inputs: list.querySelectorAll("input") };
    });

    var ta = null;
    if (def.extra) {
      var field = el("div", "field field--wide");
      var lab = el("label", "field__label", def.extra.label);
      lab.htmlFor = "extra-" + def.qid;
      lab.appendChild(el("span", "field__hint", def.extra.hint));
      ta = el("textarea", "sheet sheet--short");
      ta.id = "extra-" + def.qid;
      ta.maxLength = def.extra.max;
      ta.placeholder = def.extra.placeholder;
      ta.addEventListener("input", function () { scheduleSave(saved); });
      field.appendChild(lab);
      field.appendChild(ta);
      sec.appendChild(field);
    }

    var foot = el("div", "sheet-foot");
    foot.appendChild(el("span"));
    foot.appendChild(saved);
    sec.appendChild(foot);

    function picked(gr) {
      return Array.prototype.filter.call(gr.inputs, function (i) { return i.checked; })
        .map(function (i) { return i.value; });
    }

    addNav(sec, index, validate);

    function validate() {
      for (var i = 0; i < groups.length; i++) {
        if (!picked(groups[i]).length) return groups[i].def.required;
      }
      return null;
    }

    return {
      qid: def.qid, short: def.short, node: sec, validate: validate,
      /* 시트에서 사람이 바로 읽는 한 칸. 예: "시간: 주 3~7시간 / 회의: 비대면이 좋아요" */
      value: function () {
        var text = groups.map(function (gr) {
          return (gr.def.key ? gr.def.key + ": " : "") + picked(gr).join(", ");
        }).join(" / ");
        var extra = ta ? ta.value.trim() : "";
        return extra ? text + "\n경험: " + extra : text;
      },
      dump: function () {
        return { picks: groups.map(picked), extra: ta ? ta.value : "" };
      },
      restore: function (d) {
        if (!d || !Array.isArray(d.picks)) return false;
        var any = false;
        groups.forEach(function (gr, gi) {
          var want = d.picks[gi] || [];
          Array.prototype.forEach.call(gr.inputs, function (i) {
            i.checked = want.indexOf(i.value) !== -1;
            any = any || i.checked;
          });
        });
        if (ta && d.extra) { ta.value = d.extra; any = true; }
        return any;
      },
    };
  }

  /* ── 서술형 단계(시트 [문항] 탭) ── */
  function buildTextStep(q, index) {
    var sec = shell(index, q.text, q.help);

    var ta = el("textarea", "sheet");
    ta.placeholder = "여기에 편하게 쓰세요. 분량보다 생각의 흐름이 궁금합니다.";
    sec.appendChild(ta);

    var foot = el("div", "sheet-foot");
    var count = el("span", "sheet-foot__count");
    var saved = el("span", "sheet-foot__saved");
    foot.appendChild(count);
    foot.appendChild(saved);
    sec.appendChild(foot);

    function refresh() {
      var n = ta.value.length;
      var over = n > q.max_chars;
      count.setAttribute("data-over", over ? "1" : "0");
      count.textContent = over ? n + "자 — " + q.max_chars + "자 안으로 줄여주세요" : n + "자";
    }
    ta.addEventListener("input", function () {
      refresh();
      ta.style.height = "auto";
      ta.style.height = ta.scrollHeight + "px";
      scheduleSave(saved);
    });

    function validate() {
      var v = ta.value.trim();
      if (!v) return "한 줄이라도 남겨주세요. 정답을 맞히는 질문이 아닙니다.";
      if (v.length > q.max_chars) return q.max_chars + "자 안으로 줄여주세요.";
      return null;
    }
    addNav(sec, index, validate);

    return {
      qid: q.qid, short: "질문", node: sec, validate: validate,
      value: function () { return ta.value.trim(); },
      dump: function () { return ta.value; },
      restore: function (d) {
        if (typeof d !== "string" || !d) return false;
        ta.value = d;
        refresh();
        return true;
      },
    };
  }

  function setStepMessage(sec, text) {
    var msg = sec.querySelector(".notice");
    if (!msg) {
      msg = el("p", "notice notice--bad");
      sec.insertBefore(msg, sec.querySelector(".step__nav"));
    }
    msg.textContent = text;
    msg.hidden = false;
  }
  function clearStepMessage(sec) {
    var msg = sec.querySelector(".notice");
    if (msg) msg.hidden = true;
  }

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
      var questions = pair[1];

      if (!contest) {
        setState("이미 마감됐거나 모집이 닫힌 공모전입니다. 목록에서 다른 공모전을 골라주세요.", true);
        return;
      }
      if (PROFILE.length + questions.length > MAX_ANSWERS) {
        setState("문항 설정이 접수 한도를 넘어 지금은 제출할 수 없습니다. 링크를 보내준 사람에게 알려주세요.", true);
        return;
      }

      ctxTitle.textContent = contest.title;
      var due = el("span", "badge", dueLabel(contest));
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
      setState("불러오지 못했습니다. 잠시 뒤 새로고침해 주세요. (" + err.message + ")", true);
    });
})();
