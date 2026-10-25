/* ─────────────────────────────────────────────────────────────
   질문 단계 부품 — 지원서(apply.js)와 공모전 제안(suggest.js)이 같이 쓴다.
   공통 항목(PROFILE)과 서술형 단계의 화면·검증·저장 형식을 한 곳에 둔다. 두 벌로 나누면 문구가 조용히 어긋난다.
   create(env) 가 받는 것: env.go(index, moveFocus) · env.scheduleSave(footEl) · env.onFirstPrev(선택 — 있으면 첫 단계에도 '이전'을 단다).
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

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
      title: "이번 프로젝트, 어느 정도로 임하고 싶으세요?",
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
               placeholder: "예: ○○ 프로젝트에서 발표 담당, 교내 해커톤에서 백엔드 구현" },
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

  function create(env) {
    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined && text !== null && text !== "") n.textContent = text;
      return n;
    }

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
      if (index > 0 || env.onFirstPrev) {
        var prev = el("button", "btn btn--ghost", "이전");
        prev.type = "button";
        prev.addEventListener("click", function () { if (index > 0) env.go(index - 1, true); else env.onFirstPrev(); });
        nav.appendChild(prev);
      }
      var next = el("button", "btn", "다음");
      next.type = "button";
      next.dataset.role = "next";
      next.addEventListener("click", function () {
        var msg = validate();
        if (msg) { setStepMessage(sec, msg); return; }
        clearStepMessage(sec);
        env.go(index + 1, true);
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
            env.scheduleSave(saved);
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
        ta.addEventListener("input", function () { env.scheduleSave(saved); });
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
      if (index === PROFILE.length) {
        /* 첫 서술형 앞에 한 번만 — 소요 시간 대신 '최대한 자세히'를 요구한다(2026-09-15 오너 결정) */
        sec.insertBefore(el("p", "step__intro",
          "여기부터는 서술형 질문입니다. 선발의 가장 중요한 근거이니, " +
          "본인의 경험과 생각을 구체적인 근거와 함께 최대한 자세히 적어주세요."), sec.querySelector(".step__q"));
      }

      var ta = el("textarea", "sheet");
      ta.placeholder = "구체적인 경험과 근거를 들어 최대한 자세히 적어주세요.";
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
        env.scheduleSave(saved);
      });

      function validate() {
        var v = ta.value.trim();
        if (!v) return "답변을 적어주세요.";
        if (v.length > q.max_chars) return q.max_chars + "자 안으로 줄여주세요.";
        return null;
      }
      addNav(sec, index, validate);

      return {
        qid: q.qid, short: "질문 " + (index - PROFILE.length + 1), node: sec, validate: validate,
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

    return { choice: buildChoiceStep, text: buildTextStep, el: el, message: setStepMessage };
  }

  window.QSteps = { PROFILE: PROFILE, create: create };
})();
