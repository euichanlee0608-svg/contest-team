"""모르는 사람용 공개판(recruit-lab.pages.dev) 빌드.

루트(지인용, GitHub Pages 가 그대로 서빙)를 **고치지 않고** 변환해 dist/recruit-lab 에 만든다.
  ① <!-- friends-only:start/end --> 구간 제거 — 포트폴리오 링크 등 오너 신원으로 이어지는 것
  ② <!-- public-slot:operator --> 자리에 public/operator.html(운영자 이력) 삽입
  ③ 방문 비콘 SITE 를 recruit_lab 으로 — 지인용(contest_team)과 통계를 섞지 않는다
마지막에 신원 흔적(깃허브 아이디·github.io)이 남았으면 **실패**한다 — 마스킹이 조용히 풀리는 걸 막는 게이트.

  python3 tools/build_public.py
"""
import json
import re
import shutil
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "dist" / "recruit-lab"
COPY = ["index.html", "apply.html", "css", "js"]          # 문서·gas·표본 데이터는 공개판에 싣지 않는다
PAGES = ["index.html", "apply.html"]
IDENTITY = ["euichanlee0608", "github.io", "github.com"]


def transform(html: str, operator: str) -> str:
    html = re.sub(r"[ \t]*<!-- friends-only:start -->.*?<!-- friends-only:end -->\n?", "", html, flags=re.S)
    html = html.replace("<!-- public-slot:operator -->", operator.rstrip("\n"))
    return html.replace("'contest_team'", "'recruit_lab'")


def snapshot(dest: Path) -> str:
    """배포 시점의 목록을 data/feed.snapshot.json 으로 굽는다 — 라이브 피드가 실패할 때 마지막 폴백(api.js).
    공개 정보(t=feed, PUBLIC_KEY)만 담는다. 실패해도 빌드는 계속한다(폴백이 하나 줄 뿐)."""
    cfg = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
    url, key = re.search(r'GAS_URL:\s*"([^"]+)"', cfg), re.search(r'PUBLIC_KEY:\s*"([^"]+)"', cfg)
    if not (url and key):
        return "설정 없음 — 건너뜀"
    try:
        req = urllib.request.Request(f"{url.group(1)}?t=feed&key={key.group(1)}", headers={"User-Agent": "Mozilla/5.0"})
        data = json.loads(urllib.request.urlopen(req, timeout=40).read())
    except Exception as e:
        return f"실패({type(e).__name__}) — 건너뜀"
    if not data.get("ok"):
        return "ok:false — 건너뜀"
    (dest / "data").mkdir(exist_ok=True)
    (dest / "data" / "feed.snapshot.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return f"{len(data.get('contests') or [])}건"


def main() -> int:
    shutil.rmtree(OUT, ignore_errors=True)
    OUT.mkdir(parents=True)
    for name in COPY:
        src = ROOT / name
        (shutil.copytree if src.is_dir() else shutil.copy2)(src, OUT / name)

    operator = (ROOT / "public" / "operator.html").read_text(encoding="utf-8")
    for name in PAGES:
        p = OUT / name
        p.write_text(transform(p.read_text(encoding="utf-8"), operator), encoding="utf-8")

    snap = snapshot(OUT)

    problems = []
    for p in OUT.rglob("*"):
        if p.is_file() and p.suffix in (".html", ".js", ".css"):   # 스냅샷(공고 주소 모음)은 신원 검사 대상 아님
            text = p.read_text(encoding="utf-8", errors="ignore")
            problems += [f"{p.relative_to(OUT)}: 신원 흔적 '{w}'" for w in IDENTITY if w in text]
            problems += [f"{p.relative_to(OUT)}: 변환 안 된 표식" for m in ("friends-only", "public-slot") if m in text]
    index = (OUT / "index.html").read_text(encoding="utf-8")
    if 'class="operator"' not in index:
        problems.append("index.html: 운영자 이력 블록이 없음")
    if "'recruit_lab'" not in index:
        problems.append("index.html: 비콘 SITE 가 recruit_lab 이 아님")
    if problems:
        print("❌ 공개판 빌드 실패\n  " + "\n  ".join(problems))
        return 1
    print(f"✅ 공개판 빌드 → {OUT} · 목록 스냅샷 {snap}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
