# SPEC — 공모전 팀 모집 웹앱 (1단계)

프론트·GAS·공모전봇이 공유하는 **계약**. 여기 적힌 이름·모양을 임의로 바꾸지 않는다.
바꿔야 하면 이 파일을 먼저 고치고 세 곳을 같이 고친다.

## 0. 무엇인가

내가(오너) 공모전 팀원을 모집하는 공개 링크. 지원자는 링크로 들어와 **모집 중인 공모전 하나를
고르고, 서술형 질문 2~4개에 답을 쓰고, 연락처를 남긴다.** 채점·선발은 전부 사람이 손으로 한다
(AI 채점 없음). 1단계 대상은 지인 5~6명.

공모전 목록의 **원천은 텔레그램 공모전봇**(`~/contest_bot`)이다. 웹앱은 사본만 본다.

## 1. 전체 흐름

```
텔레그램 공모전 카드 ──[🔖 관심있음]──> contests.db(interested=1)
                                          │
                        recruit_sync.push  │ (관심 누른 즉시 + 브리핑 잡에서 전체 재동기화)
                                          ▼
                              GAS ?t=sync  ──> 구글시트 [공모전] 탭
                                                      │
지원자 ──> 웹앱(GitHub Pages) ──GET ?t=feed──────────┘
              │                              ([문항] 탭도 같이 내려옴)
              └──POST ?t=apply──> GAS ──> 구글시트 [지원] 탭
                                                │
                    contest_bot ──GET ?t=inbox──┘──> 텔레그램 "새 지원 n건"
```

**맥에는 구글 자격증명이 필요 없다.** 공모전봇이 쓰는 토큰(`~/mail_pipeline/.credentials/token.json`)의
scope 는 `gmail.readonly`·`calendar.events`·`gmail.compose` 뿐이라 시트에 못 쓴다. 그래서 방문 비콘과
같은 방식(HTTPS + 공유키)으로 GAS 에만 쏜다.

## 2. 키 분리 — 가장 중요한 보안 결정

| 키 | 누가 갖나 | 할 수 있는 것 |
|---|---|---|
| `PUBLIC_KEY` | **프론트 JS 안에 그대로 노출됨** | `t=feed`(공모전·문항 읽기) · `t=apply`(지원서 쓰기) |
| `ADMIN_KEY` | 공모전봇 `.env` 에만. 프론트·깃에 절대 금지 | `t=sync`(공모전 밀어넣기) · `t=inbox`(지원 읽기) |

`PUBLIC_KEY` 는 **공개된 값으로 취급한다**(소스 보기로 누구나 읽는다). 따라서:
- `t=feed` 는 공개해도 되는 정보만 돌려준다(공모전 공고·문항). 지원자 정보는 절대 안 나간다.
- `t=apply` 는 **쓰기 전용**이다. 응답에 다른 사람의 데이터를 담지 않는다.
- 지원 내역을 읽는 길(`t=inbox`)은 `ADMIN_KEY` 로만 열린다.

이 분리가 무너지면 지원자 실명·연락처가 소스 보기로 새어나간다.

## 3. 구글 시트 — 새로 만든 전용 시트 1개 (방문 통계 시트와 완전 분리)

### 탭 `공모전`
봇이 A~J 를 덮어쓴다. **K 이후는 사람이 적는 열이라 봇이 절대 건드리지 않는다.**

| 열 | 이름 | 누가 | 비고 |
|---|---|---|---|
| A | contest_id | 봇 | `sha256(source\|url)[:16]`, 업서트 키 |
| B | 제목 | 봇 | |
| C | 링크 | 봇 | 공고 원문 |
| D | 마감표기 | 봇 | 원문 그대로("D-25", "2026.06.15", 빈칸 가능) |
| E | 마감일 | 봇 | `YYYY-MM-DD` 또는 빈칸(해석 실패) |
| F | 주최 | 봇 | `category` |
| G | 지원자격 | 봇 | `eligibility` |
| H | 요약 | 봇 | `summary`, 1줄 |
| I | 출처 | 봇 | `source` |
| J | 갱신시각 | 봇 | ISO8601 |
| K | 모집상태 | **사람** | `열림` / `닫힘` / 빈칸(=열림) |
| L | 팀소개 | **사람** | 이 공모전에서 어떤 팀을 꾸리는지. 비면 기본 문구 |

### 탭 `문항`
| 열 | 이름 | 비고 |
|---|---|---|
| A | qid | 고유값. 지원 탭이 이 값으로 답을 가리킨다 |
| B | contest_id | **빈칸이면 공통문항**(모든 공모전에 나옴) |
| C | 질문 | 본문 |
| D | 도움말 | 질문 아래 회색 보조문구. 비어도 됨 |
| E | 순서 | 숫자 오름차순 |
| F | 최대글자수 | 숫자. 비면 2000 |
| G | 사용 | `Y`/`N`. 비면 Y |

공통문항 + 그 공모전의 개별문항을 순서대로 이어 붙인다. **개별문항이 하나도 없으면 공통문항만으로
모집이 돈다** → 🔖만 눌러도 즉시 모집 시작, 개별문항은 나중에 시트에서 추가.

### 탭 `지원`
GAS 가 A~M 에 **추가만** 한다(수정·삭제 없음). **N 이후는 내 채점 열이라 코드가 절대 안 건드린다.**

| 열 | 이름 |
|---|---|
| A | 제출시각(ISO8601, KST) |
| B | applicant_id |
| C | contest_id |
| D | 공모전제목(사람이 읽기 편하게 스냅샷) |
| E | 이름 |
| F | 연락처 |
| G | 소속 |
| H | 문항ID들 (쉼표로 이은 qid 순서) |
| I~M | 답변1 ~ 답변5 (H 의 순서와 1:1) |
| N~ | **사고력 / 협업 / 메모 / 결과** — 내가 손으로 |

같은 사람이 다시 내면 새 행으로 쌓는다(덮어쓰지 않는다). 최신 행이 최종 제출.

## 4. GAS 엔드포인트 (배포 1개, `t` 로 분기)

모든 응답은 JSON. 실패해도 HTTP 200 + `{ok:false, error:"..."}`(GAS 특성상 상태코드 제어가 제한적).

### `GET ?t=feed&key=PUBLIC_KEY`
```json
{ "ok": true,
  "generated_at": "2026-09-12T16:00:00+09:00",
  "contests": [
    { "contest_id": "a1b2c3d4e5f6a7b8",
      "title": "2026 ○○ 아이디어 공모전",
      "url": "https://…",
      "deadline_text": "2026.10.15",
      "deadline": "2026-10-15",
      "host": "🏆 공모전",
      "eligibility": "대학생 누구나",
      "summary": "한 줄 요약",
      "team_note": "팀소개(L열). 비면 빈 문자열" } ],
  "questions": [
    { "qid": "c1", "contest_id": "", "text": "…", "help": "…", "order": 1, "max_chars": 2000 } ] }
```
- `모집상태 = 닫힘` 인 행과 **마감일이 오늘보다 과거**인 행은 GAS 가 빼고 보낸다.
- `deadline` 이 빈칸이면 **빼지 않는다**(공모전봇 철학과 동일 — 근거 없으면 노출 유지).
- 프론트는 받은 뒤 **한 번 더** 마감일을 거른다(정적 캐시가 낡을 수 있으므로).

### `POST ?t=apply&key=PUBLIC_KEY`

⚠️ **본문은 `Content-Type: text/plain;charset=utf-8` 로 보낸다.** `application/json` 으로 보내면
브라우저가 CORS 프리플라이트(OPTIONS)를 날리는데 Apps Script 웹앱은 OPTIONS 를 처리하지 못해 제출이
통째로 실패한다. 따라서 **GAS 쪽은 반드시 `JSON.parse(e.postData.contents)` 로 읽어야 하고**
`e.parameter` 에 의존하면 안 된다.

요청 본문(JSON 문자열):
```json
{ "applicant_id": "uuid-v4",
  "contest_id": "a1b2c3d4e5f6a7b8",
  "name": "홍길동", "contact": "010-0000-0000 / a@b.com", "affiliation": "○○대 ○○과 3학년",
  "answers": [ { "qid": "c1", "text": "…" } ] }
```
응답: `{"ok":true}` 또는 `{"ok":false,"error":"…"}`. **다른 사람 데이터는 어떤 경우에도 담지 않는다.**

서버측 방어: 이름/연락처 각 200자, 답변 1개당 4000자, 답변 최대 5개, 한 요청 총 20KB 상한을 넘으면 거절.

### `POST ?t=sync&key=ADMIN_KEY` (공모전봇 전용)
```json
{ "contests": [ { "contest_id": "…", "title": "…", "url": "…", "deadline_text": "…",
                  "deadline": "2026-10-15", "host": "…", "eligibility": "…",
                  "summary": "…", "source": "…" } ] }
```
- A열 `contest_id` 기준 **업서트**(있으면 A~J만 갱신, 없으면 새 행 추가). K·L 은 절대 안 건드린다.
- 응답 `{"ok":true,"updated":n,"inserted":m}`

### `GET ?t=inbox&key=ADMIN_KEY&after=<행번호>`
- `after` 이후에 새로 쌓인 지원의 **요약만** 반환: `{"ok":true,"last_row":N,"items":[{"row":12,"at":"…","contest_title":"…","name":"홍길동"}]}`
- 본문 답변은 담지 않는다(텔레그램 알림용). 답변은 시트에서 직접 본다.

## 5. 프론트 구조 — 교체 지점(seam)

```
js/config.js ← 배포 설정만(GAS_URL·PUBLIC_KEY). 사람이 손으로 채우는 유일한 파일.
js/api.js    ← 데이터 접근은 전부 여기. config 를 읽고 바깥과 통신한다.
```

`api.js` 가 내보내는 것:

| 구분 | 함수 | 2단계에서 |
|---|---|---|
| 핵심 3 | `listContests()` · `getQuestions(contestId)` · `submitApplication(payload)` | 구현이 통째로 바뀐다 |
| 보조 5 | `getContest(id)` · `headlineQuestion()` · `applicantId()` · `daysLeft(d)` · `isConfigured()` | 앞의 셋 위에 얹힌 것이거나 로컬 계산이라 그대로 간다 |

**화면 코드는 `fetch` 를 직접 부르지 않는다.** 네트워크를 타는 것은 이 파일뿐이어야 한다.
화면 코드는 데이터가 시트에서 오는지 DB 에서 오는지 모른다. **2단계(매칭 서비스)에서 이 파일만
Supabase 구현으로 갈아끼우면 화면은 그대로다.**

2단계를 위해 1단계부터 지키는 것:
1. `applicant_id` 를 클라이언트에서 UUID 로 만들어 `localStorage` 에 보관하고 제출에 포함한다.
2. 답변은 **qid 별로 쪼개** 보낸다(한 덩어리 텍스트 금지 — 나중에 못 쪼갠다).
3. 신원(이름·연락처·소속)과 답변은 **다른 열**에 둔다(2단계 익명화 = 신원 열을 안 보내는 것).
4. 공모전의 원천은 계속 공모전봇. 웹앱에 공모전을 손으로 만드는 경로를 만들지 않는다.

## 6. 공모전봇 쪽 변경 (`~/contest_bot`)

새 모듈 `recruit_sync.py`:
- `configured() -> bool` — `RECRUIT_GAS_URL`·`RECRUIT_ADMIN_KEY` 가 둘 다 있을 때만 True
- `push_one(item_id)` / `push_all()` — 관심있음(`interested=1 AND dismissed=0`) 중 만료 아닌 것만
- `fetch_new(after) -> (last_row, items)` — 새 지원 요약
- **설정이 없으면 전부 조용히 no-op**(봇 토큰이 비면 채널 분리가 자동 비활성되는 것과 같은 규약)
- 네트워크 실패는 삼키되 **로그는 남긴다**(webstats 사고 교훈 — 조용히 실패하지 않는다)

호출 지점 3곳:
1. `on_interested` 끝 — 그 공고 1건 즉시 push(실패해도 카드 흐름을 막지 않음)
2. `morning_brief_job` / `afternoon_brief_job` — `push_all()` 로 전체 재동기화(누락 복구)
3. 같은 브리핑 잡 — `fetch_new()` 로 새 지원이 있으면 텔레그램 알림. 커서는 `state/` 의 JSON

## 7. 배포·검증

- `~/webapps/contest_team` → GitHub Pages(정적, 빌드 없음, 상대경로, `.nojekyll`)
- 방문 비콘: `~/webstats/beacon.template.js` 를 `</body>` 직전, `SITE = "contest_team"`
- 배포 전 게이트: `node --check` → 헤드리스 데스크톱+390px 2뷰포트 → `node ~/webstats/check_beacon.js`
  → `python3 ~/repo_tools/webapp_audit/audit_webapps.py`
- 공모전봇 게이트: `~/contest_venv/bin/python -m pytest tests/ -q`
