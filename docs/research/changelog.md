# 데이터 변경 기록

`npm run data:update` 뒤에 `npm run data:changelog`가 한 줄 추가한다(월 1회 도는 `data-update` 워크플로도 같은 명령을 쓴다). 큐레이션 보정이 필요했다면 그 줄에 손으로 덧붙인다.

| 날짜 | dataVersion | 원본 sha (OpenLethe / LLC) | 변경 |
|---|---|---|---|
| 2026-09-11 | 7.f85f9464 | localize 231a8bcf / openLethe 823129ad (최초 고정) | 거울 던전 7 기준 초기 데이터. 팩 116, 기프트 456(드롭풀 441), 조합 결과 59, 인격 183 |
| 2026-09-11 | 7.c1c1a25d | localize 231a8bcf / openLethe 823129ad | 스키마 추가: rules.deployment(출격 최대 7·기본 6, 미검증), gifts[].upgradeOf(조합 계승 76쌍). 원본 변동 없음 |
