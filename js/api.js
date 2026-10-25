/* ─────────────────────────────────────────────────────────────
   api.js — 데이터 접근의 유일한 출입구 (SPEC.md 5장)

   화면 코드는 데이터가 구글 시트에서 오는지 데이터베이스에서 오는지 모른다.
   2단계(매칭 서비스)로 갈 때 이 파일 하나만 갈아끼우면 화면은 그대로 둔다.

   핵심은 셋이다 — 2단계에서 구현이 통째로 바뀌는 것들이다.
     listContests()  getQuestions(contestId)  submitApplication(payload)
   나머지 다섯은 그 위에 얹혔거나 로컬 계산이라 그대로 간다.
     getContest(id)  applicantId()  daysLeft(d)  isConfigured()  isStale()

   화면 코드는 fetch 를 직접 부르지 않는다. 네트워크를 타는 건 이 파일뿐이다.
   ───────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var CFG = global.CONTEST_TEAM_CONFIG || {};
  var TIMEOUT_MS = 15000;
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

  /* ── 실패를 사람이 읽는 말로 ── 화면에는 종류(연결·시간초과·서버·형식)에 맞는 문장만 내보내고,
     HTTP 코드 같은 속사정은 개발자 콘솔에만 남긴다(규칙 카드 _library/rules/ux-error-tell-user.md).
     서버가 직접 써 보낸 거절 사유(data.error)는 사람이 쓴 문장이라 그대로 둔다(kind = "rejected"). */
  var FAIL_TEXT = {
    offline: "인터넷 연결이 끊긴 것 같습니다.",
    timeout: "서버 응답이 늦습니다.",
    server: "서버가 잠시 응답하지 않습니다.",
    format: "서버 응답을 읽지 못했습니다.",
  };
  function fail(kind, detail, text) {
    if (detail) { try { console.warn("[contest_team]", kind, detail); } catch (e) {} }
    var e = new Error(text || FAIL_TEXT[kind] || FAIL_TEXT.server);
    e.kind = kind;
    return e;
  }
  /* fetch 단계에서 난 예외(네트워크 끊김·중단)를 종류로 바꾼다. 이미 종류가 붙은 건 그대로. */
  function asFail(err) {
    if (err && err.kind) return err;
    if (err && err.name === "AbortError") return fail("timeout");
    if (typeof navigator !== "undefined" && navigator.onLine === false) return fail("offline");
    return fail("offline", err && err.message);   // fetch 가 던지는 TypeError 는 대개 연결 문제다
  }
  function readJSON(res) {
    if (!res.ok) throw fail("server", "HTTP " + res.status);
    return res.json().catch(function () { throw fail("format", "JSON 파싱 실패"); });
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
     목록에서는 null 인 공고를 뺀다(listContests). */
  function daysLeft(deadline) {
    var d = parseDay(deadline);
    if (!d) return null;
    return Math.round((d.getTime() - todayKST().getTime()) / 86400000);
  }

  /* ── 목록 불러오기 ── 2026-09-15 보강. GAS 응답은 맥에서 재도 1.7~4.1초(대부분 script.google.com →
     googleusercontent 리다이렉트 시간)라, 느린 폰 회선·앱 내 브라우저·콜드 스타트가 겹치면 한 번에 실패할 수 있다.
     ① 시도당 15초, 실패하면 1.5초 쉬고 한 번 더 ② 그래도 안 되면 이 브라우저에 저장해 둔 최근 목록(7일 이내)
     ③ 그것도 없으면 배포 때 구워 둔 스냅샷(공개판만 있다) ④ 전부 없으면 원래 오류. 폴백이면 isStale() = true. */
  var cache = null;
  var CACHE_KEY = "ct_feed_cache";
  var CACHE_MAX_AGE = 7 * 86400000;
  var SNAPSHOT_URL = "./data/feed.snapshot.json";
  var ATTEMPTS = 2;

  function getJSON(url) {
    return withTimeout(function (signal) {
      return fetch(url, { method: "GET", signal: signal, credentials: "omit", cache: "no-store" });
    }).catch(function (err) { throw asFail(err); })
      .then(readJSON)
      .then(function (data) {
        if (!data || data.ok === false) throw fail("rejected", null, (data && data.error) || "목록을 읽지 못했습니다.");
        return data;
      });
  }

  function remember(data) {
    writeStore(CACHE_KEY, JSON.stringify({ saved_at: Date.now(), data: data }));
  }
  function recall() {
    try {
      var v = JSON.parse(readStore(CACHE_KEY) || "null");
      return (v && Date.now() - v.saved_at < CACHE_MAX_AGE) ? v.data : null;
    } catch (e) { return null; }
  }

  function live(attempt) {
    return getJSON(endpoint("feed")).catch(function (err) {
      if (attempt + 1 >= ATTEMPTS) throw err;
      return new Promise(function (r) { setTimeout(r, 1500); }).then(function () { return live(attempt + 1); });
    });
  }

  function fetchFeed() {
    if (cache) return Promise.resolve(cache);
    var got = configured()
      ? live(0).then(function (d) { remember(d); return { data: d, stale: false }; }, function (err) {
          var kept = recall();
          if (kept) return { data: kept, stale: true };
          return getJSON(SNAPSHOT_URL).then(function (d) { return { data: d, stale: true }; },
                                            function () { throw err; });
        })
      : getJSON(SAMPLE_URL).then(function (d) { return { data: d, stale: false }; });

    return got.then(function (r) {
      cache = {
        contests: Array.isArray(r.data.contests) ? r.data.contests : [],
        questions: Array.isArray(r.data.questions) ? r.data.questions : [],
        generated_at: r.data.generated_at || null,
        sample: !configured(),
        stale: r.stale,
      };
      return cache;
    });
  }

  /* 지금 화면의 목록이 폴백(저장분·스냅샷)인가. 목록을 한 번 불러온 뒤에만 의미가 있다. */
  function isStale() { return !!(cache && cache.stale); }

  /* 모집 중인 공모전. 마감일이 지났거나 마감일을 모르는 것은 뺀다(2026-09-14 사용자 결정 — '마감 미정'은 목록에 두지 않는다). */
  function listContests() {
    return fetchFeed().then(function (feed) {
      return feed.contests.filter(function (c) {
        var left = daysLeft(c.deadline);
        return left !== null && left >= 0;
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
        /* 마감이 임박한 순 */
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
    }).catch(function (err) { throw asFail(err); })
      .then(readJSON)
      .then(function (data) {
      if (!data || data.ok !== true) {
        throw fail("rejected", null, (data && data.error) || "제출이 접수되지 않았습니다.");
      }
      return data;
    });
  }

  /* 공모전 제안(공개판 전용 화면). 같은 suggest_id 로 다시 보내면 서버가 조용히 한 건으로 합친다 —
     응답이 늦어 다시 눌러도 중복으로 쌓이지 않는다. 사진은 받지 않는다(제목·링크 글만). */
  function submitSuggestion(payload) {
    if (!configured()) {
      return Promise.reject(new Error("아직 접수 준비가 끝나지 않았습니다."));
    }
    var body = JSON.stringify({
      suggest_id: payload.suggest_id,
      name: payload.name,
      contact: payload.contact,
      email: payload.email,
      title: payload.title,
      link: payload.link || "",
      note: payload.note || "",
      answers: payload.answers || [],
      hp: payload.hp || "",
    });
    return withTimeout(function (signal) {
      return fetch(endpoint("suggest"), {
        method: "POST",
        signal: signal,
        credentials: "omit",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body,
      });
    }).catch(function (err) { throw asFail(err); })
      .then(readJSON)
      .then(function (data) {
      if (!data || data.ok !== true) {
        throw fail("rejected", null, (data && data.error) || "제안이 접수되지 않았습니다.");
      }
      return data;
    });
  }

  global.ContestTeamAPI = {
    listContests: listContests,
    getContest: getContest,
    getQuestions: getQuestions,
    submitApplication: submitApplication,
    submitSuggestion: submitSuggestion,
    applicantId: applicantId,
    daysLeft: daysLeft,
    isConfigured: configured,
    isStale: isStale,
  };
})(window);
