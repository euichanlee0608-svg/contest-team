/* 배포 설정 — 구글 시트를 만들고 Apps Script 를 배포한 뒤 이 두 줄을 채운다.
   자세한 순서는 README.md.

   ⚠️ 여기 들어가는 PUBLIC_KEY 는 소스 보기로 누구나 읽을 수 있는 공개 값이다.
      공모전 목록을 읽고 지원서를 쓰는 것까지만 할 수 있다.
      지원 내역을 읽는 ADMIN_KEY 는 절대 이 파일에 넣지 않는다(공모전봇 .env 에만 둔다).

   비워 두면 자동으로 data/feed.sample.json 을 읽어 화면만 확인할 수 있다(제출은 막힌다). */
window.CONTEST_TEAM_CONFIG = {
  GAS_URL: "https://script.google.com/macros/s/AKfycbzNITPCE26PJYkXxu5LVCZ0361UQZ7v2SwwPi1J0RiA8aJm_749faNySlPUA18JjCNSyQ/exec",
  PUBLIC_KEY: "490ae8741fd5449c8872c98df6fca52bac0fefdb68736530",

  /* 마감이 이 일수 이하로 남으면 목록에서 빨갛게 표시한다. */
  URGENT_DAYS: 7,
};
