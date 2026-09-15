#!/usr/bin/env bash
# 모르는 사람용 공개판 배포 → https://recruit-lab.pages.dev (Cloudflare Pages, 프로젝트 recruit-lab)
# 지인용(GitHub Pages)은 git push 로 따로 나간다. 이 스크립트는 그쪽을 건드리지 않는다.
# 최초 1회: npx wrangler login
set -euo pipefail
cd "$(dirname "$0")/.."

for f in js/*.js; do node --check "$f"; done            # node --check 는 첫 파일만 보므로 하나씩
python3 tools/build_public.py                            # 마스킹·이력 삽입 + 신원 흔적 게이트
node ~/webstats/check_beacon.js dist/recruit-lab/index.html dist/recruit-lab/apply.html

# --force: wrangler 4.13x 는 pages 명령을 Workers 로 넘기려다 실패한다(2026-09-15 실측). Workers 주소
# (*.<계정서브도메인>.workers.dev)는 계정 이름이 드러날 수 있으므로 기존 Pages(*.pages.dev)로 강제한다.
npx --yes wrangler pages project list --force 2>/dev/null | grep -q "recruit-lab" \
  || npx --yes wrangler pages project create recruit-lab --production-branch main --force
npx --yes wrangler pages deploy dist/recruit-lab --project-name recruit-lab --branch main --commit-dirty=true --force
