#!/usr/bin/env bash
# 모르는 사람용 공개판 배포 → https://recruit-lab.pages.dev (Cloudflare Pages, 프로젝트 recruit-lab)
# 지인용(GitHub Pages)은 git push 로 따로 나간다. 이 스크립트는 그쪽을 건드리지 않는다.
# 최초 1회: npx wrangler login (+ Cloudflare 계정 이메일 인증 — 안 하면 code 8000077 로 프로젝트 생성 실패)
set -euo pipefail
cd "$(dirname "$0")/.."

for f in js/*.js; do node --check "$f"; done            # node --check 는 첫 파일만 보므로 하나씩
python3 tools/build_public.py                            # 마스킹·이력 삽입 + 신원 흔적 게이트
node ~/webstats/check_beacon.js dist/recruit-lab/index.html dist/recruit-lab/apply.html

# --force 는 프로젝트를 새로 만들 때만: wrangler 4.13x 는 새 pages 프로젝트를 Workers 로 넘기려다 실패한다
# (2026-09-15 실측). Workers 주소(*.<계정서브도메인>.workers.dev)는 계정 이름이 드러날 수 있어 기존 Pages 로 강제했고,
# 프로젝트가 생긴 뒤의 명령은 위임되지 않으므로 --force 를 붙이지 않는다(wrangler 안내).
npx --yes wrangler pages project list 2>/dev/null | grep -q "recruit-lab" \
  || npx --yes wrangler pages project create recruit-lab --production-branch main --force
npx --yes wrangler pages deploy dist/recruit-lab --project-name recruit-lab --branch main --commit-dirty=true
