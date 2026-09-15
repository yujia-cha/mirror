# 데이터 변경 기록

`npm run data:update` 뒤에 `npm run data:changelog`가 한 줄 추가한다(월 1회 도는 `data-update` 워크플로도 같은 명령을 쓴다). 큐레이션 보정이 필요했다면 그 줄에 손으로 덧붙인다.

| 날짜 | dataVersion | 원본 sha (OpenLethe / LLC) | 변경 |
|---|---|---|---|
| 2026-09-11 | 7.f85f9464 | localize 231a8bcf / openLethe 823129ad (최초 고정) | 거울 던전 7 기준 초기 데이터. 팩 116, 기프트 456(드롭풀 441), 조합 결과 59, 인격 183 |
| 2026-09-11 | 7.c1c1a25d | localize 231a8bcf / openLethe 823129ad | 스키마 추가: rules.deployment(출격 최대 7·기본 6, 미검증), gifts[].upgradeOf(조합 계승 76쌍). 원본 변동 없음 |
| 2026-09-11 | 7.9dd04ff8 | localize 231a8bcf / openLethe 823129ad | 원본 7파일 추가(battle-mirrordungeon 스테이지 6, 기프트 관측 데이터 1). 획득 분류 clearReward 10·hiddenBattle 4(event 24→10), gifts[].clearRewardOf·observable·icon, packs[].sprite, rules.hiddenBattle, 관측 비용표 70/160/270 검증됨 |
| 2026-09-15 | 7.2b66ae34 | localize 231a8bcf / openLethe 823129ad | 인격 183→184 (+1): 10116 「LCE E.G.O:: 차원찢개」(이상) 백필. 상류에 정적 레코드가 없어 공식 스킬 원문에서 충전·파열을 도출했다. KR Skills_personality-{01..12}.json 12파일 vendoring |
| 2026-09-15 | 7.b24d6383 | eldritchtools ec2b3efd / localize 231a8bcf→EN c0679827+KR ac56ea82 / openLethe 823129ad | 인격 184→185 (+1): 10616 「동부 섕크 협회 3과」(홍루). 출처 교체 — 현지화를 x1bViolet(주 1회, 패치 당일)으로, 파생 미러 eldritchtools 추가. 정적 데이터에 없는 인격은 이제 자동 백필된다 |
