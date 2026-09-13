/**
 * 공모전 팀 모집 — GAS 백엔드 (SPEC.md 4장의 계약 구현)
 *
 * 엔드포인트 (배포 1개, t 로 분기)
 *   GET  ?t=feed &key=PUBLIC_KEY                 공모전·문항 읽기(공개 정보만)
 *   POST ?t=apply&key=PUBLIC_KEY                 지원서 쓰기(쓰기 전용, 응답에 남의 데이터 없음)
 *   POST ?t=sync &key=ADMIN_KEY                  공모전 업서트(공모전봇 전용)
 *   GET  ?t=inbox&key=ADMIN_KEY&after=<행번호>   새 지원 전체(텔레그램 알림용 — 신원·질문·답)
 *
 * ── 설치 순서 ────────────────────────────────────────────────────────────
 *  1) 새 구글 시트를 하나 만든다. **방문 통계 시트와 절대 겹치지 않게 전용 시트로 만든다**(SPEC 3장).
 *  2) 파일 → 설정 → 시간대를 (GMT+09:00) 서울 로 맞춘다.
 *     - 마감일이 날짜 셀로 저장될 때 '시트에 보이는 날짜'와 '서버가 읽는 날짜'가 어긋나지 않게 하려는 것.
 *     - 코드는 시간대가 달라도 동작하도록 시트 시간대로 포맷해 비교하지만, 맞춰두는 편이 사고가 없다.
 *  3) 확장 프로그램 → Apps Script → 이 파일을 통째로 붙여넣는다.
 *  4) 프로젝트 설정 → 스크립트 속성에 아래를 넣는다. **키는 소스에 하드코딩하지 않는다.**
 *       PUBLIC_KEY  프론트 JS 에 그대로 노출되는 값(공개 취급). 길고 랜덤하게.
 *       ADMIN_KEY   공모전봇 .env 에만 두는 값. 프론트·깃에 절대 금지.
 *       SHEET_ID    (선택) 시트에 붙여 만들었으면 불필요. 독립 스크립트일 때만 필요.
 *     ⚠ 두 키는 반드시 서로 다른 값이어야 한다. 같으면 코드가 모든 요청을 거절한다(키 분리 붕괴 방지).
 *  5) 편집기에서 setup() 을 한 번 실행해 권한을 승인하고 탭 3개(공모전·문항·지원)를 만든다.
 *  6) 배포 → 새 배포 → 웹 앱 → 실행: 나 / 액세스: 모든 사용자 → /exec URL 을 프론트와 봇에 준다.
 *
 * ── 프론트가 지켜야 하는 것 ──────────────────────────────────────────────
 *  POST 는 Content-Type 을 'text/plain;charset=utf-8' 로 보낸다.
 *  application/json 으로 보내면 브라우저가 CORS preflight(OPTIONS)를 날리는데
 *  GAS 웹앱은 OPTIONS 를 처리하지 못해 요청 자체가 막힌다. 본문은 그대로 JSON 문자열이면 된다.
 *
 * ── 이 파일이 지키는 불변식 ──────────────────────────────────────────────
 *  · PUBLIC_KEY 로는 지원 내역을 읽는 경로가 **존재하지 않는다**(t=inbox 는 ADMIN_KEY 전용).
 *  · t=apply 의 응답은 {ok:true} 뿐이다 — 남의 데이터가 섞일 코드 경로를 만들지 않는다.
 *  · 공모전 탭 K·L(모집상태·팀소개)과 지원 탭 S열 이후(채점)는 어떤 경로로도 쓰지 않는다.
 *
 * ── 2026-09-14 개정 (코드 붙여넣기 → 배포 관리에서 새 버전 → setup() 한 번) ──────
 *  · 답변 칸 5 → 10 (I~R). 채점 열은 N 이 아니라 **S 부터**다.
 *  · setup() 이 지원 탭 헤더의 빈 칸을 채우고, 문항 탭이 비어 있으면 기본 질문 3개를 넣는다.
 *  · t=inbox 가 답변까지 돌려준다(ADMIN_KEY 전용 — 공모전봇이 텔레그램으로 보낸다).
 */

// ── 탭 이름과 헤더 (SPEC 3장과 문자열까지 일치해야 한다) ──────────────────
var TAB_CONTEST = '공모전';
var TAB_QUESTION = '문항';
var TAB_APPLY = '지원';

// A~J 는 봇이 덮어쓰고 K·L 은 사람이 적는다. setup() 은 헤더만 깔고 값은 안 건드린다.
var HEAD_CONTEST = ['contest_id', '제목', '링크', '마감표기', '마감일', '주최',
                    '지원자격', '요약', '출처', '갱신시각', '모집상태', '팀소개'];
var HEAD_QUESTION = ['qid', 'contest_id', '질문', '도움말', '순서', '최대글자수', '사용'];
// A~R 만 코드가 쓴다. S열 이후(사고력·협업·메모·결과)는 사람 몫이라 헤더조차 만들지 않는다.
var HEAD_APPLY = ['제출시각', 'applicant_id', 'contest_id', '공모전제목', '이름', '연락처', '소속',
                  '문항ID들', '답변1', '답변2', '답변3', '답변4', '답변5',
                  '답변6', '답변7', '답변8', '답변9', '답변10'];

var CONTEST_BOT_COLS = 10;   // A~J. 업서트는 여기까지만 쓴다(K·L 보호).
var APPLY_COLS = 18;         // A~R. append 는 여기까지만 쓴다(S 이후 보호).

// ── SPEC 4장 '서버측 방어' 의 상한 ────────────────────────────────────────
var MAX_BODY_BYTES = 64 * 1024;  // 한 요청 총 64KB (UTF-8 바이트 기준 — 한글 서술형 3개가 20KB 를 넘는다)
var MAX_NAME = 200;              // 이름
var MAX_CONTACT = 200;           // 연락처
var MAX_ANSWER = 4000;           // 답변 1개
var MAX_ANSWERS = 10;            // 답변 개수 (지원 탭 I~R 가 10칸)

// 공통 항목(프론트 js/apply.js 의 PROFILE)의 qid → 텔레그램에 붙일 이름. qid 는 바꾸지 않는 규약이라 어긋나지 않는다.
var PROFILE_LABELS = { p_role: '역할', p_goal: '목표 수준', p_strength: '강점', p_avail: '시간·회의' };

// 문항 탭이 비어 있을 때 setup() 이 넣는 기본 질문(A~G). 이후 수정은 시트에서 한다 — 코드는 다시 넣지 않는다.
var DEFAULT_QUESTIONS = [
  ['c1', '', '가장 공들였는데, 정작 결과에는 별 영향이 없었던 작업이 있었나요?',
   '지금까지의 프로젝트나 과제에서 시간을 가장 많이 쏟았지만 평가나 사용자 반응은 달라지지 않았던 기능·작업을 하나 떠올려 주세요. ' +
   '그 뒤로 마감이 빠듯할 때 무엇부터 할지 정하는 나만의 기준이 생겼다면 함께 적어주세요.', 1, 1500, 'Y'],
  ['c2', '', '이번 프로젝트에서 직접 구현해 보고 싶은 아이디어를, 파이프라인이 보이게 적어주세요.',
   '‘AI 배차 시스템’처럼 주제만 적기보다 ① 풀고 싶은 병목 ② 쓸 방법(예: 칼만 필터로 센서 노이즈 보정, MILP로 제약 조건 최적화, 경량 모델 파인튜닝) ' +
   '③ 입력과 최종 출력이 드러나면 좋습니다. 가상의 프로젝트 제목 + 파이프라인 한 줄이면 충분합니다.', 2, 1500, 'Y'],
  ['c3', '', '발표 첫 장이나 데모 첫 10초 안에 ‘기존보다 낫다’를 보여준다면, 무엇을 내밀겠어요?',
   '심사위원은 긴 설명을 꼼꼼히 읽을 여유가 없습니다. 위에 적은 프로젝트를 기준으로, 기존 방식과 비교할 수치' +
   '(예: 지연 시간 X% 단축, 연산 비용 Y% 절감, 특정 엣지 케이스 실패율 Z% 감소)와 그걸 보여줄 화면(비교 차트, 실시간 로그, A/B 대시보드 등)을 적어주세요.', 3, 1500, 'Y']
];
// 아래 둘은 SPEC 에 수치가 없다. 시트에 쓰레기가 쌓이는 걸 막는 최소 가드다.
var MAX_AFFILIATION = 200;
var MAX_ID = 100;                // applicant_id · qid 같은 식별자

var MAX_SYNC_ITEMS = 500;        // 한 번의 sync 로 받는 공모전 수 상한
var MAX_INBOX_ITEMS = 30;        // 한 번의 inbox 응답 행 수 상한(답변까지 실어 크다 — 초과분은 다음 호출로)

var TZ_KST = 'Asia/Seoul';
var DEFAULT_MAX_CHARS = 2000;    // 문항 F열이 비면 2000 (SPEC 3장)

// ─────────────────────────────────────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────────────────────────────────────

function doGet(e) {
  return route_(e, 'GET');
}

function doPost(e) {
  return route_(e, 'POST');
}

/**
 * 모든 분기·인증·에러 처리를 여기 한 곳에 모은다.
 * 실패해도 HTTP 200 + {ok:false,error} 로 답한다(SPEC 4장 — GAS 는 상태코드 제어가 제한적).
 */
function route_(e, method) {
  var p = (e && e.parameter) || {};
  try {
    var t = String(p.t || '');

    // 메서드를 고정한다. GET 으로 쓰기가 되면 링크 한 줄로 시트가 오염될 수 있다.
    if (t === 'feed') {
      requireMethod_(method, 'GET', t);
      auth_(p, 'PUBLIC_KEY');
      return json_(handleFeed_());
    }
    if (t === 'apply') {
      requireMethod_(method, 'POST', t);
      auth_(p, 'PUBLIC_KEY');
      return json_(handleApply_(readBody_(e)));
    }
    if (t === 'sync') {
      requireMethod_(method, 'POST', t);
      auth_(p, 'ADMIN_KEY');
      return json_(handleSync_(readBody_(e)));
    }
    if (t === 'inbox') {
      requireMethod_(method, 'GET', t);
      auth_(p, 'ADMIN_KEY');
      return json_(handleInbox_(p.after));
    }
    throw bad_('unknown t (feed|apply|sync|inbox)');
  } catch (err) {
    // 내가 직접 던진 사유(userSafe)만 밖으로 내보낸다.
    // 예상 못 한 예외는 스택·시트 ID·파일 경로가 섞일 수 있으므로 종류만 알리고 로그에 남긴다.
    if (err && err.userSafe) return json_({ ok: false, error: String(err.message) });
    try { Logger.log('[contest_team] ' + (err && err.stack ? err.stack : err)); } catch (ignored) {}
    return json_({ ok: false, error: 'server error (' + ((err && err.name) || 'unknown') + ') — 스크립트 로그 확인' });
  }
}

/**
 * ★ 최초 1회 편집기에서 실행할 것.
 * 권한 동의창을 띄우고 탭 3개와 헤더를 만든다. 이미 있으면 아무것도 덮어쓰지 않는다.
 * 런타임(doGet/doPost)에서는 탭을 자동 생성하지 않는다 — 설정 실수가 조용히 묻히는 것보다
 * "setup() 을 실행하세요" 라고 시끄럽게 실패하는 편이 낫다.
 */
function setup() {
  var ss = ss_();
  var made = [];
  made.push(ensureTab_(ss, TAB_CONTEST, HEAD_CONTEST));
  made.push(ensureTab_(ss, TAB_QUESTION, HEAD_QUESTION));
  made.push(ensureTab_(ss, TAB_APPLY, HEAD_APPLY));

  var warn = extendHeader_(tab_(ss, TAB_APPLY), HEAD_APPLY);

  var qsh = tab_(ss, TAB_QUESTION);
  if (qsh.getLastRow() < 2) {
    qsh.getRange(2, 1, DEFAULT_QUESTIONS.length, HEAD_QUESTION.length).setValues(DEFAULT_QUESTIONS);
    made.push('문항 기본 ' + DEFAULT_QUESTIONS.length + '개 채움');
  }

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PUBLIC_KEY')) warn.push('PUBLIC_KEY 미설정');
  if (!props.getProperty('ADMIN_KEY')) warn.push('ADMIN_KEY 미설정');
  if (props.getProperty('PUBLIC_KEY') &&
      props.getProperty('PUBLIC_KEY') === props.getProperty('ADMIN_KEY')) {
    warn.push('PUBLIC_KEY 와 ADMIN_KEY 가 같음 — 키 분리가 무너진다. 반드시 다르게');
  }

  var msg = '탭 준비: ' + made.join(' / ') +
            (warn.length ? '\n⚠ ' + warn.join('\n⚠ ') : '\n스크립트 속성 OK');
  Logger.log(msg);
  return msg;
}

// ─────────────────────────────────────────────────────────────────────────
// t=feed — 공개해도 되는 정보만 (공모전 공고 + 문항). 지원자 정보는 이 경로에 존재하지 않는다.
// ─────────────────────────────────────────────────────────────────────────

function handleFeed_() {
  var ss = ss_();
  var today = Utilities.formatDate(new Date(), TZ_KST, 'yyyy-MM-dd');  // 오늘 판정은 항상 KST
  var tz = ss.getSpreadsheetTimeZone();

  var contests = [];
  var openIds = {};
  var rows = readTab_(ss, TAB_CONTEST, HEAD_CONTEST.length);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var id = s_(r[0]);
    if (!id) continue;                       // 빈 행·주석 행은 건너뛴다

    // K열 모집상태: '닫힘' 만 닫힌 것으로 본다. 빈칸은 열림(SPEC 3장), 오타는 열림 쪽으로 둔다.
    if (s_(r[10]) === '닫힘') continue;

    // E열 마감일이 오늘보다 과거면 뺀다. **빈칸이면 빼지 않는다**
    // (공모전봇 철학 — 근거가 없으면 노출을 유지한다).
    var deadline = ymd_(r[4], tz);
    if (deadline && deadline < today) continue;

    contests.push({
      contest_id: id,
      title: s_(r[1]),
      url: s_(r[2]),
      deadline_text: s_(r[3]),
      deadline: deadline,
      host: s_(r[5]),
      eligibility: s_(r[6]),
      summary: s_(r[7]),
      team_note: s_(r[11])                   // L열. 비면 빈 문자열 → 기본 문구는 프론트가 붙인다.
    });
    openIds[id] = true;
  }

  var questions = [];
  var qrows = readTab_(ss, TAB_QUESTION, HEAD_QUESTION.length);
  for (var j = 0; j < qrows.length; j++) {
    var q = qrows[j];
    var qid = s_(q[0]);
    if (!qid) continue;
    if (s_(q[6]).toUpperCase() === 'N') continue;      // G열 사용. 비면 Y(=사용)

    var cid = s_(q[1]);
    // 공통문항(contest_id 빈칸)은 항상, 개별문항은 이번 응답에 실린 공모전 것만 내려보낸다.
    // 닫힌/지난 공모전의 문항을 굳이 공개할 이유가 없고 응답도 작아진다.
    if (cid && !openIds[cid]) continue;

    var maxChars = Number(q[5]);
    questions.push({
      qid: qid,
      contest_id: cid,
      text: s_(q[2]),
      help: s_(q[3]),
      order: Number(q[4]) || 0,
      max_chars: (maxChars > 0 ? maxChars : DEFAULT_MAX_CHARS)
    });
  }
  // 순서(E열) 오름차순. 같은 값이면 시트에 적힌 순서를 유지한다(안정 정렬).
  questions = stableSort_(questions, function (a, b) { return a.order - b.order; });

  return {
    ok: true,
    generated_at: isoKst_(new Date()),
    contests: contests,
    questions: questions
  };
}

// ─────────────────────────────────────────────────────────────────────────
// t=apply — 지원 탭에 append 만. 수정·삭제 경로는 만들지 않는다.
// ─────────────────────────────────────────────────────────────────────────

function handleApply_(body) {
  var applicantId = str_(body.applicant_id, 'applicant_id', MAX_ID, true);
  var contestId = str_(body.contest_id, 'contest_id', MAX_ID, true);
  var name = str_(body.name, 'name', MAX_NAME, true);
  var contact = str_(body.contact, 'contact', MAX_CONTACT, true);
  var affiliation = str_(body.affiliation, 'affiliation', MAX_AFFILIATION, false);

  var answers = body.answers;
  if (!Array.isArray(answers)) throw bad_('answers 는 배열이어야 합니다');
  if (answers.length > MAX_ANSWERS) throw bad_('답변은 최대 ' + MAX_ANSWERS + '개까지입니다');

  var qids = [];
  var texts = [];
  for (var i = 0; i < answers.length; i++) {
    var a = answers[i] || {};
    qids.push(str_(a.qid, 'answers[' + i + '].qid', MAX_ID, true));
    texts.push(str_(a.text, 'answers[' + i + '].text', MAX_ANSWER, false));
  }

  var ss = ss_();
  // D열은 '사람이 읽기 편하게' 남기는 제목 스냅샷이라 공모전 탭에서 찾아온다.
  // 못 찾으면 프론트 버그이거나 장난 요청이므로 거절한다 — 주인 없는 행이 쌓이면 나중에 못 고친다.
  var title = lookupContestTitle_(ss, contestId);
  if (title === null) throw bad_('알 수 없는 contest_id 입니다');

  // 마감·닫힘 여부로는 거절하지 않는다. 정적 캐시가 낡아 마감 직후에 도착한 진짜 지원을
  // 버리는 손해가, 지난 공모전에 한 행 더 쌓이는 손해보다 크다. 거르는 건 사람이 시트에서 한다.

  var row = [isoKst_(new Date()), applicantId, contestId, title, cell_(name), cell_(contact), cell_(affiliation),
             qids.join(',')];
  for (var k = 0; k < MAX_ANSWERS; k++) row.push(cell_(texts[k] || ''));   // I~R 은 항상 10칸을 채운다

  withLock_(function () {
    var sh = tab_(ss, TAB_APPLY);
    // appendRow 를 쓰면 배열 길이만큼만 써서 S열 이후를 건드리지 않는다. 락으로 행 경합도 막는다.
    sh.appendRow(row);
    SpreadsheetApp.flush();
  });

  // 응답은 이것뿐이다. 여기에 다른 사람 데이터를 담을 수 있는 값 자체를 만들지 않는다.
  return { ok: true };
}

/** 공모전 탭 A열에서 id 를 찾아 제목(B열)을 돌려준다. 없으면 null. */
function lookupContestTitle_(ss, contestId) {
  var rows = readTab_(ss, TAB_CONTEST, 2);
  for (var i = 0; i < rows.length; i++) {
    if (s_(rows[i][0]) === contestId) return s_(rows[i][1]);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// t=sync — 공모전봇 전용 업서트. A~J 만 쓰고 K·L 은 어떤 경우에도 안 건드린다.
// ─────────────────────────────────────────────────────────────────────────

function handleSync_(body) {
  var items = body.contests;
  if (!Array.isArray(items)) throw bad_('contests 는 배열이어야 합니다');
  if (items.length > MAX_SYNC_ITEMS) throw bad_('contests 는 최대 ' + MAX_SYNC_ITEMS + '개까지입니다');

  var now = isoKst_(new Date());
  var ss = ss_();
  var result = { updated: 0, inserted: 0 };

  withLock_(function () {
    var sh = tab_(ss, TAB_CONTEST);
    var last = sh.getLastRow();

    // A열만 읽어 contest_id → 행번호 지도를 만든다. 뒤 열은 읽을 필요가 없다(K·L 은 손도 안 댄다).
    var index = {};
    if (last >= 2) {
      var ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var id = s_(ids[i][0]);
        if (id && !(id in index)) index[id] = i + 2;   // 중복이면 첫 행을 정본으로 본다
      }
    }

    var inserts = [];
    for (var k = 0; k < items.length; k++) {
      var c = items[k] || {};
      var cid = s_(c.contest_id);
      if (!cid) continue;                              // 업서트 키가 없으면 넣을 자리가 없다

      var row = [cid, s_(c.title), s_(c.url), s_(c.deadline_text), s_(c.deadline),
                 s_(c.host), s_(c.eligibility), s_(c.summary), s_(c.source), now];

      if (index[cid] && index[cid] > 0) {
        // A~J 만 덮어쓴다. 범위를 10칸으로 못 박는 것이 K·L 보호의 전부다.
        sh.getRange(index[cid], 1, 1, CONTEST_BOT_COLS).setValues([row]);
        result.updated++;
      } else if (index[cid] === -1) {
        // 같은 요청 안에 같은 id 가 두 번 왔다. 이미 추가 예정인 행을 갱신해 중복 행을 막는다.
        for (var m = 0; m < inserts.length; m++) {
          if (inserts[m][0] === cid) { inserts[m] = row; break; }
        }
        result.updated++;
      } else {
        inserts.push(row);
        index[cid] = -1;                               // '추가 예정' 표시
        result.inserted++;
      }
    }

    if (inserts.length) {
      // 한 번에 쓴다. 폭이 10칸이라 새 행의 K·L 은 빈칸으로 남는다(사람이 나중에 채운다).
      sh.getRange(sh.getLastRow() + 1, 1, inserts.length, CONTEST_BOT_COLS).setValues(inserts);
    }
    SpreadsheetApp.flush();
  });

  return { ok: true, updated: result.updated, inserted: result.inserted };
}

// ─────────────────────────────────────────────────────────────────────────
// t=inbox — ADMIN_KEY 전용. 공모전봇이 텔레그램으로 보낼 지원 전체(신원·질문·답). 채점 열(S~)은 읽지 않는다.
// ─────────────────────────────────────────────────────────────────────────

function handleInbox_(after) {
  var from = Number(after);
  if (!(from > 1)) from = 1;                 // 1행은 헤더. 커서가 없거나 이상하면 처음부터.

  var ss = ss_();
  var sh = tab_(ss, TAB_APPLY);
  var last = sh.getLastRow();
  if (last <= from) return { ok: true, last_row: Math.max(last, 1), items: [] };

  var count = last - from;
  var capped = Math.min(count, MAX_INBOX_ITEMS);
  // A~R 만 읽는다. 채점(S~)은 애초에 메모리에 올리지 않는다.
  var values = sh.getRange(from + 1, 1, capped, APPLY_COLS).getValues();
  var tz = ss.getSpreadsheetTimeZone();

  // 질문 본문은 지원 탭에 없다(qid 만 있다). 문항 탭에서 찾아 붙인다 — 지금 시트에 적힌 문구 기준이다.
  var qtext = {};
  var qrows = readTab_(ss, TAB_QUESTION, 3);
  for (var j = 0; j < qrows.length; j++) qtext[s_(qrows[j][0])] = s_(qrows[j][2]);

  // 재제출 판정용 B열(applicant_id). 2행부터 이번에 보낼 마지막 행까지만 읽는다.
  var ids = sh.getRange(2, 2, from - 1 + capped, 1).getValues();

  var items = [];
  for (var i = 0; i < values.length; i++) {
    var v = values[i];
    var aid = s_(v[1]);
    var before = 0;                                  // 이 행보다 위에 같은 applicant_id 가 몇 번 있었나
    for (var r = 0; r < from - 1 + i; r++) if (aid && s_(ids[r][0]) === aid) before++;
    var qids = s_(v[7]) ? s_(v[7]).split(',') : [];
    var answers = [];
    for (var k = 0; k < qids.length && k < MAX_ANSWERS; k++) {
      var qid = qids[k].trim();
      answers.push({ qid: qid, question: PROFILE_LABELS[qid] || qtext[qid] || qid, text: s_(v[8 + k]) });
    }
    items.push({
      row: from + 1 + i,
      at: at_(v[0], tz),
      applicant_id: aid,
      prior_submissions: before,
      contest_id: s_(v[2]),
      contest_title: s_(v[3]),
      name: s_(v[4]),
      contact: s_(v[5]),
      affiliation: s_(v[6]),
      answers: answers
    });
  }

  // 상한에 걸려 잘랐으면 last_row 를 '실제로 보낸 마지막 행' 으로 돌려준다.
  // 그래야 다음 호출이 이어서 받는다 — 전체 last 를 주면 잘린 만큼이 영영 누락된다.
  return { ok: true, last_row: from + capped, items: items };
}

// ─────────────────────────────────────────────────────────────────────────
// 인증 — 엔드포인트마다 '그 키만' 받는다
// ─────────────────────────────────────────────────────────────────────────

/**
 * which 는 'PUBLIC_KEY' 또는 'ADMIN_KEY'.
 * 다른 쪽 키를 대신 받아주지 않는다. ADMIN_KEY 로 t=feed 를 부르는 것도 거절이다 —
 * 봇 .env 의 키가 프론트 코드로 새는 실수를 구조적으로 막는다.
 */
function auth_(p, which) {
  var props = PropertiesService.getScriptProperties();
  var pub = props.getProperty('PUBLIC_KEY');
  var adm = props.getProperty('ADMIN_KEY');

  // 둘이 같으면 SPEC 2장의 키 분리가 무너진 상태다. 조용히 동작시키면 지원자 실명이 샌다.
  if (pub && adm && pub === adm) throw bad_('server misconfigured: 두 키가 같습니다');

  var expected = (which === 'ADMIN_KEY') ? adm : pub;
  if (!expected) throw bad_('server misconfigured: ' + which + ' 미설정');
  if (String(p.key || '') !== expected) throw bad_('unauthorized');
}

function requireMethod_(actual, wanted, t) {
  if (actual !== wanted) throw bad_('t=' + t + ' 는 ' + wanted + ' 로만 호출합니다');
}

// ─────────────────────────────────────────────────────────────────────────
// 입력 파싱·검증
// ─────────────────────────────────────────────────────────────────────────

/** POST 본문을 JSON 으로. 20KB 상한은 파싱 전에 본다(큰 본문으로 시간을 태우지 않는다). */
function readBody_(e) {
  var raw = (e && e.postData && e.postData.contents) || '';
  if (!raw) throw bad_('요청 본문이 비었습니다');

  // 문자 수가 아니라 UTF-8 바이트로 잰다. 한글은 한 글자가 3바이트라 차이가 크다.
  var bytes = Utilities.newBlob(raw).getBytes().length;
  if (bytes > MAX_BODY_BYTES) {
    throw bad_('요청이 너무 큽니다 (' + bytes + 'B > ' + MAX_BODY_BYTES + 'B)');
  }

  var parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw bad_('본문이 올바른 JSON 이 아닙니다');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw bad_('본문은 JSON 객체여야 합니다');
  }
  return parsed;
}

/**
 * 문자열 필드 하나를 받아 길이 상한까지 검사한다.
 * 길면 자르지 않고 거절한다 — 조용히 잘라 보관하면 사람이 잘린 줄 모르고 읽는다.
 */
function str_(v, field, max, required) {
  if (v === null || v === undefined) v = '';
  if (typeof v !== 'string') {
    if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
    else throw bad_(field + ' 는 문자열이어야 합니다');
  }
  v = v.trim();
  if (required && !v) throw bad_(field + ' 가 비었습니다');
  if (v.length > max) throw bad_(field + ' 가 너무 깁니다 (' + v.length + ' > ' + max + '자)');
  return v;
}

// ─────────────────────────────────────────────────────────────────────────
// 시트 접근
// ─────────────────────────────────────────────────────────────────────────

function ss_() {
  // ① 시트에 붙여 만든 스크립트면 그 시트를 쓴다(권장 — 계정·권한 문제가 구조적으로 사라진다).
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss) return ss;
  // ② 독립 스크립트면 SHEET_ID 로 연다.
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw bad_('server misconfigured: 시트에 붙은 스크립트가 아니고 SHEET_ID 도 없습니다');
  return SpreadsheetApp.openById(id);
}

/** 탭을 가져온다. 없으면 만들지 않고 실패시킨다 — 오타 난 탭 이름이 조용히 새 탭으로 생기면 더 나쁘다. */
function tab_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw bad_('시트 탭 [' + name + '] 이 없습니다 — setup() 을 한 번 실행하세요');
  return sh;
}

/** 헤더를 뺀 데이터 행을 width 칸만큼 읽는다. 데이터가 없으면 빈 배열. */
function readTab_(ss, name, width) {
  var sh = tab_(ss, name);
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, width).getValues();
}

/** 탭이 없으면 만들고, 헤더 행이 비어 있으면 채운다. 기존 값은 덮어쓰지 않는다. */
function ensureTab_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  var note;
  if (!sh) {
    sh = ss.insertSheet(name);
    note = name + '(새로 만듦)';
  } else {
    note = name + '(있음)';
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    note += '+헤더';
  }
  return note;
}

/**
 * 헤더 행에서 빈 칸만 채운다(탭이 이미 있을 때 열이 늘어난 경우). 사람이 적어둔 다른 값은 덮지 않고 경고로 돌려준다.
 */
function extendHeader_(sh, headers) {
  var row = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  var warn = [];
  for (var i = 0; i < headers.length; i++) {
    var cur = s_(row[i]);
    if (!cur) sh.getRange(1, i + 1).setValue(headers[i]);
    else if (cur !== headers[i]) warn.push(sh.getName() + ' 탭 ' + (i + 1) + '열 헤더가 "' + cur + '" — "' + headers[i] + '" 자리입니다. 채점 열은 S열부터 쓰세요');
  }
  return warn;
}

/**
 * 공개 폼 입력이 수식으로 해석되지 않게 한다. '=IMPORTXML(...)' 같은 답이 그대로 셀에 들어가면
 * 시트가 수식을 실행해 다른 지원자 정보를 밖으로 보낼 수 있다. 앞에 ' 를 붙이면 시트는 글자로 보관한다.
 */
function cell_(v) {
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

/**
 * 쓰기를 직렬화한다. 동시에 두 사람이 제출해도 행이 겹치거나 업서트가 서로를 덮지 않는다.
 * 30초는 GAS 실행 한도 안에서 기다릴 만한 상한이다. 못 잡으면 실패로 답한다(조용히 쓰지 않는다).
 */
function withLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw bad_('서버가 혼잡합니다 — 잠시 후 다시 시도하세요');
  try {
    fn();
  } finally {
    lock.releaseLock();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 값 변환
// ─────────────────────────────────────────────────────────────────────────

function s_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return isoKst_(v);
  return String(v).trim();
}

/**
 * 마감일 셀을 'YYYY-MM-DD' 로.
 * 셀이 날짜 서식이면 Date 로 들어오는데, 이때는 **시트 시간대**로 포맷해야
 * 사람이 시트에서 보는 날짜와 같아진다(스프레드시트 시간대가 KST 가 아니면 하루가 어긋난다).
 * 형식을 못 알아보면 빈 문자열 — SPEC 상 빈칸은 '거르지 않음' 이므로 노출이 유지된다.
 */
function ymd_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz || TZ_KST, 'yyyy-MM-dd');
  var t = s_(v);
  var m = t.match(/^(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/);
  if (!m) return '';
  return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
}

function pad2_(n) {
  n = String(n);
  return n.length < 2 ? '0' + n : n;
}

/** 지원 탭 A열(제출시각)을 보기용 문자열로. 시트가 날짜로 바꿔 저장했어도 되살린다. */
function at_(v, tz) {
  if (v instanceof Date) return Utilities.formatDate(v, tz || TZ_KST, "yyyy-MM-dd'T'HH:mm:ss");
  return s_(v);
}

/**
 * KST ISO8601. 오프셋은 '+09:00' 을 그대로 붙인다 —
 * 한국은 서머타임이 없어 항상 +09:00 이고, 포맷 패턴(XXX)의 런타임 차이를 걱정할 필요가 없다.
 */
function isoKst_(d) {
  return Utilities.formatDate(d, TZ_KST, "yyyy-MM-dd'T'HH:mm:ss") + '+09:00';
}

/** Array#sort 의 안정성은 런타임마다 달라 보장에 기대지 않는다(문항 순서가 뒤집히면 눈에 띈다). */
function stableSort_(arr, cmp) {
  return arr
    .map(function (v, i) { return { v: v, i: i }; })
    .sort(function (a, b) { return cmp(a.v, b.v) || (a.i - b.i); })
    .map(function (x) { return x.v; });
}

// ─────────────────────────────────────────────────────────────────────────
// 응답·에러
// ─────────────────────────────────────────────────────────────────────────

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 사용자에게 그대로 보여도 되는(내부 경로가 없는) 사유를 담은 에러. */
function bad_(msg) {
  var e = new Error(msg);
  e.userSafe = true;
  return e;
}
