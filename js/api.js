/* ─────────────────────────────────────────────────────────────
   api.js — 데이터 접근의 유일한 출입구 (SPEC.md 5장)

   화면 코드는 데이터가 구글 시트에서 오는지 데이터베이스에서 오는지 모른다.
   2단계(매칭 서비스)로 갈 때 이 파일 하나만 갈아끼우면 화면은 그대로 둔다.

   핵심은 셋이다 — 2단계에서 구현이 통째로 바뀌는 것들이다.
     listContests()  getQuestions(contestId)  submitApplication(payload)
   나머지 넷은 그 위에 얹혔거나 로컬 계산이라 그대로 간다.
     getContest(id)  applicantId()  daysLeft(d)  isConfigured()

   화면 코드는 fetch 를 직접 부르지 않는다. 네트워크를 타는 건 이 파일뿐이다.
   ───────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var CFG = global.CONTEST_TEAM_CONFIG || {};
  var TIMEOUT_MS = 12000;
  var SAMPLE_URL = "./data/feed.sample.json";
  var STORE_ID = "ct_applicant_id";

  /* 설정이 비어 있으면 표본 데이터로 화면만 돌린다(배포 전 디자인 확인·게이트용). */
  function configured() {
    return !!(CFG.GAS_URL && CFG.PUBLIC_KEY &&
              CFG.GAS_URL.indexOf("<") !== 0);
  }

  /* localStorage 가 막힌 브라우저(사생활 보호 모드 등)에서도 페이지는 살아야 한다. */
  function readStore(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStore(key, value) {
    try { global.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  /* 지원자 식별자. 2단계의 호혜 열람·매칭이 안정적인 신원을 요구하므로 1단계부터 만들어 둔다.
     개인정보가 아니라 이 브라우저에만 있는 임의 값이다. */
  function applicantId() {
    var v = readStore(STORE_ID);
    if (v) return v;
    v = (global.crypto && global.crypto.randomUUID)
      ? global.crypto.randomUUID()
      : "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    writeStore(STORE_ID, v);
    return v;
  }

  function withTimeout(promiseFactory) {
    var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT_MS);
    return promiseFactory(ctl ? ctl.signal : undefined)
      .finally(function () { clearTimeout(timer); });
  }

  function endpoint(t) {
    return CFG.GAS_URL + "?t=" + encodeURIComponent(t) +
           "&key=" + encodeURIComponent(CFG.PUBLIC_KEY);
  }

  /* ── 날짜 ── 마감 판정은 화면에서 한 번 더 한다.
     정적 사이트라 브라우저가 낡은 응답을 캐시할 수 있고, 서버가 걸러 보냈더라도
     사용자가 자정을 넘겨 페이지를 열어둔 채로 있을 수 있다. */
  function todayKST() {
    var now = new Date();
    var kst = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));
    kst.setHours(0, 0, 0, 0);
    return kst;
  }

  function parseDay(text) {
    if (!text) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text).trim());
    if (!m) return null;
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setHours(0, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  /* 남은 날수. 마감일을 못 읽으면 null 을 돌려주고, 호출자는 그것을 '미정'으로 표시한다.
     근거가 없을 때 감추지 않는 것이 공모전봇과 같은 규약이다. */
  function daysLeft(deadline) {
    var d = parseDay(deadline);
    if (!d) return null;
    return Math.round((d.getTime() - todayKST().getTime()) / 86400000);
  }

  var cache = null;

  function fetchFeed() {
    if (cache) return Promise.resolve(cache);

    var url = configured() ? endpoint("feed") : SAMPLE_URL;

    return withTimeout(function (signal) {
      return fetch(url, { method: "GET", signal: signal, credentials: "omit" });
    }).then(function (res) {
      if (!res.ok) throw new Error("서버 응답 " + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.ok === false) {
        throw new Error((data && data.error) || "목록을 읽지 못했습니다.");
      }
      cache = {
        contests: Array.isArray(data.contests) ? data.contests : [],
        questions: Array.isArray(data.questions) ? data.questions : [],
        generated_at: data.generated_at || null,
        sample: !configured(),
      };
      return cache;
    });
  }

  /* 모집 중인 공모전. 마감일이 지난 것은 빼고, 마감일을 못 읽은 것은 남긴다. */
  function listContests() {
    return fetchFeed().then(function (feed) {
      return feed.contests.filter(function (c) {
        var left = daysLeft(c.deadline);
        return left === null || left >= 0;
      }).map(function (c) {
        var left = daysLeft(c.deadline);
        return {
          contest_id: c.contest_id,
          title: c.title || "제목 없음",
          url: c.url || "",
          deadline: c.deadline || "",
          deadline_text: c.deadline_text || "",
          host: c.host || "",
          eligibility: c.eligibility || "",
          summary: c.summary || "",
          team_note: c.team_note || "",
          days_left: left,
          urgent: (left !== null && left <= (CFG.URGENT_DAYS || 7)),
        };
      }).sort(function (a, b) {
        /* 마감이 임박한 순. 마감 미정은 뒤로 보낸다. */
        if (a.days_left === null) return 1;
        if (b.days_left === null) return -1;
        return a.days_left - b.days_left;
      });
    });
  }

  function getContest(contestId) {
    return listContests().then(function (rows) {
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].contest_id === contestId) return rows[i];
      }
      return null;
    });
  }

  /* 공통문항 + 그 공모전의 개별문항. 개별문항이 없으면 공통문항만으로 모집이 돈다. */
  function getQuestions(contestId) {
    return fetchFeed().then(function (feed) {
      return feed.questions.filter(function (q) {
        if (String(q.use || "Y").toUpperCase() === "N") return false;
        var scope = (q.contest_id || "").trim();
        return scope === "" || scope === contestId;
      }).map(function (q, i) {
        return {
          qid: q.qid || ("q" + i),
          text: q.text || "",
          help: q.help || "",
          order: Number(q.order) || (i + 1),
          max_chars: Number(q.max_chars) || 2000,
          /* 공통문항을 개별문항보다 앞에 둔다 */
          common: (q.contest_id || "").trim() === "",
        };
      }).sort(function (a, b) {
        if (a.common !== b.common) return a.common ? -1 : 1;
        return a.order - b.order;
      });
    });
  }

  /* 지원서 제출.
     본문을 text/plain 으로 보내는 이유: application/json 이면 브라우저가 CORS 프리플라이트를
     날리는데 Apps Script 웹앱은 OPTIONS 를 처리하지 못해 제출이 통째로 실패한다. */
  function submitApplication(payload) {
    if (!configured()) {
      return Promise.reject(new Error(
        "아직 접수 준비가 끝나지 않았습니다. 링크를 보내준 사람에게 알려주세요."));
    }
    var body = JSON.stringify({
      applicant_id: applicantId(),
      contest_id: payload.contest_id,
      name: payload.name,
      contact: payload.contact,
      affiliation: payload.affiliation || "",
      answers: payload.answers,
    });

    return withTimeout(function (signal) {
      return fetch(endpoint("apply"), {
        method: "POST",
        signal: signal,
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body,
      });
    }).then(function (res) {
      if (!res.ok) throw new Error("서버 응답 " + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.ok !== true) {
        throw new Error((data && data.error) || "제출이 접수되지 않았습니다.");
      }
      return data;
    });
  }

  global.ContestTeamAPI = {
    listContests: listContests,
    getContest: getContest,
    getQuestions: getQuestions,
    submitApplication: submitApplication,
    applicantId: applicantId,
    daysLeft: daysLeft,
    isConfigured: configured,
  };
})(window);
