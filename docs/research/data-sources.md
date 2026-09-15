# 데이터 출처와 갱신 경로

## 쓰는 것

| 출처 | 가져오는 것 | 갱신 | 라이선스 |
|---|---|---|---|
| [`LEAGUE-OF-NINE/OpenLethe`](https://github.com/LEAGUE-OF-NINE/OpenLethe) `src/OpenLethe.Resources/StaticData/static-data/**` | 테마팩·기프트·조합·인격·스킬·던전 구성 등 게임 클라이언트 정적 데이터 | 저장소에 라이선스 파일이 없다. 데이터 자체의 권리는 Project Moon에 있다 | 주 데이터원 |
| [`LocalizeLimbusCompany/LocalizeLimbusCompany`](https://github.com/LocalizeLimbusCompany/LocalizeLimbusCompany) `KR/`, `EN/` | 공식 로컬라이제이션 JSON(기프트·테마팩·인격·소속 이름과 효과 텍스트) | CC BY-NC-SA 4.0 (번역 팩). 원문 권리는 Project Moon | 이름·설명 |

두 저장소 모두 `data/sources.lock.json`에 **커밋 sha로 고정**하고, 받아온 파일을 `data/raw/`에 커밋한다. OpenLethe는 서버 에뮬레이터 저장소라 언제든 사라질 수 있으므로 스냅샷을 저장소에 보관하는 것이 전제다.

## 참고만 한 것 (데이터를 가져오지 않음)

| 출처 | 왜 참고했나 | 왜 쓰지 않나 |
|---|---|---|
| [`Girey0211/Guida`](https://github.com/Girey0211/Guida) (MIT) | 같은 문제를 푸는 한국어 프로젝트. 필드 설계(팩 층 목록, 기프트 획득 분류)와 인격 키워드 교차 검증에 썼다 | 수작업 데이터라 갱신이 느리고 id가 이름 기반이다. 재배포하지 않는다 |
| [`phrimm136/dante-planner`](https://github.com/phrimm136/dante-planner) (AGPL-3.0) | `dungeonIdx`·`selectableFloors` 의미 교차 확인 | AGPL이라 코드를 복사하지 않는다 |
| [`SyxP/ObiterDicta.jl`](https://github.com/SyxP/ObiterDicta.jl) (MIT) | 정적 데이터 필드명과 클라이언트 추출 절차 | 데이터 스냅샷이 거울 던전 4 시절이라 오래됐다 |
| 나무위키 `Limbus Company/거울 던전/**` | 기프트 해설, 전용 기프트 표, 커뮤니티 통칭 | 기계 판독용이 아니고 세션 환경에서 접근이 차단된다. 큐레이션 근거로만 인용한다 |

## 원본이 사라졌을 때의 대안: 클라이언트에서 직접 추출

ObiterDicta가 쓰는 경로를 그대로 따를 수 있다. PC에 게임이 설치되어 있어야 한다.

1. `catalog_S1.json`을 찾는다: `%USERPROFILE%\AppData\LocalLow\ProjectMoon\LimbusCompany\**`. 또는 CDN에서 버전을 알고 받는다 — `https://d7g8h56xas73g.cloudfront.net/<catalogVersion>/catalog_S1.json`.
2. 카탈로그의 `m_InternalIds`에서 `https`로 시작하고 경로에 `localize` 또는 `static`이 포함된 번들 URL만 골라 받는다(요청 간 0.2초 정도 간격).
3. [UnityPy](https://github.com/K0lb3/UnityPy)로 번들을 열어 `TextAsset`의 `m_Script`를 JSON 파일로 쓴다. 번들 이름이 언어를 알려준다.
4. 결과를 `data/raw/static/`, `data/raw/localize/{KR,EN}/`에 배치하고 `npm run data:build`.

이 경로는 게임 약관상 민감할 수 있으니 개인 확인용으로만 쓰고, 추출물을 재배포하지 않는다.

## 필요한 파일 목록

`data/sources.lock.json`이 정답이지만, 빠진 것을 찾을 때의 참고:

**OpenLethe (static-data)**
- `mirrordungeon-theme-floor/mirrordungeon-theme-floor-t{1..6}.json`
- `ego-gift-mirrordungeon/*.json`
- `mirror-dungeon-common-data/mirror-dungeon-common-data-md7.json`
- `mirrordungeon-egogift-droppool/mirrordungeon-egogift-droppool-7.json`
- `mirrordungeon/mirrordungeon-07{,-hard,-infinite,-extreme}.json`
- `mirrordungeon-start-buffs/mirrordungeon-start-buffs-07.json`
- `personality/personality-{01..12}.json`
- `skill/personality-skill-{01..12}.json`

**LocalizeLimbusCompany (KR/ 및 EN/)**
- `EGOgift_MirrorDungeon{,_2,_6,_7}.json` — 시즌이 바뀌면 `_8` 등이 생긴다
- `EGOgift_MirrorDungeon{-StoryTheme,-StoryTheme_2,-EventTheme,-EventTheme_2,-mowe,-mowe-re,-ycgd}.json`
- `EGOgift_{TwiningThreads,cultivation,pilgrimage,lcbcheckup-re,night-clean-up-re,tktRe,walpu4,walpu6,walpu8,a1c8p2}.json`
- `MirrorDungeonTheme-1.json`, `Personalities.json`, `UnitKeyword.json`, `EgoGiftCategory.json`, `BattleKeywords.json`, `MirrorDungeonEgoGiftLockedDesc.json`, `DungeonStartBuffs_MD7.json`, `MirrorDungeonUI_7.json`, `TutorialMirrorDungeon.json`
- **`Skills_personality-{01..12}.json` — KR만** (`files[]` 항목에 `{ "path": …, "languages": ["KR"] }`로 언어를 좁힌다). 앱은 스킬 텍스트를 렌더하지 않는다. 이것을 vendoring하는 이유는 하나다: **정적 데이터에 없는 인격의 키워드를 공식 문장에서 도출하는 근거**(`scripts/lib/derive-text.ts`, 지금은 10116 하나). 영어본은 같은 크기인데 도출에 쓰이지 않아 받지 않는다 — 부여를 나타내는 문법(「… 부여」·「… 증가」)이 한국어다.
  - **커버리지가 부분적이다**: 12개 파일이 183명 중 121명만 덮는다(각 죄인의 가장 오래된 인격들은 스킬 텍스트가 미러 어디에도 없다). `tests/text-derivation.test.ts`가 이 수를 그대로 단언한다.
  - 현지화 저장소에는 매니페스트가 없고 GitHub API가 샌드박스에서 막히는 경우가 많아, 파일이 사라지면 `data:fetch`의 404 보고가 유일한 신호다.

## 서버 재구현 코드 (규칙 확인용)

OpenLethe의 C# 포트는 규칙을 읽는 데 유용하다. 복사하지는 않는다.

| 파일 | 알 수 있는 것 |
|---|---|
| `MdTheme.cs` | 정적 데이터 필드 구조(`ThemeStatic`, `ExceptionCondition`) |
| `MdMapGen.cs` | 층→dungeonIdx 매핑(`act = floor / 5 + 1`), 팩 제시 수 |
| `MirrorDungeon/Data/MdThemePool.cs` | 상점 기프트 풀 계산(전용 기프트 제외 후 현재 팩 전용만 재삽입, 조합 결과물 제외) |
| `MdEgoFusion.cs` | 고정 레시피 해시 조회 방식, 재료 순서 무관 |
